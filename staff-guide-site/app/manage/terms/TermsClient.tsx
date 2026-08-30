"use client";
import { useMemo, useState } from "react";
import { Notice, PageTitle, post, useApi } from "../_components/shared";
type Term = { id: string; name: string; start_date: string; end_date: string; eligible_statuses: string; status: string };
type Meeting = { id: string; term_id: string; meeting_date: string; kind: "regular" | "extra" | "break"; title: string | null };

export default function TermsClient({ initialTermId }: { initialTermId: string }) {
  const state = useApi<{ terms: Term[]; meetings: Meeting[] }>("/api/terms", { terms: [], meetings: [] }); const [message, setMessage] = useState("");
  const activeId = initialTermId; const term = state.data.terms.find((item) => item.id === activeId); const meetings = useMemo(() => state.data.meetings.filter((item) => item.term_id === activeId), [state.data.meetings, activeId]);
  const toggle = async (meeting: Meeting) => { try { await post("/api/terms", { action: "set_meeting", termId: meeting.term_id, date: meeting.meeting_date, kind: meeting.kind === "break" ? "regular" : "break", title: meeting.title }); setMessage(meeting.kind === "break" ? "모임으로 복원했습니다." : "휴강으로 지정했습니다."); await state.reload(); } catch (error) { setMessage((error as Error).message); } };
  const addExtra = async (form: FormData) => { try { await post("/api/terms", { action: "set_meeting", termId: activeId, date: form.get("date"), kind: "extra", title: form.get("title") }); setMessage("임시 모임을 추가했습니다."); await state.reload(); } catch (error) { setMessage((error as Error).message); } };
  return <main className="manage-content"><a className="term-back" href={`/manage/terms/${activeId}`}>← {term?.name ?? "학기"} 운영 메뉴</a><PageTitle eyebrow="03 · SCHEDULE" title="모임 일정" detail="토요일 일정에 휴강을 표시하거나 임시 모임을 추가합니다." />
    <section className="manage-panel manage-stack"><div><h2>{term?.name ?? "학기 불러오는 중"}</h2><p className="term-form-help">{term ? `${term.start_date} — ${term.end_date}` : ""}</p></div><form className="manage-toolbar" action={(form) => void addExtra(form)}><input className="manage-input" name="date" type="date" min={term?.start_date} max={term?.end_date} required /><input className="manage-input" name="title" placeholder="임시 모임 이름" /><button className="manage-button">임시 모임 추가</button></form>{message && <Notice>{message}</Notice>}</section>
    <section className="manage-panel" style={{ marginTop: 14 }}><h2>모임 일정</h2><div className="manage-list">{meetings.map((meeting) => <div className="manage-person" key={meeting.id}><div><b>{meeting.meeting_date}</b><br /><small>{meeting.kind === "break" ? "휴강" : meeting.kind === "extra" ? "임시 모임" : "정규 토요모임"}{meeting.title ? ` · ${meeting.title}` : ""}</small></div><button className={`manage-button${meeting.kind === "break" ? "" : " danger"}`} onClick={() => void toggle(meeting)}>{meeting.kind === "break" ? "모임으로 복원" : "휴강 지정"}</button></div>)}</div>{!meetings.length && <Notice>등록된 모임 일정이 없습니다. 학기 기간을 확인해주세요.</Notice>}</section>
  </main>;
}
