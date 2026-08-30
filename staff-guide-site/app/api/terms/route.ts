import { all, audit, createId, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";

export const dynamic = "force-dynamic";
function saturdaysBetween(startDate: string, endDate: string) {
  const result: string[] = []; const cursor = new Date(`${startDate}T00:00:00Z`); const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor.getUTCDay() !== 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 7); }
  return result;
}

export async function GET() {
  const { error } = await requireApiUser(); if (error) return error;
  const [terms, meetings] = await Promise.all([all("SELECT * FROM terms ORDER BY start_date DESC"), all("SELECT * FROM meetings ORDER BY meeting_date")]);
  return Response.json({ terms, meetings });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action?: string; id?: string; name?: string; startDate?: string; endDate?: string; eligibleStatuses?: string[]; date?: string; kind?: string; title?: string; termId?: string };
  if (body.action === "set_meeting") {
    if (!body.termId || !body.date || !["regular", "extra", "break"].includes(body.kind ?? "")) return jsonError("모임 날짜와 상태를 확인해주세요.");
    const timestamp = now();
    await run("INSERT INTO meetings (id,term_id,meeting_date,kind,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(term_id,meeting_date) DO UPDATE SET kind=excluded.kind,title=excluded.title,updated_at=excluded.updated_at",
      [createId("meeting"), body.termId, body.date, body.kind, body.title || null, timestamp, timestamp]);
    await audit(user.id, "set_meeting", "meeting", body.date, null, body); return Response.json({ ok: true });
  }
  if (!body.name || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학기 이름과 기간을 확인해주세요.");
  const id = body.id || createId("term"); const timestamp = now(); const statuses = body.eligibleStatuses?.length ? body.eligibleStatuses.join(",") : "present";
  await run("UPDATE terms SET status='closed',updated_at=? WHERE status='active' AND id<>?", [timestamp, id]);
  await run("INSERT INTO terms (id,name,start_date,end_date,eligible_statuses,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,eligible_statuses=excluded.eligible_statuses,status='active',updated_at=excluded.updated_at",
    [id, body.name.trim(), body.startDate, body.endDate, statuses, timestamp, timestamp]);
  const existing = new Set((await all<{ meeting_date: string }>("SELECT meeting_date FROM meetings WHERE term_id=?", [id])).map((row) => row.meeting_date));
  for (const date of saturdaysBetween(body.startDate, body.endDate)) if (!existing.has(date)) await run("INSERT INTO meetings (id,term_id,meeting_date,kind,title,created_at,updated_at) VALUES (?,?,?,'regular',NULL,?,?)", [createId("meeting"), id, date, timestamp, timestamp]);
  await audit(user.id, "save", "term", id, null, body); return Response.json({ ok: true, id });
}
