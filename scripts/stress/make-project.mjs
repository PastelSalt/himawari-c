// Makes a large Himawari project for stress tests: many routes, tens of thousands of
// lines, hundreds of images, layered characters, variables, and a translation.
// Everything is procedural (plan §1.5: no generated media); images are flat shapes.
//
//   node scripts/stress/make-project.mjs <folder> [--routes 12] [--files 10] [--scenes 8]
//        [--lines 30] [--bgs 200] [--cgs 60] [--big 6000] [--lang ja]
//
// Defaults give ≈ 30 000 lines in ≈ 120 files plus one 6 000-line file, ≈ 500 images.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
if (!out) {
  console.error("usage: node scripts/stress/make-project.mjs <folder> [--routes N] [--files N] [--scenes N] [--lines N] [--bgs N] [--cgs N] [--big N] [--lang xx]");
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (Number.isNaN(Number(args[i + 1])) ? args[i + 1] : Number(args[i + 1])) : def;
};
const ROUTES = opt("routes", 12);
const FILES = opt("files", 10);
const SCENES = opt("scenes", 8);
const LINES = opt("lines", 30);
const BGS = opt("bgs", 200);
const CGS = opt("cgs", 60);
const BIG = opt("big", 6000);
const LANG = opt("lang", "ja");

rmSync(out, { recursive: true, force: true });
const write = (path, data) => {
  const p = join(out, path);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, data);
};

/* ---- PNG (flat shapes) ---- */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A w×h RGBA PNG: `fill(x, y)` returns [r, g, b, a]. */
function png(w, h, fill) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const hue = (i, n, light = 0.6) => {
  const h = (i / n) * 6;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return [r, g, b].map((v) => Math.round((v * 0.5 + 0.5) * light * 255));
};

/* ---- IDs and text ---- */
const B32 = "0123456789abcdefghjkmnpqrstvwxyz";
let nextId = 0x2a3b4c; // anywhere in the space; consecutive IDs are fine
const lineId = () => {
  let n = nextId++;
  let s = "";
  for (let i = 0; i < 6; i++) {
    s = B32[n & 31] + s;
    n >>>= 5;
  }
  return s;
};
const WORDS = "summer lantern river festival rooftop letter promise morning station rain umbrella bicycle train window garden secret tomorrow notebook song star".split(" ");
let seed = 7;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const sentence = (k) => {
  const w = Array.from({ length: 6 + rnd(10) }, () => WORDS[rnd(WORDS.length)]);
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  const marks = [".", "!", "?", "..."];
  let s = `${w.join(" ")}${marks[k % 4]}`;
  if (k % 9 === 0) s = s.replace(/(\w+)/, "{b}$1{/b}");
  if (k % 13 === 0) s += " {w=300}Right.";
  return s;
};

/* ---- the project ---- */
const chars = Array.from({ length: ROUTES }, (_, i) => `c${String(i).padStart(2, "0")}`);
const bgs = Array.from({ length: BGS }, (_, i) => `place_${String(i).padStart(3, "0")}`);
const cgs = Array.from({ length: CGS }, (_, i) => `memory_${String(i).padStart(3, "0")}`);
const variables = {};
for (const c of chars) variables[`${c}_heart`] = { type: "int", default: 0, scope: "save" };
for (let i = 0; i < 40; i++) variables[`flag_${i}`] = { type: "bool", default: false, scope: "save" };
variables["cleared"] = { type: "int", default: 0, scope: "global" };

write(
  "himawari.json",
  JSON.stringify(
    {
      name: "Stress Test",
      id: "dev.moesoft.stress",
      version: "0.1.0",
      engine: "^1.1.0",
      resolution: [1920, 1080],
      sourceLanguage: "en",
      languages: ["en", LANG],
      entry: "prologue",
      variables,
    },
    null,
    2,
  ),
);
write("AGENTS.md", "# Stress test\nA generated project for performance tests. Don't edit by hand.\n");

const EXPR = ["neutral", "happy", "sad", "angry", "surprised"];
for (const [i, c] of chars.entries()) {
  write(
    `characters/${c}.md`,
    `---\nid: ${c}\nname: { en: "Character ${i}", ${LANG}: "キャラ${i}" }\ncolor: "#${hue(i, chars.length, 1).map((v) => v.toString(16).padStart(2, "0")).join("")}"\nsprite:\n  root: sprites/${c}\n  groups:\n    body: { always: true }\n    outfit: { default: school }\n    face: { default: neutral }\n  presets:\n${EXPR.map((e) => `    ${e}: { face: ${e} }`).join("\n")}\n---\n## Personality\nA generated character (route ${i}).\n`,
  );
  const [r, g, b] = hue(i, chars.length);
  write(`assets/sprites/${c}/body/base.png`, png(300, 500, (x, y) => (Math.hypot(x - 150, y - 120) < 90 || (y > 210 && Math.abs(x - 150) < 110) ? [r, g, b, 255] : [0, 0, 0, 0])));
  for (const o of ["school", "casual", "festival"]) write(`assets/sprites/${c}/outfit/${o}.png`, png(300, 500, (x, y) => (y > 260 && Math.abs(x - 150) < 112 ? [255 - r, g, b, 230] : [0, 0, 0, 0])));
  for (const [k, e] of EXPR.entries()) write(`assets/sprites/${c}/face/${e}.png`, png(300, 500, (x, y) => (Math.abs(y - 130 - k * 3) < 6 && Math.abs(x - 150) < 40 ? [30, 20, 20, 255] : [0, 0, 0, 0])));
}
for (const [i, n] of bgs.entries()) {
  const [r, g, b] = hue(i, bgs.length, 0.8);
  write(`assets/bg/${n}.png`, png(480, 270, (x, y) => (y > 170 ? [r >> 1, g >> 1, b >> 1, 255] : [r, g, b, 255])));
}
for (const [i, n] of cgs.entries()) {
  const [r, g, b] = hue(i, cgs.length, 0.9);
  write(`assets/cg/${n}.png`, png(480, 270, (x, y) => (Math.hypot(x - 240, y - 135) < 90 ? [255, 240, 220, 255] : [r, g, b, 255])));
}

