import type { GroupConstraint, GroupingSettings, GroupRecord, StudentRecord } from "./domain";

export type GroupingResult = { assignments: { studentId: string; groupId: string }[]; warnings: string[]; score: number; error?: string };
const defaults: GroupingSettings = { studentMin: 1, studentMax: 99, staffMin: 0, staffMax: 99, clusterGender: false, clusterGrade: false, splitWorshipRole: false, minimumRules: [] };
function seeded(seed: number) { let value = seed >>> 0; return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296); }
function genderOf(student: StudentRecord) { const value = String(student.gender ?? "").trim().toLowerCase(); if (["남", "남자", "male", "m"].includes(value)) return "남"; if (["여", "여자", "female", "f"].includes(value)) return "여"; return value || "미입력"; }
function gradeOf(student: StudentRecord) { return student.grade ? `${student.grade}학년` : "미입력"; }
function roleOf(student: StudentRecord) { return student.worship_team === "싱어팀" ? "싱어" : "세션"; }
const categoryFor = (student: StudentRecord, type: "gender" | "grade" | "role") => type === "gender" ? genderOf(student) : type === "grade" ? gradeOf(student) : roleOf(student);

function balanceScore(group: StudentRecord[], all: StudentRecord[], settings: GroupingSettings) {
  if (!group.length) return 100;
  const dimensions: Array<(student: StudentRecord) => string> = [(student) => `service:${student.service_part}`];
  if (!settings.clusterGrade) dimensions.push((student) => `grade:${gradeOf(student)}`);
  if (!settings.clusterGender) dimensions.push((student) => `gender:${genderOf(student)}`);
  if (!settings.splitWorshipRole) dimensions.push((student) => `role:${roleOf(student)}`);
  return dimensions.reduce((total, dimension) => {
    const overall = new Map<string, number>(); const local = new Map<string, number>();
    all.forEach((student) => overall.set(dimension(student), (overall.get(dimension(student)) ?? 0) + 1));
    group.forEach((student) => local.set(dimension(student), (local.get(dimension(student)) ?? 0) + 1));
    let difference = 0; overall.forEach((count, key) => { difference += Math.abs((local.get(key) ?? 0) / group.length - count / all.length); });
    return total + difference;
  }, 0);
}

function hasMixedCategory(students: StudentRecord[], type: "gender" | "grade" | "role") {
  const values = new Set(students.map((student) => categoryFor(student, type)).filter((value) => value !== "미입력")); return values.size > 1;
}
function matchesMinimum(student: StudentRecord, rule: NonNullable<GroupingSettings["minimumRules"]>[number]) {
  if (rule.type === "gender_min") return genderOf(student) === rule.value;
  if (rule.type === "grade_min") return String(student.grade ?? "") === String(rule.value).replace("학년", "");
  return roleOf(student) === rule.value;
}
function singletonCount(group: StudentRecord[]) {
  return (["gender", "grade", "role"] as const).reduce((total, type) => {
    const counts = new Map<string, number>(); group.forEach((student) => { const value = categoryFor(student, type); if (value !== "미입력") counts.set(value, (counts.get(value) ?? 0) + 1); });
    return total + [...counts.values()].filter((count) => count === 1).length;
  }, 0);
}
function introducedSingletons(current: StudentRecord[], block: StudentRecord[]) {
  if (!current.length) return 0;
  return (["gender", "grade", "role"] as const).reduce((total, type) => {
    const existing = new Set(current.map((student) => categoryFor(student, type)).filter((value) => value !== "미입력")); const additions = new Map<string, number>();
    block.forEach((student) => { const value = categoryFor(student, type); if (value !== "미입력" && !existing.has(value)) additions.set(value, (additions.get(value) ?? 0) + 1); });
    return total + [...additions.values()].filter((count) => count === 1).length;
  }, 0);
}
function categoryAllowed(current: StudentRecord[], block: StudentRecord[], settings: GroupingSettings) {
  const combined = [...current, ...block];
  if (settings.clusterGender && hasMixedCategory(combined, "gender")) return false;
  if (settings.clusterGrade && hasMixedCategory(combined, "grade")) return false;
  if (settings.splitWorshipRole && hasMixedCategory(combined, "role")) return false;
  return true;
}

