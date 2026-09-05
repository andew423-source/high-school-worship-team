"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type AccessRequestItem = {
  id: string;
  status: "PENDING" | "APPROVED" | "DISABLED";
  requestedAt: string;
  updatedAt: string;
  email: string;
  displayName: string | null;
  staffId: string | null;
};
export type StaffOption = { id: string; name: string; email: string | null };

export function AccessRequestList({ requests, staff }: { requests: AccessRequestItem[]; staff: StaffOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(requests.map((request) => [request.id, request.staffId ?? ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function review(request: AccessRequestItem, decision: "APPROVED" | "DISABLED") {
    const staffId = selected[request.id];
    if (decision === "APPROVED" && !staffId) {
      setError("승인할 계정과 연결할 스탭을 먼저 선택해주세요.");
      return;
    }
    setError(null);
    setBusyId(request.id);
    const response = await fetch(`/api/admin/access-requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, staffId: decision === "APPROVED" ? staffId : undefined, expectedUpdatedAt: request.updatedAt }),
    });
    const payload = await response.json().catch(() => null);
    setBusyId(null);
    if (!response.ok) {
      setError(payload?.error?.message ?? "승인 상태를 변경하지 못했습니다.");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (!requests.length) return <div className="empty-state"><strong>아직 승인 요청이 없어요.</strong>새 사용자가 Google 로그인을 마치면 이곳에 표시됩니다.</div>;

  return (
    <div>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <div className="list-stack">
        {requests.map((request) => (
          <article className="request-row" key={request.id}>
            <div className="request-person">
              <span className={`badge ${request.status === "PENDING" ? "badge-pending" : request.status === "DISABLED" ? "badge-disabled" : ""}`}>{statusLabel(request.status)}</span>
              <strong>{request.displayName || request.email}</strong>
              <span>{request.email} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(request.requestedAt))}</span>
            </div>
            <label>
              <span className="sr-only">연결할 스탭</span>
              <select className="field" value={selected[request.id] ?? ""} disabled={busyId === request.id}
                onChange={(event) => setSelected((current) => ({ ...current, [request.id]: event.target.value }))}>
                <option value="">스탭 선택</option>
                {staff.map((person) => <option key={person.id} value={person.id}>{person.name}{person.email ? ` · ${person.email}` : ""}</option>)}
              </select>
            </label>
            <div className="request-actions">
              <button className="button button-primary button-small" type="button" disabled={busyId === request.id} onClick={() => review(request, "APPROVED")}>{busyId === request.id ? "처리 중" : "승인"}</button>
              <button className="button button-danger button-small" type="button" disabled={busyId === request.id} onClick={() => review(request, "DISABLED")}>중지</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function statusLabel(status: AccessRequestItem["status"]) {
  if (status === "APPROVED") return "승인됨";
  if (status === "DISABLED") return "중지됨";
  return "승인 대기";
}
