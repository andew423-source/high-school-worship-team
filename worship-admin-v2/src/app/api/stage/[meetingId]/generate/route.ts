import { z } from "zod";
import { stageOverrideSchema } from "@/lib/stage-schema";
import { generateStaffOnlyService, generateStageService, type StageHistory, type StageOverride, type StageStaff, type StageStudent } from "@/domain/stage";
import { apiError, dataResponse, getOperationalApiContext } from "@/lib/api";
import { loadStageHistory } from "@/lib/stage-history";

const serviceSchema = z.object({ department: z.enum(["FIRST", "SECOND"]), singerTarget: z.number().int().min(0).max(30), choirTarget: z.number().int().min(0).max(30) });
const schema = z.object({ staffOnly: z.boolean().default(false), leaderType: z.enum(["STUDENT", "STAFF"]).nullable().default(null), leaderId: z.uuid().nullable().default(null), services: z.array(serviceSchema).length(2), overrides: z.array(stageOverrideSchema).default([]) });

export async function POST(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { meetingId } = await params; const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "등단 설정을 확인해주세요.");
  const { data: plan } = await context.supabase.from("stage_plans").select("id,term_id,sunday_date").eq("meeting_id", meetingId).maybeSingle();
  if (!plan) return apiError("등단 주차를 찾을 수 없습니다.", 404, "not_found");
  const [{ data: term }, { data: meeting }, { data: roster }, { data: staffRows }, { data: attendance }, { data: availability }, historyRecord] = await Promise.all([
    context.supabase.from("terms").select("late_counts_as_present").eq("id", plan.term_id).single(),
    context.supabase.from("meetings").select("is_cancelled").eq("id", meetingId).single(),
    context.supabase.from("term_students").select("id,gender,service_department,team,is_student_leader,students(name)").eq("term_id", plan.term_id).eq("active", true),
    context.supabase.from("staff").select("id,name,gender,preferred_service,singer_capable,exclude_from_auto_singer,is_default_stage_leader,active").eq("active", true),
    context.supabase.rpc("get_stage_attendance", { p_plan_id: plan.id }),
    context.supabase.from("stage_staff_availability").select("staff_id,present,stage_role").eq("plan_id", plan.id),
    loadStageHistory(context.supabase, plan.term_id, plan.sunday_date),
  ]);
  if (!term || !meeting) return apiError("학기 또는 모임 정보를 찾을 수 없습니다.", 404, "not_found");
  const students: StageStudent[] = (roster ?? []).flatMap((item) => { const student = Array.isArray(item.students) ? item.students[0] : item.students; return student ? [{ id: item.id, name: student.name, gender: item.gender, department: item.service_department, team: item.team, isStudentLeader: item.is_student_leader }] : []; });
  const staff: StageStaff[] = (staffRows ?? []).map((item) => ({ id: item.id, name: item.name, gender: item.gender, preferredService: item.preferred_service, singerCapable: item.singer_capable, excludeFromAutoSinger: item.exclude_from_auto_singer }));
  const attendanceRows = (attendance ?? []) as Array<{ term_student_id: string; status: "PRESENT" | "LATE" | "ABSENT" }>;
  const eligibleStudentIds = new Set<string>(meeting.is_cancelled ? [] : attendanceRows.filter((item) => item.status === "PRESENT" || (term.late_counts_as_present && item.status === "LATE")).map((item) => item.term_student_id));
  const presentSingerStaffIds = new Set((availability ?? []).filter((item) => item.present && item.stage_role === "SINGER").map((item) => item.staff_id));
  let leaderType = parsed.data.leaderType; let leaderId = parsed.data.leaderId;
  if (!leaderId) { const defaultLeader = (staffRows ?? []).find((item) => item.is_default_stage_leader); if (defaultLeader) { leaderType = "STAFF"; leaderId = defaultLeader.id; } }
  if (!leaderType || !leaderId) return apiError("인도자를 선택해주세요. 기본 인도자 스탭이 등록되어 있지 않습니다.", 409, "leader_required");
  if (parsed.data.staffOnly && leaderType !== "STAFF") return apiError("스탭만 등단할 때는 스탭 인도자를 선택해주세요.");
  if (leaderType === "STUDENT" && !eligibleStudentIds.has(leaderId)) return apiError("학생 인도자는 해당 토요모임에 출석해야 합니다.", 409, "leader_not_eligible");
  const excludedIds = new Set(parsed.data.overrides.filter((item) => item.kind === "EXCLUDE_STAGE").map((item) => item.termStudentId));
  if (leaderType === "STUDENT" && excludedIds.has(leaderId)) return apiError("인도자로 선택된 학생은 등단 안함으로 지정할 수 없습니다. 인도자를 먼저 변경해주세요.");
  if (parsed.data.overrides.some((item) => !students.some((student) => student.id === item.termStudentId))) return apiError("특이사항 학생을 현재 학기에서 찾을 수 없습니다.");
  if (parsed.data.overrides.some((item) => item.kind === "FORCE_STAGE" && excludedIds.has(item.termStudentId))) return apiError("같은 학생에게 무조건 등단과 등단 안함을 함께 지정할 수 없습니다.");
  const histories = new Map(Object.entries(historyRecord) as Array<[string, StageHistory]>);
  const usedStaffIds = new Set<string>(); const serviceRows = parsed.data.services.map((service) => ({ ...service, id: crypto.randomUUID() }));
  const generated = serviceRows.map((service) => ({ service, result: parsed.data.staffOnly ? { assignments: generateStaffOnlyService(staff, presentSingerStaffIds, leaderId), warnings: [] as string[] } : generateStageService({ department: service.department, students, staff, eligibleStudentIds, presentSingerStaffIds, histories, singerTarget: service.singerTarget, choirTarget: service.choirTarget, leaderType, leaderId, overrides: parsed.data.overrides as StageOverride[], usedStaffIds }) }));
  const warnings = [...new Set(generated.flatMap((item) => item.result.warnings.map((warning) => `${item.service.department === "FIRST" ? "1부" : "2부"}: ${warning}`)))];
  const candidates = [
    ...students.map((student) => ({ personType: "STUDENT", personId: student.id, department: parsed.data.overrides.find((item) => item.kind === "MOVE_DEPARTMENT" && item.termStudentId === student.id)?.department ?? student.department, eligible: student.team === "SINGER" && eligibleStudentIds.has(student.id), reason: student.team !== "SINGER" ? "세션팀 학생" : !eligibleStudentIds.has(student.id) ? meeting.is_cancelled ? "휴강 주차" : "토요 출결 미입력·지각 미인정 또는 결석" : "등단 후보" })),
    ...staff.map((item) => ({ personType: "STAFF", personId: item.id, department: null, eligible: presentSingerStaffIds.has(item.id), reason: presentSingerStaffIds.has(item.id) ? "참석 싱어 스탭" : "불참 또는 세션 역할" })),
  ];
  const assignments = generated.flatMap(({ service, result }) => result.assignments.map((assignment) => ({ serviceId: service.id, personType: assignment.personType, personId: assignment.personId, role: assignment.role, side: assignment.side, positionOrder: assignment.positionOrder, reason: assignment.reason, isManual: false })));
  const { data: version, error } = await context.supabase.rpc("save_stage_snapshot", {
    p_plan_id: plan.id, p_kind: "AUTO_DRAFT", p_leader_type: leaderType, p_leader_id: leaderId,
    p_config: { studentRatio: .75, minimumFemaleSingers: 3, staffOnly: parsed.data.staffOnly }, p_services: serviceRows,
    p_candidates: candidates, p_overrides: parsed.data.overrides, p_assignments: assignments,
    p_warnings: warnings, p_source_version_id: null, p_expected_revision: null,
  });
  if (error) {
    console.error("[stage/generate] save_stage_snapshot failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      meetingId,
      planId: plan.id,
      serviceCount: serviceRows.length,
      candidateCount: candidates.length,
      assignmentCount: assignments.length,
    });

    const knownMessages: Record<string, string> = {
      "42883": "등단 저장 함수가 현재 데이터 형식과 맞지 않습니다. 최신 stage 마이그레이션을 적용해주세요.",
      "42P01": "등단 데이터베이스 테이블이 없습니다. 최신 stage 마이그레이션을 적용해주세요.",
      "PGRST202": "등단 저장 함수를 찾지 못했습니다. Supabase에서 최신 stage 마이그레이션을 다시 적용해주세요.",
      "PGRST205": "등단 데이터베이스 설정이 아직 적용되지 않았습니다.",
      "23503": "선택한 인도자 또는 배정 인원이 현재 명단과 연결되지 않았습니다. 명단을 새로고침한 뒤 다시 시도해주세요.",
      "23505": "같은 사람이 등단표에 중복 배정되었습니다. 자동 배정 규칙을 다시 확인해주세요.",
      "23514": "생성된 등단표가 데이터베이스 제약조건을 충족하지 못했습니다.",
    };
    const databaseReason = error.message?.replace(/^.*?:\s*/, "").replaceAll("_", " ");
    const message = knownMessages[error.code]
      ?? (process.env.NODE_ENV === "development" && databaseReason
        ? `등단 자동 배정안을 저장하지 못했습니다. (${databaseReason})`
        : "등단 자동 배정안을 저장하지 못했습니다.");
    return apiError(message, 500, error.code);
  }
  return dataResponse({ version, services: serviceRows, assignments }, { warnings, revision: version.revision, status: 201 });
}
