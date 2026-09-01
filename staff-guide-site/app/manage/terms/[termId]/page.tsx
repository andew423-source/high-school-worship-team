import Link from "next/link";
import { first } from "../../../../db/runtime";
import { requireAuthorizedUser } from "../../../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
type TermSummary = { id: string; name: string; start_date: string; end_date: string; status: string; student_count: number; meeting_count: number; group_count: number };
export default async function TermHub({ params }: { params: Promise<{ termId: string }> }) {
  const [{ termId }, user] = await Promise.all([params, requireAuthorizedUser("/manage")]);
  if (user.role !== "admin") redirect("/manage");
  const term = await first<TermSummary>(`SELECT t.*,(SELECT COUNT(*) FROM term_students ts WHERE ts.term_id=t.id AND ts.active=1) student_count,(SELECT COUNT(*) FROM meetings m WHERE m.term_id=t.id AND m.kind<>'break') meeting_count,(SELECT COUNT(*) FROM groups g WHERE g.term_id=t.id) group_count FROM terms t WHERE t.id=?`, [termId]);
  if (!term) return <main className="manage-content"><div className="term-empty"><h1>학기를 찾을 수 없습니다.</h1><Link className="manage-button primary" href="/manage">학기 홈으로</Link></div></main>;
  const query = `?termId=${encodeURIComponent(term.id)}`;
  const features = [{ href: `/manage/people${query}`, number: "01", label: "인원 DB", detail: `${term.student_count}명 등록`, tone: "blue", admin: false }, { href: `/manage/groups${query}`, number: "02", label: "조 편성", detail: term.group_count ? `${term.group_count}개 조` : "편성 전", tone: "amber", admin: true }, { href: `/manage/terms/${term.id}/schedule`, number: "03", label: "모임 일정", detail: `${term.meeting_count}회 예정`, tone: "mint", admin: true }, { href: `/manage/attendance${query}`, number: "04", label: "출결", detail: "토요모임 기록", tone: "violet", admin: false }, { href: `/manage/stage${query}`, number: "05", label: "등단", detail: "주일 등단 배정", tone: "mint", admin: true }].filter((feature) => !feature.admin || user.role === "admin");
  return <main className="manage-content term-hub"><Link className="term-back" href="/manage">← 학기 선택</Link><header className="term-hub-head"><div><span className={`term-status ${term.status}`}>{term.status === "active" ? "진행 중" : "종료"}</span><h1>{term.name}</h1><p>{term.start_date} — {term.end_date}</p></div>{user.role === "admin" && <Link className="manage-button" href={`/manage?edit=${term.id}`}>학기 정보 수정</Link>}</header><section><div className="manage-section-head"><div><p>운영 메뉴</p><h2>무엇을 관리할까요?</h2></div></div><div className="manage-cards term-feature-grid">{features.map((feature) => <Link className={`manage-card ${feature.tone}`} href={feature.href} key={feature.href}><span className="manage-card-number">{feature.number}</span><div><h3>{feature.label}</h3><p>{feature.detail}</p></div><b>→</b></Link>)}</div></section></main>;
}
