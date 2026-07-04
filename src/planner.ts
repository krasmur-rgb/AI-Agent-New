import path from "node:path";
import { runAgent, readJsonArtifact, log } from "./agent-runner.js";
import { PLANNER_SYSTEM } from "./prompts.js";
import { MODELS, LIMITS } from "./config.js";
import type { Plan, Sprint } from "./types.js";

export async function runPlanner(request: string, runDir: string): Promise<Plan> {
  const planPath = path.join(runDir, "plan.md");
  const sprintsPath = path.join(runDir, "sprints.json");

  log("orchestrator", `Planning: "${request}"`);

  await runAgent(
    {
      name: "planner",
      systemPrompt: PLANNER_SYSTEM,
      allowedTools: ["Write", "Read"],
      cwd: runDir,
      model: MODELS.planner,
      maxTurns: LIMITS.maxTurns.planner,
    },
    [
      `Product request from the user:`,
      ``,
      `"""${request}"""`,
      ``,
      `Write the plan to: ${planPath}`,
      `Write the sprint list to: ${sprintsPath}`,
    ].join("\n"),
  );

  const sprints = await readJsonArtifact<Sprint[]>(sprintsPath, "sprint list");
  if (!Array.isArray(sprints) || sprints.length === 0) {
    throw new Error(`Planner produced an empty or malformed sprint list at ${sprintsPath}`);
  }
  log("orchestrator", `Plan ready: ${sprints.length} sprint(s) — ${sprints.map((s) => s.title).join(" → ")}`);
  return { product: request, sprints };
}
