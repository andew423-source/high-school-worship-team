import Link from "next/link";
import { notFound } from "next/navigation";
import { formatKoreanDate } from "@/domain/terms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WeekPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: meeting } = await supabase.from("meetings").select("id,meeting_date,title,is_cancelled,terms(name)").eq("id", meetingId).maybeSingle();
  if (!meeting) notFound();
  return <main className="page-shell"><Link className="back-link" href="/weeks">← 전체 주차</Link><div className="page-heading"><div><div className="eyebrow">WEEKLY MENU</div><h1>{formatKoreanDate(meeting.meeting_date)}</h1><p>{meeting.title}{meeting.is_cancelled ? " · 휴강" : ""}</p></div></div>
    <section className="dashboard-grid week-menu"><Link className="dashboard-card" href={`/weeks/${meeting.id}/attendance`}><div><span className="badge">사용 가능</span><h2>출결</h2><p>담당 조의 학기 전체 출결표를 확인하고 입력합니다.</p></div><span className="card-link">출결 열기 →</span></Link><Link className="dashboard-card active" href={`/weeks/${meeting.id}/guide`}><div><span className="badge">사용 가능</span><h2>모임 가이드</h2><p>첫 주차는 운영 가이드를 확인할 수 있습니다.</p></div><span className="card-link">가이드 열기 →</span></Link><Link className="dashboard-card" href={`/weeks/${meeting.id}/stage`}><div><span className="badge">사용 가능</span><h2>등단표</h2><p>스탭 참석을 정리하고 자동 배정·드래그·확정을 진행합니다.</p></div><span className="card-link">등단 도구 열기 →</span></Link></section>
  </main>;
}
