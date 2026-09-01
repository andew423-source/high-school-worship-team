import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("학생 DB의 인도자 여부에서 학생 인도자 문구를 인식한다", async () => {
  const { studentLeaderValue } = await loadTypeScriptModule("../lib/people-import.ts");
  assert.equal(studentLeaderValue("학생 인도자"), true); assert.equal(studentLeaderValue("학생인도자"), true); assert.equal(studentLeaderValue(""), false); assert.equal(studentLeaderValue("일반 학생"), false);
});

test("싱어·콰이어 실제 인원이 목표값과 달라도 인도자가 한 명이면 확정할 수 있다", async () => {
  const { stageCanConfirm } = await loadTypeScriptModule("../lib/stage.ts");
  assert.equal(stageCanConfirm(new Map([["leader", 1], ["singer", 5], ["choir", 2]])), true);
  assert.equal(stageCanConfirm(new Map([["singer", 7]])), false);
  assert.equal(stageCanConfirm(new Map([["leader", 2], ["singer", 7]])), false);
});

test("자동 조 편성은 같은 조·다른 조와 정원을 지킨다", async () => {
  const { autoAssignGroups } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = [
    { id: "s1", name: "학생1", grade: 1, gender: "남", service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 },
    { id: "s2", name: "학생2", grade: 1, gender: "남", service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 },
    { id: "s3", name: "학생3", grade: 2, gender: "여", service_part: 2, worship_team: "세션팀", active: 1, is_student_leader: 0 },
    { id: "s4", name: "학생4", grade: 1, gender: "남", service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 },
    { id: "s5", name: "학생5", grade: 2, gender: "여", service_part: 2, worship_team: "세션팀", active: 1, is_student_leader: 0 },
    { id: "s6", name: "학생6", grade: 2, gender: "여", service_part: 2, worship_team: "세션팀", active: 1, is_student_leader: 0 },
  ];
  const groups = [1, 2].map((number) => ({ id: `g${number}`, term_id: "t", name: `${number}조`, capacity: 3, required_staff: 1, status: "draft", sort_order: number }));
  const result = autoAssignGroups(students, groups, [{ id: "c1", type: "together", student_a_id: "s1", student_b_id: "s2" }, { id: "c2", type: "apart", student_a_id: "s1", student_b_id: "s3" }], 42);
  assert.equal(result.error, undefined); assert.equal(result.assignments.length, 6);
  const groupOf = new Map(result.assignments.map((item) => [item.studentId, item.groupId])); assert.equal(groupOf.get("s1"), groupOf.get("s2")); assert.notEqual(groupOf.get("s1"), groupOf.get("s3"));
  assert.ok(groups.every((group) => result.assignments.filter((item) => item.groupId === group.id).length <= group.capacity));
});

test("불가능한 조 조건은 임의 배정 대신 오류를 반환한다", async () => {
  const { autoAssignGroups } = await loadTypeScriptModule("../lib/grouping.ts");
  const student = (id) => ({ id, name: id, grade: 1, gender: null, service_part: 1, active: 1, is_student_leader: 0 });
  const result = autoAssignGroups([student("a"), student("b")], [{ id: "g", term_id: "t", name: "1조", capacity: 1, required_staff: 0, status: "draft", sort_order: 0 }], [{ id: "c", type: "together", student_a_id: "a", student_b_id: "b" }], 1);
  assert.match(result.error, /정원|배정/); assert.equal(result.assignments.length, 0);
});

