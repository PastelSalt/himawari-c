/**
 * The preview's game process ending badly (BREAK_IT.md S-14): crashing, being
 * killed, or dying mid-command. Studio's main process must keep running and say
 * the preview stopped; a write to a game that just died must not take Studio down.
 */
import { describe, expect, test } from "vitest";
import type { PreviewEvent } from "../shared/api.js";
import { Preview } from "./preview.js";

describe("the preview's game process (BREAK_IT.md S-14)", () => {
  test("a game that dies at once, while commands keep coming, doesn't crash Studio", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", onUncaught);
    const events: PreviewEvent[] = [];
    // Node as a stand-in runtime: it rejects the runtime's arguments and exits immediately.
    const preview = new Preview(process.execPath, 0n, (e) => events.push(e));
    try {
      for (let round = 0; round < 20; round++) {
        preview.start(".");
        // Commands sent while it dies: window resizes, reloads, warps.
        for (let i = 0; i < 50; i++) {
          preview.send({ cmd: "reload" });
          preview.setBounds({ x: i, y: i, w: 100, h: 100 });
          await new Promise((r) => setTimeout(r, 1));
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      preview.stop();
      process.off("uncaughtException", onUncaught);
    }
    expect(uncaught).toEqual([]);
    expect(events.some((e) => e.ev === "exited")).toBe(true);
  }, 60000);
});
