/** Version of the `@himawari/core` package itself. */
export const CORE_VERSION = "0.0.0";

/**
 * Versions of each part of the Script Data Contract (plan §5, §5.6).
 * Every spec is versioned independently with SemVer. `-draft` means the
 * spec is still pre-1.0 and may change without an RFC.
 */
export const SPEC_VERSIONS = {
  language: "0.3.0-draft",
  manifest: "1.0.0-draft",
  character: "1.0.0-draft",
  bytecode: "1.1.0",
  ast: "1.1.0",
} as const;

export type SpecName = keyof typeof SPEC_VERSIONS;

/** Base URL where specs and JSON Schemas are published (plan §17, D20). */
export const SPEC_BASE_URL = "https://pastelsalt.github.io/himawari-c/spec";
