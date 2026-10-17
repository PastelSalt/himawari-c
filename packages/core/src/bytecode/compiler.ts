/**
 * Compiler: a checked project → an HwbModule (spec/bytecode.md). Refuses to
 * compile a project with errors. Deterministic: the same project always
 * produces the same bytes.
 */
import { lineIdToNumber } from "../ids.js";
import type { ProjectCheck } from "../project/check.js";
import { type Expr, type MenuOption, type Scene, type Stmt, type Transition, endsFlow } from "../syntax/ast.js";
import type { Diagnostic } from "../syntax/diagnostics.js";
import { LineIndex } from "../syntax/position.js";
import type { TextPart } from "../syntax/text.js";
import {
  Channel, type DebugEntry, HWB_MAJOR, HWB_MINOR, type HwbModule, LINE_ONCE, LINE_OPTION, LINE_PROMPT, NONE, Op, type OpName, TextOp,
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
  private readonly debug: DebugEntry[] = [];
  private readonly sceneLabels = new Map<string, Label>();
  private varIndex = new Map<string, number>();
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

    const chars = [...this.check.characters.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((c) => ({ id: this.str(c.id), name: this.str(c.displayName), color: c.color ? parseInt(c.color.slice(1), 16) : NONE }));

    // Scenes in name order, each with its file for debug info.
    const all: { scene: Scene; file: string; source: string }[] = [];
    for (const f of this.check.files) {
      const parsed = this.check.parsed.get(f.file);
      if (parsed) for (const scene of parsed.ast.scenes) all.push({ scene, file: f.file, source: f.source });
    }
    all.sort((a, b) => (a.scene.id < b.scene.id ? -1 : a.scene.id > b.scene.id ? 1 : 0));
    for (const { scene } of all) this.sceneLabels.set(scene.id, { pc: undefined, refs: [] });

    const scenes = all.map(({ scene, file, source }) => {
      this.file = file;
      this.index = new LineIndex(source);
      const label = this.sceneLabels.get(scene.id) as Label;
      this.place(label);
      this.block(scene.body);
      // END unless the scene literally ends in jump/return/end. Even when every path ends
      // (an if with else, an unskippable menu), internal labels such as a menu's gather
      // point must land on an instruction inside this scene.
      const last = scene.body[scene.body.length - 1];
      if (!last || (last.kind !== "Jump" && last.kind !== "Return" && last.kind !== "End")) this.emit("END");
      return { name: this.str(scene.id), entryPc: label.pc as number, file: this.str(file) };
    });

    for (const label of this.sceneLabels.values()) this.patch(label);
    const entryScene = all.findIndex((s) => s.scene.id === manifest.entry);

    return {
      major: HWB_MAJOR, minor: HWB_MINOR, strings: this.strings, vars, chars, scenes,
      entryScene: entryScene < 0 ? NONE : entryScene, lines: this.lines, texts: this.texts, code: this.code,
      debug: this.withDebug ? this.debug : null,
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
    this.patch(l);
  }

  private patch(l: Label): void {
    if (l.pc === undefined) return;
    for (const r of l.refs) this.code[r] = l.pc;
    l.refs.length = 0;
  }

  private emit(op: OpName, ...args: (number | Label)[]): void {
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
        this.menu(s.prompt, s.options);
        break;
    }
  }

  private show(char: string, at: string | null, t: Transition | null, add: readonly string[], remove: readonly string[]): void {
    this.emit("SHOW", this.str(char), at ? this.str(at) : 0, ...this.transition(t), add.length, remove.length,
      ...add.map((a) => this.str(a)), ...remove.map((r) => this.str(r)));
  }

  private menu(prompt: TextPart[] | null, options: readonly MenuOption[]): void {
    for (const o of options) {
      if (o.cond) this.expr(o.cond);
      else this.emit("PUSH", 1);
    }
    const promptLine = prompt ? this.line(null, "", prompt, LINE_PROMPT) : NONE;
    const labels = options.map(() => this.label());
    const args: (number | Label)[] = [promptLine, options.length];
    options.forEach((o, i) => {
      args.push(this.line(o.lineId, "", o.text, LINE_OPTION | (o.once ? LINE_ONCE : 0)), labels[i] as Label);
    });
    this.emit("MENU", ...args);
    const gather = this.label();
    this.emit("JMP", gather); // no option could be shown
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
