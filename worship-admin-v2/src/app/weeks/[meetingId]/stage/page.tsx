import Link from "next/link";
import { notFound } from "next/navigation";
import { StageManager } from "@/components/stage-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WeekStagePage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params; const supabase = await createSupabaseServerClient();
  const { data: meeting } = await supabase.from("meetings").select("id,meeting_date,title").eq("id", meetingId).maybeSingle(); if (!meeting) notFound();
  return <main className="page-shell stage-wide"><Link className="back-link" href={`/weeks/${meetingId}`}>← 주차 메뉴</Link><div className="page-heading"><div><div className="eyebrow">STAGE PLANNER</div><h1>등단 편성</h1><p>{meeting.meeting_date} 토요 출결을 기준으로 다음 날 주일 등단표를 만듭니다.</p></div></div><StageManager meetingId={meetingId} /></main>;
}
