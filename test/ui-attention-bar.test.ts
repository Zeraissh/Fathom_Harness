// @vitest-environment jsdom
// @ts-nocheck
/**
 * T20「待你处理」跨会话聚合入口（features/attention-bar.js + notifications 的聚合纯函数）。
 *
 * ★ 先读了 T4（features/notifications.js）再动手，结论是**复用而不是重写**：
 *   五类分类（approval / question / plan_gate / run_end / budget）、同 run 同类
 *   叠条（collapseDecisionItems）、已读语义、待决条目在 resolved / run_end 时被
 *   移出 store——T4 全都有。本轮只加了两个纯函数（deriveAttentionSummary /
 *   attentionBarCopy）+ 一个纯呈现模块，**没有第二份账本**。
 *
 * 判据分层：
 *   纯函数：五类聚合、叠条口径与面板一致、已读语义、top 的优先级、零即无
 *   DOM   ：常驻条渲染、待决才呼吸、点击直达干预点（decision 才 revealDock）、
 *           零条目整条隐藏、签名不变不动 DOM
 *   样式  ：呼吸点走 --status-warn 令牌链（程序化解析 styles.css，四主题实算）
 *   接线  ：宿主在通知中心之后挂、与 boardApi 同一节拍刷新
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createNotificationStore,
  applyRunEventToStore,
  collapseDecisionItems,
  groupStoreItems,
  deriveAttentionSummary,
  attentionBarCopy,
} from "../ui/public/features/notifications.js";
import { initAttentionBar, ATTENTION_KIND_ICONS } from "../ui/public/features/attention-bar.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------
// 夹具：用 T4 自己的归约把 store 造出来（不手摆 items，免得夹具与实现漂移）
// ---------------------------------------------------------------

function feed(store, runId, event, { seq = 1, source = "main", now = 1_000, runTitle = `任务 ${runId}` } = {}) {
  return applyRunEventToStore(store, { runId, runTitle, seq, source, event, now }).store;
}

/** 五类各来一条的 store */
function fiveKindStore() {
  let s = createNotificationStore();
  s = feed(s, "r1", { type: "approval_request", toolUseId: "t1", name: "bash", at: 1_001 }, { seq: 1 });
  s = feed(s, "r2", { type: "user_question_request", id: "q1", questions: [{ question: "用哪个端口？" }], at: 1_002 }, { seq: 2 });
  s = feed(s, "r3", { type: "plan_approval_request", at: 1_003 }, { seq: 3 });
  s = feed(s, "r4", { type: "run_end", mainStopReason: "completed", at: 1_004 }, { seq: 4 });
  s = feed(s, "r5", { type: "run_end", mainStopReason: "budget_exhausted", at: 1_005 }, { seq: 5 });
  return s;
}

