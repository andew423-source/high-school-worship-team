export type StageDepartment = "FIRST" | "SECOND";
export type StagePersonType = "STUDENT" | "STAFF";
export type StagePerformanceRole = "SINGER" | "CHOIR";
export type StageSide = "LEFT" | "RIGHT";

export type StageStudent = {
  id: string;
  name: string;
  gender: "FEMALE" | "MALE" | "UNSPECIFIED";
  department: StageDepartment;
  team: "SINGER" | "SESSION";
  isStudentLeader: boolean;
};

export type StageStaff = {
  id: string;
  name: string;
  gender: "FEMALE" | "MALE" | "UNSPECIFIED";
  preferredService: "FIRST" | "SECOND" | "BOTH";
  singerCapable: boolean;
  excludeFromAutoSinger: boolean;
};

export type StageOverride = {
  termStudentId: string;
  kind: "MOVE_DEPARTMENT" | "FORCE_STAGE" | "EXCLUDE_STAGE";
  department: StageDepartment;
  role?: StagePerformanceRole | "RANDOM";
};

export type StageAssignment = {
  personType: StagePersonType;
  personId: string;
  name: string;
  gender: StageStudent["gender"];
  role: StagePerformanceRole;
  side: StageSide;
  positionOrder: number;
  reason: string;
  isManual: boolean;
};

export type StageHistory = {
  totalCount: number;
  singerCount: number;
  stagedPreviousTwo: boolean;
  singerPreviousTwo: boolean;
  missedPrevious: boolean;
};

/** Explicit staff-only mode ignores per-service targets and duplicate preferences. */
export function generateStaffOnlyService(staff: StageStaff[], presentSingerStaffIds: Set<string>, leaderId: string) {
  return layoutStage(staff.filter((person) => presentSingerStaffIds.has(person.id) && person.singerCapable && person.id !== leaderId).map((person) => ({
    personType: "STAFF" as const, personId: person.id, name: person.name, gender: person.gender,
    role: "SINGER" as const, reason: "스탭만 등단: 참석 싱어 스탭을 1·2부 모두 배정", isManual: false,
  })));
}

export function summarizeStageAttendance(params: {
  students: StageStudent[];
  attendance: Array<{ term_student_id: string; status: string }>;
  lateCountsAsPresent: boolean;
  cancelled: boolean;
  overrides: StageOverride[];
  leaderType: StagePersonType;
  leaderId: string;
}) {
  const attendance = new Map(params.attendance.map((row) => [row.term_student_id, row.status]));
  const result = { FIRST: { present: 0, late: 0, recognized: 0, candidates: 0 }, SECOND: { present: 0, late: 0, recognized: 0, candidates: 0 } };
  if (params.cancelled) return result;
  for (const student of params.students) {
    const department = params.overrides.find((item) => item.termStudentId === student.id && item.kind === "MOVE_DEPARTMENT")?.department ?? student.department;
    const count = result[department];
    const status = attendance.get(student.id);
    if (status === "PRESENT") count.present++;
    if (status === "LATE") count.late++;
    if (status !== "PRESENT" && !(params.lateCountsAsPresent && status === "LATE")) continue;
    count.recognized++;
    if (student.team === "SINGER" && !(params.leaderType === "STUDENT" && params.leaderId === student.id)
      && !params.overrides.some((item) => item.termStudentId === student.id && item.kind === "EXCLUDE_STAGE")) count.candidates++;
  }
  return result;
}

export function layoutStage(items: Omit<StageAssignment, "side" | "positionOrder">[]): StageAssignment[] {
  const output: StageAssignment[] = [];
  for (const role of ["CHOIR", "SINGER"] as const) {
    const people = items.filter((item) => item.role === role);
    const left: typeof people = [];
    const right: typeof people = [];
    for (const gender of ["FEMALE", "MALE", "UNSPECIFIED"] as const) {
      for (const person of people.filter((item) => item.gender === gender).sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
        const leftSame = left.filter((item) => item.gender === gender).length;
        const rightSame = right.filter((item) => item.gender === gender).length;
        if (leftSame < rightSame || (leftSame === rightSame && left.length <= right.length)) left.push(person);
        else right.push(person);
      }
    }
    const centerRank = (person: typeof people[number], side: StageSide) => {
      if (person.gender === "FEMALE") return side === "LEFT" ? 2 : 0;
      if (person.gender === "MALE") return side === "LEFT" ? 0 : 2;
      return 1;
    };
    left.sort((a, b) => centerRank(a, "LEFT") - centerRank(b, "LEFT"));
    right.sort((a, b) => centerRank(a, "RIGHT") - centerRank(b, "RIGHT"));
    output.push(...left.map((person, positionOrder) => ({ ...person, side: "LEFT" as const, positionOrder })));
    output.push(...right.map((person, positionOrder) => ({ ...person, side: "RIGHT" as const, positionOrder })));
  }
  return output;
}

