// @vitest-environment jsdom
// @ts-nocheck
/**
 * T14 历史 run 的 review 面板「假空」修复。
 *
 * 现场（`eval/persona-ux/_verify-shots/ui-review-20260922/03-chat-code-rail-review.png`）：
 * 主区挂着「改文件 12 个」，右栏 review 面同时说「本场还没碰过任何文件。」。
 *
 * ★ 真因与计划原文不同，如实记：计划推测是"touched files 按当前宿主工作目录
 *   计算"。实际读码后不成立——`deriveTouchedFiles` 只读 `state.timeline`，
 *   跟工作目录半点关系没有（截图里 composer 显示的也正是该 run 自己的
 *   liquid-demo 目录，两边本来就同一个）。真因在**范围**：
 *     · 对话是整条谱系拼起来的（`deriveThreadChatItems`），而那段代码里写的是
 *       `if (skipLead && it.kind === "changecard") continue;`——skipLead 即
 *       `i > 0`，于是**留下根 run 那张卡、丢掉包括 tip 在内的其余**；
 *     · `paintReviewPanel` 读的却是 `runStates.get(tip)` 一个 run。
 *   截图里 tip 那轮限流秒挂、0 个文件 ⇒ 一个说 12、一个说没有。
 *
 * 修法：两边同源。卡改成整条谱系一张（`deriveThreadTouchedFiles`），面板读
 * 同一个函数。外加计划要的工作目录分支：目录与宿主当前不同时，空态说实话。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveTouchedFiles,
  deriveThreadTouchedFiles,
  deriveThreadChatItems,
  renderReviewPanel,
  THREAD_SEQ_STRIDE,
} from "../ui/public/app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

const toolCall = (seq, name, input, id) => ({ type: "tool_call", seq, name, input, toolUseId: id });
const okResult = (seq, id) => ({ type: "tool_result", seq, toolUseId: id, resultIsError: false });

/** 一个写了 paths 里每个文件各一次的 run 状态 */
function stateWithWrites(runId, paths, task = "t") {
  const timeline = [];
  let seq = 1;
  paths.forEach((path, i) => {
    const id = `${runId}-${i}`;
    timeline.push(toolCall(seq++, "write_file", { path, content: "x" }, id));
    timeline.push(okResult(seq++, id));
  });
  return { runId, task, status: "done", timeline, lastSeq: seq };
}

// ---------------------------------------------------------------
// deriveThreadTouchedFiles（纯函数）
// ---------------------------------------------------------------
describe("deriveThreadTouchedFiles 按整条对话谱系算改动", () => {
  it("单 run 对话：与 deriveTouchedFiles 逐字段相同（只多一个 runId），旧行为不变", () => {
    const st = stateWithWrites("r1", ["a.txt", "b.txt"]);
    const runs = [{ runId: "r1" }];
    const states = new Map([["r1", st]]);
    const solo = deriveTouchedFiles(st);
    const thread = deriveThreadTouchedFiles(runs, states, "r1");
    expect(thread.map(({ runId, ...rest }) => rest)).toEqual(solo);
    expect(thread.every((f) => f.runId === "r1")).toBe(true);
  });

  it("★ 复现现场：tip 一个文件没碰，祖先碰过 12 个 ⇒ 谱系口径仍是 12 个", () => {
    const paths = Array.from({ length: 12 }, (_, i) => `f${i}.txt`);
    const root = stateWithWrites("root", paths);
    const tip = { runId: "tip", task: "追问", status: "error", timeline: [], lastSeq: 0 };
    const runs = [{ runId: "root" }, { runId: "tip", continuedFrom: "root" }];
    const states = new Map([["root", root], ["tip", tip]]);

    // 旧口径（只看 tip）就是那句假话的来源
    expect(deriveTouchedFiles(tip)).toEqual([]);
    // 新口径看整条谱系
    expect(deriveThreadTouchedFiles(runs, states, "tip")).toHaveLength(12);
  });

  it("同一文件被后一轮又改过：edits 累加，lastSeq 跨 run 单调变大（「已阅」因此自动失效）", () => {
    const root = stateWithWrites("root", ["a.txt"]);
    const tip = stateWithWrites("tip", ["a.txt"]);
    const runs = [{ runId: "root" }, { runId: "tip", continuedFrom: "root" }];
    const states = new Map([["root", root], ["tip", tip]]);
    const [file] = deriveThreadTouchedFiles(runs, states, "tip");
    expect(file.path).toBe("a.txt");
    expect(file.edits).toBe(2);
    expect(file.runId).toBe("tip"); // 最后碰它的是 tip
    // 裸 seq 每个 run 从头数会撞；合成 seq 必须落在后一段进位上
    expect(file.lastSeq).toBeGreaterThanOrEqual(THREAD_SEQ_STRIDE);
    expect(file.lastSeq).toBeGreaterThan(deriveTouchedFiles(root)[0].lastSeq);
  });

  it("还没加载出状态的祖先只是没数据，不会让整条谱系变空", () => {
    const tip = stateWithWrites("tip", ["a.txt"]);
    const runs = [{ runId: "root" }, { runId: "tip", continuedFrom: "root" }];
    const states = new Map([["tip", tip]]); // root 的 state 尚未 hydrate
    expect(deriveThreadTouchedFiles(runs, states, "tip").map((f) => f.path)).toEqual(["a.txt"]);
  });
});

