/**
 * Writer-aware hints (FINALIZATION.md §8.2): what a careful human editor would
 * notice. All info, worded like a margin note, never blocking; a project can
 * mute any kind with himawari.json "quietHints": ["HW0352", …].
 *
 * - HW0350: a menu with only one option (the player has no choice).
 * - HW0351: two options in one menu with the same text.
 * - HW0352: the same line twice in a row (a paste slip).
 * - HW0353: doubled spaces in a line.
 * - HW0354: brackets or quotes that open and don't close in a line.
 * - HW0355: a character who never speaks.
 * - HW0356: two files whose names differ only in case.
 * - HW0357: a line that may not fit in the textbox.
 * - HW0358, HW0359: a background or CG far bigger than the game, or a different shape.
 */
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";
import type { Ast, Stmt } from "../syntax/ast.js";
import { plainText } from "../syntax/text.js";

const PAIRS: readonly [string, string][] = [
  ["(", ")"],
  ["「", "」"],
  ["『", "』"],
  ["（", "）"],
  ["“", "”"],
  ["【", "】"],
];

/** Hints inside one script: menus, repeated lines, spacing, brackets, and length. */
export function checkWriting(ast: Ast, fit: { charsPerLine: number; lines: number } | null, out: Diagnostic[]): void {
  let nvl = false;
  const walk = (body: readonly Stmt[]) => {
    let prev: { who: string; text: string } | null = null;
    for (const s of body) {
      if (s.kind === "Textbox") nvl = s.mode === "nvl" ? true : s.mode === "adv" ? false : nvl;
      if (s.kind === "Say" || s.kind === "Narration") {
        const text = plainText(s.text);
        const who = s.kind === "Say" ? s.speaker : "";
        if (prev && prev.who === who && prev.text === text && text.trim()) out.push(diagnostic("HW0352", s.span, {}, { help: "delete one of them, or change the second" }));
        prev = { who, text };
        if (/\S {2,}\S/.test(text)) out.push(diagnostic("HW0353", s.span));
        for (const [open, close] of PAIRS) {
          const o = text.split(open).length - 1;
          const c = text.split(close).length - 1;
          if (o !== c) {
            out.push(diagnostic("HW0354", s.span, { open, close }));
            break;
          }
        }
        // Novel mode shows a whole page, so length isn't a problem there.
        if (fit && !nvl) {
          const lines = Math.ceil(visualWidth(text) / fit.charsPerLine);
          if (lines > fit.lines) out.push(diagnostic("HW0357", s.span, { lines: String(lines), max: String(fit.lines) }, { help: "split it into two lines, or check it in the preview" }));
        }
      } else prev = null;
      if (s.kind === "Menu") {
        if (s.options.length === 1 && !s.options[0]!.cond && !s.options[0]!.once) out.push(diagnostic("HW0350", s.span, {}, { help: "add another option, or turn it into a line" }));
        const seen = new Set<string>();
        for (const o of s.options) {
          const t = plainText(o.text).trim();
          if (seen.has(t)) out.push(diagnostic("HW0351", o.span, { text: t }));
          seen.add(t);
          walk(o.body);
        }
      }
      if (s.kind === "If") for (const c of s.clauses) walk(c.body);
    }
  };
  for (const sc of ast.scenes) {
    nvl = false;
    walk(sc.body);
  }
}

/** Width in "Latin character" units: CJK and full-width characters count about double. */
function visualWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 1.9 : 1;
  return w;
}

/**
 * How much text fits in the textbox, roughly: the text area is about 84 % of the screen's
 * width, Latin letters are about 0.55 em wide, and the textbox shows 3 lines (adv).
 */
export function textboxFit(resolution: readonly [number, number], textSize: number): { charsPerLine: number; lines: number } {
  const scale = resolution[1] / 1080;
  const width = resolution[0] * 0.84;
  const charsPerLine = Math.max(10, Math.floor(width / (textSize * scale * 0.55)));
  return { charsPerLine, lines: 3 };
}

/** HW0355: characters declared but never speaking (reported at the character file). */
export function checkSilentCharacters(characters: ReadonlyMap<string, { file: string }>, speakers: ReadonlySet<string>, report: (file: string) => Diagnostic[]): void {
  for (const [id, c] of characters) if (!speakers.has(id)) report(c.file).push(diagnostic("HW0355", { start: 0, end: 0 }, { name: id }));
}

/** HW0356: project files (and assets) whose names differ only in letter case. */
export function caseClashes(paths: readonly string[]): [string, string][] {
  const byLower = new Map<string, string>();
  const out: [string, string][] = [];
  for (const p of paths) {
    const k = p.toLowerCase();
    const other = byLower.get(k);
    if (other !== undefined && other !== p) out.push([other, p]);
    else byLower.set(k, p);
  }
  return out;
}

/** The hint codes a project muted (himawari.json "quietHints"). */
export function quietHints(manifestText: string | undefined): ReadonlySet<string> {
  if (!manifestText) return new Set();
  try {
    const q = (JSON.parse(manifestText) as { quietHints?: unknown }).quietHints;
    return new Set(Array.isArray(q) ? q.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * A background or CG that is far bigger than the game (HW0358: a bigger, slower
 * game for nothing) or a different shape (HW0359: its edges are cut off, since
 * the runtime fills the screen with it). Null when it's fine.
 */
export function imageHint(
  name: string,
  size: { width: number; height: number },
  resolution: readonly [number, number],
): { code: "HW0358" | "HW0359"; params: Record<string, string>; help: string } | null {
  const [gw, gh] = resolution;
  const params = { name, w: String(size.width), h: String(size.height), gw: String(gw), gh: String(gh) };
  if (size.width > gw * 2 || size.height > gh * 2) {
    return { code: "HW0358", params, help: `resize it to ${gw} × ${gh} in any image editor; it will look the same` };
  }
  const shape = size.width / size.height / (gw / gh);
  if (shape < 0.9 || shape > 1.1) return { code: "HW0359", params, help: `crop it to the game's shape (${gw} × ${gh}) to choose what shows` };
  return null;
}
