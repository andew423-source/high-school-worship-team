/** html-to-image applies this only to the exported clone, never the editor. */
export function includeStageExportNode(node: HTMLElement): boolean {
  if (node.nodeType !== 1) return true;
  return !node.classList.contains("drop-placeholder")
    && node.tagName !== "BUTTON"
    && node.getAttribute("data-export-empty") !== "true";
}

export function prepareStageExport(source: HTMLElement) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
  const copy = source.cloneNode(true) as HTMLElement;
  copy.classList.add("stage-export-copy");
  const noChoir = !!copy.querySelector('.choir-row[data-export-empty="true"]');
  copy.querySelectorAll('.drop-placeholder, button, [data-export-empty="true"]').forEach((item) => item.remove());
  copy.style.gridTemplateRows = noChoir ? "auto 1fr auto" : "auto 1fr 1fr auto";
  host.append(copy);
  document.body.append(host);
  return { node: copy, width: copy.scrollWidth, height: copy.scrollHeight, cleanup: () => host.remove() };
}
