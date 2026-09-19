import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnvFile } from "./env-check.js";
import { inspectProviderEndpoint } from "./provider-config.js";

export const CLI_VERSION = "1.3.0";

export type CliCommand = "run" | "help" | "version" | "doctor";

export interface ParsedCliArgs {
  command: CliCommand;
  task: string;
  autoYes: boolean;
  verify: boolean;
  plan: boolean;
  auto: boolean;
  ask: boolean;
  concurrency: number | "auto";
  parallelSpecified: boolean;
  /** 同 run 续跑：--plan 续半截 DAG，否则续单执行者检查点 */
  resumeRun: string | null;
  /** --json：stdout 只出 JSONL（事件 + run_result），人话改道 stderr */
  json: boolean;
  /** --quiet：stdout 只留终局汇总，过程人话改道 stderr（与 --json 同给时 json 优先） */
  quiet: boolean;
}

export class CliArgumentError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "CliArgumentError";
  }
}

const RUN_FLAGS = new Set(["--yes", "--verify", "--plan", "--auto", "--ask", "--json", "--quiet"]);
const RUN_ID_RE = /^[\w.-]+$/;
const COMMAND_FLAGS = new Map<string, CliCommand>([
  ["--help", "help"], ["-h", "help"],
  ["--version", "version"], ["-V", "version"],
  ["--doctor", "doctor"],
]);

/** 非 TTY / readline 已关且需要确认：人话退出，不摔栈。 */
export const CLI_NEEDS_CONFIRM_EXIT = 2;

/**
 * 终态口径（走查 F1/H1）：run 终态 → CLI 进程退出码。undefined = 不表态。
 *
 * 只有 completed 是 0；--verify 下 completed 但核查未通过也是 1。plan_rejected
 * 不表态——抛错路径已定 2，这里再赋值会把"需要确认"盖成"跑失败了"。
 * 依据是 run 的 stopReason（台账/档案里同一份事实），不是 stdout 文案。
 */
export function cliExitCodeForRun(
  facts: { stopReason?: string | null; finalPassed?: boolean | null } | null | undefined,
): number | undefined {
  const reason = facts?.stopReason;
  if (!reason || reason === "plan_rejected") return undefined;
  if (reason === "completed") return facts?.finalPassed === false ? 1 : 0;
  return 1;
}

export function formatCliNeedsConfirmMessage(): string {
  return "需要确认，请加 --yes";
}

/**
 * 中断提示（H4 · 走查 2026-09-18）：优雅中断此前静默消失——退出 130、什么也不说。
 * 有热续检查点就给续跑命令（检查点事实来自活 durable）；没有就说清不能热续，
 * 不含糊其辞。
 */
export function formatSignalNotice(
  signal: string,
  facts: { runId?: string | null; hasCheckpoint?: boolean },
): string {
  const tail = facts.runId ? `（run ${facts.runId}）` : "";
  if (facts.hasCheckpoint && facts.runId) {
    return `已中断（${signal}）${tail}：已提交的检查点保留——继续：--resume-run ${facts.runId}`;
  }
  return `已中断（${signal}）${tail}：没有已提交的检查点，这次运行不能热续`;
}

export function cliCanPrompt(
  io: { stdin?: { isTTY?: boolean | undefined } } = process,
): boolean {
  return Boolean(io.stdin?.isTTY);
}

export function isReadlineClosedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? (err as { code?: unknown }).code : undefined;
  return code === "ERR_USE_AFTER_CLOSE";
}

function emptyRunFields(): Omit<ParsedCliArgs, "command"> {
  return {
    task: "",
    autoYes: false,
    verify: false,
    plan: false,
    auto: false,
    ask: false,
    concurrency: "auto",
    parallelSpecified: false,
    resumeRun: null,
    json: false,
    quiet: false,
  };
}

function parseParallel(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new CliArgumentError(`--parallel 的值无效: "${raw}"（需为 >=1 的整数）`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CliArgumentError(`--parallel 的值无效: "${raw}"（需为 >=1 的整数）`);
  }
  return value;
}

/**
 * 严格、无副作用的 CLI 参数解析。`run` 子命令是新入口；省略它仍兼容旧调用。
 */
