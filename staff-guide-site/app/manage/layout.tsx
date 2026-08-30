import type { ReactNode } from "react";
import Link from "next/link";
import { requireAuthorizedUser } from "../../lib/auth";
import "./manage.css";

export const dynamic = "force-dynamic";
const links = [["/manage", "대시보드"], ["/manage/people", "인원 DB"], ["/manage/terms", "학기·일정"], ["/manage/groups", "조 편성"], ["/manage/attendance", "출결"], ["/manage/stage", "등단"]];
const roleName = { admin: "관리자", group_staff: "조 담당 스탭", staff: "일반 스탭" };

export default async function ManageLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthorizedUser("/manage");
  return <div className="manage-page">
    <header className="manage-topbar">
      <Link className="manage-brand" href="/"><span>W</span><div><b>고등부 찬양팀</b><small>운영 센터</small></div></Link>
      <nav className="manage-nav" aria-label="운영 메뉴">{links.map(([href, label]) => <a href={href} key={href}>{label}</a>)}</nav>
      <div className="manage-user"><span>{user.displayName.slice(0, 1)}</span><p><b>{user.displayName}</b><small>{roleName[user.role]}</small></p></div>
    </header>
    {children}
    <nav className="manage-mobile-nav" aria-label="모바일 운영 메뉴">{links.slice(1).map(([href, label]) => <a href={href} key={href}>{label}</a>)}</nav>
  </div>;
}
