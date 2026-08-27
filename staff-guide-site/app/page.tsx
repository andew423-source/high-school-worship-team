const rooms = [
  { room: "607호", lead: "김기윤", kind: "싱어", people: [{ name: "신효린" }, { name: "홍재나" }, { name: "길하진", mark: "new" }, { name: "소예은" }, { name: "이예원" }, { name: "강민채" }] },
  { room: "610호", lead: "황지현", kind: "싱어", people: [{ name: "김예빛나래" }, { name: "원은서" }, { name: "배성재", mark: "new" }, { name: "전하준" }, { name: "진율", mark: "retreat" }, { name: "이예담" }] },
  { room: "706호", lead: "이지윤", kind: "싱어", people: [{ name: "정수아", mark: "new" }, { name: "김강현" }, { name: "정예준", mark: "new" }, { name: "권영민" }, { name: "박은후" }] },
  { room: "707호", lead: "박준규", kind: "싱어", people: [{ name: "손희준" }, { name: "이하영" }, { name: "박해민", mark: "retreat" }, { name: "지예환" }, { name: "김윤석" }] },
  { room: "611호", lead: "황현민", kind: "세션 전용", people: [{ name: "임시연" }, { name: "조수민" }, { name: "신은결" }, { name: "김단아" }, { name: "이준영" }, { name: "심사랑" }, { name: "문건오" }, { name: "최환희" }] },
];

const groupingRounds = [
  {
    round: "1라운드",
    question: "쉬는 날, 딱 3시간이 생기면 가장 끌리는 계획은?",
    options: ["🎧 플레이리스트·콘텐츠 정주행", "🍕 맛있는 것 먹으러 가기", "🏃 밖으로 나가 몸쓰기", "🛋️ 아무 계획 없이 충전"],
  },
  {
    round: "2라운드",
    question: "찬양 한 곡을 함께 완성할 때 먼저 맡아보고 싶은 역할은?",
    options: ["🎤 분위기를 열기", "🥁 리듬과 박자 지키기", "🎹 화음과 소리 채우기", "🎛️ 흐름과 준비 챙기기"],
  },
  {
    round: "3라운드",
    question: "팀에서 지금 가장 듣고 싶은 응원 한마디는?",
    options: ["💡 네 아이디어 좋아", "🤝 네가 있어 든든해", "🌱 실수해도 괜찮아", "🚀 같이 해보자"],
  },
];

