"use client";
import { useEffect, useState } from "react";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다."); return data;
}
export function useApi<T>(url: string | null, initial: T) {
  const [data, setData] = useState(initial); const [loading, setLoading] = useState(Boolean(url)); const [error, setError] = useState("");
  const reload = async () => { if (!url) return; setLoading(true); setError(""); try { setData(await api<T>(url)); } catch (caught) { setError((caught as Error).message); } finally { setLoading(false); } };
  useEffect(() => {
    if (!url) return; let active = true;
    void api<T>(url).then((value) => { if (active) setData(value); }, (caught) => { if (active) setError((caught as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);
  return { data, setData, loading, error, reload };
}
export function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) { return <header className="manage-title"><div><p>{eyebrow}</p><h1>{title}</h1><p>{detail}</p></div>{action}</header>; }
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`manage-alert${error ? " error" : ""}`}>{children}</div>; }
export const post = <T,>(url: string, body: unknown, method = "POST") => api<T>(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
