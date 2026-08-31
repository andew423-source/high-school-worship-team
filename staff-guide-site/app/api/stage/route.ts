import { all, audit, createId, first, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";
import type { StaffRecord, StudentRecord } from "../../../lib/domain";
import { generateStage } from "../../../lib/stage";

export const dynamic = "force-dynamic";

type MeetingRow = { id: string; meeting_date: string; kind: string };
type ServiceRow = { id: string; term_id: string; meeting_id: string; sunday_date: string; service_part: 1 | 2; singer_slots: number; choir_slots: number; leader_type: "student" | "staff"; leader_id: string; status: string; updated_at?: string };
type AvailabilityRow = { staff_id: string; present: number; stage_role: "singer" | "session" };
type AssignmentRow = { service_id: string; person_type: "student" | "staff"; person_id: string; name: string; role: "leader" | "singer" | "choir"; side: "left" | "center" | "right"; position_order: number; reason: string };

function dateBefore(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function isSingerTeam(value?: string | null) { return String(value ?? "").replace(/\s/g, "") === "싱어팀"; }

async function validLeader(termId: string, leaderType: "student" | "staff", leaderId: string) {
  if (leaderType === "student") return Boolean(await first("SELECT 1 ok FROM term_students WHERE term_id=? AND student_id=? AND active=1 AND is_student_leader=1", [termId, leaderId]));
  return Boolean(await first("SELECT 1 ok FROM staff WHERE id=? AND active=1", [leaderId]));
}

export async function GET(request: Request) {
  const { error } = await requireApiUser(); if (error) return error;
  const url = new URL(request.url); const termId = url.searchParams.get("termId"); const sundayDate = url.searchParams.get("sundayDate");
  if (!termId) return jsonError("학기를 선택해주세요.");
  const [meetings, services, students, staff, availability, assignments] = await Promise.all([
    all<MeetingRow>("SELECT * FROM meetings WHERE term_id=? AND kind<>'break' ORDER BY meeting_date", [termId]),
    sundayDate ? all<ServiceRow>("SELECT * FROM services WHERE term_id=? AND sunday_date=? ORDER BY service_part", [termId, sundayDate]) : all<ServiceRow>("SELECT * FROM services WHERE term_id=? ORDER BY sunday_date DESC,service_part", [termId]),
    all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1 ORDER BY ts.service_part,s.name", [termId]),
    all<StaffRecord>("SELECT * FROM staff WHERE active=1 ORDER BY name"),
    sundayDate ? all<AvailabilityRow>("SELECT staff_id,present,stage_role FROM staff_availability WHERE sunday_date=?", [sundayDate]) : Promise.resolve([]),
    sundayDate ? all<AssignmentRow>("SELECT sa.*,COALESCE(s.name,st.name) name FROM stage_assignments sa LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id IN (SELECT id FROM services WHERE term_id=? AND sunday_date=?) ORDER BY sa.service_id,sa.role,sa.side,sa.position_order", [termId, sundayDate]) : Promise.resolve([]),
  ]);

  const stats = { 1: { attendance: 0, eligibleStudents: 0 }, 2: { attendance: 0, eligibleStudents: 0 }, singerStaff: 0, sessionStaff: 0 };
  let continuity: { previousSunday: string | null; priority: Array<{ id: string; name: string; service_part: number }>; risks: Array<{ id: string; name: string; service_part: number }> } = { previousSunday: null, priority: [], risks: [] };
  if (sundayDate) {
    const meetingId = services[0]?.meeting_id ?? meetings.find((meeting) => meeting.meeting_date === dateBefore(sundayDate))?.id;
    if (meetingId) {
      const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [termId]);
      const eligibleStatuses = (term?.eligible_statuses ?? "present").split(","); const placeholders = eligibleStatuses.map(() => "?").join(",");
      const eligibleAttendance = await all<{ student_id: string; service_part: number; worship_team: string | null }>(`SELECT ts.student_id,ts.service_part,ts.worship_team FROM attendance a JOIN term_students ts ON ts.student_id=a.student_id AND ts.term_id=? AND ts.active=1 WHERE a.meeting_id=? AND a.status IN (${placeholders})`, [termId, meetingId, ...eligibleStatuses]);
      for (const row of eligibleAttendance) { const part = row.service_part === 2 ? 2 : 1; stats[part].attendance += 1; if (isSingerTeam(row.worship_team)) stats[part].eligibleStudents += 1; }
      stats.singerStaff = availability.filter((item) => item.present && item.stage_role === "singer").length;
      stats.sessionStaff = availability.filter((item) => item.present && item.stage_role === "session").length;

      const previous = await first<{ sunday_date: string }>("SELECT sunday_date FROM services WHERE term_id=? AND sunday_date=date(?,'-7 days') AND status='confirmed' LIMIT 1", [termId, sundayDate]);
      if (previous) {
        const previousAssignments = await all<{ person_id: string }>("SELECT DISTINCT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.term_id=? AND s.sunday_date=? AND s.status='confirmed'", [termId, previous.sunday_date]);
        const previousIds = new Set(previousAssignments.map((item) => item.person_id)); const currentIds = new Set(assignments.filter((item) => item.person_type === "student").map((item) => item.person_id));
        const eligibleIds = new Set(eligibleAttendance.filter((item) => isSingerTeam(item.worship_team)).map((item) => item.student_id));
        const priority = students.filter((student) => eligibleIds.has(student.id) && !previousIds.has(student.id)).map((student) => ({ id: student.id, name: student.name, service_part: student.service_part }));
        continuity = { previousSunday: previous.sunday_date, priority, risks: priority.filter((student) => !currentIds.has(student.id)) };
      }
    }
  }
  return Response.json({ meetings, services, students, staff, availability, assignments, stats, continuity });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action: string; termId?: string; meetingId?: string; sundayDate?: string; servicePart?: 1 | 2; singerSlots?: number; choirSlots?: number; leaderType?: "student" | "staff"; leaderId?: string; staffId?: string; present?: boolean; stageRole?: "singer" | "session"; serviceId?: string; personType?: "student" | "staff"; personId?: string; role?: "leader" | "singer" | "choir"; side?: "left" | "center" | "right"; positionOrder?: number };
  const timestamp = now();
  if (body.action === "availability" && body.sundayDate && body.staffId) {
    const stageRole = body.stageRole === "singer" ? "singer" : "session";
    await run("INSERT INTO staff_availability (id,sunday_date,staff_id,present,stage_role,updated_by,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(sunday_date,staff_id) DO UPDATE SET present=excluded.present,stage_role=excluded.stage_role,updated_by=excluded.updated_by,updated_at=excluded.updated_at", [createId("available"), body.sundayDate, body.staffId, Number(Boolean(body.present)), stageRole, user.id, timestamp]);
  } else if (body.action === "save_leader" && body.termId && body.meetingId && body.sundayDate && body.leaderType && body.leaderId) {
    if (!(await validLeader(body.termId, body.leaderType, body.leaderId))) return jsonError("학생 인도자 또는 활성 스탭을 선택해주세요.");
    for (const part of [1, 2] as const) {
      const id = (await first<{ id: string }>("SELECT id FROM services WHERE sunday_date=? AND service_part=?", [body.sundayDate, part]))?.id ?? createId("service");
      await run("INSERT INTO services (id,term_id,meeting_id,sunday_date,service_part,singer_slots,choir_slots,leader_type,leader_id,status,created_at,updated_at) VALUES (?,?,?,?,?,6,4,?,?,'draft',?,?) ON CONFLICT(sunday_date,service_part) DO UPDATE SET term_id=excluded.term_id,meeting_id=excluded.meeting_id,leader_type=excluded.leader_type,leader_id=excluded.leader_id,status='draft',updated_at=excluded.updated_at", [id, body.termId, body.meetingId, body.sundayDate, part, body.leaderType, body.leaderId, timestamp, timestamp]);
    }
  } else if (body.action === "save_config" && body.termId && body.meetingId && body.sundayDate && body.servicePart && body.leaderType && body.leaderId) {
    if (!(await validLeader(body.termId, body.leaderType, body.leaderId))) return jsonError("인도자를 선택해주세요.");
    const id = (await first<{ id: string }>("SELECT id FROM services WHERE sunday_date=? AND service_part=?", [body.sundayDate, body.servicePart]))?.id ?? createId("service");
    await run("INSERT INTO services (id,term_id,meeting_id,sunday_date,service_part,singer_slots,choir_slots,leader_type,leader_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?) ON CONFLICT(sunday_date,service_part) DO UPDATE SET meeting_id=excluded.meeting_id,singer_slots=excluded.singer_slots,choir_slots=excluded.choir_slots,leader_type=excluded.leader_type,leader_id=excluded.leader_id,status='draft',updated_at=excluded.updated_at", [id, body.termId, body.meetingId, body.sundayDate, body.servicePart, Math.max(0, Number(body.singerSlots) || 0), Math.max(0, Number(body.choirSlots) || 0), body.leaderType, body.leaderId, timestamp, timestamp]);
    await run("UPDATE services SET leader_type=?,leader_id=?,status='draft',updated_at=? WHERE term_id=? AND sunday_date=?", [body.leaderType, body.leaderId, timestamp, body.termId, body.sundayDate]);
  } else if (body.action === "generate" && body.serviceId) {
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); if (!service) return jsonError("등단 설정을 먼저 저장해주세요.");
    const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [service.term_id]); const eligibleStatuses = (term?.eligible_statuses ?? "present").split(",");
    const [students, staff, eligibleRows, singerStaffRows, histories, usedStaff, previousService] = await Promise.all([
      all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [service.term_id]),
      all<StaffRecord>("SELECT * FROM staff WHERE active=1"),
      all<{ student_id: string }>(`SELECT student_id FROM attendance WHERE meeting_id=? AND status IN (${eligibleStatuses.map(() => "?").join(",")})`, [service.meeting_id, ...eligibleStatuses]),
      all<{ staff_id: string }>("SELECT staff_id FROM staff_availability WHERE sunday_date=? AND present=1 AND stage_role='singer'", [service.sunday_date]),
      all<{ person_id: string; total_count: number; singer_count: number; last_date: string | null }>("SELECT sa.person_id,COUNT(DISTINCT s.sunday_date) total_count,COUNT(DISTINCT CASE WHEN sa.role='singer' THEN s.sunday_date END) singer_count,MAX(s.sunday_date) last_date FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.status='confirmed' AND s.sunday_date>=date(?,'-28 days') GROUP BY sa.person_id", [service.sunday_date]),
      all<{ person_id: string }>("SELECT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='staff' AND s.sunday_date=? AND s.service_part<>?", [service.sunday_date, service.service_part]),
      first<{ sunday_date: string }>("SELECT sunday_date FROM services WHERE term_id=? AND sunday_date=date(?,'-7 days') AND status='confirmed' LIMIT 1", [service.term_id, service.sunday_date]),
    ]);
    const eligibleStudentIds = new Set(eligibleRows.map((row) => row.student_id)); let missedPreviousWeekIds = new Set<string>();
    if (previousService) {
      const previousRows = await all<{ person_id: string }>("SELECT DISTINCT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.term_id=? AND s.sunday_date=? AND s.status='confirmed'", [service.term_id, previousService.sunday_date]);
      const previousIds = new Set(previousRows.map((row) => row.person_id));
      missedPreviousWeekIds = new Set(students.filter((student) => student.service_part === service.service_part && isSingerTeam(student.worship_team) && eligibleStudentIds.has(student.id) && !previousIds.has(student.id)).map((student) => student.id));
    }
    const result = generateStage({ students, staff, eligibleStudentIds, presentStaffIds: new Set(singerStaffRows.map((row) => row.staff_id)), histories, servicePart: service.service_part, singerSlots: service.singer_slots, choirSlots: service.choir_slots, leaderType: service.leader_type, leaderId: service.leader_id, usedStaffIds: new Set(usedStaff.map((row) => row.person_id)), missedPreviousWeekIds });
    if (!result.assignments.length) return jsonError(result.warnings.join(" "), 409);
    await run("DELETE FROM stage_assignments WHERE service_id=?", [service.id]);
    for (const item of result.assignments) await run("INSERT INTO stage_assignments (id,service_id,person_type,person_id,role,side,position_order,reason,is_manual,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)", [createId("stage"), service.id, item.personType, item.personId, item.role, item.side, item.positionOrder, item.reason, timestamp]);
    await audit(user.id, "generate", "service", service.id, null, result); return Response.json({ ok: true, warnings: result.warnings });
  } else if (body.action === "move" && body.serviceId && body.personType && body.personId && body.role && body.side) {
    if (body.personType === "staff" && body.role !== "singer") return jsonError("스탭은 싱어로만 등단할 수 있습니다.");
    await run("UPDATE stage_assignments SET role=?,side=?,position_order=?,is_manual=1 WHERE service_id=? AND person_type=? AND person_id=?", [body.role, body.side, Number(body.positionOrder) || 0, body.serviceId, body.personType, body.personId]);
  } else if (body.action === "confirm" && body.serviceId) {
    const service = await first<{ singer_slots: number; choir_slots: number }>("SELECT singer_slots,choir_slots FROM services WHERE id=?", [body.serviceId]);
    const counts = await all<{ role: string; count: number }>("SELECT role,COUNT(*) count FROM stage_assignments WHERE service_id=? GROUP BY role", [body.serviceId]); const byRole = new Map(counts.map((row) => [row.role, Number(row.count)]));
    if (!service || byRole.get("leader") !== 1 || byRole.get("singer") !== service.singer_slots || byRole.get("choir") !== service.choir_slots) return jsonError("인도자와 역할별 정원이 모두 채워져야 확정할 수 있습니다.", 409);
    await run("UPDATE services SET status='confirmed',updated_at=? WHERE id=?", [timestamp, body.serviceId]);
  } else return jsonError("지원하지 않는 작업입니다.");
  await audit(user.id, body.action, "stage", body.serviceId ?? body.sundayDate ?? null, null, body); return Response.json({ ok: true });
}
