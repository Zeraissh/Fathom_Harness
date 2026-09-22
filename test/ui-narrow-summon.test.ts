// @ts-nocheck
/**
 * T15 窄屏召出钮位置重组。
 *
 * 现场（`eval/persona-ux/_verify-shots/ui-review-20260922/10-chat-code-900-floating.png`）：
 * 900px 下 `.back-bar` 一行里挤着「标题 + 四只召出钮 + 聚焦/完整」，标题被挤到
 * 截断并与钮重叠，阅读模式开关被压成两行。
 *
 * 判据怎么来的（jsdom 测不到的维度，见工程约束）：
 *   jsdom 不做样式级联、也不真的跑媒体查询，`getComputedStyle` 在这里问不出
 *   任何东西；强制元素宽度更不会触发媒体查询。所以这里**从 styles.css 解析规则，
 *   按给定视口宽度做一次小型级联**（只覆盖本项关心的那几条声明），再对
 *   窄/宽两档分别断言。
 *
 * 守得住 / 守不住（诚实边界）：
 *   守得住：给定视口宽度下这几条声明谁赢；窄档确实产生"钮行自成一行且排在
 *           标题行之后"的 flex 布局前提；宽档这些声明一条都不生效（回归不变）。
 *   守不住：真实浏览器里的最终像素——行高、是否恰好不再重叠、钮与浮层的实际
 *           位置关系。那要真实视口截图；本轮没起宿主（台账里记了原因）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, "..", "ui", "public", "styles.css"), "utf-8");
const appJs = readFileSync(join(__dirname, "..", "ui", "public", "app.js"), "utf-8");

/** 注释换等长空白：不干扰花括号配平，索引不错位 */
const blank = css.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));

/**
 * 解析成 { media, selector, body } 三元组。
 * 只认两层：顶层规则，以及 @media 里的规则（本表没有更深的嵌套）。
 */
function parseRules() {
  const rules: { media: string | null; selectors: string[]; body: string }[] = [];
  let i = 0;
  while (i < blank.length) {
    const open = blank.indexOf("{", i);
    if (open < 0) break;
    const prelude = blank.slice(i, open).replace(/^[\s;}]+/, "").trim();
    // 找到配平的闭括号
    let depth = 1;
    let j = open + 1;
    while (j < blank.length && depth > 0) {
      if (blank[j] === "{") depth++;
      else if (blank[j] === "}") depth--;
      j++;
    }
    const inner = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@media")) {
      // 递归一层：把内层规则挂上这条 media 条件
      const innerBlank = blank.slice(open + 1, j - 1);
      let k = 0;
      while (k < innerBlank.length) {
        const o = innerBlank.indexOf("{", k);
        if (o < 0) break;
        const sel = innerBlank.slice(k, o).replace(/^[\s;}]+/, "").trim();
        const c = innerBlank.indexOf("}", o);
        if (c < 0) break;
        if (sel && !sel.startsWith("@")) {
          rules.push({ media: prelude, selectors: splitSelectors(sel), body: inner.slice(o + 1, c) });
        }
        k = c + 1;
      }
    } else if (prelude && !prelude.startsWith("@")) {
      rules.push({ media: null, selectors: splitSelectors(prelude), body: inner });
    }
    i = j;
  }
  return rules;
}

