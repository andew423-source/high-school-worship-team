"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | null;
type AttendancePayload = {
  groups: Array<{ id: string; name: string; staffNames: string[] }>;
  selectedGroupId: string;
  meetings: Array<{ id: string; sequence: number; meeting_date: string; is_cancelled: boolean }>;
  students: Array<{ id: string; name: string; grade: number }>;
  attendance: Array<{ meeting_id: string; term_student_id: string; status: Exclude<AttendanceStatus, null>; updated_at: string }>;
};

async function loadAttendance(termId: string, groupId: string) {
  const response = await fetch(`/api/terms/${termId}/attendance${groupId ? `?groupId=${groupId}` : ""}`, { cache: "no-store" });
  const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "출결을 불러오지 못했습니다."); return result.data as AttendancePayload;
}

export function AttendanceManager({ termId, initialGroupId = "", focusedMeetingId }: { termId: string; initialGroupId?: string; focusedMeetingId?: string }) {
  const client = useQueryClient();
  const router = useRouter();
  const queryKey = ["attendance", termId, initialGroupId];
  const query = useQuery({ queryKey, queryFn: () => loadAttendance(termId, initialGroupId) });
  const mutation = useMutation({
    mutationFn: async ({ meetingId, termStudentId, status, expectedRevision }: { meetingId: string; termStudentId: string; status: AttendanceStatus; expectedRevision: string | null }) => {
      const response = await fetch(`/api/attendance/${meetingId}/${termStudentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, expectedRevision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "출결을 저장하지 못했습니다."); return result.data as { meetingId: string; termStudentId: string; status: Exclude<AttendanceStatus, null> | null; revision: string | null };
    },
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey }); const previous = client.getQueryData<AttendancePayload>(queryKey);
      client.setQueryData<AttendancePayload>(queryKey, (current) => current ? { ...current, attendance: [...current.attendance.filter((item) => item.meeting_id !== variables.meetingId || item.term_student_id !== variables.termStudentId), ...(variables.status ? [{ meeting_id: variables.meetingId, term_student_id: variables.termStudentId, status: variables.status, updated_at: variables.expectedRevision ?? "optimistic" }] : [])] } : current);
      const previousCell = previous?.attendance.find((item) => item.meeting_id === variables.meetingId && item.term_student_id === variables.termStudentId);
      return { previousCell };
    },
    onSuccess: (saved) => {
      client.setQueryData<AttendancePayload>(queryKey, (current) => current ? {
        ...current,
        attendance: [
          ...current.attendance.filter((item) => item.meeting_id !== saved.meetingId || item.term_student_id !== saved.termStudentId),
          ...(saved.status && saved.revision ? [{ meeting_id: saved.meetingId, term_student_id: saved.termStudentId, status: saved.status, updated_at: saved.revision }] : []),
        ],
      } : current);
    },
    onError: (_error, variables, context) => {
      client.setQueryData<AttendancePayload>(queryKey, (current) => current ? {
        ...current,
        attendance: [
          ...current.attendance.filter((item) => item.meeting_id !== variables.meetingId || item.term_student_id !== variables.termStudentId),
          ...(context?.previousCell ? [context.previousCell] : []),
        ],
      } : current);
    },
  });
  const data = query.data;
  if (query.isLoading) return <section className="panel"><p>출결표를 불러오는 중입니다.</p></section>;
  if (query.error) return <div className="error-banner">{query.error.message}</div>;
  if (!data?.groups.length) return <section className="panel empty-state"><strong>표시할 조가 아직 없습니다.</strong>운영자가 조 편성을 확정하면 출결을 입력할 수 있습니다.</section>;
  return <>
    {mutation.error ? <div className="error-banner">{mutation.error.message}</div> : null}
    <p className="save-state">본인 담당 조가 먼저 표시됩니다. 다른 조를 선택해 대신 출결을 입력할 수도 있습니다.</p>
    <div className="attendance-toolbar"><label className="form-field"><span>표시할 조</span><select className="field" value={data.selectedGroupId} onChange={(event) => router.push(`${window.location.pathname}?groupId=${event.target.value}`)}>{data.groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.staffNames.join(", ") || "담당 스탭 미정"}</option>)}</select></label><span className="save-state">{mutation.isPending ? "저장 중…" : "셀을 선택하면 바로 저장됩니다."}</span></div>
    <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th className="student-sticky">학생</th>{data.meetings.map((meeting) => <th key={meeting.id} className={meeting.id === focusedMeetingId ? "focused" : ""}><span>{meeting.sequence}주</span><small>{meeting.meeting_date.slice(5).replace("-", "/")}</small></th>)}</tr></thead><tbody>{data.students.map((student, index) => <tr key={student.id}><th className="student-sticky"><span>{index + 1}</span><strong>{student.name}</strong><small>{student.grade}학년</small></th>{data.meetings.map((meeting) => { const current = data.attendance.find((item) => item.meeting_id === meeting.id && item.term_student_id === student.id); return <td key={meeting.id} className={meeting.id === focusedMeetingId ? "focused" : ""}>{meeting.is_cancelled ? <span className="cancelled-cell">휴강</span> : <select aria-label={`${student.name} ${meeting.meeting_date} 출결`} value={current?.status ?? ""} disabled={mutation.isPending && mutation.variables?.meetingId === meeting.id && mutation.variables?.termStudentId === student.id} className={`attendance-cell ${current?.status?.toLowerCase() ?? "empty"}`} onChange={(event) => mutation.mutate({ meetingId: meeting.id, termStudentId: student.id, status: (event.target.value || null) as AttendanceStatus, expectedRevision: current?.updated_at && current.updated_at !== "optimistic" ? current.updated_at : null })}><option value="">·</option><option value="PRESENT">출석</option><option value="LATE">지각</option><option value="ABSENT">결석</option></select>}</td>; })}</tr>)}</tbody></table></div>
  </>;
}
