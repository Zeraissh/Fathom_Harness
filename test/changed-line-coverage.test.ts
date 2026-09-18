// @ts-nocheck
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  changedLineCoverage,
  coverageInclude,
  gitDiff,
  parseLcov,
  parseUnifiedDiff,
} from "../scripts/changed-line-coverage.mjs";

const lcov = [
  "SF:src/foo.ts",
  "DA:10,3",
  "DA:11,0",
  "DA:12,1",
  "end_of_record",
  "SF:ui/server.ts",
  "DA:20,8",
  "end_of_record",
].join("\n");

describe("TEST-01 changed-line coverage", () => {
  it("只收 src/ 与 ui 根下的 .ts，不收 public / test", () => {
    expect(coverageInclude("src/loop.ts")).toBe(true);
    expect(coverageInclude("ui/server.ts")).toBe(true);
    expect(coverageInclude("ui/history.ts")).toBe(true);
    expect(coverageInclude("ui/public/app.js")).toBe(false);
    expect(coverageInclude("test/loop.test.ts")).toBe(false);
    expect(coverageInclude("scripts/changed-line-coverage.mjs")).toBe(false);
  });

  it("src/cli.ts 不入本门（子进程覆盖看不见，等于一行都恒为 0）", () => {
    // 实测 0/2053：CLI 测试全是 spawn，子进程插桩不进父进程 lcov。
    // 不排除的话，凡改动 CLI 的 PR 这门必红，而红灯说不出任何有用的话。
    expect(coverageInclude("src/cli.ts")).toBe(false);
    // 邻居不受影响：CLI 的逻辑模块照旧入门
    expect(coverageInclude("src/cli-args.ts")).toBe(true);
    expect(coverageInclude("src/cli-durable.ts")).toBe(true);
    expect(coverageInclude("ui/cli.ts")).toBe(true); // 只排除 src/ 下那一个确切路径
  });

  it("unified diff 只把 + 行记到新文件行号", () => {
    const diff = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,2 +10,3 @@",
      " keep",
      "+added",
      " also",
    ].join("\n");
    const map = parseUnifiedDiff(diff);
    expect([...map.get("src/foo.ts")!].sort()).toEqual([11]);
  });

  it("改到的 DA 行 hit>0 通过；hit=0 失败", () => {
    const ok = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,0 +10,1 @@",
      "+covered",
    ].join("\n");
    expect(changedLineCoverage({ lcovText: lcov, diffText: ok })).toMatchObject({
      ok: true,
      checked: 1,
    });

    const bad = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -11,0 +11,1 @@",
      "+uncovered",
    ].join("\n");
    const report = changedLineCoverage({ lcovText: lcov, diffText: bad });
    expect(report.ok).toBe(false);
    expect(report.uncovered).toEqual([{ file: "src/foo.ts", line: 11, hits: 0 }]);
  });

  it("没有 DA 的行（注释/空行）不算未覆盖；不在 include 里的文件忽略", () => {
    const diff = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -99,0 +99,1 @@",
      "+// comment only",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1,0 +1,1 @@",
      "+docs",
    ].join("\n");
    expect(changedLineCoverage({ lcovText: lcov, diffText: diff })).toMatchObject({
      ok: true,
      checked: 0,
      skippedUninstrumented: 1,
    });
  });

  it("改了 src 文件但 lcov 里没有这份 → fail-closed", () => {
    const diff = [
      "--- a/src/new-file.ts",
      "+++ b/src/new-file.ts",
      "@@ -0,0 +1,1 @@",
      "+export const x = 1;",
    ].join("\n");
    const report = changedLineCoverage({ lcovText: lcov, diffText: diff });
    expect(report.ok).toBe(false);
    expect(report.missingFiles).toEqual(["src/new-file.ts"]);
  });

  it("parseLcov 认 Windows 路径分隔", () => {
    const win = parseLcov("SF:D:\\repo\\src\\foo.ts\nDA:3,2\nend_of_record\n");
    expect(win.get("D:/repo/src/foo.ts")?.get(3)).toBe(2);
  });
});

/**
 * gitDiff 的缓冲上限（2026-09-18 夜 CI 实录）。
 *
 * 这个门在这条 PR 上长期红着，日志只有一句 `git diff failed (null)`——看的人
 * 只会去查覆盖率。真因是 `spawnSync` 默认 `maxBuffer` = 1MB，而这条分支相对
 * main 的 diff 有 1.2MB：ENOBUFS 让 status 变成 null、stderr 为空，错误成了
 * 一团雾。这里用真 git 仓造一份 >1MB 的改动，把"读得全"和"报得清"两件事都钉住。
 */
describe("changed-line-coverage · gitDiff 缓冲", () => {
  function bigRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "clc-big-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "clc@test");
    git("config", "user.name", "clc");
    writeFileSync(join(dir, "big.ts"), "export const seed = 0;\n", "utf8");
    git("add", ".");
    git("commit", "-qm", "base");
    git("tag", "base");
    // 4 万行新增（每行 diff 行 ~33 字节）→ 完整 diff ≈ 1.3MB，稳稳越过 1MB 旧上限
    writeFileSync(
      join(dir, "big.ts"),
      Array.from({ length: 40_000 }, (_, i) => `export const value${i} = ${i};`).join("\n") + "\n",
      "utf8",
    );
    git("add", ".");
    git("commit", "-qm", "big");
    return dir;
  }

  it("diff 超过 1MB 也读得全（旧实现静默截断成 failed (null)）", () => {
    const dir = bigRepo();
    try {
      const diff = gitDiff("base", dir);
      expect(diff.length).toBeGreaterThan(1024 * 1024);
      // 末尾那几行在——证明整份都读到了，不是截断后的前 1MB
      expect(diff).toContain("value39999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("基准 ref 不存在时，错在基准上而不是静默成功", () => {
    const dir = bigRepo();
    try {
      expect(() => gitDiff("no-such-ref", dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
