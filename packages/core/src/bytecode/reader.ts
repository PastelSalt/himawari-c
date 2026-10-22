/**
 * Reads and validates .hwb bytes following the loader rules of
 * spec/bytecode.md §3. This is the reference for the C loader (Phase 2): it
 * checks everything once, so code that uses a valid module needs no more
 * bounds checks. Used by `hwc disasm` and by tests.
 */
import { crc32 } from "./crc32.js";
import {
  type ExtensionEntry, HEADER_SIZE, HWB_MAJOR, HWB_MINOR, type HwbModule, type LocaleEntry, MAGIC, NONE, OPS_1_1, OP_NAMES, Op, type SpriteEntry,
  TEXTBOX_MODES, TextOp, type ThemeEntry, XPARAM_BOOL, XPARAM_INT, XPARAM_TEXT, XPARAM_TYPES, expectedArgc,
} from "./format.js";

export class HwbError extends Error {}

const REQUIRED = ["META", "STRS", "VARS", "CHAR", "SCNE", "LINE", "TEXT", "CODE"] as const;

const fail = (msg: string): never => {
  throw new HwbError(msg);
};

export function readHwb(bytes: Uint8Array): HwbModule {
  // The sections are read in the order the loader rules check them, so a damaged file fails
  // with the same message here and in the C loader.
  const r = new HwbReader(bytes);
  const strings = r.readStrings();
  const meta = r.readMeta();
  const vars = r.readVars();
  const chars = r.readChars();
  const texts = r.readTexts(vars.length); // needed to validate LINE
  const lines = r.readLines(texts.length);
  const extensions = r.readExtensions(); // needed to validate XCALL
  const { code, opStarts } = r.readCode();
  checkOperands(code, opStarts, { strings, lines: lines.length, vars: vars.length, extensions });
  const { scenes, entryScene } = r.readScenes(opStarts);
  const debug = r.readDebug();
  const locales = r.readLocales(lines.length, chars.length, texts.length);
  const sprites = r.readSprites(chars.length);
  const theme = r.readTheme();
  return { major: r.major, minor: r.minor, meta, strings, vars, chars, scenes, entryScene, lines, texts, code, debug, locales, sprites, extensions, theme };
}

/** A word reader confined to one section. */
interface SectionWords {
  at: number;
  size: number;
  next(): number;
  left(): number;
  take(n: number): number[];
}

class HwbReader {
  readonly major: number;
  readonly minor: number;
  private readonly view: DataView;
  private readonly sections = new Map<string, { at: number; size: number }>();
  private strings: string[] = [];

