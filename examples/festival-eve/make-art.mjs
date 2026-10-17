// Procedural layers for Hana and Ren (plan §6.2 folder convention). Simple
// shapes only: placeholders are procedural, never AI-generated (plan §1.5).
// Run from this folder: node make-art.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 400;
const H = 900;

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function png(rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function layer(draw) {
  const px = Buffer.alloc(W * H * 4);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, c);
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, c);
  };
  draw({ ellipse, rect });
  return png(px);
}

const SKIN = [250, 222, 200];
const INK = [55, 38, 48];
const LIP = [160, 60, 70];

function character(id, { hair, longHair, yukata, sash, accessory }) {
  const files = {
    "body/base": ({ ellipse, rect }) => {
      if (longHair) rect(95, 150, 305, 520, hair);
      rect(170, 300, 230, 360, SKIN);
      ellipse(200, 210, 110, 125, SKIN);
      ellipse(200, 118, 124, 82, hair);
      rect(110, 350, 290, 900, SKIN);
    },
    "outfit/yukata": ({ rect }) => {
      rect(100, 360, 300, 900, yukata);
      rect(100, 520, 300, 580, sash);
    },
    "eyes/neutral": ({ ellipse }) => {
      ellipse(160, 215, 13, 19, INK);
      ellipse(240, 215, 13, 19, INK);
    },
    "eyes/neutral_half": ({ rect }) => {
      rect(147, 213, 174, 224, INK);
      rect(227, 213, 254, 224, INK);
    },
    "eyes/neutral_closed": ({ rect }) => {
      rect(145, 219, 176, 224, INK);
      rect(225, 219, 256, 224, INK);
    },
    "eyes/smile": ({ ellipse, rect }) => {
      ellipse(160, 222, 16, 10, INK);
      ellipse(240, 222, 16, 10, INK);
      rect(140, 222, 180, 236, SKIN);
      rect(220, 222, 260, 236, SKIN);
    },
    "eyes/sad": ({ ellipse, rect }) => {
      ellipse(160, 220, 12, 14, INK);
      ellipse(240, 220, 12, 14, INK);
      rect(142, 192, 178, 197, INK);
      rect(222, 192, 258, 197, INK);
    },
    "mouth/neutral": ({ rect }) => rect(185, 272, 215, 277, INK),
    "mouth/neutral_open": ({ ellipse }) => ellipse(200, 276, 13, 9, LIP),
    "mouth/smile": ({ ellipse, rect }) => {
      ellipse(200, 268, 22, 14, INK);
      rect(170, 250, 230, 268, SKIN);
    },
    "mouth/smile_open": ({ ellipse }) => ellipse(200, 274, 22, 14, LIP),
    "mouth/frown": ({ ellipse, rect }) => {
      ellipse(200, 284, 18, 11, INK);
      rect(175, 284, 225, 300, SKIN);
    },
    "mouth/frown_open": ({ ellipse }) => ellipse(200, 280, 11, 8, LIP),
    ...accessory,
  };
  for (const [name, draw] of Object.entries(files)) {
    mkdirSync(`assets/sprites/${id}/${name.split("/")[0]}`, { recursive: true });
    writeFileSync(`assets/sprites/${id}/${name}.png`, layer(draw));
  }
  return Object.keys(files).length;
}

let n = 0;
n += character("hana", {
  hair: [70, 40, 35],
  longHair: true,
  yukata: [235, 150, 160],
  sash: [200, 60, 80],
  accessory: { "accessories/hairpin": ({ ellipse }) => ellipse(285, 120, 18, 18, [250, 210, 70]) },
});
n += character("ren", {
  hair: [30, 30, 40],
  longHair: false,
  yukata: [70, 90, 140],
  sash: [40, 50, 70],
  accessory: {
    "accessories/glasses": ({ rect }) => {
      rect(140, 200, 182, 204, INK);
      rect(218, 200, 260, 204, INK);
      rect(182, 206, 218, 209, INK);
    },
  },
});
console.log(`wrote ${n} layers to assets/sprites/`);
