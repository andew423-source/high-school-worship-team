import { AccessRequestList, type AccessRequestItem, type StaffOption } from "@/components/access-request-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "스탭 승인" };

export default async function AccessPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: requests }, { data: staff }] = await Promise.all([
    supabase.from("access_requests")
      .select("id,user_id,status,requested_at,updated_at")
      .order("requested_at", { ascending: true }),
    supabase.from("staff").select("id,name,email").eq("active", true).order("name"),
  ]);

  const userIds = (requests ?? []).map((request) => request.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id,email,display_name,staff_id,status").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const items: AccessRequestItem[] = (requests ?? []).map((request) => {
    const profile = profileById.get(request.user_id);
    return {
      id: request.id,
      status: request.status,
      requestedAt: request.requested_at,
      updatedAt: request.updated_at,
      email: profile?.email ?? "알 수 없는 계정",
      displayName: profile?.display_name ?? null,
      staffId: profile?.staff_id ?? null,
    };
  });

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div><div className="eyebrow">STAFF ACCESS</div><h1>스탭 승인</h1><p>요청 계정을 실제 스탭과 연결해야 승인할 수 있습니다. 연결된 계정 하나만 해당 스탭의 권한을 사용합니다.</p></div>
      </div>
      <section className="panel">
        <AccessRequestList requests={items} staff={(staff ?? []) as StaffOption[]} />
      </section>
    </main>
  );
}
