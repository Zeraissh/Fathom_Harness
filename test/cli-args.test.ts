import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildStaticDoctorReport,
  CLI_NEEDS_CONFIRM_EXIT,
  CLI_VERSION,
  CliArgumentError,
  cliCanPrompt,
  cliExitCodeForRun,
  cliHelpText,
  formatCliNeedsConfirmMessage,
  formatStaticDoctor,
  isReadlineClosedError,
  parseCliArgs,
  resolveColorEnabled,
} from "../src/cli-args.js";

describe("CLI argument contract", () => {
  it("保留旧入口，并支持显式 run 子命令", () => {
    expect(parseCliArgs(["--verify", "修复", "测试"])).toMatchObject({
      command: "run", task: "修复 测试", verify: true,
    });
    expect(parseCliArgs(["run", "--auto", "修复", "测试"])).toMatchObject({
      command: "run", task: "修复 测试", auto: true,
    });
  });

  it("--parallel N 消费分离值，不再把 N 拼进 task", () => {
    expect(parseCliArgs(["run", "--plan", "--parallel", "3", "执行", "任务"]))
      .toMatchObject({ plan: true, concurrency: 3, task: "执行 任务" });
    expect(parseCliArgs(["--plan", "--parallel=2", "执行"]))
      .toMatchObject({ concurrency: 2, task: "执行" });
    expect(parseCliArgs(["--plan", "--parallel", "执行"]))
      .toMatchObject({ concurrency: "auto", task: "执行" });
  });

  it("--resume-run 可单独用于单执行者；--verify 互斥；runId 拒绝路径穿越", () => {
    expect(parseCliArgs(["--plan", "--resume-run", "cli-1", "接着跑"]))
      .toMatchObject({ plan: true, resumeRun: "cli-1", task: "接着跑" });
    expect(parseCliArgs(["--resume-run", "cli-1", "接着跑"]))
      .toMatchObject({ plan: false, resumeRun: "cli-1", task: "接着跑" });
    expect(parseCliArgs(["--plan", "--resume-run=cli-2"]))
      .toMatchObject({ resumeRun: "cli-2", task: "" });
    expect(() => parseCliArgs(["--resume-run", "cli-1", "--verify"]))
      .toThrow(/不能与 --verify/);
    expect(() => parseCliArgs(["--plan", "--resume-run", "../x", "t"]))
      .toThrow(/runId 无效/);
    expect(() => parseCliArgs(["--plan", "--resume-run"]))
      .toThrow(/需要 runId/);
    expect(cliHelpText()).toContain("--resume-run");
  });

  it("-- 分隔符后的 flag 形状属于任务正文", () => {
    expect(parseCliArgs(["run", "--", "--not-a-flag", "正文"]).task)
      .toBe("--not-a-flag 正文");
  });

  it("严格拒绝未知、重复、非法值和冲突参数", () => {
    expect(() => parseCliArgs(["--bogus", "task"])).toThrowError(CliArgumentError);
    expect(() => parseCliArgs(["--verify", "--verify", "task"])).toThrow(/参数重复/);
    expect(() => parseCliArgs(["--plan", "--parallel=0", "task"])).toThrow(/无效/);
    expect(() => parseCliArgs(["--parallel", "3", "task"])).toThrow(/只对 --plan/);
    expect(() => parseCliArgs(["--yes", "--ask", "task"])).toThrow(/互斥/);
    expect(() => parseCliArgs(["--plan", "--auto", "task"])).toThrow(/互斥/);
    expect(() => parseCliArgs(["run", "--doctor", "task"])).toThrow(/不能.*同时/);
    expect(() => parseCliArgs(["--help", "--version"])).toThrow(/命令冲突/);
  });

  it("help/version/doctor 不接受任务或 run 参数", () => {
    expect(parseCliArgs(["--help"]).command).toBe("help");
    expect(parseCliArgs(["version"]).command).toBe("version");
    expect(parseCliArgs(["doctor"]).command).toBe("doctor");
    expect(() => parseCliArgs(["--doctor", "--verify"])).toThrow(/不能与任务或 run 参数/);
    expect(cliHelpText()).toContain("npm run agent -- doctor");
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("run --help / run -h 能看用法，不报互斥", () => {
    expect(parseCliArgs(["run", "--help"])).toMatchObject({ command: "help", task: "" });
    expect(parseCliArgs(["run", "-h"])).toMatchObject({ command: "help" });
    expect(parseCliArgs(["run", "--yes", "--help"]).command).toBe("help");
    expect(() => parseCliArgs(["run", "--doctor", "task"])).toThrow(/不能.*同时/);
  });

  it("--help 写清换模型、--plan 有确认门、非 TTY 要 --yes、飞行中不能热续", () => {
    const help = cliHelpText();
    expect(help).toContain("npm run agent -- run --help");
    expect(help).toContain("AGENT_MODEL");
    expect(help).toMatch(/暂不能 --model/);
    expect(help).toMatch(/拆完计划后停下等确认再执行并核查/);
    expect(help).toMatch(/TTY 打印子任务短表并问是否开跑/);
    expect(help).toMatch(/非 TTY 须加 --yes/);
    expect(help).not.toMatch(/没有计划确认门/);
    expect(help).toMatch(/没有交互终端时请加 --yes/);
    expect(help).toMatch(/飞行中杀掉不能接着工具/);
    expect(help).toMatch(/不会当新任务重开/);
  });

  it("非 TTY 需要确认：人话 + 退出码 2，不认成 readline 栈", () => {
    expect(CLI_NEEDS_CONFIRM_EXIT).toBe(2);
    expect(formatCliNeedsConfirmMessage()).toBe("需要确认，请加 --yes");
    expect(cliCanPrompt({ stdin: { isTTY: false } })).toBe(false);
    expect(cliCanPrompt({ stdin: { isTTY: true } })).toBe(true);
    expect(isReadlineClosedError({ code: "ERR_USE_AFTER_CLOSE" })).toBe(true);
    expect(isReadlineClosedError(new Error("readline was closed"))).toBe(false);
    const cli = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts"), "utf8");
    expect(cli).toMatch(/formatCliNeedsConfirmMessage/);
    expect(cli).toMatch(/CLI_NEEDS_CONFIRM_EXIT/);
    expect(cli).toMatch(/cliCanPrompt/);
    expect(cli).toMatch(/confirmCliPlan/);
    expect(cli).toMatch(/CliPlanRejectedError/);
    expect(cli).not.toMatch(/if \(autoYes \|\| !rl\)/);
    expect(cli).toMatch(/const askEnabled = parsedArgs\.ask;/);
    expect(cli).not.toMatch(/askEnabled = parsedArgs\.ask && canPrompt/);
    expect(cli).not.toMatch(/没有交互终端，--ask 未装/);
  });

  // 发布门只校验 tag == 根 package.json；--version 打印的常量与桌面壳版本不在那道门里，
  // 三者不锁在一起就会各自漂移（REL-02 的"版本同步 CI"起步）。
  it("CLI_VERSION 与根 / cross-app 的 package.json 版本一致", () => {
    const readVersion = (path: string) =>
      (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { version: string }).version;
    expect(CLI_VERSION).toBe(readVersion("../package.json"));
    expect(CLI_VERSION).toBe(readVersion("../cross-app/package.json"));
  });
});

describe("static doctor", () => {
  it("只报告 origin、credential presence 和来源，绝不输出 key 或 URL secret", () => {
    const secret = "sk-doctor-sentinel";
    const report = buildStaticDoctorReport(
      {
        AGENT_PROVIDER: "openai",
        AGENT_MODEL: "model-x",
        OPENAI_BASE_URL: "https://api.example.test/v1",
        OPENAI_API_KEY: secret,
      },
      {
        AGENT_PROVIDER: "openai",
        AGENT_MODEL: "old-model",
        OPENAI_API_KEY: secret,
      },
    );
    const text = formatStaticDoctor(report);

    expect(report.ok).toBe(true);
    expect(text).toContain("provider: openai (source: .env-or-environment-same-value)");
    expect(text).toContain("model: model-x (source: environment-overrides-.env)");
    expect(text).toContain("base_url_origin: https://api.example.test");
    expect(text).toContain("credential_present: yes");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("/v1");
  });

  it("远程 HTTP、127 前缀域名和 URL query 均不能通过静态 doctor", () => {
    for (const endpoint of [
      "http://api.attacker.example/v1",
      "http://127.attacker.example/v1",
      "https://api.example.test/v1?token=url-secret",
    ]) {
      const text = formatStaticDoctor(buildStaticDoctorReport({
        AGENT_PROVIDER: "openai",
        OPENAI_BASE_URL: endpoint,
        OPENAI_API_KEY: "key-secret",
      }, {}));
      expect(text).toContain("base_url_origin: <invalid>");
      expect(text).not.toContain("attacker");
      expect(text).not.toContain("url-secret");
      expect(text).not.toContain("key-secret");
    }
  });

  it("缺 key、非法 provider 或带 userinfo 的 URL fail closed，且不回显原始 URL", () => {
    const report = buildStaticDoctorReport({
      AGENT_PROVIDER: "unknown",
      ANTHROPIC_BASE_URL: "https://user:password@example.test/v1",
    }, {});
    const text = formatStaticDoctor(report);

    expect(report.ok).toBe(false);
    expect(text).toContain("provider: <invalid>");
    expect(text).toContain("base_url_origin: <invalid>");
    expect(text).toContain("credential_present: no (source: missing)");
    expect(text).not.toContain("password");
    expect(text).not.toContain("user:");
  });

  it("provider/model 的控制字符不会形成终端注入", () => {
    const text = formatStaticDoctor(buildStaticDoctorReport({
      AGENT_PROVIDER: "\u001b[31mopenai",
      AGENT_MODEL: "model\rforged-line",
      ANTHROPIC_API_KEY: "present-but-never-print",
    }, {}));
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("forged-line");
    expect(text).not.toContain("present-but-never-print");
    expect(text.match(/<invalid>/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("doctor 与 runtime 对 provider/model 首尾空白保持同一 fail-closed 语义", () => {
    const report = buildStaticDoctorReport({
      AGENT_PROVIDER: " openai ",
      AGENT_MODEL: " model-with-spaces ",
      ANTHROPIC_API_KEY: "present",
    }, {});
    expect(report.ok).toBe(false);
    expect(report.provider.value).toBe("<invalid>");
    expect(report.model.value).toBe("<invalid>");
  });
});

/**
 * 退出码口径（2026-09-18 走查 F1/H1）：终态失败 ≠ 进程成功。
 *
 * 旧病：断端点跑任务输出 `■ error (0 turns)` 而退出码 0——CI 的
 * `if [ $? -ne 0 ]` 把"端点挂了"当成功，消费方被迫 parse stdout。
 * 口径：只有 completed 是 0；completed 但--verify 核查未通过也是 1；
 * plan_rejected 不表态（抛错路径已定 2，别覆盖）。
 */
describe("退出码口径（CI 消费者）", () => {
  it("只有 completed 是 0；核查未通过与一切非 completed 终态都是 1", () => {
    expect(cliExitCodeForRun({ stopReason: "completed" })).toBe(0);
    expect(cliExitCodeForRun({ stopReason: "completed", finalPassed: true })).toBe(0);
    expect(cliExitCodeForRun({ stopReason: "completed", finalPassed: null })).toBe(0);
    expect(cliExitCodeForRun({ stopReason: "completed", finalPassed: false })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "aborted" })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "error" })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "max_turns" })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "partial" })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "budget_exhausted" })).toBe(1);
    expect(cliExitCodeForRun({ stopReason: "stalled" })).toBe(1);
  });

  it("没有终态事实时不表态；plan_rejected 让抛错路径的 2 生效", () => {
    expect(cliExitCodeForRun(null)).toBeUndefined();
    expect(cliExitCodeForRun(undefined)).toBeUndefined();
    expect(cliExitCodeForRun({})).toBeUndefined();
    expect(cliExitCodeForRun({ stopReason: null })).toBeUndefined();
    expect(cliExitCodeForRun({ stopReason: "plan_rejected" })).toBeUndefined();
  });

  it("--help 写明退出码表（消费方不用猜）", () => {
    const help = cliHelpText();
    expect(help).toMatch(/退出码：0=completed/);
    expect(help).toMatch(/1=（核查未通过|其它终态）/);
    expect(help).toMatch(/130\/143=信号/);
  });
});

