/**
 * Compiler: a checked project → an HwbModule (spec/bytecode.md). Refuses to
 * compile a project with errors. Deterministic: the same project always
 * produces the same bytes.
 */
import { lineIdToNumber } from "../ids.js";
import type { ProjectCheck } from "../project/check.js";
import { type ExtensionDef, extensionValues } from "../project/invoke.js";
import { type Expr, type MenuOption, type Scene, type Stmt, type Transition, endsFlow } from "../syntax/ast.js";
import type { Diagnostic } from "../syntax/diagnostics.js";
import { LineIndex } from "../syntax/position.js";
import { type TextPart, parseText } from "../syntax/text.js";
import {
  Channel, type DebugEntry, type ExtensionEntry, HWB_MAJOR, type HwbModule, LINE_CALL, LINE_ONCE, LINE_OPTION, LINE_PROMPT, type LocaleEntry, NONE, OPS_1_1,
  Op, type OpName, POSITION_SCALE, SPRITE_ALWAYS, SPRITE_BLINK, SPRITE_LIPFLAP, SPRITE_MULTIPLE, type SpriteEntry, TEXTBOX_MODES, TextOp, type ThemeEntry,
  XPARAM_TYPES, XTNS_BLOCKING,
} from "./format.js";

export interface CompileResult {
  module: HwbModule | null;
  /** Why compilation was refused: the project's errors, or a missing manifest. */
  errors: { file: string; diagnostic?: Diagnostic; message: string }[];
}

interface Label {
  pc: number | undefined;
  refs: number[];
}

const BINARY: Readonly<Record<string, OpName>> = {
  "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", "%": "MOD",
  "==": "EQ", "!=": "NE", "<": "LT", "<=": "LE", ">": "GT", ">=": "GE", and: "AND", or: "OR",
};

export function compile(check: ProjectCheck, options: { debug?: boolean } = {}): CompileResult {
  const errors: CompileResult["errors"] = [];
  for (const f of check.files) {
    for (const d of f.diagnostics) if (d.severity === "error") errors.push({ file: f.file, diagnostic: d, message: d.message });
  }
  if (!check.manifest) errors.push({ file: "himawari.json", message: "compiling needs himawari.json (variables and the entry scene)" });
  if (errors.length > 0) return { module: null, errors };
  return { module: new Compiler(check, options.debug ?? true).run(), errors: [] };
}

class Compiler {
  private readonly strings: string[] = [""];
  private readonly stringIndex = new Map<string, number>([["", 0]]);
  private readonly code: number[] = [];
  private readonly texts: number[][] = [];
  private readonly lines: HwbModule["lines"] = [];
  /** The `#line:` ID of each LINE entry, for LOCL. */
  private readonly lineIds: (string | null)[] = [];
  private readonly debug: DebugEntry[] = [];
  private readonly sceneLabels = new Map<string, Label>();
  private varIndex = new Map<string, number>();
  /** Extensions in name order; XCALL operand 0 is the index here. */
  private extList: ExtensionDef[] = [];
  /** Set when the code uses a 1.1 op. */
  private uses11 = false;
  /** Code position where a label with pending jumps was placed last; an instruction must follow it. */
  private landing = -1;
  private file = "";
  private index: LineIndex = new LineIndex("");

  constructor(
    private readonly check: ProjectCheck,
    private readonly withDebug: boolean,
  ) {}

