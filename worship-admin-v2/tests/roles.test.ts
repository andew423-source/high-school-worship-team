import test from "node:test";
import assert from "node:assert/strict";
import { canManage, canUseStaffTools, destinationForProfile } from "../src/lib/roles.ts";

test("활성 운영자는 운영 센터로 이동한다", () => {
  assert.equal(destinationForProfile({ role: "ADMIN", status: "ACTIVE" }), "/admin");
  assert.equal(canManage({ role: "ADMIN", status: "ACTIVE" }), true);
});
test("활성 조 담당 스탭은 주차 화면으로 이동한다", () => {
  assert.equal(destinationForProfile({ role: "GROUP_STAFF", status: "ACTIVE" }), "/weeks");
  assert.equal(canUseStaffTools({ role: "GROUP_STAFF", status: "ACTIVE" }), true);
});
test("대기 또는 중지 계정은 승인 상태 화면으로 이동한다", () => {
  assert.equal(destinationForProfile({ role: "GROUP_STAFF", status: "PENDING" }), "/pending");
  assert.equal(destinationForProfile({ role: "ADMIN", status: "DISABLED" }), "/pending");
});
