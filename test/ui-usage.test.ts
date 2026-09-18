// @vitest-environment jsdom
// @ts-nocheck
/**
 * 消耗视图：区间切片、堆叠柱与主题化卡片。
 * 台账没有 token，图上按轮次堆叠；未计价不得画成 $0.00。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseUsageReport,
  formatUsd,
  formatChartDay,
  formatChartDayFull,
  formatChartDayShort,
  chartLabelPlan,
  formatCompactCount,
  niceAxisMax,
  periodStartDay,
  enumerateDays,
  collapseSeries,
  sliceUsageWindow,
  dayModelRowsOf,
  displayModelName,
  USAGE_OTHER_MODEL,
  initUsageView,
  attachUsagePanel,
  deriveSpendFace,
  formatThisRunSpend,
  todayUsageOf,
} from "../ui/public/features/usage.js";

/**
 * 走查 UX-C2 / O2：日期标签此前 `overflow:hidden; text-overflow:clip` 被列宽硬切
 * （30d/90d 必现"半个字"）。修法不是继续裁，而是**按容器宽度算标签节奏**：
 * 间距放得下全日期就用全日期，放不下退日号，再放不下才减枚数——标签允许
 * 溢出自己的窄列（邻居间距由步长保证），不再在列内被裁。
 */
describe("chartLabelPlan（UX-C2 / O2）", () => {
  it("窄容器：步长按全日期宽度（≈58px）算，铺不开才退日号", () => {
    // 240px / 7 天 = 34px 列：全日期放不下 1 枚/列 → 每 2 列一枚
    expect(chartLabelPlan({ plotWidth: 240, days: 7 })).toEqual({ step: 2, form: "full" });
    // 240px / 30 天 = 8px 列：全日期每 8 列一枚（保住可读性）
    expect(chartLabelPlan({ plotWidth: 240, days: 30 })).toEqual({ step: 8, form: "full" });
    // 240px / 90 天 = 2.7px 列
    expect(chartLabelPlan({ plotWidth: 240, days: 90 })).toEqual({ step: 22, form: "full" });
  });

  it("极窄且窗口短：全日期两枚都铺不下才退日号", () => {
    // 100px / 30 天 = 3.3px 列：全日期要 18 列 > 15 列上限 → 日号每 6 列
    expect(chartLabelPlan({ plotWidth: 100, days: 30 })).toEqual({ step: 6, form: "day" });
  });

  it("宽容器：贴住固定节奏不加密", () => {
    expect(chartLabelPlan({ plotWidth: 1200, days: 7 })).toEqual({ step: 1, form: "full" });
    expect(chartLabelPlan({ plotWidth: 1200, days: 30 })).toEqual({ step: 4, form: "full" });
  });

  it("量不到宽度（隐藏面板）时不乱算：退固定步长", () => {
    expect(chartLabelPlan({ plotWidth: 0, days: 30 })).toEqual({ step: 4, form: "full" });
    expect(chartLabelPlan({ days: 90 })).toEqual({ step: 10, form: "full" });
  });

  it("formatChartDayShort：只给日号（工具提示里仍是全日期）", () => {
    expect(formatChartDayShort("2026-09-18")).toBe("18");
  });
});

const NOW = Date.parse("2026-09-09T12:00:00");

const SAMPLE = {
  totalRuns: 4,
  totalTurns: 18,
  totalUsd: 0.12,
  unpricedRuns: 1,
  byDay: [
    { day: "2026-09-07", runs: 2, turns: 12, usd: 0.1, unpricedRuns: 0 },
    { day: "2026-09-02", runs: 1, turns: 3, usd: null, unpricedRuns: 1 },
    { day: "2026-08-01", runs: 1, turns: 3, usd: 0.02, unpricedRuns: 0 },
  ],
  byModel: [
    { model: "flash", runs: 3, turns: 10, usd: 0.04, unpricedRuns: 1 },
    { model: "pro", runs: 1, turns: 8, usd: 0.08, unpricedRuns: 0 },
  ],
  byDayModel: [
    { day: "2026-09-07", model: "flash", runs: 1, turns: 4, usd: 0.02, unpricedRuns: 0 },
    { day: "2026-09-07", model: "pro", runs: 1, turns: 8, usd: 0.08, unpricedRuns: 0 },
    { day: "2026-09-02", model: "flash", runs: 1, turns: 3, usd: null, unpricedRuns: 1 },
    { day: "2026-08-01", model: "flash", runs: 1, turns: 3, usd: 0.02, unpricedRuns: 0 },
  ],
};