export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const args = [...argv];
  let explicitRun = false;
  let command: CliCommand = "run";
  if (args[0] === "run") {
    explicitRun = true;
    args.shift();
  } else if (args[0] === "doctor" || args[0] === "help" || args[0] === "version") {
    command = args.shift() as CliCommand;
  } else if (args[0] && !args[0].startsWith("-") && ["setup", "profile"].includes(args[0])) {
    throw new CliArgumentError(`子命令 "${args[0]}" 尚未实现；当前可用: run | doctor | help | version`);
  }

  const selectedCommands = new Set<CliCommand>(command === "run" ? [] : [command]);
  const seen = new Set<string>();
  const taskParts: string[] = [];
  let afterDelimiter = false;
  let parallelSpecified = false;
  let concurrency: number | "auto" = "auto";
  let resumeRun: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (afterDelimiter) {
      taskParts.push(arg);
      continue;
    }
    if (arg === "--") {
      afterDelimiter = true;
      continue;
    }
    const selected = COMMAND_FLAGS.get(arg);
    if (selected) {
      // `run --help` / `run --version` 是看用法，不是互斥错误。
      if (explicitRun && selected !== "help" && selected !== "version") {
        throw new CliArgumentError(`run 不能与 ${arg} 同时使用`);
      }
      selectedCommands.add(selected);
      command = selected;
      continue;
    }
    if (RUN_FLAGS.has(arg)) {
      if (seen.has(arg)) throw new CliArgumentError(`参数重复: ${arg}`);
      seen.add(arg);
      continue;
    }
    if (arg === "--resume-run" || arg.startsWith("--resume-run=")) {
      if (resumeRun) throw new CliArgumentError("参数重复: --resume-run");
      let raw: string | undefined;
      if (arg.includes("=")) raw = arg.slice(arg.indexOf("=") + 1);
      else {
        raw = args[i + 1];
        if (raw !== undefined && !raw.startsWith("-")) i += 1;
        else raw = undefined;
      }
      if (!raw) throw new CliArgumentError("--resume-run 需要 runId");
      if (!RUN_ID_RE.test(raw) || raw.includes("..")) {
        throw new CliArgumentError(`--resume-run 的 runId 无效: "${raw}"`);
      }
      resumeRun = raw;
      continue;
    }
    if (arg === "--parallel" || arg.startsWith("--parallel=")) {
      if (parallelSpecified) throw new CliArgumentError("参数重复: --parallel");
      parallelSpecified = true;
      if (arg.includes("=")) {
        concurrency = parseParallel(arg.slice(arg.indexOf("=") + 1));
      } else {
        const next = args[i + 1];
        if (next !== undefined && /^\d+$/.test(next)) {
          concurrency = parseParallel(next);
          i += 1;
        }
      }
      continue;
    }
    if (arg.startsWith("-")) throw new CliArgumentError(`未知参数: ${arg}`);
    taskParts.push(arg);
  }

  if (selectedCommands.size > 1) {
    throw new CliArgumentError(`命令冲突: ${[...selectedCommands].join(" 与 ")}`);
  }
  if (command === "help" || command === "version") {
    return { command, ...emptyRunFields() };
  }
  const hasRunOptions = seen.size > 0 || parallelSpecified || resumeRun != null;
  if (command !== "run" && (hasRunOptions || taskParts.length > 0)) {
    throw new CliArgumentError(`${command} 不能与任务或 run 参数同时使用`);
  }

  const autoYes = seen.has("--yes");
  const ask = seen.has("--ask");
  const plan = seen.has("--plan");
  if (autoYes && ask) throw new CliArgumentError("--yes 与 --ask 互斥");
  if (plan && seen.has("--auto")) {
    throw new CliArgumentError("--auto 与 --plan 互斥：plan 会由 planner 为每个子任务选择 pack");
  }
  if (parallelSpecified && !plan) {
    throw new CliArgumentError("--parallel 只对 --plan 生效（并行度是子任务调度的属性）");
  }
  if (resumeRun && seen.has("--verify")) {
    throw new CliArgumentError("--resume-run 不能与 --verify 同时使用（同 run 热恢复不接核查）");
  }

  return {
    command,
    task: taskParts.join(" ").trim(),
    autoYes,
    verify: seen.has("--verify"),
    plan,
    auto: seen.has("--auto"),
    ask,
    concurrency,
    parallelSpecified,
    resumeRun,
    json: seen.has("--json"),
    quiet: seen.has("--quiet"),
  };
}