  constructor(private readonly bytes: Uint8Array) {
    if (bytes.length < HEADER_SIZE) fail("file is too small to be .hwb");
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!MAGIC.every((b, i) => bytes[i] === b)) fail("not a .hwb file (bad magic)");
    this.major = this.view.getUint16(4, true);
    this.minor = this.view.getUint16(6, true);
    if (this.major !== HWB_MAJOR || this.minor > HWB_MINOR) {
      fail(`unsupported version ${this.major}.${this.minor} (this reader supports ${HWB_MAJOR}.${HWB_MINOR})`);
    }
    if (this.u32(16) !== bytes.length) fail("file size in the header doesn't match");
    const stored = this.u32(20);
    // A real copy: `bytes` may be a Node Buffer, whose slice() is a view into a shared pool.
    const copy = new Uint8Array(bytes);
    new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint32(20, 0, true);
    if (crc32(copy) !== stored) fail("checksum mismatch (the file is damaged)");
    this.readSectionTable();
  }

  private u32(at: number): number {
    if (at < 0 || at + 4 > this.bytes.length) fail(`read past the end of the file at ${at}`);
    return this.view.getUint32(at, true);
  }

  private readSectionTable(): void {
    const count = this.u32(12);
    if (HEADER_SIZE + count * 12 > this.bytes.length) fail("section table runs past the end of the file");
    for (let i = 0; i < count; i++) {
      const e = HEADER_SIZE + i * 12;
      const tag = String.fromCharCode(...this.bytes.subarray(e, e + 4));
      const at = this.u32(e + 4);
      const size = this.u32(e + 8);
      if (at % 4 !== 0 || size % 4 !== 0 || at + size > this.bytes.length) fail(`section ${tag} is misaligned or out of bounds`);
      if (this.sections.has(tag)) fail(`section ${tag} appears twice`);
      this.sections.set(tag, { at, size });
    }
    for (const tag of REQUIRED) if (!this.sections.has(tag)) fail(`missing section ${tag}`);
    // A 1.0 file knows nothing of 1.1 sections: like any unknown tag, they're skipped (§1.2).
    if (this.minor < 1) for (const tag of ["XTNS", "THEM"]) this.sections.delete(tag);
  }

  private has(tag: string): boolean {
    return this.sections.has(tag);
  }

  private section(tag: string): SectionWords {
    const { view } = this;
    const { at, size } = this.sections.get(tag) as { at: number; size: number };
    let pos = at;
    const end = at + size;
    return {
      at,
      size,
      next(): number {
        if (pos + 4 > end) fail(`section ${tag} is truncated`);
        const v = view.getUint32(pos, true);
        pos += 4;
        return v;
      },
      left(): number {
        return Math.floor((end - pos) / 4);
      },
      take(n: number): number[] {
        if (n > (end - pos) / 4) fail(`section ${tag} is truncated`);
        return Array.from({ length: n }, () => this.next());
      },
    };
  }

  /** A string index, checked against STRS. */
  private str(i: number, what: string): number {
    return i < this.strings.length ? i : fail(`${what}: string index ${i} out of range`);
  }

  readStrings(): string[] {
    const strs = this.section("STRS");
    const offsets = strs.take(strs.next());
    const sEnd = strs.at + strs.size;
    const dec = new TextDecoder("utf-8", { fatal: true });
    this.strings = offsets.map((o) => {
      const start = strs.at + o;
      const nul = this.bytes.indexOf(0, start);
      if (start >= sEnd || nul < 0 || nul >= sEnd) fail("a string isn't NUL-terminated inside STRS");
      try {
        return dec.decode(this.bytes.subarray(start, nul));
      } catch {
        return fail("a string isn't valid UTF-8");
      }
    });
    if (this.strings[0] !== "") fail("string 0 must be empty");
    return this.strings;
  }

  readMeta(): HwbModule["meta"] {
    const ms = this.section("META");
    const [title, id, width, height, sourceLanguage] = ms.take(5) as [number, number, number, number, number];
    const meta = {
      title: this.str(title, "title"), id: this.str(id, "game id"), width, height, sourceLanguage: this.str(sourceLanguage, "source language"),
      languages: ms.take(ms.next()).map((l) => this.str(l, "language")),
      positions: Array.from({ length: ms.next() }, () => {
        const [name, x, y] = ms.take(3) as [number, number, number];
        return { name: this.str(name, "position name"), x: x | 0, y: y | 0 };
      }),
      // Optional trailing word: how the game credits Himawari. Anything after it is for later readers.
      ...(ms.left() > 0 ? { credit: ms.next() } : {}),
    };
    if (width === 0 || height === 0 || width > 16384 || height > 16384) fail("invalid resolution");
    if (meta.languages[0] !== meta.sourceLanguage) fail("the first language must be the source language");
    return meta;
  }

  readVars(): HwbModule["vars"] {
    const vs = this.section("VARS");
    const rawVars = Array.from({ length: vs.next() }, () => vs.take(5));
    const enumAll = vs.take(vs.next()).map((i) => this.str(i, "enum value"));
    return rawVars.map(([name, ts, def, first, n]) => {
      const type = ((ts as number) & 0xff) as 0 | 1 | 2;
      const scope = (((ts as number) >>> 8) & 0xff) as 0 | 1;
      if (type > 2 || scope > 1) fail("invalid variable type or scope");
      if ((first as number) + (n as number) > enumAll.length) fail("variable enum out of range");
      return {
        name: this.str(name as number, "variable name"), type, scope, default: (def as number) | 0,
        enumValues: enumAll.slice(first as number, (first as number) + (n as number)),
      };
    });
  }

  readChars(): HwbModule["chars"] {
    const cs = this.section("CHAR");
    return Array.from({ length: cs.next() }, () => {
      const [id, name, color] = cs.take(3) as [number, number, number];
      return { id: this.str(id, "character id"), name: this.str(name, "character name"), color };
    });
  }

  readTexts(varCount: number): number[][] {
    const ts = this.section("TEXT");
    const tOffsets = ts.take(ts.next());
    const tWords = ts.take(ts.next());
    return tOffsets.map((o, self) => readTextProgram(tWords, o, self, varCount, this.strings.length));
  }

  readLines(textCount: number): HwbModule["lines"] {
    const ls = this.section("LINE");
    return Array.from({ length: ls.next() }, () => {
      const [lineId, speaker, text, flags] = ls.take(4) as [number, number, number, number];
      if (text >= textCount) fail(`line text ${text} out of range`);
      return { lineId, speaker: this.str(speaker, "speaker"), text, flags };
    });
  }

  /** XTNS (optional, 1.1). */
  readExtensions(): ExtensionEntry[] {
    const extensions: ExtensionEntry[] = [];
    if (!this.has("XTNS")) return extensions;
    const xs = this.section("XTNS");
    const entries = Array.from({ length: xs.next() }, () => xs.take(4) as [number, number, number, number]);
    const params = Array.from({ length: xs.next() }, () => xs.take(2) as [number, number]);
    for (const [name, flags, first, count] of entries) {
      if (first + count > params.length) fail("XTNS parameters out of range");
      extensions.push({
        name: this.str(name, "XTNS name"),
        flags,
        params: params.slice(first, first + count).map(([pn, type]) => {
          if (type >= XPARAM_TYPES.length) fail("XTNS parameter type out of range");
          return { name: this.str(pn, "XTNS parameter"), type };
        }),
      });
    }
    return extensions;
  }

  /** CODE, and where each instruction starts (every opcode and argument count checked). */
  readCode(): { code: number[]; opStarts: Set<number> } {
    const c = this.section("CODE");
    const code = c.take(c.next()).map((w) => w | 0);
    const opStarts = new Set<number>();
    for (let pc = 0; pc < code.length; ) {
      const w = code[pc] as number;
      const op = w & 0xff;
      const argc = (w >>> 8) & 0xff;
      if (!OP_NAMES.has(op) || (this.minor < 1 && OPS_1_1.has(op))) fail(`unknown opcode 0x${op.toString(16)} at pc ${pc}`);
      if (pc + 1 + argc > code.length) fail(`instruction at pc ${pc} runs past the end of CODE`);
      if (expectedArgc(op, code, pc + 1) !== argc) fail(`instruction at pc ${pc} has the wrong argument count`);
      opStarts.add(pc);
      pc += 1 + argc;
    }
    return { code, opStarts };
  }

  readScenes(opStarts: ReadonlySet<number>): Pick<HwbModule, "scenes" | "entryScene"> {
    const sc = this.section("SCNE");
    const scenes = Array.from({ length: sc.next() }, () => {
      const [name, entryPc, file] = sc.take(3) as [number, number, number];
      return { name: this.str(name, "scene name"), entryPc: jumpTarget(opStarts, entryPc, "scene entry"), file: this.str(file, "scene file") };
    });
    const entryScene = sc.next();
    if (entryScene !== NONE && entryScene >= scenes.length) fail("entry scene out of range");
    return { scenes, entryScene };
  }

  /** DBUG (optional). */
  readDebug(): HwbModule["debug"] {
    if (!this.has("DBUG")) return null;
    const ds = this.section("DBUG");
    return Array.from({ length: ds.next() }, () => {
      const [pc, file, line] = ds.take(3) as [number, number, number];
      return { pc, file: this.str(file, "debug file"), line };
    });
  }

  /** LOCL (optional). */
  readLocales(lineCount: number, charCount: number, textCount: number): LocaleEntry[] {
    const locales: LocaleEntry[] = [];
    if (!this.has("LOCL")) return locales;
    const lc = this.section("LOCL");
    const entries = Array.from({ length: lc.next() }, () => lc.take(2) as [number, number]);
    const table = lc.take(lc.next());
    const per = lineCount + charCount;
    for (const [language, offset] of entries) {
      if (offset + per > table.length) fail("LOCL table out of range");
      const lineTexts = table.slice(offset, offset + lineCount);
      for (const t of lineTexts) if (t !== NONE && t >= textCount) fail("LOCL text out of range");
      locales.push({
        language: this.str(language, "LOCL language"),
        lineTexts,
        charNames: table.slice(offset + lineCount, offset + per).map((n) => this.str(n, "LOCL character name")),
      });
    }
    return locales;
  }

  /** SPRT (optional). */
  readSprites(charCount: number): SpriteEntry[] {
    const sprites: SpriteEntry[] = [];
    if (!this.has("SPRT")) return sprites;
    const sp = this.section("SPRT");
    const entries = Array.from({ length: sp.next() }, () => sp.take(11));
    const groups = Array.from({ length: sp.next() }, () => sp.take(6));
    const presets = Array.from({ length: sp.next() }, () => sp.take(3));
    const rules = Array.from({ length: sp.next() }, () => sp.take(4));
    const pool = sp.take(sp.next());
    const range = <T>(xs: readonly T[], first: number, count: number, what: string): T[] =>
      first + count <= xs.length ? xs.slice(first, first + count) : fail(`SPRT ${what} out of range`);
    const strs = (first: number, count: number) => range(pool, first, count, "list").map((i) => this.str(i, "SPRT string"));
    for (const e of entries) {
      const [char, root, anchorX, anchorY, scale, gf, gc, pf, pc, rf, rc] = e as [number, number, number, number, number, number, number, number, number, number, number];
      if (char >= charCount) fail("SPRT character out of range");
      if (scale === 0 || scale > 1000000) fail("SPRT scale out of range");
      const gs = range(groups, gf, gc, "groups").map(([name, flags, df, dc, af, ac]) => ({
        name: this.str(name as number, "SPRT group"), flags: flags as number, defaults: strs(df as number, dc as number), attrs: strs(af as number, ac as number),
      }));
      sprites.push({
        char, root: this.str(root, "SPRT root"), anchorX: anchorX | 0, anchorY: anchorY | 0, scale,
        groups: gs,
        presets: range(presets, pf, pc, "presets").map(([name, lf, lc]) => {
          const flat = range(pool, lf as number, 2 * (lc as number), "preset layers");
          const layers: [number, number][] = [];
          for (let i = 0; i < flat.length; i += 2) {
            if ((flat[i] as number) >= gs.length) fail("SPRT preset group out of range");
            layers.push([flat[i] as number, this.str(flat[i + 1] as number, "SPRT preset attribute")]);
          }
          return { name: this.str(name as number, "SPRT preset"), layers };
        }),
        rules: range(rules, rf, rc, "rules").map(([hide, show, wf, wc]) => ({
          hide: this.str(hide as number, "SPRT rule"), show: this.str(show as number, "SPRT rule"), when: strs(wf as number, wc as number),
        })),
      });
    }
    return sprites;
  }

  /** THEM (optional, 1.1). */
  readTheme(): ThemeEntry[] {
    const theme: ThemeEntry[] = [];
    if (!this.has("THEM")) return theme;
    const th = this.section("THEM");
    let prev = "";
    for (let i = 0, n = th.next(); i < n; i++) {
      const [key, type, value] = th.take(3) as [number, number, number];
      this.str(key, "THEM key");
      if (type > 2) fail("THEM entry type out of range");
      if (type === 2) this.str(value, "THEM value");
      const k = this.strings[key] as string;
      if (i > 0 && k <= prev) fail("THEM keys must be sorted and unique");
      prev = k;
      theme.push({ key, type: type as 0 | 1 | 2, value: type === 0 ? value | 0 : value });
    }
    return theme;
  }
}

