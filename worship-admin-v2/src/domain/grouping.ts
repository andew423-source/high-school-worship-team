export type GroupingStudent = {
  id: string;
  name: string;
  grade: number;
  gender: "FEMALE" | "MALE" | "UNSPECIFIED";
  team: "SINGER" | "SESSION";
  serviceDepartment: "FIRST" | "SECOND";
};

export type GroupingSettings = {
  groupCount: number;
  studentMin: number;
  studentMax: number;
  staffMin: number;
  staffMax: number;
  clusterGender: boolean;
  clusterGrade: boolean;
  splitTeam: boolean;
};

export type GroupingRule = {
  id: string;
  type: "TOGETHER" | "APART" | "TOP_SEED" | "GENDER_MIN" | "GRADE_MIN" | "TEAM_MIN";
  memberIds: string[];
  value?: string | null;
  minCount?: number | null;
};

export type GroupingAssignment = { termStudentId: string; groupIndex: number };
export type GroupingResult = { assignments: GroupingAssignment[]; warnings: string[]; score: number; error?: string };

const categories = {
  gender: (student: GroupingStudent) => student.gender,
  grade: (student: GroupingStudent) => String(student.grade),
  team: (student: GroupingStudent) => student.team,
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
}

function categoryWarnings(group: GroupingStudent[], groupName: string) {
  const warnings: string[] = [];
  for (const [key, getter] of Object.entries(categories)) {
    const counts = new Map<string, number>();
    for (const student of group) counts.set(getter(student), (counts.get(getter(student)) ?? 0) + 1);
    for (const [value, count] of counts) {
      if (value !== "UNSPECIFIED" && count === 1) {
        const label = key === "gender" ? "성별" : key === "grade" ? "학년" : "싱어·세션";
        warnings.push(`${groupName}에서 ${label} ‘${value}’ 학생이 혼자 남습니다.`);
      }
    }
  }
  return warnings;
}

function minimumMatches(student: GroupingStudent, rule: GroupingRule) {
  if (rule.type === "GENDER_MIN") return student.gender === rule.value;
  if (rule.type === "GRADE_MIN") return String(student.grade) === String(rule.value);
  if (rule.type === "TEAM_MIN") return student.team === rule.value;
  return false;
}

export function evaluateGrouping(params: {
  students: GroupingStudent[];
  settings: GroupingSettings;
  rules: GroupingRule[];
  assignments: GroupingAssignment[];
}) {
  const { students, settings, rules, assignments } = params;
  const studentById = new Map(students.map((student) => [student.id, student]));
  const groupOf = new Map(assignments.map((assignment) => [assignment.termStudentId, assignment.groupIndex]));
  const warnings: string[] = [];

  for (let index = 0; index < settings.groupCount; index += 1) {
    const group = assignments
      .filter((assignment) => assignment.groupIndex === index)
      .map((assignment) => studentById.get(assignment.termStudentId))
      .filter((student): student is GroupingStudent => Boolean(student));
    if (group.length < settings.studentMin) warnings.push(`${index + 1}조 학생이 최소 ${settings.studentMin}명보다 적습니다.`);
    if (group.length > settings.studentMax) warnings.push(`${index + 1}조 학생이 최대 ${settings.studentMax}명을 넘습니다.`);
    if (settings.clusterGender && new Set(group.map(categories.gender)).size > 1) warnings.push(`${index + 1}조에 서로 다른 성별이 함께 있습니다.`);
    if (settings.clusterGrade && new Set(group.map(categories.grade)).size > 1) warnings.push(`${index + 1}조에 서로 다른 학년이 함께 있습니다.`);
    if (settings.splitTeam && new Set(group.map(categories.team)).size > 1) warnings.push(`${index + 1}조에 싱어와 세션 학생이 함께 있습니다.`);
    warnings.push(...categoryWarnings(group, `${index + 1}조`));
    for (const rule of rules.filter((item) => item.type.endsWith("_MIN"))) {
      if (group.filter((student) => minimumMatches(student, rule)).length < Number(rule.minCount ?? 0)) {
        warnings.push(`${index + 1}조가 ${rule.value} 최소 ${rule.minCount}명 조건을 충족하지 않습니다.`);
      }
    }
  }

  for (const rule of rules.filter((item) => item.type === "TOGETHER")) {
    const placed = rule.memberIds.map((id) => groupOf.get(id)).filter((value) => value !== undefined);
    if (new Set(placed).size > 1) {
      const names = rule.memberIds.map((id) => studentById.get(id)?.name).filter(Boolean).join("·");
      warnings.push(`같은 조 조건인 ${names} 학생이 서로 다른 조에 있습니다.`);
    }
  }
  for (const rule of rules.filter((item) => item.type === "APART" || item.type === "TOP_SEED")) {
    const seen = new Map<number, string[]>();
    for (const id of rule.memberIds) {
      const groupIndex = groupOf.get(id);
      if (groupIndex !== undefined) seen.set(groupIndex, [...(seen.get(groupIndex) ?? []), studentById.get(id)?.name ?? "알 수 없음"]);
    }
    for (const [groupIndex, names] of seen) if (names.length > 1) {
      warnings.push(`${rule.type === "TOP_SEED" ? "톱시드" : "다른 조"} 조건인 ${names.join("·")} 학생이 ${groupIndex + 1}조에 함께 있습니다.`);
    }
  }
  return [...new Set(warnings)];
}

