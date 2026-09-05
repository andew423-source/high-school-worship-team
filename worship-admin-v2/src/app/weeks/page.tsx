import Link from "next/link";
import { formatKoreanDate } from "@/domain/terms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "주차별 안내" };

export default async function WeeksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: term } = await supabase.from("terms").select("id,name").eq("status", "ACTIVE").maybeSingle();
  const { data: meetings } = term ? await supabase.from("meetings").select("id,meeting_date,title,is_cancelled").eq("term_id", term.id).order("meeting_date") : { data: [] };
  return (
    <main className="page-shell">
      <div className="page-heading"><div><div className="eyebrow">WEEKLY WORSHIP GUIDE</div><h1>주차별 안내</h1><p>{term ? `${term.name} · 등록된 모임을 선택해주세요.` : "운영자가 활성 학기를 준비하고 있습니다."}</p></div></div>
      {term ? <section className="compact-list-view public-week-list">{(meetings ?? []).map((meeting, index) => <Link className={`meeting-row ${meeting.is_cancelled ? "cancelled" : ""}`} key={meeting.id} href={`/weeks/${meeting.id}`}>
        <span className="row-number">{String(index + 1).padStart(2, "0")}</span><strong>{index + 1}주차</strong><span>{formatKoreanDate(meeting.meeting_date)}</span><span>{meeting.title}</span>{meeting.is_cancelled ? <span className="badge badge-disabled">휴강</span> : null}<b>→</b>
      </Link>)}</section> : <section className="panel coming-panel"><div><span className="badge">준비 중</span><h2>활성 학기가 없습니다.</h2><p>운영자가 학기를 활성화하면 주차가 이곳에 표시됩니다.</p></div></section>}
    </main>
  );
}