function jumpTarget(opStarts: ReadonlySet<number>, pc: number, what: string): number {
  return opStarts.has(pc) ? pc : fail(`${what} target ${pc} isn't an instruction`);
}

/** What instruction operands are checked against. */
interface OperandLimits {
  strings: readonly string[];
  lines: number;
  vars: number;
  extensions: readonly ExtensionEntry[];
}

/** Every operand of every instruction: string, line, and variable indexes, jump targets, and enums. */
function checkOperands(code: readonly number[], opStarts: ReadonlySet<number>, limits: OperandLimits): void {
  for (const pc of opStarts) {
    const op = (code[pc] as number) & 0xff;
    const a = (k: number) => code[pc + 1 + k] as number;
    const s = (k: number) => {
      if (a(k) >>> 0 >= limits.strings.length) fail(`pc ${pc}: string index out of range`);
    };
    const trans = (k: number) => {
      s(k);
      if (a(k) !== 0 && limits.strings[a(k)] === "rule") s(k + 1);
    };
    const below = (k: number, n: number, message: string) => {
      if (a(k) >>> 0 >= n) fail(message);
    };
    switch (op) {
      case Op.SHOW:
        s(0);
        s(1);
        trans(2);
        for (let i = 0; i < a(5) + a(6); i++) s(7 + i);
        break;
      case Op.HIDE:
      case Op.BG:
      case Op.CG:
        s(0);
        trans(1);
        break;
      case Op.MOVE:
        s(0);
        s(1);
        trans(2);
        break;
      case Op.AUDIO:
        s(1);
        below(0, 4, `pc ${pc}: invalid audio channel`);
        break;
      case Op.STOP:
        below(0, 4, `pc ${pc}: invalid audio channel`);
        break;
      case Op.EFFECT:
        below(0, 2, `pc ${pc}: invalid effect`);
        break;
      case Op.JMP:
      case Op.JZ:
      case Op.CALL:
        jumpTarget(opStarts, a(0), "jump");
        break;
      case Op.SAY:
        below(0, limits.lines, `SAY at pc ${pc}: line out of range`);
        break;
      case Op.LOAD:
      case Op.STORE:
        below(0, limits.vars, `pc ${pc}: variable out of range`);
        break;
      case Op.TEXTBOX:
        below(0, TEXTBOX_MODES.length, `pc ${pc}: invalid textbox mode`);
        break;
      case Op.XCALL:
        checkXcall(pc, code, limits, s);
        break;
      case Op.MENU:
        if (a(0) >>> 0 !== NONE) below(0, limits.lines, `MENU at pc ${pc}: prompt out of range`);
        for (let i = 0; i < a(1); i++) {
          below(2 + 2 * i, limits.lines, `MENU at pc ${pc}: option line out of range`);
          jumpTarget(opStarts, a(3 + 2 * i), "menu option");
        }
        break;
    }
  }
}

