import path from "node:path";
import { runAgent, log } from "./agent-runner.js";
import { BUILDER_SYSTEM } from "./prompts.js";
import { MODELS, LIMITS } from "./config.js";
import type { Sprint, Verdict } from "./types.js";

const BUILDER_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];

export async function buildSprint(
  sprint: Sprint,
  planPath: string,
  contractPath: string,
  workspaceDir: string,
): Promise<void> {
  log("orchestrator", `Building sprint ${sprint.id}: ${sprint.title}`);
  await runAgent(
    {
      name: "builder",
      systemPrompt: BUILDER_SYSTEM,
      allowedTools: BUILDER_TOOLS,
      cwd: workspaceDir,
      model: MODELS.builder,
      maxTurns: LIMITS.maxTurns.build,
    },
    [
      `Phase: BUILD.`,
      ``,
      `Sprint ${sprint.id}: ${sprint.title}`,
      `Goal: ${sprint.goal}`,
      ``,
      `The agreed contract is at: ${contractPath} — read it first; every criterion in it must pass.`,
      `Product plan for context: ${planPath}`,
      `Build the app in your working directory: ${workspaceDir}`,
      ``,
      `The evaluator will serve the app with a plain HTTP server and click through it with Playwright,`,
      `so make sure it works from a static server with zero build steps (or document the exact run`,
      `command in a README.md at the workspace root).`,
    ].join("\n"),
  );
}

export async function fixSprint(
  sprint: Sprint,
  contractPath: string,
  critiquePath: string,
  verdict: Verdict,
  workspaceDir: string,
): Promise<void> {
  log(
    "orchestrator",
    `Fixing sprint ${sprint.id}: ${verdict.failed_criteria.length} failed criteria`,
  );
  await runAgent(
    {
      name: "builder",
      systemPrompt: BUILDER_SYSTEM,
      allowedTools: BUILDER_TOOLS,
      cwd: workspaceDir,
      model: MODELS.builder,
      maxTurns: LIMITS.maxTurns.fix,
    },
    [
      `Phase: FIX.`,
      ``,
      `Sprint ${sprint.id}: ${sprint.title}`,
      `The evaluator verified the app in a real browser against the contract (${contractPath})`,
      `and ${verdict.failed_criteria.length} of ${verdict.total_criteria} criteria FAILED.`,
      ``,
      `Full critique with reproduction steps: ${critiquePath} — read it first.`,
      `Failed criteria summary:`,
      ...verdict.failed_criteria.map((f) => `- ${f.criterion}: ${f.details}`),
      ``,
      `Fix the app in ${workspaceDir} so the failed criteria pass, without breaking the passing ones.`,
    ].join("\n"),
  );
}
