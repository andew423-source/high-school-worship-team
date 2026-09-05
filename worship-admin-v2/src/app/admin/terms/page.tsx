import Link from "next/link";
import { TermCreateForm } from "@/components/term-create-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "학기 관리" };

export default async function TermsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: terms, error } = await supabase.from("terms")
    .select("id,name,start_date,end_date,status,late_counts_as_present,created_at,meetings(count),term_students(count)")
    .order("start_date", { ascending: false });

  return <main className="page-shell">
    <div className="page-heading"><div><div className="eyebrow">TERMS & ROSTERS</div><h1>학기 관리</h1><p>기간을 입력하면 해당 기간의 토요일 모임이 자동으로 생성됩니다. 활성 학기는 조 담당 스탭의 주차 홈에 표시됩니다.</p></div></div>
    {error ? <div className="setup-notice"><strong>2단계 DB 연결이 필요합니다.</strong><span>Supabase에서 두 번째 마이그레이션을 실행한 뒤 새로고침해주세요.</span></div> : null}
    <section className="manager-grid term-grid"><div className="panel"><h2>새 학기</h2><TermCreateForm /></div>
      <div className="list-stack">{(terms ?? []).map((term) => <Link className="term-card" href={`/admin/terms/${term.id}`} key={term.id}>
        <div><span className={`badge ${term.status === "ACTIVE" ? "" : term.status === "ARCHIVED" ? "badge-disabled" : "badge-pending"}`}>{term.status === "ACTIVE" ? "진행 중" : term.status === "DRAFT" ? "초안" : "보관"}</span><h2>{term.name}</h2><p>{term.start_date} — {term.end_date}</p></div>
        <div className="term-card-meta"><span><b>{term.meetings?.[0]?.count ?? 0}</b>회 모임</span><span><b>{term.term_students?.[0]?.count ?? 0}</b>명 학생</span><strong>열기 →</strong></div>
      </Link>)}{!error && !(terms ?? []).length ? <div className="panel empty-state"><strong>아직 학기가 없어요.</strong>왼쪽 양식에서 첫 학기를 만들어주세요.</div> : null}</div>
    </section>
  </main>;
}