describe("deriveAttentionSummary 五类聚合", () => {
  it("★ 计划点名的五类逐一计入（审批 / ask_user / 计划门 / 运行完成 / 预算耗尽）", () => {
    const summary = deriveAttentionSummary(fiveKindStore());
    expect(summary.byKind).toEqual({
      approval: 1,
      question: 1,
      plan_gate: 1,
      run_end: 1,
      budget: 1,
    });
    expect(summary.total).toBe(5);
    expect(summary.pending, "只有前三类算「等你决定」").toBe(3);
  });

  it("★ 叠条口径与通知面板逐条同源——不是第二套算法", () => {
    let s = createNotificationStore();
    // 同一个 run 三次审批（并行子任务各要一次 bash 的形状）
    for (let i = 0; i < 3; i++) {
      s = feed(s, "r1", { type: "approval_request", toolUseId: `t${i}`, name: "bash", at: 1_000 + i }, { seq: i + 1 });
    }
    const summary = deriveAttentionSummary(s);
    expect(summary.pending, "三条审批叠成一条").toBe(1);
    // 与 T4 自己的两处口径对齐
    expect(summary.pending).toBe(collapseDecisionItems(s.items).length);
    expect(summary.pending).toBe(groupStoreItems(s).find((g) => g.key === "decision").items.length);
  });

  it("已读的完成/注意项不再催；待决不受已读影响（它是未处理，不是未看见）", () => {
    let s = fiveKindStore();
    s = { ...s, items: s.items.map((i) => ({ ...i, read: true })) };
    const summary = deriveAttentionSummary(s);
    expect(summary.byKind.run_end).toBe(0);
    expect(summary.byKind.budget).toBe(0);
    expect(summary.pending, "读过 ≠ 处理过").toBe(3);
    expect(summary.total).toBe(3);
  });

  it("待决被解决后从聚合里消失（走 T4 自己的 resolved 归约）", () => {
    let s = createNotificationStore();
    s = feed(s, "r1", { type: "approval_request", toolUseId: "t1", name: "bash" }, { seq: 7 });
    expect(deriveAttentionSummary(s).pending).toBe(1);
    s = feed(s, "r1", { type: "approval_resolved", toolUseId: "t1", requestSeq: 7 }, { seq: 8 });
    expect(deriveAttentionSummary(s).pending).toBe(0);
  });

  it("★ top 的优先级：待决 > 未读注意 > 未读完成；同档取最新", () => {
    const summary = deriveAttentionSummary(fiveKindStore());
    expect(summary.top.category).toBe("decision");
    expect(summary.top.kind).toBe("plan_gate"); // 三条待决里 at 最大的那条

    // 只剩完成与预算：注意档（budget）压过完成档
    let s = createNotificationStore();
    s = feed(s, "r4", { type: "run_end", mainStopReason: "completed", at: 9_000 }, { seq: 1 });
    s = feed(s, "r5", { type: "run_end", mainStopReason: "budget_exhausted", at: 1_000 }, { seq: 2 });
    expect(deriveAttentionSummary(s).top.kind).toBe("budget");
  });

  it("空 store / 畸形输入：零条目、top 为 null、不抛", () => {
    for (const input of [createNotificationStore(), null, undefined, {}, { items: null }]) {
      const summary = deriveAttentionSummary(input);
      expect(summary.total).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.top).toBeNull();
    }
  });
});

describe("attentionBarCopy 文案", () => {
  it("零条目返回 null（呈现层据此整条隐藏，不常驻一个「待你处理（0）」）", () => {
    expect(attentionBarCopy({ total: 0, pending: 0 })).toBeNull();
    expect(attentionBarCopy(null)).toBeNull();
  });

  it("★ 有待决与全是回执两种说法不同——紧迫程度不一样", () => {
    expect(attentionBarCopy({ total: 5, pending: 2 })).toEqual({
      title: "待你处理（5）",
      detail: "2 条等你决定",
    });
    expect(attentionBarCopy({ total: 5, pending: 0 })).toEqual({
      title: "待你处理（5）",
      detail: "都是已跑完的回执",
    });
  });
});

// ---------------------------------------------------------------
// DOM 层
// ---------------------------------------------------------------

