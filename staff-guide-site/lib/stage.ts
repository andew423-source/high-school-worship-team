import type { StageRole, StudentRecord, StaffRecord } from "./domain";
export type StageCandidate = { personType: "student" | "staff"; personId: string; name: string; role: StageRole; reason: string; side: "left" | "center" | "right"; positionOrder: number };
type History = { person_id: string; total_count: number; singer_count: number; last_date: string | null };

function layout(people: Omit<StageCandidate, "side" | "positionOrder">[]): StageCandidate[] {
  const leader = people.find((person) => person.role === "leader");
  const singers = people.filter((person) => person.role === "singer"); const choir = people.filter((person) => person.role === "choir");
  const place = (items: typeof people) => items.map((person, index) => ({ ...person, side: (index < Math.ceil(items.length / 2) ? "left" : "right") as "left" | "right", positionOrder: index < Math.ceil(items.length / 2) ? index : index - Math.ceil(items.length / 2) }));
  return [...place(choir), ...place(singers), ...(leader ? [{ ...leader, side: "center" as const, positionOrder: 0 }] : [])];
}

export function generateStage(params: { students: StudentRecord[]; staff: StaffRecord[]; eligibleStudentIds: Set<string>; presentStaffIds: Set<string>; histories: History[]; servicePart: 1 | 2; singerSlots: number; choirSlots: number; leaderType: "student" | "staff"; leaderId: string; usedStaffIds: Set<string> }) {
  const history = new Map(params.histories.map((item) => [item.person_id, item]));
  const leaderStudent = params.leaderType === "student" ? params.students.find((item) => item.id === params.leaderId && item.is_student_leader && params.eligibleStudentIds.has(item.id)) : null;
  const leaderStaff = params.leaderType === "staff" ? params.staff.find((item) => item.id === params.leaderId && item.can_sing && params.presentStaffIds.has(item.id)) : null;
  const leader = leaderStudent ?? leaderStaff;
  if (!leader) return { assignments: [] as StageCandidate[], warnings: ["선택한 인도자가 등단 자격을 충족하지 않습니다."] };
  const warnings: string[] = [];
  const studentPool = params.students.filter((student) => student.service_part === params.servicePart && params.eligibleStudentIds.has(student.id) && student.id !== params.leaderId);
  const score = (student: StudentRecord, singer: boolean) => { const item = history.get(student.id); return (item?.total_count ?? 0) * 10 + (item?.last_date ? 20 : 0) + (singer ? (item?.singer_count ?? 0) * 4 : 0) + student.name.charCodeAt(0) / 100000; };
  const singers = [...studentPool].sort((a, b) => score(a, true) - score(b, true)).slice(0, params.singerSlots);
  const singerIds = new Set(singers.map((item) => item.id));
  const choir = studentPool.filter((item) => !singerIds.has(item.id)).sort((a, b) => score(a, false) - score(b, false)).slice(0, params.choirSlots);
  const assignments: Omit<StageCandidate, "side" | "positionOrder">[] = [
    { personType: params.leaderType, personId: leader.id, name: leader.name, role: "leader", reason: "이번 예배 인도자로 선택됨" },
    ...singers.map((student) => ({ personType: "student" as const, personId: student.id, name: student.name, role: "singer" as const, reason: "최근 4주 싱어·전체 등단 횟수를 고려해 배정" })),
    ...choir.map((student) => ({ personType: "student" as const, personId: student.id, name: student.name, role: "choir" as const, reason: "최근 4주 전체 등단 횟수를 고려해 배정" })),
  ];
  let missingSingers = params.singerSlots - singers.length;
  const staffPool = params.staff.filter((item) => item.can_sing && params.presentStaffIds.has(item.id) && item.id !== params.leaderId)
    .sort((a, b) => Number(params.usedStaffIds.has(a.id)) - Number(params.usedStaffIds.has(b.id)) || Number(Boolean(a.preferred_service && a.preferred_service !== params.servicePart)) - Number(Boolean(b.preferred_service && b.preferred_service !== params.servicePart)));
  for (const staff of staffPool.slice(0, missingSingers)) {
    const duplicated = params.usedStaffIds.has(staff.id);
    assignments.push({ personType: "staff", personId: staff.id, name: staff.name, role: "singer", reason: duplicated ? "싱어 후보 부족으로 1·2부 중복 배정" : "학생 싱어 부족 인원을 보완" });
    params.usedStaffIds.add(staff.id); missingSingers -= 1;
  }
  if (missingSingers > 0) warnings.push(`싱어 ${missingSingers}명이 부족합니다.`);
  if (choir.length < params.choirSlots) warnings.push(`콰이어 ${params.choirSlots - choir.length}명이 부족합니다.`);
  if (params.singerSlots % 2 || params.choirSlots % 2) warnings.push("홀수 인원은 좌우 차이 1명 이내로 배치됩니다.");
  return { assignments: layout(assignments), warnings };
}
