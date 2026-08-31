"use client";
import { useMemo, useState } from "react";
import { Notice, PageTitle, post, useApi } from "../_components/shared";

type Term = { id: string; name: string; status: string };
type Meeting = { id: string; meeting_date: string };
type Person = { id: string; name: string; service_part?: number; worship_team?: string | null; is_student_leader?: number; can_sing?: number };
type Service = { id: string; meeting_id: string; sunday_date: string; service_part: 1 | 2; singer_slots: number; choir_slots: number; leader_type: "student" | "staff"; leader_id: string; status: string; updated_at?: string };
type Availability = { staff_id: string; present: number; stage_role: "singer" | "session" };
type Assignment = { service_id: string; person_type: "student" | "staff"; person_id: string; name: string; role: "leader" | "singer" | "choir"; side: "left" | "center" | "right"; position_order: number; reason: string };
type ContinuityPerson = { id: string; name: string; service_part: number };
type StageData = {
  meetings: Meeting[]; services: Service[]; students: Person[]; staff: Person[]; availability: Availability[]; assignments: Assignment[];
  stats: { 1: { attendance: number; eligibleStudents: number }; 2: { attendance: number; eligibleStudents: number }; singerStaff: number; sessionStaff: number };
  continuity: { previousSunday: string | null; priority: ContinuityPerson[]; risks: ContinuityPerson[] };
};

const emptyData: StageData = { meetings: [], services: [], students: [], staff: [], availability: [], assignments: [], stats: { 1: { attendance: 0, eligibleStudents: 0 }, 2: { attendance: 0, eligibleStudents: 0 }, singerStaff: 0, sessionStaff: 0 }, continuity: { previousSunday: null, priority: [], risks: [] } };
function sundayAfter(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function localIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function nextSunday() { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + ((7 - date.getDay()) % 7)); return localIso(date); }
function shortDate(date: string) { const value = new Date(`${date}T00:00:00Z`); return `${value.getUTCMonth() + 1}/${value.getUTCDate()}`; }

