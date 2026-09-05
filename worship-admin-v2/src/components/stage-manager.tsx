"use client";

import "./stage-feedback.css";

import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { includeStageExportNode, prepareStageExport } from "@/lib/stage-export";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRestingStageStudents, summarizeStageAttendance } from "@/domain/stage";
import type { StageAssignment, StageDepartment, StageHistory, StagePerformanceRole, StagePersonType, StageSide } from "@/domain/stage";

type Student = { id: string; name: string; gender: "FEMALE" | "MALE" | "UNSPECIFIED"; department: StageDepartment; team: "SINGER" | "SESSION"; isStudentLeader: boolean };
type Staff = { id: string; name: string; gender: Student["gender"]; singer_capable: boolean; preferred_service: string; default_stage_role: "SINGER" | "SESSION"; exclude_from_auto_singer: boolean; is_default_stage_leader: boolean };
type Service = { id: string; department: StageDepartment; singerTarget: number; choirTarget: number };
type Override = { termStudentId: string; kind: "MOVE_DEPARTMENT" | "FORCE_STAGE" | "EXCLUDE_STAGE"; department: StageDepartment; role?: StagePerformanceRole | "RANDOM" };
type Payload = {
  plan: { id: string; term_id: string; sunday_date: string; meetings: { is_cancelled: boolean; meeting_date: string; sequence: number; title: string } | Array<{ is_cancelled: boolean; meeting_date: string; sequence: number; title: string }>; terms: { name: string; late_counts_as_present: boolean } | Array<{ name: string; late_counts_as_present: boolean }> };
  students: Student[]; staff: Staff[];
  attendance: Array<{ term_student_id: string; status: string }>;
  availability: Array<{ staff_id: string; present: boolean; stage_role: "SINGER" | "SESSION"; updated_at: string }>;
  version: { id: string; version_no: number; kind: "AUTO_DRAFT" | "MANUAL_DRAFT" | "CONFIRMED"; config_snapshot?: { staffOnly?: boolean }; revision: number; leader_type: StagePersonType; leader_term_student_id: string | null; leader_staff_id: string | null; warnings: string[] } | null;
  services: Array<{ id: string; department: StageDepartment; singer_target: number; choir_target: number }>;
  assignments: Array<{ service_id: string; person_type: StagePersonType; term_student_id: string | null; staff_id: string | null; role: StagePerformanceRole; side: StageSide; position_order: number; reason: string; is_manual: boolean }>;
  candidates: Array<{ person_type: StagePersonType; term_student_id: string | null; staff_id: string | null; department: StageDepartment | null; eligible: boolean; reason: string }>;
  overrides: Array<{ term_student_id: string; kind: Override["kind"]; department: StageDepartment; role?: Override["role"] }>;
  history: Record<string, StageHistory>;
};

