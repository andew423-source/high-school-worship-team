import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceManager } from "@/components/attendance-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminAttendancePage({ params, searchParams }: { params: Promise<{ termId: string }>; searchParams: Promise<{ groupId?: string }> }) {
  const { termId } = await params; const { groupId } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: term } = await supabase.from("terms").select("id,name").eq("id", termId).maybeSingle();
  if (!term) notFound();
  return <main className="page-shell stage-wide"><Link className="back-link" href={`/admin/terms/${termId}`}>← 학기 개요</Link><div className="page-heading"><div><div className="eyebrow">ATTENDANCE</div><h1>학기 출결</h1><p>{term.name} 전체 토요모임 출결을 조별로 관리합니다.</p></div></div><AttendanceManager termId={termId} initialGroupId={groupId} /></main>;
}
