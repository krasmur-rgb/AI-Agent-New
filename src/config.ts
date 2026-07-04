import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Model per role, overridable via env. Opus is the default for all roles. */
export const MODELS = {
  planner: process.env.PLANNER_MODEL ?? process.env.MODEL ?? "claude-opus-4-8",
  builder: process.env.BUILDER_MODEL ?? process.env.MODEL ?? "claude-opus-4-8",
  evaluator: process.env.EVALUATOR_MODEL ?? process.env.MODEL ?? "claude-opus-4-8",
};

export const LIMITS = {
  /** Max builder↔evaluator rounds to agree on a contract before the evaluator finalizes it. */
  contractRounds: Number(process.env.CONTRACT_ROUNDS ?? 3),
  /** Max build → evaluate → fix cycles per sprint. */
  fixIterations: Number(process.env.FIX_ITERATIONS ?? 3),
  /** Per-phase turn caps (one turn = one assistant step in the agent loop). */
  maxTurns: {
    planner: Number(process.env.PLANNER_MAX_TURNS ?? 30),
    contract: Number(process.env.CONTRACT_MAX_TURNS ?? 25),
    build: Number(process.env.BUILD_MAX_TURNS ?? 200),
    evaluate: Number(process.env.EVAL_MAX_TURNS ?? 80),
    fix: Number(process.env.FIX_MAX_TURNS ?? 120),
  },
};
