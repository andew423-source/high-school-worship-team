import { all, audit, createId, first, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";
import type { StaffRecord, StudentRecord } from "../../../lib/domain";
import { evaluateManualStageWarnings, generateStage, reorderStageIds, stageCanConfirm } from "../../../lib/stage";

export const dynamic = "force-dynamic";

type MeetingRow = { id: string; meeting_date: string; kind: string };
type ServiceRow = { id: string; term_id: string; meeting_id: string; sunday_date: string; service_part: 1 | 2; singer_slots: number; choir_slots: number; leader_type: "student" | "staff"; leader_id: string; special_notes?: string | null; status: string; updated_at?: string };
type AvailabilityRow = { staff_id: string; present: number; stage_role: "singer" | "session" };
type AssignmentRow = { service_id: string; person_type: "student" | "staff"; person_id: string; name: string; role: "leader" | "singer" | "choir"; side: "left" | "center" | "right"; position_order: number; reason: string };
type OverrideRow = { id: string; service_id: string; student_id: string; name: string; service_part: number; kind: "department" | "force"; role: "singer" | "choir" | "random" };
type EligibleStudentRow = { student_id: string; name: string; service_part: number; worship_team: string | null; gender: string | null };

function dateBefore(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function isSingerTeam(value?: string | null) { return String(value ?? "").replace(/\s/g, "") === "싱어팀"; }

async function validLeader(termId: string, leaderType: "student" | "staff", leaderId: string) {
  if (leaderType === "student") return Boolean(await first("SELECT 1 ok FROM term_students WHERE term_id=? AND student_id=? AND active=1 AND is_student_leader=1", [termId, leaderId]));
  return Boolean(await first("SELECT 1 ok FROM staff WHERE id=? AND active=1", [leaderId]));
}
async function normalizePositions(serviceId: string, role: string, side: string) { const rows = await all<{ id: string }>("SELECT id FROM stage_assignments WHERE service_id=? AND role=? AND side=? ORDER BY position_order,id", [serviceId, role, side]); for (let index = 0; index < rows.length; index += 1) await run("UPDATE stage_assignments SET position_order=? WHERE id=?", [index, rows[index].id]); }

export async function GET(request: Request) {
  const { error } = await requireApiUser(); if (error) return error;
  const url = new URL(request.url); const termId = url.searchParams.get("termId"); const sundayDate = url.searchParams.get("sundayDate");
  if (!termId) return jsonError("학기를 선택해주세요.");
  const [meetings, services, students, staff, availability, assignments, overrides] = await Promise.all([
    all<MeetingRow>("SELECT * FROM meetings WHERE term_id=? AND kind<>'break' ORDER BY meeting_date", [termId]),
    sundayDate ? all<ServiceRow>("SELECT * FROM services WHERE term_id=? AND sunday_date=? ORDER BY service_part", [termId, sundayDate]) : all<ServiceRow>("SELECT * FROM services WHERE term_id=? ORDER BY sunday_date DESC,service_part", [termId]),
    all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1 ORDER BY ts.service_part,s.name", [termId]),
    all<StaffRecord>("SELECT * FROM staff WHERE active=1 ORDER BY name"),
    sundayDate ? all<AvailabilityRow>("SELECT staff_id,present,stage_role FROM staff_availability WHERE sunday_date=?", [sundayDate]) : Promise.resolve([]),
    sundayDate ? all<AssignmentRow>("SELECT sa.*,COALESCE(s.name,st.name) name FROM stage_assignments sa LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id IN (SELECT id FROM services WHERE term_id=? AND sunday_date=?) ORDER BY sa.service_id,sa.role,sa.side,sa.position_order", [termId, sundayDate]) : Promise.resolve([]),
    sundayDate ? all<OverrideRow>("SELECT so.id,so.service_id,so.student_id,s.name,ts.service_part,so.kind,so.role FROM stage_overrides so JOIN services sv ON sv.id=so.service_id JOIN students s ON s.id=so.student_id JOIN term_students ts ON ts.student_id=so.student_id AND ts.term_id=sv.term_id WHERE sv.term_id=? AND sv.sunday_date=? ORDER BY sv.service_part,s.name", [termId, sundayDate]) : Promise.resolve([]),
  ]);

  const stats = { 1: { attendance: 0, eligibleStudents: 0 }, 2: { attendance: 0, eligibleStudents: 0 }, singerStaff: 0, sessionStaff: 0 };
  let continuity: { previousSunday: string | null; priority: Array<{ id: string; name: string; service_part: number }>; risks: Array<{ id: string; name: string; service_part: number }> } = { previousSunday: null, priority: [], risks: [] };
  let eligibleStudents: EligibleStudentRow[] = [];
  if (sundayDate) {
    const meetingId = services[0]?.meeting_id ?? meetings.find((meeting) => meeting.meeting_date === dateBefore(sundayDate))?.id;
    if (meetingId) {
      const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [termId]);
      const eligibleStatuses = (term?.eligible_statuses ?? "present").split(","); const placeholders = eligibleStatuses.map(() => "?").join(",");
      const eligibleAttendance = await all<EligibleStudentRow>(`SELECT ts.student_id,s.name,ts.service_part,ts.worship_team,ts.gender FROM attendance a JOIN term_students ts ON ts.student_id=a.student_id AND ts.term_id=? AND ts.active=1 JOIN students s ON s.id=ts.student_id WHERE a.meeting_id=? AND a.status IN (${placeholders})`, [termId, meetingId, ...eligibleStatuses]);
      eligibleStudents = eligibleAttendance.filter((item) => isSingerTeam(item.worship_team));
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
  return Response.json({ meetings, services, students, staff, availability, assignments, overrides, eligibleStudents, stats, continuity });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin", "group_staff"]); if (error || !user) return error;
  const body = await request.json() as { action: string; termId?: string; meetingId?: string; sundayDate?: string; servicePart?: 1 | 2; singerSlots?: number; choirSlots?: number; leaderType?: "student" | "staff"; leaderId?: string; staffId?: string; present?: boolean; stageRole?: "singer" | "session"; serviceId?: string; personType?: "student" | "staff"; personId?: string; studentId?: string; overrideId?: string; overrideKind?: "department" | "force"; role?: "leader" | "singer" | "choir" | "random"; side?: "left" | "center" | "right"; positionOrder?: number; positionDelta?: number; targetPosition?: number; specialNotes?: string; force?: boolean };
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
    await run("INSERT INTO services (id,term_id,meeting_id,sunday_date,service_part,singer_slots,choir_slots,leader_type,leader_id,special_notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?) ON CONFLICT(sunday_date,service_part) DO UPDATE SET meeting_id=excluded.meeting_id,singer_slots=excluded.singer_slots,choir_slots=excluded.choir_slots,leader_type=excluded.leader_type,leader_id=excluded.leader_id,special_notes=excluded.special_notes,status='draft',updated_at=excluded.updated_at", [id, body.termId, body.meetingId, body.sundayDate, body.servicePart, Math.max(0, Number(body.singerSlots) || 0), Math.max(0, Number(body.choirSlots) || 0), body.leaderType, body.leaderId, body.specialNotes?.trim() || null, timestamp, timestamp]);
    await run("UPDATE services SET leader_type=?,leader_id=?,status='draft',updated_at=? WHERE term_id=? AND sunday_date=?", [body.leaderType, body.leaderId, timestamp, body.termId, body.sundayDate]);
  } else if (body.action === "add_override" && body.serviceId && body.studentId && body.overrideKind && (body.role === "singer" || body.role === "choir" || body.role === "random")) {
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); if (!service) return jsonError("등단 설정을 먼저 저장해주세요.");
    const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [service.term_id]); const statuses = (term?.eligible_statuses ?? "present").split(",");
    const eligible = await first(`SELECT 1 ok FROM attendance a JOIN term_students ts ON ts.student_id=a.student_id AND ts.term_id=? AND ts.active=1 WHERE a.meeting_id=? AND a.student_id=? AND a.status IN (${statuses.map(() => "?").join(",")}) AND REPLACE(COALESCE(ts.worship_team,''),' ','')='싱어팀'`, [service.term_id, service.meeting_id, body.studentId, ...statuses]);
    if (!eligible) return jsonError("토요모임에 출석한 싱어팀 학생만 특별 배정할 수 있습니다.");
    await run("DELETE FROM stage_overrides WHERE student_id=? AND service_id IN (SELECT id FROM services WHERE term_id=? AND sunday_date=?)", [body.studentId, service.term_id, service.sunday_date]);
    await run("INSERT INTO stage_overrides (id,service_id,student_id,kind,role,created_at) VALUES (?,?,?,?,?,?)", [createId("override"), service.id, body.studentId, body.overrideKind, body.overrideKind === "department" ? "random" : body.role, timestamp]);
    await run("UPDATE services SET status='draft',updated_at=? WHERE id=?", [timestamp, service.id]);
  } else if (body.action === "remove_override" && body.overrideId) {
    const override = await first<{ service_id: string }>("SELECT service_id FROM stage_overrides WHERE id=?", [body.overrideId]);
    await run("DELETE FROM stage_overrides WHERE id=?", [body.overrideId]);
    if (override) await run("UPDATE services SET status='draft',updated_at=? WHERE id=?", [timestamp, override.service_id]);
  } else if (body.action === "generate" && body.serviceId) {
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); if (!service) return jsonError("등단 설정을 먼저 저장해주세요.");
    const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [service.term_id]); const eligibleStatuses = (term?.eligible_statuses ?? "present").split(",");
    const [students, staff, eligibleRows, singerStaffRows, histories, usedStaff, previousService, fixedRows, excludedRows, blockedStageRows, blockedSingerRows] = await Promise.all([
      all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [service.term_id]),
      all<StaffRecord>("SELECT * FROM staff WHERE active=1"),
      all<{ student_id: string }>(`SELECT student_id FROM attendance WHERE meeting_id=? AND status IN (${eligibleStatuses.map(() => "?").join(",")})`, [service.meeting_id, ...eligibleStatuses]),
      all<{ staff_id: string }>("SELECT staff_id FROM staff_availability WHERE sunday_date=? AND present=1 AND stage_role='singer'", [service.sunday_date]),
      all<{ person_id: string; total_count: number; singer_count: number; last_date: string | null }>("SELECT sa.person_id,COUNT(DISTINCT s.sunday_date) total_count,COUNT(DISTINCT CASE WHEN sa.role='singer' THEN s.sunday_date END) singer_count,MAX(s.sunday_date) last_date FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.status='confirmed' AND s.sunday_date>=date(?,'-28 days') GROUP BY sa.person_id", [service.sunday_date]),
      all<{ person_id: string }>("SELECT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='staff' AND s.sunday_date=? AND s.service_part<>?", [service.sunday_date, service.service_part]),
      first<{ sunday_date: string }>("SELECT sunday_date FROM services WHERE term_id=? AND sunday_date=date(?,'-7 days') AND status='confirmed' LIMIT 1", [service.term_id, service.sunday_date]),
      all<{ student_id: string; kind: "department" | "force"; role: "singer" | "choir" | "random" }>("SELECT student_id,kind,role FROM stage_overrides WHERE service_id=?", [service.id]),
      all<{ student_id: string }>("SELECT so.student_id FROM stage_overrides so JOIN services s ON s.id=so.service_id WHERE s.term_id=? AND s.sunday_date=? AND s.id<>?", [service.term_id, service.sunday_date, service.id]),
      all<{ person_id: string }>("SELECT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.term_id=? AND s.status='confirmed' AND s.sunday_date IN (date(?,'-7 days'),date(?,'-14 days')) GROUP BY sa.person_id HAVING COUNT(DISTINCT s.sunday_date)=2", [service.term_id, service.sunday_date, service.sunday_date]),
      all<{ person_id: string }>("SELECT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND sa.role='singer' AND s.term_id=? AND s.status='confirmed' AND s.sunday_date IN (date(?,'-7 days'),date(?,'-14 days')) GROUP BY sa.person_id HAVING COUNT(DISTINCT s.sunday_date)=2", [service.term_id, service.sunday_date, service.sunday_date]),
    ]);
    const eligibleStudentIds = new Set(eligibleRows.map((row) => row.student_id)); let missedPreviousWeekIds = new Set<string>();
    if (previousService) {
      const previousRows = await all<{ person_id: string }>("SELECT DISTINCT sa.person_id FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND s.term_id=? AND s.sunday_date=? AND s.status='confirmed'", [service.term_id, previousService.sunday_date]);
      const previousIds = new Set(previousRows.map((row) => row.person_id));
      missedPreviousWeekIds = new Set(students.filter((student) => student.service_part === service.service_part && isSingerTeam(student.worship_team) && eligibleStudentIds.has(student.id) && !previousIds.has(student.id)).map((student) => student.id));
    }
    const result = generateStage({ students, staff, eligibleStudentIds, presentStaffIds: new Set(singerStaffRows.map((row) => row.staff_id)), histories, servicePart: service.service_part, singerSlots: service.singer_slots, choirSlots: service.choir_slots, leaderType: service.leader_type, leaderId: service.leader_id, usedStaffIds: new Set(usedStaff.map((row) => row.person_id)), missedPreviousWeekIds, fixedStudents: fixedRows.filter((row) => row.kind === "force").map((row) => ({ studentId: row.student_id, role: row.role })), includedStudentIds: new Set(fixedRows.filter((row) => row.kind === "department").map((row) => row.student_id)), excludedStudentIds: new Set(excludedRows.map((row) => row.student_id)), blockedConsecutiveStageIds: new Set(blockedStageRows.map((row) => row.person_id)), blockedConsecutiveSingerIds: new Set(blockedSingerRows.map((row) => row.person_id)), studentRatio: .75, minimumFemaleSingers: 3 });
    if (!result.assignments.length) return jsonError(result.warnings.join(" "), 409);
    await run("DELETE FROM stage_assignments WHERE service_id=?", [service.id]);
    for (const item of result.assignments) await run("INSERT INTO stage_assignments (id,service_id,person_type,person_id,role,side,position_order,reason,is_manual,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)", [createId("stage"), service.id, item.personType, item.personId, item.role, item.side, item.positionOrder, item.reason, timestamp]);
    await audit(user.id, "generate", "service", service.id, null, result); return Response.json({ ok: true, warnings: result.warnings });
  } else if (body.action === "add_manual" && body.serviceId && body.personType && body.personId && (body.role === "singer" || body.role === "choir") && (body.side === "left" || body.side === "right")) {
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); if (!service) return jsonError("등단 설정을 먼저 저장해주세요.");
    if (await first("SELECT 1 ok FROM stage_assignments WHERE service_id=? AND person_type=? AND person_id=?", [body.serviceId, body.personType, body.personId])) return jsonError("이미 이 등단표에 있는 인원입니다.");
    if (body.personType === "staff") {
      if (body.role !== "singer") return jsonError("스탭은 싱어로만 등단할 수 있습니다.");
      if (service.leader_type === "staff" && service.leader_id === body.personId) return jsonError("인도자는 싱어로 중복 배정할 수 없습니다.");
      const valid = await first("SELECT 1 ok FROM staff st JOIN staff_availability av ON av.staff_id=st.id WHERE st.id=? AND st.active=1 AND av.sunday_date=? AND av.present=1 AND av.stage_role='singer'", [body.personId, service.sunday_date]); if (!valid) return jsonError("참석한 싱어 스탭만 등단표에 추가할 수 있습니다.");
    } else {
      const term = await first<{ eligible_statuses: string }>("SELECT eligible_statuses FROM terms WHERE id=?", [service.term_id]); const statuses = (term?.eligible_statuses ?? "present").split(",");
      const valid = await first(`SELECT 1 ok FROM attendance a JOIN term_students ts ON ts.student_id=a.student_id AND ts.term_id=? AND ts.active=1 WHERE a.meeting_id=? AND a.student_id=? AND a.status IN (${statuses.map(() => "?").join(",")}) AND REPLACE(COALESCE(ts.worship_team,''),' ','')='싱어팀'`, [service.term_id, service.meeting_id, body.personId, ...statuses]); if (!valid) return jsonError("토요모임에 출석한 싱어팀 학생만 등단표에 추가할 수 있습니다.");
      if (await first("SELECT 1 ok FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND sa.person_id=? AND s.term_id=? AND s.sunday_date=?", [body.personId, service.term_id, service.sunday_date])) return jsonError("이 학생은 같은 주일의 다른 등단표에 이미 배정되어 있습니다.");
      const previous = await all<{ sunday_date: string; role: string }>("SELECT s.sunday_date,MAX(sa.role) role FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND sa.person_id=? AND s.term_id=? AND s.status='confirmed' AND s.sunday_date IN (date(?,'-7 days'),date(?,'-14 days')) GROUP BY s.sunday_date", [body.personId, service.term_id, service.sunday_date, service.sunday_date]); const warnings: string[] = [];
      const person = await first<{ name: string }>("SELECT name FROM students WHERE id=?", [body.personId]); if (previous.length >= 2) warnings.push(`${person?.name ?? "선택한"} 학생이 3주 연속 등단하게 됩니다.`); const sameRole = previous.filter((item) => item.role === body.role).length; if (sameRole >= 2 && !(body.role === "singer" && service.choir_slots === 0)) warnings.push(`${person?.name ?? "선택한"} 학생이 3주 연속 ${body.role === "singer" ? "싱어" : "콰이어"}가 됩니다.`);
      if (warnings.length && !body.force) return Response.json({ error: warnings.join(" "), requiresConfirmation: true, warnings }, { status: 409 });
    }
    const reason = body.personType === "student" ? "반에서 예배하기 명단에서 수동으로 추가" : "등단하지 않는 스탭 명단에서 수동으로 추가"; const id = createId("stage");
    await run("INSERT INTO stage_assignments (id,service_id,person_type,person_id,role,side,position_order,reason,is_manual,created_at) VALUES (?,?,?,?,?,?,999999,?,1,?)", [id, body.serviceId, body.personType, body.personId, body.role, body.side, reason, timestamp]);
    const targetRows = await all<{ id: string }>("SELECT id FROM stage_assignments WHERE service_id=? AND role=? AND side=? AND id<>? ORDER BY position_order,id", [body.serviceId, body.role, body.side, id]); const orderedIds = reorderStageIds(targetRows.map((row) => row.id), id, Number(body.targetPosition ?? targetRows.length)); for (let index = 0; index < orderedIds.length; index += 1) await run("UPDATE stage_assignments SET position_order=? WHERE id=?", [index, orderedIds[index]]); await run("UPDATE services SET status='draft',updated_at=? WHERE id=?", [timestamp, body.serviceId]);
  } else if (body.action === "remove_assignment" && body.serviceId && body.personType && body.personId) {
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); const current = await first<{ id: string; role: "leader" | "singer" | "choir"; side: "left" | "center" | "right"; name: string; gender: string | null }>("SELECT sa.id,sa.role,sa.side,COALESCE(s.name,st.name) name,COALESCE(ts.gender,st.gender) gender FROM stage_assignments sa JOIN services sv ON sv.id=sa.service_id LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN term_students ts ON sa.person_type='student' AND ts.student_id=sa.person_id AND ts.term_id=sv.term_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id=? AND sa.person_type=? AND sa.person_id=?", [body.serviceId, body.personType, body.personId]); if (!service || !current) return jsonError("등단표에서 뺄 인원을 찾을 수 없습니다."); if (current.role === "leader") return jsonError("인도자는 등단표에서 뺄 수 없습니다.");
    const warnings: string[] = []; if (body.personType === "student") { const previousService = await first("SELECT 1 ok FROM services WHERE term_id=? AND sunday_date=date(?,'-7 days') AND status='confirmed'", [service.term_id, service.sunday_date]); const previousAssignment = previousService ? await first("SELECT 1 ok FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND sa.person_id=? AND s.term_id=? AND s.sunday_date=date(?,'-7 days') AND s.status='confirmed'", [body.personId, service.term_id, service.sunday_date]) : null; if (previousService && !previousAssignment) warnings.push(`${current.name} 학생은 지난주에도 등단하지 않아 이번에 빼면 2주 연속 반에서 예배하게 됩니다.`); }
    if (current.role === "singer" && String(current.gender ?? "").includes("여")) { const female = await first<{ count: number }>("SELECT COUNT(*) count FROM stage_assignments sa JOIN services sv ON sv.id=sa.service_id LEFT JOIN term_students ts ON sa.person_type='student' AND ts.student_id=sa.person_id AND ts.term_id=sv.term_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id=? AND sa.role='singer' AND sa.id<>? AND COALESCE(ts.gender,st.gender,'') LIKE '%여%'", [body.serviceId, current.id]); const required = Math.min(3, service.singer_slots); if (Number(female?.count ?? 0) < required) warnings.push(`${current.name}을(를) 빼면 여자 싱어가 ${female?.count ?? 0}명으로 최소 ${required}명보다 적어집니다.`); }
    if (warnings.length && !body.force) return Response.json({ error: warnings.join(" "), requiresConfirmation: true, warnings }, { status: 409 });
    await run("DELETE FROM stage_assignments WHERE id=?", [current.id]); await normalizePositions(body.serviceId, current.role, current.side); await run("UPDATE services SET status='draft',updated_at=? WHERE id=?", [timestamp, body.serviceId]);
  } else if (body.action === "move" && body.serviceId && body.personType && body.personId && (body.role === "singer" || body.role === "choir") && body.side) {
    if (body.personType === "staff" && body.role !== "singer") return jsonError("스탭은 싱어로만 등단할 수 있습니다.");
    const current = await first<{ id: string; role: "singer" | "choir"; side: "left" | "right"; position_order: number; name: string; gender: string | null }>("SELECT sa.id,sa.role,sa.side,sa.position_order,COALESCE(s.name,st.name) name,COALESCE(s.gender,st.gender) gender FROM stage_assignments sa LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id=? AND sa.person_type=? AND sa.person_id=?", [body.serviceId, body.personType, body.personId]);
    const service = await first<ServiceRow>("SELECT * FROM services WHERE id=?", [body.serviceId]); if (!current || !service) return jsonError("이동할 등단 인원을 찾을 수 없습니다.");
    if (body.personType === "student" && current.role !== body.role) {
      const previous = await all<{ sunday_date: string; role: string }>("SELECT s.sunday_date,MAX(sa.role) role FROM stage_assignments sa JOIN services s ON s.id=sa.service_id WHERE sa.person_type='student' AND sa.person_id=? AND s.term_id=? AND s.status='confirmed' AND s.sunday_date IN (date(?,'-7 days'),date(?,'-14 days')) GROUP BY s.sunday_date", [body.personId, service.term_id, service.sunday_date, service.sunday_date]);
      const currentAssignments = await all<{ personId: string; role: string; gender: string | null }>("SELECT sa.person_id personId,sa.role,COALESCE(s.gender,st.gender) gender FROM stage_assignments sa LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sa.service_id=? AND sa.role IN ('singer','choir')", [body.serviceId]);
      const warnings = evaluateManualStageWarnings({ personId: body.personId, personName: current.name, newRole: body.role, previousRoles: previous.map((item) => item.role), assignments: currentAssignments, singerSlots: service.singer_slots, choirSlots: service.choir_slots, minimumFemaleSingers: 3 });
      if (warnings.length && !body.force) return Response.json({ error: warnings.join(" "), requiresConfirmation: true, warnings }, { status: 409 });
    }
    const oldRole = current.role; const oldSide = current.side;
    if (Number.isFinite(body.targetPosition)) {
      await run("UPDATE stage_assignments SET role=?,side=?,position_order=999999,is_manual=1 WHERE id=?", [body.role, body.side, current.id]);
      if (oldRole !== body.role || oldSide !== body.side) await normalizePositions(body.serviceId, oldRole, oldSide);
      const targetRows = await all<{ id: string }>("SELECT id FROM stage_assignments WHERE service_id=? AND role=? AND side=? AND id<>? ORDER BY position_order,id", [body.serviceId, body.role, body.side, current.id]);
      const orderedIds = reorderStageIds(targetRows.map((row) => row.id), current.id, Number(body.targetPosition));
      for (let index = 0; index < orderedIds.length; index += 1) await run("UPDATE stage_assignments SET position_order=? WHERE id=?", [index, orderedIds[index]]);
    } else if (body.positionDelta && current.role === body.role && current.side === body.side) {
      const target = await first<{ id: string; position_order: number }>("SELECT id,position_order FROM stage_assignments WHERE service_id=? AND role=? AND side=? AND position_order=?", [body.serviceId, current.role, current.side, current.position_order + Math.sign(body.positionDelta)]);
      if (target) { await run("UPDATE stage_assignments SET position_order=?,is_manual=1 WHERE id=?", [current.position_order, target.id]); await run("UPDATE stage_assignments SET position_order=?,is_manual=1 WHERE id=?", [target.position_order, current.id]); }
    } else {
      const max = await first<{ value: number }>("SELECT COALESCE(MAX(position_order),-1)+1 value FROM stage_assignments WHERE service_id=? AND role=? AND side=?", [body.serviceId, body.role, body.side]);
      await run("UPDATE stage_assignments SET role=?,side=?,position_order=?,is_manual=1 WHERE id=?", [body.role, body.side, max?.value ?? 0, current.id]);
    }
    await normalizePositions(body.serviceId, oldRole, oldSide); await normalizePositions(body.serviceId, body.role, body.side); await run("UPDATE services SET status='draft',updated_at=? WHERE id=?", [timestamp, body.serviceId]);
  } else if (body.action === "confirm" && body.serviceId) {
    const service = await first<{ singer_slots: number; choir_slots: number }>("SELECT singer_slots,choir_slots FROM services WHERE id=?", [body.serviceId]);
    const counts = await all<{ role: string; count: number }>("SELECT role,COUNT(*) count FROM stage_assignments WHERE service_id=? GROUP BY role", [body.serviceId]); const byRole = new Map(counts.map((row) => [row.role, Number(row.count)]));
    if (!service || !stageCanConfirm(byRole)) return jsonError("인도자가 1명 배정되어야 확정할 수 있습니다.", 409);
    await run("UPDATE services SET status='confirmed',updated_at=? WHERE id=?", [timestamp, body.serviceId]);
  } else return jsonError("지원하지 않는 작업입니다.");
  await audit(user.id, body.action, "stage", body.serviceId ?? body.sundayDate ?? null, null, body); return Response.json({ ok: true });
}
