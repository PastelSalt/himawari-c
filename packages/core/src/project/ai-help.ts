/**
 * The per-project AI switch (FINALIZATION.md §6, D59): `"aiHelp": false` in
 * himawari.json turns AI help off for everyone working on the project. AI is
 * optional either way; this is for teams and schools that don't allow it.
 */

/** False only when himawari.json says `"aiHelp": false` (a missing or unreadable manifest allows it). */
export function aiHelpAllowed(manifestText: string | undefined | null): boolean {
  if (!manifestText) return true;
  try {
    const m = JSON.parse(manifestText) as Record<string, unknown> | null;
    return !(m && typeof m === "object" && m["aiHelp"] === false);
  } catch {
    return true;
  }
}

/** himawari.json's text with the switch set; other fields and their order are kept. */
export function setAiHelp(manifestText: string, allowed: boolean): string {
  const m = JSON.parse(manifestText) as Record<string, unknown>;
  if (allowed) delete m["aiHelp"];
  else m["aiHelp"] = false;
  return `${JSON.stringify(m, null, 2)}\n`;
}