// ---------------------------------------------------------------
// 卡与面板同源（这条才是"界面不再自相矛盾"的证）
// ---------------------------------------------------------------
describe("对话里那张「本场改动」卡与右栏面板同源", () => {
  const paths = Array.from({ length: 12 }, (_, i) => `f${i}.txt`);
  const root = stateWithWrites("root", paths, "开场任务");
  const tip = { runId: "tip", task: "追问", status: "error", timeline: [], lastSeq: 0 };
  const runs = [{ runId: "root" }, { runId: "tip", continuedFrom: "root" }];
  const states = new Map([["root", root], ["tip", tip]]);

  it("整条谱系只有一张改动卡（不是每个 run 各贴一张）", () => {
    const items = deriveThreadChatItems(runs, states, "tip", null, {});
    const cards = items.filter((it) => it.kind === "changecard");
    expect(cards).toHaveLength(1);
    expect(cards[0].runId).toBe("tip"); // 挂在 tip 上：已阅集合与取 patch 都认选中 run
  });

  it("★ 卡里的文件清单与面板拿到的逐字段相同 —— 两边构造上不可能再打架", () => {
    const items = deriveThreadChatItems(runs, states, "tip", null, {});
    const card = items.find((it) => it.kind === "changecard");
    const panelInput = deriveThreadTouchedFiles(runs, states, "tip");
    expect(card.files).toEqual(panelInput);
    // 现场那句假话的两半：卡说 12
    expect(card.files).toHaveLength(12);
    // 面板拿同一份，于是不可能再画出「本场还没碰过任何文件」
    expect(renderReviewPanel(panelInput, { runId: "tip" })).toContain("改文件 12 个");
    expect(renderReviewPanel(panelInput, { runId: "tip" })).not.toContain("本场还没碰过任何文件");
  });
});

// ---------------------------------------------------------------
// renderReviewPanel 的两条空态分支
// ---------------------------------------------------------------
describe("renderReviewPanel 空态的两条分支", () => {
  it("目录与宿主当前相同（或不知道目录）：照旧说「本场还没碰过任何文件。」", () => {
    expect(renderReviewPanel([], { runId: "r", runWorkdir: "D:/a", hostWorkdir: "D:/a" }))
      .toContain("本场还没碰过任何文件。");
    expect(renderReviewPanel([], { runId: "r" })).toContain("本场还没碰过任何文件。");
    // 路径分隔符/大小写/结尾斜杠不同不算"不同目录"（sameWorkdirPath 的口径）
    expect(renderReviewPanel([], { runId: "r", runWorkdir: "D:\\a\\b", hostWorkdir: "D:/A/b/" }))
      .toContain("本场还没碰过任何文件。");
  });

  it("目录与宿主当前不同：报出这场运行的目录 + 给切换钮，不再说「没碰过」", () => {
    const html = renderReviewPanel([], {
      runId: "r",
      runWorkdir: "D:/Work/scratch/liquid-demo",
      hostWorkdir: "D:/Work/Github_pros/Agent_Design",
    });
    expect(html).toContain("该运行的工作目录是");
    expect(html).toContain("D:/Work/scratch/liquid-demo");
    expect(html).toContain("与当前不同");
    expect(html).not.toContain("本场还没碰过任何文件");
  });

  it("有文件时不管目录差异，照常出清单（提示只属于空态）", () => {
    const files = [{ path: "a.txt", edits: 1, lastSeq: 3 }];
    const html = renderReviewPanel(files, {
      runId: "r",
      runWorkdir: "D:/x",
      hostWorkdir: "D:/y",
    });
    expect(html).toContain("改文件 1 个");
    expect(html).not.toContain("该运行的工作目录是");
  });

  it("切换钮带着宿主委托需要的全部挂钩，且路径经过转义（真 DOM，不是字符串包含）", () => {
    const host = document.createElement("div");
    host.innerHTML = renderReviewPanel([], {
      runId: "r",
      runWorkdir: 'D:/a"><script>x</script>',
      hostWorkdir: "D:/b",
    });
    const btn = host.querySelector('[data-change-action="switch-workdir"]');
    expect(btn, "面板里找不到切换钮").toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    // 宿主的 click 委托靠 closest("[data-change-action]") 找它，dataset 必须原样带回路径
    expect(btn.dataset.workdir).toBe('D:/a"><script>x</script>');
    expect(host.querySelector("script"), "路径没转义，注进了真标签").toBeNull();
  });
});

