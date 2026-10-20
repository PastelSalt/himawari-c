/**
 * The exported game's exe looks like the game's own (plan §14.4, FINALIZATION.md
 * D-4): its name, version, and "Made with Himawari" in the file's properties,
 * and the game's icon (assets/icon.png). Pure JavaScript (resedit), so exports
 * need no compiler and stay reproducible.
 */
import * as ResEdit from "resedit";

export interface Branding {
  title: string;
  /** The exe's file name, e.g. "Sunflower Days.exe". */
  fileName: string;
  /** "1.2.0" (himawari.json `version`). */
  version: string;
  /** A square PNG, at most 256×256 (Windows keeps PNG icons as they are). */
  iconPng?: Uint8Array;
}

/** A PNG's size from its header, or null when it isn't a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || !sig.every((b, i) => png[i] === b)) return null;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** An .ico holding one PNG image (Windows Vista and later read PNG icons directly). */
export function pngToIco(png: Uint8Array): Uint8Array {
  const size = pngSize(png);
  if (!size) throw new Error("the icon must be a PNG image");
  if (size.width > 256 || size.height > 256) throw new Error(`the icon is ${size.width}×${size.height}; make it 256×256 or smaller`);
  const out = new Uint8Array(6 + 16 + png.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true); // reserved
  v.setUint16(2, 1, true); // icon
  v.setUint16(4, 1, true); // one image
  out[6] = size.width === 256 ? 0 : size.width;
  out[7] = size.height === 256 ? 0 : size.height;
  out[8] = 0; // no palette
  out[9] = 0;
  v.setUint16(10, 1, true); // planes
  v.setUint16(12, 32, true); // bits per pixel
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true); // offset of the image
  out.set(png, 22);
  return out;
}

const LANG_EN_US = 1033;

/** The runtime exe with the game's name, version, credit note, and (optionally) icon. */
export function brandExe(exe: Uint8Array, b: Branding): Uint8Array {
  const nt = ResEdit.NtExecutable.from(exe, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(nt);
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  const [major = 0, minor = 0, micro = 0] = b.version.split(".").map((n) => Number.parseInt(n, 10) || 0);
  vi.setFileVersion(major, minor, micro, 0, LANG_EN_US);
  vi.setProductVersion(major, minor, micro, 0, LANG_EN_US);
  vi.setStringValues(
    { lang: LANG_EN_US, codepage: 1200 },
    {
      FileDescription: b.title,
      ProductName: b.title,
      InternalName: b.title,
      OriginalFilename: b.fileName,
      FileVersion: b.version,
      ProductVersion: b.version,
      // Always in the file's properties, never in the player's way (crediting Himawari in the game is optional, D60).
      Comments: "Made with Himawari",
    },
  );
  vi.outputToResourceEntries(res.entries);
  if (b.iconPng) {
    const ico = ResEdit.Data.IconFile.from(pngToIco(b.iconPng));
    const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group?.id ?? 1,
      group?.lang ?? LANG_EN_US,
      ico.icons.map((i) => i.data),
    );
  }
  res.outputResource(nt);
  return new Uint8Array(nt.generate());
}
