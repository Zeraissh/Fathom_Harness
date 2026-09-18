/**
 * 只读 shell 命令分类器（2026-09-18「砍审批摩擦」第一刀）。
 *
 * 走查基线：`eval/persona-ux/_audit-20260918/rewalk/rewalk-evidence.md` §2.1——
 * 一次「改一行」的真 run 弹 5 张批准卡，其中 3 张只是 `cat`/`ls`/`od` 读文件。
 * 本模块给执行者用：**圈内只读命令可免审批卡；判不准就弹卡**（人仍然能批，
 * 不是 fail-deny），且每次自动放行由 loop 记 `approval_auto` 事件留痕。
 *
 * 与 verifier 的 `readOnlyCommands` 白名单是两件事，别合并：
 * - verifier 白名单是领域声明的「核查用最小命令集」，前缀匹配、拒绝一切链式；
 * - 本分类器允许 `;` / `&&` / `|` 串起来的**全部只读段**——走查里被卡的正是
 *   `ls -la; echo "---"; cat -A f | head -20` 这种形状。每一段都要过白名单 +
 *   圈禁 + 无动态构造，一段不过即整条弹卡。
 *
 * 纪律（保守起步，白名单「只进不出」改动需过评审）：
 * - 名单里的命令全无写能力。`sed` 带逐条写向量守卫（`-i/--in-place`、脚本内
 *   `w/W` 写命令——含 `s///w file` 与 `2w file` 地址形）才在名单；`awk`（程序内
 *   重定向）、`tee`、`xargs`、`env`、`bash -c` 一类能写或能执行的一律不在名单。
 * - 重定向目标只有 null sink（`/dev/null`、`NUL`）算无害；`<` 输入重定向一律弹卡。
 * - 任何 `$` / 反引号 / 未闭合引号 → 静态判不准 → 弹卡。
 * - 参数里任何静态判不出在 workdir/readRoots 内的路径（绝对越界、`..`、`~`）→ 弹卡。
 * - 凭据形状文件名（`.env` / `id_rsa` / `*.pem`…，复用 `credentialLikeName`）→ 弹卡。
 *   `read_file` 对这类文件是硬拒；bash 此前靠「审批门后、操作员看得见命令」兜底，
 *   **免问之后那层没了**，所以这里必须弹卡而不是放行——否则等于多开一条
 *   无人看见的读密钥路径（fs-util.ts `credentialLikeName` 头注防的就是这个）。
 * - 看不懂的构造（裸 `&`、子 shell 括号、重定向缺目标）→ 弹卡。
 */
import { credentialLikeName } from "./fs-util.js";
import {
  extractWriteRedirectTargets,
  isNullSink,
  pathOutsideWorkdir,
  readShellToken,
  splitShellSegments,
  unquote,
} from "./shell-confine.js";

export interface ReadOnlyShellVerdict {
  /** true = 可免审批卡自动放行；false = 交回审批门（human 仍然可以批）。 */
  allow: boolean;
  /** 判词：进 `approval_auto` 事件 / 批准卡提示的留痕。 */
  reason: string;
}

/** 无写能力的命令（保守起步；加入新名字前先问「它能写吗」。） */
export const READ_ONLY_SHELL_COMMANDS: ReadonlySet<string> = new Set([
  "ls", "cat", "head", "tail", "wc", "od", "xxd", "file", "stat", "pwd",
  "grep", "rg", "cut", "tr", "diff", "cmp", "strings", "du", "df", "tree",
  "which", "whereis", "date", "basename", "dirname", "realpath",
  "md5sum", "sha1sum", "sha256sum", "echo", "sed", "sort", "uniq", "find",
  // 2026-09-18 真机新摩擦（报告 §9）：模型习惯 `cd <圈内目录> && wc -l f`，
  // 链式只读本身已放行，卡的是 cd 前缀。cd 有专用守卫（见 classifySegment）。
  "cd",
  "jq",   // 只出 stdout，没有写文件的旗标
  "test", // 纯判定（`[` 不支持——分词后语义不明，维持弹卡）
]);

