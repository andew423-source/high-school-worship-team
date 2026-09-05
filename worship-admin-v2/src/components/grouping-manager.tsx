"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { evaluateGrouping, introducedGroupingWarnings, type GroupingRule, type GroupingStudent } from "@/domain/grouping";

type Student = GroupingStudent;
type Staff = { id: string; name: string; group_leader_capable: boolean };
type Rule = GroupingRule;
type Version = { id: string; version_no: number; kind: "AUTO_DRAFT" | "MANUAL_DRAFT" | "CONFIRMED"; revision: number; settings_snapshot: Settings; warnings: string[]; seed: number | null };
type Settings = { groupCount: number; studentMin: number; studentMax: number; staffMin: number; staffMax: number; clusterGender: boolean; clusterGrade: boolean; splitTeam: boolean };
type WorkingGroup = { id: string; name: string; sortOrder: number; studentIds: string[]; staffIds: string[] };
type Payload = { students: Student[]; staff: Staff[]; rules: Rule[]; version: Version | null; groups: Array<{ id: string; name: string; sort_order: number }>; studentAssignments: Array<{ group_id: string; term_student_id: string }>; staffAssignments: Array<{ group_id: string; staff_id: string }> };

const defaults: Settings = { groupCount: 6, studentMin: 1, studentMax: 8, staffMin: 1, staffMax: 2, clusterGender: false, clusterGrade: false, splitTeam: false };

