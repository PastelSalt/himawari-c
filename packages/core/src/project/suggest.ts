/** "Did you mean …?" suggestions (plan P6). */

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] as number;
      prev[j] = Math.min(up + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] as number;
}

/** The closest candidate within a small edit distance, or undefined. */
export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  const limit = Math.max(1, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = c.toLowerCase() === name.toLowerCase() ? 0 : editDistance(name, c);
    if (d < bestDist || (d === bestDist && best !== undefined && c < best)) {
      best = c;
      bestDist = d;
    }
  }
  return bestDist <= limit ? best : undefined;
}

/** "a, b, c" (with "and N more" past `max`), for diagnostic notes. */
export function listNames(names: Iterable<string>, max = 8): string {
  const all = [...names].sort();
  if (all.length === 0) return "(none)";
  return all.length > max ? `${all.slice(0, max).join(", ")}, and ${all.length - max} more` : all.join(", ");
}
