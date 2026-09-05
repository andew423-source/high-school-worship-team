import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function GuidePage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: meetings } = await supabase.from("meetings").select("id,meeting_date,title,term_id").order("meeting_date");
  const meeting = meetings?.find((item) => item.id === meetingId);
  if (!meeting) notFound();
  const termMeetings = meetings?.filter((item) => item.term_id === meeting.term_id) ?? [];
  const week = termMeetings.findIndex((item) => item.id === meetingId) + 1;
  if (week !== 1) return <main className="page-shell"><Link className="back-link" href={`/weeks/${meetingId}`}>← 주차 메뉴</Link><section className="panel coming-panel"><div><span className="badge">{week}주차</span><h2>모임 가이드 준비 중</h2><p>이 주차의 가이드는 운영자가 추후 작성할 예정입니다.</p></div></section></main>;
  return <FirstMeetingGuide meetingId={meetingId} />;
}

function FirstMeetingGuide({ meetingId }: { meetingId: string }) {
  return <main className="page-shell guide-shell"><Link className="back-link" href={`/weeks/${meetingId}`}>← 1주차 메뉴</Link>
    <header className="guide-hero"><div className="eyebrow">고등부 찬양팀 · 첫 모임</div><h1>면접 & 나눔<br />스탭 운영 가이드</h1><p>학생들이 기다리거나 소외되지 않도록 호출·면접·나눔이 한 흐름으로 이어지게 합니다.</p><div className="guide-facts"><div><strong>11:30–12:30</strong><span>동시 진행</span></div><div><strong>604호</strong><span>나눔·면접 대기</span></div><div><strong>4개 면접실</strong><span>607·610·706·611호</span></div></div></header>
    <section className="guide-notice"><strong>가장 중요한 원칙</strong><p>모든 학생은 604호에서 나눔에 참여하며 면접을 기다립니다. 면접실 앞에서 대기하지 않고, 면접을 마치면 604호로 돌아와 현재 나눔에 다시 합류합니다.</p></section>
    <section className="guide-section"><div className="eyebrow">01 · FLOW</div><h2>604호를 중심으로 움직입니다.</h2><div className="guide-steps"><article><span>1</span><h3>604호 참여·대기</h3><p>나눔에 참여하며 순서를 기다립니다.</p></article><article><span>2</span><h3>보조 스탭 호출</h3><p>복귀 확인 후 같은 방의 다음 학생을 부릅니다.</p></article><article><span>3</span><h3>면접실 이동</h3><p>방 번호를 안내받고 바로 이동합니다.</p></article><article><span>4</span><h3>604호 복귀</h3><p>다음 호출 후 현재 나눔에 합류합니다.</p></article></div></section>
    <section className="guide-section"><div className="eyebrow">02 · INTERVIEW</div><h2>면접 진행 순서</h2><div className="guide-columns"><article><h3>싱어팀</h3><ol><li>기도와 녹음 안내</li><li>지원 동기</li><li>영적·기능적 준비</li><li>준비하며 받은 은혜</li><li>MR로 V–C 한 바퀴 오디션</li></ol></article><article><h3>세션팀</h3><ol><li>기도와 녹음 안내</li><li>지원 동기</li><li>무대나 공연이 되지 않으려면?</li><li>영적·기능적 준비</li><li>악기로 찬양한다는 의미</li><li>신규 지원자 오디션</li></ol></article></div></section>
    <section className="guide-section"><div className="eyebrow">03 · NANUM</div><h2>나눔마블 3라운드</h2><div className="guide-columns"><article><h3>진행 방법</h3><ol><li>질문 선택지별 위치로 그룹핑</li><li>그룹을 6–8명으로 조정</li><li>주사위를 굴리고 해당 질문에 답하기</li><li>답을 듣고 싶은 사람 한 명 지목</li></ol></article><article><h3>현장 원칙</h3><ul><li>호출된 학생만 답변 뒤 이동</li><li>복귀자는 현재 질문 뒤 합류</li><li>완주보다 다양하게 말하는 것이 목표</li><li>시간과 면접 흐름에 따라 유연하게 조절</li></ul></article></div></section>
  </main>;
}
