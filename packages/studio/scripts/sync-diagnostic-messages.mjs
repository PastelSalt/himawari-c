// Copies Core's diagnostic messages into locales/en.json as diag.HWxxxx (plan §11.5),
// converted to ICU MessageFormat: {param} stays an argument, other braces become
// literals. Run after adding a diagnostic to Core; the i18n check then lists the
// Japanese messages still to write.
//
//   node packages/studio/scripts/sync-diagnostic-messages.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const core = await import(new URL("../../core/dist/index.js", import.meta.url).href);
const file = fileURLToPath(new URL("../locales/en.json", import.meta.url));

/** Core's `{name}` placeholders stay; any other brace is quoted as an ICU literal. */
export function toIcu(message) {
  let out = "";
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    const arg = /^\{(\w+)\}/.exec(message.slice(i));
    if (arg) {
      out += arg[0];
      i += arg[0].length - 1;
    } else if (ch === "{" || ch === "}") {
      out += `'${ch}'`;
    } else {
      out += ch;
    }
  }
  return out;
}

const en = JSON.parse(readFileSync(file, "utf8"));
const kept = Object.fromEntries(Object.entries(en).filter(([k]) => !k.startsWith("diag.")));
for (const [code, def] of Object.entries(core.DIAGNOSTICS)) kept[`diag.${code}`] = toIcu(def.message);
writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`✓ ${Object.keys(core.DIAGNOSTICS).length} diagnostic messages in locales/en.json`);