async function loadStage(meetingId: string) { const response = await fetch(`/api/stage/${meetingId}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "등단 정보를 불러오지 못했습니다."); return result.data as Payload; }

export function StageManager({ meetingId }: { meetingId: string }) {
  const query = useQuery({ queryKey: ["stage", meetingId], queryFn: () => loadStage(meetingId), retry: false });
  if (query.isLoading) return <section className="panel"><p>등단 정보를 불러오는 중입니다.</p></section>;
  if (query.error || !query.data) return <div className="error-banner">{query.error?.message ?? "등단 정보를 불러오지 못했습니다."}</div>;
  return <StageWorkspace key={meetingId} meetingId={meetingId} initial={query.data} reload={() => query.refetch()} />;
}

function StageWorkspace({ meetingId, initial, reload }: { meetingId: string; initial: Payload; reload: () => Promise<unknown> }) {
  const [services, setServices] = useState<Service[]>(() => initial.services.length ? initial.services.map((item) => ({ id: item.id, department: item.department, singerTarget: item.singer_target, choirTarget: item.choir_target })) : [
    { id: crypto.randomUUID(), department: "FIRST", singerTarget: 6, choirTarget: 6 }, { id: crypto.randomUUID(), department: "SECOND", singerTarget: 6, choirTarget: 0 },
  ]);
  const [assignments, setAssignments] = useState<StageAssignment[]>(() => normalizeAssignments(initial));
  const [leaderType, setLeaderType] = useState<StagePersonType>(() => initial.version?.leader_type ?? "STAFF");
  const [leaderId, setLeaderId] = useState(() => initial.version?.leader_term_student_id ?? initial.version?.leader_staff_id ?? initial.staff.find((item) => item.is_default_stage_leader)?.id ?? "");
  const [overrides, setOverrides] = useState<Override[]>(() => initial.overrides.map((item) => ({ termStudentId: item.term_student_id, kind: item.kind, department: item.department, role: item.role ?? undefined })));
  const [overrideStudent, setOverrideStudent] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const matchingStudents = currentStudentsForSearch(initial.students, studentSearch);
  const [overrideKind, setOverrideKind] = useState<Override["kind"]>("FORCE_STAGE");
  const [overrideDepartment, setOverrideDepartment] = useState<StageDepartment | "">("");
  const [overrideRole, setOverrideRole] = useState<Override["role"] | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>(initial.version?.warnings ?? []);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(initial);
  const [staffOnly, setStaffOnly] = useState(initial.version?.config_snapshot?.staffOnly === true);
  const savingRef = useRef(false);
  const [confirmation, setConfirmation] = useState<{ text: string; warnings: string[]; resolve: (accepted: boolean) => void } | null>(null);
  const confirmationRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (confirmation) confirmationRef.current?.showModal(); }, [confirmation]);
  const excludedStudentIds = new Set(overrides.filter((item) => item.kind === "EXCLUDE_STAGE").map((item) => item.termStudentId));
  const visibleAssignments = assignments.filter((item) =>
    !(staffOnly && item.personType === "STUDENT") && !(item.personType === leaderType && item.personId === leaderId)
    && !(item.personType === "STUDENT" && excludedStudentIds.has(item.personId))
  );
  const exportRefs = { FIRST: useRef<HTMLDivElement>(null), SECOND: useRef<HTMLDivElement>(null) };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 7 } }), useSensor(KeyboardSensor));
  const eligibleStudentIds = useMemo(() => new Set(current.candidates.filter((item) => item.person_type === "STUDENT" && item.eligible && item.term_student_id).map((item) => item.term_student_id as string)), [current]);
  const eligibleStaffIds = useMemo(() => new Set(current.candidates.filter((item) => item.person_type === "STAFF" && item.eligible && item.staff_id).map((item) => item.staff_id as string)), [current]);

  function applyPayload(next: Payload) {
    setCurrent(next); setAssignments(normalizeAssignments(next)); setStaffOnly(next.version?.config_snapshot?.staffOnly === true);
    if (next.services.length) setServices(next.services.map((item) => ({ id: item.id, department: item.department, singerTarget: item.singer_target, choirTarget: item.choir_target })));
    setLeaderType(next.version?.leader_type ?? "STAFF"); setLeaderId(next.version?.leader_term_student_id ?? next.version?.leader_staff_id ?? next.staff.find((item) => item.is_default_stage_leader)?.id ?? "");
    setOverrides(next.overrides.map((item) => ({ termStudentId: item.term_student_id, kind: item.kind, department: item.department, role: item.role ?? undefined })));
    setWarnings(next.version?.warnings ?? []);
  }
  async function refresh() { const next = await loadStage(meetingId); applyPayload(next); await reload(); }
  async function saveAvailability(staffId: string, present: boolean, stageRole: "SINGER" | "SESSION") {
    const row = current.availability.find((item) => item.staff_id === staffId);
    setCurrent((value) => ({ ...value, availability: [...value.availability.filter((item) => item.staff_id !== staffId), { staff_id: staffId, present, stage_role: stageRole, updated_at: row?.updated_at ?? "" }] }));
    const response = await fetch(`/api/stage/${meetingId}/availability/${staffId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ present, stageRole, expectedRevision: row?.updated_at ?? null }) });
    const result = await response.json(); if (!response.ok) { setMessage(result.error?.message ?? "참석 정보를 저장하지 못했습니다."); await refresh(); return; }
    setCurrent((value) => ({ ...value, availability: value.availability.map((item) => item.staff_id === staffId ? { ...item, updated_at: result.data.revision } : item) }));
  }
  async function send(url: string, body: object, confirmText: string) {
    async function post(payload: object) {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
      return { response, result: await response.json().catch(() => null) };
    }
    let { response, result } = await post(body);
    if (response.status === 409 && result?.error?.code === "confirmation_required" && result?.warnings?.length) {
      const accepted = await new Promise<boolean>((resolve) => setConfirmation({ text: confirmText, warnings: result.warnings, resolve }));
      setConfirmation(null);
      if (!accepted) { setMessage("취소했습니다. 화면의 수정 내용은 유지됩니다."); return null; }
      ({ response, result } = await post({ ...body, force: true }));
    }
    if (!response.ok) {
      setWarnings(result?.warnings ?? []);
      throw new Error(result?.error?.message ?? "요청을 처리하지 못했습니다.");
    }
    setWarnings(result?.warnings ?? []);
    return result;
  }
  async function runOperation(operation: () => Promise<void>) {
    if (savingRef.current) return;
    savingRef.current = true; setBusy(true); setMessage(null);
    try { await operation(); }
    catch (error) { setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "응답 시간이 초과됐습니다. 저장 여부를 확인한 뒤 다시 시도해주세요."); }
    finally { savingRef.current = false; setBusy(false); }
  }
  async function generate() {
    await runOperation(async () => {
      const result = await send(`/api/stage/${meetingId}/generate`, { staffOnly, leaderType, leaderId: leaderId || null, services: services.map(({ department, singerTarget, choirTarget }) => ({ department, singerTarget, choirTarget })), overrides }, "경고를 확인하고 자동 배정을 만들까요?");
      if (!result) return;
      await refresh(); setMessage("자동 등단 초안을 만들었습니다. 이름을 원하는 위치로 드래그해 수정할 수 있습니다.");
    });
  }
  async function saveDraft(confirmAfterSave = false) {
    if (!current.version) { setMessage("자동 등단 초안을 먼저 만들어주세요."); return; }
    await runOperation(async () => {
      const result = await send(`/api/stage/${meetingId}/draft`, {
        versionId: current.version!.id, expectedRevision: current.version!.revision,
        staffOnly, leaderType, leaderId, services, overrides,
        assignments: visibleAssignments.map((item) => ({ serviceId: (item as StageAssignment & { serviceId: string }).serviceId, personType: item.personType, personId: item.personId, role: item.role, side: item.side, positionOrder: item.positionOrder, reason: item.reason, isManual: true })),
      }, "규칙 경고가 있습니다. 현재 수정 내용을 저장할까요?");
      if (!result) return;
      // Keep the newly saved version even if confirmation is cancelled or fails.
      await refresh();
      if (confirmAfterSave) {
        const version = result.data.version;
        const confirmed = await send(`/api/stage/${meetingId}/confirm`, { versionId: version.id, expectedRevision: version.revision }, "경고를 확인하고 등단표를 확정할까요?");
        if (!confirmed) return;
        await refresh(); setMessage("현재 화면의 수정 내용을 저장하고 등단표를 확정했습니다.");
      } else setMessage("수동 수정본을 새 버전으로 저장했습니다.");
    });
  }
  async function confirmPlan() { await saveDraft(true); }
  function onDragEnd(event: DragEndEvent) {
    if (busy) return;
    const active = String(event.active.id); const over = event.over ? String(event.over.id) : "";
    const [personType, personId] = active.split(":") as [StagePersonType, string];
    const existing = assignments.find((item) => item.personType === personType && item.personId === personId && active.endsWith(`:${(item as StageAssignment & { serviceId: string }).serviceId}`));
    const actual = existing ?? assignments.find((item) => `${item.personType}:${item.personId}:${(item as StageAssignment & { serviceId: string }).serviceId}` === active);
    if (!over || over.startsWith("rest:")) { if (actual) setAssignments((items) => items.filter((item) => item !== actual)); return; }
    let serviceId: string; let role: StagePerformanceRole; let side: StageSide; let targetIndex: number | undefined;
    if (over.startsWith("zone:")) {
      [, serviceId, role, side] = over.split(":") as [string, string, StagePerformanceRole, StageSide];
    } else {
      const target = assignments.find((item) => `${item.personType}:${item.personId}:${(item as StageAssignment & { serviceId: string }).serviceId}` === over);
      if (!target) return;
      serviceId = (target as StageAssignment & { serviceId: string }).serviceId; role = target.role; side = target.side;
      targetIndex = assignments.filter((item) => (item as StageAssignment & { serviceId: string }).serviceId === serviceId && item.role === role && item.side === side).sort((a, b) => a.positionOrder - b.positionOrder).indexOf(target);
    }
    if (staffOnly && personType === "STUDENT") return setMessage("스탭만 등단 설정을 해제한 뒤 학생을 배치해주세요.");
    if (personType === leaderType && personId === leaderId) return setMessage("인도자는 싱어·콰이어에 중복 배치할 수 없습니다.");
    if (personType === "STUDENT" && excludedStudentIds.has(personId)) return setMessage("등단 안함으로 지정한 학생입니다. 특이사항을 해제한 뒤 배치해주세요.");
    if (personType === "STAFF" && role === "CHOIR") { setMessage("스탭은 싱어로만 배정할 수 있습니다."); return; }
    const student = current.students.find((item) => item.id === personId); const staff = current.staff.find((item) => item.id === personId);
    if (!actual && personType === "STUDENT" && !eligibleStudentIds.has(personId)) return setMessage("출석·싱어팀 조건을 충족한 학생만 무대에 올릴 수 있습니다.");
    if (!actual && personType === "STAFF" && !eligibleStaffIds.has(personId)) return setMessage("참석 역할을 싱어로 설정한 스탭만 무대에 올릴 수 있습니다.");
    const service = services.find((item) => item.id === serviceId); const history = current.history[personId];
    const candidateDepartment = current.candidates.find((item) => item.person_type === "STUDENT" && item.term_student_id === personId)?.department;
    if (personType === "STUDENT" && service && candidateDepartment !== service.department) return setMessage("다른 예배로 옮기려면 먼저 공통 특이사항에서 부서 이동을 지정하고 자동 배정을 다시 실행해주세요.");
    const manualWarnings = personType === "STUDENT" ? [history?.stagedPreviousTwo ? `${student?.name} 학생이 3주 연속 등단합니다.` : "", role === "SINGER" && service?.choirTarget && history?.singerPreviousTwo ? `${student?.name} 학생이 3주 연속 싱어가 됩니다.` : ""].filter(Boolean) : [];
    if (manualWarnings.length && !window.confirm(`${manualWarnings.join("\n")}\n그래도 이동할까요?`)) return;
    setAssignments((items) => {
      const without = items.filter((item) => item !== actual);
      const sameZone = without.filter((item) => (item as StageAssignment & { serviceId: string }).serviceId === serviceId && item.role === role && item.side === side).sort((a, b) => a.positionOrder - b.positionOrder);
      const next = { personType, personId, name: student?.name ?? staff?.name ?? "이름 없음", gender: student?.gender ?? staff?.gender ?? "UNSPECIFIED", role, side, positionOrder: 0, reason: "수동으로 배정", isManual: true, serviceId } as StageAssignment & { serviceId: string };
      sameZone.splice(Math.max(0, Math.min(targetIndex ?? sameZone.length, sameZone.length)), 0, next);
      const zoneKeys = new Set(sameZone.map((item) => `${item.personType}:${item.personId}`));
      return [...without.filter((item) => !((item as StageAssignment & { serviceId: string }).serviceId === serviceId && item.role === role && item.side === side && zoneKeys.has(`${item.personType}:${item.personId}`))), ...sameZone.map((item, positionOrder) => ({ ...item, positionOrder }))];
    });
  }
  function addOverride() {
    if (!overrideStudent || (overrideKind !== "EXCLUDE_STAGE" && !overrideDepartment) || (overrideKind === "FORCE_STAGE" && !overrideRole)) {
      setMessage("이름, 부서, 포지션을 모두 선택해주세요.");
      return;
    }
    if (overrideKind === "EXCLUDE_STAGE" && leaderType === "STUDENT" && leaderId === overrideStudent) {
      setMessage("현재 인도자로 선택된 학생입니다. 인도자를 먼저 변경해주세요."); return;
    }
    const next: Override = {
      termStudentId: overrideStudent,
      kind: overrideKind,
      department: overrideDepartment || current.students.find((item) => item.id === overrideStudent)?.department || "FIRST",
      ...(overrideKind === "FORCE_STAGE" ? { role: overrideRole as StagePerformanceRole | "RANDOM" } : {}),
    };
    setOverrides((items) => [...items.filter((item) => !(item.termStudentId === next.termStudentId && (item.kind === next.kind || (next.kind === "EXCLUDE_STAGE" && item.kind === "FORCE_STAGE") || (next.kind === "FORCE_STAGE" && item.kind === "EXCLUDE_STAGE")))), next]);
    if (next.kind === "EXCLUDE_STAGE") setAssignments((items) => items.filter((item) => !(item.personType === "STUDENT" && item.personId === next.termStudentId)));
    setOverrideStudent(""); setStudentSearch("");
    setOverrideDepartment("");
    setOverrideRole("");
    setMessage(null);
  }
  async function exportImage(department: StageDepartment, pdf = false) {
    const node = exportRefs[department].current;
    if (!node || busy) return;
    setBusy(true);
    let prepared: ReturnType<typeof prepareStageExport> | undefined;
    try {
      await document.fonts.ready;
      prepared = prepareStageExport(node);
      const { width, height } = prepared;
      const dataUrl = await toPng(prepared.node, { width, height, pixelRatio: 2, backgroundColor: "#12221b", filter: includeStageExportNode });
      const label = `${current.plan.sunday_date}-${department === "FIRST" ? "1부" : "2부"}-등단표`;
      if (pdf) {
        const { jsPDF } = await import("jspdf");
        const output = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "px", format: [width, height] });
        output.addImage(dataUrl, "PNG", 0, 0, width, height);
        output.save(`${label}.pdf`);
      } else {
        const link = document.createElement("a");
        link.download = `${label}.png`; link.href = dataUrl; link.click();
      }
    } finally { prepared?.cleanup(); setBusy(false); }
  }

  const meeting = Array.isArray(current.plan.meetings) ? current.plan.meetings[0] : current.plan.meetings;
  const term = Array.isArray(current.plan.terms) ? current.plan.terms[0] : current.plan.terms;
  const attendanceCounts = summarizeStageAttendance({ students: current.students, attendance: current.attendance, lateCountsAsPresent: term?.late_counts_as_present ?? false, cancelled: meeting?.is_cancelled ?? false, overrides, leaderType, leaderId });
  const leaderOptions = [
    ...current.staff.map((item) => ({ type: "STAFF" as const, id: item.id, name: item.name })),
    ...current.students.filter((item) => !staffOnly && item.isStudentLeader && !excludedStudentIds.has(item.id)).map((item) => ({ type: "STUDENT" as const, id: item.id, name: `${item.name} (학생)` })),
  ];
  return <div className="stage-workspace">
    {meeting?.is_cancelled ? <div className="warning-list"><strong>휴강 주차</strong><span>학생은 자동 등단 후보에서 제외됩니다. 스탭 참석과 특이사항을 확인해주세요.</span></div> : null}
    {message ? <div className={message.includes("못") || message.includes("충족") ? "error-banner" : "success-banner"}>{message}</div> : null}
    {warnings.length ? <div className="warning-list"><strong>자동 배정 확인 사항</strong>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
    <section className="panel stage-control" inert={busy}><div className="section-heading"><div><span className="eyebrow">SUNDAY SETTINGS</span><h2>{current.plan.sunday_date} 등단 설정</h2></div>{current.version ? <span className="badge">v{current.version.version_no} · {current.version.kind === "CONFIRMED" ? "확정본" : "초안"}</span> : null}</div>
      <label className="staff-only-control"><input type="checkbox" checked={staffOnly} disabled={busy} onChange={(event) => { const enabled = event.target.checked; setStaffOnly(enabled); if (enabled && leaderType === "STUDENT") { setLeaderType("STAFF"); setLeaderId(current.staff.find((person) => person.is_default_stage_leader)?.id ?? ""); } }} /><span><strong>스탭만 등단하기</strong><small>자동 배정 시 참석한 싱어 스탭 전원을 1·2부 모두 배치합니다. 인도자는 중앙에 별도로 표시합니다.</small></span></label><div className="leader-control"><label className="form-field"><span>1·2부 공통 인도자</span><select className="field" value={`${leaderType}:${leaderId}`} onChange={(event) => { const [type, id] = event.target.value.split(":") as [StagePersonType, string]; setLeaderType(type); setLeaderId(id); setAssignments((items) => items.filter((item) => !(item.personType === type && item.personId === id))); }}><option value="STAFF:">인도자 선택</option>{leaderOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}</select></label>{services.map((service) => <div className="target-control" key={service.department}><strong>{service.department === "FIRST" ? "1부" : "2부"}</strong><p className="stage-attendance-count">출석 인정 <b>{attendanceCounts[service.department].recognized}명</b><small>출석 {attendanceCounts[service.department].present} · 지각 {attendanceCounts[service.department].late} · 싱어팀 후보 {attendanceCounts[service.department].candidates}명</small></p><label>싱어<input type="number" min={0} disabled={busy || staffOnly} value={service.singerTarget} onChange={(event) => setServices((items) => items.map((item) => item.department === service.department ? { ...item, singerTarget: Number(event.target.value) } : item))} /></label><label>콰이어<input type="number" min={0} disabled={busy || staffOnly} value={service.choirTarget} onChange={(event) => setServices((items) => items.map((item) => item.department === service.department ? { ...item, choirTarget: Number(event.target.value) } : item))} /></label></div>)}</div><p className="stage-count-note">자동 배정 우선순위: 목표 싱어·콰이어 인원 → 학생 등단 비율 → 연속 등단 최소화. 부족한 싱어는 스탭 최대 3명으로 보완합니다. 선택한 주차의 토요 출결 기준입니다. 지각 인정은 학기 설정을 따르며, 부서 이동을 반영합니다. 싱어팀 후보는 세션·인도자·등단 안함을 제외한 인원입니다.{staffOnly ? " 스탭만 등단에서는 목표 인원 대신 참석 싱어 스탭 전원을 배치합니다." : ""}</p>
    </section>
    <section className="panel section-space" inert={busy}><div className="section-heading"><div><span className="eyebrow">STAFF AVAILABILITY</span><h2>스탭 참석·역할</h2></div><p>참석하면서 역할이 싱어인 스탭만 자동 배정 후보가 됩니다.</p></div><div className="availability-grid">{current.staff.map((staff) => { const row = current.availability.find((item) => item.staff_id === staff.id); const present = row?.present ?? false; const role = row?.stage_role ?? staff.default_stage_role; return <div className="availability-row" key={staff.id}><label><input type="checkbox" checked={present} onChange={(event) => saveAvailability(staff.id, event.target.checked, role)} /><strong>{staff.name}</strong></label><select className="field" value={role} onChange={(event) => saveAvailability(staff.id, present, event.target.value as "SINGER" | "SESSION")}><option value="SINGER">싱어</option><option value="SESSION">세션</option></select></div>; })}</div></section>
    <section className="panel section-space" inert={busy}><div className="section-heading"><div><span className="eyebrow">SPECIAL ASSIGNMENT</span><h2>공통 특이사항</h2></div></div><div className="override-builder"><select className="field" value={overrideKind} onChange={(event) => { setOverrideKind(event.target.value as Override["kind"]); setOverrideRole(""); }}><option value="FORCE_STAGE">무조건 등단</option><option value="MOVE_DEPARTMENT">부서 이동</option><option value="EXCLUDE_STAGE">등단 안함</option></select><input className="field" type="search" aria-label="특이사항 학생 이름 검색" placeholder="학생 이름 검색" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setOverrideStudent(""); }} /><select className="field" aria-label="특이사항 학생 선택" value={overrideStudent} onChange={(event) => setOverrideStudent(event.target.value)}><option value="" disabled>이름 선택</option>{matchingStudents.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}{!matchingStudents.length ? <option disabled value="">검색 결과가 없습니다</option> : null}</select><select className="field" disabled={overrideKind === "EXCLUDE_STAGE"} value={overrideDepartment} onChange={(event) => setOverrideDepartment(event.target.value as StageDepartment)}><option value="" disabled>부서 선택</option><option value="FIRST">1부</option><option value="SECOND">2부</option></select>{overrideKind === "FORCE_STAGE" ? <select className="field" value={overrideRole} onChange={(event) => setOverrideRole(event.target.value as Override["role"])}><option value="" disabled>포지션 선택</option><option value="RANDOM">랜덤</option><option value="SINGER">싱어</option><option value="CHOIR">콰이어</option></select> : null}<button className="button button-secondary" disabled={!overrideStudent || (overrideKind !== "EXCLUDE_STAGE" && !overrideDepartment) || (overrideKind === "FORCE_STAGE" && !overrideRole)} onClick={addOverride}>추가</button></div><div className="override-list">{overrides.map((item, index) => <button key={`${item.termStudentId}-${item.kind}-${index}`} onClick={() => setOverrides((items) => items.filter((_, itemIndex) => itemIndex !== index))}>{current.students.find((student) => student.id === item.termStudentId)?.name} · {item.kind === "EXCLUDE_STAGE" ? "등단 안함" : item.kind === "MOVE_DEPARTMENT" ? "부서 이동" : `무조건 ${item.role === "RANDOM" ? "랜덤" : item.role === "SINGER" ? "싱어" : "콰이어"}`} · {item.department === "FIRST" ? "1부" : "2부"} ×</button>)}</div><button className="button button-primary stage-generate" disabled={busy || !leaderId} onClick={generate}>{busy ? "배정 중" : "자동 등단 배정"}</button></section>
    {current.version ? <DndContext sensors={sensors} onDragEnd={onDragEnd}><div className="service-boards">{services.map((service) => <StageServiceBoard key={service.id} service={service} assignments={visibleAssignments.filter((item) => (item as StageAssignment & { serviceId: string }).serviceId === service.id)} allAssignments={visibleAssignments} leaderType={leaderType} leaderId={leaderId} overrides={overrides} students={current.students} staff={current.staff} candidates={current.candidates} eligibleStudentIds={eligibleStudentIds} eligibleStaffIds={eligibleStaffIds} leaderName={leaderOptions.find((item) => item.type === leaderType && item.id === leaderId)?.name ?? "인도자"} exportRef={exportRefs[service.department]} onRemove={(personType, personId) => !busy && setAssignments((items) => items.filter((item) => !((item as StageAssignment & { serviceId: string }).serviceId === service.id && item.personType === personType && item.personId === personId)))} onExport={(pdf) => exportImage(service.department, pdf)} />)}</div></DndContext> : null}
    {current.version ? <div className="sticky-actions"><span>현재 내용을 저장하고 확정합니다. 이전 확정 이력은 보존됩니다.</span>{message ? <p role="status" aria-live="polite">{message}</p> : null}<button className="button button-primary" disabled={busy || !leaderId} onClick={confirmPlan}>{busy ? "저장 및 확정 중…" : "저장 및 확정"}</button></div> : null}
    {confirmation ? <dialog ref={confirmationRef} className="panel stage-confirm-dialog" aria-labelledby="stage-confirm-title" onCancel={(event) => { event.preventDefault(); confirmation.resolve(false); }}><h2 id="stage-confirm-title">등단 규칙 확인</h2><p>{confirmation.text}</p><ul>{confirmation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><div className="button-row"><button type="button" className="button button-secondary" onClick={() => confirmation.resolve(false)}>취소</button><button type="button" className="button button-primary" onClick={() => confirmation.resolve(true)}>확인하고 계속</button></div></dialog> : null}
  </div>;
}

