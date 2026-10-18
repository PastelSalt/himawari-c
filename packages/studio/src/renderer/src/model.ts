/**
 * What Studio derives from the project's text with Core (the one parser):
 * the whole-project check (diagnostics, characters, manifest, refs) and an
 * index of line IDs, so the preview's current line maps to a file position.
 */
import { type Diagnostic, LineIndex, type ProjectCheck, type Stmt, checkProject } from "@himawari/core";

export interface LineLocation {
  file: string;
  scene: string;
  start: number;
  end: number;
  kind: "say" | "narration" | "prompt" | "option" | "call";
}

export interface SceneLocation {
  id: string;
  file: string;
  start: number;
}

export interface ProjectModel {
  check: ProjectCheck;
  lines: Map<string, LineLocation>;
  scenes: SceneLocation[];
  errors: number;
  warnings: number;
}

export const isScript = (f: string) => f.startsWith("script/") && f.endsWith(".hws");
export const isCharacter = (f: string) => f.startsWith("characters/") && f.endsWith(".md");
export const isLocale = (f: string) => f.startsWith("locales/") && f.endsWith(".json");
export const isExtension = (f: string) => f.startsWith("extensions/") && f.endsWith(".schema.json");

export function buildModel(files: Record<string, string>, assets: string[]): ProjectModel {
  const pick = (test: (f: string) => boolean) =>
    Object.keys(files)
      .filter(test)
      .sort()
      .map((file) => ({ file, text: files[file]! }));
  const manifest = files["himawari.json"];
  const check = checkProject({
    ...(manifest !== undefined ? { manifest: { file: "himawari.json", text: manifest } } : {}),
    characters: pick(isCharacter),
    scripts: pick(isScript),
    assets,
    locales: pick(isLocale),
    extensions: pick(isExtension),
    ...(files["theme/theme.json"] !== undefined ? { theme: { file: "theme/theme.json", text: files["theme/theme.json"] } } : {}),
  });
  const lines = new Map<string, LineLocation>();
  const scenes: SceneLocation[] = [];
  for (const [file, r] of check.parsed) {
    for (const scene of r.ast.scenes) {
      scenes.push({ id: scene.id, file, start: scene.span.start });
      const visit = (body: Stmt[]) => {
        for (const s of body) {
          if ((s.kind === "Say" || s.kind === "Narration") && s.lineId) {
            lines.set(s.lineId, { file, scene: scene.id, start: s.span.start, end: s.span.end, kind: s.kind === "Say" ? "say" : "narration" });
          } else if (s.kind === "Invoke" && s.lineId) {
            lines.set(s.lineId, { file, scene: scene.id, start: s.span.start, end: s.span.end, kind: "call" });
          } else if (s.kind === "Menu") {
            if (s.promptLineId) lines.set(s.promptLineId, { file, scene: scene.id, start: s.span.start, end: s.span.start, kind: "prompt" });
            for (const o of s.options) {
              if (o.lineId) lines.set(o.lineId, { file, scene: scene.id, start: o.span.start, end: o.span.start, kind: "option" });
              visit(o.body);
            }
          } else if (s.kind === "If") {
            for (const c of s.clauses) visit(c.body);
          }
        }
      };
      visit(scene.body);
    }
  }
  let errors = 0;
  let warnings = 0;
  for (const f of check.files) {
    for (const d of f.diagnostics) {
      if (d.severity === "error") errors++;
      else if (d.severity === "warning") warnings++;
    }
  }
  return { check, lines, scenes, errors, warnings };
}

/** 1-based line and column of an offset. */
export function positionOf(source: string, offset: number): { line: number; col: number } {
  return new LineIndex(source).at(offset);
}

export function diagnosticsOf(model: ProjectModel | null, file: string): Diagnostic[] {
  return model?.check.files.find((f) => f.file === file)?.diagnostics ?? [];
}
