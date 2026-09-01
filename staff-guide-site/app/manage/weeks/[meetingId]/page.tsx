import Link from "next/link";
import { first } from "../../../../db/runtime";
import { requireAuthorizedUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
type Meeting = { id: string; term_id: string; meeting_date: string; title: string | null; term_name: string; week_number: number };

function dateLabel(value: string) { const date = new Date(`${value}T00:00:00Z`); return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 토요일`; }

export default async function WeekDetail({ params }: { params: Promise<{ meetingId: string }> }) {
  const [{ meetingId }, user] = await Promise.all([params, requireAuthorizedUser("/manage")]);
  const meeting = await first<Meeting>(`SELECT m.id,m.term_id,m.meeting_date,m.title,t.name term_name,(SELECT COUNT(*) FROM meetings counted WHERE counted.term_id=m.term_id AND counted.kind<>'break' AND counted.meeting_date<=m.meeting_date) week_number FROM meetings m JOIN terms t ON t.id=m.term_id WHERE m.id=? AND m.kind<>'break'`, [meetingId]);
  if (!meeting) return <main className="manage-content"><section className="week-empty"><h1>주차를 찾을 수 없습니다.</h1><Link className="manage-button primary" href="/manage">주차 홈으로</Link></section></main>;
  const attendanceHref = `/manage/attendance?termId=${encodeURIComponent(meeting.term_id)}&meetingId=${encodeURIComponent(meeting.id)}`;
  const items = [
    { number: "01", label: "출결", detail: user.role === "staff" ? "담당 조 연결 후 사용할 수 있어요" : "담당 조 학생의 출석을 기록해요", href: attendanceHref, tone: "violet", disabled: user.role === "staff" },
    { number: "02", label: "모임 가이드", detail: "모임 순서와 안내는 추후 업데이트 예정", href: `/manage/weeks/${meeting.id}/guide`, tone: "amber", disabled: false },
    { number: "03", label: "등단표", detail: "이번 주 1·2부 등단 위치를 확인해요", href: `/manage/weeks/${meeting.id}/stage`, tone: "mint", disabled: false },
  ];
  return <main className="manage-content week-detail"><Link className="term-back" href="/manage">← 전체 주차</Link><header className="week-detail-head"><div><p>{meeting.term_name}</p><h1>{meeting.week_number}주차</h1><span>{dateLabel(meeting.meeting_date)}</span></div><b>{String(meeting.week_number).padStart(2, "0")}</b></header><section><div className="manage-section-head"><div><p>이번 주 운영</p><h2>필요한 항목을 선택하세요.</h2></div></div><div className="week-action-grid">{items.map((item) => item.disabled ? <div className={`week-action-card ${item.tone} disabled`} aria-disabled="true" key={item.label}><span>{item.number}</span><div><h2>{item.label}</h2><p>{item.detail}</p></div><b>권한 필요</b></div> : <Link className={`week-action-card ${item.tone}`} href={item.href} key={item.label}><span>{item.number}</span><div><h2>{item.label}</h2><p>{item.detail}</p></div><b>열기 →</b></Link>)}</div></section></main>;
}
