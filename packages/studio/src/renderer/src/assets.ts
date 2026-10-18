/** Project assets as the renderer sees them: through the himawari-asset:// protocol, limited to assets/. */

export const IMAGE_EXT = /\.(png|jpe?g|webp|bmp)$/i;
export const AUDIO_EXT = /\.(ogg|opus|wav|mp3|flac)$/i;

/** The URL of a file under assets/ (path relative to assets/). */
export function assetUrl(path: string, version?: number): string {
  const url = `himawari-asset://project/${path.split("/").map(encodeURIComponent).join("/")}`;
  return version ? `${url}?v=${version}` : url;
}

/** The first image under `folder` named `name` (any image extension), relative to assets/. */
export function findImage(assets: readonly string[], folder: string, name: string): string | null {
  const prefix = `${folder}/${name}.`;
  return assets.find((a) => a.startsWith(prefix) && IMAGE_EXT.test(a) && !a.slice(prefix.length).includes("/")) ?? null;
}

/** Asset names (without extension) in a folder, e.g. bg → ["park", "school"]. */
export function namesIn(assets: readonly string[], folder: string): string[] {
  const out = new Set<string>();
  for (const a of assets) {
    if (!a.startsWith(`${folder}/`)) continue;
    const rest = a.slice(folder.length + 1);
    if (!rest.includes("/")) out.add(rest.replace(/\.[^.]+$/, ""));
  }
  return [...out].sort();
}
