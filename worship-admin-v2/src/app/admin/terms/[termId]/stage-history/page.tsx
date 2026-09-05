import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { latestConfirmedVersions, stageRecordLabel } from "@/domain/stage-records";

// Supabase caps each response: page every collection to avoid silently losing history.
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await query(from, from + 499);
    if (result.error) throw new Error("등단 내역을 불러오지 못했습니다. 다시 시도해주세요.");
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export default async function StageHistoryPage({ params }: { params: Promise<{ termId: string }> }) {
  await requireAdmin();
  const { termId } = await params;
  const db = await createSupabaseServerClient();
  const { data: term, error } = await db.from("terms").select("name").eq("id", termId).maybeSingle();
  if (error) throw new Error("학기를 불러오지 못했습니다.");
  if (!term) notFound();
  const [students, meetings, plans] = await Promise.all([
    allRows((a,b) => db.from("term_students").select("id,grade,students(name)").eq("term_id", termId).order("id").range(a,b)),
    allRows((a,b) => db.from("meetings").select("id,meeting_date,sequence").eq("term_id", termId).order("meeting_date").order("id").range(a,b)),
    allRows((a,b) => db.from("stage_plans").select("id,meeting_id,sunday_date").eq("term_id", termId).order("id").range(a,b)),
  ]);
  const versions = plans.length ? await allRows((a,b) => db.from("stage_versions").select("id,plan_id,version_no,leader_type,leader_term_student_id").in("plan_id", plans.map(p=>p.id)).eq("kind", "CONFIRMED").order("id").range(a,b)) : [];
  const latest = latestConfirmedVersions(versions);
  const ids = [...latest.values()].map(v=>v.id);
  const [services, candidates, overrides] = ids.length ? await Promise.all([
    allRows((a,b) => db.from("stage_services").select("id,version_id,department").in("version_id", ids).order("id").range(a,b)),
    allRows((a,b) => db.from("stage_candidates").select("id,version_id,term_student_id,eligible").in("version_id", ids).eq("person_type", "STUDENT").order("id").range(a,b)),
    allRows((a,b) => db.from("stage_overrides").select("id,version_id,term_student_id,kind").in("version_id", ids).eq("kind", "EXCLUDE_STAGE").order("id").range(a,b)),
  ]) : [[], [], []];
  const assignments = services.length ? await allRows((a,b) => db.from("stage_assignments").select("id,service_id,term_student_id,role").in("service_id", services.map(s=>s.id)).eq("person_type", "STUDENT").order("id").range(a,b)) : [];
  const serviceById = new Map(services.map(s=>[s.id,s]));
  const roleMap = new Map<string,string[]>();
  for (const row of assignments) {
    const service = serviceById.get(row.service_id);
    if (!service) continue;
    const key = `${service.version_id}:${row.term_student_id}`;
    roleMap.set(key, [...(roleMap.get(key) ?? []), `${service.department === "FIRST" ? "1부" : "2부"} ${row.role === "SINGER" ? "싱어" : "콰이어"}`]);
  }
  const eligible = new Set(candidates.filter(c=>c.eligible).map(c=>`${c.version_id}:${c.term_student_id}`));
  const excluded = new Set(overrides.map(c=>`${c.version_id}:${c.term_student_id}`));
  const planByMeeting = new Map(plans.map(p=>[p.meeting_id,p]));
  const roster = students.map(student => ({ ...student, name: (Array.isArray(student.students) ? student.students[0] : student.students)?.name ?? "이름 없음" })).sort((a,b)=>a.name.localeCompare(b.name,"ko"));
  return <main className="page-shell stage-wide">
    <Link href={`/admin/terms/${termId}`}>← 학기 개요</Link>
    <div className="page-heading"><div><div className="eyebrow">STAGE HISTORY</div><h1>학생별 등단 내역</h1><p>{term.name} · 날짜별 최신 확정본 기준입니다. 재확정하면 이 표도 갱신되며 이전 DB 이력은 보존됩니다.</p></div></div>
    <p>‘반에서 예배하기’는 확정 당시 후보 중 미배정 또는 등단 안함 지정 기록입니다. 실제 예배 출석을 별도로 확인한 기록은 아닙니다. 미확정·기록 없음은 반 예배로 계산하지 않습니다.</p>
    <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th className="student-sticky">학생</th>{meetings.map(m=><th key={m.id}>{m.sequence}주<small>{planByMeeting.get(m.id)?.sunday_date ?? `${m.meeting_date} 모임`}</small></th>)}</tr></thead><tbody>{roster.map(student=><tr key={student.id}><th className="student-sticky"><strong>{student.name}</strong><small>{student.grade}학년</small></th>{meetings.map(meeting=>{
      const plan = planByMeeting.get(meeting.id);
      const version = plan ? latest.get(plan.id) : undefined;
      const key = `${version?.id}:${student.id}`;
      return <td key={meeting.id}>{stageRecordLabel({ confirmed: !!version, leader: version?.leader_type === "STUDENT" && version.leader_term_student_id === student.id, roles: roleMap.get(key) ?? [], eligible: eligible.has(key), excluded: excluded.has(key) })}</td>;
    })}</tr>)}</tbody></table></div>
    {!roster.length ? <p>등록된 학생이 없습니다.</p> : null}
  </main>;
}