/**
 * H2 · 机器可读出口（2026-09-18 走查）：--json / --quiet / 颜色决策。
 *
 * 旧病：重定向到文件后 ANSI 原样落盘（手写 \x1b 常量、无 isTTY/NO_COLOR 判断）；
 * 唯一的机器可读出口（.agent-run-history 档案）藏在启动 dim 文案里，--help 不提。
 */
describe("机器可读出口（--json/--quiet/NO_COLOR）", () => {
  it("--json / --quiet 可解析；二者同给时 json 优先且不报互斥", () => {
    expect(parseCliArgs(["run", "--json", "任务"])).toMatchObject({ json: true, quiet: false });
    expect(parseCliArgs(["--quiet", "--yes", "任务"])).toMatchObject({ quiet: true, json: false });
    expect(parseCliArgs(["--json", "--quiet", "任务"])).toMatchObject({ json: true, quiet: true });
    // 旧入口（无 run 子命令）同样接受
    expect(parseCliArgs(["--json", "任务"])).toMatchObject({ json: true, task: "任务" });
  });

  it("颜色决策：FORCE_COLOR 显式优先 > NO_COLOR 非空 > isTTY（管道即关）", () => {
    expect(resolveColorEnabled({}, true)).toBe(true);
    expect(resolveColorEnabled({}, false)).toBe(false);
    expect(resolveColorEnabled({ NO_COLOR: "1" }, true)).toBe(false);
    // NO_COLOR 规范：存在且非空才算；空串不生效
    expect(resolveColorEnabled({ NO_COLOR: "" }, true)).toBe(true);
    expect(resolveColorEnabled({ FORCE_COLOR: "1" }, false)).toBe(true);
    expect(resolveColorEnabled({ FORCE_COLOR: "0" }, true)).toBe(false);
    expect(resolveColorEnabled({ FORCE_COLOR: "1", NO_COLOR: "1" }, false)).toBe(true);
  });

  it("--help 写明机器可读出口与档案路径（消费方不用考古）", () => {
    const help = cliHelpText();
    expect(help).toMatch(/--json/);
    expect(help).toMatch(/run_result/);
    expect(help).toMatch(/--quiet/);
    expect(help).toMatch(/NO_COLOR/);
    expect(help).toMatch(/\.agent-run-history/);
    expect(help).toMatch(/\.agent-runs\.jsonl/);
  });
});
