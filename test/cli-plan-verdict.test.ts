/**
 * H8 边界另一半 · CLI 编排路径的裁决口径（2026-09-18 定案）。
 *
 * 单执行者路径早就注「静态推导：核查侧白名单不含可运行器」；编排路径此前一句
 * 都不说——两个子任务的包一个能跑（python-coding）、一个不能（consult），终端
 * 上却都只印「✔ 通过」。口径要按**子任务自己的包**算：编排的全部意义就是逐子
 * 任务配置，按 run 级包算等于把 s1 与 s2 混成一个。
 *
 * 跑的是真 CLI（spawn tsx）+ 假端点（eval/mock-provider）：断言的是消费方实际
 * 看到的 stdout，不是内部标志位。
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startMockProvider, type MockProviderHandle } from "../eval/mock-provider.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
const CLI = join(REPO, "src", "cli.ts");

/** 两个子任务的包刻意不同：一个白名单无可运行器，一个有 */
const PLAN_JSON = JSON.stringify({
  subtasks: [
    {
      id: "s1",
      title: "核对口径",
      pack: "consult",
      description: "数三份日志的行数",
      acceptance: ["三份都数过"],
      dependsOn: [],
    },
    {
      id: "s2",
      title: "跑脚本复算",
      pack: "python-coding",
      description: "用脚本复算并对比",
      acceptance: ["数字一致"],
      dependsOn: ["s1"],
    },
  ],
});
const PASS = '{"passed":true,"issues":[],"summary":"通过"}';

/** 剥掉开发机残留的端点/颜色环境，只留显式 extra（仪器纪律同 design-mode） */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(AGENT_|ANTHROPIC_|OPENAI_|NO_COLOR|FORCE_COLOR)/.test(key)) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

function spawnCli(
  args: string[],
  cwd: string,
  extra: Record<string, string>,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv(extra),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

describe("H8 · 编排路径的裁决口径（CLI 活页）", () => {
  it("逐子任务注「静态推导」：consult 标、python-coding 不标", async () => {
    const mock: MockProviderHandle = await startMockProvider({
      scripts: [
        { content: [{ type: "text", text: ["```json", PLAN_JSON, "```"].join("\n") }] },
        { content: [{ type: "text", text: "s1 数完了" }] },
        { content: [{ type: "text", text: PASS }] },
        { content: [{ type: "text", text: "s2 复算完成" }] },
        { content: [{ type: "text", text: PASS }] },
      ],
    });
    const dir = await mkdtemp(join(tmpdir(), "cli-plan-verdict-"));
    try {
      const { exitCode, stdout, stderr } = await spawnCli(
        [TSX, CLI, "--yes", "--plan", "数三份日志的行数并复算"],
        dir,
        {
          ANTHROPIC_BASE_URL: mock.anthropicBaseUrl,
          ANTHROPIC_API_KEY: "mock-key",
          AGENT_PROVIDER: "anthropic",
          AGENT_MODEL: "mock-model",
          AGENT_REQUIRE_FINISH_TASK: "0",
          AGENT_EXECUTION_ISOLATION: "off",
          AGENT_MCP_CONFIG: join(dir, "no-mcp.json"),
          AGENT_MEMORY_DIR: join(dir, ".agent-memory"),
          AGENT_RUN_LEDGER: join(dir, "ledger.jsonl"),
          AGENT_RUN_HISTORY_DIR: join(dir, ".agent-run-history"),
          AGENT_CLI_DURABLE: "0",
        },
      );
      expect(exitCode, stdout + stderr).toBe(0);
      const lines = stdout.split(/\r?\n/);
      // 只看结果块：前面每一步的执行横幅里也有 "s1"/"s2"，混在一起定位不了
      const resultAt = lines.findIndex((l) => l.includes("三角编排结果"));
      expect(resultAt, stdout).toBeGreaterThanOrEqual(0);
      const tail = lines.slice(resultAt);
      const row = (id: string) => tail.findIndex((l) => l.includes(id) && /[✔✘－]/.test(l));
      const s1At = row("s1");
      const s2At = row("s2");
      expect(s1At, stdout).toBeGreaterThanOrEqual(0);
      expect(s2At, `未找到 s2 结果行：\n${tail.join("\n")}`).toBeGreaterThan(s1At);
      // 归属：注必须落在自己那一步的结果行与下一步之间
      const notes = tail
        .map((line, i) => ({ i, line }))
        .filter((x) => x.line.includes("静态推导"));
      expect(notes, `未注静态推导：\n${tail.join("\n")}`).toHaveLength(1);
      expect(notes[0]!.i).toBeGreaterThan(s1At);
      expect(notes[0]!.i).toBeLessThan(s2At);
    } finally {
      await mock.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
