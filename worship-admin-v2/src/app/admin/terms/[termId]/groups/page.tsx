import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupingManager } from "@/components/grouping-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GroupsPage({ params }: { params: Promise<{ termId: string }> }) {
  const { termId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: term } = await supabase.from("terms").select("id,name").eq("id", termId).maybeSingle();
  if (!term) notFound();
  return <main className="page-shell stage-wide"><Link className="back-link" href={`/admin/terms/${termId}`}>← 학기 개요</Link><div className="page-heading"><div><div className="eyebrow">GROUPING</div><h1>조 편성</h1><p>{term.name} 학생을 조건에 따라 자동 편성하고, 담당 스탭을 직접 지정한 뒤 확정합니다.</p></div></div><GroupingManager termId={termId} /></main>;
}
