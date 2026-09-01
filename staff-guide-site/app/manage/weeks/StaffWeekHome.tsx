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
  return <main className="manage-content week-home"><header className="week-compact-head"><div><p className="manage-eyebrow">WEEKLY WORSHIP GUIDE</p><h1>주차별 안내</h1></div><p><b>{term.name}</b><span>{meetings.length}개 주차</span></p></header>
    {!meetings.length ? <section className="week-empty"><h2>등록된 모임이 없습니다.</h2><p>모임 일정이 추가되면 주차 목록이 자동으로 생성됩니다.</p></section> : <section className="week-list" aria-label="모임 주차 목록">{meetings.map((meeting, index) => <Link className={`week-list-row${meeting.id === nextId ? " current" : ""}`} href={`/manage/weeks/${meeting.id}`} key={meeting.id}><span className="week-list-number">{String(index + 1).padStart(2, "0")}</span><b>{index + 1}주차</b><time dateTime={meeting.meeting_date}>{dateLabel(meeting.meeting_date)}</time><span className="week-list-title">{meeting.title || "찬양팀 모임"}</span>{meeting.id === nextId && <em>다가오는 모임</em>}<i aria-hidden="true">→</i></Link>)}</section>}
  </main>;
}
