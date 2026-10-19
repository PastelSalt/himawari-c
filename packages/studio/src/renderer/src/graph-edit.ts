/**
 * Editing the story on the story graph (plan §11.3, Phase 7): drag from one
 * scene to another to make it lead there, and add scenes. Pure text edits;
 * Studio gives new lines their IDs when it saves.
 */
import { parseAst } from "@himawari/core";
import { insertAfter, lineAt, lineBodyWithoutTag } from "./screenplay-edit";

export type LinkKind = { kind: "jump" } | { kind: "choice"; label: string; otherLabel: string };

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * `from` (a scene in this file's text) leads to `to`:
 * - jump: its final jump/end/return becomes `jump to` (or one is added).
 * - choice: an option `label` → `jump to` joins the menu that ends the scene; a final
 *   jump/end becomes a menu of that option and `otherLabel` (which keeps the old way on);
 *   otherwise a one-option menu is added at the end.
 * Null when the scene isn't in this file.
 */
export function linkScenes(text: string, from: string, to: string, how: LinkKind): string | null {
  const scene = parseAst(text, "").ast.scenes.find((s) => s.id === from);
  if (!scene) return null;
  const last = scene.body[scene.body.length - 1];
  const indent = last ? lineAt(text, last.span.start).indent : "    ";
  const flowEnd = last && (last.kind === "Jump" || last.kind === "End" || last.kind === "Return");
  // Statement spans include their line break: "after" means after the statement's own last line.
  const after = (end: number) => (end > 0 && text[end - 1] === "\n" ? end - 1 : end);
  const replaceLine = (offset: number, lines: string[]) => {
    const l = lineAt(text, offset);
    return text.slice(0, l.start) + lines.map((x) => l.indent + x).join("\n") + text.slice(l.end);
  };
  if (how.kind === "jump") {
    if (last && flowEnd) return replaceLine(last.span.start, [`jump ${to}`]);
    return insertAfter(text, after(last ? last.span.end : scene.span.end), indent, [`jump ${to}`]).text;
  }
  if (last?.kind === "Menu" && last.options.length > 0) {
    const o = last.options[last.options.length - 1]!;
    const end = o.body[o.body.length - 1]?.span.end ?? o.span.start;
    return insertAfter(text, after(end), lineAt(text, o.span.start).indent, [`${quote(how.label)}:`, `    jump ${to}`]).text;
  }
  if (last && flowEnd) {
    const old = lineBodyWithoutTag(text, last.span.start).trim();
    return replaceLine(last.span.start, ["menu:", `    ${quote(how.label)}:`, `        jump ${to}`, `    ${quote(how.otherLabel)}:`, `        ${old}`]);
  }
  return insertAfter(text, after(last ? last.span.end : scene.span.end), indent, ["menu:", `    ${quote(how.label)}:`, `        jump ${to}`]).text;
}

/** A new scene at the end of the file: one placeholder line, then the end of the story (link it on the graph). */
export function addScene(text: string, name: string, placeholder: string): string {
  return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}\nscene ${name}:\n    ${quote(placeholder)}\n    end\n`;
}
