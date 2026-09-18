import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bashTool, shellDescription } from "../src/tools/bash.js";

/**
 * H7 · shell 描述去误导（2026-09-18 走查）。
 *
 * 旧病：注入给模型的是 `host execution is REPORT-ONLY / UNISOLATED` + 每条 bash
 * 回执带 `state=report-only`。真机实录（隔离宿主 4203 的对话原文）：模型三次犹豫——
 * "Note the shell is report-only. Let's try running node."、"does edit_file actually
 * write?"——把"报告制"读成了"只读/不执行"。透明度（SAFE-05）必须保留，词汇换成
 * 不会被读歪的说法：直接执行、无沙箱、副作用是真的。
 */
describe("H7 · shell 描述去误导", () => {
  it("report 模式：不再出现 REPORT-ONLY，明说直接执行 + 无沙箱", () => {
    const d = shellDescription({ AGENT_EXECUTION_ISOLATION: "report" } as NodeJS.ProcessEnv);
    expect(d).not.toMatch(/REPORT-ONLY/);
    expect(d).toMatch(/run directly|directly on the host/i); // 说清"会执行"
    expect(d).toMatch(/no sandbox|unsandboxed/i);
  });

  it("off 模式：同样不含误导词（两者对模型是同一件事：直跑、无沙箱）", () => {
    const d = shellDescription({ AGENT_EXECUTION_ISOLATION: "off" } as NodeJS.ProcessEnv);
    expect(d).not.toMatch(/REPORT-ONLY/);
    expect(d).toMatch(/no sandbox|unsandboxed/i);
  });

  it("required（OCI）描述保持原样——fail-closed 语义不动", () => {
    expect(
      shellDescription({ AGENT_EXECUTION_ISOLATION: "required" } as NodeJS.ProcessEnv),
    ).toContain("required OCI boundary");
  });

  it("bash 工具描述带回执释义：state=report-only 不是「只读」（模型读得懂的那一句）", () => {
    // 描述按测试进程默认 env（未设 → report）计算，正是真机注入的那份
    expect(bashTool.description).not.toMatch(/REPORT-ONLY \/ UNISOLATED/);
    expect(bashTool.description).toMatch(/state=report-only/);
    expect(bashTool.description).toMatch(/does NOT mean .*read-only|not read-only/i);
  });

  it("CLI 启动行不再说 not run-isolated（人话同上）", () => {
    const cli = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts"),
      "utf8",
    );
    expect(cli).not.toMatch(/not run-isolated/);
    expect(cli).toMatch(/run directly on the host|no sandbox/i);
  });
});
