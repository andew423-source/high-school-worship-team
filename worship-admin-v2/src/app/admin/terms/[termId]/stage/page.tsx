import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StageManager } from "@/components/stage-manager";
import { StageWeekSelect } from "@/components/stage-week-select";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminStagePage({ params, searchParams }: { params: Promise<{ termId: string }>; searchParams: Promise<{ meetingId?: string }> }) {
  const { termId } = await params; const { meetingId } = await searchParams; const supabase = await createSupabaseServerClient();
  const { data: term } = await supabase.from("terms").select("id,name").eq("id", termId).maybeSingle(); if (!term) notFound();
  const { data: meetings } = await supabase.from("meetings").select("id,sequence,meeting_date,title").eq("term_id", termId).order("meeting_date");
  const selected = meetingId && meetings?.some((item) => item.id === meetingId) ? meetingId : meetings?.[0]?.id;
  if (!selected) redirect(`/admin/terms/${termId}`);
  return <main className="page-shell stage-wide"><Link className="back-link" href={`/admin/terms/${termId}`}>← 학기 개요</Link><div className="page-heading stage-heading"><div><div className="eyebrow">STAGE PLANNER</div><h1>등단 편성</h1><p>{term.name} 토요 출결과 이전 확정본을 기준으로 자동 배정합니다.</p><Link href={`/admin/terms/${termId}/stage-history`}>학생별 등단 내역표 →</Link></div><StageWeekSelect meetings={meetings ?? []} selected={selected} adminTermId={termId} /></div><StageManager key={selected} meetingId={selected} /></main>;
}
