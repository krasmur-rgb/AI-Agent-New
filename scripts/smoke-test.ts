/**
 * Minimal end-to-end check of the Agent SDK wiring: spawns one cheap agent
 * that writes a single file. Run with: npm run smoke
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAgent } from "../src/agent-runner.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smoke-"));
const okPath = path.join(dir, "ok.txt");

await runAgent(
  {
    name: "builder",
    systemPrompt: "You are a minimal test agent. Do exactly what is asked, nothing more.",
    allowedTools: ["Write"],
    cwd: dir,
    model: "claude-haiku-4-5",
    maxTurns: 5,
  },
  `Write the single word OK to the file ${okPath} and stop.`,
);

const content = (await fs.readFile(okPath, "utf8")).trim();
if (content !== "OK") {
  throw new Error(`Smoke test failed: expected "OK", got "${content}"`);
}
console.log("Smoke test passed: agent wrote", okPath);
