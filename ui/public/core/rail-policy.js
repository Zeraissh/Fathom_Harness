/**
 * 右列空间契约（P1）。
 *
 * 背景：此前中栏有三个互不知情的抢占者——对话列（`flex:1 1 22rem`）、文件树
 * （`clamp(200px,22vw,280px)`，styles.css 里**一条 @media 都没有**）、预览坞
 * （38% 兜底、可拖、自身断点 900）。谁都在抢，谁都不负责「对话至少得多宽」。
 *
 * 这里把三份契约收成一份：右列只有一个 owner，宽度/折叠/面板选择只有一份记忆，
 * 「谁让位」由一个纯函数按预算算出来，**不写死断点**。
 *
 * 为什么边界是算出来的而不是硬编码 900：按 左栏 280 + 对话下限 416 + 右列下限 240
 * 算，真实边界是 **936**。900 是当初 preview-dock 单独写的数，没有预算依据——
 * 声明它会是一个假断点。见 docs/superpowers/specs/2026-09-18-ui-center-contract-design.md §4.1.3。
 *
 * 宽度偏好存**比例**不存像素（沿用 preview-dock 的既有约定：
 * `agent-ui-preview-dock-width` 存的就是比例）。理由：像素偏好在窗口缩放后失准，
 * 而比例不用在读取时依赖一次测量。
 */

/** 对话列的不可侵犯下限（26rem @16px） */
export const CENTER_MIN_PX = 416;
/** 右列下限 */
export const RAIL_MIN_PX = 240;
/** 右列上限 */
export const RAIL_MAX_PX = 360;
/** 收起时右列留下的细条 */
export const RAIL_COLLAPSED_PX = 40;

/** 右列的两个形态。docked = 占宽的真列；floating = 浮在对话上的浮层。 */
export const RAIL_LAYOUTS = /** @type {const} */ (["docked", "floating"]);

/**
 * 占宽列模式的最小预算。
 * 判据：`docked` 要从对话那里拿宽，而对话有硬地板 CENTER_MIN_PX(416)——
 * 所以只有预算装得下 [对话地板 + 右列下限] 时才给 docked，否则 floating。
 * **这正是旧 `SPLIT_MIN_PX` 那个数想做而没做对的事**：旧的按"视口宽度"判，
 * 而真正该判的是"预算够不够"。
 */
export const DOCK_MIN_BUDGET_PX = CENTER_MIN_PX + RAIL_MIN_PX;

/** 浮层宽占可用宽的比例（只在 floating 用；它不占位，所以与 RAIL_MAX_FRACTION 无关）。 */
export const FLOATING_WIDTH_RATIO = 0.6;

export const RAIL_MIN_FRACTION = 0.18;
export const RAIL_MAX_FRACTION = 0.45;
export const RAIL_DEFAULT_FRACTION = 0.25;

/**
 * 左栏让位边界（2026-09-18 回走 §2.3，活页校正后）：
 * **与 railPolicy 的 side↔overlay 边界是同一份预算**——左栏实测宽 + 对话地板 + 右列下限。
 * 视口低于它时右列已退覆盖档，左栏（还有对话在开时）也该默认收起，
 * 否则对话只剩「视口 − 左栏」，越窄越不像对话。
 *
 * 活页校正：≤700px 是既有的堆叠布局（左栏成顶部横条、对话全宽在下），
 * 那段不需要本规则兜底；真正吃到它的是 701px 到边界之间的窗口。
 */
export function sidebarYieldBoundary(sidebarWidth) {
  return Math.max(0, num(sidebarWidth, 0)) + CENTER_MIN_PX + RAIL_MIN_PX;
}

/**
 * 窄窗左栏要不要让位。
 * - **有会话在开才算**：只看列表（欢迎态）时左栏就是内容本身，把它收了等于给用户一张白纸。
 * - 收起不是锁死：用户按 Ctrl+B / 浮出按钮展开仍然有效（本次会话内），
 *   窗口回到边界之上时由宿主恢复其持久偏好。
 *
 * @param {{ viewportWidth?: number, sidebarWidth?: number, hasOpenConversation?: boolean }} [input]
 */
export function shouldYieldSidebar(input = {}) {
  if (input.hasOpenConversation !== true) return false;
  const sidebarWidth = Math.max(0, num(input.sidebarWidth, 0));
  if (sidebarWidth <= 0) return false; // 已经收着/量不到：无处可让
  return Math.max(0, num(input.viewportWidth, 0)) < sidebarYieldBoundary(sidebarWidth);
}

/** 新记忆键。取代 filesRailCollapsed + dock 宽度两个键。 */
export const RAIL_PREF_KEY = "agent.ui.pref.rightRail";
/** 旧键：只读不写，降级回滚时不丢用户偏好 */
export const LEGACY_RAIL_COLLAPSED_KEY = "agent.ui.pref.filesRailCollapsed";
export const LEGACY_DOCK_FRACTION_KEY = "agent-ui-preview-dock-width";

