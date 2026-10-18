/**
 * Reading layered art for a sprite (plan §6.4): Photoshop .psd (ag-psd) and
 * OpenRaster .ora (Krita's native export: a zip of PNGs plus stack.xml).
 * Convention: top-level groups → sprite groups, their layers → attributes;
 * `[always]`, `[default]`, `[multiple]` in names set flags. There is no
 * standard for this, so the result goes through a mapping preview first.
 */
import { readPsd } from "ag-psd";
import { unzipSync } from "fflate";

export interface ImportLayer {
  name: string;
  /** Attribute name as it will be written ([a-z0-9_]). */
  attr: string;
  isDefault: boolean;
  include: boolean;
  image: CanvasImageSource;
  x: number;
  y: number;
}

export interface ImportGroup {
  name: string;
  always: boolean;
  multiple: boolean;
  layers: ImportLayer[];
}

export interface ImportDoc {
  width: number;
  height: number;
  /** Bottom to top. */
  groups: ImportGroup[];
}

/** A file-safe identifier from a layer name, with markers removed. */
export function cleanName(raw: string): string {
  const s = raw
    .replace(/\[(always|default|multiple)\]/gi, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return "layer";
  return /^[a-z_]/.test(s) ? s : `_${s}`;
}

const marker = (raw: string, m: string) => raw.toLowerCase().includes(`[${m}]`);

function group(name: string, layers: { name: string; image: CanvasImageSource; x: number; y: number; hidden: boolean }[]): ImportGroup {
  const g: ImportGroup = {
    name: cleanName(name),
    always: marker(name, "always") || layers.length === 1,
    multiple: marker(name, "multiple"),
    layers: layers.map((l) => ({ name: l.name, attr: cleanName(l.name), isDefault: marker(l.name, "default"), include: true, image: l.image, x: l.x, y: l.y })),
  };
  if (!g.always && !g.multiple && !g.layers.some((l) => l.isDefault)) {
    const visible = layers.findIndex((l) => !l.hidden);
    const pick = g.layers[visible >= 0 ? visible : 0];
    if (pick) pick.isDefault = true;
  }
  return g;
}

export function readPsdFile(bytes: Uint8Array): ImportDoc {
  const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { skipCompositeImageData: true, skipThumbnail: true });
  const groups: ImportGroup[] = [];
  for (const top of psd.children ?? []) {
    if (top.children) {
      const layers = top.children
        .filter((l) => l.canvas && !l.children)
        .map((l) => ({ name: l.name ?? "layer", image: l.canvas!, x: l.left ?? 0, y: l.top ?? 0, hidden: l.hidden === true }));
      if (layers.length > 0) groups.push(group(top.name ?? "group", layers));
    } else if (top.canvas) {
      // A loose layer is a group of its own with one attribute (a body base, say).
      groups.push(group(`${top.name ?? "layer"} [always]`, [{ name: "base", image: top.canvas, x: top.left ?? 0, y: top.top ?? 0, hidden: top.hidden === true }]));
    }
  }
  return { width: psd.width, height: psd.height, groups };
}

export async function readOraFile(bytes: Uint8Array): Promise<ImportDoc> {
  const files = unzipSync(bytes);
  const xml = files["stack.xml"];
  if (!xml) throw new Error("stack.xml is missing");
  const dom = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const image = dom.querySelector("image");
  if (!image) throw new Error("stack.xml has no <image>");
  const load = async (src: string | null) => {
    const data = src ? files[src] : undefined;
    if (!data) return null;
    return createImageBitmap(new Blob([data.slice()], { type: "image/png" }));
  };
  const layerOf = async (el: Element) => {
    const bmp = await load(el.getAttribute("src"));
    return bmp ? { name: el.getAttribute("name") ?? "layer", image: bmp, x: Number(el.getAttribute("x") ?? 0), y: Number(el.getAttribute("y") ?? 0), hidden: el.getAttribute("visibility") === "hidden" } : null;
  };
  const root = image.querySelector(":scope > stack");
  const groups: ImportGroup[] = [];
  // OpenRaster lists the topmost element first; sprite groups go bottom to top.
  for (const el of [...(root?.children ?? [])].reverse()) {
    if (el.tagName === "stack") {
      const layers = [];
      for (const child of [...el.children].reverse()) {
        if (child.tagName !== "layer") continue;
        const l = await layerOf(child);
        if (l) layers.push(l);
      }
      if (layers.length > 0) groups.push(group(el.getAttribute("name") ?? "group", layers));
    } else if (el.tagName === "layer") {
      const l = await layerOf(el);
      if (l) groups.push(group(`${l.name} [always]`, [{ ...l, name: "base" }]));
    }
  }
  return { width: Number(image.getAttribute("w") ?? 0), height: Number(image.getAttribute("h") ?? 0), groups };
}

/** One layer as a full-canvas PNG (every layer of a sprite shares one canvas, plan §6.2). */
export async function layerPng(doc: ImportDoc, layer: ImportLayer): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(doc.width, doc.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
  ctx.drawImage(layer.image, layer.x, layer.y);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}
