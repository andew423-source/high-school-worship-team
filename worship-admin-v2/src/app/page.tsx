import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { destinationForProfile } from "@/lib/roles";

export default async function Home({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const authCode = Array.isArray(query.code) ? query.code[0] : query.code;

  // Supabase falls back to Site URL when /auth/callback is missing from its
  // redirect allow list. Continue the PKCE exchange instead of stranding users.
  if (authCode) redirect(`/auth/callback?code=${encodeURIComponent(authCode)}`);

  const viewer = await getViewer();
  const destination = viewer?.profile ? destinationForProfile(viewer.profile) : null;

  return (
    <main className="landing-shell">
      <header className="landing-header wrap">
        <Brand />
        <span className="header-note">내부 운영 도구</span>
      </header>

      <section className="landing-hero wrap">
        <div className="eyebrow">WORSHIP TEAM OPERATIONS</div>
        <h1>한 주의 준비를<br />한곳에서 이어가요.</h1>
        <p className="hero-copy">
          조 편성부터 토요모임 출결, 주일 등단표까지. 필요한 사람만
          안전하게 연결되는 찬양팀 운영 공간입니다.
        </p>

        <div className="hero-actions">
          {destination ? (
            <Link className="button button-primary" href={destination}>
              내 화면으로 계속하기 <span aria-hidden>→</span>
            </Link>
          ) : isSupabaseConfigured ? (
            <Link className="button button-primary" href="/auth/login">
              <GoogleMark /> Google 계정으로 시작하기
            </Link>
          ) : (
            <div className="setup-notice" role="status">
              <strong>화면 구현이 준비되었습니다.</strong>
              <span>실제 로그인을 사용하려면 Supabase 환경 변수를 연결해주세요.</span>
            </div>
          )}
        </div>

        <p className="privacy-note">승인된 운영자와 조 담당 스탭만 내부 정보를 볼 수 있습니다.</p>
      </section>

      <section className="process-section">
        <div className="wrap process-grid">
          <div>
            <div className="eyebrow">ACCESS FLOW</div>
            <h2>처음 한 번만 확인해요.</h2>
          </div>
          <ol className="steps">
            <li><span>01</span><div><strong>Google 계정 확인</strong><p>공유받은 링크에서 본인의 계정으로 접속합니다.</p></div></li>
            <li><span>02</span><div><strong>운영자 승인</strong><p>운영자가 스탭 명단과 계정을 안전하게 연결합니다.</p></div></li>
            <li><span>03</span><div><strong>역할별 화면 시작</strong><p>운영자는 운영 센터로, 조 담당 스탭은 주차 안내로 이동합니다.</p></div></li>
          </ol>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.4c2-1.8 3.1-4.5 3.1-7.7Z" />
      <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.7c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.8A10.4 10.4 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.2 13.5a6.2 6.2 0 0 1 0-3.9V6.8H2.7a10.4 10.4 0 0 0 0 9.5l3.5-2.8Z" />
      <path fill="#EA4335" d="M12 5.3c1.5 0 2.9.5 4 1.6l3-3A10 10 0 0 0 2.7 6.8l3.5 2.8C7 7.1 9.3 5.3 12 5.3Z" />
    </svg>
  );
}
