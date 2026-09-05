import test from "node:test";
import assert from "node:assert/strict";
import { generateStageService, getRestingStageStudents, type StageStudent, type StageOverride } from "../src/domain/stage.ts";

const students: StageStudent[] = Array.from({ length: 8 }, (_, index) => ({
  id: `student-${index}`, name: `테스트 학생 ${index}`, gender: index % 2 ? "MALE" : "FEMALE",
  department: "FIRST", team: "SINGER", isStudentLeader: index === 1,
}));
const excluded: StageOverride[] = [{ termStudentId: students[0].id, kind: "EXCLUDE_STAGE", department: "FIRST" }];

test("등단 안함은 강제 등단과 겹치더라도 자동 싱어·콰이어에 배정하지 않는다", () => {
  const result = generateStageService({
    department: "FIRST", students, staff: [], eligibleStudentIds: new Set(students.map((s) => s.id)),
    presentSingerStaffIds: new Set(), histories: new Map(), singerTarget: 4, choirTarget: 2,
    leaderType: "STAFF", leaderId: "staff-leader", usedStaffIds: new Set(),
    overrides: [...excluded, { termStudentId: students[0].id, kind: "FORCE_STAGE", department: "FIRST", role: "SINGER" }],
  });
  assert.equal(result.assignments.some((a) => a.personId === students[0].id), false);
  assert.equal(result.eligibleStudentIds.includes(students[0].id), false);
});

test("등단 안함 학생은 출결과 무관하게 반에서 예배하기에 표시하고 학생 인도자는 제외한다", () => {
  const resting = getRestingStageStudents({
    students, department: "FIRST", assignments: [], eligibleStudentIds: new Set([students[1].id, students[2].id]),
    overrides: excluded, leaderType: "STUDENT", leaderId: students[1].id,
  });
  assert.deepEqual(resting.map((s) => s.id), [students[0].id, students[2].id]);
});

test("부서 이동을 지정한 미등단 학생은 해당 예배의 반에서 예배하기에만 표시한다", () => {
  const overrides: StageOverride[] = [...excluded, { termStudentId: students[0].id, kind: "MOVE_DEPARTMENT", department: "SECOND" }];
  const params = { students, assignments: [], eligibleStudentIds: new Set<string>(), overrides, leaderType: "STAFF" as const, leaderId: "staff-leader" };
  assert.deepEqual(getRestingStageStudents({ ...params, department: "FIRST" }), []);
  assert.deepEqual(getRestingStageStudents({ ...params, department: "SECOND" }).map((s) => s.id), [students[0].id]);
});
