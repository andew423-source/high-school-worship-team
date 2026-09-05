import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "운영 센터" };

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const [{ count }, { count: termCount }] = await Promise.all([
    supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    supabase.from("terms").select("id", { count: "exact", head: true }),
  ]);
  return (
    <main className="page-shell">
      <div className="page-heading"><div><div className="eyebrow">ADMIN CENTER</div><h1>운영할 항목을<br />선택하세요.</h1><p>학기를 만든 뒤 학생·스탭 명단과 모임 일정을 순서대로 준비할 수 있습니다.</p></div></div>
      <section className="dashboard-grid">
        <Link className="dashboard-card active" href="/admin/access">
          <div><span className="badge badge-pending">지금 사용 가능</span><div className="card-number">{count ?? 0}</div><strong>대기 중인 승인</strong><p>Google 계정을 스탭 DB와 연결하고 접근을 승인합니다.</p></div><span className="card-link">스탭 승인 열기 →</span>
        </Link>
        <Link className="dashboard-card" href="/admin/terms"><div><span className="badge">사용 가능</span><div className="card-number">{termCount ?? 0}</div><strong>학기·명단</strong><p>토요모임 일정과 학생·스탭 DB를 준비합니다.</p></div><span className="card-link">학기 관리 열기 →</span></Link>
        <Link className="dashboard-card" href="/admin/terms"><div><span className="badge">사용 가능</span><h2>조·출결·등단</h2><p>학기를 연 뒤 조 편성, 출결, 주일 등단을 순서대로 관리합니다.</p></div><span className="card-link">학기에서 시작하기 →</span></Link>
      </section>
    </main>
  );
}
