// @vitest-environment jsdom
// @ts-nocheck
/**
 * P1 空间契约：右列仲裁的回归锁。
 *
 * 守的是 spec §4.1 的判据：
 *   · side↔overlay 的边界是**算出来的**（左栏 280 展开时 = 936），不是硬编码 900
 *   · collapsed 在两档里语义不同（中档收成细条 / 窄档抽屉关着）
 *   · split 只在 ≥1440 出现
 *   · 记忆一份，且能从两个旧键迁移
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENTER_MIN_PX,
  RAIL_MIN_PX,
  RAIL_MAX_PX,
  RAIL_COLLAPSED_PX,
  SPLIT_MIN_PX,
  RAIL_DEFAULT_FRACTION,
  RAIL_PREF_KEY,
  LEGACY_RAIL_COLLAPSED_KEY,
  LEGACY_DOCK_FRACTION_KEY,
  clampRailFraction,
  railPolicy,
  normalizeRailPref,
  readRailPref,
  writeRailPref,
  sidebarYieldBoundary,
  shouldYieldSidebar,
} from "../ui/public/core/rail-policy.js";

const SIDEBAR = 280; // styles.css: .sidebar { width: 280px }
const side = (vw, extra = {}) =>
  railPolicy({ viewportWidth: vw, sidebarWidth: SIDEBAR, preferredFraction: RAIL_DEFAULT_FRACTION, ...extra });

describe("railPolicy：预算算出来的边界", () => {
  it("边界恰好落在 936（280 + 416 + 240）", () => {
    const at936 = side(936);
    expect(at936.mode).toBe("side");
    expect(at936.railWidth).toBe(RAIL_MIN_PX);
    expect(at936.centerWidth).toBe(CENTER_MIN_PX);

    const at935 = side(935);
    expect(at935.mode).toBe("overlay");
    expect(at935.centerWidth).toBe(935 - SIDEBAR); // 覆盖不占位
  });

  it("声明 900 会是假断点：900 处按预算就已经退覆盖了", () => {
    expect(side(900).mode).toBe("overlay");
    expect(side(936).mode).toBe("side");
  });

  it("左栏收起时边界随之下降（预算跟着变）", () => {
    // sidebarWidth=0 → 边界 = 416 + 240 = 656
    expect(railPolicy({ viewportWidth: 656, sidebarWidth: 0 }).mode).toBe("side");
    expect(railPolicy({ viewportWidth: 655, sidebarWidth: 0 }).mode).toBe("overlay");
  });

  it("split 只在 ≥1440 出现，且两列之和等于 railWidth", () => {
    const at1439 = side(1439);
    expect(at1439.layout).toBe("tabbed");
    expect(at1439.tree).toBe(at1439.railWidth);
    expect(at1439.preview).toBe(0);

    const at1440 = side(1440);
    expect(at1440.layout).toBe("split");
    expect(at1440.tree + at1440.preview).toBe(at1440.railWidth);
    expect(at1440.tree).toBeGreaterThan(0);
    expect(at1440.preview).toBeGreaterThan(0);
    expect(SPLIT_MIN_PX).toBe(1440);
  });
});

describe("railPolicy：collapsed 在两档里不是一个意思", () => {
  it("宽/中档：收成 40px 细条，两个面板都不显示", () => {
    const r = side(1200, { collapsed: true });
    expect(r.mode).toBe("side");
    expect(r.railWidth).toBe(RAIL_COLLAPSED_PX);
    expect(r.tree).toBe(0);
    expect(r.preview).toBe(0);
    expect(r.centerWidth).toBe(1200 - SIDEBAR - RAIL_COLLAPSED_PX);
  });

  it("窄档：抽屉关着，不占位（不是 40px 细条）", () => {
    const r = side(935, { collapsed: true });
    expect(r.mode).toBe("overlay");
    expect(r.railWidth).toBe(0);
    expect(r.centerWidth).toBe(935 - SIDEBAR);
  });
});

describe("railPolicy：面板与宽度", () => {
  it("tabbed 下按 panel 给满，另一个为 0", () => {
    expect(side(1200, { panel: "preview" }).preview).toBe(side(1200).railWidth);
    expect(side(1200, { panel: "preview" }).tree).toBe(0);
  });

  it("railWidth 恒在 [RAIL_MIN, RAIL_MAX] 内（side 档）", () => {
    for (const vw of [936, 1000, 1200, 1440, 1920, 3200]) {
      const r = side(vw);
      expect(r.railWidth).toBeGreaterThanOrEqual(RAIL_MIN_PX);
      expect(r.railWidth).toBeLessThanOrEqual(RAIL_MAX_PX);
    }
  });

  it("预算紧时右列被精确压到让对话刚好等于 416（不是压到下限）", () => {
    const vw = 940;
    const available = vw - SIDEBAR; // 660
    const railBudget = available - CENTER_MIN_PX; // 244 > RAIL_MIN，所以拿 244
    const r = railPolicy({ viewportWidth: vw, sidebarWidth: SIDEBAR, preferredFraction: 0.45 });
    expect(railBudget).toBeGreaterThan(RAIL_MIN_PX);
    expect(r.railWidth).toBe(railBudget);
    expect(r.centerWidth).toBe(CENTER_MIN_PX);
    // 偏好比预算大时仍只拿预算，不侵占对话下限
    expect(r.railWidth).toBeLessThan(Math.round(available * 0.45));
  });

  it("预算刚好等于下限时对话也恰好是 416（边界不塌）", () => {
    const r = railPolicy({ viewportWidth: 936, sidebarWidth: SIDEBAR, preferredFraction: 0.45 });
    expect(r.railWidth).toBe(RAIL_MIN_PX);
    expect(r.centerWidth).toBe(CENTER_MIN_PX);
  });

  it("splitRatio 决定并排比例", () => {
    const r = side(1600, { splitRatio: 0.25 });
    expect(r.tree).toBe(Math.round(r.railWidth * 0.25));
    expect(r.tree + r.preview).toBe(r.railWidth);
  });

  it("非法/越界输入不炸，回落到安全值", () => {
    expect(railPolicy({}).mode).toBe("overlay");
    expect(railPolicy({ viewportWidth: NaN, sidebarWidth: -5 }).centerWidth).toBe(0);
    expect(side(1200, { panel: "nope" }).tree).toBe(side(1200).railWidth); // 回落 tree
    expect(side(1200, { preferredFraction: 99 }).railWidth).toBe(RAIL_MAX_PX);
    expect(side(1200, { preferredFraction: -1 }).railWidth).toBe(RAIL_MIN_PX);
  });
});

describe("railPolicy：clampRailFraction", () => {
  it("越界钳制、非法回默认", () => {
    expect(clampRailFraction(0.9)).toBeLessThanOrEqual(0.45);
    expect(clampRailFraction(0)).toBeGreaterThanOrEqual(0.18);
    expect(clampRailFraction("x")).toBe(RAIL_DEFAULT_FRACTION);
    expect(clampRailFraction(undefined)).toBe(RAIL_DEFAULT_FRACTION);
  });
});

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

describe("右列记忆：一份键 + 两个旧键迁移", () => {
  it("没有新键时从旧键迁移（折叠 + dock 比例）", () => {
    const s = fakeStorage({ [LEGACY_RAIL_COLLAPSED_KEY]: "1", [LEGACY_DOCK_FRACTION_KEY]: "0.4" });
    const p = readRailPref(s);
    expect(p.collapsed).toBe(true);
    expect(p.fraction).toBeCloseTo(0.4, 5);
  });

  it("新键存在时不再读旧键", () => {
    const s = fakeStorage({
      [RAIL_PREF_KEY]: JSON.stringify({ collapsed: false, fraction: 0.2, panel: "preview" }),
      [LEGACY_RAIL_COLLAPSED_KEY]: "1",
      [LEGACY_DOCK_FRACTION_KEY]: "0.44",
    });
    const p = readRailPref(s);
    expect(p.collapsed).toBe(false);
    expect(p.fraction).toBeCloseTo(0.2, 5);
    expect(p.panel).toBe("preview");
  });

  it("旧键不被写坏（降级回滚不丢偏好）", () => {
    const s = fakeStorage({ [LEGACY_RAIL_COLLAPSED_KEY]: "1", [LEGACY_DOCK_FRACTION_KEY]: "0.4" });
    readRailPref(s);
    writeRailPref(s, { collapsed: false, fraction: 0.3, panel: "tree" });
    expect(s.getItem(LEGACY_RAIL_COLLAPSED_KEY)).toBe("1");
    expect(s.getItem(LEGACY_DOCK_FRACTION_KEY)).toBe("0.4");
    expect(JSON.parse(s.getItem(RAIL_PREF_KEY)).fraction).toBeCloseTo(0.3, 5);
  });

  it("损坏的 JSON / 没有 storage 都回默认，不抛", () => {
    expect(readRailPref(fakeStorage({ [RAIL_PREF_KEY]: "{oops" })).fraction).toBe(RAIL_DEFAULT_FRACTION);
    expect(readRailPref(null).fraction).toBe(RAIL_DEFAULT_FRACTION);
    expect(() => writeRailPref(null, { fraction: 0.3 })).not.toThrow();
    expect(normalizeRailPref("{oops")).toBeNull();
  });
});

describe("shouldYieldSidebar：窄窗左栏让位（与右列同一份预算）", () => {
  const SIDEBAR = 292; // 活页实测宽（styles.css 声明 280，实测 292——边界先量后算）

  it("边界 = 左栏实测宽 + 对话地板 + 右列下限（292 时是 948，与右列 side↔overlay 同一处）", () => {
    expect(sidebarYieldBoundary(SIDEBAR)).toBe(948);
    expect(sidebarYieldBoundary(280)).toBe(936);
  });

  it("有会话在开：低于边界让位，等于边界不让", () => {
    expect(shouldYieldSidebar({ viewportWidth: 947, sidebarWidth: SIDEBAR, hasOpenConversation: true })).toBe(true);
    expect(shouldYieldSidebar({ viewportWidth: 948, sidebarWidth: SIDEBAR, hasOpenConversation: true })).toBe(false);
    // 701–707 那一段（活页实测对话 409–415 < 416）正是这条规则真正吃到的窗口
    expect(shouldYieldSidebar({ viewportWidth: 705, sidebarWidth: SIDEBAR, hasOpenConversation: true })).toBe(true);
  });

  it("只看列表（欢迎态）不让位——那时左栏就是内容本身", () => {
    expect(shouldYieldSidebar({ viewportWidth: 500, sidebarWidth: SIDEBAR, hasOpenConversation: false })).toBe(false);
  });

  it("已经收着（量到 0）不让位：无处可让，防收-展开抖动", () => {
    expect(shouldYieldSidebar({ viewportWidth: 500, sidebarWidth: 0, hasOpenConversation: true })).toBe(false);
  });

  it("宽屏永不让位；空输入不炸", () => {
    expect(shouldYieldSidebar({ viewportWidth: 1440, sidebarWidth: SIDEBAR, hasOpenConversation: true })).toBe(false);
    expect(shouldYieldSidebar({})).toBe(false);
    expect(shouldYieldSidebar()).toBe(false);
  });
});

describe("宿主接线锁（index.html）", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

  it("让位判据用纯函数、收起不写用户偏好、各选会话路径与 resize 都接", () => {
    expect(html).toMatch(/shouldYieldSidebar\(\{/);
    // 视口逼出来的收起绝不写偏好（偏好是另一个键）
    expect(html).toMatch(/setSidebarCollapsed\(true, \{ persist: false \}\)/);
    expect((html.match(/syncSidebarYield\(\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("resize 节流有自愈兜底——rAF 不落地时不能让后续 resize 全被吞", () => {
    // 活页实测（2026-09-18）：面板被遮挡（document.hidden）后 rAF 那次回调永不落地，
    // 旧写法 `if (raf) return` 从此吞掉所有 resize（连合成事件都唤不醒重绘）。
    expect(html).toMatch(/if \(document\.hidden\) \{/);
    expect(html).toMatch(/now - rafAt < 200/);
    expect(html).toMatch(/cancelAnimationFrame\(raf\)/);
    // 从隐藏回到可见要补上错过的重绘
    expect(html).toMatch(/visibilitychange/);
  });

  /**
   * 2026-09-18 走查 UX-B2：收起键点击前后字节级零变化（没接线），且键在
   * .right-rail-tabs 里——而 split 档整排隐藏，键跟着一起消失；收起态更是
   * 无入口可回去。修法：键移出 tab 行成为右列直接子节点（布局无关地存活），
   * 点击写偏好。
   */
  it("右列收起键：接线了，且不在 tab 行里", () => {
    expect(html).toMatch(
      /right-rail-collapse[\s\S]{0,400}?saveRailPref\(\{ collapsed: !/,
    );
    const tabs = html.match(/<div class="right-rail-tabs"[\s\S]*?<\/div>/);
    expect(tabs?.[0] ?? "", "收起键还关在 tab 行里——split 档会跟着消失").not.toContain(
      "right-rail-collapse",
    );
  });

  it("放大态的左伸量由宿主算（坞在右列里，要盖主区就得向左伸过对话列）", () => {
    expect(html).toMatch(/--rail-expand-inset/);
  });
});

describe("样式锁（styles.css）：split 真并排", () => {
  const css = readFileSync(join(__dirname, "..", "ui", "public", "styles.css"), "utf-8");

  /**
   * 走查 UX-B1：面板拿的是 `flex: 0 0 var(--rail-tree-w)`，但右列是 column——
   * flex-basis 于是被当**高度**用，两条 141px 横条叠在 769px 的列顶，下面全空。
   * 注释写着"并排"，缺的就是这一行 flex-direction。
   */
  it("split 档右列是 row——flex-basis 才是宽度而不是高度", () => {
    expect(css).toMatch(
      /\.right-rail\[data-layout="split"\]\s*\{[^}]*flex-direction:\s*row/,
    );
  });

  it("放大态用宿主给的左伸量盖满主区（inset 左值不再恒 0）", () => {
    expect(css).toMatch(/\.preview-dock--expanded\s*\{[^}]*var\(--rail-expand-inset/);
  });

  it("收起态图标翻转，收起后还看得见展开入口", () => {
    expect(css).toMatch(/\.right-rail\[data-collapsed="true"\]\s*\.right-rail-collapse/);
  });




});
