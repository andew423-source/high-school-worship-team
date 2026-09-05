import test from "node:test";
import assert from "node:assert/strict";
import { evaluateManualStageWarnings, generateStageService, layoutStage, type StageHistory, type StageStaff, type StageStudent } from "../src/domain/stage.ts";

const students: StageStudent[] = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, name: `학생${index}`, gender: index < 4 ? "FEMALE" : "MALE", department: "FIRST", team: "SINGER", isStudentLeader: false }));
const staff: StageStaff[] = [
  { id: "leader", name: "황현민", gender: "MALE", preferredService: "BOTH", singerCapable: true, excludeFromAutoSinger: true },
  { id: "female-staff", name: "여자스탭", gender: "FEMALE", preferredService: "FIRST", singerCapable: true, excludeFromAutoSinger: false },
];
const blankHistory = new Map<string, StageHistory>();

test("학생 후보의 70~80%를 배정하고 황현민은 자동 싱어에서 제외한다", () => {
  const result = generateStageService({ department: "FIRST", students, staff, eligibleStudentIds: new Set(students.map((student) => student.id)), presentSingerStaffIds: new Set(staff.map((item) => item.id)), histories: blankHistory, singerTarget: 5, choirTarget: 1, leaderType: "STAFF", leaderId: "leader", overrides: [], usedStaffIds: new Set() });
  const studentCount = result.assignments.filter((item) => item.personType === "STUDENT").length;
  assert.ok(studentCount / students.length >= .7 && studentCount / students.length <= .8);
  assert.equal(result.assignments.some((item) => item.personId === "leader"), false);
});

test("3주 연속 등단 학생은 자동으로 쉬고 지난주 미등단 학생을 우선한다", () => {
  const histories = new Map<string, StageHistory>([
    ["s0", { totalCount: 2, singerCount: 2, stagedPreviousTwo: true, singerPreviousTwo: true, missedPrevious: false }],
    ["s1", { totalCount: 0, singerCount: 0, stagedPreviousTwo: false, singerPreviousTwo: false, missedPrevious: true }],
  ]);
  const result = generateStageService({ department: "FIRST", students, staff: [], eligibleStudentIds: new Set(students.map((student) => student.id)), presentSingerStaffIds: new Set(), histories, singerTarget: 4, choirTarget: 2, leaderType: "STAFF", leaderId: "leader", overrides: [], usedStaffIds: new Set() });
  assert.equal(result.assignments.some((item) => item.personId === "s0"), false);
  assert.equal(result.assignments.some((item) => item.personId === "s1"), true);
});

test("여자 싱어 권장 조건 때문에 목표 인원을 초과하지 않는다", () => {
  const maleStudents = students.map((student) => ({ ...student, gender: "MALE" as const }));
  const result = generateStageService({ department: "FIRST", students: maleStudents, staff, eligibleStudentIds: new Set(maleStudents.map((student) => student.id)), presentSingerStaffIds: new Set(staff.map((item) => item.id)), histories: blankHistory, singerTarget: 6, choirTarget: 0, leaderType: "STAFF", leaderId: "leader", overrides: [], usedStaffIds: new Set() });
  assert.equal(result.assignments.filter((item) => item.role === "SINGER").length, 6);
  assert.ok(result.warnings.some((warning) => warning.includes("여자 싱어")));
  assert.equal(result.assignments.some((item) => item.personId === "leader"), false);
});

test("수동 싱어 변경은 연속 싱어와 여자 싱어 부족을 경고한다", () => {
  const assignment = { ...layoutStage([{ personType: "STUDENT" as const, personId: "s4", name: "강민채", gender: "MALE" as const, role: "CHOIR" as const, reason: "", isManual: false }])[0] };
  const warnings = evaluateManualStageWarnings({ assignment, nextRole: "SINGER", history: { totalCount: 2, singerCount: 2, stagedPreviousTwo: false, singerPreviousTwo: true, missedPrevious: false }, choirTarget: 2, assignments: [assignment], minimumFemaleSingers: 3 });
  assert.ok(warnings.some((warning) => warning.includes("강민채") && warning.includes("3주 연속 싱어")));
  assert.ok(warnings.some((warning) => warning.includes("여자 싱어")));
});

test("등단표 좌우는 인원 차이가 한 명 이내이고 여성은 중앙 쪽에 정렬한다", () => {
  const laidOut = layoutStage(students.slice(0, 5).map((student) => ({ personType: "STUDENT" as const, personId: student.id, name: student.name, gender: student.gender, role: "SINGER" as const, reason: "", isManual: false })));
  assert.ok(Math.abs(laidOut.filter((item) => item.side === "LEFT").length - laidOut.filter((item) => item.side === "RIGHT").length) <= 1);
});
