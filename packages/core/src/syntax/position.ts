/** Offset ↔ line/column conversion for diagnostics and editors. Lines and columns are 1-based. */

export interface LineCol {
  line: number;
  col: number;
}

export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(readonly source: string) {
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === "\n" || (c === "\r" && source[i + 1] !== "\n")) this.starts.push(i + 1);
    }
  }

  /** 1-based line and column (in UTF-16 code units) of `offset`. */
  at(offset: number): LineCol {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - (this.starts[lo] as number) + 1 };
  }

  /** Text of a 1-based line, without its line break. */
  lineText(line: number): string {
    const start = this.starts[line - 1];
    if (start === undefined) return "";
    const next = this.starts[line] ?? this.source.length;
    return this.source.slice(start, next).replace(/\r?\n$|\r$/, "");
  }
}