test("학생 수가 나누어떨어지지 않아도 최소·최대 범위로 편성한다", async () => {
  const { autoAssignGroups } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `grade1-${index}`, name: `1학년${index}`, grade: 1, gender: "남", service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `grade2-${index}`, name: `2학년${index}`, grade: 2, gender: "여", service_part: 1, worship_team: "세션팀", active: 1, is_student_leader: 0 })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `grade3-${index}`, name: `3학년${index}`, grade: 3, gender: "남", service_part: 1, worship_team: "세션팀", active: 1, is_student_leader: 0 })),
  ];
  const groups = [1, 2, 3].map((number) => ({ id: `fg${number}`, term_id: "t", name: `${number}조`, capacity: 3, required_staff: 1, status: "draft", sort_order: number }));
  const result = autoAssignGroups(students, groups, [], 19, { studentMin: 2, studentMax: 3, staffMin: 0, staffMax: 2, clusterGender: false, clusterGrade: false, splitWorshipRole: false });
  assert.equal(result.error, undefined);
  const counts = groups.map((group) => result.assignments.filter((item) => item.groupId === group.id).length);
  assert.deepEqual([...counts].sort(), [2, 2, 3]);
  for (const group of groups) for (const grade of [1, 2, 3]) {
    const ids = new Set(result.assignments.filter((item) => item.groupId === group.id).map((item) => item.studentId));
    assert.notEqual(students.filter((student) => ids.has(student.id) && student.grade === grade).length, 1);
  }
});

test("자동 편성은 학년이 한 명만 남는 결과를 반환하지 않는다", async () => {
  const { autoAssignGroups } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = [
    ...Array.from({ length: 6 }, (_, index) => ({ id: `g1-${index}`, name: `1학년${index}`, grade: 1, gender: "남", service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `g3-${index}`, name: `3학년${index}`, grade: 3, gender: "여", service_part: 2, worship_team: "세션팀", active: 1, is_student_leader: 0 })),
  ];
  const groups = [1, 2].map((number) => ({ id: `no-single-${number}`, term_id: "t", name: `${number}조`, capacity: 5, required_staff: 0, status: "draft", sort_order: number }));
  const result = autoAssignGroups(students, groups, [], 31, { studentMin: 5, studentMax: 5, staffMin: 0, staffMax: 1, clusterGender: false, clusterGrade: false, splitWorshipRole: false });
  assert.equal(result.error, undefined);
  for (const group of groups) {
    const ids = new Set(result.assignments.filter((item) => item.groupId === group.id).map((item) => item.studentId));
    assert.notEqual(students.filter((student) => ids.has(student.id) && student.grade === 3).length, 1);
  }
});

test("분리 모드는 서로 다른 범주의 혼합을 막는다", async () => {
  const { autoAssignGroups } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = ["남", "남", "여", "여"].map((gender, index) => ({ id: `mode${index}`, name: `학생${index}`, grade: 1, gender, service_part: 1, worship_team: "싱어팀", active: 1, is_student_leader: 0 }));
  const groups = [1, 2].map((number) => ({ id: `mg${number}`, term_id: "t", name: `${number}조`, capacity: 2, required_staff: 0, status: "draft", sort_order: number }));
  const result = autoAssignGroups(students, groups, [], 7, { studentMin: 2, studentMax: 2, staffMin: 0, staffMax: 0, clusterGender: true, clusterGrade: false, splitWorshipRole: false });
  assert.equal(result.error, undefined);
  for (const group of groups) {
    const ids = new Set(result.assignments.filter((item) => item.groupId === group.id).map((item) => item.studentId));
    assert.equal(new Set(students.filter((student) => ids.has(student.id)).map((student) => student.gender)).size, 1);
  }
});