export default function StageClient({ initialTermId = "" }: { initialTermId?: string }) {
  const terms = useApi<{ terms: Term[]; meetings: unknown[] }>("/api/terms", { terms: [], meetings: [] });
  const [termId, setTermId] = useState(initialTermId); const activeId = termId || terms.data.terms.find((term) => term.status === "active")?.id || "";
  const base = useApi<StageData>(activeId ? `/api/stage?termId=${activeId}` : null, emptyData); const [meetingId, setMeetingId] = useState("");
  const targetSunday = useMemo(() => nextSunday(), []);
  const defaultMeeting = useMemo(() => { const ordered = [...base.data.meetings].sort((a, b) => sundayAfter(a.meeting_date).localeCompare(sundayAfter(b.meeting_date))); return ordered.find((meeting) => sundayAfter(meeting.meeting_date) >= targetSunday) ?? ordered.at(-1); }, [base.data.meetings, targetSunday]);
  const currentMeeting = base.data.meetings.find((item) => item.id === meetingId) ?? defaultMeeting; const sunday = currentMeeting ? sundayAfter(currentMeeting.meeting_date) : "";
  const day = useApi<StageData>(activeId && sunday ? `/api/stage?termId=${activeId}&sundayDate=${sunday}` : null, emptyData); const [message, setMessage] = useState("");
  const act = async (body: Record<string, unknown>) => { try { const result = await post<{ warnings?: string[] }>("/api/stage", body); setMessage(result.warnings?.join(" ") || "저장했습니다."); await day.reload(); } catch (error) { setMessage((error as Error).message); } };

  const availability = useMemo(() => new Map(day.data.availability.map((item) => [item.staff_id, item])), [day.data.availability]);
  const savedLeader = day.data.services.find((service) => service.leader_id); const defaultLeader = day.data.staff.find((staff) => staff.name.replace(/\s/g, "") === "황현민");
  const leaderFallback = savedLeader ? `${savedLeader.leader_type}:${savedLeader.leader_id}` : defaultLeader ? `staff:${defaultLeader.id}` : ""; const leaderKey = `${activeId}:${sunday}`; const [leaderDraft, setLeaderDraft] = useState({ key: "", value: "" }); const leader = leaderDraft.key === leaderKey ? leaderDraft.value : leaderFallback;
  const leaderCandidates = [
    ...day.data.students.filter((student) => student.is_student_leader).map((student) => ({ ...student, type: "student" as const })),
    ...day.data.staff.map((staff) => ({ ...staff, type: "staff" as const })),
  ];
  const saveLeader = () => { const [leaderType, leaderId] = leader.split(":"); return act({ action: "save_leader", termId: activeId, meetingId: currentMeeting?.id, sundayDate: sunday, leaderType, leaderId }); };

  const exportBoard = async (service: Service, pdf: boolean) => {
    const items = day.data.assignments.filter((item) => item.service_id === service.id); const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 760; const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#17201c"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#fff"; ctx.font = "bold 42px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`${service.sunday_date} · ${service.service_part}부 등단표`, 700, 70);
    const draw = (role: string, y: number) => { const left = items.filter((item) => item.role === role && item.side === "left"); const right = items.filter((item) => item.role === role && item.side === "right"); const paint = (list: Assignment[], start: number, direction: number) => list.forEach((item, index) => { const x = start + index * 170 * direction; ctx.strokeStyle = "#7d8d84"; ctx.strokeRect(x - 65, y - 30, 130, 60); ctx.font = "25px sans-serif"; ctx.fillText(item.name, x, y + 9); }); paint(left, 580, -1); paint(right, 820, 1); };
    draw("choir", 240); draw("singer", 430); const assignedLeader = items.find((item) => item.role === "leader"); if (assignedLeader) { ctx.strokeStyle = "#e3c76c"; ctx.strokeRect(630, 590, 140, 70); ctx.fillStyle = "#ffe38a"; ctx.fillText(assignedLeader.name, 700, 636); }
    if (pdf) { const { jsPDF } = await import("jspdf"); const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [1400, 760] }); doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1400, 760); doc.save(`${service.sunday_date}-${service.service_part}부-등단표.pdf`); }
    else { const link = document.createElement("a"); link.download = `${service.sunday_date}-${service.service_part}부-등단표.png`; link.href = canvas.toDataURL("image/png"); link.click(); }
  };

  return <main className="manage-content stage-page">{initialTermId && <a className="term-back" href={`/manage/terms/${initialTermId}`}>← 학기 운영 메뉴</a>}<PageTitle eyebrow="05 · STAGE" title="주일 등단 배정" detail="토요 출결과 스탭 참석을 바탕으로 공평하게 배정하고 등단표를 만듭니다." />
    <div className="manage-toolbar">{!initialTermId && <select className="manage-select" value={activeId} onChange={(event) => { setTermId(event.target.value); setMeetingId(""); }}><option value="">학기 선택</option>{terms.data.terms.map((term) => <option value={term.id} key={term.id}>{term.name}</option>)}</select>}<label className="manage-field">등단 주일<select className="manage-select" value={currentMeeting?.id ?? ""} onChange={(event) => setMeetingId(event.target.value)}><option value="">토요모임 선택</option>{base.data.meetings.map((meeting) => <option value={meeting.id} key={meeting.id}>{shortDate(meeting.meeting_date)}(토) → {shortDate(sundayAfter(meeting.meeting_date))}(일)</option>)}</select></label></div>
    {message && <Notice error={/부족|않|위험|선택/.test(message)}>{message}</Notice>}
    {!sunday ? <Notice>학기에 등록된 토요모임이 없습니다.</Notice> : <div className="manage-stack stage-workspace" style={{ marginTop: 14 }}>
      <section className="manage-panel stage-day-settings"><div><p className="manage-eyebrow">{shortDate(sunday)} 주일 공통 설정</p><h2>인도자</h2><p>1·2부에 같은 인도자가 들어갑니다. 선택하지 않으면 황현민 스탭이 기본입니다.</p></div><div className="stage-leader-control"><select className="manage-select" value={leader} onChange={(event) => setLeaderDraft({ key: leaderKey, value: event.target.value })}><option value="">인도자 선택</option>{leaderCandidates.map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.name} · {item.type === "student" ? `학생 인도자 ${item.service_part ?? ""}부` : item.name.replace(/\s/g, "") === "황현민" ? "스탭 · 기본" : "스탭"}</option>)}</select><button className="manage-button primary" disabled={!leader} onClick={() => void saveLeader()}>공통 인도자 저장</button></div></section>
      <section className="stage-capacity-overview">{([1, 2] as const).map((part) => <article key={part}><b>{part}부 가용 인원</b><span>토요 출석 <strong>{day.data.stats[part].attendance}명</strong></span><span>등단 대상 학생 <strong>{day.data.stats[part].eligibleStudents}명</strong></span><span>싱어 스탭 <strong>{day.data.stats.singerStaff}명</strong></span></article>)}<article className="staff-summary"><b>선택한 스탭</b><span>싱어 <strong>{day.data.stats.singerStaff}명</strong></span><span>세션 <strong>{day.data.stats.sessionStaff}명</strong></span></article></section>
      {day.data.continuity.previousSunday && <section className={`manage-alert stage-continuity${day.data.continuity.risks.length ? " error" : ""}`}><b>2주 연속 미등단 검토</b><span>지난주({shortDate(day.data.continuity.previousSunday)}) 미등단 후 이번 주 출석: {day.data.continuity.priority.length ? day.data.continuity.priority.map((item) => `${item.name}(${item.service_part}부)`).join(", ") : "없음"}</span><span>현재 배정에서 다시 빠질 위험: {day.data.continuity.risks.length ? day.data.continuity.risks.map((item) => item.name).join(", ") : "없음"}</span></section>}
      <section className="manage-panel"><div className="stage-section-head"><div><h2>{shortDate(sunday)} 참석 스탭</h2><p>참석할 스탭을 선택한 뒤 그날의 역할을 싱어 또는 세션으로 지정하세요.</p></div></div><div className="stage-staff-grid">{day.data.staff.map((staff) => { const selected = availability.get(staff.id); const isPresent = Boolean(selected?.present); const role = selected?.stage_role ?? "session"; return <article className={`stage-staff-card${isPresent ? " active" : ""}`} key={staff.id}><button type="button" aria-pressed={isPresent} onClick={() => void act({ action: "availability", sundayDate: sunday, staffId: staff.id, present: !isPresent, stageRole: role })}>{isPresent ? "✓" : "+"}</button><b>{staff.name}</b><select aria-label={`${staff.name} 당일 역할`} disabled={!isPresent} value={role} onChange={(event) => void act({ action: "availability", sundayDate: sunday, staffId: staff.id, present: true, stageRole: event.target.value })}><option value="session">세션</option><option value="singer">싱어</option></select></article>; })}</div></section>
      <div className="manage-grid stage-service-grid">{([1, 2] as const).map((part) => { const service = day.data.services.find((item) => item.service_part === part); return <ServiceEditor key={`${part}:${service?.id ?? "new"}:${service?.updated_at ?? ""}`} part={part} termId={activeId} meeting={currentMeeting!} sunday={sunday} leader={leader} data={day.data} act={act} exportBoard={exportBoard} />; })}</div>
    </div>}
  </main>;
}

