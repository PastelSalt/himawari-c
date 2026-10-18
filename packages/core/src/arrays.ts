/**
 * Appends `src` to `dst` without spreading it into arguments: `dst.push(...src)`
 * overflows the call stack once `src` has around 100 000 items, which a big
 * project's code, text, and line tables reach.
 */
export function pushAll<T>(dst: T[], src: readonly T[]): T[] {
  for (let i = 0; i < src.length; i++) dst.push(src[i] as T);
  return dst;
}
