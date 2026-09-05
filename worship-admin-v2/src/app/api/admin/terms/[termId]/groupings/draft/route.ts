import { z } from "zod";
import { evaluateGrouping, type GroupingRule, type GroupingStudent } from "@/domain/grouping";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const settingsSchema = z.object({ groupCount: z.number().int().min(1), studentMin: z.number().int().min(0), studentMax: z.number().int().min(1), staffMin: z.number().int().min(0), staffMax: z.number().int().min(0), clusterGender: z.boolean(), clusterGrade: z.boolean(), splitTeam: z.boolean() })
  .refine((value) => value.studentMin <= value.studentMax && value.staffMin <= value.staffMax, "최소·최대 인원을 확인해주세요.");
const schema = z.object({
  sourceVersionId: z.uuid(), expectedRevision: z.number().int().positive(), settings: settingsSchema, seed: z.number().int().nullable().optional(), force: z.boolean().default(false),
  groups: z.array(z.object({ name: z.string().trim().min(1), sortOrder: z.number().int().min(0), studentIds: z.array(z.uuid()), staffIds: z.array(z.uuid()) })),
});

export async function POST(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext(); if (context.error) return context.error;
  const { termId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "수동 편성 내용을 확인해주세요.");
  const [{ data: roster }, { data: ruleRows }, { data: staffRows }] = await Promise.all([
    context.supabase.from("term_students").select("id,grade,gender,service_department,team,students(name)").eq("term_id", termId).eq("active", true),
    context.supabase.from("grouping_rules").select("id,type,value,min_count,grouping_rule_members(term_student_id)").eq("term_id", termId),
    context.supabase.from("staff").select("id,name,active").eq("active", true),
  ]);
  const students: GroupingStudent[] = (roster ?? []).flatMap((item) => { const student = Array.isArray(item.students) ? item.students[0] : item.students; return student ? [{ id: item.id, name: student.name, grade: item.grade, gender: item.gender, serviceDepartment: item.service_department, team: item.team }] : []; });
  const rules: GroupingRule[] = (ruleRows ?? []).map((rule) => ({ id: rule.id, type: rule.type, value: rule.value, minCount: rule.min_count, memberIds: (rule.grouping_rule_members ?? []).map((member) => member.term_student_id) }));
  if (parsed.data.groups.length !== parsed.data.settings.groupCount) return apiError("설정한 조 수와 실제 조 수가 다릅니다. 자동 편성을 다시 실행해주세요.", 409, "group_count_mismatch");
  if (new Set(parsed.data.groups.map((group) => group.sortOrder)).size !== parsed.data.groups.length) return apiError("조 순서가 중복되어 있습니다.", 409, "duplicate_group_order");
  const activeStudentIds = new Set(students.map((student) => student.id));
  const submittedStudentIds = parsed.data.groups.flatMap((group) => group.studentIds);
  if (submittedStudentIds.some((id) => !activeStudentIds.has(id))) return apiError("현재 학기에 속하지 않은 학생이 포함되어 있습니다.", 409, "unknown_student");
  if (new Set(submittedStudentIds).size !== submittedStudentIds.length) return apiError("한 학생이 두 조에 중복 배정되어 있습니다.", 409, "duplicate_student");
  if (submittedStudentIds.length !== activeStudentIds.size) return apiError("모든 재적 학생을 정확히 한 조에 배정해주세요.", 409, "unassigned_student");
  const assignableStaffIds = new Set((staffRows ?? []).map((staff) => staff.id));
  const submittedStaffIds = parsed.data.groups.flatMap((group) => group.staffIds);
  if (submittedStaffIds.some((id) => !assignableStaffIds.has(id))) return apiError("활성 상태인 스탭만 배정할 수 있습니다.", 409, "unknown_staff");
  if (new Set(submittedStaffIds).size !== submittedStaffIds.length) return apiError("한 스탭이 두 조에 중복 배정되어 있습니다.", 409, "duplicate_staff");
  const groupRows = parsed.data.groups.map((group) => ({ id: crypto.randomUUID(), name: group.name, sortOrder: group.sortOrder, studentMin: parsed.data.settings.studentMin, studentMax: parsed.data.settings.studentMax, staffMin: parsed.data.settings.staffMin, staffMax: parsed.data.settings.staffMax }));
  const assignmentsForEvaluation = parsed.data.groups.flatMap((group, groupIndex) => group.studentIds.map((termStudentId) => ({ termStudentId, groupIndex })));
  const warnings = evaluateGrouping({ students, settings: parsed.data.settings, rules, assignments: assignmentsForEvaluation });
  const staffWarnings = parsed.data.groups.flatMap((group) => group.staffIds.length < parsed.data.settings.staffMin ? [`${group.name} 담당 스탭이 최소 ${parsed.data.settings.staffMin}명보다 적습니다.`] : group.staffIds.length > parsed.data.settings.staffMax ? [`${group.name} 담당 스탭이 최대 ${parsed.data.settings.staffMax}명을 넘습니다.`] : []);
  const allWarnings = [...new Set([...warnings, ...staffWarnings])];
  if (allWarnings.length && !parsed.data.force) return Response.json({ error: { code: "confirmation_required", message: "조건 위반을 확인해주세요." }, warnings: allWarnings, revision: parsed.data.expectedRevision }, { status: 409 });
  const studentAssignments = parsed.data.groups.flatMap((group, index) => group.studentIds.map((termStudentId) => ({ termStudentId, groupId: groupRows[index].id })));
  const staffAssignments = parsed.data.groups.flatMap((group, index) => group.staffIds.map((staffId) => ({ staffId, groupId: groupRows[index].id })));
  const { data: version, error } = await context.supabase.rpc("save_grouping_snapshot", {
    p_term_id: termId, p_kind: "MANUAL_DRAFT", p_seed: parsed.data.seed ?? null,
    p_settings: parsed.data.settings, p_rules: rules, p_groups: groupRows,
    p_student_assignments: studentAssignments, p_staff_assignments: staffAssignments,
    p_warnings: allWarnings, p_source_version_id: parsed.data.sourceVersionId,
    p_expected_revision: parsed.data.expectedRevision,
  });
  if (error) return apiError(error.message.includes("revision_conflict") ? "다른 사용자가 편성안을 변경했습니다. 새로고침 후 다시 시도해주세요." : "수동 편성안을 저장하지 못했습니다.", error.message.includes("revision_conflict") ? 409 : 500, error.code);
  return dataResponse({ version, groups: groupRows, studentAssignments, staffAssignments }, { warnings: allWarnings, revision: version.revision, status: 201 });
}
