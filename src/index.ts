import { runProject } from "./orchestrator.js";
import { log, getTotalCostUsd } from "./agent-runner.js";

const request = process.argv.slice(2).join(" ").trim();

if (!request) {
  console.error('Usage: npm start -- "<product request>"');
  console.error('Example: npm start -- "сделай retro game maker"');
  process.exit(1);
}

runProject(request)
  .then((summary) => {
    log("orchestrator", "=== Run complete ===");
    for (const s of summary.sprints) {
      log(
        "orchestrator",
        `Sprint ${s.id} "${s.title}": ${s.passed ? "PASSED" : "FAILED"} (${s.attempts} eval attempt(s))`,
      );
    }
    log("orchestrator", `Product: ${summary.workspaceDir}`);
    log("orchestrator", `Artifacts (plan, contracts, critiques, screenshots): ${summary.runDir}`);
    log("orchestrator", `Total cost: $${getTotalCostUsd().toFixed(2)}`);
  })
  .catch((err) => {
    console.error("Run failed:", err);
    process.exit(1);
  });