export function compositionWarnings(group: StudentRecord[], groupName: string, settingsInput?: Partial<GroupingSettings>) {
  const settings = { ...defaults, ...settingsInput }; const warnings: string[] = [];
  if (group.length && group.length < settings.studentMin) warnings.push(`${groupName} 학생이 최소 ${settings.studentMin}명보다 적습니다.`);
  if (group.length > settings.studentMax) warnings.push(`${groupName} 학생이 최대 ${settings.studentMax}명을 넘습니다.`);
  if (settings.clusterGender && hasMixedCategory(group, "gender")) warnings.push(`${groupName}에 서로 다른 성별이 섞입니다.`);
  if (settings.clusterGrade && hasMixedCategory(group, "grade")) warnings.push(`${groupName}에 서로 다른 학년이 섞입니다.`);
  if (settings.splitWorshipRole && hasMixedCategory(group, "role")) warnings.push(`${groupName}에 싱어와 세션이 섞입니다.`);
  if (group.length) (["gender", "grade", "role"] as const).forEach((type) => {
    const counts = new Map<string, number>(); group.forEach((student) => { const value = categoryFor(student, type); if (value !== "미입력") counts.set(value, (counts.get(value) ?? 0) + 1); });
    const label = type === "gender" ? "성별" : type === "grade" ? "학년" : "싱어·세션";
    [...counts.entries()].filter(([, count]) => count === 1).forEach(([value]) => warnings.push(`${groupName}에서 ${label} ‘${value}’ 학생이 혼자 남습니다.`));
  });
  for (const rule of settings.minimumRules ?? []) if (group.length >= settings.studentMin && group.filter((student) => matchesMinimum(student, rule)).length < rule.minCount) warnings.push(`${groupName}이 ${rule.value} 최소 ${rule.minCount}명 조건을 충족하지 않습니다.`);
  return warnings;
}

export function evaluateAssignmentWarnings(students: StudentRecord[], groups: GroupRecord[], constraints: GroupConstraint[], assignments: Array<{ studentId: string; groupId: string }>, settingsInput?: Partial<GroupingSettings>, focusGroupIds?: string[]) {
  const settings = { ...defaults, ...settingsInput }; const warnings: string[] = []; const groupOf = new Map(assignments.map((item) => [item.studentId, item.groupId]));
  for (const constraint of constraints) {
    const a = groupOf.get(constraint.student_a_id); const b = groupOf.get(constraint.student_b_id); if (!a || !b) continue;
    if (constraint.type === "together" && a !== b) warnings.push("같은 조로 지정한 학생들이 떨어집니다.");
    if (constraint.type === "apart" && a === b) warnings.push("다른 조로 지정한 학생들이 같은 조가 됩니다.");
  }
  const studentById = new Map(students.map((student) => [student.id, student])); const focus = focusGroupIds ? new Set(focusGroupIds.filter(Boolean)) : null;
  for (const group of groups) { if (focus && !focus.has(group.id)) continue; const members = assignments.filter((item) => item.groupId === group.id).map((item) => studentById.get(item.studentId)).filter((item): item is StudentRecord => Boolean(item)); warnings.push(...compositionWarnings(members, group.name, settings)); }
  return [...new Set(warnings)];
}

