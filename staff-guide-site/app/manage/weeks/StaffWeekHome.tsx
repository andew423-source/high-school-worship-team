import Link from "next/link";
import { all, first } from "../../../db/runtime";

type Term = { id: string; name: string; start_date: string; end_date: string; status: string };
type Meeting = { id: string; meeting_date: string; title: string | null; kind: string };

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

export default async function StaffWeekHome() {
  const term = await first<Term>("SELECT id,name,start_date,end_date,status FROM terms ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,start_date DESC LIMIT 1");
  if (!term) return <main className="manage-content"><section className="week-empty"><span>W</span><h1>준비된 일정이 없습니다.</h1><p>관리자가 학기와 모임 일정을 설정하면 주차별 안내가 여기에 표시됩니다.</p></section></main>;
  const meetings = await all<Meeting>("SELECT id,meeting_date,title,kind FROM meetings WHERE term_id=? AND kind<>'break' ORDER BY meeting_date", [term.id]);
  const today = new Date().toISOString().slice(0, 10); const nextId = meetings.find((meeting) => meeting.meeting_date >= today)?.id;
  return <main className="manage-content week-home"><header className="week-home-head"><div><p className="manage-eyebrow">WEEKLY WORSHIP GUIDE</p><h1>이번 학기<br />주차별 안내</h1><p>참여할 주차를 선택하면 출결, 모임 가이드와 주일 등단표를 한곳에서 확인할 수 있습니다.</p></div><aside><span>{term.status === "active" ? "진행 중" : "종료"}</span><b>{term.name}</b><small>{term.start_date} — {term.end_date}</small></aside></header>
    {!meetings.length ? <section className="week-empty"><h2>등록된 모임이 없습니다.</h2><p>모임 일정이 추가되면 주차 카드가 자동으로 생성됩니다.</p></section> : <section className="week-library" aria-labelledby="week-list-title"><div className="manage-section-head"><div><p>모임 주차</p><h2 id="week-list-title">어느 주차를 확인할까요?</h2></div><span>{meetings.length}개 주차</span></div><div className="week-card-grid">{meetings.map((meeting, index) => <Link className={`week-card${meeting.id === nextId ? " current" : ""}`} href={`/manage/weeks/${meeting.id}`} key={meeting.id}><div className="week-card-top"><span>{String(index + 1).padStart(2, "0")}</span>{meeting.id === nextId && <b>다가오는 모임</b>}</div><h2>{index + 1}주차</h2><p>{dateLabel(meeting.meeting_date)} · 토요일</p><small>{meeting.title || "찬양팀 토요모임"}</small><i>주차 안내 보기 →</i></Link>)}</div></section>}
  </main>;
}
