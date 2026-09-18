import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * H2 · 机器可读出口的活页锁（2026-09-18 走查）。
 *
 * 断言的是"消费方实际看到的东西"，不是内部标志位：
 *   · --json 的 stdout 能不能逐行 JSON.parse（含 FORCE_COLOR 强制开色时）
 *   · 管道/重定向里还有没有 ANSI 原样落盘（旧病：手写 \x1b 无 isTTY 判断）
 *   · --quiet 的 stdout 是不是只剩终局汇总（过程人话走 stderr）
 * 全部跑死端点（127.0.0.1:9 拒连）——零 API 成本，错误终态即被测对象。
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
const CLI = join(REPO, "src", "cli.ts");
/** ANSI 转义的起始字节（ESC）。用字符码构造，源码保持 ASCII 可读。 */
const ESC = String.fromCharCode(27);

/** 剥掉开发机残留的端点/颜色环境，只留显式 extra（仪器纪律同 design-mode）。 */
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

const DEAD = {
  ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
  ANTHROPIC_API_KEY: "x",
  AGENT_CLI_DURABLE: "0",
};

async function inTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "cli-json-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("H2 · 机器可读出口（spawn 活页）", () => {
  it("--json：stdout 逐行可 parse（事件 + run_result 终局），退出码 1", async () => {
    await inTmp(async (dir) => {
      const { exitCode, stdout } = await spawnCli(
        [TSX, CLI, "--yes", "--json", "查一下 greet 是否存在"],
        dir,
        DEAD,
      );
      expect(exitCode, "死端点=错误终态").toBe(1);
      const lines = stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const parsed = lines.map((line) => JSON.parse(line) as { type?: string; stopReason?: string; source?: string });
      const result = parsed.find((p) => p.type === "run_result");
      expect(result, "缺 run_result 终局行").toBeTruthy();
      expect(result!.stopReason).toBe("error");
      // 事件行带 source（planner/verifier 同流）
      expect(parsed.some((p) => typeof p.source === "string")).toBe(true);
    });
  }, 90_000);

  it("--json + FORCE_COLOR=1：ANSI 强制开色也不污染 JSONL（人话改道 stderr）", async () => {
    await inTmp(async (dir) => {
      const { stdout, stderr } = await spawnCli(
        [TSX, CLI, "--yes", "--json", "查一下 greet 是否存在"],
        dir,
        { ...DEAD, FORCE_COLOR: "1" },
      );
      const lines = stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
      expect(stderr, "强制开色时人话走 stderr，颜色应生效").toContain(ESC);
    });
  }, 90_000);

  it("管道默认（非 TTY）：ANSI 不落任何流，人话行照常", async () => {
    await inTmp(async (dir) => {
      const { exitCode, stdout, stderr } = await spawnCli(
        [TSX, CLI, "--yes", "查一下 greet 是否存在"],
        dir,
        DEAD,
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain("■ error");
      expect(stdout).not.toContain(ESC);
      expect(stderr).not.toContain(ESC);
    });
  }, 90_000);

  it("FORCE_COLOR=1：显式要色就给（管道里也带 ANSI）", async () => {
    await inTmp(async (dir) => {
      const { stdout } = await spawnCli([TSX, CLI, "--yes", "查一下 greet 是否存在"], dir, {
        ...DEAD,
        FORCE_COLOR: "1",
      });
      expect(stdout).toContain(ESC);
    });
  }, 90_000);

  it("--quiet：stdout 只剩终局汇总，过程人话改道 stderr", async () => {
    await inTmp(async (dir) => {
      const { exitCode, stdout, stderr } = await spawnCli(
        [TSX, CLI, "--yes", "--quiet", "查一下 greet 是否存在"],
        dir,
        DEAD,
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain("■ error");
      expect(stdout).not.toContain("模型请求");
      expect(stdout).not.toContain(ESC);
      expect(stderr, "过程行应在 stderr 可见，而不是消失").toContain("模型请求");
    });
  }, 90_000);
});
