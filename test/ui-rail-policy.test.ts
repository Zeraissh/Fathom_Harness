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
