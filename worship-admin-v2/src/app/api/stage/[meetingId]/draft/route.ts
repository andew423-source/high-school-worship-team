import { z } from "zod";
import { stageOverrideSchema } from "@/lib/stage-schema";
import { apiError, dataResponse, getOperationalApiContext } from "@/lib/api";
import { loadStageHistory } from "@/lib/stage-history";

const assignmentSchema = z.object({ serviceId: z.uuid(), personType: z.enum(["STUDENT", "STAFF"]), personId: z.uuid(), role: z.enum(["SINGER", "CHOIR"]), side: z.enum(["LEFT", "RIGHT"]), positionOrder: z.number().int().min(0), reason: z.string(), isManual: z.boolean() });
const schema = z.object({ staffOnly: z.boolean().optional(), versionId: z.uuid(), expectedRevision: z.number().int().positive(), leaderType: z.enum(["STUDENT", "STAFF"]), leaderId: z.uuid(), force: z.boolean().default(false), overrides: z.array(stageOverrideSchema).optional(), services: z.array(z.object({ id: z.uuid(), department: z.enum(["FIRST", "SECOND"]), singerTarget: z.number().int().min(0), choirTarget: z.number().int().min(0) })).length(2), assignments: z.array(assignmentSchema) });

export async function POST(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { meetingId } = await params; const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "수정한 등단표를 확인해주세요.");
  const [{ data: plan }, { data: source }] = await Promise.all([
    context.supabase.from("stage_plans").select("id,term_id,sunday_date").eq("meeting_id", meetingId).maybeSingle(),
    context.supabase.from("stage_versions").select("id,plan_id,config_snapshot,warnings").eq("id", parsed.data.versionId).maybeSingle(),
  ]);
  if (!plan || !source || source.plan_id !== plan.id) return apiError("원본 등단표를 찾을 수 없습니다.", 404);
  const [{ data: candidates }, { data: overrides }, { data: roster }, history] = await Promise.all([
    context.supabase.from("stage_candidates").select("person_type,term_student_id,staff_id,department,eligible,reason").eq("version_id", source.id),
    context.supabase.from("stage_overrides").select("term_student_id,kind,department,role").eq("version_id", source.id),
    context.supabase.from("term_students").select("id,gender,service_department,team,is_student_leader,students(name)").eq("term_id", plan.term_id),
    loadStageHistory(context.supabase, plan.term_id, plan.sunday_date),
  ]);
  const staffOnly = parsed.data.staffOnly ?? (source.config_snapshot?.staffOnly === true);
  if (staffOnly && (parsed.data.leaderType !== "STAFF" || parsed.data.assignments.some((item) => item.personType === "STUDENT"))) return apiError("스탭만 등단할 때는 스탭 인도자와 스탭만 배치할 수 있습니다.");
  const effectiveOverrides = parsed.data.overrides ?? (overrides ?? []).map((item) => ({ termStudentId: item.term_student_id, kind: item.kind, department: item.department, role: item.role }));
  const excludedIds = new Set(effectiveOverrides.filter((item) => item.kind === "EXCLUDE_STAGE").map((item) => item.termStudentId));
  if (effectiveOverrides.some((item) => !(roster ?? []).some((student) => student.id === item.termStudentId))) return apiError("특이사항 학생을 현재 학기에서 찾을 수 없습니다.");
  if (effectiveOverrides.some((item) => item.kind === "FORCE_STAGE" && excludedIds.has(item.termStudentId))) return apiError("무조건 등단과 등단 안함을 함께 지정할 수 없습니다.");
  if (parsed.data.leaderType === "STUDENT" && excludedIds.has(parsed.data.leaderId)) return apiError("인도자로 선택된 학생의 등단 안함을 해제하거나 인도자를 변경해주세요.");
  const nameById = new Map((roster ?? []).flatMap((item) => { const student = Array.isArray(item.students) ? item.students[0] : item.students; return student ? [[item.id, { name: student.name, gender: item.gender }]] as const : []; }));
  const candidateByPerson = new Map((candidates ?? []).flatMap((item) => {
    const personId = item.person_type === "STUDENT" ? item.term_student_id : item.staff_id;
    return personId ? [[`${item.person_type}:${personId}` as string, item]] as const : [];
  }));
  const serviceDepartmentById = new Map(parsed.data.services.map((service) => [service.id, service.department]));
  const seenServicePeople = new Set<string>();
  const seenStudents = new Set<string>();
  const staffServiceCount = new Map<string, number>();

  const [{ data: leaderAttendance }, { data: termSettings }, { data: meetingSettings }] = await Promise.all([
    context.supabase.rpc("get_stage_attendance", { p_plan_id: plan.id }),
    context.supabase.from("terms").select("late_counts_as_present").eq("id", plan.term_id).single(),
    context.supabase.from("meetings").select("is_cancelled").eq("id", meetingId).single(),
  ]);
  const leaderPresent = !!meetingSettings && !meetingSettings.is_cancelled && (leaderAttendance ?? []).some((item: { term_student_id: string; status: string }) => item.term_student_id === parsed.data.leaderId && (item.status === "PRESENT" || (termSettings?.late_counts_as_present && item.status === "LATE")));
  const leaderStudent = parsed.data.leaderType === "STUDENT" ? (roster ?? []).find((item) => item.id === parsed.data.leaderId) : null;
  if (parsed.data.leaderType === "STUDENT" && (!leaderStudent || !leaderStudent.is_student_leader || !leaderPresent)) {
    return apiError("학생 인도자는 학생 인도자로 등록되어 있고 해당 토요모임에 출석해야 합니다.", 409, "leader_not_eligible");
  }
  if (parsed.data.leaderType === "STAFF" && !candidateByPerson.has(`STAFF:${parsed.data.leaderId}`)) {
    return apiError("활성 스탭만 인도자로 선택할 수 있습니다.", 409, "leader_not_eligible");
  }

  for (const assignment of parsed.data.assignments) {
    const department = serviceDepartmentById.get(assignment.serviceId);
    if (!department) return apiError("등단 부서를 찾을 수 없습니다. 최신 등단표를 다시 불러와주세요.", 409, "invalid_service");
    const personKey = `${assignment.personType}:${assignment.personId}`;
    const servicePersonKey = `${assignment.serviceId}:${personKey}`;
    const candidate = candidateByPerson.get(personKey);
    if (!candidate?.eligible) return apiError("출석·팀·스탭 참석 조건을 충족한 사람만 등단시킬 수 있습니다.", 409, "ineligible_assignment");
    if (seenServicePeople.has(servicePersonKey)) return apiError("같은 예배에 한 사람이 두 번 배정되어 있습니다.", 409, "duplicate_assignment");
    if (assignment.personType === parsed.data.leaderType && assignment.personId === parsed.data.leaderId) return apiError("인도자는 싱어·콰이어에 중복 배정할 수 없습니다.", 409, "leader_duplicate");
    if (assignment.personType === "STUDENT") {
      if (excludedIds.has(assignment.personId)) return apiError("등단 안함으로 지정한 학생은 반에서 예배하기에 배치해주세요.", 409, "excluded_assignment");
      const effectiveDepartment = effectiveOverrides.find((item) => item.kind === "MOVE_DEPARTMENT" && item.termStudentId === assignment.personId)?.department ?? (roster ?? []).find((item) => item.id === assignment.personId)?.service_department;
      if (effectiveDepartment !== department) return apiError("학생의 예배 부서를 옮기려면 먼저 공통 특이사항에서 부서 이동을 지정해주세요.", 409, "department_mismatch");
      if (seenStudents.has(assignment.personId)) return apiError("학생은 1부와 2부에 중복 등단할 수 없습니다.", 409, "student_duplicate");
      seenStudents.add(assignment.personId);
    } else {
      if (assignment.role === "CHOIR") return apiError("스탭은 콰이어로 배정할 수 없습니다.", 409, "invalid_staff_role");
      staffServiceCount.set(assignment.personId, (staffServiceCount.get(assignment.personId) ?? 0) + 1);
    }
    seenServicePeople.add(servicePersonKey);
  }

  const assignedStaffIds = [...staffServiceCount.keys()];
  const { data: assignedStaff } = assignedStaffIds.length
    ? await context.supabase.from("staff").select("id,name,gender").in("id", assignedStaffIds)
    : { data: [] };
  const staffById = new Map((assignedStaff ?? []).map((item) => [item.id, item]));
  const warnings: string[] = [];
  for (const service of parsed.data.services) {
    const assigned = parsed.data.assignments.filter((item) => item.serviceId === service.id);
    const femaleIds = new Set((roster ?? []).filter((item) => item.gender === "FEMALE").map((item) => item.id));
    const femaleStaffIds = new Set([...staffById.values()].filter((item) => item.gender === "FEMALE").map((item) => item.id));
    const femaleSingers = assigned.filter((item) => item.role === "SINGER" && (item.personType === "STUDENT" ? femaleIds.has(item.personId) : femaleStaffIds.has(item.personId))).length;
    const required = Math.min(3, service.singerTarget); if (femaleSingers < required) warnings.push(`${service.department === "FIRST" ? "1부" : "2부"}: 여자 싱어가 ${femaleSingers}명으로 권장 최소 ${required}명보다 적습니다.`);
    for (const item of assigned.filter((assignment) => assignment.personType === "STUDENT")) {
      const record = history[item.personId]; const person = nameById.get(item.personId);
      if (record?.stagedPreviousTwo) warnings.push(`${person?.name ?? "학생"} 학생이 3주 연속 등단합니다.`);
      if (item.role === "SINGER" && service.choirTarget > 0 && record?.singerPreviousTwo) warnings.push(`${person?.name ?? "학생"} 학생이 3주 연속 싱어가 됩니다.`);
    }
  }
  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length && !parsed.data.force) return Response.json({ error: { code: "confirmation_required", message: "수동 수정 경고를 확인해주세요." }, warnings: uniqueWarnings, revision: parsed.data.expectedRevision }, { status: 409 });
  const newServices = parsed.data.services.map((service) => ({ ...service, id: crypto.randomUUID() }));
  const serviceMap = new Map(parsed.data.services.map((service, index) => [service.id, newServices[index].id]));
  const assignments = parsed.data.assignments.map((item) => ({ ...item, serviceId: serviceMap.get(item.serviceId), isManual: true }));
  const candidatePayload = (candidates ?? []).map((item) => ({ personType: item.person_type, personId: item.person_type === "STUDENT" ? item.term_student_id : item.staff_id, department: item.person_type === "STUDENT" ? (effectiveOverrides.find((override) => override.kind === "MOVE_DEPARTMENT" && override.termStudentId === item.term_student_id)?.department ?? (roster ?? []).find((student) => student.id === item.term_student_id)?.service_department ?? item.department) : item.department, eligible: item.eligible, reason: item.reason }));
  const overridePayload = effectiveOverrides;
  const { data: version, error } = await context.supabase.rpc("save_stage_snapshot", { p_plan_id: plan.id, p_kind: "MANUAL_DRAFT", p_leader_type: parsed.data.leaderType, p_leader_id: parsed.data.leaderId, p_config: { ...source.config_snapshot, staffOnly }, p_services: newServices, p_candidates: candidatePayload, p_overrides: overridePayload, p_assignments: assignments, p_warnings: uniqueWarnings, p_source_version_id: source.id, p_expected_revision: parsed.data.expectedRevision });
  if (error) return apiError(error.message.includes("revision_conflict") ? "다른 스탭이 먼저 등단표를 수정했습니다. 최신 버전을 불러와주세요." : "수정한 등단표를 저장하지 못했습니다.", error.message.includes("revision_conflict") ? 409 : 500, error.code);
  return dataResponse({ version, services: newServices, assignments }, { warnings: uniqueWarnings, revision: version.revision, status: 201 });
}
