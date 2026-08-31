import { all, audit, createId, getD1, now, run } from "../../../db/runtime";
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
  const [terms, meetings] = await Promise.all([all(`SELECT t.*,
    (SELECT COUNT(*) FROM term_students ts WHERE ts.term_id=t.id AND ts.active=1) student_count,
    (SELECT COUNT(*) FROM meetings m WHERE m.term_id=t.id AND m.kind<>'break') meeting_count,
    (SELECT COUNT(*) FROM groups g WHERE g.term_id=t.id) group_count
    FROM terms t ORDER BY start_date DESC, created_at DESC`), all("SELECT * FROM meetings ORDER BY meeting_date")]);
  return Response.json({ terms, meetings });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action?: string; id?: string; name?: string; startDate?: string; endDate?: string; eligibleStatuses?: string[]; date?: string; kind?: string; title?: string; termId?: string };
  if (body.action === "delete_term") {
    if (!body.id) return jsonError("삭제할 학기를 확인해주세요.");
    const term = await all<Record<string, unknown>>("SELECT * FROM terms WHERE id=?", [body.id]);
    if (!term[0]) return jsonError("이미 삭제되었거나 존재하지 않는 학기입니다.", 404);
    const counts = (await all<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM term_students WHERE term_id=?) students,
      (SELECT COUNT(*) FROM groups WHERE term_id=?) groups_count,
      (SELECT COUNT(*) FROM meetings WHERE term_id=?) meetings_count,
      (SELECT COUNT(*) FROM services WHERE term_id=?) services_count`, [body.id, body.id, body.id, body.id]))[0];
    const next = (await all<{ id: string }>("SELECT id FROM terms WHERE id<>? ORDER BY start_date DESC, created_at DESC LIMIT 1", [body.id]))[0];
    const db = getD1(); const timestamp = now(); const statements = [
      db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,'term',?,?,NULL,?)").bind(createId("audit"), user.id, "delete", body.id, JSON.stringify({ ...term[0], ...counts }), timestamp),
      db.prepare("DELETE FROM stage_assignments WHERE service_id IN (SELECT id FROM services WHERE term_id=?)").bind(body.id),
      db.prepare("DELETE FROM services WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM attendance WHERE meeting_id IN (SELECT id FROM meetings WHERE term_id=?)").bind(body.id),
      db.prepare("DELETE FROM group_members WHERE term_id=?").bind(body.id), db.prepare("DELETE FROM group_staff WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM group_rule_members WHERE rule_id IN (SELECT id FROM group_rules WHERE term_id=?)").bind(body.id),
      db.prepare("DELETE FROM group_rules WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM grouping_settings WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM group_constraints WHERE term_id=?").bind(body.id), db.prepare("DELETE FROM groups WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM term_students WHERE term_id=?").bind(body.id), db.prepare("UPDATE import_batches SET term_id=NULL WHERE term_id=?").bind(body.id),
      db.prepare("DELETE FROM meetings WHERE term_id=?").bind(body.id), db.prepare("DELETE FROM terms WHERE id=?").bind(body.id),
      db.prepare("UPDATE terms SET status='closed',updated_at=?").bind(timestamp),
    ];
    if (next) statements.push(db.prepare("UPDATE terms SET status='active',updated_at=? WHERE id=?").bind(timestamp, next.id));
    await db.batch(statements);
    return Response.json({ ok: true });
  }
  if (body.action === "set_meeting") {
    if (!body.termId || !body.date || !["regular", "extra", "break"].includes(body.kind ?? "")) return jsonError("모임 날짜와 상태를 확인해주세요.");
    const timestamp = now();
    await run("INSERT INTO meetings (id,term_id,meeting_date,kind,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(term_id,meeting_date) DO UPDATE SET kind=excluded.kind,title=excluded.title,updated_at=excluded.updated_at",
      [createId("meeting"), body.termId, body.date, body.kind, body.title || null, timestamp, timestamp]);
    await audit(user.id, "set_meeting", "meeting", body.date, null, body); return Response.json({ ok: true });
  }
  if (!body.name || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학기 이름과 기간을 확인해주세요.");
  const duplicate = (await all<{ id: string }>("SELECT id FROM terms WHERE lower(trim(name))=lower(trim(?)) AND id<>? LIMIT 1", [body.name, body.id || ""]))[0];
  if (duplicate) return jsonError("같은 이름의 학기가 이미 있습니다. 기존 학기를 수정하거나 삭제해주세요.");
  const id = body.id || createId("term"); const timestamp = now(); const statuses = body.eligibleStatuses?.length ? body.eligibleStatuses.join(",") : "present";
  await run("UPDATE terms SET status='closed',updated_at=? WHERE status='active' AND id<>?", [timestamp, id]);
  await run("INSERT INTO terms (id,name,start_date,end_date,eligible_statuses,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,eligible_statuses=excluded.eligible_statuses,status='active',updated_at=excluded.updated_at",
    [id, body.name.trim(), body.startDate, body.endDate, statuses, timestamp, timestamp]);
  await run("DELETE FROM meetings WHERE term_id=? AND kind IN ('regular','break') AND (meeting_date<? OR meeting_date>?)", [id, body.startDate, body.endDate]);
  const existing = new Set((await all<{ meeting_date: string }>("SELECT meeting_date FROM meetings WHERE term_id=?", [id])).map((row) => row.meeting_date));
  for (const date of saturdaysBetween(body.startDate, body.endDate)) if (!existing.has(date)) await run("INSERT INTO meetings (id,term_id,meeting_date,kind,title,created_at,updated_at) VALUES (?,?,?,'regular',NULL,?,?)", [createId("meeting"), id, date, timestamp, timestamp]);
  await audit(user.id, "save", "term", id, null, body); return Response.json({ ok: true, id });
}
