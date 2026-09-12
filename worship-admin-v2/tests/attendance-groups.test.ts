import assert from "node:assert/strict";
import test from "node:test";
import { attendanceGroupSelection } from "../src/domain/attendance-groups.ts";
import { canManage, canUseStaffTools } from "../src/lib/roles.ts";

const groups = [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }, { id: "c", sort_order: 2 }];
const links = [{ group_id: "b", staff_id: "staff" }];

test("staff see every group with their own group selected first", () => {
  const result = attendanceGroupSelection(groups, links, "staff", null);
  assert.deepEqual(result.groups.map((group) => group.id), ["b", "a", "c"]);
  assert.equal(result.selectedGroupId, "b");
  assert.equal(groups[0].id, "a");
});
test("staff can explicitly select another group; stale or foreign IDs fall back", () => {
  assert.equal(attendanceGroupSelection(groups, links, "staff", "c").selectedGroupId, "c");
  assert.equal(attendanceGroupSelection(groups, links, "staff", "foreign").selectedGroupId, "b");
});
test("unassigned staff and admins retain all groups in ordinary order", () => {
  for (const staffId of [null, "unassigned"]) {
    assert.deepEqual(attendanceGroupSelection(groups, links, staffId, null).groups, groups);
  }
  assert.equal(attendanceGroupSelection([], links, "staff", null).selectedGroupId, undefined);
});
test("only active approved roles pass the operational API access guard", () => {
  for (const role of ["ADMIN", "GROUP_STAFF"] as const) {
    for (const status of ["PENDING", "DISABLED"] as const) {
      assert.equal(canManage({ role, status }) || canUseStaffTools({ role, status }), false);
    }
    assert.equal(canManage({ role, status: "ACTIVE" }) || canUseStaffTools({ role, status: "ACTIVE" }), true);
  }
  assert.equal(canManage(null) || canUseStaffTools(null), false);
});
