import type { StageRole, StudentRecord, StaffRecord } from "./domain";

type UnplacedCandidate = { personType: "student" | "staff"; personId: string; name: string; gender?: string | null; role: StageRole; reason: string };
export type StageCandidate = UnplacedCandidate & { side: "left" | "center" | "right"; positionOrder: number };
type History = { person_id: string; total_count: number; singer_count: number; last_date: string | null };
type FixedStudent = { studentId: string; role: "singer" | "choir" };
function isSingerTeam(student: StudentRecord) { return String(student.worship_team ?? "").replace(/\s/g, "") === "싱어팀"; }
function genderOf(person: UnplacedCandidate) { const value = String(person.gender ?? ""); return value.includes("여") ? "female" : value.includes("남") ? "male" : "other"; }

export function layoutStage(people: UnplacedCandidate[]): StageCandidate[] {
  const leader = people.find((person) => person.role === "leader");
  const place = (items: UnplacedCandidate[]) => {
    const left: UnplacedCandidate[] = []; const right: UnplacedCandidate[] = [];
    for (const gender of ["female", "male", "other"] as const) {
      const group = items.filter((person) => genderOf(person) === gender);
      for (const person of group) {
        const leftGender = left.filter((item) => genderOf(item) === gender).length; const rightGender = right.filter((item) => genderOf(item) === gender).length;
        if (leftGender < rightGender || (leftGender === rightGender && left.length <= right.length)) left.push(person); else right.push(person);
      }
    }
    const rankLeft = (person: UnplacedCandidate) => genderOf(person) === "male" ? 0 : genderOf(person) === "other" ? 1 : 2;
    const rankRight = (person: UnplacedCandidate) => genderOf(person) === "female" ? 0 : genderOf(person) === "other" ? 1 : 2;
    left.sort((a, b) => rankLeft(a) - rankLeft(b) || a.name.localeCompare(b.name)); right.sort((a, b) => rankRight(a) - rankRight(b) || a.name.localeCompare(b.name));
    return [...left.map((person, positionOrder) => ({ ...person, side: "left" as const, positionOrder })), ...right.map((person, positionOrder) => ({ ...person, side: "right" as const, positionOrder }))];
  };
  return [...place(people.filter((person) => person.role === "choir")), ...place(people.filter((person) => person.role === "singer")), ...(leader ? [{ ...leader, side: "center" as const, positionOrder: 0 }] : [])];
}

