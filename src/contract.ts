import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, readJsonArtifact, log } from "./agent-runner.js";
import { BUILDER_SYSTEM, EVALUATOR_SYSTEM } from "./prompts.js";
import { MODELS, LIMITS } from "./config.js";
import type { ContractReview, Sprint } from "./types.js";

/**
 * The core mechanism of the whole system: before any code is written, the
 * builder and the evaluator negotiate a CONTRACT — a list of concrete,
 * verifiable "done" criteria. The evaluator later checks this contract,
 * not the vague original request.
 *
 * Flow: builder drafts → evaluator reviews (approve / demand changes) →
 * builder revises → ... After the round limit the evaluator finalizes the
 * draft itself so negotiation always terminates.
 */
export async function negotiateContract(
  sprint: Sprint,
  planPath: string,
  sprintDir: string,
  workspaceDir: string,
): Promise<string> {
  const draftPath = path.join(sprintDir, "contract-draft.md");
  const reviewPath = path.join(sprintDir, "contract-review.md");
  const reviewStatusPath = path.join(sprintDir, "contract-review.json");
  const contractPath = path.join(sprintDir, "contract.md");

  const sprintDescription = [
    `Sprint ${sprint.id}: ${sprint.title}`,
    `Goal: ${sprint.goal}`,
    `Scope:`,
    ...sprint.scope.map((s) => `- ${s}`),
  ].join("\n");

  for (let round = 1; round <= LIMITS.contractRounds; round++) {
    log("orchestrator", `Contract negotiation, round ${round}/${LIMITS.contractRounds}`);

    // 1) Builder drafts (or revises) the contract.
    const builderTask =
      round === 1
        ? [
            `Phase: CONTRACT DRAFTING.`,
            ``,
            `Read the product plan at ${planPath} for context. The current sprint is:`,
            ``,
            sprintDescription,
            ``,
            `The app lives (or will live) in: ${workspaceDir}`,
            `If earlier sprints already built something there, skim it to keep criteria consistent with reality.`,
            ``,
            `Write your proposed contract to: ${draftPath}`,
          ].join("\n")
        : [
            `Phase: CONTRACT DRAFTING (revision).`,
            ``,
            `Your previous draft is at ${draftPath}. The evaluator reviewed it at ${reviewPath} and demanded changes.`,
            `Incorporate every reasonable comment and rewrite ${draftPath} in place.`,
            ``,
            `Sprint context:`,
            sprintDescription,
          ].join("\n");

    await runAgent(
      {
        name: "builder",
        systemPrompt: BUILDER_SYSTEM,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
        cwd: workspaceDir,
        model: MODELS.builder,
        maxTurns: LIMITS.maxTurns.contract,
      },
      builderTask,
    );

    // 2) Evaluator reviews the draft.
    const isLastRound = round === LIMITS.contractRounds;
    await runAgent(
      {
        name: "evaluator",
        systemPrompt: EVALUATOR_SYSTEM,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
        cwd: workspaceDir,
        model: MODELS.evaluator,
        maxTurns: LIMITS.maxTurns.contract,
      },
      [
        `Phase: CONTRACT REVIEW (round ${round} of ${LIMITS.contractRounds}).`,
        ``,
        `Sprint context:`,
        sprintDescription,
        ``,
        `Read the builder's proposed contract at ${draftPath} (product plan for context: ${planPath}).`,
        ``,
        isLastRound
          ? `This is the FINAL round: instead of demanding another revision, edit ${draftPath} yourself to add anything still missing, then approve.`
          : `If the contract needs changes, write your required changes to ${reviewPath}.`,
        ``,
        `Finish by writing your decision to ${reviewStatusPath} as JSON:`,
        `{"approved": true|false, "comments": ["...", "..."]}`,
      ].join("\n"),
    );

    const review = await readJsonArtifact<ContractReview>(reviewStatusPath, "contract review status");
    if (review.approved || isLastRound) {
      await fs.copyFile(draftPath, contractPath);
      log("orchestrator", `Contract agreed (round ${round}) → ${contractPath}`);
      return contractPath;
    }
    log("orchestrator", `Contract not approved yet: ${review.comments.length} comment(s)`);
  }

  // Unreachable: the last round always returns above.
  throw new Error("Contract negotiation failed to terminate");
}
