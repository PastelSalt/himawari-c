/**
 * Continuity (plan §18 Phase 7): things a reader would notice that aren't errors.
 * Static and cheap, so they run with every check; the AI's continuity pass
 * (notes, rfcs/0011) covers what needs judgment.
 *
 * - HW0340: a character speaks after being hidden earlier in the same scene.
 * - HW0341: a variable is set but never read (a flag nothing checks).
 * - HW0342: a variable is used in a condition but never set (so the condition never changes).
 */
import { type Diagnostic, diagnostic } from "../syntax/diagnostics.js";
import { type Ast, type Ref, type Stmt, endsFlow } from "../syntax/ast.js";
import type { Character } from "./character.js";
import type { Manifest } from "./manifest.js";

/** HW0340 for one file's (macro-expanded) scenes. Branches are followed; after one, only characters hidden in every branch stay hidden. */
export function checkSpeakers(ast: Ast, characters: ReadonlyMap<string, Character>, out: Diagnostic[]): void {
  const visible = (c: string) => characters.get(c)?.hasSprite === true;
  // After branches: hidden only if hidden at the end of every branch that carries on (not ones that jump away).
  const join = (bodies: readonly Stmt[][], h: Set<string>, passThrough: boolean): Set<string> => {
    const ends = bodies.map((b) => ({ end: walk(b, h), on: !endsFlow(b) })).filter((x) => x.on).map((x) => x.end);
    if (passThrough) ends.push(h);
    if (ends.length === 0) return h;
    return new Set([...ends[0]!].filter((c) => ends.every((e) => e.has(c))));
  };
  const walk = (body: readonly Stmt[], hidden: Set<string>): Set<string> => {
    let h = new Set(hidden);
    for (const s of body) {
      switch (s.kind) {
        case "Hide":
          if (visible(s.char)) h.add(s.char);
          break;
        case "Show":
          h.delete(s.char);
          break;
        case "Say": {
          // Attributes before the text show the speaker like `show` does.
          if (s.attrs.add.length > 0 || s.attrs.remove.length > 0) h.delete(s.speaker);
          else if (h.has(s.speaker)) out.push(diagnostic("HW0340", s.span, { name: characters.get(s.speaker)?.displayName ?? s.speaker }, { help: `add "show ${s.speaker}" before the line, or remove the earlier "hide"` }));
          break;
        }
        case "Menu":
          h = join(s.options.map((o) => o.body), h, false);
          break;
        case "If":
          // Without an else, the story can also go straight past.
          h = join(
            s.clauses.map((c) => c.body),
            h,
            s.clauses.every((c) => c.cond !== null),
          );
          break;
        default:
          break;
      }
    }
    return h;
  };
  for (const sc of ast.scenes) walk(sc.body, new Set());
}

/** HW0341 and HW0342, reported in himawari.json at each variable. `refs`: every variable reference in the project. */
export function checkVariableUse(manifest: Manifest, manifestText: string, refs: Iterable<Ref>, out: Diagnostic[]): void {
  const reads = new Map<string, number>();
  const logic = new Map<string, number>();
  const writes = new Map<string, number>();
  for (const r of refs) {
    if (r.kind !== "variable") continue;
    const m = r.assign ? writes : reads;
    m.set(r.name, (m.get(r.name) ?? 0) + 1);
    if (!r.assign && !r.inText) logic.set(r.name, (logic.get(r.name) ?? 0) + 1);
  }
  const block = manifestText.indexOf('"variables"');
  for (const [name, v] of Object.entries(manifest.variables)) {
    const r = reads.get(name) ?? 0;
    const w = writes.get(name) ?? 0;
    if (r === w && r === 0) continue; // unused altogether: list_variables and the Variables page say so
    const i = manifestText.indexOf(`"${name}"`, Math.max(0, block));
    const span = i < 0 ? { start: 0, end: 0 } : { start: i, end: i + name.length + 2 };
    // Global counters (endings seen, unlocks) are often kept for later or for the player's own records.
    if (r === 0 && v.scope !== "global") out.push(diagnostic("HW0341", span, { name, count: String(w) }));
    // Only a condition that can never change matters: a name shown in text and never set is just a constant.
    else if (w === 0 && (logic.get(name) ?? 0) > 0) out.push(diagnostic("HW0342", span, { name, value: JSON.stringify(v.default) }));
  }
}