/** 右列能召出的面。一次一只（计划 4）。 */
export const RAIL_SURFACES = /** @type {const} */ (["tree", "preview", "review"]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** 比例钳制。非法输入回默认——存储只是偏好，不是状态。 */
export function clampRailFraction(fraction) {
  return clamp(num(fraction, RAIL_DEFAULT_FRACTION), RAIL_MIN_FRACTION, RAIL_MAX_FRACTION);
}

/**
 * 右列空间仲裁。**唯一**决定「右列多宽、对话多宽、哪只面在、是不是覆盖」的地方。
 *
 * @param {{
 *   viewportWidth: number,
 *   sidebarWidth?: number,
 *   preferredFraction?: number,
 *   surface?: "tree"|"preview"|"review",
 *   collapsed?: boolean,
 *   hasPreviewContent?: boolean,
 * }} input
 *   `surface` —— 计划 4 改名：旧的 `panel` 键只读不写。`input.surface ?? input.panel`
 *   的旧键回退是按 3-B′ 故意保留的（旧存储里只有 panel 时照样读得到，测试锁着）；
 *   返回值里只有 `surface`。
 *   `hasPreviewContent` —— 计划 4 起**不再看**（split 没了，没有"预览列给不给"的问题）。
 *   参数 index.html 仍照传（现在是 dead input），摘掉归任务 4。
 * @returns {{
 *   mode: "side"|"overlay",
 *   layout: "docked"|"floating",
 *   railWidth: number,
 *   centerWidth: number,
 *   surface: "tree"|"preview"|"review",
 *   collapsed: boolean,
 * }} layout="floating" 时 railWidth 是**浮层宽**（对话宽度不受影响）；
 *   layout="docked" 时 railWidth 是从对话那里拿的宽（centerWidth = available − railWidth）。
 */
export function railPolicy(input = {}) {
  const viewportWidth = Math.max(0, num(input.viewportWidth, 0));
  const sidebarWidth = Math.max(0, num(input.sidebarWidth, 0));
  const available = Math.max(0, viewportWidth - sidebarWidth);
  const collapsed = Boolean(input.collapsed);
  // 计划 4 改名：旧的 `panel` 键只读不写——`surface ?? panel` 是 3-B′ 的迁移回退
  // （旧存储里只有 panel 时照样读得到），不是临时过渡，测试锁着。
  const surface = RAIL_SURFACES.includes(input.surface ?? input.panel)
    ? (input.surface ?? input.panel)
    : "tree";

  const fraction = clampRailFraction(input.preferredFraction);
  const railCap = clamp(Math.round(available * fraction), RAIL_MIN_PX, RAIL_MAX_PX);
  const railBudget = available - CENTER_MIN_PX;

  // ---- 窄档：预算关不上，右列不占位 ----
  // 先定档、再在档内解释 collapsed —— 两档里它不是一个意思：
  //   窄档 = 抽屉关着（不占位）；宽中档 = 收成细条。
  // 二轮走查（2026-09-18 夜）：抽屉打开时是**全宽 sheet**（240px 浮层在 390 屏上
  // 盖住 61% 且读不了代码），中心列照旧不缩——层级交给遮罩与关闭路径表达。
  if (railBudget < RAIL_MIN_PX) {
    const closed = collapsed;
    return {
      mode: "overlay",
      layout: "floating",
      railWidth: closed ? 0 : available,
      centerWidth: available,
      surface,
      collapsed: closed,
    };
  }

  // ---- 宽/中档：右列占位 ----
  if (collapsed) {
    return {
      mode: "side",
      layout: "docked",
      railWidth: RAIL_COLLAPSED_PX,
      centerWidth: Math.max(0, available - RAIL_COLLAPSED_PX),
      surface,
      collapsed: true,
    };
  }

  const railWidth = Math.min(railCap, railBudget);
  /**
   * 两形态的判据是**预算**，不是视口宽度。
   * `docked` 从对话那里拿宽 ⇒ 必须装得下 [对话地板 + 右列下限]；
   * 装不下就是 `floating`（浮在对话上，**对话宽度一个像素都不动**）。
   */
  const canDock = railBudget >= DOCK_MIN_BUDGET_PX;
  if (!canDock) {
    return {
      mode: "side",
      layout: "floating",
      // 浮层宽不占位：给它一个读得懂的宽，但 centerWidth **照旧是全部可用宽**
      railWidth: Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, Math.round(available * FLOATING_WIDTH_RATIO))),
      centerWidth: available,
      surface,
      collapsed: false,
    };
  }
  return {
    mode: "side",
    layout: "docked",
    railWidth,
    centerWidth: Math.max(0, available - railWidth),
    surface,
    collapsed: false,
  };
}

