// @vitest-environment jsdom
// @ts-nocheck
/**
 * P1 空间契约：右列仲裁的回归锁。
 *
 * 守的是 spec §4.1 的判据：
 *   · side↔overlay 的边界是**算出来的**（左栏 280 展开时 = 936），不是硬编码 900
 *   · collapsed 在两档里语义不同（中档收成细条 / 窄档抽屉关着）
 *   · layout 只有两形态：docked（预算装得下，占宽）/ floating（浮层不占位）
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
  RAIL_DEFAULT_FRACTION,
  RAIL_LAYOUTS,
  RAIL_SURFACES,
  DOCK_MIN_BUDGET_PX,
  FLOATING_WIDTH_RATIO,
  RAIL_PREF_KEY,
  LEGACY_RAIL_COLLAPSED_KEY,
  LEGACY_DOCK_FRACTION_KEY,
  clampRailFraction,
  railPolicy,
  railVisibility,
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
  it("边界恰好落在 936（280 + 416 + 240）——side 档，但预算不够 docked 所以是 floating", () => {
    const at936 = side(936);
    expect(at936.mode).toBe("side");
    expect(at936.layout).toBe("floating");
    expect(at936.centerWidth).toBe(936 - SIDEBAR); // floating 不占位：对话一个像素不让

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
});

/**
 * 两形态：占宽列 / 浮层（计划 4 · T1）。
 *
 * 拆掉 split 的判据：`RAIL_MAX_PX=360` 与 `TREE_MIN_PX=200` 决定了并排时
 * 预览列永远 ~160px（计划 3 终审实测）。没有并排列就没有这个问题。
 */
describe("右列两形态：docked / floating", () => {
  it("RAIL_LAYOUTS 只有 docked 与 floating", () => {
    expect([...RAIL_LAYOUTS]).toEqual(["docked", "floating"]);
  });

  it("RAIL_SURFACES 是 tree / preview / review（一次一只）", () => {
    expect([...RAIL_SURFACES]).toEqual(["tree", "preview", "review"]);
  });

  it("宽屏给 docked：railWidth 从对话那里拿，centerWidth = available − railWidth", () => {
    const r = side(1920);
    expect(r.layout).toBe("docked");
    expect(r.railWidth).toBeGreaterThan(0);
    expect(r.centerWidth).toBe(1920 - SIDEBAR - r.railWidth);
  });

  it("窄屏给 floating：对话宽度**逐像素不变**（浮层不占位）", () => {
    const r = side(900);
    expect(r.layout).toBe("floating");
    // 浮层宽由预算给，但它**不从 centerWidth 扣**
    expect(r.railWidth).toBeGreaterThan(0);
    expect(r.centerWidth).toBe(900 - SIDEBAR);

    // 900 落在窄档（overlay）里；side 档里「预算不够 docked」的那一段（936–1351）
    // 走的才是 canDock 分支的 floating——同样逐像素不占位。
    // ★ 补这段是因为变异验红的两处（canDock / floating 的 centerWidth）都只
    // 够得着这个分支：只测 900 的话，两处变异都验不红（见任务报告）。
    const mid = side(1200);
    expect(mid.layout).toBe("floating");
    expect(mid.centerWidth).toBe(1200 - SIDEBAR);
  });

  it("★ 任何宽度下都不再返回两列像素（tree / preview 字段消失）", () => {
    for (const vw of [900, 1100, 1440, 1920, 3200]) {
      const r = side(vw);
      expect(r).not.toHaveProperty("tree");
      expect(r).not.toHaveProperty("preview");
      expect(RAIL_SURFACES).toContain(r.surface);
    }
  });

  it("collapsed：两形态下都不占位", () => {
    expect(side(1920, { collapsed: true }).collapsed).toBe(true);
    expect(side(900, { collapsed: true }).collapsed).toBe(true);
  });

  it("docked↔floating 的分界也是预算算出来的：装得下 [对话地板 + 右列下限] 才 docked", () => {
    // DOCK_MIN_BUDGET_PX = 416 + 240 = 656 ⇒ available ≥ 1072 ⇒ 左栏 280 时视口 ≥ 1352
    expect(DOCK_MIN_BUDGET_PX).toBe(CENTER_MIN_PX + RAIL_MIN_PX);
    const at1352 = side(1352);
    expect(at1352.layout).toBe("docked");
    expect(at1352.centerWidth).toBe(1352 - SIDEBAR - at1352.railWidth);

    const at1351 = side(1351);
    expect(at1351.mode).toBe("side"); // 还在 side 档……
    expect(at1351.layout).toBe("floating"); // ……但预算不够 docked ⇒ 浮层
    expect(at1351.centerWidth).toBe(1351 - SIDEBAR); // 不占位
  });

  it("floating 的浮层宽按 FLOATING_WIDTH_RATIO 给，钳进 [RAIL_MIN, RAIL_MAX]", () => {
    expect(FLOATING_WIDTH_RATIO).toBe(0.6);
    // available 656 ⇒ 656 × 0.6 = 394 ⇒ 钳到 RAIL_MAX
    const r = side(936);
    expect(r.layout).toBe("floating");
    expect(r.railWidth).toBe(RAIL_MAX_PX);
  });
});

