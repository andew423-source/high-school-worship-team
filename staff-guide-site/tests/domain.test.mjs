import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

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
