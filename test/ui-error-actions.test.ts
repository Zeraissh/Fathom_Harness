// @vitest-environment jsdom
// @ts-nocheck
/**
 * T21 错误卡动作入口。
 *
 * 现场（`eval/persona-ux/_verify-shots/ui-review-20260922/14-audit-code-rail-collapsed-1440.png`）：
 * 整屏就两行红字「异常终止 · 限流：SDK 重试已耗尽，请稍后再试」，**没有任何
 * 下一步**——用户唯一能做的是自己在输入框里把任务重打一遍。
 * 真因与计划一致（这项计划说对了）：`patchOutcomeCard` 画的错误卡只有一行
 * 文案 + 一颗「继续对话」箭头，没有针对失败的动作。
 *
 * 判据分层：
 *   纯函数：限流判据（正反例）、动作面（三颗固定给全 / 限流额外提法 /
 *           非错误返回 null）、复制文本必须含 runId
 *   DOM   ：错误卡上真的画出三颗钮 + 限流提法；点击派发到宿主回调；
 *           正常收尾不画动作行
 *   接线  ：宿主三条分支（retry 用任务原文走 submitAppend / logs 发 tab-switch /
 *           copy 走 buildErrorCopyText）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isRateLimitError,
  deriveErrorActions,
  buildErrorCopyText,
  createInitialState,
  reduceEvents,
} from "../ui/public/app.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------
// 纯函数层
// ---------------------------------------------------------------

describe("isRateLimitError 限流判据", () => {
  it("★ 认得出现场那一句与常见英文形状", () => {
    expect(isRateLimitError("限流：SDK 重试已耗尽，请稍后再试")).toBe(true);
    expect(isRateLimitError("Rate limit exceeded")).toBe(true);
    expect(isRateLimitError("rate_limit_error")).toBe(true);
    expect(isRateLimitError("429 Too Many Requests")).toBe(true);
    expect(isRateLimitError("quota exhausted")).toBe(true);
  });

  it("★ 不认泛泛的故障——猜错了会给出帮不上忙的建议", () => {
    expect(isRateLimitError("Overloaded")).toBe(false);
    expect(isRateLimitError("ECONNRESET")).toBe(false);
    expect(isRateLimitError("工具运行失败：找不到 old_string")).toBe(false);
    expect(isRateLimitError("")).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("deriveErrorActions 动作面", () => {
  const errState = (error, extra = {}) => ({
    runId: "r1", task: "帮我做个动态效果", stopReason: "error", error, ...extra,
  });

  it("★ 三颗动作固定给全：重试 / 查看事件日志 / 复制错误详情", () => {
    const face = deriveErrorActions(errState("Overloaded"));
    expect(face.actions.map((a) => a.id)).toEqual(["retry", "logs", "copy"]);
    expect(face.actions.map((a) => a.label)).toEqual(["重试", "查看事件日志", "复制错误详情"]);
    expect(face.actions.every((a) => a.title.length > 0), "每颗都要有说明").toBe(true);
  });

  it("★ 限流类额外给一句提法，且提法里说了「并行度调小」", () => {
    const face = deriveErrorActions(errState("限流：SDK 重试已耗尽，请稍后再试"));
    expect(face.rateLimited).toBe(true);
    expect(face.hint).toContain("并行度");
    // 提法不是第四个按钮——建议不冒充动作
    expect(face.actions).toHaveLength(3);
  });

  it("非限流类不给提法（少一句话 < 给错建议）", () => {
    const face = deriveErrorActions(errState("ECONNRESET"));
    expect(face.rateLimited).toBe(false);
    expect(face.hint).toBeNull();
  });

  it("★ 非错误收尾返回 null（撞轮数 / 被否决各有各的下一步，不在本项范围）", () => {
    expect(deriveErrorActions({ runId: "r", stopReason: "completed", error: null })).toBeNull();
    expect(deriveErrorActions({ runId: "r", stopReason: "max_turns", error: null })).toBeNull();
    expect(deriveErrorActions({ runId: "r", stopReason: "plan_rejected", error: null })).toBeNull();
    expect(deriveErrorActions(null)).toBeNull();
    expect(deriveErrorActions({})).toBeNull();
  });

  it("stopReason=error 但没有错误正文时给兜底描述，不给空字符串", () => {
    const face = deriveErrorActions({ runId: "r", stopReason: "error", error: "" });
    expect(face).not.toBeNull();
    expect(face.message).toBe("运行异常终止");
  });
});

describe("buildErrorCopyText 复制文本", () => {
  it("★ 必须含 runId 与错误详情（拿去排查时得知道是哪一场）", () => {
    const text = buildErrorCopyText({
      runId: "run-5f9da4",
      task: "帮我做个动态效果",
      stopReason: "error",
      error: "限流：SDK 重试已耗尽，请稍后再试",
    });
    expect(text).toContain("runId: run-5f9da4");
    expect(text).toContain("error: 限流：SDK 重试已耗尽，请稍后再试");
    expect(text).toContain("stopReason: error");
    expect(text).toContain("task: 帮我做个动态效果");
  });

  it("★ 缺字段就不写那一行，不编占位符（「—」会被当成真值）", () => {
    const text = buildErrorCopyText({ stopReason: "error", error: "boom" });
    expect(text).not.toMatch(/runId:/);
    expect(text).not.toMatch(/task:/);
    expect(text).not.toContain("—");
    expect(text).toContain("error: boom");
  });

  it("没有错误时如实说「没有记录到错误」，不空着", () => {
    expect(buildErrorCopyText({ runId: "r1" })).toContain("（没有记录到错误）");
  });

  it("超长任务原文截断，不把整篇稿子塞进剪贴板", () => {
    const text = buildErrorCopyText({ runId: "r1", task: "啊".repeat(900), error: "boom" });
    const taskLine = text.split("\n").find((l) => l.startsWith("task: "));
    expect(taskLine.length).toBeLessThan(260);
  });

  it("走真实 reducer 的错误流：口径与 state 一致", () => {
    // 真实形状：错误经 done 事件的 stopReason + error.message 进 state（applySegmentDone）
    const state = reduceEvents(createInitialState("run-x", "任务原文", false), [
      {
        seq: 1,
        source: "main",
        ts: 1,
        event: { type: "done", stopReason: "error", error: { message: "限流：SDK 重试已耗尽" } },
      },
      { seq: 2, source: "main", ts: 2, event: { type: "run_end", mainStopReason: "error" } },
    ]);
    expect(state.error, "reducer 没把错误正文落进 state.error，夹具形状要重对").toContain("限流");
    const face = deriveErrorActions(state);
    expect(face, "reducer 产出的错误态必须被认出来").not.toBeNull();
    expect(face.rateLimited).toBe(true);
    expect(buildErrorCopyText(state)).toContain("runId: run-x");
  });
});

// ---------------------------------------------------------------
// DOM 层：错误卡真的长出动作行
// ---------------------------------------------------------------

describe("T21 错误卡 DOM", () => {
  const appSrc = readFileSync(join(here, "..", "ui", "public", "app.js"), "utf8");

  it("★ patchOutcomeCard 在错误态下插动作行（渲染分支真的接上了）", () => {
    // host-lags-harness 那条纪律：纯函数有了不等于渲染分支接了
    expect(appSrc).toMatch(/const errorFace = deriveErrorActions\(state\);/);
    expect(appSrc).toMatch(/\(errorFace \? renderErrorActions\(errorFace\) : ""\)/);
  });

  it("★ 三颗钮带 data-outcome-action 挂钩，且点击派发到 onErrorAction", () => {
    expect(appSrc).toMatch(/data-outcome-action="\$\{esc\(a\.id\)\}"/);
    expect(appSrc).toMatch(/querySelectorAll\("\[data-outcome-action\]"\)/);
    expect(appSrc).toMatch(/callbacks\.onErrorAction\?\.\(el\.getAttribute\("data-outcome-action"\), state\)/);
  });

  it("★ 动作行的可及语义：role=group + 说明这是干什么的", () => {
    expect(appSrc).toMatch(/class="outcome-actions" role="group" aria-label="这次失败的下一步"/);
  });

  /**
   * renderErrorActions 是内部函数（不导出），但它产出的 HTML 结构可以从
   * deriveErrorActions 的输出加一层字符串断言反推——这里直接在 jsdom 里
   * 把那段模板的形状验一遍：三颗钮、限流一行提法、提法不是按钮。
   */
  it("★ 限流态渲染出三颗钮 + 一行提法；提法不是按钮", () => {
    const face = deriveErrorActions({
      runId: "r1", stopReason: "error", error: "限流：SDK 重试已耗尽",
    });
    const host = document.createElement("div");
    // 与 app.js 的模板同形（同一份 face 数据喂进来）
    host.innerHTML =
      `<div class="outcome-actions" role="group" aria-label="这次失败的下一步">` +
      face.actions.map((a) => `<button type="button" class="outcome-action" data-outcome-action="${a.id}">${a.label}</button>`).join("") +
      `</div>` +
      (face.hint ? `<p class="outcome-action-hint" data-outcome-hint="rate-limit">${face.hint}</p>` : "");
    expect(host.querySelectorAll("button[data-outcome-action]")).toHaveLength(3);
    expect(host.querySelector('[data-outcome-hint="rate-limit"]').tagName).toBe("P");
    expect(host.querySelectorAll('button[data-outcome-hint]')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
// 宿主接线
// ---------------------------------------------------------------

describe("T21 宿主接线", () => {
  const indexHtml = readFileSync(join(here, "..", "ui", "public", "index.html"), "utf8");

  it("宿主注入 onErrorAction（否则三颗钮点了字节级零变化）", () => {
    expect(indexHtml).toMatch(/onErrorAction:\s*\(action, state\)\s*=>/);
  });

  it("★ retry 用的是**任务原文**走既有续跑链，不是把光标丢回输入框", () => {
    const at = indexHtml.indexOf('if (action === "retry")');
    expect(at).toBeGreaterThan(-1);
    const block = indexHtml.slice(at, at + 320);
    expect(block).toMatch(/state\?\.task/);
    expect(block).toMatch(/submitAppend\(\{ runId, text \}\)/);
  });

  it("★ logs 用仓库既有的 tab-switch 事件跳 Loop 面，不新造一套导航", () => {
    const at = indexHtml.indexOf('if (action === "logs")');
    expect(at).toBeGreaterThan(-1);
    const block = indexHtml.slice(at, at + 260);
    expect(block).toMatch(/new CustomEvent\("tab-switch", \{ detail: \{ tab: "loop" \} \}\)/);
  });

  /**
   * ★ 变异验证逼出来的一条：第一版把 import 段切出来做子串匹配，结果变异体
   * 留下的注释「// MUTATION-5：不 import buildErrorCopyText」本身含这个词，
   * **判据匹配到了注释**照样绿。改成逐行取「一个裸标识符 + 可选逗号」的行，
   * 注释行一律排除——判的是真的 import 名单，不是这段文本里出现过这串字。
   */
  it("★ copy 走 buildErrorCopyText（含 runId），并且那个函数真在 import 名单里", () => {
    expect(indexHtml).toMatch(/copyChatText\(buildErrorCopyText\(state\)\)/);
    const close = indexHtml.indexOf('} from "/app.js";');
    expect(close, "app.js 的 import 段形状变了，这条锁要重新对齐").toBeGreaterThan(-1);
    const open = indexHtml.lastIndexOf("import {", close);
    const named = indexHtml
      .slice(open, close)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
      .map((l) => /^([A-Za-z_$][\w$]*)\s*,?$/.exec(l)?.[1])
      .filter(Boolean);
    expect(named, "只 import 才算接上，不然运行时 ReferenceError").toContain("buildErrorCopyText");
  });

  it("三条动作都给了 aria-live 播报（按钮按下去要有回音）", () => {
    const at = indexHtml.indexOf("onErrorAction:");
    const block = indexHtml.slice(at, at + 1200);
    expect((block.match(/announceStatus\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------
// 样式
// ---------------------------------------------------------------

describe("T21 样式", () => {
  const css = readFileSync(join(here, "..", "ui", "public", "styles.css"), "utf8");

  it("动作行只用语义令牌，零裸色值；提法走 --status-warn（是建议不是错误，别涂红）", () => {
    const block = css.slice(css.indexOf(".outcome-actions {"), css.indexOf("features/attention-bar"));
    expect(block.length).toBeGreaterThan(300);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/\.outcome-action-hint\s*\{[^}]*color:\s*var\(--status-warn\)/);
  });
});
