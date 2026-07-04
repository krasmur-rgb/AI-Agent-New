import fs from "node:fs/promises";
import path from "node:path";
import { log } from "./agent-runner.js";
import { LIMITS, REPO_ROOT } from "./config.js";
import { runPlanner } from "./planner.js";
import { negotiateContract } from "./contract.js";
import { buildSprint, fixSprint } from "./builder.js";
import { evaluateSprint } from "./evaluator.js";
import type { Verdict } from "./types.js";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product"
  );
}

export interface RunSummary {
  runDir: string;
  workspaceDir: string;
  sprints: { id: number; title: string; passed: boolean; attempts: number }[];
}

/**
 * The full loop from the talk:
 *   1. planner splits the request into sprints
 *   2. builder takes the next sprint
 *   3. builder and evaluator agree on a contract
 *   4. builder builds
 *   5. evaluator verifies in a real browser
 *   6. builder fixes
 *   7. repeat 5–6 until the contract passes (or the iteration cap is hit)
 */
export async function runProject(request: string): Promise<RunSummary> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = slugify(request);
  const runDir = path.join(REPO_ROOT, "runs", `${stamp}-${slug}`);
  const workspaceDir = path.join(REPO_ROOT, "workspace", slug);
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  log("orchestrator", `Run artifacts: ${runDir}`);
  log("orchestrator", `Product workspace: ${workspaceDir}`);

  // 1. Planner: product-level plan and sprints.
  const plan = await runPlanner(request, runDir);
  const planPath = path.join(runDir, "plan.md");

  const summary: RunSummary = { runDir, workspaceDir, sprints: [] };

  for (const sprint of plan.sprints) {
    const sprintDir = path.join(runDir, `sprint-${String(sprint.id).padStart(2, "0")}`);
    await fs.mkdir(sprintDir, { recursive: true });
    log("orchestrator", `=== Sprint ${sprint.id}/${plan.sprints.length}: ${sprint.title} ===`);

    // 2–3. Agree on the contract before building.
    const contractPath = await negotiateContract(sprint, planPath, sprintDir, workspaceDir);

    // 4. Build.
    await buildSprint(sprint, planPath, contractPath, workspaceDir);

    // 5–6. Evaluate in the browser, fix, repeat.
    let verdict: Verdict | null = null;
    let attempt = 0;
    for (attempt = 1; attempt <= LIMITS.fixIterations; attempt++) {
      const result = await evaluateSprint(sprint, contractPath, sprintDir, workspaceDir, attempt);
      verdict = result.verdict;
      if (verdict.passed) break;
      if (attempt === LIMITS.fixIterations) {
        log(
          "orchestrator",
          `Sprint ${sprint.id}: iteration cap (${LIMITS.fixIterations}) reached with failures — moving on.`,
        );
        break;
      }
      await fixSprint(sprint, contractPath, result.critiquePath, verdict, workspaceDir);
    }

    summary.sprints.push({
      id: sprint.id,
      title: sprint.title,
      passed: verdict?.passed ?? false,
      attempts: Math.min(attempt, LIMITS.fixIterations),
    });
  }

  await fs.writeFile(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}
