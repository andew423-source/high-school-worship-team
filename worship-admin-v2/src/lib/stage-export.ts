/** html-to-image applies this only to the exported clone, never the editor. */
export function includeStageExportNode(node: HTMLElement): boolean {
  if (node.nodeType !== 1) return true;
  return !node.classList.contains("drop-placeholder")
    && node.tagName !== "BUTTON"
    && node.getAttribute("data-export-empty") !== "true";
}
