import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, readJsonArtifact, log } from "./agent-runner.js";
import { EVALUATOR_SYSTEM } from "./prompts.js";
import { MODELS, LIMITS, REPO_ROOT } from "./config.js";
import type { Sprint, Verdict } from "./types.js";

export async function evaluateSprint(
  sprint: Sprint,
  contractPath: string,
  sprintDir: string,
  workspaceDir: string,
  attempt: number,
): Promise<{ verdict: Verdict; critiquePath: string }> {
  const critiquePath = path.join(sprintDir, `critique-${attempt}.md`);
  const verdictPath = path.join(sprintDir, `verdict-${attempt}.json`);
  const screenshotsDir = path.join(sprintDir, "screenshots", `attempt-${attempt}`);
  await fs.mkdir(screenshotsDir, { recursive: true });

  log("orchestrator", `Evaluating sprint ${sprint.id} (attempt ${attempt}) in the browser`);

  await runAgent(
    {
      // The evaluator runs from the orchestrator repo root so that its Node
      // scripts resolve the locally installed "playwright" package.
      name: "evaluator",
      systemPrompt: EVALUATOR_SYSTEM,
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      cwd: REPO_ROOT,
      model: MODELS.evaluator,
      maxTurns: LIMITS.maxTurns.evaluate,
    },
    [
      `Phase: BROWSER EVALUATION (attempt ${attempt}).`,
      ``,
      `Sprint ${sprint.id}: ${sprint.title}`,
      `Contract to verify: ${contractPath}`,
      `App directory to serve and test: ${workspaceDir}`,
      `Save screenshots to: ${screenshotsDir}`,
      `You may write throwaway Playwright scripts anywhere under: ${path.join(sprintDir, "eval-scripts")}`,
      ``,
      `Verify EVERY criterion in the contract. Then write:`,
      `1. ${critiquePath} — per-criterion verdict (PASS/FAIL) with details and repro steps for failures.`,
      `2. ${verdictPath} — JSON:`,
      `{"passed": true|false, "total_criteria": N, "passed_criteria": N,`,
      ` "failed_criteria": [{"criterion": "...", "details": "..."}]}`,
      ``,
      `"passed" must be true only if failed_criteria is empty.`,
    ].join("\n"),
  );

  const verdict = await readJsonArtifact<Verdict>(verdictPath, "evaluation verdict");
  log(
    "orchestrator",
    verdict.passed
      ? `Sprint ${sprint.id} PASSED: ${verdict.passed_criteria}/${verdict.total_criteria} criteria`
      : `Sprint ${sprint.id} FAILED: ${verdict.passed_criteria}/${verdict.total_criteria} criteria passed`,
  );
  return { verdict, critiquePath };
}
