// hwc and himawari-mcp in one program (FINALIZATION.md OC-3): `himawari-tools mcp --project <dir>` runs
// the MCP server, anything else is hwc. Bundled into one file by scripts/stage-resources.mjs.
const [first] = process.argv.slice(2);
if (first === "mcp") {
  process.argv.splice(2, 1);
  await import("../../../mcp/dist/main.js");
} else {
  await import("../../../cli/dist/main.js");
}
