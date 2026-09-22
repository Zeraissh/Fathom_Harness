// @vitest-environment jsdom
// @ts-nocheck
/**
 * T13 覆盖层主题一致性门禁。
 *
 * 起因是审视报告的问题 3：「深色主题下命令面板是白底」（证据
 * `eval/persona-ux/_verify-shots/ui-review-20260922/13-chat-code-dark-1440.png`）。
 * 复核那张截图时发现**整页都是浅色**、面板里勾着的是「主题：跟随系统」——
 * 那一刻宿主根本不在暗色主题下，所以"白底"是主题没切换，不是覆盖层漏继承
 * （对照 `18-audit-office-face-dark-1440.png`：真的切到暗色时整页含覆盖层都是暗的）。
 * 既然原始判据站不住，这里就把"它不会发生"钉成常驻门禁，而不是修一个不存在的 bug。
 *
 * 为什么不用 jsdom 的 getComputedStyle 量真实底色：
 *   jsdom 不做样式级联、也不解析 var() 链，`getComputedStyle(dialog).backgroundColor`
 *   在这里恒为空串——拿它断言等于白测。改成**从 styles.css 解析令牌链、按 WCAG
 *   公式实算相对亮度**（仓库既有先例：test/ui-app.test.ts 的 AC5 对比度门禁）。
 *
 * 这套断言守得住什么 / 守不住什么（诚实边界）：
 *   守得住：① 覆盖层的底色令牌在四主题下各自解析到什么颜色（暗色主题必须落暗色域）；
 *           ② 高 z-index 容器的 background 一律走令牌，没人写死字面色；
 *           ③ 覆盖层根节点确实挂在 data-theme 的作用域里（行为锁，真 DOM）。
 *   守不住：真实浏览器的样式级联与层叠上下文。譬如某条作者样式用更高优先级把
 *           background 盖掉、或 backdrop-filter 在某浏览器下的实际观感——
 *           那些只有真机截图能证（见台账里"视觉截图未做"的记账）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initCommandPalette } from "../ui/public/features/command-palette.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(__dirname, "..", "ui", "public", "styles.css");
const css = readFileSync(CSS_PATH, "utf-8");

// ---------------------------------------------------------------
// CSS 解析（与 test/ui-app.test.ts 的 AC5 门禁同一套手法）
// ---------------------------------------------------------------

/** 把注释换成等长空白：既不干扰花括号配平，又保住字符索引 */
function blankComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
}

/** 括号配平抓出所有 :root 主题块（顶层的与 @media 里的都要） */
function extractThemeBlocks(text: string) {
  const blank = blankComments(text);
  const blocks: { selector: string; body: string }[] = [];
  const selRe = /(?:^|[{};])\s*([^{};@]*?:root[^{};]*?)\{/g;
  let m: RegExpExecArray | null;
  while ((m = selRe.exec(blank)) !== null) {
    let depth = 1;
    let i = selRe.lastIndex;
    while (i < blank.length && depth > 0) {
      if (blank[i] === "{") depth++;
      else if (blank[i] === "}") depth--;
      i++;
    }
    blocks.push({ selector: m[1].trim(), body: text.slice(selRe.lastIndex, i - 1) });
  }
  return blocks;
}

function parseDecls(body: string) {
  const vars: Record<string, string> = {};
  const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(body)) !== null) vars[m[1].trim()] = m[2].trim();
  return vars;
}

/** 暖纸 = 顶层 :root；其余 = 顶层 ⊕ [data-theme] 覆盖（语义层靠 var() 自动跟随） */
function parseThemes(text: string) {
  const blocks = extractThemeBlocks(text);
  const base = blocks.find((b) => b.selector === ":root");
  if (!base) throw new Error("styles.css 缺少顶层 :root 块");
  const light = parseDecls(base.body);
  const themes: Record<string, Record<string, string>> = { light };
  for (const theme of ["dark", "graphite", "contrast"]) {
    const block = blocks.find((b) => b.selector.includes(`[data-theme="${theme}"]`));
    if (!block) throw new Error(`styles.css 缺少 [data-theme="${theme}"] 块`);
    themes[theme] = { ...light, ...parseDecls(block.body) };
  }
  return themes;
}

function resolveColor(value: string | undefined, vars: Record<string, string>, depth = 0): string {
  const v = String(value ?? "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (ref && depth < 8) {
    const name = ref[1].replace(/^--/, "");
    if (vars[name] !== undefined) return resolveColor(vars[name], vars, depth + 1);
  }
  return v;
}