/**
 * 颜色决策（H2 · 走查）。优先级：FORCE_COLOR 显式 > NO_COLOR 非空 > isTTY。
 * NO_COLOR 规范（no-color.org）：存在**且非空**才算数，空串不生效。
 * 消费场景：管道/重定向自动关色，ANSI 不再原样落盘。
 */
export function resolveColorEnabled(
  env: { NO_COLOR?: string | undefined; FORCE_COLOR?: string | undefined },
  isTTY: boolean,
): boolean {
  const force = env.FORCE_COLOR;
  if (force === "0" || force === "false") return false;
  if (force) return true;
  if (env.NO_COLOR) return false;
  return isTTY;
}

export function cliHelpText(): string {
  return [
    "Agent_Design CLI",
    "",
    "Usage:",
    "  npm run agent -- run [options] \"task description\"",
    "  npm run agent -- run --help",
    "  npm run agent -- doctor",
    "  npm run agent -- --help | --version",
    "",
    "Compatibility:",
    "  npm run cli -- [options] \"task description\"",
    "",
    "Run options:",
    "  --yes          自动批准工具请求（仅用于明确接受风险的无人值守运行）",
    "  --verify       独立核查，未通过时有界返工",
    "  --plan         拆完计划后停下等确认再执行并核查。TTY 打印子任务短表并问是否开跑（y/n，可选改一行标题）；非 TTY 须加 --yes 才自动开跑，否则退出码 2 并印「需要确认，请加 --yes」",
    "  --parallel N   plan 并行度；也接受 --parallel=N，省略 N 表示 auto",
    "  --auto         自动选择单领域 pack",
    "  --ask          允许 agent 在执行前集中提问（与 --yes 互斥）",
    "  --resume-run ID  同 run 热续。须有已提交检查点；飞行中杀掉不能接着工具。读不到检查点会停并印原任务/终态，不会当新任务重开",
    "  --             后续内容一律视为任务文本",
    "",
    "Model:",
    "  命令行暂不能 --model / --api-key / --workdir。",
    "  换模型：环境变量 AGENT_MODEL（可选 AGENT_PROVIDER、ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL，或 OPENAI_API_KEY / OPENAI_BASE_URL）。",
    "  工作目录即当前 cwd。doctor 可查看当前 provider / model / 是否有 Key。",
    "",
    "Confirm:",
    "  没有交互终端时请加 --yes，否则会停在确认（退出码 2），不会摔 readline 栈。",
    "",
    "Exit codes:",
    "  退出码：0=completed（--verify 时还须核查通过）；1=（核查未通过/其它一切终态：中断、预算耗尽、撞轮次、异常等）；2=需要确认（非 TTY 计划门）；130/143=信号中断。",
    "  CI 请以退出码判定成败；stopReason 原文在各 run 的台账与 .agent-run-history 档案里。",
    "",
    "Interrupt:",
    "  中断：控制台 Ctrl+C = 优雅中断（落检查点、退出 130/143，并打印能不能 --resume-run 续跑）；",
    "  Windows 上 kill / 任务管理器属硬杀——不落检查点、不能热续（这是 OS 行为，宿主拗不过）。",
    "",
    "Run from another project:",
    "  命令行暂不能 --workdir，工作目录 = 当前 cwd。在别的项目里跑：",
    "  cd 你的项目 && node <仓库>/node_modules/tsx/dist/cli.mjs --env-file <仓库>/.env <仓库>/src/cli.ts run \"任务\"",
    "  或构建后走 bin：npx agent-harness run \"任务\"（bin → dist/src/cli.js，需先在仓库里 npm run build）",
    "",
    "Machine-readable output:",
    "  --json         stdout 只输出 JSONL：每个执行事件一行 {\"ts\",\"source\",\"event\"}（逐字增量不落流），终局一行 {type:\"run_result\", stopReason, turns, finalPassed, exitCode, …}；人话装饰一律改走 stderr（含 FORCE_COLOR 强制开色时，JSONL 依旧纯净）",
    "  --quiet        过程人话（启动配置/轮次标记/工具行/重试）改走 stderr；stdout 只留终局汇总；错误仍在 stderr",
    "  颜色：管道/重定向自动关；NO_COLOR 非空强制关（no-color.org 口径：空串不算）；FORCE_COLOR=1 强制开",
    "  完整档案（机器可读资产，比 stdout 更全）：<cwd>/.agent-run-history/<runId>/ 下的 events.jsonl / meta.json / trace.jsonl / transcript.jsonl；run 级台账逐行 JSON 在 <cwd>/.agent-runs.jsonl",
    "",
    "Doctor is static: it performs no network request and starts no execution worker.",
  ].join("\n");
}

