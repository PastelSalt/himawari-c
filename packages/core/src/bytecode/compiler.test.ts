import { describe, expect, test } from "vitest";
import { lineIdToNumber, numberToLineId } from "../ids.js";
import { type ProjectInput, checkProject } from "../project/check.js";
import { compile } from "./compiler.js";
import { crc32 } from "./crc32.js";
import { disassemble } from "./disasm.js";
import { NONE, Op, TextOp } from "./format.js";
import { HwbError, readHwb } from "./reader.js";
import { writeHwb } from "./writer.js";

const MANIFEST = JSON.stringify({
  name: "T", id: "dev.moesoft.t", version: "0.1.0", engine: "^1.0.0", entry: "start",
  sourceLanguage: "en", languages: ["en"],
  variables: {
    score: { type: "int", default: 0, scope: "save" },
    met: { type: "bool", default: false, scope: "save" },
    g: { type: "str", enum: ["m", "f", "other"], default: "other", scope: "save" },
  },
});

const HANA = '---\nid: hana\nname: "Hana"\ncolor: "#f2a541"\n---\n';

const SCRIPT = `scene start:
    bg room with fade(300)
    show hana smile at left
    hana -glasses "Hi {b}there{/b}, [score]!"   #line:k3f9a1
    "{select g: m="He" f="She" other="They"} {rb=はな}花{/rb}."   #line:q7c1d0
    $ score += 2
    if score > 1 and not met:
        call side
    else:
        $ met = true
    menu "Pick":
        "A":   #line:aaaaa1
            jump ending
        once "B" if met:   #line:aaaaa2
            "Falls through."   #line:aaaaa3
    jump ending

scene side:
    "Side."   #line:aaaaa4
    return

scene ending:
    music theme fade(1000)
    end
`;

function project(script = SCRIPT): ProjectInput {
  return {
    manifest: { file: "himawari.json", text: MANIFEST },
    characters: [{ file: "characters/hana.md", text: HANA }],
    scripts: [{ file: "script/ch1.hws", text: script }],
  };
}

const build = (script = SCRIPT) => {
  const r = compile(checkProject(project(script)));
  if (!r.module) throw new Error(r.errors.map((e) => e.message).join("\n"));
  return r.module;
};

describe("compiler", () => {
  const m = build();

  test("scenes in name order; entry scene recorded", () => {
    expect(m.scenes.map((s) => m.strings[s.name])).toEqual(["ending", "side", "start"]);
    expect(m.strings[m.scenes[m.entryScene]?.name ?? 0]).toBe("start");
  });

  test("variables sorted, with enums and defaults", () => {
    expect(m.vars.map((v) => [m.strings[v.name], v.type, v.default])).toEqual([
      ["g", 2, m.strings.indexOf("other")], ["met", 1, 0], ["score", 0, 0],
    ]);
    expect(m.vars[0]?.enumValues.map((e) => m.strings[e])).toEqual(["m", "f", "other"]);
  });

  test("characters with display name and color", () => {
    expect(m.chars).toEqual([{ id: m.strings.indexOf("hana"), name: m.strings.indexOf("Hana"), color: 0xf2a541 }]);
  });

  test("line table keeps line IDs as numbers, in code order (scenes by name)", () => {
    const ids = m.lines.filter((l) => l.lineId >>> 0 !== NONE).map((l) => numberToLineId(l.lineId));
    // side (aaaaa4) compiles before start; options before their bodies.
    expect(ids).toEqual(["aaaaa4", "k3f9a1", "q7c1d0", "aaaaa1", "aaaaa2", "aaaaa3"]);
    // k=19 3 f=15 9 a=10 1 in base 32, first character most significant.
    expect(lineIdToNumber("k3f9a1")).toBe(641180993);
    expect(numberToLineId(641180993)).toBe("k3f9a1");
  });

  test("rich text: tags, variables, select, ruby", () => {
    const say = m.lines.find((l) => numberToLineId(l.lineId) === "k3f9a1");
    const words = m.texts[say?.text ?? 0] ?? [];
    expect(words[0]).toBe(TextOp.RUN);
    expect(words).toContain(TextOp.OPEN);
    expect(words).toContain(TextOp.VAR);
    const narr = m.lines.find((l) => numberToLineId(l.lineId) === "q7c1d0");
    const nw = m.texts[narr?.text ?? 0] ?? [];
    expect(nw[0]).toBe(TextOp.SELECT);
    expect(nw).toContain(m.strings.indexOf("rb"));
    expect(nw).toContain(m.strings.indexOf("はな"));
  });

  test("the disassembly reads like the script", () => {
    const d = disassemble(m);
    expect(d).toContain("scene start:  ; script/ch1.hws");
    expect(d).toContain("BG       room with fade(300)");
    expect(d).toContain("SHOW     hana smile at left");
    expect(d).toContain("SHOW     hana -glasses");
    expect(d).toContain('SAY      hana "Hi {b}there{/}, [score]!" #k3f9a1');
    expect(d).toContain("CALL     side");
    expect(d).toContain('MENU     "Pick"');
    expect(d).toContain('option once "B" #aaaaa2');
    expect(d).toContain("AUDIO    music theme fade 1000");
    expect(d).toMatch(/; script\/ch1\.hws:4/);
  });

  test("a scene that runs off its end gets END", () => {
    const mm = build(SCRIPT.replace('    "Side."   #line:aaaaa4\n    return', '    "Side."   #line:aaaaa4'));
    const side = mm.scenes.find((s) => mm.strings[s.name] === "side");
    const pc = side?.entryPc ?? 0;
    expect(mm.code[pc + 2]! & 0xff).toBe(Op.END); // SAY line, then END
  });

  test("refuses projects with errors, or without a manifest", () => {
    const bad = compile(checkProject(project(SCRIPT.replace("jump ending\n\nscene side", "jump nowhere\n\nscene side"))));
    expect(bad.module).toBeNull();
    expect(bad.errors.map((e) => e.diagnostic?.code)).toContain("HW0208");
    const noManifest = compile(checkProject({ scripts: [{ file: "a.hws", text: "scene a:\n    end\n" }] }));
    expect(noManifest.errors[0]?.message).toContain("himawari.json");
  });
});

