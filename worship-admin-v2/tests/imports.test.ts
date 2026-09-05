import test from "node:test";
import assert from "node:assert/strict";
import { guessMapping, validateMappedRows } from "../src/domain/imports.ts";

test("한국어 학생 DB 열을 자동 매핑하고 표준 값으로 변환한다", () => {
  const headers = ["이름", "학년", "성별", "예배 부서", "팀", "인도자 여부"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [{ 이름: "김학생", 학년: "2학년", 성별: "여", "예배 부서": "1부", 팀: "싱어", "인도자 여부": "학생 인도자" }], mapping);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {
    internalCode: null, name: "김학생", grade: 2, gender: "FEMALE", serviceDepartment: "FIRST",
    team: "SINGER", isStudentLeader: true, note: null, termNote: null, active: true,
  });
});

test("싱어팀·세션팀 열과 팀 접미사가 붙은 값을 인식한다", () => {
  const headers = ["이름", "학년", "성별", "부서", "싱어팀·세션팀"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { 이름: "김학생", 학년: 1, 성별: "여", 부서: 1, "싱어팀·세션팀": "싱어팀" },
    { 이름: "이학생", 학년: 2, 성별: "남", 부서: 2, "싱어팀·세션팀": "세션 팀" },
  ], mapping);

  assert.equal(mapping["싱어팀·세션팀"], "team");
  assert.equal(result.errors.length, 0);
  assert.equal((result.rows[0] as { team: string })?.team, "SINGER");
  assert.equal((result.rows[1] as { team: string })?.team, "SESSION");
});

test("필수 열이 연결되지 않으면 행마다 반복하지 않고 한 번만 안내한다", () => {
  const headers = ["이름", "학년", "성별", "부서", "알 수 없는 팀 열"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { 이름: "김학생", 학년: 1, 성별: "여", 부서: 1, "알 수 없는 팀 열": "싱어" },
    { 이름: "이학생", 학년: 2, 성별: "남", 부서: 2, "알 수 없는 팀 열": "세션" },
  ], mapping);

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]?.message ?? "", /필수 열 '팀'/);
});

test("이름·성별·팀만 있는 스탭 DB를 기본 예배와 역할로 변환한다", () => {
  const headers = ["이름", "성별", "팀"];
  const mapping = guessMapping(headers, "STAFF");
  const result = validateMappedRows("STAFF", [
    { 이름: "황현민", 성별: "남", 팀: "싱어팀, 세션팀" },
    { 이름: "이소정", 성별: "여", 팀: "세션팀" },
  ], mapping);

  assert.equal(mapping.팀, "roleTitle");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {
    name: "황현민", email: null, gender: "MALE", roleTitle: "싱어팀, 세션팀",
    singerCapable: true, groupLeaderCapable: false, preferredService: "BOTH", note: null, active: true,
    defaultStageRole: "SINGER", excludeFromAutoSinger: true, isDefaultStageLeader: true,
  });
  assert.deepEqual(result.rows[1], {
    name: "이소정", email: null, gender: "FEMALE", roleTitle: "세션팀",
    singerCapable: false, groupLeaderCapable: false, preferredService: "BOTH", note: null, active: true,
    defaultStageRole: "SESSION", excludeFromAutoSinger: false, isDefaultStageLeader: false,
  });
});

test("필수값이 없으면 오류 행으로 분리한다", () => {
  const mapping = guessMapping(["이름", "학년", "성별", "예배 부서", "팀"], "STUDENTS");
  const result = validateMappedRows("STUDENTS", [{ 이름: "", 학년: "4", 성별: "", "예배 부서": "3부", 팀: "" }], mapping);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors[0]?.row, 2);
  assert.match(result.errors[0]?.message ?? "", /이름|학년|성별|예배 부서|팀/);
});

test("동명이인은 경고하고 내부 ID 중복은 오류로 표시한다", () => {
  const headers = ["내부 ID", "이름", "학년", "성별", "예배 부서", "팀"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { "내부 ID": "S1", 이름: "김학생", 학년: 1, 성별: "남", "예배 부서": "1부", 팀: "싱어" },
    { "내부 ID": "S1", 이름: "김학생", 학년: 2, 성별: "여", "예배 부서": "2부", 팀: "세션" },
  ], mapping);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.errors.length, 1);
});