test("수동 이동 검증은 관계 위반과 특정 범주 1인 구성을 알린다", async () => {
  const { evaluateAssignmentWarnings } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = [
    { id: "w1", name: "남1", grade: 1, gender: "남", service_part: 1, worship_team: "세션팀", active: 1, is_student_leader: 0 },
    { id: "w2", name: "남2", grade: 1, gender: "남", service_part: 1, worship_team: "세션팀", active: 1, is_student_leader: 0 },
    { id: "w3", name: "여1", grade: 1, gender: "여", service_part: 1, worship_team: "세션팀", active: 1, is_student_leader: 0 },
  ];
  const groups = [{ id: "wg1", term_id: "t", name: "1조", capacity: 4, required_staff: 0, status: "draft", sort_order: 1 }, { id: "wg2", term_id: "t", name: "2조", capacity: 4, required_staff: 0, status: "draft", sort_order: 2 }];
  const warnings = evaluateAssignmentWarnings(students, groups, [{ id: "t", type: "apart", student_a_id: "w1", student_b_id: "w3" }], [{ studentId: "w1", groupId: "wg1" }, { studentId: "w2", groupId: "wg1" }, { studentId: "w3", groupId: "wg1" }], { studentMin: 1, studentMax: 4, staffMin: 0, staffMax: 0, clusterGender: false, clusterGrade: false, splitWorshipRole: false });
  assert.ok(warnings.some((warning) => warning.includes("다른 조")));
  assert.ok(warnings.some((warning) => warning.includes("남1") && warning.includes("여1") && warning.includes("1조")));
  assert.ok(warnings.some((warning) => warning.includes("성별") && warning.includes("혼자")));
});

test("같은 조 조건 경고에는 학생 이름과 현재 조가 표시된다", async () => {
  const { evaluateAssignmentWarnings } = await loadTypeScriptModule("../lib/grouping.ts");
  const students = [{ id: "a", name: "가학생", grade: 1, gender: "남", service_part: 1, active: 1, is_student_leader: 0 }, { id: "b", name: "나학생", grade: 1, gender: "남", service_part: 1, active: 1, is_student_leader: 0 }];
  const groups = [{ id: "g1", term_id: "t", name: "1조", capacity: 2, required_staff: 0, status: "draft", sort_order: 1 }, { id: "g2", term_id: "t", name: "2조", capacity: 2, required_staff: 0, status: "draft", sort_order: 2 }];
  const warnings = evaluateAssignmentWarnings(students, groups, [{ id: "t", type: "together", student_a_id: "a", student_b_id: "b" }], [{ studentId: "a", groupId: "g1" }, { studentId: "b", groupId: "g2" }], { studentMin: 1, studentMax: 2, staffMin: 0, staffMax: 0, clusterGender: false, clusterGrade: false, splitWorshipRole: false });
  assert.ok(warnings.some((warning) => warning.includes("가학생") && warning.includes("나학생") && warning.includes("1조") && warning.includes("2조")));
});

test("등단 배정은 출석·부서·싱어팀·학생 인도자 규칙을 지킨다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = [
    { id: "leader", name: "인도", service_part: 1, worship_team: "인도팀", is_student_leader: 1, active: 1 },
    { id: "s1", name: "출석1", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "s2", name: "출석2", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "other", name: "악기팀", service_part: 1, worship_team: "악기팀", is_student_leader: 0, active: 1 },
    { id: "wrong", name: "2부", service_part: 2, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
  ];
  const result = generateStage({ students, staff: [], eligibleStudentIds: new Set(["leader", "s1", "s2", "other", "wrong"]), presentStaffIds: new Set(), histories: [], servicePart: 1, singerSlots: 1, choirSlots: 1, leaderType: "student", leaderId: "leader", usedStaffIds: new Set() });
  assert.equal(result.assignments.filter((item) => item.role === "leader").length, 1); assert.ok(!result.assignments.some((item) => item.personId === "wrong")); assert.ok(!result.assignments.some((item) => item.personId === "other")); assert.equal(result.assignments.filter((item) => item.personId === "leader").length, 1);
});

test("지난주 미등단 학생을 먼저 배정하고 선택한 스탭을 인도자로 배정한다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = [
    { id: "recent", name: "최근등단", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "missed1", name: "미등단1", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "missed2", name: "미등단2", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
  ];
  const staff = [{ id: "staff-leader", name: "황현민", can_sing: 0, can_lead_group: 0, active: 1 }];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(), histories: [], servicePart: 1, singerSlots: 1, choirSlots: 1, leaderType: "staff", leaderId: "staff-leader", usedStaffIds: new Set(), missedPreviousWeekIds: new Set(["missed1", "missed2"]) });
  assert.ok(result.assignments.some((item) => item.personId === "staff-leader" && item.role === "leader"));
  assert.deepEqual(new Set(result.assignments.filter((item) => item.personType === "student").map((item) => item.personId)), new Set(["missed1", "missed2"]));
  assert.ok(!result.warnings.some((warning) => warning.includes("2주 연속")));
});

