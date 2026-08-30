import { all, audit, createId, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";
import { autoAssignGroups } from "../../../lib/grouping";
import type { GroupConstraint, GroupRecord, StaffRecord, StudentRecord } from "../../../lib/domain";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { error } = await requireApiUser(); if (error) return error;
  const termId = new URL(request.url).searchParams.get("termId"); if (!termId) return jsonError("학기를 선택해주세요.");
  const [groups, members, assignedStaff, constraints, students, staff] = await Promise.all([
    all<GroupRecord>("SELECT * FROM groups WHERE term_id=? ORDER BY sort_order,name", [termId]),
    all("SELECT gm.*,s.name,ts.grade,ts.gender,ts.service_part FROM group_members gm JOIN students s ON s.id=gm.student_id JOIN term_students ts ON ts.term_id=gm.term_id AND ts.student_id=gm.student_id WHERE gm.term_id=?", [termId]),
    all("SELECT gs.*,s.name,s.can_lead_group FROM group_staff gs JOIN staff s ON s.id=gs.staff_id WHERE gs.term_id=?", [termId]),
    all<GroupConstraint>("SELECT * FROM group_constraints WHERE term_id=? ORDER BY created_at", [termId]),
    all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1 ORDER BY ts.service_part,s.name", [termId]), all<StaffRecord>("SELECT * FROM staff WHERE active=1 ORDER BY name"),
  ]);
  return Response.json({ groups, members, assignedStaff, constraints, students, staff });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action: string; termId: string; count?: number; capacity?: number; requiredStaff?: number; groupId?: string | null; studentId?: string; staffId?: string; type?: "together" | "apart"; studentAId?: string; studentBId?: string; seed?: number };
  if (!body.termId) return jsonError("학기를 선택해주세요."); const timestamp = now();
  if (body.action === "configure") {
    const count = Math.max(1, Math.min(30, Number(body.count) || 1)); const capacity = Math.max(1, Number(body.capacity) || 1); const requiredStaff = Math.max(0, Number(body.requiredStaff) || 0);
    const confirmed = await all("SELECT id FROM groups WHERE term_id=? AND status='confirmed' LIMIT 1", [body.termId]); if (confirmed.length) return jsonError("확정된 조 편성은 초기화할 수 없습니다.", 409);
    await run("DELETE FROM group_members WHERE term_id=?", [body.termId]); await run("DELETE FROM group_staff WHERE term_id=?", [body.termId]); await run("DELETE FROM groups WHERE term_id=?", [body.termId]);
    for (let index = 0; index < count; index += 1) await run("INSERT INTO groups (id,term_id,name,capacity,required_staff,status,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?)", [createId("group"), body.termId, `${index + 1}조`, capacity, requiredStaff, index, timestamp, timestamp]);
  } else if (body.action === "assign_student" && body.studentId) {
    if (!(await all("SELECT id FROM term_students WHERE term_id=? AND student_id=? AND active=1", [body.termId, body.studentId])).length) return jsonError("선택한 학기 명단에 없는 학생입니다.", 409);
    await run("DELETE FROM group_members WHERE term_id=? AND student_id=?", [body.termId, body.studentId]);
    if (body.groupId) {
      const group = (await all<GroupRecord>("SELECT * FROM groups WHERE id=? AND term_id=?", [body.groupId, body.termId]))[0];
      const count = (await all<{ count: number }>("SELECT COUNT(*) count FROM group_members WHERE group_id=?", [body.groupId]))[0]?.count ?? 0;
      if (!group || count >= group.capacity) return jsonError("조 정원을 초과할 수 없습니다.", 409);
      await run("INSERT INTO group_members (id,term_id,group_id,student_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)", [createId("member"), body.termId, body.groupId, body.studentId, user.id, timestamp]);
    }
  } else if (body.action === "assign_staff" && body.groupId) {
    await run("DELETE FROM group_staff WHERE term_id=? AND group_id=?", [body.termId, body.groupId]);
    if (body.staffId) {
      await run("DELETE FROM group_staff WHERE term_id=? AND staff_id=?", [body.termId, body.staffId]);
      await run("INSERT INTO group_staff (id,term_id,group_id,staff_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)", [createId("groupstaff"), body.termId, body.groupId, body.staffId, user.id, timestamp]);
    }
  } else if (body.action === "add_constraint" && body.type && body.studentAId && body.studentBId) {
    if (body.studentAId === body.studentBId) return jsonError("서로 다른 학생을 선택해주세요.");
    const conflict = await all("SELECT id FROM group_constraints WHERE term_id=? AND ((student_a_id=? AND student_b_id=?) OR (student_a_id=? AND student_b_id=?)) AND type<>?", [body.termId, body.studentAId, body.studentBId, body.studentBId, body.studentAId, body.type]);
    if (conflict.length) return jsonError("반대 조건이 이미 등록되어 있습니다.", 409);
    await run("INSERT INTO group_constraints (id,term_id,type,student_a_id,student_b_id,created_at) VALUES (?,?,?,?,?,?)", [createId("constraint"), body.termId, body.type, body.studentAId, body.studentBId, timestamp]);
  } else if (body.action === "auto") {
    const [students, groups, constraints, staff] = await Promise.all([all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [body.termId]), all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]), all<GroupConstraint>("SELECT * FROM group_constraints WHERE term_id=?", [body.termId]), all<StaffRecord>("SELECT * FROM staff WHERE active=1 AND can_lead_group=1 ORDER BY name")]);
    const result = autoAssignGroups(students, groups, constraints, Number(body.seed) || 1); if (result.error) return jsonError(result.error, 409);
    await run("DELETE FROM group_members WHERE term_id=?", [body.termId]);
    for (const assignment of result.assignments) await run("INSERT INTO group_members (id,term_id,group_id,student_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)", [createId("member"), body.termId, assignment.groupId, assignment.studentId, user.id, timestamp]);
    await run("DELETE FROM group_staff WHERE term_id=?", [body.termId]); let staffIndex = 0;
    for (const group of groups.sort((a, b) => a.sort_order - b.sort_order)) for (let slot = 0; slot < group.required_staff && staffIndex < staff.length; slot += 1) {
      await run("INSERT INTO group_staff (id,term_id,group_id,staff_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)", [createId("groupstaff"), body.termId, group.id, staff[staffIndex].id, user.id, timestamp]); staffIndex += 1;
    }
    await audit(user.id, "auto_assign", "groups", body.termId, null, { seed: body.seed, score: result.score }); return Response.json({ ok: true, score: result.score, warnings: staffIndex < groups.reduce((sum, group) => sum + group.required_staff, 0) ? ["조 담당 가능 스탭이 부족합니다."] : [] });
  } else if (body.action === "confirm") {
    const [unassigned, overCapacity, staffShortage] = await Promise.all([
      all("SELECT student_id FROM term_students WHERE term_id=? AND active=1 AND student_id NOT IN (SELECT student_id FROM group_members WHERE term_id=?)", [body.termId, body.termId]),
      all("SELECT g.id FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id WHERE g.term_id=? GROUP BY g.id,g.capacity HAVING COUNT(gm.id)>g.capacity", [body.termId]),
      all("SELECT g.id FROM groups g LEFT JOIN group_staff gs ON gs.group_id=g.id WHERE g.term_id=? GROUP BY g.id,g.required_staff HAVING COUNT(gs.id)<g.required_staff", [body.termId]),
    ]);
    if (unassigned.length || overCapacity.length || staffShortage.length) return jsonError(`확정할 수 없습니다. 미배정 ${unassigned.length}명, 정원 초과 ${overCapacity.length}조, 담당 스탭 부족 ${staffShortage.length}조`, 409);
    await run("UPDATE groups SET status='confirmed',updated_at=? WHERE term_id=?", [timestamp, body.termId]);
  } else return jsonError("지원하지 않는 작업입니다.");
  await audit(user.id, body.action, "groups", body.termId, null, body); return Response.json({ ok: true });
}