/** `git` 只放行这几个子命令；`--output` 单独再拦（git diff --output=file 会写）。 */
const GIT_READ_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "shortlog",
]);

/** `find` 的写/执行侧动作旗标——出现即弹卡（verifier.ts 同样因它把 find 排除）。 */
const FIND_WRITE_FLAGS: ReadonlySet<string> = new Set([
  "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprintf", "-fls", "-fprint0",
]);

/**
 * 全命令预扫：引号外（或双引号内——那里 `$`/反引号照样展开）出现
 * `$`、反引号、`<` 即判不准；未闭合引号同罪。
 */
function hasDynamicOrInputRedirect(command: string): boolean {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') { quote = null; continue; }
      if (ch === "$" || ch === "`") return true;
      continue;
    }
    if (ch === "\\") { i++; continue; }
    if (ch === "'") { quote = "'"; continue; }
    if (ch === '"') { quote = '"'; continue; }
    if (ch === "$" || ch === "`" || ch === "<") return true;
  }
  return quote !== null;
}

/**
 * 段内分词：在 `readShellToken`（引号感知）之上处理重定向操作符——
 * `>`/`>>`/`2>`/`>&2`/`&>` 的目标已由主入口按 null sink 校验过，这里跳过即可；
 * 段内出现裸 `&`（后台）、`(`/`)`（子 shell）或重定向缺目标 → 返回 null（看不懂 → 弹卡）。
 */
function tokenizeSegment(seg: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < seg.length) {
    while (i < seg.length && /\s/.test(seg[i]!)) i++;
    if (i >= seg.length) break;
    const ch = seg[i]!;

    if (ch === ">" || (ch === "&" && seg[i + 1] === ">")) {
      i += ch === "&" ? 2 : 1; // 吃掉 `>` 或 `&>`
      while (i < seg.length && (seg[i] === ">" || seg[i] === "&")) i++; // `>>` / 第二个符号
      // `>&2` / `2>&1`：`&` 后跟 fd 数字是文件描述符复制，不是文件目标
      if (i > 0 && seg[i - 1] === "&" && /[0-9-]/.test(seg[i] ?? "")) {
        while (i < seg.length && /[0-9-]/.test(seg[i]!)) i++;
        continue;
      }
      while (i < seg.length && /\s/.test(seg[i]!)) i++;
      if (i >= seg.length) return null; // 重定向没有目标
      const target = readShellToken(seg, i);
      if (!target) return null;
      i = target.end;
      continue;
    }

    if (ch === "&" || ch === "(" || ch === ")" || ch === ";") return null;

    const tok = readShellToken(seg, i);
    if (!tok) return null;
    tokens.push(unquote(tok.value));
    i = tok.end;
  }
  return tokens;
}

const ALLOW: ReadOnlyShellVerdict = { allow: true, reason: "只读命令，参数均在工作目录内" };