export function introducedGroupingWarnings(params: {
  students: GroupingStudent[];
  settings: GroupingSettings;
  rules: GroupingRule[];
  currentAssignments: GroupingAssignment[];
  nextAssignments: GroupingAssignment[];
}) {
  const current = evaluateGrouping({ ...params, assignments: params.currentAssignments });
  const next = evaluateGrouping({ ...params, assignments: params.nextAssignments });
  return next.filter((warning) => !current.includes(warning));
}

function compatible(current: GroupingStudent[], block: GroupingStudent[], settings: GroupingSettings) {
  const combined = [...current, ...block];
  if (settings.clusterGender && new Set(combined.map(categories.gender)).size > 1) return false;
  if (settings.clusterGrade && new Set(combined.map(categories.grade)).size > 1) return false;
  if (settings.splitTeam && new Set(combined.map(categories.team)).size > 1) return false;
  return true;
}

function createBalanceScore(all: GroupingStudent[]) {
  const getters = [categories.gender, categories.grade, categories.team, (student: GroupingStudent) => student.serviceDepartment];
  const distributions = getters.map((getter) => {
    const counts = new Map<string, number>();
    for (const student of all) counts.set(getter(student), (counts.get(getter(student)) ?? 0) + 1);
    return counts;
  });
  return (group: GroupingStudent[]) => {
    if (!group.length) return 0;
    let result = group.length * .15;
    getters.forEach((getter, index) => {
      const local = new Map<string, number>();
      for (const student of group) local.set(getter(student), (local.get(getter(student)) ?? 0) + 1);
      for (const [key, count] of distributions[index]) result += Math.abs((local.get(key) ?? 0) / group.length - count / all.length);
    });
    return result;
  };
}

function createPlacementScore(rules: GroupingRule[]) {
  const minimumRules = rules.filter((rule) => rule.type.endsWith("_MIN"));
  return (group: GroupingStudent[]) => {
    let score = group.length * group.length * 1.5;
    for (const getter of Object.values(categories)) {
      const counts = new Map<string, number>();
      for (const student of group) counts.set(getter(student), (counts.get(getter(student)) ?? 0) + 1);
      for (const [value, count] of counts) {
        if (value !== "UNSPECIFIED" && count === 1) score += 24;
      }
    }
    for (const rule of minimumRules) {
      const missing = Math.max(0, Number(rule.minCount ?? 0) - group.filter((student) => minimumMatches(student, rule)).length);
      score += missing * 18;
    }
    return score;
  };
}