function currentStudentsForSearch(students: Student[], search: string) { const query = search.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase(); return students.filter((student) => student.name.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase().includes(query)); }

function normalizeAssignments(payload: Payload) { return payload.assignments.flatMap((item) => { const id = item.person_type === "STUDENT" ? item.term_student_id : item.staff_id; const person = item.person_type === "STUDENT" ? payload.students.find((student) => student.id === id) : payload.staff.find((staff) => staff.id === id); return id && person ? [{ serviceId: item.service_id, personType: item.person_type, personId: id, name: person.name, gender: person.gender, role: item.role, side: item.side, positionOrder: item.position_order, reason: item.reason, isManual: item.is_manual } as StageAssignment & { serviceId: string }] : []; }); }

function StageServiceBoard({ service, assignments, allAssignments, students, staff, eligibleStudentIds, eligibleStaffIds, leaderType, leaderId, overrides, leaderName, exportRef, onRemove, onExport }: { service: Service; assignments: StageAssignment[]; allAssignments: StageAssignment[]; students: Student[]; staff: Staff[]; candidates: Payload["candidates"]; eligibleStudentIds: Set<string>; eligibleStaffIds: Set<string>; leaderType: StagePersonType; leaderId: string; overrides: Override[]; leaderName: string; exportRef: React.RefObject<HTMLDivElement | null>; onRemove: (type: StagePersonType, id: string) => void; onExport: (pdf: boolean) => void }) {
  const assignedStaffIds = new Set(assignments.filter((item) => item.personType === "STAFF").map((item) => item.personId));
  const restingStudents = getRestingStageStudents({ students, department: service.department, assignments: allAssignments, eligibleStudentIds, overrides, leaderType, leaderId });
  const restingStaff = staff.filter((item) => eligibleStaffIds.has(item.id) && !assignedStaffIds.has(item.id) && !item.is_default_stage_leader && !(leaderType === "STAFF" && leaderId === item.id));
  return <section className="service-editor"><div className="service-title"><div><span className="eyebrow">{service.department === "FIRST" ? "FIRST SERVICE" : "SECOND SERVICE"}</span><h2>{service.department === "FIRST" ? "1부" : "2부"} 등단표</h2></div><div><button className="button button-small button-secondary" onClick={() => onExport(false)}>PNG</button><button className="button button-small button-secondary" onClick={() => onExport(true)}>PDF</button></div></div><div ref={exportRef} className="stage-canvas"><h3 className="stage-export-title">{service.department === "FIRST" ? "1부" : "2부"} 등단표</h3><div className="stage-row choir-row" data-export-empty={!assignments.some((item) => item.role === "CHOIR") ? "true" : undefined}><StageZone serviceId={service.id} role="CHOIR" side="LEFT" assignments={assignments} onRemove={onRemove} /><StageZone serviceId={service.id} role="CHOIR" side="RIGHT" assignments={assignments} onRemove={onRemove} /></div><div className="stage-row singer-row"><StageZone serviceId={service.id} role="SINGER" side="LEFT" assignments={assignments} onRemove={onRemove} /><StageZone serviceId={service.id} role="SINGER" side="RIGHT" assignments={assignments} onRemove={onRemove} /></div><div className="leader-card">{leaderName.replace(" (학생)", "")}</div></div><div className="resting-columns"><RestZone id={`rest:${service.id}:students`} title="반에서 예배하기" people={restingStudents.map((item) => ({ type: "STUDENT" as const, id: item.id, name: item.name }))} /><RestZone id={`rest:${service.id}:staff`} title="등단하지 않는 스탭" people={restingStaff.map((item) => ({ type: "STAFF" as const, id: item.id, name: item.name }))} /></div></section>;
}
function StageZone({ serviceId, role, side, assignments, onRemove }: { serviceId: string; role: StagePerformanceRole; side: StageSide; assignments: StageAssignment[]; onRemove: (type: StagePersonType, id: string) => void }) { const { setNodeRef, isOver } = useDroppable({ id: `zone:${serviceId}:${role}:${side}` }); const items = assignments.filter((item) => item.role === role && item.side === side).sort((a, b) => a.positionOrder - b.positionOrder); const ids = items.map((item) => `${item.personType}:${item.personId}:${serviceId}`); return <div ref={setNodeRef} className={`stage-zone ${isOver ? "is-over" : ""}`}><SortableContext items={ids} strategy={horizontalListSortingStrategy}>{items.map((item) => <StageCard key={`${item.personType}:${item.personId}`} item={item} serviceId={serviceId} onRemove={onRemove} />)}</SortableContext>{!items.length ? <span className="drop-placeholder">{role === "SINGER" ? "싱어" : "콰이어"} 드롭</span> : null}</div>; }
function StageCard({ item, serviceId, onRemove }: { item: StageAssignment; serviceId: string; onRemove: (type: StagePersonType, id: string) => void }) { const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: `${item.personType}:${item.personId}:${serviceId}` }); return <div ref={setNodeRef} {...listeners} {...attributes} style={{ transform: CSS.Transform.toString(transform), transition }} className={`stage-name-card ${isDragging ? "dragging" : ""}`}><span>{item.name}</span><button aria-label={`${item.name} 제외`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onRemove(item.personType, item.personId)}>×</button></div>; }
function RestZone({ id, title, people }: { id: string; title: string; people: Array<{ type: StagePersonType; id: string; name: string }> }) { const { setNodeRef, isOver } = useDroppable({ id }); return <div ref={setNodeRef} className={`rest-zone ${isOver ? "is-over" : ""}`}><h3>{title}</h3><div>{people.map((person) => <RestCard key={`${id}:${person.type}:${person.id}`} person={person} sourceId={id} />)}{!people.length ? <span>해당 인원이 없습니다.</span> : null}</div></div>; }
function RestCard({ person, sourceId }: { person: { type: StagePersonType; id: string; name: string }; sourceId: string }) { const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: `${person.type}:${person.id}:${sourceId}` }); return <button ref={setNodeRef} {...listeners} {...attributes} style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined }} className={isDragging ? "dragging" : ""}>{person.name}</button>; }