function classifySegment(seg: string, workdir: string, readRoots?: string[]): ReadOnlyShellVerdict {
  const ask = (reason: string): ReadOnlyShellVerdict => ({ allow: false, reason });
  const tokens = tokenizeSegment(seg);
  if (!tokens || tokens.length === 0) return ask("看不懂的命令段");

  const head = tokens[0]!;
  if (head.includes("/") || head.includes("\\")) return ask(`按路径执行（${head}）`);

  let rest = tokens.slice(1);
  if (head === "git") {
    const sub = rest[0];
    if (!sub || !GIT_READ_SUBCOMMANDS.has(sub)) return ask("git 子命令不在只读集");
    if (tokens.some((t) => t === "--output" || t.startsWith("--output="))) {
      return ask("git --output 会写文件");
    }
    rest = rest.slice(1);
  } else if (!READ_ONLY_SHELL_COMMANDS.has(head)) {
    return ask(`「${head}」不在只读命令名单`);
  }

  if (head === "find" && rest.some((t) => FIND_WRITE_FLAGS.has(t))) {
    return ask("find 的 -exec/-delete 一族会写或执行");
  }
  /**
   * cd 只允许「恰好一个、圈内的目标目录」：
   * - 无参 → 跳 HOME（圈外）；`-`/任何旗标 → 跳 OLDPWD，静态判不准；
   *   多参/空串 → 语义不明 —— 一律弹卡。
   * - 目标本身交给下面的通用圈禁：`..`、`~`、绝对越界、凭据形状在那里拦。
   * 后续段的相对路径按 workdir 根做静态圈禁——比实际（cd 之后的 cwd）更保守：
   * 可能多弹卡，绝不会漏放行。
   */
  if (head === "cd") {
    if (rest.length !== 1 || !rest[0] || rest[0].startsWith("-")) {
      return ask("cd 的目标判不准（无参跳 HOME / `-` 跳 OLDPWD / 多参），弹卡");
    }
  }
  if (head === "sort" && rest.some((t) => t === "-o" || t.startsWith("--output"))) {
    return ask("sort -o 会写文件");
  }
  if (head === "uniq" && rest.filter((t) => !t.startsWith("-")).length > 1) {
    return ask("uniq 的第二个位置参数是输出文件");
  }
  /**
   * sed（2026-09-18 统计样本收紧）：s 命令本身纯读，写向量是 -i 与脚本里的
   * w/W 写命令。守卫按"脚本里出现独立的 w 词"判——`s/world/x/`、替换文本里的
   * w 不误伤；`s///w file`、`2w file`、`-e 'w pwn'` 全部拦下（判不准回卡不拒绝）。
   */
  if (head === "sed") {
    if (rest.some((t) => t.startsWith("-i") || t.startsWith("--in-place"))) {
      return ask("sed -i/--in-place 会就地写文件");
    }
    if (rest.some((t) => /(?:^|[^A-Za-z\\])[wW]\s/.test(t))) {
      return ask("sed 脚本含 w/W 写命令");
    }
  }

  // 参数圈禁：非旗标词按路径解析；旗标的 `=value` 同样解析。
  for (const token of rest) {
    // shell 转义标点（`\(` `\)` `\;` 这类恰好两字符）是表达式语法，不是路径——
    // find 的 `\( … -o … \)` 组合曾在这里被判「参数可能在工作目录外」整单弹卡
    // （2026-09-18 统计样本实录：开场第一条计数命令就是它）。裸 ( 子壳仍由
    // 段扫描拦下，不在此放行。
    if (/^\\[^A-Za-z0-9]$/.test(token)) continue;
    const values = token.startsWith("-")
      ? token.includes("=")
        ? [token.slice(token.indexOf("=") + 1)]
        : []
      : [token];
    for (const v of values) {
      if (!v) continue;
      if (credentialLikeName(v)) return ask(`凭据形状文件（${v}）`);
      if (v.startsWith("~")) return ask(`~ 展开可能出圈（${v}）`);
      if (pathOutsideWorkdir(workdir, v, readRoots)) return ask(`参数可能在工作目录外（${v}）`);
    }
  }
  return ALLOW;
}

/**
 * 判一条 bash 命令能否免审批卡自动放行。
 * 返回 allow=false 时**不是拒绝**——命令照常走审批门由人决定。
 */
export function classifyReadOnlyShellCommand(
  command: string,
  workdir: string,
  readRoots?: string[],
): ReadOnlyShellVerdict {
  const ask = (reason: string): ReadOnlyShellVerdict => ({ allow: false, reason });
  const cmd = command.trim();
  if (!cmd) return ask("空命令");

  if (hasDynamicOrInputRedirect(cmd)) {
    return ask("含变量/命令替换/输入重定向，静态判不准");
  }

  for (const target of extractWriteRedirectTargets(cmd)) {
    if (!isNullSink(target)) return ask(`带输出重定向（${target}），不是纯读`);
  }

  for (const seg of splitShellSegments(cmd)) {
    if (!seg.trim()) continue;
    const verdict = classifySegment(seg, workdir, readRoots);
    if (!verdict.allow) return verdict;
  }
  return ALLOW;
}
