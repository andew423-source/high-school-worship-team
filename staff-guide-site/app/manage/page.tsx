import { first } from "../../db/runtime";

export const dynamic = "force-dynamic";

const areas = [
  { href: "/manage/terms", label: "학기 설정", value: "기간·모임일 생성", tone: "mint" },
  { href: "/manage/people", label: "인원 DB", value: "학기별 명단 등록", tone: "blue" },
  { href: "/manage/groups", label: "조 편성", value: "명단 등록 후", tone: "amber" },
  { href: "/manage/attendance", label: "이번 주 출결", value: "조 편성 확정 후", tone: "violet" },
  { href: "/manage/stage", label: "주일 등단", value: "출결 확정 후", tone: "mint" },
];

export default async function ManageHome() {
  const [studentCount, staffCount, activeTerm, nextMeeting] = await Promise.all([
    first<{ count: number }>("SELECT COUNT(*) count FROM term_students WHERE active=1 AND term_id=(SELECT id FROM terms WHERE status='active' ORDER BY start_date DESC LIMIT 1)"), first<{ count: number }>("SELECT COUNT(*) count FROM staff WHERE active=1"),
    first<{ name: string }>("SELECT name FROM terms WHERE status='active' ORDER BY start_date DESC LIMIT 1"), first<{ meeting_date: string }>("SELECT meeting_date FROM meetings WHERE kind<>'break' AND meeting_date>=date('now') ORDER BY meeting_date LIMIT 1"),
  ]);
  const completed = Number(Boolean(activeTerm)) + Number((studentCount?.count ?? 0) > 0);

  return (
    <main className="manage-page">
      <section className="manage-hero">
        <div>
          <p className="manage-eyebrow">2026년 2학기 운영 준비</p>
          <h1>이번 학기 찬양팀 운영을<br />한 흐름으로 준비하세요.</h1>
          <p>인원 등록부터 조 편성, 토요 출결, 주일 등단까지 이어집니다.</p>
        </div>
        <a className="manage-primary" href={activeTerm ? "/manage/people" : "/manage/terms"}>{activeTerm ? "학기 명단 등록하기" : "학기 설정부터 시작하기"} <span>→</span></a>
      </section>

      <section className="manage-area" aria-labelledby="manage-progress-title">
        <div className="manage-section-head">
          <div><p>운영 단계</p><h2 id="manage-progress-title">지금 준비할 일</h2></div>
          <span>{completed} / 5 완료</span>
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
        <article><p>활성 학기 인원</p><strong>{Number(studentCount?.count ?? 0) + Number(staffCount?.count ?? 0)}명</strong><span>학생 {studentCount?.count ?? 0} · 공통 스탭 {staffCount?.count ?? 0}</span></article>
        <article><p>활성 학기</p><strong>{activeTerm?.name ?? "미설정"}</strong><span>기간과 휴강일을 관리하세요</span></article>
        <article><p>다가오는 모임</p><strong>{nextMeeting?.meeting_date ?? "—"}</strong><span>토요모임 일정</span></article>
      </section>
    </main>
  );
}
