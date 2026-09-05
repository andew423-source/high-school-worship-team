import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { requireViewer } from "@/lib/auth";
import { destinationForProfile } from "@/lib/roles";

export const metadata = { title: "접근 승인" };

export default async function PendingPage() {
  const viewer = await requireViewer();
  if (viewer.profile?.status === "ACTIVE") redirect(destinationForProfile(viewer.profile));
  const disabled = viewer.profile?.status === "DISABLED";

  return (
    <main className="pending-shell">
      <section className="pending-card">
        <Brand />
        <h1>{disabled ? "접근이 중지되었어요." : "승인을 기다리고 있어요."}</h1>
        <p>{disabled
          ? "운영자에게 접근 상태를 확인해주세요. 중지된 계정에는 운영 데이터가 제공되지 않습니다."
          : "Google 계정 확인이 끝났습니다. 운영자가 스탭 명단과 계정을 연결하면 바로 주차별 안내를 이용할 수 있어요."}</p>
        <div className="account-box"><span>확인된 계정</span><strong>{viewer.user.email}</strong></div>
        <form action="/auth/logout" method="post">
          <button className="button button-secondary" type="submit">다른 계정으로 로그인</button>
        </form>
      </section>
    </main>
  );
}
