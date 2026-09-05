import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const { termId } = await params;
  const [{ data: term }, { data: roster }, { data: staff }, { data: rules }, { data: version }] = await Promise.all([
    context.supabase.from("terms").select("id,name,status").eq("id", termId).maybeSingle(),
    context.supabase.from("term_students").select("id,grade,gender,service_department,team,students(name)").eq("term_id", termId).eq("active", true).order("grade"),
    context.supabase.from("staff").select("id,name,gender,group_leader_capable,active").eq("active", true).order("name"),
    context.supabase.from("grouping_rules").select("id,type,value,min_count,grouping_rule_members(term_student_id)").eq("term_id", termId).order("created_at"),
    context.supabase.from("grouping_versions").select("*").eq("term_id", termId).order("version_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!term) return apiError("학기를 찾을 수 없습니다.", 404, "not_found");

  let groups: unknown[] = [];
  let studentAssignments: unknown[] = [];
  let staffAssignments: unknown[] = [];
  if (version) {
    const [groupResult, studentResult, staffResult] = await Promise.all([
      context.supabase.from("groups").select("*").eq("version_id", version.id).order("sort_order"),
      context.supabase.from("group_student_members").select("group_id,term_student_id").eq("version_id", version.id),
      context.supabase.from("group_staff_members").select("group_id,staff_id").eq("version_id", version.id),
    ]);
    groups = groupResult.data ?? [];
    studentAssignments = studentResult.data ?? [];
    staffAssignments = staffResult.data ?? [];
  }
  const students = (roster ?? []).flatMap((item) => {
    const student = Array.isArray(item.students) ? item.students[0] : item.students;
    return student ? [{ id: item.id, name: student.name, grade: item.grade, gender: item.gender, serviceDepartment: item.service_department, team: item.team }] : [];
  });
  const normalizedRules = (rules ?? []).map((rule) => ({
    id: rule.id, type: rule.type, value: rule.value, minCount: rule.min_count,
    memberIds: (rule.grouping_rule_members ?? []).map((member) => member.term_student_id),
  }));
  return dataResponse({ term, students, staff: staff ?? [], rules: normalizedRules, version, groups, studentAssignments, staffAssignments }, { revision: version?.revision ?? null });
}
