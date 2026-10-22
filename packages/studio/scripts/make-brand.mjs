// Makes Studio's icon and logo images from the art in branding/ (Moeko Works' originals).
// Run it after the art changes and commit what it writes:
//
//   node packages/studio/scripts/make-brand.mjs
//
// Writes packages/studio/icons/studio.ico (the exe, window, and installer icon, 16–256 px),
// packages/studio/src/renderer/src/brand/*.png (the logos, at twice their on-screen size), and
// docs/images/*-logo-dark.png (the README's logos on a light card, for GitHub's dark theme).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const studio = fileURLToPath(new URL("..", import.meta.url));
const art = join(studio, "..", "..", "branding");

// --- PNG (8-bit, non-interlaced; the art is RGBA) ---

function decode(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8, w = 0, h = 0, type = 0, depth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = v.getUint32(pos);
    const tag = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    if (tag === "IHDR") [w, h, depth, type, interlace] = [v.getUint32(pos + 8), v.getUint32(pos + 12), buf[pos + 16], buf[pos + 17], buf[pos + 20]];
    else if (tag === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const ch = { 2: 3, 6: 4 }[type];
  if (depth !== 8 || interlace || !ch) throw new Error("the art must be 8-bit RGB or RGBA PNG, not interlaced");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      cur[x] = (line[x] + pred) & 255;
    }
    for (let x = 0; x < w; x++) {
      out.set(cur.subarray(x * ch, x * ch + 3), (y * w + x) * 4);
      out[(y * w + x) * 4 + 3] = ch === 4 ? cur[x * ch + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, rgba: out };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(tag, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(tag, 4, "ascii");
  data.copy(out, 8);
  let c = 0xffffffff;
  for (const b of out.subarray(4, 8 + data.length)) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}
function encode({ w, h, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// --- Cropping and resizing ---

/** The art's visible part (alpha above a trace), padded by `pad` of its larger side and made `square` if asked. */
function trim(img, pad, square = false) {
  let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.rgba[(y * img.w + x) * 4 + 3] > 8) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  let w = x1 - x0 + 1, h = y1 - y0 + 1;
  const p = Math.round(Math.max(w, h) * pad);
  let cx = x0 - p, cy = y0 - p;
  w += 2 * p;
  h += 2 * p;
  if (square) {
    const s = Math.max(w, h);
    cx -= Math.floor((s - w) / 2);
    cy -= Math.floor((s - h) / 2);
    w = h = s;
  }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + cx, sy = y + cy;
      if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) out.set(img.rgba.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { w, h, rgba: out };
}

/** Area-average downscale, weighted by alpha so edges don't darken. */
function resize(img, nw, nh) {
  const out = new Uint8Array(nw * nh * 4);
  const sx = img.w / nw, sy = img.h / nh;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const [xa, xb, ya, yb] = [x * sx, (x + 1) * sx, y * sy, (y + 1) * sy];
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
          const wgt = (Math.min(xb, xx + 1) - Math.max(xa, xx)) * (Math.min(yb, yy + 1) - Math.max(ya, yy));
          const i = (yy * img.w + xx) * 4, al = (img.rgba[i + 3] / 255) * wgt;
          [r, g, b, a, area] = [r + img.rgba[i] * al, g + img.rgba[i + 1] * al, b + img.rgba[i + 2] * al, a + al, area + wgt];
        }
      }
      const o = (y * nw + x) * 4;
      if (a > 0) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a)], o);
      out[o + 3] = Math.round((a / area) * 255);
    }
  }
  return { w: nw, h: nh, rgba: out };
}
const toWidth = (img, w) => resize(img, w, Math.round((img.h * w) / img.w));

/** The art on a rounded light card, so its black outlines and dark lettering read on dark pages. */
function onCard(img, pad, radius, [cr, cg, cb]) {
  const w = img.w + 2 * pad, h = img.h + 2 * pad;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Coverage of the rounded corner, antialiased over about one pixel.
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (w - radius), 0), dy = Math.max(radius - y - 0.5, y + 0.5 - (h - radius), 0);
      const card = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(dx, dy)));
      const sx = x - pad, sy = y - pad, i = (y * w + x) * 4;
      const a = sx >= 0 && sy >= 0 && sx < img.w && sy < img.h ? img.rgba[(sy * img.w + sx) * 4 + 3] / 255 : 0;
      const s = (sy * img.w + sx) * 4;
      out[i] = Math.round(a > 0 ? img.rgba[s] * a + cr * (1 - a) : cr);
      out[i + 1] = Math.round(a > 0 ? img.rgba[s + 1] * a + cg * (1 - a) : cg);
      out[i + 2] = Math.round(a > 0 ? img.rgba[s + 2] * a + cb * (1 - a) : cb);
      out[i + 3] = Math.round(card * 255);
    }
  }
  return { w, h, rgba: out };
}

/** An .ico with one PNG image per size (Windows Vista and later). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let at = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = size === 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(at, e + 12);
    at += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.png)]);
}

const read = (name) => decode(readFileSync(join(art, name)));
const flowers = trim(read("himawari-flowers.png"), 0.02, true);
const icons = join(studio, "icons");
const brand = join(studio, "src", "renderer", "src", "brand");
mkdirSync(icons, { recursive: true });
mkdirSync(brand, { recursive: true });

writeFileSync(join(icons, "studio.ico"), ico([256, 128, 64, 48, 40, 32, 24, 20, 16].map((size) => ({ size, png: encode(resize(flowers, size, size)) }))));
writeFileSync(join(brand, "flowers.png"), encode(resize(flowers, 192, 192)));
writeFileSync(join(brand, "himawari-studio.png"), encode(toWidth(trim(read("himawari-studio-logo.png"), 0.01), 880)));
writeFileSync(join(brand, "moeko-works.png"), encode(toWidth(trim(read("moeko-works-logo.png"), 0.01), 480)));
// The same cream as Studio's dark-theme --brand-surface.
const CREAM = [0xfb, 0xf6, 0xec];
const docs = join(studio, "..", "..", "docs", "images");
mkdirSync(docs, { recursive: true });
writeFileSync(join(docs, "himawari-studio-logo-dark.png"), encode(onCard(toWidth(trim(read("himawari-studio-logo.png"), 0.01), 1160), 40, 28, CREAM)));
writeFileSync(join(docs, "moeko-works-logo-dark.png"), encode(onCard(toWidth(trim(read("moeko-works-logo.png"), 0.01), 400), 20, 16, CREAM)));
console.log("✓ icons/studio.ico, src/renderer/src/brand/*.png, and docs/images/*-logo-dark.png");