const translations = [];
let total = 0;
/** One scene's statements; `next` is where it goes on. */
function scene(name, route, c, k, next, isLast) {
  const out = [`scene ${name}:`];
  const say = (who, text) => {
    const id = lineId();
    out.push(`    ${who ? `${who} ` : ""}"${text}"   #line:${id}`);
    translations.push({ id, source: text, text: `(${LANG}) ${text}`, status: "needs-review", provenance: "ai" });
    total++;
  };
  out.push(`    bg ${bgs[(route * 17 + k) % bgs.length]} with dissolve(400)`);
  out.push(`    show ${c} ${EXPR[k % EXPR.length]} at ${["left", "center", "right"][k % 3]} with fade(200)`);
  for (let i = 0; i < LINES; i++) {
    if (i === Math.floor(LINES / 2)) {
      const id = lineId();
      out.push(`    menu "What now?":   #line:${id}`);
      translations.push({ id, source: "What now?", text: `(${LANG}) What now?`, status: "needs-review", provenance: "ai" });
      const opts = [
        ["Stay a little longer.", `$ ${c}_heart += 1`],
        ["Head home.", `$ flag_${k % 40} = true`],
        [`once "Ask about tomorrow."`, `call aside_${route}`],
      ];
      for (const [label, body] of opts) {
        const oid = lineId();
        const text = label.startsWith("once") ? label : `"${label}"`;
        out.push(`        ${text}${k % 4 === 0 && !label.startsWith("once") ? ` if ${c}_heart >= 0` : ""}:   #line:${oid}`);
        const src = label.replace(/^once "|"$/g, "");
        translations.push({ id: oid, source: src, text: `(${LANG}) ${src}`, status: "needs-review", provenance: "ai" });
        out.push(`            ${body}`);
      }
      total += 4;
    } else if (i % 7 === 3) say(null, sentence(i + k));
    else if (i % 11 === 5) {
      out.push(`    ${c} ${EXPR[(i + k) % EXPR.length]} "${sentence(i * 3 + k)}"   #line:${lineId()}`);
      total++;
    } else say(i % 5 === 0 ? "me" : c, sentence(i + k * 7));
  }
  if (k % 5 === 4) out.push(`    cg ${cgs[(route * 5 + k) % cgs.length]} with dissolve(600)`);
  out.push(isLast ? "    $ cleared += 1\n    end" : `    jump ${next}`);
  return out.join("\n");
}

// The prologue: pick a route.
{
  const lines = ["scene prologue:", `    bg ${bgs[0]} with fade(500)`];
  const id = lineId();
  lines.push(`    menu "Whose story?":   #line:${id}`);
  for (let i = 0; i < chars.length; i++) {
    lines.push(`        "Route ${i}":   #line:${lineId()}`);
    lines.push(`            jump r${i}_f0_s0`);
  }
  total += 1 + chars.length;
  write("script/common/prologue.hws", `${lines.join("\n")}\n`);
}
for (const [r, c] of chars.entries()) {
  write(`script/common/aside_${r}.hws`, `scene aside_${r}:\n    ${c} "${sentence(r)}"   #line:${lineId()}\n    return\n`);
  total++;
  for (let f = 0; f < FILES; f++) {
    const scenes = [];
    for (let s = 0; s < SCENES; s++) {
      const last = f === FILES - 1 && s === SCENES - 1;
      const toEpilogue = last && r === 0 && BIG > 0; // route 0 goes on into the long epilogue file
      const next = toEpilogue ? "big_0" : s + 1 < SCENES ? `r${r}_f${f}_s${s + 1}` : `r${r}_f${f + 1}_s0`;
      scenes.push(scene(`r${r}_f${f}_s${s}`, r, c, f * SCENES + s, next, last && !toEpilogue));
    }
    write(`script/route_${String(r).padStart(2, "0")}_${c}/chapter_${String(f + 1).padStart(2, "0")}.hws`, `${scenes.join("\n\n")}\n`);
  }
}
// One very large file (some writers keep a whole route in one file); route 0's ending leads into it.
if (BIG > 0) {
  const per = 40;
  const n = Math.ceil(BIG / per);
  const scenes = [];
  for (let s = 0; s < n; s++) {
    scenes.push(scene(`big_${s}`, 0, chars[0], s, `big_${s + 1}`, s === n - 1));
  }
  write("script/epilogue_long.hws", `${scenes.join("\n\n")}\n`);
}
write("locales/" + LANG + ".json", JSON.stringify({ language: LANG, sourceLanguage: "en", lines: translations }, null, 2) + "\n");
console.log(`${out}: ${total} lines, ${chars.length} routes, ${bgs.length + cgs.length + chars.length * 9} images, ${translations.length} translations`);
