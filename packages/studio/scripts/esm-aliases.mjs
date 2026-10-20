// Packages whose "node" entry is an ESM wrapper that require()s their CommonJS build at run time
// (resedit, pe-library): a bundle can't follow that, so every bundle that includes @himawari/tools
// points them at their real ESM build instead. Used by electron.vite.config.ts and stage-resources.mjs.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tools = fileURLToPath(new URL("../../tools/node_modules/", import.meta.url));

export function esmAliases() {
  const resedit = realpathSync(join(tools, "resedit"));
  const peLibrary = realpathSync(join(resedit, "..", "pe-library"));
  return [
    { find: /^resedit$/, replacement: join(resedit, "dist", "_esm", "index.js") },
    { find: /^pe-library$/, replacement: join(peLibrary, "dist", "_esm", "index.js") },
  ];
}
