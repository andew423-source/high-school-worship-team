import test from "node:test";
import assert from "node:assert/strict";
import { saturdayDates } from "../src/domain/terms.ts";

test("학기 기간 안의 토요일만 주차로 생성한다", () => {
  assert.deepEqual(saturdayDates("2026-08-29", "2026-09-19"), [
    "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19",
  ]);
});

test("시작일이 토요일이 아니어도 첫 토요일부터 생성한다", () => {
  assert.deepEqual(saturdayDates("2026-09-01", "2026-09-12"), ["2026-09-05", "2026-09-12"]);
});

test("잘못된 기간은 빈 목록을 반환한다", () => {
  assert.deepEqual(saturdayDates("2026-09-12", "2026-09-01"), []);
});
