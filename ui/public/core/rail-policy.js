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
/** 允许并排两列的最小视口宽（产品判断，不是预算） */
export const SPLIT_MIN_PX = 1440;

export const RAIL_MIN_FRACTION = 0.18;
export const RAIL_MAX_FRACTION = 0.45;
export const RAIL_DEFAULT_FRACTION = 0.25;
export const RAIL_DEFAULT_SPLIT_RATIO = 0.5;

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

/** 右列的两个面板。互斥（tabbed）或并排（split）。 */
export const RAIL_PANELS = /** @type {const} */ (["tree", "preview"]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** 比例钳制。非法输入回默认——存储只是偏好，不是状态。 */
export function clampRailFraction(fraction) {
  return clamp(num(fraction, RAIL_DEFAULT_FRACTION), RAIL_MIN_FRACTION, RAIL_MAX_FRACTION);
}

/**
 * 右列空间仲裁。**唯一**决定「右列多宽、对话多宽、哪个面板在、是不是覆盖」的地方。
 *
 * @param {{
 *   viewportWidth: number,
 *   sidebarWidth?: number,
 *   preferredFraction?: number,
 *   splitRatio?: number,
 *   panel?: "tree"|"preview",
 *   collapsed?: boolean,
 * }} input
 * @returns {{
 *   mode: "side"|"overlay",
 *   layout: "split"|"tabbed",
 *   railWidth: number,
 *   centerWidth: number,
 *   tree: number,
 *   preview: number,
 *   collapsed: boolean,
 * }} tree / preview 是各自实际占的像素，0 = 该面板不显示。
 */
export function railPolicy(input = {}) {
  const viewportWidth = Math.max(0, num(input.viewportWidth, 0));
  const sidebarWidth = Math.max(0, num(input.sidebarWidth, 0));
  const available = Math.max(0, viewportWidth - sidebarWidth);
  const collapsed = Boolean(input.collapsed);
  const panel = RAIL_PANELS.includes(input.panel) ? input.panel : "tree";
  const splitRatio = clamp(num(input.splitRatio, RAIL_DEFAULT_SPLIT_RATIO), 0, 1);

  const fraction = clampRailFraction(input.preferredFraction);
  const railCap = clamp(Math.round(available * fraction), RAIL_MIN_PX, RAIL_MAX_PX);
  const railBudget = available - CENTER_MIN_PX;

  // ---- 窄档：预算关不上，右列不占位 ----
  // 先定档、再在档内解释 collapsed —— 两档里它不是一个意思：
  //   窄档 = 抽屉关着（不占位）；宽中档 = 收成细条。
  if (railBudget < RAIL_MIN_PX) {
    const closed = collapsed;
    return {
      mode: "overlay",
      layout: "tabbed",
      railWidth: closed ? 0 : railCap,
      centerWidth: available,
      tree: closed ? 0 : panel === "tree" ? railCap : 0,
      preview: closed ? 0 : panel === "preview" ? railCap : 0,
      collapsed: closed,
    };
  }

  // ---- 宽/中档：右列占位 ----
  if (collapsed) {
    return {
      mode: "side",
      layout: "tabbed",
      railWidth: RAIL_COLLAPSED_PX,
      centerWidth: Math.max(0, available - RAIL_COLLAPSED_PX),
      tree: 0,
      preview: 0,
      collapsed: true,
    };
  }

  const railWidth = Math.min(railCap, railBudget);
  const layout = viewportWidth >= SPLIT_MIN_PX ? "split" : "tabbed";
  let tree = 0;
  let preview = 0;
  if (layout === "split") {
    tree = Math.round(railWidth * splitRatio);
    preview = railWidth - tree;
  } else if (panel === "tree") {
    tree = railWidth;
  } else {
    preview = railWidth;
  }
  return {
    mode: "side",
    layout,
    railWidth,
    centerWidth: Math.max(0, available - railWidth),
    tree,
    preview,
    collapsed: false,
  };
}

/** @returns {{collapsed:boolean, layout:"split"|"tabbed", fraction:number, splitRatio:number, panel:"tree"|"preview"}|null} */
export function normalizeRailPref(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const panel = RAIL_PANELS.includes(obj.panel) ? obj.panel : "tree";
  return {
    collapsed: Boolean(obj.collapsed),
    layout: obj.layout === "split" ? "split" : "tabbed",
    fraction: clampRailFraction(obj.fraction ?? obj.width),
    splitRatio: clamp(num(obj.splitRatio, RAIL_DEFAULT_SPLIT_RATIO), 0, 1),
    panel,
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
    layout: "tabbed",
    fraction: RAIL_DEFAULT_FRACTION,
    splitRatio: RAIL_DEFAULT_SPLIT_RATIO,
    panel: "tree",
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
    storage?.setItem?.(RAIL_PREF_KEY, JSON.stringify(normalizeRailPref(pref) ?? pref));
  } catch { /* 存储只是偏好，写不进去不该炸 */ }
}
