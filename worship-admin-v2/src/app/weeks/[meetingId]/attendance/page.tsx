import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceManager } from "@/components/attendance-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WeekAttendancePage({ params, searchParams }: { params: Promise<{ meetingId: string }>; searchParams: Promise<{ groupId?: string }> }) {
  const { meetingId } = await params; const { groupId } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: meeting } = await supabase.from("meetings").select("id,term_id,meeting_date,title").eq("id", meetingId).maybeSingle();
  if (!meeting) notFound();
  return <main className="page-shell stage-wide"><Link className="back-link" href={`/weeks/${meetingId}`}>← 주차 메뉴</Link><div className="page-heading"><div><div className="eyebrow">GROUP ATTENDANCE</div><h1>조별 출결</h1><p>선택한 주차를 강조해 표시하며 이전·이후 모임 기록도 함께 확인할 수 있습니다.</p></div></div><AttendanceManager termId={meeting.term_id} initialGroupId={groupId} focusedMeetingId={meetingId} /></main>;
}