  run(): HwbModule {
    const manifest = this.check.manifest as NonNullable<ProjectCheck["manifest"]>;

    const varNames = Object.keys(manifest.variables).sort();
    this.varIndex = new Map(varNames.map((n, i) => [n, i]));
    const vars = varNames.map((name) => {
      const v = manifest.variables[name] as (typeof manifest.variables)[string];
      const type = v.type === "int" ? 0 : v.type === "bool" ? 1 : 2;
      const def = v.type === "str" ? this.str(String(v.default)) : v.type === "bool" ? (v.default ? 1 : 0) : Number(v.default);
      return { name: this.str(name), type: type as 0 | 1 | 2, scope: (v.scope === "global" ? 1 : 0) as 0 | 1, default: def, enumValues: (v.enum ?? []).map((e) => this.str(e)) };
    });

    const sortedChars = [...this.check.characters.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const chars = sortedChars.map((c) => ({
      id: this.str(c.id),
      name: this.str(c.names[manifest.sourceLanguage] ?? c.displayName),
      color: c.color ? parseInt(c.color.slice(1), 16) : NONE,
    }));
    const sprites: SpriteEntry[] = [];
    sortedChars.forEach((c, index) => {
      const s = c.sprite;
      if (!s) return;
      const groupIndex = new Map(s.groups.map((g, i) => [g.name, i]));
      sprites.push({
        char: index,
        root: this.str(s.root),
        anchorX: Math.round(s.anchor[0] * POSITION_SCALE),
        anchorY: Math.round(s.anchor[1] * POSITION_SCALE),
        scale: Math.round(s.scale * POSITION_SCALE),
        groups: s.groups.map((g) => ({
          name: this.str(g.name),
          flags: (g.always ? SPRITE_ALWAYS : 0) | (g.multiple ? SPRITE_MULTIPLE : 0) | (g.blink ? SPRITE_BLINK : 0) | (g.lipflap ? SPRITE_LIPFLAP : 0),
          defaults: g.defaults.map((a) => this.str(a)),
          attrs: g.attrs.map((a) => this.str(a)),
        })),
        presets: s.presets.map((p) => ({
          name: this.str(p.name),
          layers: p.layers.filter(([g]) => groupIndex.has(g)).map(([g, a]) => [groupIndex.get(g) as number, this.str(a)] as [number, number]),
        })),
        rules: s.rules.map((r) => ({ hide: r.hide ? this.str(r.hide) : 0, show: r.show ? this.str(r.show) : 0, when: r.when.map((w) => this.str(w)) })),
      });
    });
    const languages = [manifest.sourceLanguage, ...manifest.languages.filter((l) => l !== manifest.sourceLanguage)];
    const meta = {
      title: this.str(manifest.name),
      id: this.str(manifest.id),
      width: manifest.resolution[0],
      height: manifest.resolution[1],
      sourceLanguage: this.str(manifest.sourceLanguage),
      languages: languages.map((l) => this.str(l)),
      positions: Object.keys(manifest.positions).sort().map((name) => {
        const [x, y] = manifest.positions[name] as [number, number];
        return { name: this.str(name), x: Math.round(x * POSITION_SCALE), y: Math.round(y * POSITION_SCALE) };
      }),
    };

    // Every extension statement the project declares, in name order (XTNS).
    this.extList = [...this.check.extensions.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // Scenes in name order, each with its file for debug info. Macro calls are already expanded.
    const all: { scene: Scene; file: string; source: string }[] = [];
    for (const f of this.check.files) {
      const ast = this.check.expanded.get(f.file) ?? this.check.parsed.get(f.file)?.ast;
      if (ast) for (const scene of ast.scenes) all.push({ scene, file: f.file, source: f.source });
    }
    all.sort((a, b) => (a.scene.id < b.scene.id ? -1 : a.scene.id > b.scene.id ? 1 : 0));
    for (const { scene } of all) this.sceneLabels.set(scene.id, { pc: undefined, refs: [] });

    const scenes = all.map(({ scene, file, source }) => {
      this.file = file;
      this.index = new LineIndex(source);
      const label = this.sceneLabels.get(scene.id) as Label;
      this.place(label);
      this.block(scene.body);
      // END when play can fall off the scene's end, or when a jump still lands right
      // here (labels must point at an instruction inside this scene). Code that can't
      // run gets no END, so playtests don't report it as an unreachable ending.
      if (!endsFlow(scene.body) || this.landing === this.code.length) this.emit("END");
      return { name: this.str(scene.id), entryPc: label.pc as number, file: this.str(file) };
    });

    for (const label of this.sceneLabels.values()) this.patch(label);
    const entryScene = all.findIndex((s) => s.scene.id === manifest.entry);

    // Translations: one LOCL entry per target language that has a string table.
    const locales: LocaleEntry[] = [];
    const tables = this.check.locales
      .filter((t) => t.language !== manifest.sourceLanguage && manifest.languages.includes(t.language))
      .sort((a, b) => (a.language < b.language ? -1 : a.language > b.language ? 1 : 0));
    for (const table of tables) {
      const byId = new Map(table.lines.filter((e) => e.text !== "").map((e) => [e.id, e.text]));
      locales.push({
        language: this.str(table.language),
        lineTexts: this.lineIds.map((id) => {
          const text = id === null ? undefined : byId.get(id);
          return text === undefined ? NONE : this.text(parseText(`"${text}"`, 0).parts);
        }),
        charNames: sortedChars.map((c) => {
          const name = c.names[table.language];
          return name === undefined ? 0 : this.str(name);
        }),
      });
    }

    const extensions: ExtensionEntry[] = this.extList.map((e) => ({
      name: this.str(e.name),
      flags: e.blocking ? XTNS_BLOCKING : 0,
      params: e.params.map((p) => ({ name: this.str(p.name), type: XPARAM_TYPES.indexOf(p.type) })),
    }));
    const theme: ThemeEntry[] = [...(this.check.theme ?? new Map()).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => ({ key: this.str(key), type: v.type === "int" ? 0 : v.type === "color" ? 1 : 2, value: v.type === "str" ? this.str(v.value) : v.value }));

    // The lowest minor version that holds this module, so games without 1.1 features still load in 1.0 players.
    const minor = this.uses11 || extensions.length > 0 || theme.length > 0 ? 1 : 0;
    return {
      major: HWB_MAJOR, minor, meta, strings: this.strings, vars, chars, scenes,
      entryScene: entryScene < 0 ? NONE : entryScene, lines: this.lines, texts: this.texts, code: this.code,
      debug: this.withDebug ? this.debug : null, locales, sprites, extensions, theme,
    };
  }

  // ---- helpers ----

  private str(s: string): number {
    let i = this.stringIndex.get(s);
    if (i === undefined) {
      i = this.strings.length;
      this.strings.push(s);
      this.stringIndex.set(s, i);
    }
    return i;
  }

  private label(): Label {
    return { pc: undefined, refs: [] };
  }

  private place(l: Label): void {
    l.pc = this.code.length;
    if (l.refs.length > 0) this.landing = l.pc;
    this.patch(l);
  }

  private patch(l: Label): void {
    if (l.pc === undefined) return;
    for (const r of l.refs) this.code[r] = l.pc;
    l.refs.length = 0;
  }

  private emit(op: OpName, ...args: (number | Label)[]): void {
    // The checker refuses anything bigger (HW0332, HW0333); never write a file the runtime would refuse.
    if (args.length > 255) throw new Error(`internal: ${op} with ${args.length} arguments (the limit is 255)`);
    if (OPS_1_1.has(Op[op])) this.uses11 = true;
    this.code.push(Op[op] | (args.length << 8));
    for (const a of args) {
      if (typeof a === "number") {
        this.code.push(a | 0);
      } else {
        if (a.pc !== undefined) this.code.push(a.pc);
        else {
          a.refs.push(this.code.length);
          this.code.push(0);
        }
      }
    }
  }

  private mark(span: { start: number }): void {
    if (!this.withDebug) return;
    const line = this.index.at(span.start).line;
    const last = this.debug[this.debug.length - 1];
    if (last && last.pc === this.code.length) {
      last.line = line;
      return;
    }
    this.debug.push({ pc: this.code.length, file: this.str(this.file), line });
  }

  private transition(t: Transition | null): [number, number, number] {
    if (!t) return [0, -1, -1];
    const num = (v: number | string | undefined) => (typeof v === "number" ? v : -1);
    if (t.type === "rule") return [this.str("rule"), this.str(String(t.args[0] ?? "")), num(t.args[1])];
    return [this.str(t.type), num(t.args[0]), -1];
  }

  private line(lineId: string | null, speaker: string, text: TextPart[], flags: number): number {
    this.lines.push({ lineId: lineId ? lineIdToNumber(lineId) : NONE, speaker: speaker ? this.str(speaker) : 0, text: this.text(text), flags });
    this.lineIds.push(lineId);
    return this.lines.length - 1;
  }

  private text(parts: readonly TextPart[]): number {
    const words: number[] = [];
    const visit = (ps: readonly TextPart[]) => {
      for (const p of ps) {
        if ("t" in p) words.push(TextOp.RUN, this.str(p.t));
        else if ("var" in p) words.push(TextOp.VAR, this.varIndex.get(p.var) ?? 0);
        else if ("select" in p) {
          const keys = Object.keys(p.cases).sort();
          const cases = keys.map((k) => [this.str(k), this.text(p.cases[k] as TextPart[])]);
          words.push(TextOp.SELECT, this.varIndex.get(p.select) ?? 0, keys.length, ...cases.flat());
        } else if ("children" in p) {
          words.push(TextOp.OPEN, this.str(p.tag), p.value === undefined ? 0 : this.str(p.value));
          visit(p.children);
          words.push(TextOp.CLOSE);
        } else {
          words.push(TextOp.MARK, this.str(p.tag), p.value === undefined ? 0 : this.str(p.value));
        }
      }
    };
    visit(parts);
    words.push(TextOp.END);
    this.texts.push(words);
    return this.texts.length - 1;
  }

  // ---- statements ----

  private block(body: readonly Stmt[]): void {
    for (const s of body) this.stmt(s);
  }

  private stmt(s: Stmt): void {
    this.mark(s.span);
    switch (s.kind) {
      case "Say":
        if (s.attrs.add.length + s.attrs.remove.length > 0) this.show(s.speaker, null, null, s.attrs.add, s.attrs.remove);
        this.emit("SAY", this.line(s.lineId, s.speaker, s.text, 0));
        break;
      case "Narration":
        this.emit("SAY", this.line(s.lineId, "", s.text, 0));
        break;
      case "Show":
        this.show(s.char, s.at, s.transition, s.add, s.remove);
        break;
      case "Hide":
        this.emit("HIDE", this.str(s.char), ...this.transition(s.transition));
        break;
      case "Move":
        this.emit("MOVE", this.str(s.char), s.at ? this.str(s.at) : 0, ...this.transition(s.transition));
        break;
      case "Bg":
      case "Cg":
        this.emit(s.kind === "Bg" ? "BG" : "CG", this.str(s.asset), ...this.transition(s.transition));
        break;
      case "Audio":
        this.emit("AUDIO", Channel[s.channel], this.str(s.asset), s.fadeMs ?? -1);
        break;
      case "Stop":
        this.emit("STOP", Channel[s.channel as keyof typeof Channel] ?? 0, s.fadeMs ?? -1);
        break;
      case "Wait":
        this.emit("WAIT", s.ms ?? 0);
        break;
      case "Effect":
        this.emit("EFFECT", s.effect === "shake" ? 0 : 1, s.ms ?? -1);
        break;
      case "Assign": {
        const v = this.varIndex.get(s.name) ?? 0;
        if (s.op === "=") {
          this.expr(s.value);
        } else {
          this.emit("LOAD", v);
          this.expr(s.value);
          this.emit(s.op === "+=" ? "ADD" : s.op === "-=" ? "SUB" : "MUL");
        }
        this.emit("STORE", v);
        break;
      }
      case "Jump":
        this.emit("JMP", this.sceneLabels.get(s.target) as Label);
        break;
      case "Call":
        this.emit("CALL", this.sceneLabels.get(s.target) as Label);
        break;
      case "Return":
        this.emit("RET");
        break;
      case "End":
        this.emit("END");
        break;
      case "If": {
        const end = this.label();
        s.clauses.forEach((c, i) => {
          const next = this.label();
          if (c.cond) {
            this.expr(c.cond);
            this.emit("JZ", next);
          }
          this.block(c.body);
          // The last clause already ends right where `end` goes.
          if (!endsFlow(c.body) && i < s.clauses.length - 1) this.emit("JMP", end);
          this.place(next);
        });
        this.place(end);
        break;
      }
      case "Menu":
        this.menu(s.prompt, s.promptLineId, s.options);
        break;
      case "Textbox":
        this.emit("TEXTBOX", TEXTBOX_MODES.indexOf(s.mode));
        break;
      case "Invoke":
        this.xcall(s);
        break;
    }
  }

  /** An extension statement (macro calls were expanded by the checker). */
  private xcall(s: Extract<Stmt, { kind: "Invoke" }>): void {
    const index = this.extList.findIndex((e) => e.name === s.name);
    const ext = this.extList[index];
    if (!ext) return; // unknown names are errors, so this can't happen in a module we emit
    const values = extensionValues(ext, s.args, s.span).map((v, i) => {
      const type = ext.params[i]?.type;
      if (v === null) return NONE;
      if (v.kind === "text") return this.line(s.lineId, "", v.text, LINE_CALL);
      if (v.kind === "int") return v.value;
      if (type === "bool") return v.value === "true" ? 1 : 0;
      return this.str(v.value);
    });
    this.emit("XCALL", index, values.length, ...values);
  }

  private show(char: string, at: string | null, t: Transition | null, add: readonly string[], remove: readonly string[]): void {
    this.emit("SHOW", this.str(char), at ? this.str(at) : 0, ...this.transition(t), add.length, remove.length,
      ...add.map((a) => this.str(a)), ...remove.map((r) => this.str(r)));
  }

  private menu(prompt: TextPart[] | null, promptLineId: string | null, options: readonly MenuOption[]): void {
    for (const o of options) {
      if (o.cond) this.expr(o.cond);
      else this.emit("PUSH", 1);
    }
    const promptLine = prompt ? this.line(promptLineId, "", prompt, LINE_PROMPT) : NONE;
    const labels = options.map(() => this.label());
    const args: (number | Label)[] = [promptLine, options.length];
    options.forEach((o, i) => {
      args.push(this.line(o.lineId, "", o.text, LINE_OPTION | (o.once ? LINE_ONCE : 0)), labels[i] as Label);
    });
    this.emit("MENU", ...args);
    const gather = this.label();
    // When no option can be shown, MENU continues with the next instruction. That can't
    // happen if some option is always shown (unconditional and not `once`).
    if (!options.some((o) => o.cond === null && !o.once)) this.emit("JMP", gather);
    options.forEach((o, i) => {
      this.place(labels[i] as Label);
      this.mark(o.span);
      this.block(o.body);
      // The last option's body already ends at the gather point.
      if (o.fallsThrough && i < options.length - 1) this.emit("JMP", gather);
    });
    this.place(gather);
  }

  // ---- expressions ----

  private expr(e: Expr): void {
    switch (e.kind) {
      case "Int":
        this.emit("PUSH", e.value);
        break;
      case "Bool":
        this.emit("PUSH", e.value ? 1 : 0);
        break;
      case "Str":
        this.emit("PUSH", this.str(e.value));
        break;
      case "Var":
        this.emit("LOAD", this.varIndex.get(e.name) ?? 0);
        break;
      case "Unary":
        this.expr(e.operand);
        this.emit(e.op === "-" ? "NEG" : "NOT");
        break;
      case "Binary":
        this.expr(e.left);
        this.expr(e.right);
        this.emit(BINARY[e.op] ?? "ADD");
        break;
      case "Call":
        this.expr(e.args[0] ?? { kind: "Int", value: 0 });
        this.emit("RAND");
        break;
      case "Invalid":
        this.emit("PUSH", 0);
        break;
    }
  }
}