describe("binary format", () => {
  const m = build();
  const bytes = writeHwb(m);

  test("header", () => {
    expect([...bytes.slice(0, 4)]).toEqual([0x48, 0x57, 0x42, 0x01]);
    const v = new DataView(bytes.buffer);
    expect(v.getUint16(4, true)).toBe(1);
    expect(v.getUint32(16, true)).toBe(bytes.length);
    expect(bytes.length % 4).toBe(0);
  });

  test("round-trip: read(write(m)) equals m", () => {
    expect(readHwb(bytes)).toEqual(m);
  });

  test("reads from a view at a non-zero offset (like a Node Buffer from readFileSync) without touching the rest", () => {
    const pool = new Uint8Array(bytes.length + 64).fill(0xab);
    pool.set(bytes, 32);
    const view = pool.subarray(32, 32 + bytes.length);
    expect(readHwb(view)).toEqual(m);
    expect(pool.slice(0, 32).every((b) => b === 0xab)).toBe(true);
    expect(pool.slice(32, 32 + bytes.length)).toEqual(bytes); // unchanged
  });

  test("deterministic: the same project gives identical bytes", () => {
    expect(writeHwb(build())).toEqual(bytes);
  });

  test("without debug info", () => {
    const r = compile(checkProject(project()), { debug: false });
    const b = writeHwb(r.module!);
    expect(readHwb(b).debug).toBeNull();
    expect(b.length).toBeLessThan(bytes.length);
  });

  /** Changes bytes, then fixes the CRC so only the structural check can catch it. */
  const corrupt = (edit: (b: Uint8Array, v: DataView) => void) => {
    const b = bytes.slice();
    const v = new DataView(b.buffer);
    edit(b, v);
    v.setUint32(20, 0, true);
    v.setUint32(20, crc32(b), true);
    return b;
  };
  const sectionAt = (tag: string) => {
    const v = new DataView(bytes.buffer);
    for (let i = 0; i < v.getUint32(12, true); i++) {
      const e = 24 + i * 12;
      if (String.fromCharCode(...bytes.slice(e, e + 4)) === tag) return v.getUint32(e + 4, true);
    }
    throw new Error(tag);
  };

  test.each<[string, (b: Uint8Array, v: DataView) => void, RegExp]>([
    ["bad magic", (b) => (b[0] = 0x00), /bad magic/],
    ["newer major version", (_b, v) => v.setUint16(4, 2, true), /unsupported version/],
    ["wrong size", (_b, v) => v.setUint32(16, 12345, true), /size/],
    ["jump into the middle of an instruction", (_b, v) => {
      const code = sectionAt("CODE");
      const words = v.getUint32(code, true);
      for (let i = 0; i < words; i++) {
        const at = code + 4 + i * 4;
        const w = v.getUint32(at, true);
        if ((w & 0xff) === Op.JMP && ((w >>> 8) & 0xff) === 1) {
          v.setUint32(at + 4, v.getUint32(at + 4, true) + 1, true);
          return;
        }
      }
    }, /isn't an instruction/],
    ["unknown opcode", (_b, v) => v.setUint32(sectionAt("CODE") + 4, 0xee, true), /unknown opcode/],
    ["string index out of range", (_b, v) => v.setUint32(sectionAt("SCNE") + 4, 999999, true), /out of range/],
  ])("rejects: %s", (_name, edit, message) => {
    expect(() => readHwb(corrupt(edit))).toThrow(message);
  });

  test("rejects a damaged file by checksum", () => {
    const b = bytes.slice();
    b[b.length - 1] = (b[b.length - 1] as number) ^ 0xff;
    expect(() => readHwb(b)).toThrow(HwbError);
    expect(() => readHwb(b)).toThrow(/checksum/);
  });

  test("rejects truncated files", () => {
    for (const n of [0, 10, 24, Math.floor(bytes.length / 2)]) expect(() => readHwb(bytes.slice(0, n))).toThrow(HwbError);
  });
});

describe("bytecode 1.1 (rfcs/0007, rfcs/0008)", () => {
  const ext = {
    file: "extensions/phone.schema.json",
    text: JSON.stringify({ name: "phone", blocking: true, params: [{ name: "from", type: "character" }, { name: "message", type: "text" }, { name: "ms", type: "int", default: 300 }, { name: "loud", type: "bool", default: false }] }),
  };
  const theme = { file: "theme/theme.json", text: JSON.stringify({ colors: { accent: "#ff8800" }, textbox: { opacity: 70, image: "ui/box" } }) };
  const script = `define statement enter(who: character):
    show who at left

scene start:
    enter(hana)
    textbox nvl
    phone(hana, "On my way!", loud=true)   #line:ccccc1
    textbox clear
    end
`;
  const build = (withExtras: boolean) => {
    const input: ProjectInput = {
      manifest: { file: "himawari.json", text: MANIFEST },
      characters: [{ file: "characters/hana.md", text: HANA }],
      scripts: [{ file: "script/start.hws", text: script.replace(/\n    phone\(.*\n/, withExtras ? "$&" : "\n") }],
      ...(withExtras ? { extensions: [ext], theme } : {}),
    };
    const r = compile(checkProject(input));
    expect(r.errors).toEqual([]);
    return r.module!;
  };

  test("TEXTBOX, XCALL, XTNS, and THEM round-trip and disassemble", () => {
    const m = build(true);
    expect(m.minor).toBe(1);
    const back = readHwb(writeHwb(m));
    expect(back).toEqual(m);
    const text = disassemble(back);
    expect(text).toContain("extension phone(from: character, message: text, ms: int, loud: bool) [blocking]");
    expect(text).toContain('theme color.accent = #ff8800');
    expect(text).toContain('theme textbox.image = "ui/box"');
    expect(text).toContain("SHOW     hana at left");
    expect(text).toContain("TEXTBOX  nvl");
    expect(text).toContain('XCALL    phone(from=hana, message="On my way!" #ccccc1, ms=300, loud=true)');
  });

  test("a module without 1.1 features is written as 1.0, and a 1.0 module can't use 1.1 ops", () => {
    const plain = compile(checkProject({ manifest: { file: "himawari.json", text: MANIFEST }, characters: [{ file: "characters/hana.md", text: HANA }], scripts: [{ file: "script/start.hws", text: "scene start:\n    end\n" }] })).module!;
    expect(plain.minor).toBe(0);
    const m = build(true);
    expect(() => readHwb(writeHwb({ ...m, minor: 0 }))).toThrow(HwbError);
  });

  test("the reader refuses a bad XCALL", () => {
    const m = build(true);
    let at = 0;
    while ((m.code[at]! & 0xff) !== Op.XCALL) at += 1 + ((m.code[at]! >>> 8) & 0xff); // walk instructions, not argument words
    const bad = [...m.code];
    bad[at + 1] = 7; // no such extension
    expect(() => readHwb(writeHwb({ ...m, code: bad }))).toThrow(/extension out of range/);
    const lineOut = [...m.code];
    lineOut[at + 4] = 999; // the text operand
    expect(() => readHwb(writeHwb({ ...m, code: lineOut }))).toThrow(/text line out of range/);
  });
});

describe("instruction size limits (255 arguments)", () => {
  const project = (script: string) =>
    checkProject({ manifest: { file: "himawari.json", text: MANIFEST }, characters: [{ file: "characters/hana.md", text: HANA }], scripts: [{ file: "script/s.hws", text: script }] });
  const errors = (c: ReturnType<typeof project>) => c.files.flatMap((f) => f.diagnostics.filter((d) => d.severity === "error").map((d) => d.code));
  const options = (n: number) => Array.from({ length: n }, (_, i) => `        "Option ${i}":\n            end`).join("\n");
  const words = (n: number) => Array.from({ length: n }, (_, i) => `a${i}`).join(" ");

  test("the largest menu and show compile to files the reader accepts", () => {
    for (const script of [`scene start:\n    menu:\n${options(126)}\n`, `scene start:\n    show hana ${words(248)}\n    end\n`]) {
      const c = project(script);
      expect(errors(c)).toEqual([]);
      expect(() => readHwb(writeHwb(compile(c).module!))).not.toThrow();
    }
  });

  test("one more is an error, not a broken file", () => {
    expect(errors(project(`scene start:\n    menu:\n${options(127)}\n`))).toEqual(["HW0332"]);
    expect(errors(project(`scene start:\n    hana ${words(249)} "Hi."\n    end\n`))).toEqual(["HW0333"]);
  });
});
