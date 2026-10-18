import { type SpriteDef, type SpriteState, applySpriteWords, spriteLayers } from "@himawari/core";
import { assetUrl, findImage } from "../assets";
import { useStudio } from "../store";

export interface Frames {
  /** Blink frame for groups marked blink: "half" or "closed". */
  blink?: "half" | "closed" | null;
  /** Lip-flap frame for groups marked lipflap. */
  mouth?: "open" | null;
}

/**
 * A character's layered sprite, composed the way the runtime does (Core's
 * `spriteLayers`): every layer is a full-canvas image stacked bottom to top.
 * Missing art shows a silhouette in the character's color (P5).
 */
export function SpriteView({ sprite, state, color, size, frames }: { sprite: SpriteDef; state: SpriteState; color: string | null; size: number; frames?: Frames }) {
  const assets = useStudio((s) => s.assets);
  const layers = spriteLayers(sprite, state);
  const images = layers
    .map((l) => {
      const group = sprite.groups.find((g) => g.name === l.group);
      const folder = `${sprite.root}/${l.group}`;
      const frame = group?.blink ? frames?.blink : group?.lipflap ? frames?.mouth : null;
      return (frame ? findImage(assets, folder, `${l.attr}_${frame}`) : null) ?? findImage(assets, folder, l.attr);
    })
    .filter((x): x is string => x !== null);
  return (
    <div className="sprite-view" style={{ width: size, height: size }}>
      {images.length === 0 ? (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          <circle cx="50" cy="34" r="18" fill={color ?? "#888"} opacity="0.85" />
          <path d="M18 100 C18 66 82 66 82 100 Z" fill={color ?? "#888"} opacity="0.85" />
        </svg>
      ) : (
        images.map((src) => <img key={src} src={assetUrl(src)} alt="" draggable={false} />)
      )}
    </div>
  );
}

/** A small composite for a character id and words (expression menus, lists). */
export function SpriteThumb({ character, attrs, size, frames }: { character: string; attrs: string[]; size: number; frames?: Frames }) {
  const c = useStudio((s) => s.model?.check.characters.get(character));
  if (!c?.sprite) return null;
  return <SpriteView sprite={c.sprite} state={applySpriteWords(c.sprite, [], attrs)} color={c.color} size={size} {...(frames ? { frames } : {})} />;
}
