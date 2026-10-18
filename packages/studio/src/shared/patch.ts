/**
 * Line diffs: shown for AI proposals (P12), and used for selective undo (P9),
 * which reverses one old change on top of later edits when the lines it
 * touched are still there.
 */

export type DiffOp = { type: "same" | "del" | "add"; text: string };

const splitLines = (s: string) => s.split("\n");

/** A line diff of a → b (common prefix and suffix trimmed, LCS in between). */
export function diffLines(a: string, b: string): DiffOp[] {
  const x = splitLines(a);
  const y = splitLines(b);
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const xs = x.slice(pre, x.length - suf);
  const ys = y.slice(pre, y.length - suf);
  const ops: DiffOp[] = x.slice(0, pre).map((text) => ({ type: "same", text }));
  if (xs.length * ys.length > 4_000_000) {
    // Too big to align line by line: show it as a replacement.
    for (const text of xs) ops.push({ type: "del", text });
    for (const text of ys) ops.push({ type: "add", text });
  } else {
    const n = xs.length;
    const m = ys.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i]![j] = xs[i] === ys[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (xs[i] === ys[j]) {
        ops.push({ type: "same", text: xs[i]! });
        i++;
        j++;
      } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
        ops.push({ type: "del", text: xs[i++]! });
      } else {
        ops.push({ type: "add", text: ys[j++]! });
      }
    }
    while (i < n) ops.push({ type: "del", text: xs[i++]! });
    while (j < m) ops.push({ type: "add", text: ys[j++]! });
  }
  for (const text of x.slice(x.length - suf)) ops.push({ type: "same", text });
  return ops;
}

interface Hunk {
  before: string[];
  del: string[];
  add: string[];
  after: string[];
}

function hunks(ops: DiffOp[], context = 2): Hunk[] {
  const out: Hunk[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.type === "same") {
      i++;
      continue;
    }
    const start = i;
    const del: string[] = [];
    const add: string[] = [];
    while (i < ops.length && ops[i]!.type !== "same") {
      const op = ops[i++]!;
      (op.type === "del" ? del : add).push(op.text);
    }
    const before: string[] = [];
    for (let k = start - 1; k >= 0 && before.length < context && ops[k]!.type === "same"; k--) before.unshift(ops[k]!.text);
    const after: string[] = [];
    for (let k = i; k < ops.length && after.length < context && ops[k]!.type === "same"; k++) after.push(ops[k]!.text);
    out.push({ before, del, add, after });
  }
  return out;
}

function findUnique(lines: string[], seq: string[]): number {
  let found = -1;
  for (let i = 0; i + seq.length <= lines.length; i++) {
    let ok = true;
    for (let k = 0; k < seq.length; k++) {
      if (lines[i + k] !== seq[k]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      if (found >= 0) return -2;
      found = i;
    }
  }
  return found;
}

/**
 * Applies the change base → target to `current` (which has other edits since
 * base). Each changed block must still be found, with its context, exactly
 * once; otherwise null (the user is told it can't be undone automatically).
 */
export function applyPatch(base: string, target: string, current: string): string | null {
  let lines = splitLines(current);
  for (const h of hunks(diffLines(base, target)).reverse()) {
    const seq = [...h.before, ...h.del, ...h.after];
    if (seq.length === 0) return null;
    const at = findUnique(lines, seq);
    if (at < 0) return null;
    lines = [...lines.slice(0, at + h.before.length), ...h.add, ...lines.slice(at + h.before.length + h.del.length)];
  }
  return lines.join("\n");
}