export type DoctorSource =
  | "default"
  | "environment"
  | ".env-or-environment-same-value"
  | "environment-overrides-.env"
  | "missing";

export interface StaticDoctorReport {
  provider: { value: string; source: DoctorSource };
  model: { value: string; source: DoctorSource };
  baseUrlOrigin: { value: string; source: DoctorSource };
  credential: { present: boolean; source: DoctorSource };
  ok: boolean;
}

function sourceFor(
  key: string,
  env: NodeJS.ProcessEnv,
  declared: Record<string, string>,
  fallback: DoctorSource,
): DoctorSource {
  const effective = env[key];
  if (effective === undefined) return fallback;
  if (!(key in declared)) return "environment";
  return declared[key] === effective
    ? ".env-or-environment-same-value"
    : "environment-overrides-.env";
}

export function readDeclaredEnv(cwd = process.cwd()): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(resolve(cwd, ".env"), "utf8"));
  } catch {
    return {};
  }
}

/** 只解析本地配置，不创建 SDK client、不联网、不探测 execution backend。 */
export function buildStaticDoctorReport(
  env: NodeJS.ProcessEnv = process.env,
  declared: Record<string, string> = readDeclaredEnv(),
): StaticDoctorReport {
  const rawProviderValue = env.AGENT_PROVIDER ?? "anthropic";
  const providerSource = sourceFor("AGENT_PROVIDER", env, declared, "default");
  const rawModelValue = env.AGENT_MODEL ?? "claude-opus-4-8";
  const modelSource = sourceFor("AGENT_MODEL", env, declared, "default");
  const providerValid = rawProviderValue === "anthropic" || rawProviderValue === "openai";
  const modelValid = rawModelValue.length > 0 && rawModelValue.length <= 200 &&
    rawModelValue === rawModelValue.trim() &&
    !/[\u0000-\u001f\u007f]/.test(rawModelValue);
  // 无效外部输入不原样写回终端，避免控制字符/ANSI escape 注入日志。
  const providerValue = providerValid ? rawProviderValue : "<invalid>";
  const modelValue = modelValid ? rawModelValue : "<invalid>";
  const baseKey = rawProviderValue === "openai" ? "OPENAI_BASE_URL" : "ANTHROPIC_BASE_URL";
  const credentialKey = rawProviderValue === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const configuredBase = env[baseKey]?.trim();
  const rawBase = configuredBase ||
    (providerValue === "openai" ? "https://api.openai.com" : "https://api.anthropic.com");
  const baseSource = configuredBase ? sourceFor(baseKey, env, declared, "default") : "default";
  const inspectedEndpoint = inspectProviderEndpoint(rawBase);
  const origin = inspectedEndpoint.origin;
  const baseValid = inspectedEndpoint.valid;
  const credential = env[credentialKey];
  const credentialPresent = Boolean(credential?.trim());
  return {
    provider: { value: providerValue, source: providerSource },
    model: { value: modelValue, source: modelSource },
    baseUrlOrigin: { value: origin, source: baseSource },
    credential: {
      present: credentialPresent,
      source: sourceFor(credentialKey, env, declared, "missing"),
    },
    ok: providerValid && modelValid && baseValid && credentialPresent,
  };
}

export function formatStaticDoctor(report: StaticDoctorReport): string {
  return [
    `provider: ${report.provider.value} (source: ${report.provider.source})`,
    `model: ${report.model.value} (source: ${report.model.source})`,
    `base_url_origin: ${report.baseUrlOrigin.value} (source: ${report.baseUrlOrigin.source})`,
    `credential_present: ${report.credential.present ? "yes" : "no"} (source: ${report.credential.source})`,
  ].join("\n");
}
