#!/usr/bin/env node
/**
 * Checks that every relative link in the repo's Markdown files points at a file
 * or folder that exists (web links and #anchors are not checked).
 *
 *   node scripts/check-links.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const files = execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const broken = [];
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8").replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#") || target.startsWith("/")) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    if (path && !existsSync(normalize(join(ROOT, dirname(file), path)))) broken.push(`${file}: ${target}`);
  }
}
if (broken.length) {
  console.error(`${broken.length} broken link(s):\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`✓ ${files.length} Markdown files, every relative link resolves`);
