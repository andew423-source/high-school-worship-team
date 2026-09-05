import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGrouping, generateGrouping, introducedGroupingWarnings, type GroupingSettings, type GroupingStudent } from "../src/domain/grouping.ts";

const settings: GroupingSettings = { groupCount: 2, studentMin: 4, studentMax: 4, staffMin: 1, staffMax: 2, clusterGender: false, clusterGrade: false, splitTeam: false };
const students: GroupingStudent[] = Array.from({ length: 8 }, (_, index) => ({ id: `student-${index}`, name: `학생${index}`, grade: index < 4 ? 1 : 2, gender: index % 2 ? "FEMALE" : "MALE", team: index % 4 < 2 ? "SINGER" : "SESSION", serviceDepartment: index % 2 ? "FIRST" : "SECOND" }));

test("조 자동 편성은 같은 조·다른 조와 1인 구성 방지 조건을 지킨다", () => {
  const result = generateGrouping(students, settings, [
    { id: "together", type: "TOGETHER", memberIds: ["student-0", "student-2"] },
    { id: "apart", type: "APART", memberIds: ["student-0", "student-1"] },
  ], 42);
  assert.equal(result.error, undefined);
  const groupOf = new Map(result.assignments.map((item) => [item.termStudentId, item.groupIndex]));
  assert.equal(groupOf.get("student-0"), groupOf.get("student-2"));
  assert.notEqual(groupOf.get("student-0"), groupOf.get("student-1"));
  assert.deepEqual(evaluateGrouping({ students, settings, rules: [], assignments: result.assignments }), []);
});

test("톱시드가 조보다 많으면 원인을 표시하고 배정하지 않는다", () => {
  const result = generateGrouping(students, settings, [{ id: "seed", type: "TOP_SEED", memberIds: ["student-0", "student-1", "student-2"] }], 1);
  assert.match(result.error ?? "", /톱시드 3명/);
  assert.equal(result.assignments.length, 0);
});

test("수동 이동으로 다른 조 조건이 깨지면 학생 이름과 조를 경고한다", () => {
  const warnings = evaluateGrouping({ students, settings: { ...settings, studentMin: 0, studentMax: 8 }, rules: [{ id: "apart", type: "APART", memberIds: ["student-0", "student-1"] }], assignments: students.map((student) => ({ termStudentId: student.id, groupIndex: 0 })) });
  assert.ok(warnings.some((warning) => warning.includes("학생0·학생1") && warning.includes("1조")));
});

test("수동 이동 경고는 이동으로 새로 생긴 위반만 알려준다", () => {
  const currentAssignments = students.map((student, index) => ({ termStudentId: student.id, groupIndex: index < 4 ? 0 : 1 }));
  const nextAssignments = currentAssignments.map((assignment) => assignment.termStudentId === "student-1" ? { ...assignment, groupIndex: 1 } : assignment);
  const warnings = introducedGroupingWarnings({ students, settings: { ...settings, studentMin: 0, studentMax: 8 }, rules: [{ id: "apart", type: "APART", memberIds: ["student-1", "student-4"] }], currentAssignments, nextAssignments });
  assert.ok(warnings.some((warning) => warning.includes("학생1·학생4") && warning.includes("2조")));
});

test("수동 편성도 동성조·동학년조·팀 분리 설정 위반을 경고한다", () => {
  const warnings = evaluateGrouping({ students, settings: { ...settings, studentMin: 0, studentMax: 8, clusterGender: true, clusterGrade: true, splitTeam: true }, rules: [], assignments: students.map((student) => ({ termStudentId: student.id, groupIndex: 0 })) });
  assert.ok(warnings.some((warning) => warning.includes("서로 다른 성별")));
  assert.ok(warnings.some((warning) => warning.includes("서로 다른 학년")));
  assert.ok(warnings.some((warning) => warning.includes("싱어와 세션")));
});

test("100명·6개 조 자동 편성을 작업 응답 예산 안에서 계산한다", () => {
  const largeRoster: GroupingStudent[] = Array.from({ length: 100 }, (_, index) => ({ id: `large-${index}`, name: `학생${index}`, grade: index % 3 + 1, gender: index % 2 ? "FEMALE" : "MALE", team: index % 4 < 2 ? "SINGER" : "SESSION", serviceDepartment: index % 2 ? "FIRST" : "SECOND" }));
  const startedAt = performance.now();
  const result = generateGrouping(largeRoster, { ...settings, groupCount: 6, studentMin: 16, studentMax: 17 }, [], 42);
  assert.equal(result.assignments.length, 100);
  assert.ok(performance.now() - startedAt < 500);
});

test("33명·6개 조에서도 성별·학년·팀 1인 구성을 만들지 않는다", () => {
  const roster: GroupingStudent[] = Array.from({ length: 33 }, (_, index) => ({
    id: `roster-${index}`,
    name: `학생${index}`,
    grade: index % 3 + 1,
    gender: index % 5 < 3 ? "FEMALE" : "MALE",
    team: index % 5 < 3 ? "SINGER" : "SESSION",
    serviceDepartment: index % 2 ? "FIRST" : "SECOND",
  }));
  const result = generateGrouping(roster, { ...settings, groupCount: 6, studentMin: 5, studentMax: 6 }, [], 20260904);
  assert.equal(result.error, undefined);
  assert.equal(result.assignments.length, roster.length);
  assert.deepEqual(evaluateGrouping({ students: roster, settings: { ...settings, groupCount: 6, studentMin: 5, studentMax: 6 }, rules: [], assignments: result.assignments }), []);
});