test("학생은 출석 후보의 70~80%만 배정하고 남은 싱어 자리는 스탭이 채운다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = Array.from({ length: 8 }, (_, index) => ({ id: `ratio-${index}`, name: `학생${index}`, gender: index % 2 ? "여" : "남", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 }));
  const staff = [{ id: "leader", name: "황현민", active: 1 }, { id: "helper", name: "싱어스탭", active: 1 }];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(["helper"]), histories: [], servicePart: 1, singerSlots: 5, choirSlots: 2, leaderType: "staff", leaderId: "leader", usedStaffIds: new Set() });
  assert.equal(result.assignments.filter((item) => item.personType === "student" && item.role !== "leader").length, 6);
  assert.ok(result.assignments.some((item) => item.personId === "helper" && item.role === "singer"));
});

test("지난 2주 연속 등단한 학생은 쉬고 싱어 연속 학생은 콰이어로 우선 배정한다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = [
    { id: "rest", name: "휴식", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "choir", name: "콰이어전환", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `normal-${index}`, name: `일반${index}`, service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 })),
  ];
  const staff = [{ id: "leader", name: "황현민", active: 1 }];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(), histories: [], servicePart: 1, singerSlots: 2, choirSlots: 2, leaderType: "staff", leaderId: "leader", usedStaffIds: new Set(), blockedConsecutiveStageIds: new Set(["rest"]), blockedConsecutiveSingerIds: new Set(["choir"]) });
  assert.ok(!result.assignments.some((item) => item.personId === "rest"));
  assert.ok(result.assignments.some((item) => item.personId === "choir" && item.role === "choir"));
});

test("콰이어가 없으면 싱어 3주 연속 제한을 예외로 두고 타부서 특별 배정을 반영한다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = [
    { id: "cross", name: "타부서", service_part: 2, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "same", name: "같은부서", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
  ];
  const staff = [{ id: "leader", name: "황현민", active: 1 }];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(), histories: [], servicePart: 1, singerSlots: 2, choirSlots: 0, leaderType: "staff", leaderId: "leader", usedStaffIds: new Set(), blockedConsecutiveSingerIds: new Set(["cross"]), fixedStudents: [{ studentId: "cross", role: "singer" }] });
  assert.ok(result.assignments.some((item) => item.personId === "cross" && item.role === "singer"));
});

test("무대 배치는 좌우 인원과 성비를 맞추고 여성은 중앙, 남성은 바깥에 둔다", async () => {
  const { layoutStage } = await loadTypeScriptModule("../lib/stage.ts");
  const people = [
    { personType: "student", personId: "m1", name: "남1", gender: "남", role: "singer", reason: "" },
    { personType: "student", personId: "m2", name: "남2", gender: "남", role: "singer", reason: "" },
    { personType: "student", personId: "f1", name: "여1", gender: "여", role: "singer", reason: "" },
    { personType: "student", personId: "f2", name: "여2", gender: "여", role: "singer", reason: "" },
  ];
  const result = layoutStage(people); const left = result.filter((item) => item.side === "left").sort((a, b) => a.positionOrder - b.positionOrder); const right = result.filter((item) => item.side === "right").sort((a, b) => a.positionOrder - b.positionOrder);
  assert.equal(left.length, right.length); assert.ok(left[0].gender.includes("남")); assert.ok(left.at(-1).gender.includes("여")); assert.ok(right[0].gender.includes("여")); assert.ok(right.at(-1).gender.includes("남"));
});

