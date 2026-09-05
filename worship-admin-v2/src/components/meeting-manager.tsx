"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatKoreanDate } from "@/domain/terms";

export type MeetingItem = { id: string; sequence: number; meeting_date: string; title: string; kind: "REGULAR" | "EXTRA"; is_cancelled: boolean };

export function MeetingManager({ termId, meetings }: { termId: string; meetings: MeetingItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function add(formData: FormData) {
    setError(null);
    const response = await fetch("/api/admin/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termId, meetingDate: formData.get("meetingDate"), title: formData.get("title") }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "모임을 추가하지 못했습니다.");
    startTransition(() => router.refresh());
  }

  async function toggle(meeting: MeetingItem) {
    setError(null);
    const response = await fetch(`/api/admin/meetings/${meeting.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isCancelled: !meeting.is_cancelled }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "모임 상태를 바꾸지 못했습니다.");
    startTransition(() => router.refresh());
  }

  return <div className="split-stack">
    {error ? <div className="error-banner">{error}</div> : null}
    <div className="compact-list-view">
      {meetings.map((meeting, index) => <div className={`meeting-row ${meeting.is_cancelled ? "cancelled" : ""}`} key={meeting.id}>
        <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
        <strong>{index + 1}주차</strong><span>{formatKoreanDate(meeting.meeting_date)}</span><span>{meeting.title}</span>
        {meeting.kind === "EXTRA" ? <span className="badge">임시</span> : null}
        {meeting.is_cancelled ? <span className="badge badge-disabled">휴강</span> : null}
        <button className="plain-button" disabled={pending} onClick={() => toggle(meeting)}>{meeting.is_cancelled ? "휴강 취소" : "휴강 설정"}</button>
      </div>)}
    </div>
    <form className="inline-form" action={add}>
      <label className="form-field"><span>임시 모임 날짜</span><input className="field" name="meetingDate" type="date" required /></label>
      <label className="form-field grow"><span>모임명</span><input className="field" name="title" defaultValue="찬양팀 임시 모임" required /></label>
      <button className="button button-secondary" disabled={pending}>추가</button>
    </form>
  </div>;
}
