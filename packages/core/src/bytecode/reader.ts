/**
 * Reads and validates .hwb bytes following the loader rules of
 * spec/bytecode.md §3. This is the reference for the C loader (Phase 2): it
 * checks everything once, so code that uses a valid module needs no more
 * bounds checks. Used by `hwc disasm` and by tests.
 */
import { crc32 } from "./crc32.js";
import {
  HEADER_SIZE, HWB_MAJOR, HWB_MINOR, type HwbModule, MAGIC, NONE, OP_NAMES, Op, TextOp, expectedArgc,
} from "./format.js";

export class HwbError extends Error {}

const REQUIRED = ["STRS", "VARS", "CHAR", "SCNE", "LINE", "TEXT", "CODE"] as const;

export function readHwb(bytes: Uint8Array): HwbModule {
  const fail = (msg: string): never => {
    throw new HwbError(msg);
  };
  if (bytes.length < HEADER_SIZE) fail("file is too small to be .hwb");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number) => {
    if (at < 0 || at + 4 > bytes.length) fail(`read past the end of the file at ${at}`);
    return view.getUint32(at, true);
  };

  if (!MAGIC.every((b, i) => bytes[i] === b)) fail("not a .hwb file (bad magic)");
  const major = view.getUint16(4, true);
  const minor = view.getUint16(6, true);
  if (major !== HWB_MAJOR || minor > HWB_MINOR) fail(`unsupported version ${major}.${minor} (this reader supports ${HWB_MAJOR}.${HWB_MINOR})`);
  if (u32(16) !== bytes.length) fail("file size in the header doesn't match");
  const stored = u32(20);
  // A real copy: `bytes` may be a Node Buffer, whose slice() is a view into a shared pool.
  const copy = new Uint8Array(bytes);
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint32(20, 0, true);
  if (crc32(copy) !== stored) fail("checksum mismatch (the file is damaged)");

  // Section table.
  const count = u32(12);
  if (HEADER_SIZE + count * 12 > bytes.length) fail("section table runs past the end of the file");
  const sections = new Map<string, { at: number; size: number }>();
  for (let i = 0; i < count; i++) {
    const e = HEADER_SIZE + i * 12;
    const tag = String.fromCharCode(...bytes.subarray(e, e + 4));
    const at = u32(e + 4);
    const size = u32(e + 8);
    if (at % 4 !== 0 || size % 4 !== 0 || at + size > bytes.length) fail(`section ${tag} is misaligned or out of bounds`);
    if (sections.has(tag)) fail(`section ${tag} appears twice`);
    sections.set(tag, { at, size });
  }
  for (const tag of REQUIRED) if (!sections.has(tag)) fail(`missing section ${tag}`);

  /** Word reader confined to one section. */
  const section = (tag: string) => {
    const s = sections.get(tag) as { at: number; size: number };
    let pos = s.at;
    const end = s.at + s.size;
    return {
      at: s.at,
      next(): number {
        if (pos + 4 > end) fail(`section ${tag} is truncated`);
        const v = view.getUint32(pos, true);
        pos += 4;
        return v;
      },
      take(n: number): number[] {
        if (n > (end - pos) / 4) fail(`section ${tag} is truncated`);
        return Array.from({ length: n }, () => this.next());
      },
    };
  };

  // STRS
  const strs = section("STRS");
  const sCount = strs.next();
  const offsets = strs.take(sCount);
  const sEnd = strs.at + (sections.get("STRS") as { size: number }).size;
  const dec = new TextDecoder("utf-8", { fatal: true });
  const strings = offsets.map((o) => {
    const start = strs.at + o;
    const nul = bytes.indexOf(0, start);
    if (start >= sEnd || nul < 0 || nul >= sEnd) fail("a string isn't NUL-terminated inside STRS");
    try {
      return dec.decode(bytes.subarray(start, nul));
    } catch {
      return fail("a string isn't valid UTF-8");
    }
  });
  if (strings[0] !== "") fail("string 0 must be empty");
  const str = (i: number, what: string) => (i < strings.length ? i : fail(`${what}: string index ${i} out of range`));

  // VARS
  const vs = section("VARS");
  const vCount = vs.next();
  const rawVars = Array.from({ length: vCount }, () => vs.take(5));
  const enumTotal = vs.next();
  const enumAll = vs.take(enumTotal).map((i) => str(i, "enum value"));
  const vars = rawVars.map(([name, ts, def, first, n]) => {
    const type = ((ts as number) & 0xff) as 0 | 1 | 2;
    const scope = (((ts as number) >>> 8) & 0xff) as 0 | 1;
    if (type > 2 || scope > 1) fail("invalid variable type or scope");
    if ((first as number) + (n as number) > enumAll.length) fail("variable enum out of range");
    return {
      name: str(name as number, "variable name"), type, scope, default: (def as number) | 0,
      enumValues: enumAll.slice(first as number, (first as number) + (n as number)),
    };
  });

  // CHAR
  const cs = section("CHAR");
  const chars = Array.from({ length: cs.next() }, () => {
    const [id, name, color] = cs.take(3) as [number, number, number];
    return { id: str(id, "character id"), name: str(name, "character name"), color };
  });

  // TEXT (needed to validate LINE)
  const ts = section("TEXT");
  const tCount = ts.next();
  const tOffsets = ts.take(tCount);
  const tWords = ts.take(ts.next());
  const texts = tOffsets.map((o) => readTextProgram(tWords, o, tCount, vars.length, strings.length, fail));

  // LINE
  const ls = section("LINE");
  const lines = Array.from({ length: ls.next() }, () => {
    const [lineId, speaker, text, flags] = ls.take(4) as [number, number, number, number];
    if (text >= texts.length) fail(`line text ${text} out of range`);
    return { lineId, speaker: str(speaker, "speaker"), text, flags };
  });

  // CODE
  const code = (() => {
    const c = section("CODE");
    return c.take(c.next()).map((w) => w | 0);
  })();
  const opStarts = new Set<number>();
  for (let pc = 0; pc < code.length; ) {
    const w = code[pc] as number;
    const op = w & 0xff;
    const argc = (w >>> 8) & 0xff;
    if (!OP_NAMES.has(op)) fail(`unknown opcode 0x${op.toString(16)} at pc ${pc}`);
    if (pc + 1 + argc > code.length) fail(`instruction at pc ${pc} runs past the end of CODE`);
    if (expectedArgc(op, code, pc + 1) !== argc) fail(`instruction at pc ${pc} has the wrong argument count`);
    opStarts.add(pc);
    pc += 1 + argc;
  }
  const target = (pc: number, what: string) => (opStarts.has(pc) ? pc : fail(`${what} target ${pc} isn't an instruction`));
  for (const pc of opStarts) {
    const op = (code[pc] as number) & 0xff;
    const a = (k: number) => code[pc + 1 + k] as number;
    if (op === Op.JMP || op === Op.JZ || op === Op.CALL) target(a(0), "jump");
    if (op === Op.SAY && a(0) >>> 0 >= lines.length) fail(`SAY at pc ${pc}: line out of range`);
    if (op === Op.LOAD || op === Op.STORE) if (a(0) >>> 0 >= vars.length) fail(`pc ${pc}: variable out of range`);
    if (op === Op.MENU) {
      if (a(0) >>> 0 !== NONE && a(0) >>> 0 >= lines.length) fail(`MENU at pc ${pc}: prompt out of range`);
      for (let i = 0; i < a(1); i++) {
        if (a(2 + 2 * i) >>> 0 >= lines.length) fail(`MENU at pc ${pc}: option line out of range`);
        target(a(3 + 2 * i), "menu option");
      }
    }
  }

  // SCNE
  const sc = section("SCNE");
  const scenes = Array.from({ length: sc.next() }, () => {
    const [name, entryPc, file] = sc.take(3) as [number, number, number];
    return { name: str(name, "scene name"), entryPc: target(entryPc, "scene entry"), file: str(file, "scene file") };
  });
  const entryScene = sc.next();
  if (entryScene !== NONE && entryScene >= scenes.length) fail("entry scene out of range");

  // DBUG (optional)
  let debug: HwbModule["debug"] = null;
  if (sections.has("DBUG")) {
    const ds = section("DBUG");
    debug = Array.from({ length: ds.next() }, () => {
      const [pc, file, line] = ds.take(3) as [number, number, number];
      return { pc, file: str(file, "debug file"), line };
    });
  }

  return { major, minor, strings, vars, chars, scenes, entryScene, lines, texts, code, debug };
}

function readTextProgram(
  words: readonly number[], start: number, textCount: number, varCount: number, strCount: number,
  fail: (msg: string) => never,
): number[] {
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
        if (next() >= textCount) fail("select case text out of range");
      }
    } else {
      fail(`unknown text op ${op}`);
    }
  }
}
