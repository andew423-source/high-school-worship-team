import { all, audit, createId, getD1, now, run } from "../../../db/runtime";
import { jsonError, requireApiUser } from "../../../lib/api-auth";
import { autoAssignGroups, evaluateAssignmentWarnings } from "../../../lib/grouping";
import type { GroupConstraint, GroupingSettings, GroupRecord, StaffRecord, StudentRecord } from "../../../lib/domain";

export const dynamic = "force-dynamic";
type SettingsRow = { term_id: string; student_min: number; student_max: number; staff_min: number; staff_max: number; cluster_gender: number; cluster_grade: number; split_worship_role: number };
type RuleRow = { id: string; term_id: string; type: string; config_json: string; created_at: string };
type RuleMember = { rule_id: string; student_id: string; name?: string };
const defaultSettings = (groups: GroupRecord[]): GroupingSettings => ({ studentMin: 1, studentMax: groups[0]?.capacity ?? 8, staffMin: groups[0]?.required_staff ?? 1, staffMax: groups[0]?.required_staff ?? 1, clusterGender: false, clusterGrade: false, splitWorshipRole: false, minimumRules: [] });
function normalizeSettings(row: SettingsRow | undefined, groups: GroupRecord[], rules: RuleRow[]): GroupingSettings {
  const base = defaultSettings(groups); const minimumRules = rules.filter((rule) => ["gender_min", "grade_min", "role_min"].includes(rule.type)).flatMap((rule) => { try { const config = JSON.parse(rule.config_json) as { value?: string; minCount?: number }; return config.value && Number(config.minCount) > 0 ? [{ type: rule.type as "gender_min" | "grade_min" | "role_min", value: config.value, minCount: Number(config.minCount) }] : []; } catch { return []; } });
  return row ? { studentMin: row.student_min, studentMax: row.student_max, staffMin: row.staff_min, staffMax: row.staff_max, clusterGender: Boolean(row.cluster_gender), clusterGrade: Boolean(row.cluster_grade), splitWorshipRole: Boolean(row.split_worship_role), minimumRules } : { ...base, minimumRules };
}
function expandConstraints(rules: RuleRow[], members: RuleMember[]): GroupConstraint[] {
  const constraints: GroupConstraint[] = [];
  for (const rule of rules.filter((item) => ["together", "apart", "top_seed"].includes(item.type))) {
    const ids = members.filter((member) => member.rule_id === rule.id).map((member) => member.student_id); if (ids.length < 2) continue;
    if (rule.type === "together") for (let index = 1; index < ids.length; index += 1) constraints.push({ id: `${rule.id}:${index}`, type: "together", student_a_id: ids[0], student_b_id: ids[index] });
    else for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) constraints.push({ id: `${rule.id}:${left}:${right}`, type: "apart", student_a_id: ids[left], student_b_id: ids[right] });
  }
  return constraints;
}
async function loadRules(termId: string) {
  const [rules, members] = await Promise.all([all<RuleRow>("SELECT * FROM group_rules WHERE term_id=? ORDER BY created_at", [termId]), all<RuleMember>("SELECT rm.rule_id,rm.student_id,s.name FROM group_rule_members rm JOIN group_rules r ON r.id=rm.rule_id LEFT JOIN students s ON s.id=rm.student_id WHERE r.term_id=? ORDER BY rm.created_at", [termId])]);
  return { rules, members, constraints: expandConstraints(rules, members) };
}
async function loadSettings(termId: string, groups: GroupRecord[], rules: RuleRow[]) { return normalizeSettings((await all<SettingsRow>("SELECT * FROM grouping_settings WHERE term_id=?", [termId]))[0], groups, rules); }

export async function GET(request: Request) {
  const { error } = await requireApiUser(); if (error) return error; const termId = new URL(request.url).searchParams.get("termId"); if (!termId) return jsonError("학기를 선택해주세요.");
  const [groups, members, assignedStaff, students, staff, ruleData] = await Promise.all([
    all<GroupRecord>("SELECT * FROM groups WHERE term_id=? ORDER BY sort_order,name", [termId]),
    all("SELECT gm.*,s.name,ts.grade,ts.gender,ts.service_part,ts.worship_team FROM group_members gm JOIN students s ON s.id=gm.student_id JOIN term_students ts ON ts.term_id=gm.term_id AND ts.student_id=gm.student_id WHERE gm.term_id=?", [termId]),
    all("SELECT gs.*,s.name,s.can_lead_group FROM group_staff gs JOIN staff s ON s.id=gs.staff_id WHERE gs.term_id=?", [termId]),
    all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1 ORDER BY ts.service_part,s.name", [termId]),
    all<StaffRecord>("SELECT * FROM staff WHERE active=1 ORDER BY name"), loadRules(termId),
  ]);
  const settings = await loadSettings(termId, groups, ruleData.rules); const rules = ruleData.rules.map((rule) => ({ ...rule, config: JSON.parse(rule.config_json || "{}"), student_ids: ruleData.members.filter((member) => member.rule_id === rule.id).map((member) => member.student_id) }));
  return Response.json({ groups, members, assignedStaff, rules, students, staff, settings });
}

