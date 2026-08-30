"use client";
import { useEffect, useState } from "react";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options); const text = await response.text();
  let data: (T & { error?: string }) | null = null;
  if (text) { try { data = JSON.parse(text) as T & { error?: string }; } catch { data = null; } }
  if (!response.ok) throw new Error(data?.error || "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
  if (!data) throw new Error("서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.");
  return data;
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