describe("initAttentionBar DOM 行为", () => {
  let mount;
  let store;
  let host;

  beforeEach(() => {
    document.body.innerHTML = '<div id="attention-mount"></div>';
    mount = document.getElementById("attention-mount");
    store = createNotificationStore();
    host = {
      getStore: () => store,
      onOpenItem: vi.fn(),
      onOpenPanel: vi.fn(),
      onAnnounce: vi.fn(),
    };
  });

  const bar = () => mount.querySelector(".attn-bar");

  it("零条目：整条 hidden", () => {
    const api = initAttentionBar(mount, host);
    expect(bar().hidden).toBe(true);
    expect(api.getTopItem()).toBeNull();
  });

  it("★ 有待决：条出现、显示条数与待决数、呼吸点在、五类计数 chip 逐类可见", () => {
    store = fiveKindStore();
    const api = initAttentionBar(mount, host);
    api.refresh();

    expect(bar().hidden).toBe(false);
    expect(bar().querySelector(".attn-title").textContent).toBe("待你处理（5）");
    expect(bar().querySelector(".attn-detail").textContent).toBe("3 条等你决定");
    expect(bar().classList.contains("attn-bar--pending")).toBe(true);
    expect(bar().querySelector(".attn-dot").hidden).toBe(false);

    const chips = [...bar().querySelectorAll(".attn-kind")];
    expect(chips.map((c) => c.dataset.attnKind).sort()).toEqual(
      ["approval", "budget", "plan_gate", "question", "run_end"],
    );
    // 图标是 Phosphor 类名，不是彩色 emoji
    for (const chip of chips) {
      const icon = chip.querySelector("i");
      expect(icon.className).toContain("ph ");
      expect(chip.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it("★ 只剩回执（无待决）：条还在但不呼吸——跑完的回执不该一直闪", () => {
    let s = createNotificationStore();
    s = feed(s, "r4", { type: "run_end", mainStopReason: "completed", at: 2_000 }, { seq: 1 });
    store = s;
    const api = initAttentionBar(mount, host);
    api.refresh();

    expect(bar().hidden).toBe(false);
    expect(bar().querySelector(".attn-detail").textContent).toBe("都是已跑完的回执");
    expect(bar().classList.contains("attn-bar--pending")).toBe(false);
    expect(bar().querySelector(".attn-dot").hidden).toBe(true);
  });

  it("★ 点击直达干预点：待决类给出的 item 带 category=decision（宿主据此 revealDock）", () => {
    store = fiveKindStore();
    const api = initAttentionBar(mount, host);
    api.refresh();
    bar().querySelector(".attn-main").click();

    expect(host.onOpenItem).toHaveBeenCalledTimes(1);
    const item = host.onOpenItem.mock.calls[0][0];
    expect(item.category).toBe("decision");
    expect(item.runId).toBe("r3"); // 最新那条待决
    expect(api.getTopItem()).toBe(item);
  });

  it("只剩回执时点击也去那个会话，但 category 不是 decision（宿主不闪决定坞）", () => {
    let s = createNotificationStore();
    s = feed(s, "r9", { type: "run_end", mainStopReason: "completed", at: 2_000 }, { seq: 1 });
    store = s;
    const api = initAttentionBar(mount, host);
    api.refresh();
    bar().querySelector(".attn-main").click();
    expect(host.onOpenItem.mock.calls[0][0].category).not.toBe("decision");
  });

  it("「全部」钮打开通知中心（聚合条不复制面板的内容）", () => {
    store = fiveKindStore();
    const api = initAttentionBar(mount, host);
    api.refresh();
    bar().querySelector(".attn-all").click();
    expect(host.onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("可及名称说清「去哪儿」，不是光念一个数字", () => {
    store = fiveKindStore();
    const api = initAttentionBar(mount, host);
    api.refresh();
    const label = bar().querySelector(".attn-main").getAttribute("aria-label");
    expect(label).toContain("待你处理（5）");
    expect(label).toContain("计划待签发");
  });

  it("幂等：重复 init 返回同一实例、不叠第二条；签名不变时不重画 chip", () => {
    store = fiveKindStore();
    const a = initAttentionBar(mount, host);
    const b = initAttentionBar(mount, host);
    expect(b).toBe(a);
    expect(mount.querySelectorAll(".attn-bar")).toHaveLength(1);

    const chipsBefore = bar().querySelector(".attn-kinds").firstElementChild;
    a.refresh();
    a.refresh();
    expect(bar().querySelector(".attn-kinds").firstElementChild, "签名没变不该重建节点").toBe(chipsBefore);
  });

  it("store 拿不到（通知中心没加载）：恒隐藏，不抛", () => {
    const api = initAttentionBar(mount, { getStore: () => null });
    expect(bar().hidden).toBe(true);
    expect(() => api.refresh()).not.toThrow();
  });

  it("mount 为 null 时返回 null，不炸", () => {
    expect(initAttentionBar(null, host)).toBeNull();
  });
});

// ---------------------------------------------------------------
// 样式：呼吸点必须走 --status-warn 令牌链（四主题程序化实算）
// ---------------------------------------------------------------

describe("T20 呼吸点的样式判据", () => {
  const css = readFileSync(join(here, "..", "ui", "public", "styles.css"), "utf8");

  /** 把 :root / [data-theme=x] 块里的自定义属性解析成表（沿用 P0 T13 的手法） */
  function tokenTable() {
    const table = new Map();
    const re = /(:root|\[data-theme="([^"]+)"\])[^{]*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const theme = m[2] ?? "light";
      const body = m[3];
      const varRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let v;
      while ((v = varRe.exec(body))) {
        if (!table.has(theme)) table.set(theme, new Map());
        table.get(theme).set(v[1], v[2].trim());
      }
    }
    return table;
  }

  function resolve(table, theme, name, depth = 0) {
    if (depth > 8) return null;
    const raw = table.get(theme)?.get(name) ?? table.get("light")?.get(name) ?? null;
    if (!raw) return null;
    const ref = /^var\((--[\w-]+)\)$/.exec(raw);
    if (ref) return resolve(table, theme, ref[1], depth + 1);
    return raw;
  }

  it("★ 呼吸点用 --status-warn 令牌，没有写死颜色", () => {
    const block = css.slice(css.indexOf(".attn-mount:empty"), css.indexOf("features/transcript-grouping"));
    expect(block.length).toBeGreaterThan(400);
    expect(block, "不许写死颜色").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/\.attn-dot\s*\{[^}]*background:\s*var\(--status-warn\)/);
  });

  it("★ --status-warn 在四主题下都能解析出真实色值（不是空串）", () => {
    const table = tokenTable();
    for (const theme of ["light", "dark", "graphite", "contrast"]) {
      const value = resolve(table, theme, "--status-warn");
      expect(value, `${theme} 解析不出 --status-warn`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("★ 动画受 prefers-reduced-motion 约束（呼吸点不许无条件闪）", () => {
    const at = css.indexOf("attn-breathe");
    expect(at).toBeGreaterThan(-1);
    const before = css.slice(Math.max(0, at - 400), at);
    expect(before).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });

  it("不用彩色 emoji（图标走 Phosphor 类名）", () => {
    expect(Object.values(ATTENTION_KIND_ICONS).every((n) => n.startsWith("ph-"))).toBe(true);
    const src = readFileSync(join(here, "..", "ui", "public", "features", "attention-bar.js"), "utf8");
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

// ---------------------------------------------------------------
// 宿主接线
// ---------------------------------------------------------------

describe("T20 宿主接线", () => {
  const indexHtml = readFileSync(join(here, "..", "ui", "public", "index.html"), "utf8");

  it("侧栏顶部有挂载点，且在会话列表与新建钮之前", () => {
    const mountAt = indexHtml.indexOf('id="attention-mount"');
    const newChatAt = indexHtml.indexOf('id="new-chat-btn"');
    expect(mountAt).toBeGreaterThan(-1);
    expect(mountAt, "聚合条要在侧栏顶部，不是列表底下").toBeLessThan(newChatAt);
  });

  it("★ 数据源是通知中心的 store，不是第二份账本", () => {
    expect(indexHtml).toMatch(/getStore:\s*\(\)\s*=>\s*notificationsApi\?\.getStore\?\.\(\)/);
  });

  it("★ 挂载排在通知中心就绪之后（没 store 可读时白挂一次）", () => {
    const notifAt = indexHtml.indexOf('import("./features/notifications.js")');
    const attnAt = indexHtml.indexOf('import("./features/attention-bar.js")');
    expect(notifAt).toBeGreaterThan(-1);
    expect(attnAt).toBeGreaterThan(notifAt);
  });

  /**
   * ★ 变异验证逼出来的一条：第一版数的是 `attentionBarApi?.refresh()` 出现**几次**
   * （断 ≥3）。而模块初始化那段里本来就有一次，于是把 ingest 那处的刷新删掉后
   * 仍有 3 次，判据照样全绿——**数个数测不出"漏了哪一处"**。
   * 改成查**紧邻配对**：三个数据节拍里每一个 `boardApi?.refresh();` 后面都必须
   * 紧跟 `attentionBarApi?.refresh();`（paintSpendSurfaces 那处只管成本，不配对）。
   */
  it("★ 与 boardApi 同一节拍刷新（两者读同一份 store，漏一处就吃旧账）", () => {
    const boardCalls = indexHtml.match(/boardApi\?\.refresh\(\);/g) ?? [];
    expect(boardCalls.length, "boardApi 的刷新点数量变了，这条锁要重新对齐").toBe(4);
    const paired = indexHtml.match(
      /boardApi\?\.refresh\(\);[^\n]*\n\s*attentionBarApi\?\.refresh\(\);/g,
    ) ?? [];
    expect(paired.length, "loadRuns / ingest / 生命周期流三处都要紧跟着刷新聚合条").toBe(3);
  });

  it("★ 待决类直达干预点：decision 才 revealDock，回执只选中会话", () => {
    const at = indexHtml.indexOf("onOpenItem: (item) =>");
    expect(at).toBeGreaterThan(-1);
    const block = indexHtml.slice(at, at + 400);
    expect(block).toMatch(/selectRun\(item\.runId\)/);
    expect(block).toMatch(/item\.category === "decision"[\s\S]{0,60}revealDecisionDock\(item\.runId\)/);
  });
});
