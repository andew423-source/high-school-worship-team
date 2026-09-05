"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saturdayDates } from "@/domain/terms";

export function TermCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useState({ start: "", end: "" });
  const meetingCount = saturdayDates(dates.start, dates.end).length;

  async function submit(formData: FormData) {
    setError(null);
    const response = await fetch("/api/admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        status: formData.get("status"),
        lateCountsAsPresent: formData.get("lateCountsAsPresent") === "on",
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error?.message ?? "학기를 만들지 못했습니다.");
      return;
    }
    const termId = payload?.data?.term?.id;
    startTransition(() => termId ? router.push(`/admin/terms/${termId}`) : router.refresh());
  }

  return (
    <form className="form-stack" action={submit}>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <label className="form-field"><span>학기 이름</span><input className="field" name="name" required placeholder="예: 2026년 2학기" /></label>
      <div className="form-grid two">
        <label className="form-field"><span>시작일</span><input className="field" type="date" name="startDate" required value={dates.start} onChange={(event) => setDates((current) => ({ ...current, start: event.target.value }))} /></label>
        <label className="form-field"><span>종료일</span><input className="field" type="date" name="endDate" required value={dates.end} onChange={(event) => setDates((current) => ({ ...current, end: event.target.value }))} /></label>
      </div>
      <div className="form-grid two">
        <label className="form-field"><span>처음 상태</span><select className="field" name="status" defaultValue="DRAFT"><option value="DRAFT">초안</option><option value="ACTIVE">활성 학기</option></select></label>
        <label className="check-field"><input type="checkbox" name="lateCountsAsPresent" /><span>지각도 등단 후보 출석으로 인정</span></label>
      </div>
      <div className="form-summary"><strong>{meetingCount}회</strong><span>선택 기간의 토요일 모임이 자동 생성됩니다.</span></div>
      <button className="button button-primary" disabled={pending || meetingCount === 0}>{pending ? "생성 중" : "학기 만들기"}</button>
    </form>
  );
}