describe("railPolicy：collapsed 在两档里不是一个意思", () => {
  it("宽/中档：收成 40px 细条（collapsed 语义没变；两列字段已随 split 消失）", () => {
    const r = side(1200, { collapsed: true });
    expect(r.mode).toBe("side");
    expect(r.layout).toBe("docked");
    expect(r.railWidth).toBe(RAIL_COLLAPSED_PX);
    expect(r.collapsed).toBe(true);
    expect(r.centerWidth).toBe(1200 - SIDEBAR - RAIL_COLLAPSED_PX);
    expect(r).not.toHaveProperty("tree");
    expect(r).not.toHaveProperty("preview");
  });

  it("窄档：抽屉关着，不占位（不是 40px 细条）", () => {
    const r = side(935, { collapsed: true });
    expect(r.mode).toBe("overlay");
    expect(r.layout).toBe("floating");
    expect(r.railWidth).toBe(0);
    expect(r.centerWidth).toBe(935 - SIDEBAR);
  });
});

describe("railPolicy：面与宽度", () => {
  it("按 surface 选面（一次一只，docked 下宽度照拿）", () => {
    const r = side(1920, { surface: "preview" });
    expect(r.surface).toBe("preview");
    expect(r.railWidth).toBe(side(1920).railWidth);
    expect(r).not.toHaveProperty("tree");
    expect(r).not.toHaveProperty("preview");
  });

  it("railWidth 恒在 [RAIL_MIN, RAIL_MAX] 内（docked 档）", () => {
    // floating 的浮层宽是另一套（FLOATING_WIDTH_RATIO 那套），这里只锁 docked
    for (const vw of [1440, 1920, 3200]) {
      const r = side(vw);
      expect(r.layout).toBe("docked");
      expect(r.railWidth).toBeGreaterThanOrEqual(RAIL_MIN_PX);
      expect(r.railWidth).toBeLessThanOrEqual(RAIL_MAX_PX);
    }
  });

  it("预算紧时（side 档但装不下 docked）：浮层不占位，对话保持全部可用宽", () => {
    // 旧世界这里是"右列被压到让对话刚好 416"；940 现在是 floating，
    // 压预算的行为随 split 一起消失了——对话一个像素都不让。
    const vw = 940;
    const available = vw - SIDEBAR; // 660
    const railBudget = available - CENTER_MIN_PX; // 244 ≥ RAIL_MIN ⇒ side 档
    const r = railPolicy({ viewportWidth: vw, sidebarWidth: SIDEBAR, preferredFraction: 0.45 });
    expect(railBudget).toBeGreaterThanOrEqual(RAIL_MIN_PX);
    expect(r.layout).toBe("floating");
    expect(r.centerWidth).toBe(available);
    expect(r.railWidth).toBeGreaterThan(0); // 浮层自己有宽
  });

  it("预算刚好等于下限时也不塌：936 是 side 档的边界，floating 让对话全宽", () => {
    const r = railPolicy({ viewportWidth: 936, sidebarWidth: SIDEBAR, preferredFraction: 0.45 });
    expect(r.mode).toBe("side");
    expect(r.layout).toBe("floating");
    expect(r.centerWidth).toBe(936 - SIDEBAR);
  });

  it("非法/越界输入不炸，回落到安全值", () => {
    expect(railPolicy({}).mode).toBe("overlay");
    expect(railPolicy({ viewportWidth: NaN, sidebarWidth: -5 }).centerWidth).toBe(0);
    expect(side(1200, { surface: "nope" }).surface).toBe("tree"); // 回落 tree
    // 计划 4 改名：旧的 `panel` 入参只读不写——兼容读到任务 3 为止
    expect(side(1200, { panel: "preview" }).surface).toBe("preview");
    // 注意用 docked 档（1352）测钳制：floating 的浮层宽走 FLOATING_WIDTH_RATIO，
    // 不看 preferredFraction（那是"浮层"与"占宽列"的差别之一）
    expect(side(1352, { preferredFraction: 99 }).railWidth).toBe(RAIL_MAX_PX);
    expect(side(1352, { preferredFraction: -1 }).railWidth).toBe(RAIL_MIN_PX);
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
      // 存储里的 `panel` 是旧名（计划 4 改名 surface）——normalize 只读不写它
      [RAIL_PREF_KEY]: JSON.stringify({ collapsed: false, fraction: 0.2, panel: "preview" }),
      [LEGACY_RAIL_COLLAPSED_KEY]: "1",
      [LEGACY_DOCK_FRACTION_KEY]: "0.44",
    });
    const p = readRailPref(s);
    expect(p.collapsed).toBe(false);
    expect(p.fraction).toBeCloseTo(0.2, 5);
    expect(p.surface).toBe("preview");
  });

  it("★ 过渡垫已摘（计划 4 · T3）：readRailPref 每条路径都不再发旧名 panel，旧键迁移仍在", () => {
    // 宿主五处读点已随任务 3 改成 pref.surface；返回值每条路径都不许再带 panel
    // （别名与读点是同一只垫子的两半，只摘一半 = 旧名缺口原样复现）：
    // ① 新键里存 surface
    const s1 = fakeStorage({ [RAIL_PREF_KEY]: JSON.stringify({ surface: "preview" }) });
    const p1 = readRailPref(s1);
    expect(p1.surface).toBe("preview");
    expect(Object.prototype.hasOwnProperty.call(p1, "panel")).toBe(false);

    // ② 新键里是旧名 panel（只读不写：读进 surface）
    const s2 = fakeStorage({ [RAIL_PREF_KEY]: JSON.stringify({ panel: "review" }) });
    const p2 = readRailPref(s2);
    expect(p2.surface).toBe("review");
    expect(Object.prototype.hasOwnProperty.call(p2, "panel")).toBe(false);

    // ③ 空存储 / 损坏 JSON / 旧键迁移——回退与迁移路径同样不带 panel
    for (const s of [
      fakeStorage(),
      fakeStorage({ [RAIL_PREF_KEY]: "{oops" }),
      fakeStorage({ [LEGACY_RAIL_COLLAPSED_KEY]: "1", [LEGACY_DOCK_FRACTION_KEY]: "0.4" }),
    ]) {
      const p = readRailPref(s);
      expect(p.surface).toBe("tree");
      expect(Object.prototype.hasOwnProperty.call(p, "panel")).toBe(false);
    }

    // 承重的那一半（端到端）：调用方仍可能直传旧名（旧宿主/降级回滚的写法），
    // normalize 把 panel 读进 surface（3-B′ 的迁移回退），而落盘的 JSON 不许
    // 再出现旧键 panel——旧键只读不写。
    // ★ 不再 spread readRailPref：它带 surface:"tree"，两键并存时 surface 胜
    //   （3-B′ 的新裁决）——旧名补丁要单独传才测得到迁移读。
    const s3 = fakeStorage();
    writeRailPref(s3, { collapsed: false, panel: "review" });
    const p3 = readRailPref(s3);
    expect(p3.surface).toBe("review");
    expect(JSON.parse(s3.getItem(RAIL_PREF_KEY))).not.toHaveProperty("panel");
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
   *
   * 2026-09-18 二轮（内容驱动）：按键语义升级为"关当前显示层"——开/关走
   * railOpen/railClose（仍写偏好，但显示层由 railVisibility 判），
   * 欢迎页/无内容时 pref 与显示层不再是一回事。
   */
  it("右列收起键：接线了（走内容驱动开关），且不在 tab 行里", () => {
    expect(html).toMatch(
      /right-rail-collapse[\s\S]{0,400}?railVisibilityNow\(\)/,
    );
    expect(html).toMatch(/function railClose\(\)[\s\S]{0,200}?saveRailPref\(\{ collapsed: true \}\)/);
    expect(html).toMatch(/function railOpen\(\)[\s\S]{0,200}?saveRailPref\(\{ collapsed: false \}\)/);
    // ★ 页签行已随 split 一起拆（计划 4 · T3 换成召出钮行，住在对话头部）——
    // 旧的 match 断言在行删掉后退化成空串恒绿（锁 markup 的锁必须锁 markup），
    // 改成直接锁"整个行都不许再有"。
    expect(html, "页签行该随 split 拆干净").not.toMatch(/right-rail-tabs/);
    // 收起键仍是右列的直接子节点：在 rail 块里（不在任何会随档消失的行里）
    const railOpen = html.indexOf('<div id="right-rail"');
    const railHandle = html.indexOf('id="right-rail-handle"');
    expect(railOpen).toBeGreaterThan(-1);
    expect(railHandle).toBeGreaterThan(railOpen);
    expect(html.slice(railOpen, railHandle), "收起键还关在右列的某条行里").toContain("right-rail-collapse");
  });

  it("放大态的左伸量由宿主算（坞在右列里，要盖主区就得向左伸过对话列）", () => {
    expect(html).toMatch(/--rail-expand-inset/);
  });

  /**
   * 走查 UX-B4/E13：命令面板/通知/记忆/全局搜索四块浮层都是 z-index 60 且互不
   * 相斥——开着记忆点铃铛，通知会开在它底下（看着像"点了没反应"）；各自还都
   * 挂了文档级 Esc，一次 Esc 连关两层。宿主在四者 open 前先关其余。
   */
  it("E13：四块浮层开前互斥（宿主接线）", () => {
    expect(html).toMatch(/function registerFloatingPanel\(/);
    expect(html).toMatch(/commandPaletteApi = registerFloatingPanel\(/);
    expect(html).toMatch(/notificationsApi = registerFloatingPanel\(/);
    expect(html).toMatch(/memoryPanelApi = registerFloatingPanel\(/);
    expect(html).toMatch(/searchApi = registerFloatingPanel\(search\.initGlobalSearch/);
    // 触发器由各模块**自己绑**——外部包 api.open 拦不到，必须走 onOpen 钩子
    expect(html).toMatch(/onOpen: \(\) => closeOtherFloatingPanels\(notificationsApi\)/);
    expect(html).toMatch(/onOpen: \(\) => closeOtherFloatingPanels\(memoryPanelApi\)/);
    expect(html).toMatch(/onOpen: \(\) => closeOtherFloatingPanels\(searchApi\)/);
    for (const f of ["notifications.js", "memory-panel.js", "global-search.js"]) {
      const src = readFileSync(join(__dirname, "..", "ui", "public", "features", f), "utf-8");
      expect(src, `${f} 应在 openPanel 里调 host.onOpen`).toMatch(/host\.onOpen\?\.\(\)/);
    }
  });

  it("E14：右列「预览」tab 能唤回收起的坞（preview:reveal 有发有听）", () => {
    expect(html).toMatch(/preview:reveal/);
    const dockSrc = readFileSync(
      join(__dirname, "..", "ui", "public", "features", "preview-dock.js"),
      "utf-8",
    );
    expect(dockSrc).toMatch(/preview:reveal/);
    // railHosted 下浮出钮让位（它的重开入口改走「预览」tab）
    expect(dockSrc).toMatch(/revealBtn\.hidden = [\s\S]{0,120}railHosted\(\)/);
  });
});

/**
 * 二轮走查（2026-09-18 夜）：右列从"常驻家具"改「内容的家」。
 * 委托方拍板：①欢迎页一律不显示（细条/把手保留，手动可开）
 *            ②窄档永不自动展开，角标提示 → 点开是全宽 sheet。
 */
describe("railVisibility：内容驱动（欢迎页不显示 / 窄档不抢屏）", () => {
  it("欢迎页一律收起——有文件也不自动开；对话里没内容同样收起", () => {
    expect(
      railVisibility({ context: "welcome", hasContent: true, mode: "side", userCollapsed: false }),
    ).toEqual({ collapsed: true, badge: false });
    expect(
      railVisibility({ context: "conversation", hasContent: false, mode: "side" }),
    ).toEqual({ collapsed: true, badge: false });
  });

  it("对话 + 有内容 + 宽档：默认开；手动收起过 → 收 + 角标（dismiss 粘住，R3）", () => {
    expect(
      railVisibility({ context: "conversation", hasContent: true, mode: "side", userCollapsed: false }),
    ).toEqual({ collapsed: false, badge: false });
    expect(
      railVisibility({ context: "conversation", hasContent: true, mode: "side", userCollapsed: true }),
    ).toEqual({ collapsed: true, badge: true });
  });

  it("窄档永不自动展开（一律收起 + 角标）；本次会话手动打开过才让位", () => {
    expect(
      railVisibility({ context: "conversation", hasContent: true, mode: "overlay", userCollapsed: false }),
    ).toEqual({ collapsed: true, badge: true });
    expect(
      railVisibility({ context: "conversation", hasContent: true, mode: "overlay", userOpenNow: true }),
    ).toEqual({ collapsed: false, badge: false });
    // 手动开过之后连"没内容/欢迎页"也尊重——那是用户主动要看的
    expect(
      railVisibility({ context: "welcome", hasContent: false, mode: "overlay", userOpenNow: true }),
    ).toEqual({ collapsed: false, badge: false });
  });

  it("窄档打开的抽屉是全宽 sheet，不是 240px 浮层（修 61% 遮挡的那条）", () => {
    const r = railPolicy({ viewportWidth: 935, sidebarWidth: SIDEBAR, collapsed: false });
    expect(r.mode).toBe("overlay");
    expect(r.layout).toBe("floating");
    expect(r.railWidth).toBe(935 - SIDEBAR); // 全宽
    expect(r.centerWidth).toBe(935 - SIDEBAR); // 覆盖档：中心列不缩，靠遮罩表达层级
  });
});

describe("宿主接线锁（index.html）：内容驱动的把手/角标/遮罩", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

  it("把手与遮罩存在，可见性走纯函数", () => {
    expect(html).toMatch(/id="right-rail-handle"/);
    expect(html).toMatch(/id="right-rail-scrim"/);
    expect(html).toMatch(/railVisibilityNow\(/);
  });

  it("自动打开不再强写用户偏好（R3：dismiss 粘住）", () => {
    // 旧写法：preview:open → saveRailPref({ panel: "preview", collapsed: false })
    expect(html).not.toMatch(/saveRailPref\(\{\s*panel:\s*"preview",\s*collapsed:\s*false\s*\}\)/);
    expect(html).toMatch(/preview:open/);
  });

  it("窄档 sheet 的三种关闭路径：Esc / 遮罩点外 / 收起键", () => {
    expect(html).toMatch(/right-rail-scrim[\s\S]{0,400}?railClose/);
    expect(html).toMatch(/Escape[\s\S]{0,300}?railClose/);
  });
});

describe("样式锁（styles.css）：与 split 无关、任务 2 不动的那几条", () => {
  const css = readFileSync(join(__dirname, "..", "ui", "public", "styles.css"), "utf-8");

  it("放大态用宿主给的左伸量盖满主区（inset 左值不再恒 0）", () => {
    expect(css).toMatch(/\.preview-dock--expanded\s*\{[^}]*var\(--rail-expand-inset/);
  });

  /**
   * 走查 UX-C1（活页实锤）：右列 240/282 档下 `.ac-browser-bar` 溢出 76px——
   * URL 框被 flex:1;min-width:0 压成 16px 的一条缝，最右边的按钮被窗口右缘直接
   * 切断（bodyScrollX=0，页面不横滚，就是看不见点不着）。修法：允许换行 + URL 有地板。
   */
  it("画布工具条窄档收纳：URL 有地板、工具按钮换行，不挤出窗口", () => {
    expect(css).toMatch(/\.ac-browser-bar\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ac-browser-url\s*\{[^}]*min-width:\s*\d+px/);
  });

  /**
   * O1：`.ac-title { flex: 0 0 auto }` 让 .ac-name 的三件套（ellipsis）成死代码——
   * flex-shrink:0 的子项对容器 min-content 的贡献取 max-content，父不缩，子就永远
   * 没有"被裁"的那一天；超长文件名会把坞顶条撑出右列。
   */
  it("坞顶条长文件名可省略：.ac-title 允许收缩（ellipsis 不许是死代码）", () => {
    expect(css).toMatch(/\.ac-title\s*\{[^}]*flex:\s*0 1 auto/);
  });

  /**
   * 走查 UX-B4/E14：坞收起只写 root.hidden，右列留一块 display:flex 的空槽；
   * 且坞自带手柄（z-40）压住右列拖柄（z-30），railHosted 下 mousedown 早退
   * ——右列拖宽在坞打开时静默失效。
   */
  it("E14：坞收起不留空槽；坞自带手柄不再吞右列拖宽（railHosted）", () => {
    // 槽里有两个坞实例，判据是"没有任何可见坞"——存在 hidden 坞不能连坐
    expect(css).toMatch(
      /\.right-rail-preview:not\(:has\(> \.preview-dock:not\(\[hidden\]\)\)\)[^{]*\{[^}]*display:\s*none/,
    );
    expect(css).toMatch(/\.right-rail-preview\s+\.preview-dock\s+\.pd-handle\s*\{[^}]*pointer-events:\s*none/);
  });

  it("E15：右栏分区标题有折叠三角（与 progress-card/scope 同款提示）", () => {
    expect(css).toMatch(/\.rail-section-title::(before|after)/);
  });
});

describe("右栏的第三只面板：review（计划 3 · T7 → 计划 4 改名 surface）", () => {
  it("RAIL_SURFACES 认得 review", () => {
    expect(RAIL_SURFACES).toContain("review");
  });

  it("docked 下选 review：它是一只独立的面，宽度照拿（没有两列可占）", () => {
    const r = side(1920, { surface: "review" });
    expect(r.layout).toBe("docked");
    expect(r.surface).toBe("review");
    expect(r.railWidth).toBe(side(1920).railWidth); // 面自己画在右栏自己的槽里
    expect(r).not.toHaveProperty("tree");
    expect(r).not.toHaveProperty("preview");
  });
});

describe("宿主接线锁（index.html + app.js）：「在右栏审阅 →」与 review:reveal（计划 3 · T7）", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");
  const app = readFileSync(join(__dirname, "..", "ui", "public", "app.js"), "utf-8");

  it("「在右栏审阅 →」接线：app.js 画带挂钩的按钮，宿主点击接 showRailSurface({ surface: \"review\" })", () => {
    // 两半都锁：没有挂钩，宿主委托点不到它；没有宿主那一半，按钮是死的
    expect(app).toMatch(/data-change-action="open-review-panel"/);
    expect(html).toMatch(/open-review-panel[\s\S]{0,200}?showRailSurface\(\{\s*surface:\s*"review"\s*\}\)/);
  });

  it("review:reveal 有发有听（点「改动」tab 唤回面板内容，与 E14 同款）", () => {
    const n = [...html.matchAll(/review:reveal/g)].length;
    expect(n, "只有 dispatch 没有监听（或反之）——tab 点动唤不醒面板").toBeGreaterThanOrEqual(2);
  });

  it("面板内容挂在 renderDetailWithState 的重画链上（与卡片同一时机）", () => {
    expect(html).toMatch(/paintChangeCardPatches\(runId[\s\S]{0,120}?paintReviewPanel\(\)/);
  });
});

/**
 * 计划 4 · T3：召出钮行 + paintRightRail 落新形态。
 *
 * 钮行由 app.js 拼进对话头部 .back-bar（3-H：不住在右列里——列一关就再没有
 * 那个键，「再点同一个键」才可能成立）；paintRightRail 落 data-surface 与
 * 新形态的 CSS 变量。锁的主体在 index.html / app.js 的源码文本上。
 */
describe("召出钮与 paintRightRail 的接线（计划 4 · T3）", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");
  const appJs = readFileSync(join(__dirname, "..", "ui", "public", "app.js"), "utf-8");

  it("★ 两脸的钮都在对话头部渲染（app.js），且都带 data-rail-surface", () => {
    // ★ 必须读 app.js：钮行由 app.js 拼进 .back-bar，index.html 里一个字都没有
    // （1200 字符窗：修复轮 1 把 600 放宽——标题串曾占 487/600 = 81%）
    expect(appJs).toMatch(/back-bar[\s\S]{0,1200}?rail-surface-bar/);
    // ★ 方向翻过：逐字 HTML 里 class 在 data-rail-surface 之前（`class="rail-surface-btn
    //   rail-surface-btn--work" data-rail-surface="tree"`），按 brief 原方向
    //   （data-rail-surface 在前）永假；锁的是同一件事——这只钮上两个标记都在。
    expect(appJs).toMatch(/rail-surface-btn--work[\s\S]{0,80}?data-rail-surface="tree"/);
    for (const s of ["terminal", "review", "preview", "more"]) {
      expect(appJs).toMatch(new RegExp(`data-rail-surface="${s}"`));
    }
  });

  it("★ 每个 aria-controls 指向的槽 id 都真实存在（槽在 index.html，钮在 app.js）", () => {
    for (const id of ["workspace-file-tree", "right-rail-preview", "right-rail-review"]) {
      expect(html).toMatch(new RegExp(`id="${id}"`));             // 槽：index.html
      expect(appJs).toMatch(new RegExp(`aria-controls="${id}"`)); // 钮：app.js
    }
  });

  it("paintRightRail 落的是 data-surface（不是 data-panel）", () => {
    expect(html).toMatch(/rail\.dataset\.surface\s*=/);
    expect(html).not.toMatch(/rail\.dataset\.panel\s*=/);
  });

  it("★ 两个并排宽变量被拆干净（写方 + 声明，两个文件都要扫）", () => {
    // 修复轮 1 · F6：原锁只扫 index.html——审查者 M10 实锤把 styles.css :root 里的
    // 两行死声明加回去，全套测试仍然绿。现在两个文件都要扫。
    const stylesCss = readFileSync(join(__dirname, "..", "ui", "public", "styles.css"), "utf-8");
    for (const v of ["--rail-tree-w", "--rail-preview-w"]) {
      expect(html).not.toMatch(new RegExp(v));
      expect(stylesCss).not.toMatch(new RegExp(v));
    }
  });

  it("★ 3-C：宿主不再从 pref 上读旧名 panel（改名要连调用点一起改）", () => {
    // 两端都挡：前缀（xpref.panel）与后缀（pref.panelX）都不许漏
    expect(html).not.toMatch(/(?<![\w.$])pref0?\.panel(?![\w-])/);
    expect(html).toMatch(/(?<![\w.$])pref0?\.surface(?![\w-])/);
    // 写点一并锁：存储里只许再写新键
    expect(html).not.toMatch(/saveRailPref\(\{\s*panel\b/);
    expect(html).toMatch(/saveRailPref\(\{\s*surface\b/);
  });

  it("★ 3-D：`--center-min` 只在 docked 下写（浮层不占位，对话不让宽）", () => {
    const at = html.indexOf('"--center-min"');
    expect(at).toBeGreaterThan(-1);
    const near = html.slice(at, at + 160);   // ★ 锚在 token 上、往后看谓词
    expect(near).toMatch(/layout\s*===\s*"docked"/);
    expect(near).not.toMatch(/mode\s*===\s*"side"/);
  });

  it("★ 3-E：I4 的补救段整段删掉（split 不存在 ⇒ `=== \"split\"` 永假 = 死代码）", () => {
    expect(html).not.toMatch(/dataset\.layout\s*===\s*"split"/);
  });

  it("★ splitRatio 死键已删（任务 1 已删该入参，传 undefined 的死键）", () => {
    expect(html).not.toMatch(/(?<![\w.$])splitRatio(?![\w-])/);
  });

  it("★ 3-H：召出钮行在对话头部（app.js 的 .back-bar），不在右列里", () => {
    // （1200 字符窗：修复轮 1 把 600 放宽——标题串曾占 487/600 = 81%）
    expect(appJs).toMatch(/back-bar[\s\S]{0,1200}?rail-surface-bar/);
    // 列里不许有：列一关（40px 细条 / overlay 隐藏）它就没了，同键开关就不可能
    const rail = html.slice(html.indexOf('id="right-rail"'), html.indexOf('id="right-rail-handle"'));
    expect(rail).not.toMatch(/rail-surface-bar/);
  });

  it("★ 修复轮 2 · G1：钮行闭串的下一行就是 .back-bar 闭串（拼接邻接，无窗口）", () => {
    // ★ 锁「钮行闭串的下一行就是 .back-bar 的闭串」这个拼接邻接——
    //   不是"两 token 在 N 字符内共现"（那种写法挪出 back-bar 后仍绿，量的比以为的少）。
    //   无窗口 ⇒ 不会随钮行长高而假红。当前该邻接恰出现一次。
    const adj = /rail-surface-bar[\s\S]*?'\s*<\/div>'\s*\+\s*"<\/div>"\s*\+/;
    expect(appJs).toMatch(adj);
    const count = (appJs.match(new RegExp(adj.source, "g")) ?? []).length;
    expect(count).toBe(1);
  });

  it("★ 修复轮 1 · F2：Code 四只钮是图标（设计稿 §7），文字没丢——每只都有 aria-label", () => {
    for (const [icon, label] of [
      ["ph-terminal", "终端"],
      ["ph-squares-four", "改动"],
      ["ph-play", "预览"],
      ["ph-dots-three-vertical", "更多"],
    ]) {
      expect(appJs).toMatch(new RegExp(`ph ${icon}`));
      expect(appJs).toMatch(new RegExp(`aria-label="${label}"`));
    }
  });

  it("★ 修复轮 1 · F3：菜单的 Esc 是 stopImmediatePropagation（两层 Esc 同挂 document，普通 stopPropagation 拦不住同节点监听器）", () => {
    // 两个 Esc handler 都挂在 document 上（菜单那条在前、右列那条在后）。
    // jsdom 实测：stopPropagation 时两条都开火（两层一起关）；stopImmediatePropagation
    // 才只关菜单这一层。
    const at = html.indexOf('event.key !== "Escape"');
    expect(at).toBeGreaterThan(-1);
    const near = html.slice(at, at + 400);
    expect(near).toMatch(/event\.stopImmediatePropagation\(\)/);
  });

  it("★ 修复轮 1 · F4：Esc 的判据与遮罩同轴（都是 layout===\"floating\"）", () => {
    // 第一处 'event.key !== "Escape"' 是「更多」菜单的 Esc（F3 锁着），要数到第二处
    // 才是右列的 Esc——两个 handler 都是 document 级。
    const first = html.indexOf('event.key !== "Escape"');
    expect(first).toBeGreaterThan(-1);
    const at = html.indexOf('event.key !== "Escape"', first + 1);
    expect(at).toBeGreaterThan(first);
    const near = html.slice(at, at + 400);
    expect(near).toMatch(/dataset\.layout\s*!==\s*"floating"/);
    expect(near).not.toMatch(/dataset\.mode\s*!==\s*"overlay"/);
  });

  it("★ 修复轮 1 · F7：点面钮会先关「更多」菜单（菜单不悬在换了面的头上）", () => {
    const at = html.indexOf('event.target.closest?.("[data-rail-surface]")');
    expect(at).toBeGreaterThan(-1);
    const near = html.slice(at, at + 250);
    expect(near).toMatch(/closeRailMoreMenu\(\)/);
  });
});

/**
 * 计划 4 · T4：同键开/关（承重交互）+ showRailSurface 改名连调用点 +
 * paintRightRail 四条 data-* 写者锁（任务 3 定向复审 Minor 6：写者无锁 ⇒ 删掉照绿）。
 */
describe("计划 4 · T4：同键开/关 + showRailSurface 改名 + 写者锁", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

  it("★ 同键开/关：同面 ⇒ 收起，异面 ⇒ 换面（两件事必须分开）", () => {
    // 锚是 T3 落地时的委托原文（F7 锁同锚）；若它变了，先改成真锚再写断言
    const at = html.indexOf('event.target.closest?.("[data-rail-surface]")');
    expect(at, "找不到点面钮的那段委托").toBeGreaterThan(-1);
    const near = html.slice(at, at + 900);
    expect(near).toMatch(/railClose\(\)/);        // 同键 ⇒ 收起这条路在
    expect(near).toMatch(/showRailSurface\(/);    // 异键 ⇒ 换面这条路**也在**
    // 判据必须读「当前面」——不能是常量、也不能只看 collapsed
    expect(near).toMatch(/(?:now\.)?pref\.surface\s*===\s*surface|surface\s*===\s*(?:now\.)?pref\.surface/);
    // ★ 判据的极性必须钉死：! 与 && 都出现在断言里——审查 M-g 实锤：删掉 !
    //   （或 && 改 ||）⇒ 开着时点同键永不收起，而上面三条全绿（"灯不红"族
    //   的又一个面孔）。\(\s*! 邻接封掉 !! 双负号的同形漏网。
    expect(near).toMatch(
      /if\s*\(\s*!now\.vis\.collapsed\s*&&\s*(?:now\.pref\.surface\s*===\s*surface|surface\s*===\s*now\.pref\.surface)\s*\)/,
    );
  });

  it("★ 改名连调用点一起改（计划 3 那个按钮会 ReferenceError）", () => {
    expect(html).not.toMatch(/(?<![\w.$])showRailPanel(?![\w-])/);
    expect(html).toMatch(/showRailSurface\(\{\s*surface:/);
  });

  it("★ 四个 data-* 的写者都在，且写的是策略层的值（写者无锁 ⇒ 删掉照绿）", () => {
    // 与 CSS 侧读者成对：读者已被 ui-layout 锁着，写者这一半以前没人守。
    expect(html).toMatch(/rail\.dataset\.mode\s*=\s*p\.mode/);
    expect(html).toMatch(/rail\.dataset\.layout\s*=\s*p\.layout/);
    expect(html).toMatch(/rail\.dataset\.surface\s*=\s*pref\.surface/);
    expect(html).toMatch(/rail\.dataset\.collapsed\s*=\s*String\(p\.collapsed\)/);
  });
});

/**
 * 过渡垫摘除（计划 4 · T3）：策略层不再发旧名、CSS 不再认旧属性。
 * 3-B（返回值不带 panel）与 3-C（宿主不读 panel）是一对；3-B′（裁决翻回
 * surface ?? panel，旧键迁移仍在）与 3-G（CSS 摘 [data-panel] 半）各守一头。
 */
describe("过渡垫摘除（计划 4 · T3）：策略层不再发旧名、CSS 不再认旧属性", () => {
  const css = readFileSync(join(__dirname, "..", "ui", "public", "styles.css"), "utf-8");

  it("★ 3-B：normalizeRailPref 的返回值不再带旧名 panel", () => {
    const out = normalizeRailPref({ surface: "preview" });
    expect(out.surface).toBe("preview");
    expect(Object.prototype.hasOwnProperty.call(out, "panel")).toBe(false);
  });

  it("★ 3-B′：裁决已翻回——两键并存时 surface 胜（过渡期的 panel 优先已摘）", () => {
    expect(normalizeRailPref({ surface: "preview", panel: "review" }).surface).toBe("preview");
  });

  it("★ 3-B′：旧键迁移仍在——存储里只有 panel 时照样读得到", () => {
    expect(normalizeRailPref({ panel: "review" }).surface).toBe("review");
  });

  it("★ 3-G：槽显隐不再认旧属性 data-panel（styles.css）", () => {
    expect(css).not.toMatch(/\[data-panel="(tree|preview|review)"\]/);
  });
});

/**
 * 窄档浮层让出对话头部（计划 4 · T5 修复轮）：宿主那半的写者锁。
 *
 * CSS 侧的四条锁在 ui-layout.test.ts（浮层 top 读变量 / 头部 sticky /
 * 层级比遮罩与浮层高 / 变量有默认）。这里守**写者**——只锁 CSS 那半，
 * 变量没人写就恒 0px，浮层照样盖住键，而灯全绿（"两半只锁一半"本族）。
 */
describe("计划 4 · T5 修复轮：`--rail-float-top` 的写者（index.html 的 paintRightRail）", () => {
  const html = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");

  it("★ 写了 `--rail-float-top`，且值来自**实测**的头部下沿（写成常量就是死的）", () => {
    // ★ 方向取自现读的仓库：**测量在前、写点在后**（`const floatTop = …` 之后才是
    //   setProperty）。锚在测量那一行、往后看写点与谓词——方向写反的断言永假
    //   （3-D 踩过：仓库里 token 在谓词之前，那条断言永远绿不了）。
    // ★ 变异靶：① 把值换成常量（如 `= 46`）⇒ `getBoundingClientRect` 没了 ⇒ 红；
    //   ② 谓词改回 `"docked"` ⇒ 红；③ 删掉 setProperty ⇒ 红。
    const at = html.indexOf("const floatTop =");
    expect(at, "找不到浮层让位的那段测量").toBeGreaterThan(-1);
    const near = html.slice(at, at + 420);
    expect(near).toMatch(/getBoundingClientRect/);      // 实测，不是抄一个高度
    expect(near).toMatch(/bottom/);                     // 取的是头部条的下沿
    expect(near).toMatch(/layout\s*===\s*"floating"/);  // 只有浮层才让位（占宽列不重叠）
    expect(near).toMatch(/"--rail-float-top"/);         // 写点确实落在同一个窗口里
    // ★ 相对 `#center-row` 量：浮层的包含块是它，视口坐标里它未必从 y=0 起
    expect(near).toMatch(/center-row/);
  });
});