function ServiceEditor({ part, termId, meeting, sunday, leader, data, act, exportBoard }: { part: 1 | 2; termId: string; meeting: Meeting; sunday: string; leader: string; data: StageData; act: (body: Record<string, unknown>) => Promise<void>; exportBoard: (service: Service, pdf: boolean) => Promise<void> }) {
  const service = data.services.find((item) => item.service_part === part); const assignments = data.assignments.filter((item) => item.service_id === service?.id); const [singer, setSinger] = useState(service?.singer_slots ?? 6); const [choir, setChoir] = useState(service?.choir_slots ?? 4);
  const save = () => { const [leaderType, leaderId] = leader.split(":"); return act({ action: "save_config", termId, meetingId: meeting.id, sundayDate: sunday, servicePart: part, singerSlots: singer, choirSlots: choir, leaderType, leaderId }); };
  const side = (role: string, direction: string) => assignments.filter((item) => item.role === role && item.side === direction).sort((a, b) => a.position_order - b.position_order);
  const move = (item: Assignment, change: Partial<Assignment>) => act({ action: "move", serviceId: item.service_id, personType: item.person_type, personId: item.person_id, role: change.role ?? item.role, side: change.side ?? item.side, positionOrder: item.position_order });
  return <section className="manage-panel manage-stack stage-service"><div className="stage-section-head"><h2>{part}부 <span className="manage-badge">{service?.status ?? "미설정"}</span></h2><span>출석 {data.stats[part].attendance}명 · 등단 대상 {data.stats[part].eligibleStudents}명 · 싱어 스탭 {data.stats.singerStaff}명</span></div><div className="manage-grid"><label className="manage-field">싱어<input className="manage-input" type="number" min="0" value={singer} onChange={(event) => setSinger(Number(event.target.value))} /></label><label className="manage-field">콰이어<input className="manage-input" type="number" min="0" value={choir} onChange={(event) => setChoir(Number(event.target.value))} /></label></div><div className="manage-toolbar"><button className="manage-button" disabled={!leader} onClick={() => void save()}>인원 저장</button><button className="manage-button primary" disabled={!service} onClick={() => void act({ action: "generate", serviceId: service?.id })}>자동 배정</button><button className="manage-button" disabled={!service || !assignments.length} onClick={() => void act({ action: "confirm", serviceId: service?.id })}>확정</button></div>
    {service && assignments.length > 0 && <><div className="stage-board"><div className="stage-label">콰이어</div><StageRow left={side("choir", "left")} right={side("choir", "right")} move={move} /><div className="stage-label">싱어</div><StageRow left={side("singer", "left")} right={side("singer", "right")} move={move} /><div className="stage-row"><div /><div className="stage-person leader">{assignments.find((item) => item.role === "leader")?.name}</div><div /></div></div><div className="manage-toolbar"><button className="manage-button" onClick={() => void exportBoard(service, false)}>PNG 저장</button><button className="manage-button" onClick={() => void exportBoard(service, true)}>PDF 저장</button></div></>}
  </section>;
}

function StageRow({ left, right, move }: { left: Assignment[]; right: Assignment[]; move: (item: Assignment, change: Partial<Assignment>) => Promise<void> }) {
  const person = (item: Assignment) => <div className="stage-person" title={item.reason} key={`${item.person_type}:${item.person_id}`}><b>{item.name}</b><br /><button title="반대편으로 이동" onClick={() => void move(item, { side: item.side === "left" ? "right" : "left" })}>↔</button>{item.person_type === "staff" ? <small>싱어 스탭</small> : <select value={item.role} onChange={(event) => void move(item, { role: event.target.value as Assignment["role"] })}><option value="singer">싱어</option><option value="choir">콰이어</option></select>}</div>;
  return <div className="stage-row"><div className="stage-side">{left.map(person)}</div><div /><div className="stage-side">{right.map(person)}</div></div>;
}