/**
 * 内容驱动可见性（二轮走查 2026-09-18 夜，委托方拍板）：
 * 右列是**内容的家**，不是常驻家具。返回显示层的收起态与把手角标——
 * 与"用户偏好"（pref.collapsed）是两件事：前者是判据，后者是意图。
 *
 * 规则：
 *   ① 本次会话手动打开过（userOpenNow）→ 尊重，一律让位；
 *   ② 欢迎页 → 收起（有文件也不自动开；细条/把手仍在，手动可开）；
 *   ③ 对话里没内容 → 收起；
 *   ④ 窄档（overlay）→ 永不自动展开，角标提示；点开是全宽 sheet；
 *   ⑤ 宽档手动收起过 → 收 + 角标（dismiss 粘住，新产物不抢屏）。
 *
 * @param {{
 *   context?: "welcome"|"conversation",
 *   hasContent?: boolean,
 *   mode?: "side"|"overlay",
 *   userCollapsed?: boolean,
 *   userOpenNow?: boolean,
 * }} input
 * @returns {{collapsed:boolean, badge:boolean}}
 */
export function railVisibility(input = {}) {
  const context = input.context === "welcome" ? "welcome" : "conversation";
  const mode = input.mode === "side" ? "side" : "overlay";
  const hasContent = input.hasContent === true;
  const userCollapsed = Boolean(input.userCollapsed);
  if (input.userOpenNow === true) return { collapsed: false, badge: false };
  if (context === "welcome") return { collapsed: true, badge: false };
  if (!hasContent) return { collapsed: true, badge: false };
  if (mode === "overlay") return { collapsed: true, badge: true };
  if (userCollapsed) return { collapsed: true, badge: true };
  return { collapsed: false, badge: false };
}

/**
 * @returns {{collapsed:boolean, layout:"docked"|"floating", fraction:number, surface:"tree"|"preview"|"review"}|null}
 *   计划 4 改名：返回里的 `surface` 取代旧 `panel`，`layout` 只有两形态，`splitRatio` 删除。
 *   存储里的旧 `panel` 只读不写（读进 surface；输出不再写回 panel）。
 *   任务 3 摘掉了修复轮 1 的过渡垫：返回值不再带 `panel` 同值别名。
 */
export function normalizeRailPref(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  // 计划 4 改名：旧的 `panel` 只读不写（存过的偏好不丢）。
  // 任务 3（3-B′）：过渡期的 panel 优先已随宿主五处读点一起摘掉——
  // 新键 surface 优先，旧键 panel 仍作回退读得到（只有旧键的存储偏好不丢）。
  const surface = RAIL_SURFACES.includes(obj.surface ?? obj.panel)
    ? (obj.surface ?? obj.panel)
    : "tree";
  return {
    collapsed: Boolean(obj.collapsed),
    layout: RAIL_LAYOUTS.includes(obj.layout) ? obj.layout : "docked",
    fraction: clampRailFraction(obj.fraction ?? obj.width),
    surface,
  };
}

/**
 * 读右列偏好。顺序：新键 → 两个旧键（迁移）→ 默认。
 * 旧键不删：降级回滚时不丢用户偏好，只是不再写。
 * @param {Storage|null|undefined} storage
 */
export function readRailPref(storage) {
  const fallback = {
    collapsed: false,
    layout: "docked",
    fraction: RAIL_DEFAULT_FRACTION,
    surface: "tree",
  };
  try {
    const fresh = normalizeRailPref(storage?.getItem?.(RAIL_PREF_KEY));
    if (fresh) return fresh;
    const legacyCollapsed = storage?.getItem?.(LEGACY_RAIL_COLLAPSED_KEY) === "1";
    const legacyFractionRaw = storage?.getItem?.(LEGACY_DOCK_FRACTION_KEY);
    const migrated = {
      ...fallback,
      collapsed: legacyCollapsed,
      fraction: legacyFractionRaw == null ? fallback.fraction : clampRailFraction(Number.parseFloat(legacyFractionRaw)),
    };
    return migrated;
  } catch {
    return fallback;
  }
}

/** @param {Storage|null|undefined} storage */
export function writeRailPref(storage, pref) {
  try {
    const normalized = normalizeRailPref(pref) ?? pref;
    // 旧键只读不写：调用方仍可能直传旧名 panel（迁移/回退写法），落盘前剥掉。
    if (normalized && typeof normalized === "object" && "panel" in normalized) {
      const { panel, ...persisted } = normalized;
      storage?.setItem?.(RAIL_PREF_KEY, JSON.stringify(persisted));
      return;
    }
    storage?.setItem?.(RAIL_PREF_KEY, JSON.stringify(normalized));
  } catch { /* 存储只是偏好，写不进去不该炸 */ }
}
