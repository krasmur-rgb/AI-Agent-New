import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs/promises";

export interface RoleConfig {
  /** Display name used as the log prefix, e.g. "planner", "builder", "evaluator". */
  name: string;
  systemPrompt: string;
  allowedTools: string[];
  cwd: string;
  model: string;
  maxTurns: number;
}

const COLORS: Record<string, string> = {
  planner: "\x1b[36m", // cyan
  builder: "\x1b[33m", // yellow
  evaluator: "\x1b[35m", // magenta
  orchestrator: "\x1b[32m", // green
};
const RESET = "\x1b[0m";

export function log(role: string, text: string): void {
  const color = COLORS[role] ?? "";
  const prefix = `${color}[${role}]${RESET}`;
  for (const line of text.split("\n")) {
    console.log(`${prefix} ${line}`);
  }
}

/**
 * Run one agent turn-loop with its own context (system prompt, tools, cwd).
 * Each call is a fresh context window — roles never share conversation state,
 * they communicate only through markdown/JSON files on disk.
 */
let totalCostUsd = 0;

/** Total spend across all agent runs in this process. */
export function getTotalCostUsd(): number {
  return totalCostUsd;
}

export async function runAgent(role: RoleConfig, prompt: string): Promise<string> {
  let resultText = "";

  const stream = query({
    prompt,
    options: {
      systemPrompt: role.systemPrompt,
      allowedTools: role.allowedTools,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Claude Code refuses --dangerously-skip-permissions under root unless it
      // knows it's inside a sandbox. Containers often run as root, so flag it.
      env: {
        ...process.env,
        ...(typeof process.getuid === "function" && process.getuid() === 0
          ? { IS_SANDBOX: "1" }
          : {}),
      },
      cwd: role.cwd,
      model: role.model,
      maxTurns: role.maxTurns,
      // Don't inherit user/project Claude settings — roles must be fully
      // defined by their config so runs are reproducible.
      settingSources: [],
    },
  });

  for await (const message of stream as AsyncGenerator<any>) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text?.trim()) {
          log(role.name, block.text.trim());
        } else if (block.type === "tool_use") {
          const hint =
            typeof block.input?.file_path === "string"
              ? ` ${block.input.file_path}`
              : typeof block.input?.command === "string"
                ? ` ${String(block.input.command).slice(0, 120)}`
                : "";
          log(role.name, `⋯ ${block.name}${hint}`);
        }
      }
    }
    if (message.type === "result") {
      resultText = message.result ?? "";
      if (typeof message.total_cost_usd === "number") {
        totalCostUsd += message.total_cost_usd;
        log(
          role.name,
          `— done: ${message.num_turns} turns, $${message.total_cost_usd.toFixed(2)} (run total $${totalCostUsd.toFixed(2)})`,
        );
      }
      if (message.subtype !== "success") {
        log(role.name, `⚠ finished with ${message.subtype} — continuing with whatever was produced`);
      }
    }
  }

  return resultText;
}

/** Read a JSON status file an agent was instructed to write; fail loudly if it's missing or invalid. */
export async function readJsonArtifact<T>(filePath: string, description: string): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`Agent did not produce ${description} at ${filePath}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Invalid JSON in ${description} (${filePath}): ${(err as Error).message}`);
  }
}
