import { all, audit, createId, first, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";
import type { AttendanceStatus } from "../../../lib/domain";

export const dynamic = "force-dynamic";
const statuses = new Set<AttendanceStatus>(["present", "late", "left_early", "absent", "excused", "unset"]);

async function permittedGroupIds(user: { role: string; staffId: string | null }, termId: string) {
  if (user.role === "admin") return (await all<{ id: string }>("SELECT id FROM groups WHERE term_id=?", [termId])).map((row) => row.id);
  if (!user.staffId) return [];
  return (await all<{ group_id: string }>("SELECT group_id FROM group_staff WHERE term_id=? AND staff_id=?", [termId, user.staffId])).map((row) => row.group_id);
}

export async function GET(request: Request) {
  const { user, error } = await requireApiUser(["admin", "group_staff"]); if (error || !user) return error;
  const url = new URL(request.url); const termId = url.searchParams.get("termId"); const meetingId = url.searchParams.get("meetingId");
  if (!termId) return jsonError("학기를 선택해주세요.");
  const groupIds = await permittedGroupIds(user, termId);
  if (!groupIds.length) return Response.json({ meetings: [], groups: [], rows: [], summary: { total: 0, unset: 0 } });
  const marks = groupIds.map(() => "?").join(",");
  const [meetings, groups, rows] = await Promise.all([
    all("SELECT * FROM meetings WHERE term_id=? AND kind<>'break' ORDER BY meeting_date DESC", [termId]),
    all(`SELECT * FROM groups WHERE id IN (${marks}) ORDER BY sort_order`, groupIds),
    meetingId ? all(`SELECT gm.group_id,s.id student_id,s.name,s.grade,s.service_part,COALESCE(a.status,'unset') status,COALESCE(a.note,'') note FROM group_members gm JOIN students s ON s.id=gm.student_id LEFT JOIN attendance a ON a.student_id=s.id AND a.meeting_id=? WHERE gm.term_id=? AND gm.group_id IN (${marks}) ORDER BY gm.group_id,s.name`, [meetingId, termId, ...groupIds]) : Promise.resolve([]),
  ]);
  const unset = (rows as Array<{ status: string }>).filter((row) => row.status === "unset").length;
  return Response.json({ meetings, groups, rows, summary: { total: rows.length, unset } });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin", "group_staff"]); if (error || !user) return error;
  const body = await request.json() as { meetingId?: string; studentId?: string; status?: AttendanceStatus; note?: string };
  if (!body.meetingId || !body.studentId || !body.status || !statuses.has(body.status)) return jsonError("출결 정보를 확인해주세요.");
  const meeting = await first<{ term_id: string; kind: string }>("SELECT term_id,kind FROM meetings WHERE id=?", [body.meetingId]);
  if (!meeting || meeting.kind === "break") return jsonError("출결을 입력할 수 없는 날짜입니다.", 409);
  const allowedGroups = await permittedGroupIds(user, meeting.term_id);
  const membership = await first("SELECT id FROM group_members WHERE term_id=? AND student_id=? AND group_id IN (SELECT id FROM groups WHERE term_id=?)", [meeting.term_id, body.studentId, meeting.term_id]);
  const allowed = user.role === "admin" || await first("SELECT id FROM group_members WHERE term_id=? AND student_id=? AND group_id IN (SELECT group_id FROM group_staff WHERE term_id=? AND staff_id=?)", [meeting.term_id, body.studentId, meeting.term_id, user.staffId]);
  if (!membership || !allowed || !allowedGroups.length) return jsonError("담당 조 학생만 입력할 수 있습니다.", 403);
  const timestamp = now();
  if (body.status === "unset") await run("DELETE FROM attendance WHERE meeting_id=? AND student_id=?", [body.meetingId, body.studentId]);
  else await run("INSERT INTO attendance (id,meeting_id,student_id,status,note,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(meeting_id,student_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at", [createId("attendance"), body.meetingId, body.studentId, body.status, body.note || null, user.id, timestamp, timestamp]);
  await audit(user.id, "attendance", "student", body.studentId, null, body); return Response.json({ ok: true });
}