/** XCALL's values against the extension's declared parameters (XTNS). */
function checkXcall(pc: number, code: readonly number[], limits: OperandLimits, s: (k: number) => void): void {
  const a = (k: number) => code[pc + 1 + k] as number;
  const ext = limits.extensions[a(0) >>> 0];
  if (!ext) return fail(`XCALL at pc ${pc}: extension out of range`);
  if (a(1) !== ext.params.length) return fail(`XCALL at pc ${pc}: wrong number of values`);
  ext.params.forEach((p, i) => {
    const v = a(2 + i) >>> 0;
    if (p.type === XPARAM_TEXT) {
      if (v !== NONE && v >= limits.lines) fail(`XCALL at pc ${pc}: text line out of range`);
    } else if (p.type === XPARAM_BOOL) {
      if (v > 1) fail(`XCALL at pc ${pc}: invalid bool`);
    } else if (p.type !== XPARAM_INT) {
      s(2 + i);
    }
  });
}

function readTextProgram(words: readonly number[], start: number, self: number, varCount: number, strCount: number): number[] {
  const out: number[] = [];
  let i = start;
  const next = () => {
    if (i >= words.length) fail("a text program runs past the end of TEXT");
    const w = words[i++] as number;
    out.push(w);
    return w;
  };
  const strArg = () => {
    if (next() >= strCount) fail("text string index out of range");
  };
  for (;;) {
    const op = next();
    if (op === TextOp.END) return out;
    if (op === TextOp.RUN) strArg();
    else if (op === TextOp.VAR) {
      if (next() >= varCount) fail("text variable out of range");
    } else if (op === TextOp.OPEN || op === TextOp.MARK) {
      strArg();
      strArg();
    } else if (op === TextOp.CLOSE) {
      // no operands
    } else if (op === TextOp.SELECT) {
      if (next() >= varCount) fail("select variable out of range");
      const n = next();
      for (let k = 0; k < n; k++) {
        strArg();
        // Case texts are compiled before the text that uses them, so evaluation can't loop.
        if (next() >= self) fail("select case text out of range");
      }
    } else {
      fail(`unknown text op ${op}`);
    }
  }
}
