import type { GroupConstraint, GroupRecord, StudentRecord } from "./domain";

export type GroupingResult = { assignments: { studentId: string; groupId: string }[]; warnings: string[]; score: number; error?: string };
function seeded(seed: number) { let value = seed >>> 0; return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296); }
function balanceScore(group: StudentRecord[], all: StudentRecord[]) {
  if (!group.length) return 100;
  const dimensions = [(s: StudentRecord) => `grade:${s.grade ?? "none"}`, (s: StudentRecord) => `gender:${s.gender ?? "none"}`, (s: StudentRecord) => `service:${s.service_part}`];
  return dimensions.reduce((total, dimension) => {
    const overall = new Map<string, number>(); const local = new Map<string, number>();
    all.forEach((student) => overall.set(dimension(student), (overall.get(dimension(student)) ?? 0) + 1));
    group.forEach((student) => local.set(dimension(student), (local.get(dimension(student)) ?? 0) + 1));
    let difference = 0;
    overall.forEach((count, key) => { difference += Math.abs((local.get(key) ?? 0) / group.length - count / all.length); });
    return total + difference;
  }, 0);
}

export function autoAssignGroups(students: StudentRecord[], groups: GroupRecord[], constraints: GroupConstraint[], seed = 1): GroupingResult {
  if (!groups.length) return { assignments: [], warnings: [], score: 0, error: "조가 없습니다." };
  if (groups.reduce((sum, group) => sum + group.capacity, 0) < students.length) return { assignments: [], warnings: [], score: 0, error: "전체 조 정원이 학생 수보다 적습니다." };
  const parent = new Map(students.map((student) => [student.id, student.id]));
  const find = (id: string): string => { const root = parent.get(id) ?? id; if (root === id) return id; const next = find(root); parent.set(id, next); return next; };
  const union = (a: string, b: string) => { const rootA = find(a); const rootB = find(b); if (rootA !== rootB) parent.set(rootB, rootA); };
  constraints.filter((item) => item.type === "together").forEach((item) => union(item.student_a_id, item.student_b_id));
  for (const item of constraints.filter((constraint) => constraint.type === "apart")) {
    if (find(item.student_a_id) === find(item.student_b_id)) return { assignments: [], warnings: [], score: 0, error: "같은 조와 다른 조 조건이 서로 충돌합니다." };
  }
  const blocks = new Map<string, StudentRecord[]>();
  students.forEach((student) => { const root = find(student.id); blocks.set(root, [...(blocks.get(root) ?? []), student]); });
  const maxCapacity = Math.max(...groups.map((group) => group.capacity));
  if ([...blocks.values()].some((block) => block.length > maxCapacity)) return { assignments: [], warnings: [], score: 0, error: "반드시 함께 배정할 학생 묶음이 조 정원보다 큽니다." };
  const apartPairs = new Set(constraints.filter((item) => item.type === "apart").flatMap((item) => [`${item.student_a_id}:${item.student_b_id}`, `${item.student_b_id}:${item.student_a_id}`]));
  let best: GroupingResult | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = seeded(seed + attempt * 7919);
    const orderedBlocks = [...blocks.values()].sort((a, b) => b.length - a.length || random() - .5);
    const buckets = new Map(groups.map((group) => [group.id, [] as StudentRecord[]])); let failed = false;
    for (const block of orderedBlocks) {
      const candidates = groups.filter((group) => {
        const current = buckets.get(group.id) ?? [];
        return current.length + block.length <= group.capacity && !current.some((member) => block.some((student) => apartPairs.has(`${member.id}:${student.id}`)));
      }).map((group) => ({ group, score: balanceScore([...(buckets.get(group.id) ?? []), ...block], students) + ((buckets.get(group.id)?.length ?? 0) + block.length) / group.capacity + random() * .001 })).sort((a, b) => a.score - b.score);
      if (!candidates.length) { failed = true; break; }
      buckets.get(candidates[0].group.id)?.push(...block);
    }
    if (failed) continue;
    const score = groups.reduce((total, group) => total + balanceScore(buckets.get(group.id) ?? [], students), 0);
    const assignments = groups.flatMap((group) => (buckets.get(group.id) ?? []).map((student) => ({ studentId: student.id, groupId: group.id })));
    if (!best || score < best.score) best = { assignments, warnings: [], score };
  }
  return best ?? { assignments: [], warnings: [], score: 0, error: "모든 필수 조건을 만족하는 편성안을 찾지 못했습니다." };
}
