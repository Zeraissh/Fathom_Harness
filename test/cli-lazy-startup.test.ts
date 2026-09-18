import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * H6 · 启动顺序（2026-09-18 走查）：--resume-run 的失败必须先于 MCP 连接。
 *
 * 旧行为（活页复现，仓库 cwd）：坏 resume 先拉起 stm32/filesystem MCP、打出 10 行
 * 噪音（含 MCP 服务器自家 stdio 横幅 "Secure MCP Filesystem Server running…"），
 * 真错误排到最后一行。零 API 成本（失败发生在连模型之前）。
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
const CLI = join(REPO, "src", "cli.ts");

/** 剥掉开发机残留的端点/色/AGENT_* 环境（仪器纪律同 design-mode）。 */
function childEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/^(AGENT_|ANTHROPIC_|OPENAI_|NO_COLOR|FORCE_COLOR)/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function spawnCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv(),
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

describe("H6 · 坏 resume 不先付 MCP 启动成本", () => {
  it("错误先出、MCP 不连接（无 connected / 无服务器横幅），退出码 1", async () => {
    // cwd=仓库：mcp.json 就在那里——旧实现必然先连（这正是被测场景）
    const { exitCode, stdout, stderr } = await spawnCli(
      [TSX, CLI, "--resume-run", "does-not-exist-xyz"],
      REPO,
    );
    const out = stdout + stderr;
    expect(exitCode).toBe(1);
    expect(out).toContain("不能续跑 does-not-exist-xyz");
    expect(out).not.toContain("mcp: connected");
    expect(out).not.toContain("mcp: skipped");
    expect(out).not.toContain("Secure MCP Filesystem Server");
  }, 60_000);
});