export function generateGrouping(students: GroupingStudent[], settings: GroupingSettings, rules: GroupingRule[], seed = 1): GroupingResult {
  if (settings.groupCount < 1) return { assignments: [], warnings: [], score: 0, error: "조가 없습니다." };
  if (settings.groupCount * settings.studentMin > students.length) return { assignments: [], warnings: [], score: 0, error: "학생 수가 전체 최소 정원을 채우기에 부족합니다." };
  if (settings.groupCount * settings.studentMax < students.length) return { assignments: [], warnings: [], score: 0, error: "학생 수가 전체 최대 정원을 넘습니다." };

  const topSeeds = [...new Set(rules.filter((rule) => rule.type === "TOP_SEED").flatMap((rule) => rule.memberIds))];
  if (topSeeds.length > settings.groupCount) return { assignments: [], warnings: [], score: 0, error: `톱시드 ${topSeeds.length}명을 ${settings.groupCount}개 조에 한 명씩 배치할 수 없습니다.` };
  for (const getter of Object.values(categories)) {
    const counts = new Map<string, number>();
    for (const student of students) counts.set(getter(student), (counts.get(getter(student)) ?? 0) + 1);
    const singleton = [...counts.entries()].find(([value, count]) => value !== "UNSPECIFIED" && count === 1);
    if (singleton) return { assignments: [], warnings: [], score: 0, error: `${singleton[0]} 학생이 전체에서 1명뿐이라 조 안에서 혼자 남지 않게 배정할 수 없습니다.` };
  }

  const parent = new Map(students.map((student) => [student.id, student.id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next); parent.set(id, root); return root;
  };
  const union = (left: string, right: string) => {
    const a = find(left); const b = find(right); if (a !== b) parent.set(b, a);
  };
  for (const rule of rules.filter((item) => item.type === "TOGETHER")) {
    for (let index = 1; index < rule.memberIds.length; index += 1) union(rule.memberIds[0], rule.memberIds[index]);
  }
  const blocks = new Map<string, GroupingStudent[]>();
  for (const student of students) blocks.set(find(student.id), [...(blocks.get(find(student.id)) ?? []), student]);
  if ([...blocks.values()].some((block) => block.length > settings.studentMax)) return { assignments: [], warnings: [], score: 0, error: "같은 조 학생 묶음이 조 최대 정원보다 큽니다." };

  const separated = new Set<string>();
  for (const rule of rules.filter((item) => item.type === "APART" || item.type === "TOP_SEED")) {
    for (let left = 0; left < rule.memberIds.length; left += 1) for (let right = left + 1; right < rule.memberIds.length; right += 1) {
      if (find(rule.memberIds[left]) === find(rule.memberIds[right])) return { assignments: [], warnings: [], score: 0, error: "같은 조 조건과 다른 조·톱시드 조건이 충돌합니다." };
      separated.add(`${rule.memberIds[left]}:${rule.memberIds[right]}`);
      separated.add(`${rule.memberIds[right]}:${rule.memberIds[left]}`);
    }
  }

  const balanceScore = createBalanceScore(students);
  const placementScore = createPlacementScore(rules);
  let best: GroupingResult | null = null;
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const random = seeded(seed + attempt * 7919);
    const ordered = [...blocks.values()].sort((a, b) => b.length - a.length || random() - .5);
    const buckets = Array.from({ length: settings.groupCount }, () => [] as GroupingStudent[]);
    let failed = false;
    for (const block of ordered) {
      const candidates = buckets.map((current, index) => ({ current, index })).filter(({ current }) =>
        current.length + block.length <= settings.studentMax && compatible(current, block, settings)
        && !current.some((member) => block.some((student) => separated.has(`${member.id}:${student.id}`)))
      ).map(({ current, index }) => {
        const combined = [...current, ...block];
        return { index, score: placementScore(combined) + balanceScore(combined) * .35 + random() * 4 };
      }).sort((a, b) => a.score - b.score);
      if (!candidates.length) { failed = true; break; }
      buckets[candidates[0].index].push(...block);
    }
    if (failed || buckets.some((bucket) => bucket.length < settings.studentMin)) continue;
    const assignments = buckets.flatMap((bucket, groupIndex) => bucket.map((student) => ({ termStudentId: student.id, groupIndex })));
    const warnings = evaluateGrouping({ students, settings, rules, assignments });
    if (warnings.length) continue;
    const score = buckets.reduce((sum, bucket) => sum + balanceScore(bucket), 0);
    if (!best || score < best.score) best = { assignments, warnings: [], score };
    if (attempt >= 12 && best) break;
  }
  return best ?? { assignments: [], warnings: [], score: 0, error: "모든 조건을 지키는 편성안을 찾지 못했습니다. 조 수·정원·세부 조건을 조정해주세요." };
}