function hexToRgb(hex: string) {
  const v = parseInt(hex.replace(/^#/, ""), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
function linearize(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}
function contrastRatio(a: string, b: string) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * 抓出所有 `选择器 { 声明 }` 规则（含 @media 内层）。
 * 只要一层配平即可：本表里没有更深的嵌套规则。
 */
function extractRules(text: string) {
  const blank = blankComments(text);
  const rules: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blank)) !== null) {
    const selector = m[1].split(/[{}]/).pop()!.trim();
    if (!selector || selector.startsWith("@")) continue;
    rules.push({ selector, body: text.slice(m.index + m[1].length + 1, re.lastIndex - 1) });
  }
  return rules;
}

function declOf(body: string, prop: string) {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`, "i");
  return body.match(re)?.[1]?.trim() ?? null;
}

/** 不透明的字面色：写死它就等于把某一套主题钉死在覆盖层上 */
function isOpaqueLiteralColor(value: string) {
  const v = value.trim().toLowerCase();
  if (/#[0-9a-f]{3,8}\b/.test(v)) return true;
  if (/\b(white|black|silver|gray|grey|ivory|snow)\b/.test(v)) return true;
  if (/\brgb\(/.test(v)) return true;
  // rgba(...) 的 alpha 为 1 时与 rgb 等价；半透明（阴影/遮罩）不在此列
  const rgba = v.match(/\brgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  if (rgba && Number(rgba[1]) >= 1) return true;
  return false;
}

const THEMES = ["light", "dark", "graphite", "contrast"] as const;
const DARK_THEMES = ["dark", "graphite", "contrast"] as const;
const themes = parseThemes(css);

// ---------------------------------------------------------------
// 1. 语义令牌 --surface-elevated
// ---------------------------------------------------------------
describe("T13 · 覆盖层底色的语义令牌", () => {
  it("--surface-elevated 在四主题下都解析得到真实色值", () => {
    for (const theme of THEMES) {
      const hex = resolveColor(themes[theme]["surface-elevated"], themes[theme]);
      expect(hex, `${theme} 主题解析不出 --surface-elevated`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("命令面板底色走 --surface-elevated，不写死颜色、也不再直引页面底", () => {
    const dialog = extractRules(css).find((r) => r.selector === ".palette-dialog");
    expect(dialog, "styles.css 里找不到 .palette-dialog 规则").toBeTruthy();
    const bg = declOf(dialog!.body, "background");
    expect(bg).toBe("var(--surface-elevated)");
  });

  it("深色三主题的命令面板底色落在暗色域，且与暖纸的底色不是同一个颜色", () => {
    const light = resolveColor(themes.light["surface-elevated"], themes.light);
    expect(relativeLuminance(light), "暖纸主题的覆盖层底反而不亮了").toBeGreaterThan(0.5);
    for (const theme of DARK_THEMES) {
      const vars = themes[theme];
      const bg = resolveColor(vars["surface-elevated"], vars);
      // 「暗色域」的判据：相对亮度低于 0.2。暖纸是 0.90+，暗色三主题是 0.02 以下，
      // 中间这一大段空白就是"白底穿帮"会落进去的地方。
      expect(relativeLuminance(bg), `${theme} 主题的命令面板底 ${bg} 不在暗色域`).toBeLessThan(0.2);
      expect(bg.toLowerCase(), `${theme} 主题的命令面板底与暖纸同色 = 没跟着主题走`).not.toBe(
        light.toLowerCase(),
      );
      // 底暗了但字没跟上同样是穿帮，顺手把可读性一起钉住
      const fg = resolveColor(vars["text-1"], vars);
      expect(contrastRatio(fg, bg), `${theme} 主题命令面板正文对比度不足`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ---------------------------------------------------------------
// 2. 全局审计：所有 z-index 抬升的容器
// ---------------------------------------------------------------
describe("T13 · 高 z-index 容器的底色审计", () => {
  /** z-index ≥ 40 的这一档就是"浮在页面之上"的覆盖层：菜单、弹窗、抽屉、遮罩 */
  const RAISED_MIN = 40;

  function raisedRules() {
    return extractRules(css)
      .map((r) => ({ ...r, z: Number(declOf(r.body, "z-index") ?? NaN) }))
      .filter((r) => Number.isFinite(r.z) && r.z >= RAISED_MIN);
  }

  it("审计面本身不为空（选择器改名/规则搬家不能让这条门禁静默失效）", () => {
    const raised = raisedRules();
    expect(raised.length, "没抓到任何高 z-index 规则，解析器多半失灵了").toBeGreaterThanOrEqual(10);
    // 命令面板是本项的点名对象，必须在审计面里
    expect(raised.map((r) => r.selector)).toContain(".palette-overlay");
  });

  /**
   * ★ 这条一开始只审"自己声明了 z-index 的那条规则"，变异验证当场打脸：
   * 把 `.palette-dialog` 的底改成 `#fff` 它照样绿——因为 z-index 写在父层
   * `.palette-overlay` 上，真正那块不透明的面是**子元素**。
   * 所以判据改成整个组件层：只要不是主题块里的色板定义，任何
   * background 都不许是不透明字面色。覆盖层的面无论挂在父还是子上都被圈住。
   */
  it("组件层没有任何不透明的字面底色（覆盖层的面常常写在子元素上）", () => {
    const blocks = extractThemeBlocks(css);
    let componentLayer = blankComments(css);
    // 主题块里的 #hex 是色板定义本身，合法——按原位掏空，保住后续切片的索引
    for (const b of blocks) {
      const at = componentLayer.indexOf(b.body);
      if (at < 0) continue;
      componentLayer =
        componentLayer.slice(0, at) + " ".repeat(b.body.length) + componentLayer.slice(at + b.body.length);
    }
    const offenders: { decl: string }[] = [];
    for (const m of componentLayer.matchAll(/(?:^|[;{\s])(background(?:-color)?)\s*:\s*([^;}]+)/gi)) {
      if (isOpaqueLiteralColor(m[2])) offenders.push({ decl: `${m[1]}: ${m[2].trim()}` });
    }
    expect(offenders, `这些声明写死了不透明底色：${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("覆盖层用到的底色令牌都能在四主题下解析出色值（没有悬空 var）", () => {
    const tokens = new Set<string>();
    for (const r of raisedRules()) {
      const bg = declOf(r.body, "background") ?? declOf(r.body, "background-color") ?? "";
      for (const m of bg.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) tokens.add(m[1].replace(/^--/, ""));
    }
    expect(tokens.size).toBeGreaterThan(0);
    for (const theme of THEMES) {
      for (const token of tokens) {
        const hex = resolveColor(themes[theme][token], themes[theme]);
        expect(hex, `${theme} 主题解析不出覆盖层令牌 --${token}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

// ---------------------------------------------------------------
// 3. 行为锁：覆盖层根节点确实在 data-theme 的作用域里
// ---------------------------------------------------------------
describe("T13 · 覆盖层挂载点在 data-theme 作用域内", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
    document.getElementById("command-palette")?.remove();
  });

  it("命令面板真实初始化后是携带 data-theme 那个节点的后代（真 DOM，不是字符串断言）", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const api = initCommandPalette({}, { doc: document });
    const root = document.getElementById("command-palette");
    expect(root, "命令面板没挂进文档").toBeTruthy();
    // data-theme 写在 <html> 上；自定义属性靠继承下发，所以"是它的后代"
    // 就是"能拿到这套主题变量"的充要条件
    const themed = document.querySelector("[data-theme]");
    expect(themed).toBe(document.documentElement);
    expect(themed!.contains(root!)).toBe(true);
    expect(root!.closest("[data-theme]")).toBe(document.documentElement);
    api.close();
  });

  it("其余 body 级覆盖层模块的挂载目标同样是 document.body", () => {
    // 这条是静态锁：它只证"源码里写的是 body"，证不了运行时真的挂上去了
    // （那需要逐个模块起 jsdom，各自的 init 依赖面差别很大，代价不成比例）。
    const modules = [
      "command-palette.js",
      "notifications.js",
      "memory-panel.js",
      "global-search.js",
      "workdir-picker.js",
      "onboarding.js",
    ];
    for (const name of modules) {
      const src = readFileSync(join(__dirname, "..", "ui", "public", "features", name), "utf-8");
      expect(
        /\(?\s*doc\.body\s*(?:\?\?\s*doc\.documentElement\s*)?\)?\s*\.appendChild\(/.test(src),
        `${name} 的覆盖层根节点不是挂在 doc.body 上——离开 <html data-theme> 就拿不到主题变量`,
      ).toBe(true);
    }
  });
});