describe("消耗读数", () => {
  it("formatUsd：null 写未计价，0 才是 $0.00", () => {
    expect(formatUsd(null)).toBe("未计价");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("parseUsageReport 收下 byDayModel，缺字段不冒充 0 元", () => {
    const parsed = parseUsageReport({ totalRuns: 2, totalUsd: null, byDayModel: SAMPLE.byDayModel });
    expect(parsed.totalUsd).toBeNull();
    expect(parsed.byDayModel).toHaveLength(4);
    expect(parseUsageReport(null).byDayModel).toEqual([]);
  });

  it("日期轴与紧凑数字", () => {
    expect(formatChartDay("2026-09-07")).toBe("9月7日");
    expect(formatChartDayFull("2026-09-07")).toBe("2026年9月7日");
    expect(formatCompactCount(12)).toBe("12");
    expect(formatCompactCount(1400)).toBe("1.4k");
    expect(formatCompactCount(140000)).toBe("14万");
    expect(niceAxisMax(0)).toBe(1);
    expect(niceAxisMax(7)).toBe(10);
    expect(periodStartDay(7, NOW)).toBe("2026-09-03");
    expect(enumerateDays("2026-09-07", "2026-09-09")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
    expect(displayModelName("(unknown)")).toBe("未标注模型");
  });

  it("没有 byDayModel 时用 byDay 合成一条「全部」", () => {
    const rows = dayModelRowsOf({ byDay: SAMPLE.byDay, byDayModel: [] });
    expect(rows).toHaveLength(3);
    expect(rows[0]?.model).toBe("全部");
  });

  it("模型过多收成其他", () => {
    const models = [1, 2, 3, 4, 5, 6].map((n) => ({
      model: `m${n}`,
      runs: 1,
      turns: 10 - n,
      usd: 0,
      unpricedRuns: 0,
    }));
    const { series, alias } = collapseSeries(models, 5);
    expect(series.map((s) => s.model)).toEqual(["m1", "m2", "m3", "m4", "m5", USAGE_OTHER_MODEL]);
    expect(alias.get("m6")).toBe(USAGE_OTHER_MODEL);
    expect(series.at(-1)?.turns).toBe(4);
  });

  it("7 天窗口填满日期、丢掉更早的行、按模型重算卡片", () => {
    const win = sliceUsageWindow(SAMPLE, 7, NOW);
    expect(win.dayKeys[0]).toBe("2026-09-03");
    expect(win.dayKeys).toHaveLength(7);
    expect(win.series.map((s) => s.model)).toEqual(["pro", "flash"]);
    expect(win.series.find((s) => s.model === "pro")?.turns).toBe(8);
    expect(win.series.find((s) => s.model === "flash")?.turns).toBe(4);
    expect(win.totals.turns).toBe(12);
    expect(win.totals.usd).toBeCloseTo(0.1);
    expect(win.columns.find((c) => c.day === "2026-09-02")).toBeUndefined();
    const day7 = win.columns.find((c) => c.day === "2026-09-07");
    expect(day7?.parts.find((p) => p.model === "pro")?.turns).toBe(8);
    expect(win.columns.find((c) => c.day === "2026-09-08")?.turns).toBe(0);
  });

  it("30 天窗口收进 9月2 日的未计价行", () => {
    const win = sliceUsageWindow(SAMPLE, 30, NOW);
    expect(win.totals.unpricedRuns).toBe(1);
    expect(win.totals.turns).toBe(15);
    expect(win.series.find((s) => s.model === "flash")?.usd).toBeCloseTo(0.02);
  });
});

describe("消耗 DOM", () => {
  /** @type {HTMLElement} */
  let host;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  function boot(payload = SAMPLE) {
    const api = initUsageView(host, {
      fetchUsage: async () => payload,
      onClose: vi.fn(),
      now: () => NOW,
    });
    return api;
  }

  it("打开后画出模型卡、7 根柱、堆叠段", async () => {
    const api = boot();
    api.open();
    await Promise.resolve();
    const cardsText = api.el.querySelector("#usage-cards")?.textContent ?? "";
    expect(cardsText).toContain("pro");
    expect(cardsText).toContain("8 轮");
    expect(cardsText).toContain("flash");
    expect(cardsText).toContain("4 轮");
    expect(api.el.querySelectorAll(".usage-card")).toHaveLength(2);
    expect(api.el.querySelectorAll(".usage-col")).toHaveLength(7);
    const stacked = api.el.querySelector('.usage-col[data-day="2026-09-07"]');
    expect(stacked?.querySelectorAll(".usage-seg")).toHaveLength(2);
    expect(api.el.querySelector("#usage-chart-sub")?.textContent).toBe("按模型堆叠，近 7 天");
  });

  it("切换 30d 后卡片计入更早一天，切到表能看见未计价", async () => {
    const api = boot();
    api.open();
    await Promise.resolve();
    api.el.querySelector('[data-days="30"]').click();
    expect(api.el.querySelector("#usage-chart-sub")?.textContent).toBe("按模型堆叠，近 30 天");
    expect(api.el.querySelectorAll(".usage-col")).toHaveLength(30);
    expect(api.el.textContent).toContain("未计价");
    api.el.querySelector('[data-view="table"]').click();
    expect(api.el.querySelector("#usage-plot")?.hidden).toBe(true);
    expect(api.el.querySelector("#usage-table-wrap")?.hidden).toBe(false);
    expect(api.el.querySelector(".usage-table")?.textContent).toContain("2026-09-02");
    expect(api.el.querySelector(".usage-table")?.textContent).toContain("未计价");
    expect(api.el.querySelector(".usage-table")?.textContent).not.toMatch(/\$0\.00/);
  });

  it("悬停柱子弹出当日分模型提示", async () => {
    const api = boot();
    api.open();
    await Promise.resolve();
    const col = api.el.querySelector('.usage-col[data-day="2026-09-07"]');
    col.dispatchEvent(new Event("mouseenter"));
    const tip = col.querySelector(".usage-tip");
    expect(tip?.hidden).toBe(false);
    expect(tip?.textContent).toContain("2026年9月7日");
    expect(tip?.textContent).toContain("pro");
    expect(tip?.textContent).toContain("flash");
  });

  it("空台账不写 $0.00，卡片说没有运行", async () => {
    const api = boot({
      totalRuns: 0,
      totalTurns: 0,
      totalUsd: null,
      unpricedRuns: 0,
      byDay: [],
      byModel: [],
      byDayModel: [],
    });
    api.open();
    await Promise.resolve();
    expect(api.el.textContent).toContain("这段时间没有运行");
    expect(api.el.textContent).not.toContain("$0.00");
    expect(api.el.querySelector(".usage-card--empty")).toBeTruthy();
  });

  it("attachUsagePanel 可用独立 prefix，不占用 #usage-cards", async () => {
    const box = document.createElement("div");
    host.appendChild(box);
    const panel = attachUsagePanel(box, {
      idPrefix: "settings-usage",
      now: () => NOW,
      fetchUsage: async () => SAMPLE,
    });
    await panel.refresh();
    expect(box.querySelector("#settings-usage-cards")?.textContent).toContain("pro");
    expect(box.querySelector("#usage-cards")).toBeNull();
    expect(box.querySelectorAll(".usage-col")).toHaveLength(7);
  });
});

describe("deriveSpendFace 今日 / 本次花费", () => {
  const noon = Date.parse("2026-09-14T12:00:00");

  it("今日 $0.71 · 已用次数 · 未计价；不写还剩几次", () => {
    const face = deriveSpendFace({
      now: noon,
      usage: {
        byDay: [{ day: "2026-09-14", runs: 110, usd: 0.71, unpricedRuns: 26, turns: 1 }],
      },
    });
    expect(todayUsageOf({ byDay: [{ day: "2026-09-14", runs: 110, usd: 0.71, unpricedRuns: 26 }] }, noon).usd).toBe(0.71);
    expect(face.todayMoney).toBe("本机今日 $0.71");
    expect(face.todayUsed).toBe("今日已用 110 次");
    expect(face.todayLine).toContain("26 未计价");
    expect(face.chipText).toBe("本机今日 $0.71");
    expect(face.chipTitle).not.toMatch(/还剩|套餐|token/i);
    expect(face.chipTitle).toContain("本机全部工作目录");
    expect(face.chipAria).toBe("本机今日 $0.71（全部工作目录） · 今日已用 110 次 · 26 未计价");
  });

  it("台账未到不写「今日还没花费」；当天无行才是还没花费", () => {
    const pending = deriveSpendFace({ now: noon });
    expect(pending.usageReady).toBe(false);
    expect(pending.todayMoney).toBe("本机花费");
    expect(pending.chipText).toBe("本机花费");
    expect(pending.chipAria).toContain("全部工作目录");
    expect(pending.chipAria).not.toContain("今日还没花费");

    const empty = deriveSpendFace({ now: noon, usage: { byDay: [] } });
    expect(empty.usageReady).toBe(true);
    expect(empty.todayUsd).toBeNull();
    expect(empty.todayMoney).toBe("本机今日还没花费");
    expect(empty.todayUsed).toBe("今日已用 0 次");
    expect(empty.thisRunText).toBeNull();
    expect(empty.chipAria).toBe("本机今日 还没花费（全部工作目录） · 今日已用 0 次");

    const unpricedDay = deriveSpendFace({
      now: noon,
      usage: { byDay: [{ day: "2026-09-14", runs: 3, usd: null, unpricedRuns: 3 }] },
    });
    expect(unpricedDay.todayMoney).toBe("本机今日未计价");
    expect(unpricedDay.todayMoney).not.toBe("$0.00");

    expect(formatThisRunSpend({ usd: 0.04 })).toBe("这次 $0.04");
    expect(formatThisRunSpend({ usd: 0.0031 })).toBe("这次约 $0.0031");
    expect(formatThisRunSpend({ usd: null })).toBe("这次未计价");
    expect(formatThisRunSpend(null)).toBeNull();

    const withRun = deriveSpendFace({
      now: noon,
      usage: { byDay: [{ day: "2026-09-14", runs: 1, usd: 0.71, unpricedRuns: 0 }] },
      runCost: { usd: 0.04 },
    });
    expect(withRun.chipText).toBe("这次 $0.04 · 本机今日 $0.71");
  });

  it("宿主断线刷新不把已有台账抹成空", () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "public", "index.html"), "utf-8");
    expect(html).toContain("断线时保留上次读数");
    expect(html).toContain('data-spend-text>本机花费');
    expect(html).toContain("本机今日花费（全部工作目录）还在加载");
  });
});