// ---------------------------------------------------------------
// 宿主接线（静态锁：index.html 的内联控制器不可 import）
// ---------------------------------------------------------------
describe("宿主接线锁（T14）", () => {
  /**
   * 这一组只证"源码里写了什么"，证不了运行时真的画对了——index.html 的内联
   * 控制器在 jsdom 里起不来（它开 EventSource、读 localStorage、绑一整套 DOM）。
   * 上面那些纯函数 + 真 DOM 的断言才是内容正确性的证据；这里守的是
   * **那几个纯函数真的被接在了宿主的调用点上**——纯函数全绿而调用点用错函数，
   * 正是这条缺陷原本的形状。
   */
  function sliceOf(name) {
    const at = indexHtml.indexOf(`function ${name}(`);
    expect(at, `index.html 里找不到 ${name}`).toBeGreaterThan(0);
    return indexHtml.slice(at, at + 2000);
  }

  it("paintReviewPanel 用谱系口径，而不是只读 tip 一个 run 的 state", () => {
    const src = sliceOf("paintReviewPanel");
    expect(src).toMatch(/deriveThreadTouchedFiles\(\s*runs\s*,\s*runStates\s*,\s*runId\s*\)/);
    expect(src, "又退回只看一个 run 的旧口径了").not.toMatch(/deriveTouchedFiles\(\s*state/);
  });

  it("paintReviewPanel 把 run 自己的目录与宿主当前目录都交给渲染", () => {
    const src = sliceOf("paintReviewPanel");
    // run 自己的目录：先问列表里的 run，再退回 run_config——都不是 currentWorkdir()
    expect(src).toMatch(/runWorkdir\s*=\s*runs\.find\(/);
    expect(src).toMatch(/runConfig\?\.workdir/);
    expect(src).toMatch(/hostWorkdir\s*=\s*currentWorkdir\(\)/);
    expect(src).toMatch(/renderReviewPanel\([^)]*runWorkdir[^)]*hostWorkdir/s);
  });

  it("重画签名把目录对算进去——否则切了目录面板不会重画（提示会留在屏幕上说假话）", () => {
    const src = sliceOf("paintReviewPanel");
    const sigLine = src.slice(src.indexOf("const sig ="), src.indexOf("if (slot.dataset.sig"));
    expect(sigLine).toContain("runWorkdir");
    expect(sigLine).toContain("hostWorkdir");
  });

  it("「切换」钮有人接：click 委托认 switch-workdir，且切换走白名单登记", () => {
    expect(indexHtml).toMatch(/action\s*===\s*"switch-workdir"/);
    const src = sliceOf("switchToRunWorkdir");
    expect(src).toContain("/api/workdirs"); // 不在白名单里先按既有纪律登记
    expect(src).toMatch(/writePrefString\(PREF_WORKDIR/); // 真的换了当前目录
    expect(src).toContain("paintReviewPanel()"); // 换完立刻重画，别让旧提示留着
    expect(src).toMatch(/announceStatus\(["'`]?切不过去/); // 登记失败照实说，不假装切过
  });

  it("变更面板把 run 自己的目录发给服务端复核（不是宿主当前目录）", () => {
    expect(indexHtml).toMatch(
      /changesApi\.setRun\(\s*runId\s*,\s*info\?\.workdir\s*\?\?\s*state\.runConfig\?\.workdir/,
    );
  });
});