export function GroupingManager({ termId }: { termId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [settings, setSettings] = useState(defaults);
  const [groups, setGroups] = useState<WorkingGroup[]>([]);
  const [selectedRuleStudents, setSelectedRuleStudents] = useState<string[]>([]);
  const [ruleType, setRuleType] = useState("TOGETHER");
  const [ruleValue, setRuleValue] = useState("FEMALE");
  const [ruleMin, setRuleMin] = useState(2);
  const [ruleSearch, setRuleSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }), useSensor(KeyboardSensor));

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/terms/${termId}/groupings`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error?.message ?? "조 편성을 불러오지 못했습니다.");
    const data = result.data as Payload;
    setPayload(data);
    const nextSettings = data.version?.settings_snapshot ?? { ...defaults, groupCount: Math.max(1, data.groups.length || defaults.groupCount) };
    setSettings(nextSettings);
    setGroups(data.groups.map((group) => ({ id: group.id, name: group.name, sortOrder: group.sort_order, studentIds: data.studentAssignments.filter((item) => item.group_id === group.id).map((item) => item.term_student_id), staffIds: data.staffAssignments.filter((item) => item.group_id === group.id).map((item) => item.staff_id) })));
    setWarnings(data.version?.warnings ?? []);
  }, [termId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const unassigned = useMemo(() => payload?.students.filter((student) => !groups.some((group) => group.studentIds.includes(student.id))) ?? [], [groups, payload]);
  const filteredRuleStudents = useMemo(() => {
    const query = ruleSearch.trim().toLocaleLowerCase("ko");
    if (!query) return payload?.students ?? [];
    return payload?.students.filter((student) => student.name.toLocaleLowerCase("ko").includes(query)) ?? [];
  }, [payload, ruleSearch]);
  function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((current) => ({ ...current, [key]: value })); }

  async function request(url: string, body: unknown, confirmText?: string) {
    setBusy(true); setMessage(null); setWarnings([]);
    let response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let result = await response.json().catch(() => null);
    if (response.status === 409 && result?.warnings?.length && confirmText && window.confirm(`${confirmText}\n\n${result.warnings.join("\n")}`)) {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), force: true }) });
      result = await response.json().catch(() => null);
    }
    setBusy(false);
    if (!response.ok) { setWarnings(result?.warnings ?? []); setMessage(result?.error?.message ?? "요청을 처리하지 못했습니다."); return false; }
    setWarnings(result?.warnings ?? []); await load(); return true;
  }

  async function generate() {
    const ok = await request(`/api/admin/terms/${termId}/groupings/generate`, { settings, seed: Date.now() % 2147483647 });
    if (ok) setMessage("자동 편성 초안을 만들었습니다. 학생을 드래그하고 담당 스탭을 지정한 뒤 저장해주세요.");
  }
  async function saveDraft() {
    if (!payload?.version) return setMessage("먼저 자동 편성을 실행해주세요.");
    const ok = await request(`/api/admin/terms/${termId}/groupings/draft`, { sourceVersionId: payload.version.id, expectedRevision: payload.version.revision, settings, seed: payload.version.seed, groups: groups.map(({ name, sortOrder, studentIds, staffIds }) => ({ name, sortOrder, studentIds, staffIds })) }, "조건 경고가 있습니다. 그래도 수동 수정본을 저장할까요?");
    if (ok) setMessage("수동 수정본을 새 버전으로 저장했습니다.");
  }
  async function confirmVersion() {
    if (!payload?.version || payload.version.kind === "CONFIRMED") return;
    const ok = await request(`/api/admin/terms/${termId}/groupings/confirm`, { versionId: payload.version.id, expectedRevision: payload.version.revision }, "경고를 확인하고 이 편성안을 확정할까요?");
    if (ok) setMessage("조 편성을 확정했습니다. 이제 출결에서 담당 조가 연결됩니다.");
  }
  async function addRule() {
    setBusy(true);
    setMessage(null);
    const minimum = ruleType.endsWith("_MIN");
    try {
      const response = await fetch(`/api/admin/terms/${termId}/grouping-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: ruleType, memberIds: minimum ? [] : selectedRuleStudents, value: minimum ? ruleValue : null, minCount: minimum ? ruleMin : null }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setMessage(result?.error?.message ?? "조건을 저장하지 못했습니다.");
      setSelectedRuleStudents([]); setMessage("조건을 추가했습니다. 다음 자동 편성부터 적용됩니다."); await load();
    } catch {
      setMessage("조건 저장 요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function removeRule(id: string) { await fetch(`/api/admin/terms/${termId}/grouping-rules/${id}`, { method: "DELETE" }); await load(); }
  function onDragEnd(event: DragEndEvent) {
    if (!payload) return;
    const studentId = String(event.active.id).replace("student:", "");
    const target = event.over ? String(event.over.id) : "";
    if (!target.startsWith("group:")) return;
    const groupId = target.replace("group:", "");
    const nextGroups = groups.map((group) => ({ ...group, studentIds: group.id === groupId ? [...group.studentIds.filter((id) => id !== studentId), studentId] : group.studentIds.filter((id) => id !== studentId) }));
    const assignments = (items: WorkingGroup[]) => items.flatMap((group, groupIndex) => group.studentIds.map((termStudentId) => ({ termStudentId, groupIndex })));
    const nextWarnings = evaluateGrouping({ students: payload.students, settings, rules: payload.rules, assignments: assignments(nextGroups) });
    const introducedWarnings = introducedGroupingWarnings({ students: payload.students, settings, rules: payload.rules, currentAssignments: assignments(groups), nextAssignments: assignments(nextGroups) });
    if (introducedWarnings.length && !window.confirm(`이동하면 다음 편성 조건을 어기게 됩니다. 그래도 옮길까요?\n\n${introducedWarnings.join("\n")}`)) return;
    setGroups(nextGroups);
    setWarnings(nextWarnings);
    if (introducedWarnings.length) setMessage("조건 위반을 확인하고 학생을 이동했습니다.");
  }

  if (!payload) return <section className="panel"><p>조 편성 데이터를 불러오는 중입니다.</p></section>;
  return <div className="grouping-layout">
    {message ? <div className={message.includes("못") || message.includes("확인") ? "error-banner" : "success-banner"}>{message}</div> : null}
    {warnings.length ? <div className="warning-list"><strong>확인할 내용</strong>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
    <section className="panel grouping-settings"><div className="section-heading"><div><span className="eyebrow">GROUP SETTINGS</span><h2>편성 기준</h2></div><span className="badge">학생 {payload.students.length}명</span></div>
      <div className="form-grid six"><NumberField label="조 수" value={settings.groupCount} onChange={(value) => changeSetting("groupCount", value)} /><NumberField label="학생 최소" value={settings.studentMin} onChange={(value) => changeSetting("studentMin", value)} /><NumberField label="학생 최대" value={settings.studentMax} onChange={(value) => changeSetting("studentMax", value)} /><NumberField label="스탭 최소" value={settings.staffMin} onChange={(value) => changeSetting("staffMin", value)} /><NumberField label="스탭 최대" value={settings.staffMax} onChange={(value) => changeSetting("staffMax", value)} /><NumberField label="랜덤값" value={1} onChange={() => undefined} disabled /></div>
      <div className="inline-checks"><Check label="동성조" checked={settings.clusterGender} onChange={(value) => changeSetting("clusterGender", value)} /><Check label="동학년조" checked={settings.clusterGrade} onChange={(value) => changeSetting("clusterGrade", value)} /><Check label="싱어·세션 분리" checked={settings.splitTeam} onChange={(value) => changeSetting("splitTeam", value)} /></div>
      <button className="button button-primary" disabled={busy || !payload.students.length} onClick={generate}>{busy ? "계산 중" : "자동 편성 만들기"}</button>
    </section>
    <section className="panel section-space"><div className="section-heading"><div><span className="eyebrow">CONDITIONS</span><h2>특별 조건</h2></div></div>
      <div className="rule-builder"><select className="field" value={ruleType} onChange={(event) => { setRuleType(event.target.value); setSelectedRuleStudents([]); setRuleSearch(""); }}><option value="TOGETHER">같은 조</option><option value="APART">다른 조</option><option value="TOP_SEED">톱시드</option><option value="GENDER_MIN">성별 최소</option><option value="GRADE_MIN">학년 최소</option><option value="TEAM_MIN">팀 최소</option></select>
        {ruleType.endsWith("_MIN") ? <><select className="field" value={ruleValue} onChange={(event) => setRuleValue(event.target.value)}>{ruleType === "GENDER_MIN" ? <><option value="FEMALE">여학생</option><option value="MALE">남학생</option></> : ruleType === "GRADE_MIN" ? <><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></> : <><option value="SINGER">싱어</option><option value="SESSION">세션</option></>}</select><NumberField label="조별 최소" value={ruleMin} onChange={setRuleMin} /></> : <div className="rule-student-select"><div className="rule-search-row"><input className="field" type="search" aria-label="학생 이름 검색" placeholder="학생 이름 검색" value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} /><span>선택 {selectedRuleStudents.length}명</span></div><div className="rule-student-picker">{filteredRuleStudents.map((student) => <label key={student.id}><input type="checkbox" checked={selectedRuleStudents.includes(student.id)} onChange={(event) => setSelectedRuleStudents((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} />{student.name}</label>)}{!filteredRuleStudents.length ? <span className="empty-search">검색 결과가 없습니다.</span> : null}</div></div>}
        <button className="button button-secondary" disabled={busy} onClick={addRule}>{busy ? "추가 중" : "조건 추가"}</button></div>
      <div className="rule-list">{payload.rules.map((rule) => <div key={rule.id}><span>{ruleLabel(rule, payload.students)}</span><button className="plain-button" onClick={() => removeRule(rule.id)}>삭제</button></div>)}{!payload.rules.length ? <p className="section-description">추가된 특별 조건이 없습니다.</p> : null}</div>
    </section>
    {groups.length ? <DndContext sensors={sensors} onDragEnd={onDragEnd}><section className="group-board section-space">{groups.map((group) => <GroupColumn key={group.id} group={group} students={payload.students} staff={payload.staff} settings={settings} onStaffChange={(staffIds) => setGroups((current) => current.map((item) => item.id === group.id ? { ...item, staffIds } : { ...item, staffIds: item.staffIds.filter((id) => !staffIds.includes(id)) }))} />)}{unassigned.length ? <div className="group-column unassigned"><h3>미배정</h3>{unassigned.map((student) => <StudentCard key={student.id} student={student} />)}</div> : null}</section></DndContext> : null}
    {payload.version ? <div className="sticky-actions"><span>v{payload.version.version_no} · {payload.version.kind === "CONFIRMED" ? "확정본" : payload.version.kind === "AUTO_DRAFT" ? "자동 초안" : "수동 수정본"}</span><button className="button button-secondary" disabled={busy} onClick={saveDraft}>수동 수정본 저장</button>{payload.version.kind !== "CONFIRMED" ? <button className="button button-primary" disabled={busy} onClick={confirmVersion}>이 편성 확정</button> : null}</div> : null}
  </div>;
}

function GroupColumn({ group, students, staff, settings, onStaffChange }: { group: WorkingGroup; students: Student[]; staff: Staff[]; settings: Settings; onStaffChange: (ids: string[]) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}` });
  const members = group.studentIds.map((id) => students.find((student) => student.id === id)).filter((student): student is Student => Boolean(student));
  const count = (predicate: (student: Student) => boolean) => members.filter(predicate).length;
  return <article ref={setNodeRef} className={`group-column ${isOver ? "is-over" : ""}`}>
    <header><h3>{group.name}</h3><span>{group.studentIds.length}/{settings.studentMax}명</span></header>
    <div className="group-metrics" aria-label={`${group.name} 구성 요약`}>
      <div><span>학년</span><strong>1학년 {count((student) => student.grade === 1)} · 2학년 {count((student) => student.grade === 2)} · 3학년 {count((student) => student.grade === 3)}</strong></div>
      <div><span>성비</span><strong>여 {count((student) => student.gender === "FEMALE")} · 남 {count((student) => student.gender === "MALE")}</strong></div>
      <div><span>팀</span><strong>싱어 {count((student) => student.team === "SINGER")} · 세션 {count((student) => student.team === "SESSION")}</strong></div>
      <div><span>예배</span><strong>1부 {count((student) => student.serviceDepartment === "FIRST")} · 2부 {count((student) => student.serviceDepartment === "SECOND")}</strong></div>
    </div>
    <div className="staff-picker">
      <div className="staff-picker-heading"><span>담당 스탭</span><small>{group.staffIds.length ? `${group.staffIds.length}명 배정` : "미지정"}</small></div>
      <select className="field staff-select" value="" aria-label={`${group.name} 담당 스탭 선택`} onChange={(event) => event.target.value && onStaffChange([...group.staffIds, event.target.value])}><option value="">스탭 추가하기</option>{staff.filter((item) => !group.staffIds.includes(item.id)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      {group.staffIds.length ? <div className="staff-chips">{group.staffIds.map((id) => { const name = staff.find((item) => item.id === id)?.name ?? "알 수 없음"; return <button className="staff-chip" type="button" aria-label={`${name} 배정 해제`} key={id} onClick={() => onStaffChange(group.staffIds.filter((staffId) => staffId !== id))}><span>{name}</span><b aria-hidden="true">×</b></button>; })}</div> : null}
    </div>
    <div className="student-stack">{members.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ko")).map((student) => <StudentCard key={student.id} student={student} />)}</div>
  </article>;
}
function StudentCard({ student }: { student: Student }) { const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `student:${student.id}` }); return <button ref={setNodeRef} {...listeners} {...attributes} className={`student-card ${isDragging ? "dragging" : ""}`} style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined }}><strong>{student.name}</strong><span>{student.grade}학년 · {student.gender === "FEMALE" ? "여" : "남"} · {student.team === "SINGER" ? "싱어" : "세션"}</span></button>; }
function NumberField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) { return <label className="form-field"><span>{label}</span><input className="field" type="number" min={0} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check-field"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function ruleLabel(rule: Rule, students: Student[]) { if (rule.type.endsWith("_MIN")) return `${rule.type === "GENDER_MIN" ? "성별" : rule.type === "GRADE_MIN" ? "학년" : "팀"} ${rule.value} · 조별 최소 ${rule.minCount}명`; const names = rule.memberIds.map((id) => students.find((student) => student.id === id)?.name).filter(Boolean).join("·"); return `${rule.type === "TOGETHER" ? "같은 조" : rule.type === "APART" ? "다른 조" : "톱시드"} · ${names}`; }
