/**
 * The live preview (plan §11.3): the real runtime as a child process, docked
 * into Studio's window, driven over the debug pipe (spec/debug-protocol.md).
 * Fixed arguments, no shell (plan §10.2 rule 6).
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { PreviewCommand, PreviewEvent, Rect } from "../shared/api.js";

export class Preview {
  private child: ChildProcessWithoutNullStreams | null = null;
  private bounds: Rect | null = null;
  private stopping = false;

  constructor(
    private runtime: string | null,
    private parentWindow: bigint,
    private emit: (event: PreviewEvent) => void,
  ) {}

  get running(): boolean {
    return this.child !== null;
  }

  /** Starts playing `root`'s build/game.hwb from the beginning, or at `warp` (a scene or #lineid). */
  start(root: string, options: { warp?: string; lang?: string } = {}): void {
    this.stop();
    if (!this.runtime) {
      this.emit({ ev: "unavailable", reason: "runtime" });
      return;
    }
    const args = ["--project", root, "--link", "--parent-window", this.parentWindow.toString(), "--start"];
    if (options.warp) args.push("--warp", options.warp);
    if (options.lang) args.push("--lang", options.lang);
    const child = spawn(this.runtime, args, { shell: false, windowsHide: false, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.stopping = false;
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.startsWith("{")) return;
      try {
        const event = JSON.parse(line) as PreviewEvent;
        if (event.ev === "ready" && this.bounds) this.place(this.bounds);
        this.emit(event);
      } catch {
        /* not an event line */
      }
    });
    child.stderr.on("data", () => {}); /* runtime logs; drained so the pipe never fills */
    child.on("error", () => {
      if (this.child === child) this.child = null;
      this.emit({ ev: "unavailable", reason: "start" });
    });
    child.on("exit", (code) => {
      if (this.child === child) this.child = null;
      if (!this.stopping) this.emit({ ev: "exited", code });
    });
  }

  send(command: PreviewCommand | { cmd: "bounds"; x: number; y: number; w: number; h: number }): void {
    if (!this.child || this.child.stdin.destroyed) return;
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  /** The pane's rectangle in device pixels; null hides the game (e.g. while a dialog covers the pane). */
  setBounds(rect: Rect | null): void {
    this.bounds = rect;
    this.place(rect);
  }

  private place(rect: Rect | null): void {
    if (!rect) this.send({ cmd: "bounds", x: 0, y: 0, w: 0, h: 0 });
    else this.send({ cmd: "bounds", x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) });
  }

  stop(): void {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    this.child = null;
    child.stdin.end(); /* the runtime quits when its stdin closes */
    const timer = setTimeout(() => child.kill(), 2000);
    child.on("exit", () => clearTimeout(timer));
  }
}
