import { z } from "zod";
import { generateGrouping, type GroupingRule, type GroupingStudent } from "@/domain/grouping";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const settingsSchema = z.object({
  groupCount: z.number().int().min(1).max(30), studentMin: z.number().int().min(0), studentMax: z.number().int().min(1),
  staffMin: z.number().int().min(0), staffMax: z.number().int().min(0),
  clusterGender: z.boolean(), clusterGrade: z.boolean(), splitTeam: z.boolean(),
}).refine((value) => value.studentMin <= value.studentMax && value.staffMin <= value.staffMax, "최소·최대 인원을 확인해주세요.");
const schema = z.object({ settings: settingsSchema, seed: z.number().int().default(1) });

export async function POST(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext(); if (context.error) return context.error;
  const { termId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "조 설정을 확인해주세요.");
  const [{ data: roster }, { data: ruleRows }] = await Promise.all([
    context.supabase.from("term_students").select("id,grade,gender,service_department,team,students(name)").eq("term_id", termId).eq("active", true),
    context.supabase.from("grouping_rules").select("id,type,value,min_count,grouping_rule_members(term_student_id)").eq("term_id", termId),
  ]);
  const students: GroupingStudent[] = (roster ?? []).flatMap((item) => {
    const student = Array.isArray(item.students) ? item.students[0] : item.students;
    return student ? [{ id: item.id, name: student.name, grade: item.grade, gender: item.gender, serviceDepartment: item.service_department, team: item.team }] : [];
  });
  const rules: GroupingRule[] = (ruleRows ?? []).map((rule) => ({ id: rule.id, type: rule.type, value: rule.value, minCount: rule.min_count, memberIds: (rule.grouping_rule_members ?? []).map((member) => member.term_student_id) }));
  const result = generateGrouping(students, parsed.data.settings, rules, parsed.data.seed);
  if (result.error) return apiError(result.error, 409, "unsatisfied_constraints");
  const groups = Array.from({ length: parsed.data.settings.groupCount }, (_, sortOrder) => ({
    id: crypto.randomUUID(), name: `${sortOrder + 1}조`, sortOrder,
    studentMin: parsed.data.settings.studentMin, studentMax: parsed.data.settings.studentMax,
    staffMin: parsed.data.settings.staffMin, staffMax: parsed.data.settings.staffMax,
  }));
  const studentAssignments = result.assignments.map((item) => ({ termStudentId: item.termStudentId, groupId: groups[item.groupIndex].id }));
  const { data: version, error } = await context.supabase.rpc("save_grouping_snapshot", {
    p_term_id: termId, p_kind: "AUTO_DRAFT", p_seed: parsed.data.seed,
    p_settings: parsed.data.settings, p_rules: rules, p_groups: groups,
    p_student_assignments: studentAssignments, p_staff_assignments: [], p_warnings: result.warnings,
    p_source_version_id: null, p_expected_revision: null,
  });
  if (error) {
    const schemaMissing = ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code);
    return apiError(
      schemaMissing
        ? "조 편성 데이터베이스 설정이 아직 적용되지 않았습니다. grouping 마이그레이션을 먼저 실행해주세요."
        : "자동 편성안을 저장하지 못했습니다.",
      schemaMissing ? 503 : 500,
      error.code,
    );
  }
  return dataResponse({ version, groups, studentAssignments, staffAssignments: [], score: result.score }, { warnings: result.warnings, revision: version.revision, status: 201 });
}