export function generateStage(params: {
  students: StudentRecord[]; staff: StaffRecord[]; eligibleStudentIds: Set<string>; presentStaffIds: Set<string>; histories: History[];
  servicePart: 1 | 2; singerSlots: number; choirSlots: number; leaderType: "student" | "staff"; leaderId: string; usedStaffIds: Set<string>;
  missedPreviousWeekIds?: Set<string>; blockedConsecutiveStageIds?: Set<string>; blockedConsecutiveSingerIds?: Set<string>;
  fixedStudents?: FixedStudent[]; excludedStudentIds?: Set<string>; studentRatio?: number;
}) {
  const history = new Map(params.histories.map((item) => [item.person_id, item])); const warnings: string[] = [];
  const leaderStudent = params.leaderType === "student" ? params.students.find((item) => item.id === params.leaderId && item.is_student_leader && params.eligibleStudentIds.has(item.id)) : null;
  const leaderStaff = params.leaderType === "staff" ? params.staff.find((item) => item.id === params.leaderId && item.active) : null;
  const leader = leaderStudent ?? leaderStaff;
  if (!leader) return { assignments: [] as StageCandidate[], warnings: ["선택한 인도자가 등단 자격을 충족하지 않습니다."] };
  if (leaderStudent && params.blockedConsecutiveStageIds?.has(leaderStudent.id)) return { assignments: [] as StageCandidate[], warnings: [`${leaderStudent.name}학생은 지난 2주 연속 등단해 이번 주 인도자로 배정할 수 없습니다.`] };

  const fixed: Array<{ student: StudentRecord; role: "singer" | "choir" }> = [];
  for (const item of params.fixedStudents ?? []) {
    const student = params.students.find((candidate) => candidate.id === item.studentId && isSingerTeam(candidate) && params.eligibleStudentIds.has(candidate.id));
    if (!student) { warnings.push("특별 배정 학생 중 출석·싱어팀 조건을 충족하지 않는 학생을 제외했습니다."); continue; }
    if (params.blockedConsecutiveStageIds?.has(student.id)) { warnings.push(`${student.name}학생은 3주 연속 등단 방지를 위해 특별 배정에서 제외했습니다.`); continue; }
    if (item.role === "singer" && params.choirSlots > 0 && params.blockedConsecutiveSingerIds?.has(student.id)) { warnings.push(`${student.name}학생은 3주 연속 싱어 방지를 위해 싱어 특별 배정에서 제외했습니다.`); continue; }
    fixed.push({ student, role: item.role });
  }
  const fixedIds = new Set(fixed.map((item) => item.student.id));
  const studentPool = params.students.filter((student) => student.service_part === params.servicePart && isSingerTeam(student) && params.eligibleStudentIds.has(student.id) && student.id !== params.leaderId && !fixedIds.has(student.id) && !params.excludedStudentIds?.has(student.id) && !params.blockedConsecutiveStageIds?.has(student.id));
  const score = (student: StudentRecord, singer: boolean) => { const item = history.get(student.id); return (params.missedPreviousWeekIds?.has(student.id) ? -100 : 0) + (item?.total_count ?? 0) * 10 + (item?.last_date ? 20 : 0) + (singer ? (item?.singer_count ?? 0) * 4 : 0) + student.name.charCodeAt(0) / 100000; };
  const eligibleCount = studentPool.length + fixed.length; const totalSlots = params.singerSlots + params.choirSlots; const ratio = Math.min(.8, Math.max(.7, params.studentRatio ?? .75));
  const minimumStudents = Math.ceil(eligibleCount * .7); const maximumStudents = Math.max(minimumStudents, Math.floor(eligibleCount * .8));
  let targetStudents = Math.min(totalSlots, Math.max(fixed.length, Math.min(maximumStudents, Math.max(minimumStudents, Math.round(eligibleCount * ratio)))));
  targetStudents = Math.min(eligibleCount, Math.max(targetStudents, Math.min(params.choirSlots, eligibleCount)));

  const fixedChoir = fixed.filter((item) => item.role === "choir").slice(0, params.choirSlots); const fixedSingers = fixed.filter((item) => item.role === "singer").slice(0, params.singerSlots);
  if (fixed.filter((item) => item.role === "choir").length > params.choirSlots || fixed.filter((item) => item.role === "singer").length > params.singerSlots) warnings.push("특별 배정 인원이 역할 정원을 초과해 정원 내에서만 반영했습니다.");
  const selectedIds = new Set([...fixedChoir, ...fixedSingers].map((item) => item.student.id));
  const choirCandidates = studentPool.filter((student) => !selectedIds.has(student.id)).sort((a, b) => Number(!params.blockedConsecutiveSingerIds?.has(a.id)) - Number(!params.blockedConsecutiveSingerIds?.has(b.id)) || score(a, false) - score(b, false));
  const choir = [...fixedChoir.map((item) => item.student), ...choirCandidates.slice(0, Math.max(0, params.choirSlots - fixedChoir.length))]; choir.forEach((student) => selectedIds.add(student.id));
  const remainingStudentTarget = Math.max(0, targetStudents - choir.length - fixedSingers.length);
  const singerCandidates = studentPool.filter((student) => !selectedIds.has(student.id) && (params.choirSlots === 0 || !params.blockedConsecutiveSingerIds?.has(student.id))).sort((a, b) => score(a, true) - score(b, true));
  const singers = [...fixedSingers.map((item) => item.student), ...singerCandidates.slice(0, Math.min(Math.max(0, params.singerSlots - fixedSingers.length), remainingStudentTarget))];

  const assignments: UnplacedCandidate[] = [
    { personType: params.leaderType, personId: leader.id, name: leader.name, gender: "gender" in leader ? leader.gender : null, role: "leader", reason: "이번 예배 공통 인도자로 선택됨" },
    ...singers.map((student) => ({ personType: "student" as const, personId: student.id, name: student.name, gender: student.gender, role: "singer" as const, reason: fixedIds.has(student.id) ? "특이사항으로 직접 배정" : "최근 등단·싱어 횟수와 연속 배정을 고려" })),
    ...choir.map((student) => ({ personType: "student" as const, personId: student.id, name: student.name, gender: student.gender, role: "choir" as const, reason: fixedIds.has(student.id) ? "특이사항으로 직접 배정" : "최근 등단 횟수와 연속 배정을 고려" })),
  ];
  let missingSingers = params.singerSlots - singers.length;
  const staffPool = params.staff.filter((staff) => params.presentStaffIds.has(staff.id) && staff.id !== params.leaderId).sort((a, b) => Number(params.usedStaffIds.has(a.id)) - Number(params.usedStaffIds.has(b.id)) || Number(Boolean(a.preferred_service && a.preferred_service !== params.servicePart)) - Number(Boolean(b.preferred_service && b.preferred_service !== params.servicePart)) || a.name.localeCompare(b.name));
  for (const staff of staffPool.slice(0, missingSingers)) { const duplicated = params.usedStaffIds.has(staff.id); assignments.push({ personType: "staff", personId: staff.id, name: staff.name, role: "singer", reason: duplicated ? "후보 부족으로 1·2부 중복 배정" : "학생 등단 비율을 유지하며 싱어 인원을 보완" }); params.usedStaffIds.add(staff.id); missingSingers -= 1; }

  if (missingSingers > 0) warnings.push(`싱어 ${missingSingers}명이 부족합니다.`);
  if (choir.length < params.choirSlots) warnings.push(`콰이어 ${params.choirSlots - choir.length}명이 부족합니다.`);
  const assignedStudentIds = new Set(assignments.filter((item) => item.personType === "student").map((item) => item.personId));
  const assignedPerformerStudentIds = new Set(assignments.filter((item) => item.personType === "student" && item.role !== "leader").map((item) => item.personId));
  const continuityRisks = [...studentPool, ...fixed.map((item) => item.student)].filter((student) => params.missedPreviousWeekIds?.has(student.id) && !assignedStudentIds.has(student.id));
  if (continuityRisks.length) warnings.push(`2주 연속 미등단 위험: ${continuityRisks.map((student) => student.name).join(", ")}`);
  const resting = params.students.filter((student) => student.service_part === params.servicePart && params.blockedConsecutiveStageIds?.has(student.id) && params.eligibleStudentIds.has(student.id));
  if (resting.length) warnings.push(`3주 연속 등단 방지 휴식: ${resting.map((student) => student.name).join(", ")}`);
  if (eligibleCount > 0) { const actualRatio = assignedPerformerStudentIds.size / eligibleCount; if (actualRatio < .7 || actualRatio > .8) warnings.push(`학생 등단 비율이 ${Math.round(actualRatio * 100)}%입니다. 정원·특별 배정을 확인해주세요.`); }
  if (params.singerSlots % 2 || params.choirSlots % 2) warnings.push("홀수 인원은 좌우 차이 1명 이내로 배치됩니다.");
  return { assignments: layoutStage(assignments), warnings };
}
