/**
 * 圈内只读 bash 免审批卡（2026-09-18 走查第一刀）。
 *
 * 分两层：
 * - 分类器单测（纯函数表）：allow 名单 + 圈禁 + 凭据形状 + 动态构造 + 逐命令守卫；
 * - loop 接线行为锁：免问路径不产 approval_request 而产 approval_auto；非只读/圈外
 *   照常弹卡；显式关闭（verifier/planner 的关法）回到审批门。
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentLoop } from "../src/loop.js";
import { classifyReadOnlyShellCommand } from "../src/tools/read-only-shell.js";
import type { TurnEvent } from "../src/types.js";
import { FakeModelClient, fakeMessage, makeTool, textBlock, toolUseBlock } from "./helpers.js";

describe("classifyReadOnlyShellCommand", () => {
  let workdir: string;

  afterEach(async () => {
    if (workdir) await rm(workdir, { recursive: true, force: true });
  });

  async function freshWorkdir(): Promise<string> {
    workdir = await mkdtemp(path.join(tmpdir(), "read-only-shell-"));
    return workdir;
  }

  describe("allow：无写能力的命令（含走查原文的三张卡）", () => {
    const allowed = [
      "ls -la",
      "cat -A hello-code.txt",
      "od -c hello-code.txt",
      // 走查基线 §2.1 卡 1 原文（含 2>/dev/null + 管道 + 分号链）
      'ls -la; echo "---"; cat -A hello-code.txt 2>/dev/null | head -20',
      // 卡 2 原文
      'ls -la; echo "---"; cat -A hello-code.txt; echo "---"; od -c hello-code.txt',
      // 卡 3 原文
      'cat -A hello-seed.txt; echo "==="; cat preview-seed.html',
      "od -c hello-code.txt 2>&1",
      "du -sh . 2>/dev/null",
      'grep -rn "readOnly" src | head -20',
      "wc -l src/loop.ts | sort -n",
      'find . -name "*.ts" -type f',
      "git status --short",
      "git diff --stat",
      "git log --oneline -5",
      "md5sum hello-code.txt",
      "cat .env.example",
      "ls -la > /dev/null",
      // 2026-09-18 真机新摩擦：模型习惯 `cd <圈内目录> && …` 链式读。
      // cd 的目标由通用圈禁兜住（`..`/`~`/绝对越界都在参数检查里弹卡）。
      "cd sub && cat f",
      'cd "sub dir" && wc -l a.txt',
      'cd web-a && echo "===" && wc -l hello-code.txt',
      // 其它无写能力的常见读工具
      "jq . package.json",
      "jq -r .name package.json",
      "test -f a.txt && echo yes",
    ];
    for (const cmd of allowed) {
      it(`allow: ${cmd}`, async () => {
        const root = await freshWorkdir();
        const v = classifyReadOnlyShellCommand(cmd, root);
        expect(v.allow, v.reason).toBe(true);
      });
    }

    it.skipIf(process.platform !== "win32")("allow: ls -la > NUL（Windows 空设备）", async () => {
      const root = await freshWorkdir();
      expect(classifyReadOnlyShellCommand("ls -la > NUL", root).allow).toBe(true);
    });
  });

  describe("ask：非只读命令", () => {
    const asked = [
      "rm -rf hello-code.txt",
      "echo hi > out.txt",
      "ls > out.txt",
      'python -c "print(1)"',
      "sed -i s/a/b/ hello-code.txt",
      "xargs rm",
      "env",
      'bash -c "ls"',
      "tee out.txt",
      "chmod +x f",
      "touch new.txt",
      "./script.sh",
      "ls -la 2> err.log",
    ];
    for (const cmd of asked) {
      it(`ask: ${cmd}`, async () => {
        const root = await freshWorkdir();
        // 写重定向在进段校验前就被拦，所以这里只断言"不自动放行"
        expect(classifyReadOnlyShellCommand(cmd, root).allow).toBe(false);
      });
    }
  });

  describe("ask：圈禁与凭据形状", () => {
    const asked = [
      "cat ../outside.txt",
      "cat /etc/hosts",
      "cat ~/.ssh/id_rsa",
      "find / -name CONFIG",
      "cat .env",
      "cat id_rsa",
      "cat server.pem",
      "test -f /etc/passwd",
      "jq . /etc/x.json",
    ];
    for (const cmd of asked) {
      it(`ask: ${cmd}`, async () => {
        const root = await freshWorkdir();
        expect(classifyReadOnlyShellCommand(cmd, root).allow).toBe(false);
      });
    }
  });

  describe("ask：动态构造（静态判不准）", () => {
    const asked = [
      "cat $(echo hello-code.txt)",
      "ls `pwd`",
      "cat $HOME/.bashrc",
      'cat "unclosed',
      "ls -la < input.txt",
      "echo hi && rm -rf x",
      "ls & rm -rf x",
      "(ls -la)",
    ];
    for (const cmd of asked) {
      it(`ask: ${cmd}`, async () => {
        const root = await freshWorkdir();
        expect(classifyReadOnlyShellCommand(cmd, root).allow).toBe(false);
      });
    }
  });

  describe("ask：cd 的四个洞（无参跳 HOME / `-` 跳 OLDPWD / 多参 / 空串）", () => {
    const asked = [
      "cd",
      "cd -",
      "cd a b",
      'cd ""',
      "cd ..",
      "cd ../outside",
      "cd /etc",
      "cd ~",
    ];
    for (const cmd of asked) {
      it(`ask: ${cmd}`, async () => {
        const root = await freshWorkdir();
        expect(classifyReadOnlyShellCommand(cmd, root).allow).toBe(false);
      });
    }
  });

  describe("ask：逐命令守卫（名字在名单里，参数能写）", () => {
    const asked = [
      "find . -delete",
      "find . -name x -exec rm {} \\;",
      "sort -o out in",
      "sort --output=out in",
      "uniq in out",
      "git diff --output=f",
      "git checkout main",
    ];
    for (const cmd of asked) {
      it(`ask: ${cmd}`, async () => {
        const root = await freshWorkdir();
        expect(classifyReadOnlyShellCommand(cmd, root).allow).toBe(false);
      });
    }
  });

  it("readRoots 里的绝对路径可放行（只读根语义与 read_file 一致）", async () => {
    const root = await freshWorkdir();
    const extra = await freshWorkdir();
    const target = path.join(extra, "lib.kicad_sym").replace(/\\/g, "/");
    const v = classifyReadOnlyShellCommand(`cat "${target}"`, root, [extra]);
    expect(v.allow, v.reason).toBe(true);
    expect(classifyReadOnlyShellCommand(`cat "${target}"`, root).allow).toBe(false);
  });
});

describe("圈内只读 bash 免审批卡（loop 接线）", () => {
  async function runWith(
    command: string,
    opts?: { readOnlyShellAutoAllow?: boolean },
  ): Promise<TurnEvent[]> {
    const workdir = await mkdtemp(path.join(tmpdir(), "ro-shell-loop-"));
    try {
      const model = new FakeModelClient([
        fakeMessage([toolUseBlock("tu_1", "bash", { command })], "tool_use"),
        fakeMessage([textBlock("done")], "end_turn"),
      ]);
      const loop = new AgentLoop(
        {
          systemPrompt: "test system",
          workdir,
          ...(opts?.readOnlyShellAutoAllow !== undefined
            ? { readOnlyShellAutoAllow: opts.readOnlyShellAutoAllow }
            : {}),
          tools: [
            makeTool({
              name: "bash",
              permission: "ask",
              parallelSafe: false,
              inputSchema: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"],
              },
            }),
          ],
        },
        model,
      );
      const events: TurnEvent[] = [];
      for await (const e of loop.run("go")) {
        events.push(e);
        if (e.type === "approval_request") e.respond("allow");
      }
      return events;
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  }

  it("只读命令：不产 approval_request，产 approval_auto，工具照跑", async () => {
    const events = await runWith('ls -la; echo "---"; cat -A hello-code.txt 2>/dev/null | head -20');
    expect(events.some((e) => e.type === "approval_request")).toBe(false);
    const auto = events.find((e) => e.type === "approval_auto");
    expect(auto).toBeTruthy();
    if (auto?.type === "approval_auto") {
      expect(auto.rule).toBe("read-only-shell");
      expect(auto.name).toBe("bash");
    }
    expect(events.some((e) => e.type === "tool_result" && !e.result.isError)).toBe(true);
  });

  it("非只读命令照常弹卡", async () => {
    const events = await runWith("rm -rf hello-code.txt");
    expect(events.some((e) => e.type === "approval_request")).toBe(true);
    expect(events.some((e) => e.type === "approval_auto")).toBe(false);
  });

  it("圈外读照常弹卡", async () => {
    const events = await runWith("cat ../outside.txt");
    expect(events.some((e) => e.type === "approval_request")).toBe(true);
  });

  it("显式关闭（verifier/planner 的关法）：只读命令也回到审批门", async () => {
    const events = await runWith("ls -la", { readOnlyShellAutoAllow: false });
    expect(events.some((e) => e.type === "approval_request")).toBe(true);
    expect(events.some((e) => e.type === "approval_auto")).toBe(false);
  });
});

describe("只读 role 装配锁", () => {
  it("verifier / planner（两处装配）都显式关闭免问", async () => {
    const verifier = await readFile(path.join(process.cwd(), "src/verifier.ts"), "utf8");
    const planner = await readFile(path.join(process.cwd(), "src/planner.ts"), "utf8");
    expect(verifier).toMatch(/readOnlyShellAutoAllow:\s*false/);
    expect((planner.match(/readOnlyShellAutoAllow:\s*false/g) ?? []).length).toBe(2);
  });
});
