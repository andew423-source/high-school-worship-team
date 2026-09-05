"use client";

import { useRouter } from "next/navigation";

export function StageWeekSelect({ meetings, selected, adminTermId }: {
  meetings: { id: string; sequence: number; meeting_date: string }[];
  selected: string;
  adminTermId?: string;
}) {
  const router = useRouter();
  return <label className="form-field week-select"><span>다른 날짜로 이동</span>
    <select className="field" value={selected} onChange={(event) => {
      if (!window.confirm("저장하지 않은 수정 내용은 사라집니다. 다른 날짜로 이동할까요?")) return;
      const id = event.target.value;
      router.push(adminTermId ? `/admin/terms/${adminTermId}/stage?meetingId=${id}` : `/weeks/${id}/stage`);
    }}>{meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.sequence}주차 · {meeting.meeting_date}</option>)}</select>
  </label>;
}
