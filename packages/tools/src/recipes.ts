/**
 * Recipes (plan §10.4, §10.9; Phase 7): the instructions behind himawari-mcp's
 * prompts and the Studio assistant's slash commands, written once. Each one
 * says which tools to use, and that findings become review notes or proposals
 * rather than silent edits.
 */

export interface RecipeArg {
  name: string;
  description: string;
  required: boolean;
}

export interface Recipe {
  /** The MCP prompt name. */
  name: string;
  /** The assistant's slash command (without the slash). */
  command: string;
  title: string;
  description: string;
  /** In slash-command order: the required ones, the last taking the rest of the line. */
  args: readonly RecipeArg[];
  prompt(args: Readonly<Record<string, string | undefined>>): string;
}

const arg = (name: string, description: string, required = true): RecipeArg => ({ name, description, required });

export const RECIPES: readonly Recipe[] = [
  {
    name: "write_scene",
    command: "write",
    title: "Write a scene",
    description: "Draft a new scene from a premise, in the project's voice.",
    args: [arg("premise", "What happens in the scene"), arg("scene", "The new scene's name", false)],
    prompt: (a) =>
      `Write a new scene${a["scene"] ? ` named ${a["scene"]}` : ""} for this visual novel. Premise: ${a["premise"] ?? ""}\n\nFirst call project_info, read AGENTS.md (himawari://project/agents-md), and get_character for everyone who speaks, respecting their "Must never" rules. Use only existing presets and positions. Create it with create_scene (dry_run first), fix any diagnostics, then playtest. Explain the result in one sentence.`,
  },
  {
    name: "continuity_check",
    command: "continuity",
    title: "Continuity check",
    description: "Look for contradictions with the character bibles and earlier scenes, and leave review notes.",
    args: [arg("scene", "The scene to check")],
    prompt: (a) =>
      `Check scene ${a["scene"] ?? ""} for continuity. Read it (read_scene), the scenes that lead to it (get_story_graph with scene: ${a["scene"] ?? ""}), and each speaker's bible (get_character). Call analyze for the engine's own continuity hints (a character speaking after being hidden, variables set but never read, or used in conditions but never set). Look for contradictions: facts, names, relationships, speech style, "Must never" rules, and variables used inconsistently.\n\nFor each real finding, call add_note (kind "continuity", or "character" for a bible problem) anchored on the line ID, saying what contradicts what. Call list_notes first and don't repeat an open note. Don't edit the script. Finish with a short summary: how many notes, and the most important one.`,
  },
  {
    name: "branch_planner",
    command: "branches",
    title: "Plan branches",
    description: "Propose routes and choices for a chapter.",
    args: [arg("goal", "What the branching should achieve")],
    prompt: (a) =>
      `Plan the branching for: ${a["goal"] ?? ""}\n\nRead get_story_graph and list_variables first. Propose routes, the choices that split them, the variables they need (declare_variable), and how each route reaches an ending. Keep it a plan until the user agrees; then write it with create_scene and check with playtest that every ending is reached.`,
  },
  {
    name: "translate_scene",
    command: "translate",
    title: "Translate a scene",
    description: "Translate a scene's lines into a target language, following the glossary.",
    args: [arg("scene", "The scene to translate"), arg("lang", "The target language tag, e.g. ja")],
    prompt: (a) =>
      `Translate scene ${a["scene"] ?? ""} into ${a["lang"] ?? ""}. Use search_dialogue (scene: ${a["scene"] ?? ""}, lang: ${a["lang"] ?? ""}) to get each line, any existing translation, and the glossary; then set_translation for each untranslated line. Always use the glossary's words. Keep every [variable], {tag}, and {select} exactly; ruby may change. Match each character's speech style from their bible. Translations land as needs-review. (For a whole language at once, Studio's Localization view has "Translate with AI".)`,
  },
  {
    name: "sprite_direction",
    command: "sprites",
    title: "Sprite direction",
    description: "Suggest expression changes for a scene from the characters' presets.",
    args: [arg("scene", "The scene to direct")],
    prompt: (a) =>
      `Suggest sprite direction for scene ${a["scene"] ?? ""}: read it and get_character for each speaker to see their presets and attributes. Propose expression changes as patch_scene set_attrs edits (by line ID), one short reason each, using only words the character has. Use render_line to check a few. Apply them only if asked.`,
  },
  {
    name: "proofread",
    command: "proofread",
    title: "Proofread",
    description: "Fix typos, grammar, and inconsistent names in a scene, without changing its voice.",
    args: [arg("scene", "The scene to proofread")],
    prompt: (a) =>
      `Proofread scene ${a["scene"] ?? ""}. Read it (read_scene) and each speaker's bible (get_character). Fix only typos, grammar, punctuation, and names or terms spelled inconsistently with the bibles and the rest of the game (search_dialogue helps). Never change the meaning, the voice, or a character's verbal tics; dialect and casual speech are deliberate. Propose all fixes as one patch_scene with replace_text operations (by line ID), the rationale listing each fix in a few words. If nothing needs fixing, say so.`,
  },
  {
    name: "route_balance",
    command: "balance",
    title: "Route balance",
    description: "Compare the routes' lengths and choices, and note where a route is thin.",
    args: [],
    prompt: () =>
      `Review the balance of this story's routes. Call analyze (routes: each ending's own and shared lines, scenes, and choices; short routes are flagged) and get_story_graph. Say which routes are much shorter or have fewer choices than the others, and where content would fit best (which scene, what kind of beat), without writing it. Leave one add_note (kind "todo", on the scene) per route that needs work; check list_notes first so you don't repeat an open note. Finish with a short table: ending, own lines, choices, verdict.`,
  },
  {
    name: "playtest_report",
    command: "playtest",
    title: "Playtest report",
    description: "Play every path and explain what can't be reached and why.",
    args: [],
    prompt: () =>
      `Run playtest. Report the endings that can't be reached, scenes and lines never seen, and runtime errors. For each problem, find the cause (get_story_graph, list_variables, read_scene: usually a condition no path makes true, or a missing jump) and propose the smallest fix with patch_scene, one proposal per problem. Leave an add_note (kind "todo") for anything you can't fix safely. If everything is reached, say so in one line.`,
  },
];

/** "/translate ch1 ja" → the recipe and its prompt; null when the text isn't a known command. */
export function expandCommand(text: string): { recipe: Recipe; prompt: string } | { recipe: Recipe; missing: string[] } | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  const recipe = RECIPES.find((r) => r.command === m[1]);
  if (!recipe) return null;
  const wanted = recipe.args.filter((a) => a.required);
  const words = (m[2] ?? "").trim();
  const values: Record<string, string> = {};
  let rest = words;
  wanted.forEach((a, i) => {
    if (i === wanted.length - 1) {
      values[a.name] = rest.trim();
      return;
    }
    const sp = /^(\S+)\s*([\s\S]*)$/.exec(rest);
    values[a.name] = sp?.[1] ?? "";
    rest = sp?.[2] ?? "";
  });
  const missing = wanted.filter((a) => !values[a.name]).map((a) => a.name);
  if (missing.length > 0) return { recipe, missing };
  return { recipe, prompt: recipe.prompt(values) };
}
