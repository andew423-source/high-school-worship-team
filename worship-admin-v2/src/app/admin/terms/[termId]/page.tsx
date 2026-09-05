import Link from "next/link";
import { notFound } from "next/navigation";
import { MeetingManager, type MeetingItem } from "@/components/meeting-manager";
import { TermStatusActions } from "@/components/term-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TermDetailPage({ params }: { params: Promise<{ termId: string }> }) {
  const { termId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: term }, { data: meetings }, { count: studentCount }, { count: staffCount }] = await Promise.all([
    supabase.from("terms").select("*").eq("id", termId).maybeSingle(),
    supabase.from("meetings").select("id,sequence,meeting_date,title,kind,is_cancelled").eq("term_id", termId).order("meeting_date"),
    supabase.from("term_students").select("id", { count: "exact", head: true }).eq("term_id", termId),
    supabase.from("staff").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  if (!term) notFound();

  return <main className="page-shell">
    <Link className="back-link" href="/admin/terms">← 전체 학기</Link>
    <div className="page-heading term-heading"><div><div className="eyebrow">TERM OVERVIEW</div><h1>{term.name}</h1><p>{term.start_date} — {term.end_date} · {term.late_counts_as_present ? "지각도 등단 출석 인정" : "출석만 등단 출석 인정"}</p></div><TermStatusActions termId={term.id} status={term.status} /></div>
    <section className="stat-strip"><div><strong>{meetings?.length ?? 0}</strong><span>모임</span></div><div><strong>{studentCount ?? 0}</strong><span>학생</span></div><div><strong>{staffCount ?? 0}</strong><span>활성 스탭</span></div><Link href={`/admin/people?termId=${term.id}`}>학생·스탭 DB 열기 →</Link></section>
    <section className="dashboard-grid term-tools section-space"><Link className="dashboard-card" href={`/admin/terms/${term.id}/groups`}><div><span className="badge">1</span><h2>조 편성</h2><p>조건에 맞는 자동 초안을 만들고 담당 스탭을 지정합니다.</p></div><span className="card-link">조 편성 열기 →</span></Link><Link className="dashboard-card" href={`/admin/terms/${term.id}/attendance`}><div><span className="badge">2</span><h2>출결</h2><p>확정된 조별로 학기 전체 출결을 관리합니다.</p></div><span className="card-link">출결 열기 →</span></Link>{meetings?.[0] ? <Link className="dashboard-card" href={`/admin/terms/${term.id}/stage?meetingId=${meetings[0].id}`}><div><span className="badge">3</span><h2>등단</h2><p>출결을 바탕으로 주일 등단표를 만들고 확정합니다.</p></div><span className="card-link">등단 도구 열기 →</span></Link> : <article className="dashboard-card"><h2>등단</h2><p>먼저 모임 일정을 추가해주세요.</p></article>}</section>
    <p><Link className="button button-secondary" href={`/admin/terms/${termId}/stage-history`}>학생별 등단 내역표 열기 →</Link></p>
    <section className="panel section-space"><div className="section-heading"><div><span className="eyebrow">SATURDAY MEETINGS</span><h2>토요모임 일정</h2></div><p>휴강일은 삭제하지 않고 남겨 이후 출결표에서도 구분합니다.</p></div><MeetingManager termId={term.id} meetings={(meetings ?? []) as MeetingItem[]} /></section>
  </main>;
}
