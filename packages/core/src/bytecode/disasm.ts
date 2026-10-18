/** Human-readable listing of an HwbModule (`hwc disasm`, golden conformance files). */
import { numberToLineId } from "../ids.js";
import { type HwbModule, NONE, OP_NAMES, POSITION_SCALE, TEXTBOX_MODES, TextOp, XPARAM_BOOL, XPARAM_INT, XPARAM_TEXT, XPARAM_TYPES, XTNS_BLOCKING } from "./format.js";

export function disassemble(m: HwbModule): string {
  const s = (i: number) => JSON.stringify(m.strings[i] ?? `?${i}`);
  const opt = (i: number) => (i === 0 ? "-" : s(i));
  const out: string[] = [];

  out.push(`; Himawari bytecode ${m.major}.${m.minor}`);
  out.push(`; ${m.strings.length} strings, ${m.vars.length} variables, ${m.chars.length} characters, ${m.scenes.length} scenes, ${m.lines.length} lines, ${m.code.length} code words`);
  const entry = m.scenes[m.entryScene];
  out.push(`; entry: ${entry ? (m.strings[entry.name] ?? "?") : "(none)"}`);
  const mt = m.meta;
  out.push(`; game: ${s(mt.title)} ${m.strings[mt.id]} ${mt.width}x${mt.height}, languages ${mt.languages.map((l) => m.strings[l]).join(" ")}`);
  out.push(`; positions: ${mt.positions.map((p) => `${m.strings[p.name]}(${p.x / POSITION_SCALE}, ${p.y / POSITION_SCALE})`).join(" ")}`);
  out.push("");

  for (const [i, v] of m.vars.entries()) {
    const type = ["int", "bool", "str"][v.type];
    const def = v.type === 2 ? s(v.default) : String(v.default);
    const en = v.enumValues.length ? ` enum(${v.enumValues.map((e) => m.strings[e]).join(", ")})` : "";
    out.push(`var ${i}: ${m.strings[v.name]} ${type}${en} = ${def} (${v.scope ? "global" : "save"})`);
  }
  for (const c of m.chars) {
    out.push(`char ${m.strings[c.id]} ${s(c.name)}${c.color !== NONE ? ` #${c.color.toString(16).padStart(6, "0")}` : ""}`);
  }
  const words = (xs: readonly number[]) => xs.map((x) => m.strings[x]).join(" ");
  for (const sp of m.sprites) {
    const scale = (v: number) => v / POSITION_SCALE;
    out.push(`sprite ${m.strings[m.chars[sp.char]?.id ?? 0]} ${m.strings[sp.root]} anchor(${scale(sp.anchorX)}, ${scale(sp.anchorY)}) scale ${scale(sp.scale)}`);
    for (const g of sp.groups) {
      const flags = ["always", "multiple", "blink", "lipflap"].filter((_, i) => g.flags & (1 << i));
      out.push(`  group ${m.strings[g.name]}${flags.length ? ` [${flags.join(" ")}]` : ""}${g.defaults.length ? ` default(${words(g.defaults)})` : ""}${g.attrs.length ? `: ${words(g.attrs)}` : ""}`);
    }
    for (const p of sp.presets) {
      out.push(`  preset ${m.strings[p.name]}: ${p.layers.map(([gi, a]) => `${m.strings[sp.groups[gi]?.name ?? 0]}=${m.strings[a]}`).join(" ")}`);
    }
    for (const r of sp.rules) {
      out.push(`  rule ${r.hide ? `hide ${m.strings[r.hide]}` : `show ${m.strings[r.show]}`} when ${words(r.when)}`);
    }
  }
  for (const e of m.extensions) {
    const params = e.params.map((p) => `${m.strings[p.name]}: ${XPARAM_TYPES[p.type]}`).join(", ");
    out.push(`extension ${m.strings[e.name]}(${params})${e.flags & XTNS_BLOCKING ? " [blocking]" : ""}`);
  }
  for (const t of m.theme) {
    const value = t.type === 0 ? String(t.value) : t.type === 1 ? `#${t.value.toString(16).padStart(6, "0")}` : s(t.value);
    out.push(`theme ${m.strings[t.key]} = ${value}`);
  }
  out.push("");

  // Labels: every jump/menu target that isn't a scene entry.
  const sceneAt = new Map(m.scenes.map((sc) => [sc.entryPc, sc]));
  const targets = new Set<number>();
  for (let pc = 0; pc < m.code.length; ) {
    const w = m.code[pc] as number;
    const op = OP_NAMES.get(w & 0xff);
    const argc = (w >>> 8) & 0xff;
    const a = (k: number) => m.code[pc + 1 + k] as number;
    if (op === "JMP" || op === "JZ" || op === "CALL") targets.add(a(0));
    if (op === "MENU") for (let i = 0; i < a(1); i++) targets.add(a(3 + 2 * i));
    pc += 1 + argc;
  }
  const where = (pc: number) => {
    const sc = sceneAt.get(pc);
    return sc ? (m.strings[sc.name] ?? "?") : `L${pc}`;
  };
  const dbg = new Map((m.debug ?? []).map((d) => [d.pc, d]));

  for (let pc = 0; pc < m.code.length; ) {
    const sc = sceneAt.get(pc);
    if (sc) out.push(`\nscene ${m.strings[sc.name]}:  ; ${m.strings[sc.file]}`);
    else if (targets.has(pc)) out.push(`L${pc}:`);

    const w = m.code[pc] as number;
    const op = OP_NAMES.get(w & 0xff) ?? "?";
    const argc = (w >>> 8) & 0xff;
    const args = m.code.slice(pc + 1, pc + 1 + argc);
    const a = (k: number) => args[k] as number;
    const trans = (k: number) => (a(k) === 0 ? "" : ` with ${m.strings[a(k)]}(${a(k) === m.strings.indexOf("rule") ? `${m.strings[a(k + 1)]}, ${a(k + 2)}` : a(k + 1)})`);
    let text: string;
    switch (op) {
      case "SAY": {
        const line = m.lines[a(0)];
        text = `SAY      ${line ? lineDesc(m, a(0)) : `line ${a(0)}`}`;
        break;
      }
      case "SHOW": {
        const nAdd = a(5);
        const nRem = a(6);
        const attrs = [...args.slice(7, 7 + nAdd).map((x) => m.strings[x]), ...args.slice(7 + nAdd, 7 + nAdd + nRem).map((x) => `-${m.strings[x]}`)];
        text = `SHOW     ${m.strings[a(0)]}${attrs.length ? ` ${attrs.join(" ")}` : ""}${a(1) ? ` at ${m.strings[a(1)]}` : ""}${trans(2)}`;
        break;
      }
      case "HIDE":
        text = `HIDE     ${m.strings[a(0)]}${trans(1)}`;
        break;
      case "MOVE":
        text = `MOVE     ${m.strings[a(0)]} at ${opt(a(1))}${trans(2)}`;
        break;
      case "BG":
      case "CG":
        text = `${op.padEnd(8)} ${m.strings[a(0)]}${trans(1)}`;
        break;
      case "AUDIO":
        text = `AUDIO    ${["music", "ambient", "sfx", "voice"][a(0)]} ${m.strings[a(1)]}${a(2) >= 0 ? ` fade ${a(2)}` : ""}`;
        break;
      case "STOP":
        text = `STOP     ${["music", "ambient", "sfx", "voice"][a(0)]}${a(1) >= 0 ? ` fade ${a(1)}` : ""}`;
        break;
      case "EFFECT":
        text = `EFFECT   ${a(0) ? "flash" : "shake"}${a(1) >= 0 ? ` ${a(1)}` : ""}`;
        break;
      case "TEXTBOX":
        text = `TEXTBOX  ${TEXTBOX_MODES[a(0)] ?? a(0)}`;
        break;
      case "XCALL": {
        const ext = m.extensions[a(0)];
        const values = (ext?.params ?? []).map((p, i) => {
          const v = a(2 + i);
          const shown =
            p.type === XPARAM_INT ? String(v) : p.type === XPARAM_BOOL ? (v ? "true" : "false") : p.type === XPARAM_TEXT ? (v >>> 0 === NONE ? "-" : lineDesc(m, v)) : (m.strings[v] ?? `?${v}`);
          return `${m.strings[p.name]}=${shown}`;
        });
        text = `XCALL    ${ext ? m.strings[ext.name] : `extension ${a(0)}`}(${values.join(", ")})`;
        break;
      }
      case "MENU": {
        const lines = [`MENU     ${a(0) >>> 0 === NONE ? "(no prompt)" : lineDesc(m, a(0))}`];
        for (let i = 0; i < a(1); i++) lines.push(`           option ${lineDesc(m, a(2 + 2 * i))} -> ${where(a(3 + 2 * i))}`);
        text = lines.join("\n      ");
        break;
      }
      case "JMP":
      case "JZ":
      case "CALL":
        text = `${op.padEnd(8)} ${where(a(0))}`;
        break;
      case "LOAD":
      case "STORE":
        text = `${op.padEnd(8)} ${m.strings[m.vars[a(0)]?.name ?? 0]}`;
        break;
      default:
        text = `${op.padEnd(8)}${args.length ? ` ${args.join(" ")}` : ""}`.trimEnd();
    }
    const d = dbg.get(pc);
    const loc = d ? `   ; ${m.strings[d.file]}:${d.line}` : "";
    out.push(`  ${String(pc).padStart(4, "0")}  ${text}${loc}`);
    pc += 1 + argc;
  }
  for (const l of m.locales) {
    out.push(`\nlocale ${m.strings[l.language]}:`);
    l.charNames.forEach((n, i) => {
      if (n) out.push(`  char ${m.strings[m.chars[i]?.id ?? 0]} ${s(n)}`);
    });
    l.lineTexts.forEach((t, i) => {
      const line = m.lines[i];
      const id = line && line.lineId >>> 0 !== NONE ? `#${numberToLineId(line.lineId)}` : `line ${i}`;
      out.push(`  ${id} ${t >>> 0 === NONE ? "(untranslated)" : JSON.stringify(textPreview(m, t))}`);
    });
  }
  return `${out.join("\n")}\n`;
}

function lineDesc(m: HwbModule, index: number): string {
  const l = m.lines[index];
  if (!l) return `line ${index}`;
  const id = l.lineId >>> 0 === NONE ? "" : ` #${numberToLineId(l.lineId)}`;
  const speaker = l.speaker ? `${m.strings[l.speaker]} ` : "";
  const flags = [l.flags & 2 ? "once " : ""].join("");
  return `${flags}${speaker}${JSON.stringify(textPreview(m, l.text))}${id}`;
}

/** Plain text of a text program, with [var] and {select …} shown symbolically. */
export function textPreview(m: HwbModule, index: number): string {
  const w = m.texts[index] ?? [];
  let s = "";
  for (let i = 0; i < w.length; ) {
    const op = w[i++];
    if (op === TextOp.END) break;
    if (op === TextOp.RUN) s += m.strings[w[i++] as number];
    else if (op === TextOp.VAR) s += `[${m.strings[m.vars[w[i++] as number]?.name ?? 0]}]`;
    else if (op === TextOp.OPEN) {
      const tag = m.strings[w[i++] as number];
      const value = w[i++] as number;
      s += `{${tag}${value ? `=${m.strings[value]}` : ""}}`;
    } else if (op === TextOp.CLOSE) s += "{/}";
    else if (op === TextOp.MARK) {
      const tag = m.strings[w[i++] as number];
      const value = w[i++] as number;
      s += `{${tag}${value ? `=${m.strings[value]}` : ""}}`;
    } else if (op === TextOp.SELECT) {
      const v = m.strings[m.vars[w[i++] as number]?.name ?? 0];
      const n = w[i++] as number;
      i += 2 * n;
      s += `{select ${v}}`;
    }
  }
  return s;
}
