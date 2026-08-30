import { first } from "../../db/runtime";

export const dynamic = "force-dynamic";

const areas = [
  { href: "/manage/people", label: "인원 DB", value: "등록 준비", tone: "mint" },
  { href: "/manage/groups", label: "조 편성", value: "새 학기 설정", tone: "blue" },
  { href: "/manage/attendance", label: "이번 주 출결", value: "모임 일정 생성", tone: "amber" },
  { href: "/manage/stage", label: "주일 등단", value: "출결 확정 후", tone: "violet" },
];

export default async function ManageHome() {
  const [studentCount, staffCount, activeTerm, nextMeeting] = await Promise.all([
    first<{ count: number }>("SELECT COUNT(*) count FROM students WHERE active=1"), first<{ count: number }>("SELECT COUNT(*) count FROM staff WHERE active=1"),
    first<{ name: string }>("SELECT name FROM terms WHERE status='active' ORDER BY start_date DESC LIMIT 1"), first<{ meeting_date: string }>("SELECT meeting_date FROM meetings WHERE kind<>'break' AND meeting_date>=date('now') ORDER BY meeting_date LIMIT 1"),
  ]);
  const completed = Number((studentCount?.count ?? 0) > 0) + Number(Boolean(activeTerm));

  return (
    <main className="manage-page">
      <section className="manage-hero">
        <div>
          <p className="manage-eyebrow">2026년 2학기 운영 준비</p>
          <h1>이번 학기 찬양팀 운영을<br />한 흐름으로 준비하세요.</h1>
          <p>인원 등록부터 조 편성, 토요 출결, 주일 등단까지 이어집니다.</p>
        </div>
        <a className="manage-primary" href="/manage/people">인원 DB 시작하기 <span>→</span></a>
      </section>

      <section className="manage-area" aria-labelledby="manage-progress-title">
        <div className="manage-section-head">
          <div><p>운영 단계</p><h2 id="manage-progress-title">지금 준비할 일</h2></div>
          <span>{completed} / 4 완료</span>
        </div>
        <div className="manage-cards">
          {areas.map((area, index) => (
            <a className={`manage-card ${area.tone}`} href={area.href} key={area.href}>
              <span className="manage-card-number">0{index + 1}</span>
              <div><h3>{area.label}</h3><p>{area.value}</p></div>
              <b>→</b>
            </a>
          ))}
        </div>
      </section>

      <section className="manage-summary">
        <article><p>등록 인원</p><strong>{Number(studentCount?.count ?? 0) + Number(staffCount?.count ?? 0)}명</strong><span>학생 {studentCount?.count ?? 0} · 스탭 {staffCount?.count ?? 0}</span></article>
        <article><p>활성 학기</p><strong>{activeTerm?.name ?? "미설정"}</strong><span>기간과 휴강일을 관리하세요</span></article>
        <article><p>다가오는 모임</p><strong>{nextMeeting?.meeting_date ?? "—"}</strong><span>토요모임 일정</span></article>
      </section>
    </main>
  );
}