export function autoAssignGroups(students: StudentRecord[], groups: GroupRecord[], constraints: GroupConstraint[], seed = 1, settingsInput?: Partial<GroupingSettings>): GroupingResult {
  if (!groups.length) return { assignments: [], warnings: [], score: 0, error: "조가 없습니다." };
  const settings = { ...defaults, ...settingsInput, studentMax: settingsInput?.studentMax ?? Math.max(...groups.map((group) => group.capacity)) };
  if (groups.length * settings.studentMax < students.length) return { assignments: [], warnings: [], score: 0, error: "학생 수가 전체 최대 정원보다 많습니다." };
  if (groups.length * settings.studentMin > students.length) return { assignments: [], warnings: [], score: 0, error: "학생 수가 전체 최소 정원을 채우기에 부족합니다." };
  for (const type of ["gender", "grade", "role"] as const) {
    const counts = new Map<string, number>(); students.forEach((student) => { const value = categoryFor(student, type); if (value !== "미입력") counts.set(value, (counts.get(value) ?? 0) + 1); });
    const impossible = [...counts.entries()].find(([, count]) => count === 1); if (impossible) return { assignments: [], warnings: [], score: 0, error: `${impossible[0]} 학생이 전체에서 1명뿐이라 어느 조에도 혼자 배정하지 않을 수 없습니다.` };
  }
  for (const rule of settings.minimumRules ?? []) if (students.filter((student) => matchesMinimum(student, rule)).length < groups.length * rule.minCount) return { assignments: [], warnings: [], score: 0, error: `${rule.value} 학생 수가 조별 최소 ${rule.minCount}명 조건을 충족하기에 부족합니다.` };
  const parent = new Map(students.map((student) => [student.id, student.id]));
  const find = (id: string): string => { const root = parent.get(id) ?? id; if (root === id) return id; const next = find(root); parent.set(id, next); return next; };
  const union = (a: string, b: string) => { const rootA = find(a); const rootB = find(b); if (rootA !== rootB) parent.set(rootB, rootA); };
  constraints.filter((item) => item.type === "together").forEach((item) => union(item.student_a_id, item.student_b_id));
  for (const item of constraints.filter((constraint) => constraint.type === "apart")) if (find(item.student_a_id) === find(item.student_b_id)) return { assignments: [], warnings: [], score: 0, error: "같은 조와 다른 조 조건이 서로 충돌합니다." };
  const blocks = new Map<string, StudentRecord[]>(); students.forEach((student) => { const root = find(student.id); blocks.set(root, [...(blocks.get(root) ?? []), student]); });
  if ([...blocks.values()].some((block) => block.length > settings.studentMax)) return { assignments: [], warnings: [], score: 0, error: "반드시 함께 배정할 학생 묶음이 최대 정원보다 큽니다." };
  if ([...blocks.values()].some((block) => !categoryAllowed([], block, settings))) return { assignments: [], warnings: [], score: 0, error: "같은 조 조건과 선택한 동성·동학년·역할 분리 모드가 충돌합니다." };
  const apartPairs = new Set(constraints.filter((item) => item.type === "apart").flatMap((item) => [`${item.student_a_id}:${item.student_b_id}`, `${item.student_b_id}:${item.student_a_id}`]));
  for (let attempt = 0; attempt < 6000; attempt += 1) {
    const random = seeded(seed + attempt * 7919); const orderedBlocks = [...blocks.values()]; for (let index = orderedBlocks.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [orderedBlocks[index], orderedBlocks[swap]] = [orderedBlocks[swap], orderedBlocks[index]]; } orderedBlocks.sort((a, b) => b.length - a.length); const buckets = new Map(groups.map((group) => [group.id, [] as StudentRecord[]])); const explore = attempt % 4 === 3; let failed = false;
    for (const block of orderedBlocks) {
      const candidates = groups.filter((group) => { const current = buckets.get(group.id) ?? []; return current.length + block.length <= settings.studentMax && categoryAllowed(current, block, settings) && !current.some((member) => block.some((student) => apartPairs.has(`${member.id}:${student.id}`))); }).map((group) => {
        const current = buckets.get(group.id) ?? []; const next = [...current, ...block]; let score = explore ? current.length / settings.studentMax + random() * 1.25 : balanceScore(next, students, settings) + next.length / settings.studentMax + (singletonCount(next) - singletonCount(current)) * 3 + introducedSingletons(current, block) * 4 + random() * .45;
        for (const rule of settings.minimumRules ?? []) score -= Math.min(rule.minCount, next.filter((student) => matchesMinimum(student, rule)).length) * .7;
        return { group, score };
      }).sort((a, b) => a.score - b.score);
      if (!candidates.length) { failed = true; break; } buckets.get(candidates[0].group.id)?.push(...block);
    }
    if (failed || groups.some((group) => (buckets.get(group.id)?.length ?? 0) < settings.studentMin)) continue;
    if ((settings.minimumRules ?? []).some((rule) => groups.some((group) => (buckets.get(group.id) ?? []).filter((student) => matchesMinimum(student, rule)).length < rule.minCount))) continue;
    const singletons = groups.reduce((total, group) => total + singletonCount(buckets.get(group.id) ?? []), 0); if (singletons) continue;
    const score = groups.reduce((total, group) => total + balanceScore(buckets.get(group.id) ?? [], students, settings), 0);
    const assignments = groups.flatMap((group) => (buckets.get(group.id) ?? []).map((student) => ({ studentId: student.id, groupId: group.id })));
    return { assignments, warnings: [], score };
  }
  return { assignments: [], warnings: [], score: 0, error: "최소·최대 정원과 조건을 지키면서 성별·학년·싱어/세션 인원이 각 조에서 0명 또는 2명 이상이 되는 편성안을 찾지 못했습니다. 조 수나 정원, 세부 조건을 조정해주세요." };
}