export function reorderStage(assignments: StageAssignment[], movingKey: string, targetRole: StagePerformanceRole, targetSide: StageSide, targetIndex: number) {
  const moving = assignments.find((item) => `${item.personType}:${item.personId}` === movingKey);
  if (!moving) return assignments;
  const others = assignments.filter((item) => item !== moving);
  const target = others.filter((item) => item.role === targetRole && item.side === targetSide).sort((a, b) => a.positionOrder - b.positionOrder);
  target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, { ...moving, role: targetRole, side: targetSide, isManual: true });
  const targetKeys = new Set(target.map((item) => `${item.personType}:${item.personId}`));
  return [
    ...others.filter((item) => !targetKeys.has(`${item.personType}:${item.personId}`)),
    ...target.map((item, positionOrder) => ({ ...item, positionOrder })),
  ];
}

export function evaluateManualStageWarnings(params: {
  assignment: StageAssignment;
  nextRole: StagePerformanceRole;
  history: StageHistory | undefined;
  choirTarget: number;
  assignments: StageAssignment[];
  minimumFemaleSingers?: number;
}) {
  const warnings: string[] = [];
  if (params.assignment.personType === "STUDENT" && params.nextRole === "SINGER" && params.choirTarget > 0 && params.history?.singerPreviousTwo) {
    warnings.push(`${params.assignment.name} 학생이 3주 연속 싱어가 됩니다.`);
  }
  const simulated = params.assignments.map((item) => item.personId === params.assignment.personId && item.personType === params.assignment.personType ? { ...item, role: params.nextRole } : item);
  const femaleSingers = simulated.filter((item) => item.role === "SINGER" && item.gender === "FEMALE").length;
  const required = params.minimumFemaleSingers ?? 3;
  if (femaleSingers < required) warnings.push(`여자 싱어가 ${femaleSingers}명으로 권장 최소 ${required}명보다 적어집니다.`);
  return warnings;
}

