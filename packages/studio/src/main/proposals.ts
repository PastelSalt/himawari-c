/**
 * AI proposals (plan §11.4): a write from an AI (Mode A through MCP, Mode B
 * from the assistant panel) is validated, then waits here for a human
 * decision. Accepting writes the files through the project; rejecting sends
 * the reason back to the AI.
 */
import type { ProposalOutcome } from "@himawari/tools";
import type { FileChange, Proposal, ProposalDecision } from "../shared/api.js";
import { applyPatch } from "../shared/patch.js";
import type { Project } from "./project.js";

export class ProposalConflict extends Error {}

interface Pending {
  proposal: Proposal;
  settle: (outcome: ProposalOutcome) => void;
}

export class Proposals {
  private pending = new Map<string, Pending>();
  private next = 1;
  /** Called after an accepted proposal wrote files, so the renderer shows them (and records them as the AI's). */
  onApplied: (changes: FileChange[], proposal: Proposal) => void = () => {};

  constructor(
    private project: () => Project | null,
    private changed: (list: Proposal[]) => void,
  ) {}

  list(): Proposal[] {
    return [...this.pending.values()].map((p) => p.proposal);
  }

  /** Queues a proposal; the promise settles when a human decides. */
  add(p: Omit<Proposal, "id" | "created">): { proposal: Proposal; outcome: Promise<ProposalOutcome> } {
    const proposal: Proposal = { ...p, id: `p${this.next++}`, created: Date.now() };
    let settle!: (o: ProposalOutcome) => void;
    const outcome = new Promise<ProposalOutcome>((r) => (settle = r));
    this.pending.set(proposal.id, { proposal, settle });
    this.changed(this.list());
    return { proposal, outcome };
  }

  /**
   * Accepts or rejects. When a file changed since the AI read it, the change is
   * applied on top by context (like selective undo); if the same lines changed,
   * nothing is written and the AI is told to read the file again.
   */
  decide(id: string, decision: unknown): void {
    const p = this.pending.get(id);
    if (!p) throw new Error("That proposal is gone.");
    const d = decision as ProposalDecision;
    if (d && d.accept === true) {
      const project = this.project();
      if (!project) throw new Error("No project is open.");
      const writes: FileChange[] = [];
      for (const c of p.proposal.changes) {
        const before = p.proposal.before[c.file] ?? null;
        const now = project.fs.exists(c.file) ? project.fs.read(c.file) : null;
        if (now === before || c.text === null) {
          writes.push(c);
          continue;
        }
        const merged = before !== null && now !== null ? applyPatch(before, c.text, now) : null;
        if (merged === null) {
          this.pending.delete(id);
          this.changed(this.list());
          p.settle({ status: "rejected", reason: `${c.file} changed in Studio since you read it, in the same lines. Read it again and redo the edit.` });
          throw new ProposalConflict(c.file);
        }
        writes.push({ file: c.file, text: merged });
      }
      for (const c of writes) {
        if (c.text === null) project.remove(c.file);
        else project.write(c.file, c.text);
      }
      this.onApplied(writes, p.proposal);
      p.settle({ status: "accepted" });
    } else {
      const reason = d && d.accept === false && typeof d.reason === "string" ? d.reason : "";
      p.settle({ status: "rejected", reason });
    }
    this.pending.delete(id);
    this.changed(this.list());
  }

  clear(): void {
    for (const p of this.pending.values()) p.settle({ status: "withdrawn" });
    this.pending.clear();
    this.changed([]);
  }
}
