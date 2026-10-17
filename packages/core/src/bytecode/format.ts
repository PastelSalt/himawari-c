/**
 * The .hwb format (spec/bytecode.md v1.0): constants and the in-memory module
 * that the compiler builds, the writer serializes, and the reader validates.
 */

export const HWB_MAJOR = 1;
export const HWB_MINOR = 0;
export const MAGIC = [0x48, 0x57, 0x42, 0x01] as const; // "HWB\x01"
export const HEADER_SIZE = 24;
export const FLAG_DEBUG = 1;
export const NONE = 0xffffffff;

export const Op = {
  SAY: 0x01, SHOW: 0x02, HIDE: 0x03, MOVE: 0x04, BG: 0x05, CG: 0x06, AUDIO: 0x07, STOP: 0x08,
  WAIT: 0x09, EFFECT: 0x0a, MENU: 0x0b,
  JMP: 0x10, JZ: 0x11, CALL: 0x12, RET: 0x13, END: 0x14,
  PUSH: 0x20, LOAD: 0x21, STORE: 0x22,
  ADD: 0x23, SUB: 0x24, MUL: 0x25, DIV: 0x26, MOD: 0x27, NEG: 0x28,
  EQ: 0x29, NE: 0x2a, LT: 0x2b, LE: 0x2c, GT: 0x2d, GE: 0x2e, NOT: 0x2f, AND: 0x30, OR: 0x31, RAND: 0x32,
} as const;

export type OpName = keyof typeof Op;
export const OP_NAMES: ReadonlyMap<number, OpName> = new Map(Object.entries(Op).map(([k, v]) => [v, k as OpName]));

/** Fixed argument counts; SHOW and MENU are computed from their own arguments. */
export const FIXED_ARGC: Readonly<Partial<Record<OpName, number>>> = {
  SAY: 1, HIDE: 4, MOVE: 5, BG: 4, CG: 4, AUDIO: 3, STOP: 2, WAIT: 1, EFFECT: 2,
  JMP: 1, JZ: 1, CALL: 1, RET: 0, END: 0, PUSH: 1, LOAD: 1, STORE: 1,
  ADD: 0, SUB: 0, MUL: 0, DIV: 0, MOD: 0, NEG: 0, EQ: 0, NE: 0, LT: 0, LE: 0, GT: 0, GE: 0, NOT: 0, AND: 0, OR: 0, RAND: 0,
};

export const TextOp = { END: 0, RUN: 1, VAR: 2, OPEN: 3, CLOSE: 4, MARK: 5, SELECT: 6 } as const;

export const Channel = { music: 0, ambient: 1, sfx: 2, voice: 3 } as const;

export const LINE_OPTION = 1;
export const LINE_ONCE = 2;
export const LINE_PROMPT = 4;

export interface VarEntry {
  name: number;
  type: 0 | 1 | 2; // int, bool, str
  scope: 0 | 1; // save, global
  default: number;
  enumValues: number[];
}

export interface CharEntry {
  id: number;
  name: number;
  color: number;
}

export interface SceneEntry {
  name: number;
  entryPc: number;
  file: number;
}

export interface LineEntry {
  lineId: number;
  speaker: number;
  text: number;
  flags: number;
}

export interface DebugEntry {
  pc: number;
  file: number;
  line: number;
}

/** Game information from himawari.json (META). Positions are in 1/10000 of the canvas. */
export interface MetaInfo {
  title: number;
  id: number;
  width: number;
  height: number;
  sourceLanguage: number;
  /** Every language the game offers, source first. */
  languages: number[];
  positions: { name: number; x: number; y: number }[];
}

/** One target language's compiled translations (LOCL). */
export interface LocaleEntry {
  language: number;
  /** One per LINE entry: a TEXT index, or NONE when untranslated (the source text is shown). */
  lineTexts: number[];
  /** One per CHAR entry: the display name's string index, or 0 for the source name. */
  charNames: number[];
}

export const POSITION_SCALE = 10000;

export const SPRITE_ALWAYS = 1;
export const SPRITE_MULTIPLE = 2;
export const SPRITE_BLINK = 4;
export const SPRITE_LIPFLAP = 8;

/** A layered sprite (SPRT, plan §6). Strings are string indices; fractions are in 1/10000. */
export interface SpriteEntry {
  char: number;
  root: number;
  anchorX: number;
  anchorY: number;
  scale: number;
  /** Bottom to top. */
  groups: { name: number; flags: number; defaults: number[]; attrs: number[] }[];
  /** Layers are [group index in this sprite, attribute]. */
  presets: { name: number; layers: [number, number][] }[];
  /** hide/show: an attribute or 0. */
  rules: { hide: number; show: number; when: number[] }[];
}

export interface HwbModule {
  major: number;
  minor: number;
  meta: MetaInfo;
  strings: string[];
  vars: VarEntry[];
  chars: CharEntry[];
  scenes: SceneEntry[];
  entryScene: number;
  lines: LineEntry[];
  texts: number[][];
  code: number[];
  debug: DebugEntry[] | null;
  locales: LocaleEntry[];
  sprites: SpriteEntry[];
}

/** Argument count an instruction must have, given its op and (for SHOW/MENU) its leading arguments. */
export function expectedArgc(op: number, code: readonly number[], argStart: number): number | undefined {
  const name = OP_NAMES.get(op);
  if (!name) return undefined;
  if (name === "SHOW") {
    const nAdd = code[argStart + 5];
    const nRemove = code[argStart + 6];
    return nAdd === undefined || nRemove === undefined ? undefined : 7 + nAdd + nRemove;
  }
  if (name === "MENU") {
    const n = code[argStart + 1];
    return n === undefined ? undefined : 2 + 2 * n;
  }
  return FIXED_ARGC[name];
}
