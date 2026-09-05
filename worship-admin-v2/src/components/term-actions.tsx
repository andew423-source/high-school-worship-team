"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TermStatusActions({ termId, status }: { termId: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function update(next: "DRAFT" | "ACTIVE" | "ARCHIVED") {
    setError(null);
    const response = await fetch(`/api/admin/terms/${termId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "상태를 바꾸지 못했습니다.");
    startTransition(() => router.refresh());
  }

  return <div>{error ? <p className="inline-error">{error}</p> : null}<div className="inline-actions">
    {status !== "ACTIVE" ? <button className="button button-primary button-small" disabled={pending} onClick={() => update("ACTIVE")}>활성 학기로 전환</button> : null}
    {status !== "ARCHIVED" ? <button className="button button-secondary button-small" disabled={pending} onClick={() => update("ARCHIVED")}>보관</button> : null}
  </div></div>;
}
