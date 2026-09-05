import { dataResponse, getOperationalApiContext } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { termId } = await params;
  const requestedGroupId = new URL(request.url).searchParams.get("groupId");
  const { data: version } = await context.supabase.from("grouping_versions").select("id,version_no").eq("term_id", termId).eq("kind", "CONFIRMED").order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (!version) return dataResponse({ groups: [], meetings: [], students: [], attendance: [] }, { warnings: ["확정된 조 편성이 없습니다."] });
  const [{ data: allGroups }, { data: staffLinks }] = await Promise.all([
    context.supabase.from("groups").select("id,name,sort_order").eq("version_id", version.id).order("sort_order"),
    context.supabase.from("group_staff_members").select("group_id,staff_id,staff(name)").eq("version_id", version.id),
  ]);
  const allowedIds = context.profile.role === "ADMIN" ? new Set((allGroups ?? []).map((group) => group.id)) : new Set((staffLinks ?? []).filter((link) => link.staff_id === context.profile.staff_id).map((link) => link.group_id));
  const groups = (allGroups ?? []).filter((group) => allowedIds.has(group.id)).map((group) => ({ ...group, staffNames: (staffLinks ?? []).filter((link) => link.group_id === group.id).map((link) => { const staff = Array.isArray(link.staff) ? link.staff[0] : link.staff; return staff?.name; }).filter(Boolean) }));
  const groupId = requestedGroupId && allowedIds.has(requestedGroupId) ? requestedGroupId : groups[0]?.id;
  if (!groupId) return dataResponse({ groups, meetings: [], students: [], attendance: [] }, { warnings: ["로그인 계정에 담당 조가 연결되지 않았습니다."] });
  const { data: memberRows } = await context.supabase.from("group_student_members").select("term_student_id").eq("version_id", version.id).eq("group_id", groupId);
  const studentIds = (memberRows ?? []).map((item) => item.term_student_id);
  const [{ data: meetings }, { data: roster }, { data: attendance }] = await Promise.all([
    context.supabase.from("meetings").select("id,sequence,meeting_date,title,is_cancelled").eq("term_id", termId).order("meeting_date"),
    studentIds.length ? context.supabase.from("term_students").select("id,grade,students(name)").in("id", studentIds) : Promise.resolve({ data: [] }),
    studentIds.length ? context.supabase.from("attendance").select("id,meeting_id,term_student_id,status,updated_at").in("term_student_id", studentIds) : Promise.resolve({ data: [] }),
  ]);
  const students = (roster ?? []).flatMap((item) => { const student = Array.isArray(item.students) ? item.students[0] : item.students; return student ? [{ id: item.id, name: student.name, grade: item.grade }] : []; }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ko"));
  return dataResponse({ groups, selectedGroupId: groupId, meetings: meetings ?? [], students, attendance: attendance ?? [] }, { revision: version.version_no });
}
