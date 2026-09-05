import test from "node:test";
import assert from "node:assert/strict";
import { includeStageExportNode } from "../src/lib/stage-export.ts";

function element(tagName: string, classes: string[] = [], empty = false) {
  return { nodeType: 1, tagName, classList: { contains: (value: string) => classes.includes(value) }, getAttribute: (name: string) => name === "data-export-empty" && empty ? "true" : null } as unknown as HTMLElement;
}
test("exports omit drag hints, edit buttons and empty choir rows", () => {
  assert.equal(includeStageExportNode(element("SPAN", ["drop-placeholder"])), false);
  assert.equal(includeStageExportNode(element("BUTTON")), false);
  assert.equal(includeStageExportNode(element("DIV", ["choir-row"], true)), false);
});
test("exports retain title, actual singers, choir and leader", () => {
  for (const cls of ["stage-export-title", "stage-name-card", "choir-row", "leader-card"]) assert.equal(includeStageExportNode(element("DIV", [cls])), true);
  assert.equal(includeStageExportNode({ nodeType: 3 } as HTMLElement), true);
});
