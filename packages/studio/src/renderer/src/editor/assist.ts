/**
 * Script view assistance from the project model (plan §11.3): completion,
 * hover (character colors, asset thumbnails), and the reference under the
 * cursor for go-to-definition (F12, Ctrl+click) and rename (F2).
 */
import { DEFAULT_POSITIONS, type Ref, characterWords } from "@himawari/core";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { type EditorView, type Tooltip, hoverTooltip } from "@codemirror/view";
import type { ProjectModel } from "../model";

const STATEMENTS = ["show", "hide", "move", "bg", "cg", "music", "ambient", "sfx", "voice", "stop", "wait", "shake", "flash", "menu", "if", "elif", "else", "jump", "call", "return", "end", "scene"];
const TRANSITIONS = ["fade", "dissolve", "slide_left", "slide_right", "slide_up", "slide_down", "wipe", "rule"];
const ASSET_FOLDERS: Record<string, string> = { bg: "bg", cg: "cg", music: "music", ambient: "ambient", sfx: "sfx", voice: "voice" };
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i;

function assetNames(model: ProjectModel, assets: string[], folder: string): string[] {
  void model;
  const names = new Set<string>();
  for (const a of assets) {
    if (!a.startsWith(`${folder}/`)) continue;
    names.add(a.slice(folder.length + 1).replace(/\.[^./]+$/, ""));
  }
  return [...names].sort();
}

/** Completion source: what makes sense at the cursor, from the project. */
export function completions(get: () => { model: ProjectModel | null; assets: string[] }) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const { model, assets } = get();
    if (!model) return null;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    if (/"[^"]*$/.test(before.replace(/"[^"]*"/g, ""))) return null; // inside a string
    const word = ctx.matchBefore(/[a-z_][a-z0-9_]*$/);
    const from = word ? word.from : ctx.pos;
    if (!word && !ctx.explicit && !/\s$/.test(before)) return null;
    const head = before.slice(0, from - line.from).trimStart();
    const chars = [...model.check.characters.values()];
    const scenes = [...new Set(model.scenes.map((s) => s.id))];
    const variables = Object.keys(model.check.manifest?.variables ?? {});
    const positions = Object.keys(model.check.manifest?.positions ?? DEFAULT_POSITIONS);
    let options: Completion[] = [];

    const m = /^(\w+)\s+(?:(\w+)\s+)?(?:[-\w]+\s+)*$/.exec(head);
    if (head === "") {
      options = [
        ...STATEMENTS.map((label) => ({ label, type: "keyword" })),
        ...chars.map((c) => ({ label: c.id, type: "variable", detail: c.displayName })),
      ];
    } else if (/\bat\s+$/.test(head)) {
      options = positions.map((label) => ({ label, type: "constant" }));
    } else if (/\bwith\s+$/.test(head)) {
      options = TRANSITIONS.map((label) => ({ label, type: "function" }));
    } else if (/^(jump|call)\s+$/.test(head)) {
      options = scenes.map((label) => ({ label, type: "class" }));
    } else if (/^(\$|if|elif)\s/.test(head) || /^\$\s*$/.test(head)) {
      options = variables.map((label) => ({ label, type: "variable" }));
    } else if (m && m[1] && ASSET_FOLDERS[m[1]] && !m[2]) {
      options = assetNames(model, assets, ASSET_FOLDERS[m[1]]!).map((label) => ({ label, type: "text" }));
    } else if (m && m[1] && ["show", "hide", "move"].includes(m[1]) && !m[2]) {
      options = chars.map((c) => ({ label: c.id, type: "variable", detail: c.displayName }));
    } else if (m) {
      // After a character: its attributes and presets (show hana smile …, hana smile "…").
      const id = m[1] === "show" ? m[2] : m[1];
      const c = id ? model.check.characters.get(id) : undefined;
      if (c) options = [...characterWords(c)].sort().map((label) => ({ label, type: "property" }));
      if (m[1] === "show") options.push({ label: "at", type: "keyword" }, { label: "with", type: "keyword" });
    }
    if (options.length === 0) return null;
    return { from, options, validFor: /^[a-z_][a-z0-9_]*$/ };
  };
}

/** The reference under a position in the open file. */
export function refAt(model: ProjectModel | null, file: string, pos: number): Ref | null {
  const r = model?.check.parsed.get(file);
  if (!r) return null;
  return r.refs.find((ref) => pos >= ref.span.start && pos <= ref.span.end) ?? null;
}

export function hover(get: () => { model: ProjectModel | null; file: string; assets: string[]; t: (id: string, values?: Record<string, string>) => string }) {
  return hoverTooltip((_view: EditorView, pos: number): Tooltip | null => {
    const { model, file, assets, t } = get();
    const ref = refAt(model, file, pos);
    if (!ref || !model) return null;
    const make = (build: (dom: HTMLElement) => void): Tooltip => ({
      pos: ref.span.start,
      end: ref.span.end,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "hw-hover";
        build(dom);
        return { dom };
      },
    });
    if (ref.kind === "speaker" || ref.kind === "character") {
      const c = model.check.characters.get(ref.name);
      if (!c) return null;
      return make((dom) => {
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = c.color ?? "#888";
        const name = document.createElement("strong");
        name.textContent = c.displayName;
        const words = document.createElement("div");
        words.className = "muted small";
        words.textContent = t("hover.expressions", { list: [...characterWords(c)].sort().join(", ") });
        dom.append(sw, name, words);
      });
    }
    if (ref.kind === "asset" && ref.channel && ["bg", "cg"].includes(ref.channel)) {
      const hit = assets.find((a) => a.startsWith(`${ref.channel}/${ref.name}.`) && IMAGE.test(a));
      return make((dom) => {
        if (hit) {
          const img = document.createElement("img");
          img.src = `himawari-asset://project/${hit.split("/").map(encodeURIComponent).join("/")}`;
          img.className = "hw-hover-image";
          dom.append(img);
        } else {
          dom.textContent = t("hover.placeholder", { name: ref.name });
        }
      });
    }
    if (ref.kind === "scene") {
      const s = model.scenes.find((x) => x.id === ref.name);
      return make((dom) => {
        dom.textContent = s ? t("hover.scene", { file: s.file }) : t("hover.noScene");
      });
    }
    return null;
  });
}