/**
 * G3 · 消耗图形化（2026-09-18 走查纲领）：图表加「轮次 | 成本」视角——
 * 数据里的 usd/unpricedRuns 一直在，只是没画；未计价绝不画成 $0（既有脚注口径）。
 */
describe("G3 · 消耗图表：轮次/成本 视角", () => {
  let host;
  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  const boot = () => {
    const api = initUsageView(host, {
      fetchUsage: async () => SAMPLE,
      onClose: vi.fn(),
      now: () => NOW,
    });
    api.open();
    return api;
  };

  it("切换钮在；默认轮次口径不动（副标题保持原文案）", async () => {
    const api = boot();
    await Promise.resolve();
    const btns = [...api.el.querySelectorAll("[data-metric]")];
    expect(btns.map((b) => b.getAttribute("data-metric"))).toEqual(["turns", "usd"]);
    expect(api.el.querySelector("#usage-chart-sub")?.textContent).toBe("按模型堆叠，近 7 天");
  });

  it("切到成本：副标题改口、轴换金额；纯未计价的一天不画成 $0、aria 直说未计价", async () => {
    const api = boot();
    await Promise.resolve();
    // NOW=09-09：09-02 只在 30d 窗口里（既有口径），先切区间再切视角
    api.el.querySelector('[data-days="30"]').click();
    api.el.querySelector('[data-metric="usd"]').click();
    await Promise.resolve();
    expect(api.el.querySelector("#usage-chart-sub")?.textContent).toContain("成本");
    expect(api.el.querySelector(".usage-y")?.textContent).toContain("$");
    expect(api.el.querySelectorAll(".usage-col"), "切到成本后柱子不该消失").toHaveLength(30);
    // 2026-09-02 当天只有未计价运行（usd=null）：成本视角不冒充金额
    const unpriced = api.el.querySelector('.usage-col[data-day="2026-09-02"]');
    expect(unpriced?.getAttribute("aria-label") ?? "").toContain("未计价");
    // 有价的那天给出金额口径
    const priced = api.el.querySelector('.usage-col[data-day="2026-09-07"]');
    expect(priced?.getAttribute("aria-label") ?? "").toMatch(/成本 \$/);
  });
});