export function generateStageService(params: {
  department: StageDepartment;
  students: StageStudent[];
  staff: StageStaff[];
  eligibleStudentIds: Set<string>;
  presentSingerStaffIds: Set<string>;
  histories: Map<string, StageHistory>;
  singerTarget: number;
  choirTarget: number;
  leaderType: StagePersonType;
  leaderId: string;
  overrides: StageOverride[];
  usedStaffIds: Set<string>;
  studentRatio?: number;
  minimumFemaleSingers?: number;
}) {
  const warnings: string[] = [];
  const moved = new Map(params.overrides.filter((item) => item.kind === "MOVE_DEPARTMENT").map((item) => [item.termStudentId, item.department]));
  const excluded = new Set(params.overrides.filter((item) => item.kind === "EXCLUDE_STAGE").map((item) => item.termStudentId));
  const forced = params.overrides.filter((item) => item.kind === "FORCE_STAGE" && item.department === params.department);
  const pool = params.students.filter((student) =>
    student.team === "SINGER" && params.eligibleStudentIds.has(student.id) && !excluded.has(student.id)
    && (moved.get(student.id) ?? student.department) === params.department
    && !(params.leaderType === "STUDENT" && params.leaderId === student.id)
  );
  const staffPool = params.staff.filter((staff) => params.presentSingerStaffIds.has(staff.id) && staff.singerCapable && !staff.excludeFromAutoSinger && staff.id !== params.leaderId);
  const requiredFemale = Math.min(params.minimumFemaleSingers ?? 3, params.singerTarget);
  const ratio = Math.min(.8, Math.max(.7, params.studentRatio ?? .75));
  const historyOf = (student: StageStudent) => params.histories.get(student.id);
  const compareStudent = (singer: boolean) => (a: StageStudent, b: StageStudent) =>
    Number(!!historyOf(a)?.stagedPreviousTwo) - Number(!!historyOf(b)?.stagedPreviousTwo)
    || (singer && params.choirTarget > 0 ? Number(!!historyOf(a)?.singerPreviousTwo) - Number(!!historyOf(b)?.singerPreviousTwo) : 0)
    || Number(!historyOf(a)?.missedPrevious) - Number(!historyOf(b)?.missedPrevious)
    || (singer ? Number(a.gender !== "FEMALE") - Number(b.gender !== "FEMALE") : 0)
    || (historyOf(a)?.totalCount ?? 0) - (historyOf(b)?.totalCount ?? 0)
    || (singer ? (historyOf(a)?.singerCount ?? 0) - (historyOf(b)?.singerCount ?? 0) : 0)
    || a.name.localeCompare(b.name, "ko");
  const fixed = new Map<string, StagePerformanceRole>();
  const randomForced = new Set<string>();
  for (const override of forced) {
    const student = pool.find((person) => person.id === override.termStudentId);
    if (!student) { warnings.push("무조건 등단 학생이 출석·부서·제외 조건을 충족하지 않습니다."); continue; }
    if (!override.role || override.role === "RANDOM") randomForced.add(student.id);
    else if ([...fixed.values()].filter((role) => role === override.role).length < (override.role === "SINGER" ? params.singerTarget : params.choirTarget)) fixed.set(student.id, override.role);
    else warnings.push(`${student.name}: 무조건 ${override.role === "SINGER" ? "싱어" : "콰이어"} 조건이 목표 인원을 초과합니다. 특이사항 또는 목표 인원을 조정해주세요.`);
  }

  // Compare complete role allocations for 0–3 supporting staff, rather than
  // independently filling singers/choir and sacrificing the other role.
  const alternatives: Array<{ assignments: Omit<StageAssignment, "side" | "positionOrder">[]; rank: number[] }> = [];
  for (let staffCount = 0; staffCount <= Math.min(3, staffPool.length, params.singerTarget); staffCount++) {
    const selected = new Map(fixed);
    const fixedSingers = [...fixed.values()].filter((role) => role === "SINGER").length;
    if (fixedSingers + staffCount > params.singerTarget) continue;
    const remaining = pool.filter((student) => !selected.has(student.id));
    const order = (singer: boolean) => (a: StageStudent, b: StageStudent) =>
      Number(!randomForced.has(a.id)) - Number(!randomForced.has(b.id)) || compareStudent(singer)(a, b);
    // Reserve choir places (only students can fill them) before choosing singers.
    const choirNeeded = Math.max(0, params.choirTarget - [...selected.values()].filter((role) => role === "CHOIR").length);
    const singerNeeded = Math.max(0, Math.min(params.singerTarget - staffCount - fixedSingers, remaining.length - Math.min(choirNeeded, remaining.length)));
    for (const student of [...remaining].sort(order(true)).slice(0, singerNeeded)) selected.set(student.id, "SINGER");
    for (const student of remaining.filter((person) => !selected.has(person.id)).sort(order(false)).slice(0, choirNeeded)) selected.set(student.id, "CHOIR");
    const studentAssignments = pool.filter((student) => selected.has(student.id)).map((student) => ({
      personType: "STUDENT" as const, personId: student.id, name: student.name, gender: student.gender,
      role: selected.get(student.id)!, reason: forced.some((item) => item.termStudentId === student.id) ? "특이사항 반영" : "목표 인원·등단 비율·연속 기록을 고려", isManual: false,
    }));
    const femaleStudents = studentAssignments.filter((person) => person.role === "SINGER" && person.gender === "FEMALE").length;
    const staffOrder = [...staffPool].sort((a, b) =>
      Number(params.usedStaffIds.has(a.id)) - Number(params.usedStaffIds.has(b.id))
      || Number(a.preferredService !== "BOTH" && a.preferredService !== params.department) - Number(b.preferredService !== "BOTH" && b.preferredService !== params.department)
      || a.name.localeCompare(b.name, "ko"));
    const femaleStaff = staffOrder.filter((person) => person.gender === "FEMALE").slice(0, Math.min(staffCount, Math.max(0, requiredFemale - femaleStudents)));
    const chosenStaff = [...femaleStaff, ...staffOrder.filter((person) => !femaleStaff.includes(person))].slice(0, staffCount);
    const assignments = [...studentAssignments, ...chosenStaff.map((person) => ({
      personType: "STAFF" as const, personId: person.id, name: person.name, gender: person.gender,
      role: "SINGER" as const, reason: "목표 싱어 인원 보완", isManual: false,
    }))];
    const singers = assignments.filter((person) => person.role === "SINGER").length;
    const choir = assignments.filter((person) => person.role === "CHOIR").length;
    const count = studentAssignments.length;
    const ratioDistance = pool.length ? Math.max(0, pool.length * .7 - count, count - pool.length * .8) : 0;
    const consecutive = studentAssignments.filter((person) => params.histories.get(person.personId)?.stagedPreviousTwo).length;
    const consecutiveSingers = studentAssignments.filter((person) => person.role === "SINGER" && params.choirTarget > 0 && params.histories.get(person.personId)?.singerPreviousTwo).length;
    const femaleCount = assignments.filter((person) => person.role === "SINGER" && person.gender === "FEMALE").length;
    alternatives.push({ assignments, rank: [
      params.singerTarget - singers + params.choirTarget - choir,
      [...randomForced].filter((id) => !selected.has(id)).length,
      ratioDistance, consecutive, consecutiveSingers,
      Math.max(0, requiredFemale - femaleCount), Math.abs(count - pool.length * ratio),
      chosenStaff.filter((person) => params.usedStaffIds.has(person.id)).length, staffCount,
    ] });
  }
  alternatives.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return 0;
  });
  const unplaced = alternatives[0]?.assignments ?? [];
  for (const person of unplaced.filter((person) => person.personType === "STAFF")) params.usedStaffIds.add(person.personId);
  const assignedStudents = unplaced.filter((person) => person.personType === "STUDENT");
  const assignedIds = new Set(assignedStudents.map((person) => person.personId));
  for (const role of ["SINGER", "CHOIR"] as const) {
    const missing = (role === "SINGER" ? params.singerTarget : params.choirTarget) - unplaced.filter((person) => person.role === role).length;
    if (missing > 0) warnings.push(`${role === "SINGER" ? "싱어" : "콰이어"} ${missing}명이 부족합니다. 출석 후보와 스탭 최대 3명 제한 안에서는 목표 인원을 채울 수 없습니다.`);
  }
  if (pool.length && (assignedStudents.length / pool.length < .7 || assignedStudents.length / pool.length > .8)) warnings.push(`목표 인원을 우선하여 학생 등단 비율이 ${Math.round(assignedStudents.length / pool.length * 100)}%입니다. 권장 비율 70~80%와 다릅니다.`);
  for (const person of assignedStudents) {
    const history = params.histories.get(person.personId);
    if (history?.stagedPreviousTwo) warnings.push(`${person.name}: 목표 인원·비율을 우선하여 3주 연속 등단합니다.`);
    if (person.role === "SINGER" && params.choirTarget > 0 && history?.singerPreviousTwo) warnings.push(`${person.name}: 목표 인원·비율을 우선하여 3주 연속 싱어가 됩니다.`);
  }
  const femaleCount = unplaced.filter((person) => person.role === "SINGER" && person.gender === "FEMALE").length;
  if (femaleCount < requiredFemale) warnings.push(`여자 싱어가 ${femaleCount}명입니다. 목표 인원을 초과하지 않고 권장 ${requiredFemale}명을 확보하기 어렵습니다.`);
  const missed = pool.filter((person) => params.histories.get(person.id)?.missedPrevious && !assignedIds.has(person.id));
  if (missed.length) warnings.push(`2주 연속 미등단 위험: ${missed.map((person) => person.name).join(", ")}`);
  for (const id of randomForced) if (!assignedIds.has(id)) warnings.push("무조건 등단 조건과 목표 인원이 충돌합니다. 특이사항을 확인해주세요.");
  return { assignments: layoutStage(unplaced), warnings: [...new Set(warnings)], eligibleStudentIds: pool.map((person) => person.id) };
}

/** The leader is already on stage; explicit exclusions rest even without attendance. */
export function getRestingStageStudents<T extends { id: string; department: StageDepartment }>(params: {
  students: T[];
  department: StageDepartment;
  assignments: Pick<StageAssignment, "personType" | "personId">[];
  eligibleStudentIds: Set<string>;
  overrides: StageOverride[];
  leaderType: StagePersonType;
  leaderId: string;
}): T[] {
  const assigned = new Set(params.assignments.filter((item) => item.personType === "STUDENT").map((item) => item.personId));
  const excluded = new Set(params.overrides.filter((item) => item.kind === "EXCLUDE_STAGE").map((item) => item.termStudentId));
  const moved = new Map(params.overrides.filter((item) => item.kind === "MOVE_DEPARTMENT").map((item) => [item.termStudentId, item.department]));
  return params.students.filter((student) =>
    !(params.leaderType === "STUDENT" && params.leaderId === student.id)
    && (moved.get(student.id) ?? student.department) === params.department
    && (excluded.has(student.id) || (params.eligibleStudentIds.has(student.id) && !assigned.has(student.id)))
  );
}
