#!/usr/bin/env node
import { CORE_VERSION, SPEC_VERSIONS } from "@himawari/core";

// Commands from plan §9.2. Only `--version` works in Phase 0; the rest land in Phase 1+.
const PLANNED = ["init", "check", "fmt", "build", "run", "playtest", "l10n", "sprites", "graph", "report", "migrate"];

function main(argv: readonly string[]): number {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(`hwc ${CORE_VERSION}\n\nUsage: hwc <command>\n\nCommands (planned): ${PLANNED.join(", ")}`);
    return 0;
  }

  if (command === "--version" || command === "-v") {
    console.log(`hwc ${CORE_VERSION}`);
    for (const [name, version] of Object.entries(SPEC_VERSIONS)) {
      console.log(`  ${name.padEnd(10)} ${version}`);
    }
    return 0;
  }

  if (PLANNED.includes(command)) {
    console.error(`hwc ${command}: not implemented yet (see DETAILED_PLAN.md §18).`);
    return 2;
  }

  console.error(`hwc: unknown command "${command}". Run "hwc --help".`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