export async function POST(request: Request) {
  const { user, error } = await requireApiUser(["admin"]); if (error || !user) return error;
  const body = await request.json() as { action: string; termId: string; count?: number; studentMin?: number; studentMax?: number; staffMin?: number; staffMax?: number; clusterGender?: boolean; clusterGrade?: boolean; splitWorshipRole?: boolean; groupId?: string | null; studentId?: string; staffId?: string; ruleId?: string; ruleType?: string; studentIds?: string[]; value?: string; minCount?: number; seed?: number; force?: boolean };
  if (!body.termId) return jsonError("학기를 선택해주세요."); const timestamp = now();
  if (body.action === "configure") {
    const count = Math.max(1, Math.min(30, Number(body.count) || 1)); const studentMin = Math.max(1, Number(body.studentMin) || 1); const studentMax = Math.max(studentMin, Number(body.studentMax) || studentMin); const staffMin = Math.max(0, Number(body.staffMin) || 0); const staffMax = Math.max(staffMin, Number(body.staffMax) || staffMin);
    const studentCount = (await all<{ count: number }>("SELECT COUNT(*) count FROM term_students WHERE term_id=? AND active=1", [body.termId]))[0]?.count ?? 0;
    if (count * studentMin > studentCount || count * studentMax < studentCount) return jsonError(`학생 ${studentCount}명을 ${count}개 조의 최소 ${studentMin}명·최대 ${studentMax}명 범위에 배정할 수 없습니다.`, 409);
    if ((await all("SELECT id FROM groups WHERE term_id=? AND status='confirmed' LIMIT 1", [body.termId])).length) return jsonError("확정된 조 편성은 초기화할 수 없습니다.", 409);
    const db = getD1(); const statements = [db.prepare("DELETE FROM group_members WHERE term_id=?").bind(body.termId), db.prepare("DELETE FROM group_staff WHERE term_id=?").bind(body.termId), db.prepare("DELETE FROM groups WHERE term_id=?").bind(body.termId), db.prepare("INSERT INTO grouping_settings (term_id,student_min,student_max,staff_min,staff_max,cluster_gender,cluster_grade,split_worship_role,created_at,updated_at) VALUES (?,?,?,?,?,0,0,0,?,?) ON CONFLICT(term_id) DO UPDATE SET student_min=excluded.student_min,student_max=excluded.student_max,staff_min=excluded.staff_min,staff_max=excluded.staff_max,updated_at=excluded.updated_at").bind(body.termId, studentMin, studentMax, staffMin, staffMax, timestamp, timestamp)];
    for (let index = 0; index < count; index += 1) statements.push(db.prepare("INSERT INTO groups (id,term_id,name,capacity,required_staff,status,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?)").bind(createId("group"), body.termId, `${index + 1}조`, studentMax, staffMin, index, timestamp, timestamp)); await db.batch(statements);
  } else if (body.action === "save_modes") {
    const groups = await all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]); const base = defaultSettings(groups);
    await run("INSERT INTO grouping_settings (term_id,student_min,student_max,staff_min,staff_max,cluster_gender,cluster_grade,split_worship_role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(term_id) DO UPDATE SET cluster_gender=excluded.cluster_gender,cluster_grade=excluded.cluster_grade,split_worship_role=excluded.split_worship_role,updated_at=excluded.updated_at", [body.termId, base.studentMin, base.studentMax, base.staffMin, base.staffMax, Number(Boolean(body.clusterGender)), Number(Boolean(body.clusterGrade)), Number(Boolean(body.splitWorshipRole)), timestamp, timestamp]);
  } else if (body.action === "add_rule" && body.ruleType) {
    const relationship = ["together", "apart", "top_seed"].includes(body.ruleType); const minimum = ["gender_min", "grade_min", "role_min"].includes(body.ruleType); if (!relationship && !minimum) return jsonError("조건 종류를 확인해주세요.");
    const ids = [...new Set(body.studentIds ?? [])]; if (relationship && ids.length < 2) return jsonError("학생을 2명 이상 선택해주세요.");
    if (relationship) { const valid = (await all<{ id: string }>(`SELECT student_id id FROM term_students WHERE term_id=? AND active=1 AND student_id IN (${ids.map(() => "?").join(",")})`, [body.termId, ...ids])).length; if (valid !== ids.length) return jsonError("선택한 학기 명단에 없는 학생이 있습니다.", 409); }
    if (minimum && (!body.value || Number(body.minCount) < 1)) return jsonError("적용 대상과 조별 최소 인원을 입력해주세요.");
    const db = getD1(); const ruleId = createId("rule"); const config = minimum ? JSON.stringify({ value: body.value, minCount: Number(body.minCount) }) : "{}"; const statements = [db.prepare("INSERT INTO group_rules (id,term_id,type,config_json,created_at) VALUES (?,?,?,?,?)").bind(ruleId, body.termId, body.ruleType, config, timestamp)];
    for (const studentId of ids) statements.push(db.prepare("INSERT INTO group_rule_members (id,rule_id,student_id,created_at) VALUES (?,?,?,?)").bind(createId("rulemember"), ruleId, studentId, timestamp)); await db.batch(statements);
  } else if (body.action === "delete_rule" && body.ruleId) {
    const db = getD1(); await db.batch([db.prepare("DELETE FROM group_rule_members WHERE rule_id IN (SELECT id FROM group_rules WHERE id=? AND term_id=?)").bind(body.ruleId, body.termId), db.prepare("DELETE FROM group_rules WHERE id=? AND term_id=?").bind(body.ruleId, body.termId)]);
  } else if (body.action === "assign_student" && body.studentId) {
    if (!(await all("SELECT id FROM term_students WHERE term_id=? AND student_id=? AND active=1", [body.termId, body.studentId])).length) return jsonError("선택한 학기 명단에 없는 학생입니다.", 409);
    const [groups, students, current, ruleData] = await Promise.all([all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]), all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [body.termId]), all<{ student_id: string; group_id: string }>("SELECT student_id,group_id FROM group_members WHERE term_id=?", [body.termId]), loadRules(body.termId)]); const settings = await loadSettings(body.termId, groups, ruleData.rules); const previous = current.find((item) => item.student_id === body.studentId);
    if (body.groupId && !groups.some((group) => group.id === body.groupId)) return jsonError("선택한 조를 찾을 수 없습니다.", 404);
    const proposed = current.filter((item) => item.student_id !== body.studentId).map((item) => ({ studentId: item.student_id, groupId: item.group_id })); if (body.groupId) proposed.push({ studentId: body.studentId, groupId: body.groupId });
    let warnings = evaluateAssignmentWarnings(students, groups, ruleData.constraints, proposed, settings, [previous?.group_id ?? "", body.groupId ?? ""]); if (!previous) warnings = warnings.filter((warning) => !warning.includes("최소"));
    if (previous && !body.groupId && ruleData.constraints.some((constraint) => constraint.type === "together" && [constraint.student_a_id, constraint.student_b_id].includes(body.studentId!) && proposed.some((item) => item.studentId === (constraint.student_a_id === body.studentId ? constraint.student_b_id : constraint.student_a_id)))) warnings.push("같은 조로 지정한 학생 중 한 명만 미배정 상태가 됩니다.");
    warnings = [...new Set(warnings)];
    if (warnings.length && !body.force) return Response.json({ ok: false, requiresConfirmation: true, warnings });
    const db = getD1(); const statements = [db.prepare("DELETE FROM group_members WHERE term_id=? AND student_id=?").bind(body.termId, body.studentId)]; if (body.groupId) statements.push(db.prepare("INSERT INTO group_members (id,term_id,group_id,student_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)").bind(createId("member"), body.termId, body.groupId, body.studentId, user.id, timestamp)); await db.batch(statements);
  } else if ((body.action === "assign_staff" || body.action === "remove_staff") && body.staffId) {
    const groups = await all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]); const ruleData = await loadRules(body.termId); const settings = await loadSettings(body.termId, groups, ruleData.rules); const current = await all<{ group_id: string; staff_id: string }>("SELECT group_id,staff_id FROM group_staff WHERE term_id=?", [body.termId]); const previous = current.find((item) => item.staff_id === body.staffId); const nextGroupId = body.action === "assign_staff" ? body.groupId : null;
    const counts = new Map(groups.map((group) => [group.id, current.filter((item) => item.group_id === group.id && item.staff_id !== body.staffId).length + (nextGroupId === group.id ? 1 : 0)])); const warnings: string[] = [];
    for (const groupId of [previous?.group_id, nextGroupId]) { if (!groupId) continue; const group = groups.find((item) => item.id === groupId); const count = counts.get(groupId) ?? 0; if (group && count < settings.staffMin) warnings.push(`${group.name} 담당 스탭이 최소 ${settings.staffMin}명보다 적습니다.`); if (group && count > settings.staffMax) warnings.push(`${group.name} 담당 스탭이 최대 ${settings.staffMax}명을 넘습니다.`); }
    if (warnings.length && !body.force) return Response.json({ ok: false, requiresConfirmation: true, warnings: [...new Set(warnings)] });
    const db = getD1(); const statements = [db.prepare("DELETE FROM group_staff WHERE term_id=? AND staff_id=?").bind(body.termId, body.staffId)]; if (nextGroupId) statements.push(db.prepare("INSERT INTO group_staff (id,term_id,group_id,staff_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)").bind(createId("groupstaff"), body.termId, nextGroupId, body.staffId, user.id, timestamp)); await db.batch(statements);
  } else if (body.action === "auto") {
    const [students, groups, allStaff, ruleData] = await Promise.all([all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [body.termId]), all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]), all<StaffRecord>("SELECT * FROM staff WHERE active=1 ORDER BY can_lead_group DESC,name", []), loadRules(body.termId)]); const settings = await loadSettings(body.termId, groups, ruleData.rules); const designatedStaff = allStaff.filter((item) => item.can_lead_group); const staff = designatedStaff.length ? designatedStaff : allStaff;
    const result = autoAssignGroups(students, groups, ruleData.constraints, Number(body.seed) || 1, settings); if (result.error) return jsonError(result.error, 409); const db = getD1(); const statements = [db.prepare("DELETE FROM group_members WHERE term_id=?").bind(body.termId), db.prepare("DELETE FROM group_staff WHERE term_id=?").bind(body.termId)];
    for (const assignment of result.assignments) statements.push(db.prepare("INSERT INTO group_members (id,term_id,group_id,student_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)").bind(createId("member"), body.termId, assignment.groupId, assignment.studentId, user.id, timestamp)); let staffIndex = 0;
    for (const group of groups.sort((a, b) => a.sort_order - b.sort_order)) for (let slot = 0; slot < settings.staffMin && staffIndex < staff.length; slot += 1) { statements.push(db.prepare("INSERT INTO group_staff (id,term_id,group_id,staff_id,assigned_by,created_at) VALUES (?,?,?,?,?,?)").bind(createId("groupstaff"), body.termId, group.id, staff[staffIndex].id, user.id, timestamp)); staffIndex += 1; } await db.batch(statements);
    const warnings = [...result.warnings]; if (staffIndex < groups.length * settings.staffMin) warnings.push("조 담당 가능 스탭이 최소 인원보다 부족합니다."); await audit(user.id, "auto_assign", "groups", body.termId, null, { seed: body.seed, score: result.score }); return Response.json({ ok: true, score: result.score, warnings });
  } else if (body.action === "confirm") {
    const [groups, students, members, staffAssignments, ruleData] = await Promise.all([
      all<GroupRecord>("SELECT * FROM groups WHERE term_id=?", [body.termId]),
      all<StudentRecord>("SELECT s.id,s.name,s.notes,ts.grade,ts.gender,ts.service_part,ts.worship_team,ts.is_student_leader,ts.active FROM term_students ts JOIN students s ON s.id=ts.student_id WHERE ts.term_id=? AND ts.active=1", [body.termId]),
      all<{ student_id: string; group_id: string }>("SELECT student_id,group_id FROM group_members WHERE term_id=?", [body.termId]),
      all<{ group_id: string }>("SELECT group_id FROM group_staff WHERE term_id=?", [body.termId]),
      loadRules(body.termId),
    ]);
    const settings = await loadSettings(body.termId, groups, ruleData.rules); const warnings: string[] = [];
    const assigned = new Set(members.map((item) => item.student_id)); const unassigned = students.filter((student) => !assigned.has(student.id)); if (unassigned.length) warnings.push(`미배정 학생이 ${unassigned.length}명 있습니다.`);
    warnings.push(...evaluateAssignmentWarnings(students, groups, ruleData.constraints, members.map((item) => ({ studentId: item.student_id, groupId: item.group_id })), settings));
    for (const group of groups) { const count = staffAssignments.filter((item) => item.group_id === group.id).length; if (count < settings.staffMin || count > settings.staffMax) warnings.push(`${group.name} 담당 스탭 ${count}명이 허용 범위 ${settings.staffMin}–${settings.staffMax}명을 벗어납니다.`); }
    if (warnings.length && !body.force) return Response.json({ ok: false, requiresConfirmation: true, warnings: [...new Set(warnings)] });
    await run("UPDATE groups SET status='confirmed',updated_at=? WHERE term_id=?", [timestamp, body.termId]);
  } else return jsonError("지원하지 않는 작업입니다.");
  await audit(user.id, body.action, "groups", body.termId, null, body); return Response.json({ ok: true });
}
