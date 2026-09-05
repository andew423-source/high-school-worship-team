import assert from "node:assert/strict";
import test from "node:test";
import { generateStaffOnlyService, summarizeStageAttendance, type StageStaff, type StageStudent } from "../src/domain/stage.ts";

test("staff-only uses every attending singer in both services regardless of targets or preference, excluding leader", () => {
  const staff: StageStaff[] = ["leader", "a", "b", "absent", "session"].map((id) => ({ id, name: id, gender: "FEMALE", preferredService: "FIRST", singerCapable: true, excludeFromAutoSinger: id === "leader" }));
  const attending = new Set(["leader", "a", "b"]);
  for (const service of ["FIRST", "SECOND"]) {
    const assigned = generateStaffOnlyService(staff, attending, "leader");
    assert.deepEqual(assigned.map((row) => row.personId).sort(), ["a", "b"], service);
    assert.ok(assigned.every((row) => row.personType === "STAFF" && row.role === "SINGER"));
    assert.equal(new Set(assigned.map((row) => row.personId)).size, assigned.length);
  }
  assert.deepEqual(generateStaffOnlyService(staff, new Set(), "leader"), []);
});

test("attendance counts include session attendance, respect late setting, exclusions, leader and department moves", () => {
  const students: StageStudent[] = ["present", "late", "session", "leader", "excluded", "moved", "absent"].map((id) => ({ id, name: id, gender: "FEMALE", department: "FIRST", team: id === "session" ? "SESSION" : "SINGER", isStudentLeader: id === "leader" }));
  const params = { students, attendance: students.map((row) => ({ term_student_id: row.id, status: row.id === "late" ? "LATE" : row.id === "absent" ? "ABSENT" : "PRESENT" })), lateCountsAsPresent: false, cancelled: false, leaderType: "STUDENT" as const, leaderId: "leader", overrides: [{ kind: "EXCLUDE_STAGE" as const, termStudentId: "excluded", department: "FIRST" as const }, { kind: "MOVE_DEPARTMENT" as const, termStudentId: "moved", department: "SECOND" as const }] };
  assert.deepEqual(summarizeStageAttendance(params), { FIRST: { present: 4, late: 1, recognized: 4, candidates: 1 }, SECOND: { present: 1, late: 0, recognized: 1, candidates: 1 } });
  assert.equal(summarizeStageAttendance({ ...params, lateCountsAsPresent: true }).FIRST.candidates, 2);
  assert.equal(summarizeStageAttendance({ ...params, cancelled: true }).FIRST.recognized, 0);
});
