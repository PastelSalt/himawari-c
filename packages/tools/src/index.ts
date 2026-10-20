/**
 * @himawari/tools: the AI tool registry (plan §10.3, §10.9). TOOLS is listed
 * in a fixed order (reads, then writes, then execs) so clients can cache the
 * tool list (plan §10.1).
 */
import { addNote, listNotes, resolveNote } from "./tools/notes.js";
import type { ToolDef } from "./registry.js";
import { build, playtest, renderLine } from "./tools/exec.js";
import {
  analyze,
  getCharacter,
  getStoryGraph,
  listAssets,
  listCharacters,
  listScenes,
  listVariables,
  projectInfo,
  readScene,
  searchDialogue,
  validate,
} from "./tools/read.js";
import {
  createScene,
  declareVariable,
  patchScene,
  rename,
  setPreset,
  setTranslation,
  updateScene,
  upsertCharacter,
} from "./tools/write.js";

export const TOOLS: readonly ToolDef[] = [
  projectInfo,
  listScenes,
  readScene,
  searchDialogue,
  getStoryGraph,
  listCharacters,
  getCharacter,
  listVariables,
  listAssets,
  validate,
  analyze,
  createScene,
  updateScene,
  patchScene,
  upsertCharacter,
  setPreset,
  declareVariable,
  rename,
  setTranslation,
  addNote,
  listNotes,
  resolveNote,
  playtest,
  renderLine,
  build,
] as unknown as readonly ToolDef[];

export * from "./registry.js";
export { ProjectFs, SandboxError } from "./fs.js";
export { check, describeDiagnostics, diagnosticsJson, findScene, imageSizes, loadInput, revisionOf, type DiagnosticJson } from "./project.js";
export { PROVENANCE_FILE, provenanceNow, readProvenance, stampAi, textHash, type ProvenanceFile } from "./provenance.js";
export { findRuntime, runRuntime } from "./runtime.js";
export { compileProject, packageGame, safeName } from "./package.js";
export { TEMPLATES, initProject, projectId, readTemplate, renderTemplate, templatesDir, type InitOptions, type TemplateName } from "./init.js";
export { RECIPES, expandCommand, type Recipe, type RecipeArg } from "./recipes.js";
