"use client";
import { Fragment, useMemo, useState } from "react";
import { Notice, PageTitle, post, useApi } from "../_components/shared";

type Term = { id: string; name: string; status: string };
type Meeting = { id: string; meeting_date: string };
type Group = { id: string; name: string };
type Student = { group_id: string; student_id: string; name: string; grade: number | null; service_part: number };
type Row = Student & { meeting_id: string; status: string };
type AttendanceData = { meetings: Meeting[]; groups: Group[]; students: Student[]; rows: Row[]; summary: { total: number; unset: number } };
const emptyData: AttendanceData = { meetings: [], groups: [], students: [], rows: [], summary: { total: 0, unset: 0 } };
const options = [["present", "출석"], ["late", "지각"], ["absent", "결석"]] as const;
const editableStatus = (status?: string) => options.some(([value]) => value === status) ? status as "present" | "late" | "absent" : "";

export default function AttendanceClient({ initialTermId = "" }: { initialTermId?: string }) {
  const terms = useApi<{ terms: Term[]; meetings: unknown[] }>("/api/terms", { terms: [], meetings: [] }); const [termId, setTermId] = useState(initialTermId); const activeId = termId || terms.data.terms.find((term) => term.status === "active")?.id || "";
  const state = useApi<AttendanceData>(activeId ? `/api/attendance?termId=${activeId}` : null, emptyData); const [message, setMessage] = useState("");
  const rowMap = useMemo(() => new Map(state.data.rows.map((row) => [`${row.student_id}:${row.meeting_id}`, row])), [state.data.rows]);
  const studentIndex = useMemo(() => new Map(state.data.students.map((student, index) => [student.student_id, index + 1])), [state.data.students]);
  const months = useMemo(() => { const result: Array<{ key: string; label: string; meetings: Meeting[] }> = []; for (const meeting of state.data.meetings) { const [year, month] = meeting.meeting_date.split("-"); const key = `${year}-${month}`; const current = result.at(-1); if (current?.key === key) current.meetings.push(meeting); else result.push({ key, label: `${Number(month)}월`, meetings: [meeting] }); } return result; }, [state.data.meetings]);
  const save = async (student: Student, meeting: Meeting, status: "present" | "late" | "absent") => {
    const key = `${student.student_id}:${meeting.id}`; const previous = rowMap.get(key); const wasUnset = previous?.status === "unset"; setMessage("");
    state.setData({ ...state.data, rows: state.data.rows.map((row) => row.student_id === student.student_id && row.meeting_id === meeting.id ? { ...row, status } : row), summary: { ...state.data.summary, unset: Math.max(0, state.data.summary.unset - Number(wasUnset)) } });
    try { await post("/api/attendance", { meetingId: meeting.id, studentId: student.student_id, status }); } catch (error) { setMessage((error as Error).message); state.setData({ ...state.data, rows: state.data.rows.map((row) => row.student_id === student.student_id && row.meeting_id === meeting.id ? { ...row, status: previous?.status ?? "unset" } : row) }); }
  };

  return <main className="manage-content attendance-page">{initialTermId && <a className="term-back" href={`/manage/terms/${initialTermId}`}>← 학기 운영 메뉴</a>}<PageTitle eyebrow="04 · ATTENDANCE" title="토요모임 출결" detail="학생과 날짜가 만나는 칸에서 출석·지각·결석을 바로 선택합니다." />
    <div className="attendance-toolbar">{!initialTermId && <select className="manage-select" value={activeId} onChange={(event) => setTermId(event.target.value)}><option value="">학기 선택</option>{terms.data.terms.map((term) => <option value={term.id} key={term.id}>{term.name}</option>)}</select>}<div className="attendance-legend"><span className="present">출석</span><span className="late">지각</span><span className="absent">결석</span></div><span className={`manage-badge${state.data.summary.unset ? " warn" : ""}`}>미입력 {state.data.summary.unset}칸</span></div>
    {message && <Notice error>{message}</Notice>}{!activeId ? <Notice>먼저 학기를 선택해주세요.</Notice> : state.loading ? <Notice>출결표를 불러오는 중입니다.</Notice> : !state.data.meetings.length ? <Notice>출결을 입력할 모임 날짜가 없습니다.</Notice> : !state.data.students.length ? <Notice>담당 조에 편성된 학생이 없습니다.</Notice> : <div className="attendance-table-shell"><table className="attendance-matrix"><thead><tr><th className="attendance-number" rowSpan={2}>순</th><th className="attendance-name" rowSpan={2}>학생</th>{months.map((month) => <th className="attendance-month" colSpan={month.meetings.length} key={month.key}>{month.label}</th>)}</tr><tr>{state.data.meetings.map((meeting) => <th className="attendance-date" key={meeting.id}><b>{Number(meeting.meeting_date.slice(8, 10))}</b><small>토</small></th>)}</tr></thead><tbody>{state.data.groups.map((group) => { const students = state.data.students.filter((student) => student.group_id === group.id); if (!students.length) return null; return <Fragment key={group.id}><tr className="attendance-group-row"><th colSpan={state.data.meetings.length + 2}>{group.name}<span>학생 {students.length}명</span></th></tr>{students.map((student) => <tr key={student.student_id}><td className="attendance-number">{studentIndex.get(student.student_id)}</td><th className="attendance-name"><b>{student.name}</b><small>{student.grade ?? "?"}학년 · {group.name}</small></th>{state.data.meetings.map((meeting) => { const row = rowMap.get(`${student.student_id}:${meeting.id}`); const status = editableStatus(row?.status); return <td className={`attendance-cell ${status || "unset"}`} key={meeting.id}><select aria-label={`${student.name} ${meeting.meeting_date} 출결`} value={status} onChange={(event) => void save(student, meeting, event.target.value as "present" | "late" | "absent")}><option value="" disabled>·</option>{options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>; })}</tr>)}</Fragment>; })}</tbody></table></div>}
  </main>;
}