function SectionTitle({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{children}</h2>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="hero" id="top">
        <div className="hero-inner">
          <p className="kicker">고등부 찬양팀 · 첫 모임</p>
          <h1>면접 &amp; 나눔<br />스탭 운영 가이드</h1>
          <p className="hero-copy">학생들이 기다리거나 소외되지 않도록, 호출·면접·나눔이 한 흐름으로 이어지게 합니다.</p>
          <div className="hero-facts" aria-label="핵심 일정">
            <div><strong>11:30–12:30</strong><span>동시 진행</span></div>
            <div><strong>604호</strong><span>나눔마블·면접 대기실</span></div>
            <div><strong>5개 면접실</strong><span>순서대로 1명씩</span></div>
          </div>
        </div>
      </header>

      <nav className="jump-nav" aria-label="페이지 바로가기">
        <a href="#roles">역할</a>
        <a href="#flow">호출 흐름</a>
        <a href="#order">면접 순서</a>
        <a href="#interview">면접 가이드</a>
        <a href="#marble">나눔마블</a>
      </nav>

      <section className="notice">
        <strong>가장 중요한 원칙</strong>
        <p>모든 학생은 604호에서 나눔에 참여하며 면접을 기다립니다. 면접실 앞에서는 대기하지 않고, 면접을 마치면 반드시 604호로 돌아와 현재 나눔에 다시 합류합니다.</p>
      </section>

      <section className="content" id="roles">
        <SectionTitle eyebrow="01 · WHO">누가 무엇을 하나요?</SectionTitle>
        <div className="role-grid">
          <article className="role-card interview-card">
            <div className="role-icon">🎙️</div>
            <p className="role-label">면접 진행</p>
            <h3>각 면접실 담당자</h3>
            <ul className="compact-list">
              <li><b>607호</b> 김기윤</li>
              <li><b>610호</b> 황지현</li>
              <li><b>611호</b> 황현민 <em>세션 전용</em></li>
              <li><b>706호</b> 이지윤</li>
              <li><b>707호</b> 박준규</li>
            </ul>
            <p className="role-note">기도 → 녹음 안내 → 질문 → 오디션 순서로 진행하고, 면접을 마친 학생에게 604호로 바로 복귀하도록 안내합니다.</p>
          </article>

          <article className="role-card helper-card">
            <div className="role-icon">🚶</div>
            <p className="role-label">면접 보조</p>
            <h3>온유한</h3>
            <ol className="number-list">
              <li><b>604호 앞에서 계속 대기</b>하며 면접을 마치고 돌아오는 학생을 확인합니다.</li>
              <li>학생이 복귀하면 배정표를 보고 같은 방의 <b>다음 학생 1명</b>을 604호에서 부릅니다.</li>
              <li>다음 학생에게 면접 방 번호를 알려주고, 필요하면 이동 경로까지 안내합니다.</li>
              <li>첫 면접 시작 때는 각 방의 1번 학생을 호출합니다. 이후에는 복귀할 때마다 같은 방식으로 반복합니다.</li>
            </ol>
          </article>

          <article className="role-card share-card">
            <div className="role-icon">🎲</div>
            <p className="role-label">604호 나눔 진행</p>
            <h3>이채희 · 허준혁</h3>
            <ol className="number-list">
              <li><b>나눔마블을 3라운드 동안 진행합니다.</b></li>
              <li>온유한의 호출을 받으면 현재 답변 뒤 학생을 보냅니다.</li>
              <li>면접에서 돌아온 학생은 현재 질문 뒤 자연스럽게 합류시킵니다.</li>
              <li>시간과 분위기를 보며 라운드를 유연하게 조절합니다.</li>
            </ol>
          </article>
        </div>
      </section>

      <section className="content flow-section" id="flow">
        <SectionTitle eyebrow="02 · FLOW">604호를 중심으로 움직이는 흐름</SectionTitle>
        <div className="flow-line">
          <div><span>1</span><b>604호 참여·대기</b><p>모든 학생이 나눔마블에<br />참여하며 순서를 기다림</p></div>
          <i>→</i>
          <div><span>2</span><b>온유한 호출</b><p>복귀자 확인 후<br />같은 방의 다음 1명 호출</p></div>
          <i>→</i>
          <div><span>3</span><b>면접실로 이동</b><p>방 번호·경로 안내 후<br />바로 이동하고 면접 진행</p></div>
          <i>→</i>
          <div><span>4</span><b>604호로 복귀</b><p>온유한 확인 → 다음 호출<br />복귀자는 나눔 재합류</p></div>
        </div>
        <div className="micro-rules">
          <p><b>대기 장소는 604호 한 곳.</b> 면접실 앞에서 기다리는 학생은 없습니다.</p>
          <p><b>호출 기준은 복귀 확인.</b> 한 학생이 돌아오면 같은 방의 다음 학생을 부릅니다.</p>
          <p><b>나눔은 계속 진행.</b> 호출된 학생만 빠지고, 복귀자는 현재 질문이 끝난 뒤 합류합니다.</p>
        </div>
      </section>

      <section className="content" id="order">
        <SectionTitle eyebrow="03 · ORDER">방별 면접 순서</SectionTitle>
        <p className="section-lead">위에서 아래 순서입니다. 학생이 면접을 마치고 604호 앞에 복귀하면, 같은 방의 다음 번호 학생을 호출합니다.</p>
        <div className="person-legend" aria-label="지원자 표시 안내">
          <span className="person-tag new-tag">신규</span><p>신규 지원자</p>
          <span className="person-tag retreat-tag">수련회팀</span><p>수련회 찬양팀만 참여</p>
        </div>
        <div className="room-grid">
          {rooms.map((room) => (
            <article className={`room-card ${room.kind === "세션 전용" ? "session-room" : ""}`} key={room.room}>
              <div className="room-head">
                <div><strong>{room.room}</strong><span>{room.kind}</span></div>
                <p>담당 · {room.lead}</p>
              </div>
              <ol>
                {room.people.map((person) => (
                  <li key={person.name}>
                    <span>{person.name}</span>
                    {person.mark === "new" && <em className="person-tag new-tag">신규</em>}
                    {person.mark === "retreat" && <em className="person-tag retreat-tag">수련회팀</em>}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="content interview-section" id="interview">
        <SectionTitle eyebrow="04 · INTERVIEW">면접 진행 가이드</SectionTitle>
        <div className="principle-band">
          <span>이번 학기 방향</span>
          <strong>역대하 20장 21–22절 · 영적 전쟁의 선봉에서 찬양하는 팀</strong>
          <p>잘하는 사람을 가려내는 시간이 아니라, 사역자로서 영적·기능적으로 준비하는 마음을 함께 확인하는 시간입니다.</p>
        </div>

        <div className="interview-grid">
          <article className="question-panel singer-panel">
            <div className="panel-heading"><span>🎤</span><div><p>SINGER</p><h3>싱어팀 질문 순서</h3></div></div>
            <ol className="question-list" start={0}>
              <li><b>기도하고 시작하기</b></li>
              <li><b>녹음 안내 후 시작하기</b><small>“면접 기록을 위해 녹음할게요.”라고 먼저 알려 주세요.</small></li>
              <li><b>찬양팀에 지원한 동기가 무엇인가요?</b></li>
              <li><b>찬양팀 사역에는 영적인 준비와 기능적인 준비가 모두 필요합니다. 두 영역에서 지금까지 어떻게 준비해 왔고, 앞으로 어떻게 준비하려 하나요?</b><small>영적 준비: 묵상·삶의 예배 등 / 기능적 준비: 가사 숙지·음정 파악 등<br />신규 지원자는 ‘지금까지 어떻게 준비했는지’ 부분을 생략합니다.</small></li>
              <li><b>이번 오디션을 준비하면서 특별히 받은 은혜나 하나님께서 주신 마음이 있나요?</b><small>가창력만 확인하는 오디션이 아니라, 한 곡을 영적·기능적으로 마음 다해 준비하는 경험임을 먼저 설명해 주세요.</small></li>
              <li><b>오디션 진행</b><small>MR을 틀고 V–C 한 바퀴 진행합니다.</small></li>
            </ol>
          </article>

          <article className="question-panel session-panel">
            <div className="panel-heading"><span>🎸</span><div><p>SESSION</p><h3>세션팀 질문 순서</h3></div></div>
            <ol className="question-list" start={0}>
              <li><b>기도하고 시작하기</b></li>
              <li><b>녹음 안내 후 시작하기</b><small>“면접 기록을 위해 녹음할게요.”라고 먼저 알려 주세요.</small></li>
              <li><b>찬양팀에 지원한 동기가 무엇인가요?</b></li>
              <li><b>찬양팀 사역이 단순한 무대나 공연이 되지 않으려면 어떻게 해야 할까요?</b></li>
              <li><b>찬양팀 사역에는 영적인 준비와 기능적인 준비가 모두 필요합니다. 두 영역에서 지금까지 어떻게 준비해 왔고, 앞으로 어떻게 준비하려 하나요?</b><small>영적 준비: 묵상·삶의 예배 등 / 기능적 준비: 악기·곡 준비 등<br />신규 지원자는 ‘지금까지 어떻게 준비했는지’ 부분을 생략합니다.</small></li>
              <li><b>악기로 하나님을 찬양한다는 것은 어떤 의미일까요? 사역하면서 그것을 어떻게 실천할 수 있을까요?</b></li>
              <li><b>오디션 진행</b><small>신규 지원자만 진행합니다. 기존 팀원은 생략합니다.</small></li>
            </ol>
          </article>
        </div>

        <div className="interview-tips">
          <h3>면접자가 기억할 것</h3>
          <ul>
            <li><b>싱어·세션 구분 없이</b> 1명당 5–8분 정도 진행합니다.</li>
            <li>학생의 답을 평가하거나 바로 가르치기보다, 먼저 충분히 듣습니다.</li>
            <li>답이 짧으면 “조금 더 이야기해 줄 수 있을까요?” 정도로 한 번만 질문합니다.</li>
            <li>시간이 밀리면 꼬리 질문을 줄이고 핵심 질문과 오디션을 우선합니다.</li>
          </ul>
        </div>
      </section>

      <section className="content marble-section" id="marble">
        <SectionTitle eyebrow="05 · NANUM MARBLE">604호 나눔마블 진행법</SectionTitle>
        <div className="round-summary">
          <div><strong>3</strong><span>사이클</span></div>
          <p>그룹핑 → 나눔마블을 세 번 반복합니다. 라운드당 약 20분이 기준이지만, 면접 진행 상황과 현장 분위기를 보고 유연하게 조절합니다.</p>
        </div>

        <div className="how-to-grid">
          <article><span>1</span><h3>그룹핑</h3><p>질문과 네 선택지를 읽고 선택지별 위치로 이동시킵니다.</p></article>
          <article><span>2</span><h3>인원 조정</h3><p>각 그룹을 6–8명으로 맞춥니다. 두 선택 사이에서 고민한 학생이나 자원자를 먼저 이동시킵니다.</p></article>
          <article><span>3</span><h3>게임 시작</h3><p>그룹마다 주사위 1개와 말 8개를 지급합니다.</p></article>
          <article><span>4</span><h3>게임 진행</h3><p>한 명이 주사위를 굴려 해당 칸으로 이동하고 먼저 답합니다. 이어 답을 듣고 싶은 사람 한 명을 지목하면, 지목받은 사람도 같은 질문에 답합니다. 답하지 못하면 자신의 말을 뒤로 한 칸 이동합니다.</p></article>
          <article><span>5</span><h3>교체와 복귀</h3><p>면접 호출 학생은 진행 중인 답변이 끝난 뒤 이동합니다. 복귀 학생은 현재 질문이 끝난 뒤 그룹에 합류합니다.</p></article>
        </div>

        <div className="game-rules">
          <p>🎯 지목은 정해진 순서 없이 <b>자유롭게</b></p>
          <p>↩️ 답하지 못하면 자신의 말을 <b>뒤로 한 칸</b></p>
          <p>🗣️ 같은 사람을 반복 지목하지 말고 <b>아직 적게 말한 학생</b>에게도 기회 주기</p>
          <p>🎲 완주보다 <b>다양하게 말하는 것</b>이 목표</p>
        </div>

        <div className="grouping-list">
          {groupingRounds.map((item) => (
            <details key={item.round} open={item.round === "1라운드"}>
              <summary><span>{item.round}</span>{item.question}</summary>
              <div className="options-grid">
                {item.options.map((option) => <p key={option}>{option}</p>)}
              </div>
              <small>한쪽에 몰리면 “두 개가 고민되는 친구는 사람이 적은 쪽으로 도와줄래?”라고 요청하고, 그래도 많으면 큰 그룹에서 자원자를 받습니다.</small>
            </details>
          ))}
        </div>
      </section>

      <section className="content rescue-section">
        <SectionTitle eyebrow="06 · IF">이럴 때는 이렇게</SectionTitle>
        <div className="rescue-grid">
          <article><b>면접이 밀릴 때</b><p>나눔 진행자는 3라운드를 급하게 끝내지 말고 현재 흐름을 유지합니다.</p></article>
          <article><b>한 그룹에서 여러 명이 빠질 때</b><p>4명 이하가 되면 가까운 그룹과 잠시 합쳐도 됩니다. 복귀자가 생기면 원래 그룹으로 돌아갑니다.</p></article>
          <article><b>게임이 조용할 때</b><p>진행자가 먼저 짧게 답을 보여주고 “한 문장만 말해도 괜찮아”라고 안내합니다.</p></article>
          <article><b>시간이 부족할 때</b><p>게임판 완주를 목표로 하지 않습니다. 현재 질문을 마무리하고 다음 그룹핑 또는 전체 마무리로 넘어갑니다.</p></article>
        </div>
      </section>

      <footer>
        <a href="#top">맨 위로 ↑</a>
        <p>고등부 찬양팀 첫 모임 · 스탭용 운영 가이드</p>
      </footer>
    </main>
  );
}
