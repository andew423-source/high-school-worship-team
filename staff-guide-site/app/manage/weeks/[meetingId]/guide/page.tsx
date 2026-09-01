import Link from "next/link";
import { first } from "../../../../../db/runtime";
import { requireAuthorizedUser } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function MeetingGuide({ params }: { params: Promise<{ meetingId: string }> }) {
  const [{ meetingId }] = await Promise.all([params, requireAuthorizedUser("/manage")]);
  const meeting = await first<{ meeting_date: string; week_number: number }>(`SELECT m.meeting_date,(SELECT COUNT(*) FROM meetings counted WHERE counted.term_id=m.term_id AND counted.kind<>'break' AND counted.meeting_date<=m.meeting_date) week_number FROM meetings m WHERE m.id=?`, [meetingId]);
  return <main className="manage-content"><Link className="term-back" href={`/manage/weeks/${meetingId}`}>← 주차 메뉴</Link><section className="guide-placeholder"><span>COMING SOON</span><p>{meeting ? `${meeting.week_number}주차 · ${Number(meeting.meeting_date.slice(5, 7))}월 ${Number(meeting.meeting_date.slice(8, 10))}일` : "모임 가이드"}</p><h1>모임 가이드를<br />준비하고 있어요.</h1><p>모임 순서, 준비물과 스탭별 역할을 이곳에 정리할 예정입니다.</p></section></main>;
}