function splitSelectors(text: string) {
  return text.split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** 只解析本项用得到的 `(max-width: Npx)` / `(min-width: Npx)` 形态 */
function mediaMatches(media: string | null, width: number) {
  if (!media) return true;
  for (const m of media.matchAll(/\(\s*(max|min)-width:\s*(\d+)px\s*\)/g)) {
    const n = Number(m[2]);
    if (m[1] === "max" && !(width <= n)) return false;
    if (m[1] === "min" && !(width >= n)) return false;
  }
  return true;
}

function declOf(body: string, prop: string) {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`, "i");
  return body.match(re)?.[1]?.trim() ?? null;
}

const RULES = parseRules();

/**
 * 给定视口宽度下，某个选择器上某条声明的最终值。
 * 同一选择器字面量的规则按源序后来居上（本表里这几条选择器的特指度相同，
 * 所以源序就是胜负——媒体查询块写在基线规则之后）。
 */
function resolveDecl(selector: string, prop: string, width: number) {
  let winner: string | null = null;
  for (const rule of RULES) {
    if (!rule.selectors.includes(selector)) continue;
    if (!mediaMatches(rule.media, width)) continue;
    const v = declOf(rule.body, prop);
    if (v !== null) winner = v;
  }
  return winner;
}

const NARROW = [360, 700, 900, 1024];
const WIDE = [1025, 1280, 1440, 1920];

describe("T15 窄屏召出钮自成一行", () => {
  it("解析器真的抓到了这几条规则（别让选择器改名把门禁变成空跑）", () => {
    for (const sel of [".back-bar", ".rail-surface-bar", ".back-bar > .rm-switch"]) {
      expect(
        RULES.some((r) => r.selectors.includes(sel)),
        `styles.css 里找不到选择器 ${sel}`,
      ).toBe(true);
    }
    expect(RULES.some((r) => r.media && /max-width:\s*1024px/.test(r.media))).toBe(true);
  });

  it.each(NARROW)("%dpx：钮行占满一行、不再靠 margin-left:auto 挤在标题右边", (w) => {
    expect(resolveDecl(".rail-surface-bar", "flex-basis", w)).toBe("100%");
    expect(resolveDecl(".rail-surface-bar", "margin-left", w)).toBe("0");
    expect(resolveDecl(".rail-surface-bar", "justify-content", w)).toBe("flex-end");
    // 与上一行之间有分隔线（计划里「加分隔符」那一半）
    expect(resolveDecl(".rail-surface-bar", "border-top", w)).toMatch(/1px solid var\(--border-1\)/);
    // 父容器允许换行，否则 flex-basis:100% 只会把这行挤扁
    expect(resolveDecl(".back-bar", "flex-wrap", w)).toBe("wrap");
  });

  it.each(NARROW)("%dpx：排序保证「标题 + 阅读模式」在上、召出钮在下", (w) => {
    const raw = {
      title: resolveDecl(".back-bar > .chat-head", "order", w),
      rm: resolveDecl(".back-bar > .rm-switch", "order", w),
      bar: resolveDecl(".rail-surface-bar", "order", w),
    };
    // 缺声明会被 Number(null) 悄悄读成 0——先逐条确认它真的写了，再比大小
    for (const [name, v] of Object.entries(raw)) {
      expect(v, `${w}px 下 ${name} 没有 order 声明`).not.toBeNull();
    }
    const title = Number(raw.title);
    const rm = Number(raw.rm);
    const bar = Number(raw.bar);
    // 阅读模式开关是 DOM 里最后 append 的，不排序就会被挤到第三行
    expect(rm).toBeGreaterThan(title);
    expect(bar).toBeGreaterThan(rm);
  });

  it.each(WIDE)("%dpx：宽屏一条都不生效（plan 4 的头部行为回归不变）", (w) => {
    expect(resolveDecl(".rail-surface-bar", "flex-basis", w)).toBeNull();
    expect(resolveDecl(".rail-surface-bar", "order", w)).toBeNull();
    expect(resolveDecl(".rail-surface-bar", "border-top", w)).toBeNull();
    expect(resolveDecl(".back-bar", "flex-wrap", w)).toBeNull();
    // 宽屏仍旧靠 margin-left:auto 推到标题行右端（plan 4 的原样）
    expect(resolveDecl(".rail-surface-bar", "margin-left", w)).toBe("auto");
  });

  it("窄屏没有动到「哪些钮出现」——两脸差异仍然只由 body[data-face] 决定", () => {
    for (const rule of RULES) {
      if (!rule.media) continue;
      for (const sel of rule.selectors) {
        if (!/rail-surface-btn/.test(sel)) continue;
        expect(
          declOf(rule.body, "display"),
          `媒体查询里改了召出钮的 display（${sel}）——两脸成对只能由 body[data-face] 管`,
        ).toBeNull();
      }
    }
  });

  it("同键开/关与钮行的归属没被动过（plan 4 骨架不回退）", () => {
    const indexHtml = readFileSync(join(__dirname, "..", "ui", "public", "index.html"), "utf-8");
    // 同键开/关：再点当前这只就收起
    expect(indexHtml).toMatch(/!now\.vis\.collapsed\s*&&\s*now\.pref\.surface\s*===\s*surface/);
    expect(indexHtml).toMatch(/railClose\(\)/);
    // 钮行仍拼在 .back-bar 里（本项是纯 CSS 换行，没搬 DOM）
    expect(appJs).toMatch(/back-bar[\s\S]{0,1200}?rail-surface-bar/);
    // 「更多」菜单仍向下弹：钮行还在头部，没有翻转的必要
    const menu = RULES.filter((r) => r.selectors.includes(".rail-more-menu"));
    expect(menu.length).toBeGreaterThan(0);
    for (const r of menu) {
      expect(declOf(r.body, "bottom"), "菜单被改成向上弹了，但钮行还在头部").toBeNull();
    }
  });
});