test("여자 싱어가 부족하면 여자 스탭을 우선하고 황현민은 자동 싱어에서 제외한다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = [
    { id: "female-1", name: "여학생1", gender: "여", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    { id: "female-2", name: "여학생2", gender: "여", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `male-${index}`, name: `남학생${index}`, gender: "남", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 })),
  ];
  const staff = [
    { id: "leader", name: "황현민", gender: "남", active: 1 },
    { id: "female-staff", name: "여자스탭", gender: "여", active: 1 },
    { id: "male-staff", name: "남자스탭", gender: "남", active: 1 },
  ];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(staff.map((person) => person.id)), histories: [], servicePart: 1, singerSlots: 5, choirSlots: 2, leaderType: "staff", leaderId: "leader", usedStaffIds: new Set(), minimumFemaleSingers: 3 });
  const singers = result.assignments.filter((item) => item.role === "singer");
  assert.ok(singers.filter((item) => String(item.gender).includes("여")).length >= 3);
  assert.ok(singers.some((item) => item.personId === "female-staff"));
  assert.ok(!singers.some((item) => item.personId === "leader"));
});

test("무조건 등단의 랜덤 역할은 기존 규칙 안에서 실제 배정된다", async () => {
  const { generateStage } = await loadTypeScriptModule("../lib/stage.ts");
  const students = Array.from({ length: 4 }, (_, index) => ({ id: `forced-${index}`, name: `학생${index}`, gender: index % 2 ? "여" : "남", service_part: 1, worship_team: "싱어팀", is_student_leader: 0, active: 1 }));
  const staff = [{ id: "leader", name: "황현민", gender: "남", active: 1 }];
  const result = generateStage({ students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentStaffIds: new Set(), histories: [], servicePart: 1, singerSlots: 1, choirSlots: 1, leaderType: "staff", leaderId: "leader", usedStaffIds: new Set(), fixedStudents: [{ studentId: "forced-3", role: "random" }], blockedConsecutiveStageIds: new Set(["forced-3"]) });
  assert.ok(result.assignments.some((item) => item.personId === "forced-3" && ["singer", "choir"].includes(item.role)));
  assert.ok(result.warnings.some((warning) => warning.includes("무조건 등단") && warning.includes("3주 연속")));
});

test("수동 역할 변경은 3주 연속 역할과 여자 싱어 부족을 구체적으로 경고한다", async () => {
  const { evaluateManualStageWarnings } = await loadTypeScriptModule("../lib/stage.ts");
  const assignments = [
    { personId: "target", role: "choir", gender: "남" },
    { personId: "female-1", role: "singer", gender: "여" },
    { personId: "female-2", role: "singer", gender: "여" },
  ];
  const singerWarnings = evaluateManualStageWarnings({ personId: "target", personName: "강민채", newRole: "singer", previousRoles: ["singer", "singer"], assignments, singerSlots: 4, choirSlots: 2, minimumFemaleSingers: 3 });
  assert.ok(singerWarnings.some((warning) => warning.includes("강민채") && warning.includes("3주 연속 싱어")));
  assert.ok(singerWarnings.some((warning) => warning.includes("여자 싱어") && warning.includes("최소 3명")));
  const choirWarnings = evaluateManualStageWarnings({ personId: "target", personName: "길하진", newRole: "choir", previousRoles: ["choir", "choir"], assignments, singerSlots: 4, choirSlots: 2, minimumFemaleSingers: 3 });
  assert.ok(choirWarnings.some((warning) => warning.includes("길하진") && warning.includes("3주 연속 콰이어")));
});

test("등단표 드래그 이동은 원하는 순서에 정확히 삽입한다", async () => {
  const { reorderStageIds } = await loadTypeScriptModule("../lib/stage.ts");
  assert.deepEqual(reorderStageIds(["a", "b", "c", "d"], "c", 1), ["a", "c", "b", "d"]);
  assert.deepEqual(reorderStageIds(["a", "b", "c"], "x", 99), ["a", "b", "c", "x"]);
  assert.deepEqual(reorderStageIds(["a", "b", "c"], "b", -3), ["b", "a", "c"]);
});
