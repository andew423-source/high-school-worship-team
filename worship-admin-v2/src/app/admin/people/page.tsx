import { redirect } from "next/navigation";
import { PeopleManager } from "@/components/people-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "학생·스탭 DB" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  const { termId } = await searchParams;
  if (!termId) redirect("/admin/terms");
  const supabase = await createSupabaseServerClient();
  const [{ data: term }, { data: roster }, { data: staff }] = await Promise.all([
    supabase.from("terms").select("id,name").eq("id", termId).maybeSingle(),
    supabase.from("term_students").select("id,grade,gender,service_department,team,is_student_leader,active,students(id,name,internal_code)").eq("term_id", termId).order("grade"),
    supabase.from("staff").select("id,name,email,gender,role_title,singer_capable,group_leader_capable,preferred_service,default_stage_role,exclude_from_auto_singer,is_default_stage_leader,active").order("name"),
  ]);
  if (!term) redirect("/admin/terms");
  const students = (roster ?? []).flatMap((item) => {
    const student = Array.isArray(item.students) ? item.students[0] : item.students;
    return student ? [{
    id: item.id, name: student.name, internalCode: student.internal_code, grade: item.grade,
    gender: item.gender, service: item.service_department, team: item.team, isLeader: item.is_student_leader, active: item.active,
  }] : [];
  });
  const staffItems = (staff ?? []).map((item) => ({
    id: item.id, name: item.name, email: item.email, gender: item.gender, roleTitle: item.role_title,
    singerCapable: item.singer_capable, groupLeaderCapable: item.group_leader_capable,
    preferredService: item.preferred_service, defaultStageRole: item.default_stage_role,
    excludeFromAutoSinger: item.exclude_from_auto_singer, isDefaultStageLeader: item.is_default_stage_leader, active: item.active,
  }));

  return <main className="page-shell wide-shell">
    <div className="page-heading"><div><div className="eyebrow">PEOPLE DATABASE</div><h1>학생·스탭 DB</h1><p>{term.name} 학생 명단과 전체 스탭 정보를 등록합니다. 파일 가져오기는 저장 전에 열 매핑과 오류를 검토합니다.</p></div></div>
    <PeopleManager termId={termId} students={students} staff={staffItems} />
  </main>;
}
