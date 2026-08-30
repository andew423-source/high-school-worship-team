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
  const students = Array.from({ length: 6 }, (_, index) => ({ id: `s${index + 1}`, name: `학생${index + 1}`, grade: index < 3 ? 1 : 2, gender: index % 2 ? "여" : "남", service_part: index % 2 + 1, active: 1, is_student_leader: 0 }));
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
