import Link from "next/link";
import { Brand } from "@/components/brand";

export function AppHeader({ mode }: { mode: "admin" | "staff" }) {
  return (
    <header className="app-header">
      <div className="wrap app-header-inner">
        <Brand href={mode === "admin" ? "/admin" : "/weeks"} />
        <nav className="app-nav" aria-label="주요 메뉴">
          {mode === "admin" ? (
            <><Link href="/admin">운영 센터</Link><Link href="/admin/terms">학기·명단</Link><Link href="/admin/access">스탭 승인</Link></>
          ) : <Link href="/weeks">주차별 안내</Link>}
          <form action="/auth/logout" method="post">
            <button className="plain-button" type="submit">로그아웃</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
