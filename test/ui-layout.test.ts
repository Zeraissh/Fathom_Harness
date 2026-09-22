// @ts-nocheck
/**
 * 骨架的度量与显隐锁（方案 A · 计划 1）。
 *
 * 这一层全是 CSS 与少量派生函数，跑不了"行为"，能锁的是**结构**：
 * 度量单位对不对、常量在不在、显隐规则有没有被后来的改动悄悄抹掉。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  foldNoiseEntries,
  noiseGroupOf,
  readTreeExpanded,
  writeTreeExpanded,
  TREE_EXPANDED_PREF,
} from "../ui/public/features/file-tree.js";

const css = () => readFile(join(process.cwd(), "ui/public/styles.css"), "utf8");
const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

/** 从 CSS 里抠出某个选择器的规则块（第一个匹配）。
 *
 * 先把行尾归一成 LF：styles.css 在 git 里存的是 LF，但 Windows 检出
 * （core.autocrlf=true）会变成 CRLF。多行选择器是用 `\n` 拼出来的，
 * 不归一化的话同一条规则在本机（CRLF）与 CI（LF）会得出相反结论——
 * 本机显示"找不到选择器"，而样式其实是对的。 */
function block(source: string, selector: string): string {
  const text = source.replace(/\r\n/g, "\n");
  const start = text.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`找不到选择器 ${selector}`);
  const end = text.indexOf("\n}", start);
  return text.slice(start, end);
}

describe("正文度量", () => {
  it("--measure 在 :root 有默认值（ui-app.test.ts 的变量门也要求）", async () => {
    const source = await css();
    const root = block(source, ":root");
    expect(root).toMatch(/--measure:\s*40em/);
  });

  it(".conversation 用 --measure 而不是 ch", async () => {
    const b = block(await css(), ".conversation");
    expect(b).toMatch(/max-width:\s*min\(var\(--measure\),\s*100%\)/);
    expect(b).not.toMatch(/\d+ch/);
  });

  it("整块居中（左右都 auto）——不是靠左", async () => {
    const b = block(await css(), ".conversation");
    expect(b).toMatch(/margin:\s*0 auto/);
  });
});

describe("左栏收起态是图标条，不是消失", () => {
  it("收起态仍占 48px 且不 display:none", async () => {
    const source = await css();
    const b = block(source, "body.sidebar-collapsed .sidebar");
    expect(b).not.toMatch(/display:\s*none/);
    // 负向后顾：min-width: 48px 不算数——只有真正的 width 撑着收起态，
    // 它一没就回落到 .sidebar { width: 280px }，48px 图标条悄悄变回宽面板。
    expect(b).toMatch(/(?<!-)\bwidth:\s*48px/);
  });

  it("收起态藏起的是宽内容（列表 / 搜索行 / 花费 / 脸切换 / 品牌 / 按钮文字）", async () => {
    const source = await css();
    const hidden = block(
      source,
      "body.sidebar-collapsed .run-list,\nbody.sidebar-collapsed .run-search-row,\nbody.sidebar-collapsed #home-spend,\nbody.sidebar-collapsed #workspace-face,\nbody.sidebar-collapsed .sidebar-brand,\nbody.sidebar-collapsed .new-chat-btn span",
    );
    expect(hidden).toMatch(/display:\s*none/);
  });

  it("保留的按钮行改成竖排（横排 5×34=170px 会溢出 48px）", async () => {
    const source = await css();
    const kept = block(
      source,
      "body.sidebar-collapsed .sidebar-top-tools,\nbody.sidebar-collapsed .sidebar-footer--icons",
    );
    expect(kept).toMatch(/flex-direction:\s*column/);
  });
});

describe("两脸差异只收在 [data-face] 上", () => {
  it("git 区在 Work 脸藏起、Code 脸显示", async () => {
    const source = await css();
    const work = block(source, 'body[data-face="work"] .workspace-git-chip');
    expect(work).toMatch(/display:\s*none/);
  });

  it("CSS 里不许出现别的脸判据（只认 data-face）", async () => {
    const source = await css();
    expect(source).not.toMatch(/body\.(is-office|is-code|face-code|face-work)/);
  });

  it("芯片元素真的带着 workspace-git-chip 类（不然那两条规则匹配不到任何东西）", async () => {
    const source = await html();
    // 取整个标签再断言"类与 id 在同一个标签里"。只写
    // `expect(source).toContain("workspace-git-chip")` 会退化成"文件里出现过这个词"——
    // 元素上方那两行 HTML 注释里就有它，那种断言在类被删掉后照样绿。
    const tag = source.match(/<[^>]*id="workspace-git-chip"[^>]*>/)?.[0] ?? "";
    expect(tag, "index.html 里找不到 #workspace-git-chip 标签").not.toBe("");
    expect(tag).toMatch(/class="[^"]*(?<![\w-])workspace-git-chip(?![\w-])[^"]*"/);
  });
});

/**
 * 折叠的 scope 不许留"看得见、点不到"的幽灵控件（计划 3 · T1）。
 *
 * 两条一起锁：规则本身，**以及规则匹配的那半 markup**——计划 1 的教训是
 * 只锁 CSS 文本，删掉 markup 里的类，303 条测试全绿而 bug 复活。
 */
describe("折叠的 scope 不留幽灵控件", () => {
  it("scope 收起时 scopebar 必须真的不渲染", async () => {
    const source = await css();
    const rule = block(source, ".composer-scope:not([open]) .composer-scopebar");
    expect(rule).toMatch(/display:\s*none/);
  });

  it("那条规则匹配的那半 markup 还在（scope 与 scopebar 的类与嵌套）", async () => {
    const source = await html();
    // ★ **不要用 block()**：它按 `\n<选择器> {` 找的是 **CSS 规则块**，
    // 拿它去抠 markup 会永远抛「找不到选择器」——这一条最初就是那么写的。
    // 照本文件 :96-104 那条 chip 测试的写法：**取标签再断言**，不在整份文件上 toContain。
    const scopeBlock = source.match(/<details[^>]*class="[^"]*(?<![\w-])composer-scope(?![\w-])[^"]*"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(scopeBlock, "index.html 里找不到 .composer-scope 那个 details 块").not.toBe("");

    // 再收紧到标签级：块内就有 HTML 注释，块级 toContain 能被注释喂饱
    const barTag = scopeBlock.match(/<div[^>]*class="[^"]*(?<![\w-])composer-scopebar(?![\w-])[^"]*"[^>]*>/)?.[0] ?? "";
    expect(barTag, "scopebar 不在那个 details 里——那条 CSS 规则就匹配不到它了").not.toBe("");
    const trigTag = scopeBlock.match(/<button[^>]*id="workdir-trigger"[^>]*>/)?.[0] ?? "";
    expect(trigTag, "触发钮不在那个 details 里").not.toBe("");
  });
});

describe("A6 降噪折叠：折成一行计数，不是不给", () => {
  it("下划线开头的目录按前缀归组（_probe2-p1 / _probe3-p2 同组）", () => {
    expect(noiseGroupOf("_probe2-p1")).toBe("_probe");
    expect(noiseGroupOf("_probe3-p2")).toBe("_probe");
    expect(noiseGroupOf("_qa")).toBe("_qa");
    expect(noiseGroupOf("_tmp-3")).toBe("_tmp");
    expect(noiseGroupOf("__pycache__")).toBe("__pycache__");
  });

  /**
   * ★ **同一族要落到同一个组**（2026-09-20 拿真实目录名量的）。
   *
   * 委托方的工作目录里有 56 个目录、其中 46 个是 Chrome 配置目录：
   *   `_probe-profile-9924` `_probe2-profile-9982` … `_probeH-profile-9942`
   *   `_cdp-profile-9423` `_shoot-profile-9990` `_verify-profile-9812` …
   * 旧规则只取到"第一个连字符或数字之前"，于是 `_probe` / `_probeA` / `_probeB` …
   * 成了**七个不同的组**；再叠上"≥2 才成组"，每族只剩一个的（`_probeB`..`_probeF`）
   * **全部原样显示**——树里还躺着 24 行，Chrome 配置内容铺满整栏。
   * **它们明明是同一族。**
   */
  it("★ 尾部的字母/数字要剥掉：_probe / _probe2 / _probeA… 同属一族", () => {
    for (const n of ["_probe-profile-9924", "_probe2-profile-9982", "_probe9-profile-9946",
                     "_probeA-profile-9964", "_probeH-profile-9942"]) {
      expect(noiseGroupOf(n), `${n} 没归到 _probe 族`).toBe("_probe");
    }
    expect(noiseGroupOf("_cdp-profile-9423")).toBe("_cdp");
    expect(noiseGroupOf("_cdp-pix-9700")).toBe("_cdp");
  });

  it("★ 但小写结尾不许剥——_ags 剥成 _ag、_research 剥成 _researc 都是错的", () => {
    for (const n of ["_ags", "_research", "_lfchk", "_grid", "_verify"]) {
      expect(noiseGroupOf(n), `${n} 被剥过头了`).toBe(n);
    }
  });

  it("★ 真实数据：22 个 _probe* 折成**一行**（此前碎成 5 组 + 5 个漏网）", () => {
    const probeDirs = ["_probe", "_probe2", "_probe3", "_probe4", "_probe5", "_probe6",
      "_probe7", "_probe8", "_probe9", "_probeA", "_probeB", "_probeC", "_probeD",
      "_probeE", "_probeF", "_probeG", "_probeH"].map((n) => ({
        name: `${n}-profile-${1000 + n.length}`, relative: n, kind: "directory",
      }));
    const { items } = foldNoiseEntries(probeDirs);
    expect(items.filter((i) => i.type === "entry"), "还有漏网的单例").toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "group", key: "_probe", count: 17 });
  });

  it("正常目录不属于任何组——降噪只收拾噪音，不许碰人写的东西", () => {
    for (const n of ["src", "ui", "test", "eval", "node_modules", "README.md"]) {
      expect(noiseGroupOf(n), `${n} 被误判成噪音`).toBeNull();
    }
  });

  it("成组的折起来，未成组的原样——且**顺序按原位保留**", () => {
    const entries = [
      { name: "src", relative: "src", kind: "directory" },
      { name: "_probe2-p1", relative: "_probe2-p1", kind: "directory" },
      { name: "_probe3-p2", relative: "_probe3-p2", kind: "directory" },
      { name: "_qa", relative: "_qa", kind: "directory" },
      { name: "README.md", relative: "README.md", kind: "file" },
    ];
    const { items } = foldNoiseEntries(entries);
    // 服务端已经排好序（目录在前、localeCompare），渲染层不许再排一次；
    // 组落在**它第一个成员的位置**上，所以顺序是构造出来的、不是重排出来的。
    expect(items.map((it) => (it.type === "group" ? `组:${it.key}` : it.entry.relative)))
      .toEqual(["src", "组:_probe", "_qa", "README.md"]);
    expect(items[1]).toMatchObject({ type: "group", key: "_probe", count: 2 });
    expect(items[1].members.map((e) => e.relative)).toEqual(["_probe2-p1", "_probe3-p2"]);
  });

  it("空输入不吃亏", () => {
    expect(foldNoiseEntries([])).toEqual({ items: [] });
    expect(foldNoiseEntries(null)).toEqual({ items: [] });
  });
});

describe("展开态跨会话记忆（A6）", () => {
  function fakeStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m };
  }

  it("按工作目录分开记——两个项目的目录名会重名", () => {
    const s = fakeStorage();
    writeTreeExpanded(s, "D:/a", ["src", "src/tools"]);
    writeTreeExpanded(s, "D:/b", ["ui"]);
    expect(readTreeExpanded(s)["D:/a"]).toEqual(["src", "src/tools"]);
    expect(readTreeExpanded(s)["D:/b"]).toEqual(["ui"]);
  });

  it("空数组等于删掉这条，不留垃圾键", () => {
    const s = fakeStorage();
    writeTreeExpanded(s, "D:/a", ["src"]);
    writeTreeExpanded(s, "D:/a", []);
    expect(readTreeExpanded(s)["D:/a"]).toBeUndefined();
  });

  it("存储里是坏值时当作没有，不许抛（localStorage 里什么都可能有）", () => {
    const s = fakeStorage();
    s.setItem(TREE_EXPANDED_PREF, "{{{ 不是 JSON");
    expect(readTreeExpanded(s)).toEqual({});
    s.setItem(TREE_EXPANDED_PREF, '{"D:/a":"不是数组"}');
    expect(readTreeExpanded(s)).toEqual({});
  });

  it("工作目录数量有上限，别让它无限长", () => {
    const s = fakeStorage();
    for (let i = 0; i < 40; i++) writeTreeExpanded(s, `D:/w${i}`, ["src"]);
    expect(Object.keys(readTreeExpanded(s)).length).toBeLessThanOrEqual(20);
  });
});

/**
 * 窄坞下标签条不许被压成 0（计划 3 · T3）。
 *
 * 坞头自己就有 overflow-x:auto（它的注释写着「头里的键够不着时允许横滚」），
 * 但那条横滚滚的是坞头自己那一行——而 .ac-tabs 被写成 flex:1 1 0 + min-width:0，
 * 是坞头里唯一能被压到 0 的成员（固定成员加起来 190px 已超过坞的 159px）。
 * 给它一个下限，那 930px 的内容才不再关在 0 宽的盒子里。
 */
describe("窄坞下的标签条", () => {
  it("标签条有下限，不再是唯一能被压到 0 的成员", async () => {
    const source = await css();
    const rule = block(source, ".ac-tabs");
    expect(rule).toMatch(/flex:\s*1\s+1\s+0/);      // 仍然吃剩余空间
    expect(rule).toMatch(/min-width:\s*(?!0\b)\S+/); // 但不再允许压到 0
  });

  it("坞头仍然自己横滚（那条注释说的意图没被这条修复顶掉）", async () => {
    const source = await css();
    const rule = block(source, ".ac-head");
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });
});

/**
 * 右栏「改动」审阅面板（计划 3 · T7 → 计划 4 拆 split 后重锁）。
 *
 * 页签行随 split 一起拆了（任务 3 换成召出钮行），tabbed 三向互斥也随之
 * 消失——显隐改由「一次一只」统管：三只槽默认全藏、只有当前面是 flex
 * （右列块里那组规则，任务 3 起只认 data-surface——反面的 3-G 锁在
 * test/ui-rail-policy.test.ts）。
 * split 档的规则与 announceStatus 分支随 split 一起消失——I4 的根因
 * （split 档没有第三列）也随 split 一起消失，那条锁完成了它的使命。
 * ★ 两脸槽成对（Work 恒出树、另两只槽不出现）改挂在右列块的 (0,3,1)
 * 规则上——本 describe 旧锁的那条 (0,2,1) 压不过 :is() 显形规则
 * （修复轮 2 ①），已随规则一起删；锁在「右列两形态」的 ①。
 */
describe("右栏「改动」面板（计划 3 · T7）", () => {
  it("review 槽在 DOM 里（index.html），召出钮的 aria-controls 指向它（app.js，页签行→召出钮行任务 3 已换）", async () => {
    const h = await html();
    const app = await readFile(join(process.cwd(), "ui/public/app.js"), "utf8");
    expect(h).toMatch(/id="right-rail-review"/);
    expect(app).toMatch(/aria-controls="right-rail-review"/);
  });

  it("Code 脸一次一只：三只槽默认全藏，只有当前面是 flex（tabbed 三向互斥随页签行消失）", async () => {
    const source = await css();
    const base = block(
      source,
      ".right-rail > .workspace-file-tree,\n.right-rail > .right-rail-preview,\n.right-rail > .right-rail-review",
    );
    expect(base).toMatch(/display:\s*none/);
    // 显形那半同样要锁——只锁"默认藏"的话，把显形改成 none 全绿而右列永远空
    const show = block(
      source,
      '.right-rail[data-surface="tree"] > .workspace-file-tree,\n.right-rail[data-surface="preview"] > .right-rail-preview,\n.right-rail[data-surface="review"] > .right-rail-review',
    );
    expect(show).toMatch(/display:\s*flex/);
    expect(show).toMatch(/flex-direction:\s*column/);
  });

  it("hunk 画法只有一份：卡片与面板共用 renderChangeFileRows，不复制第二份", async () => {
    const app = await readFile(join(process.cwd(), "ui/public/app.js"), "utf8");
    expect(app.match(/export function renderPatchHunksHtml/g)?.length ?? 0).toBe(1);
    expect([...app.matchAll(/renderChangeFileRows\(/g)].length).toBeGreaterThanOrEqual(2);
    expect(app).toMatch(/export function renderReviewPanel/);
  });
});

/**
 * 右列的两种形态（计划 4 · T2）。
 *
 * `docked` = 占宽的真列（从对话拿宽）；`floating` = 浮在对话上（**不占位**）。
 * 旧的两列并排那套随 `split` 一起拆了。
 */
describe("右列两形态的样式", () => {
  it("docked：`.right-rail` 是 flex 子项、占宽", async () => {
    const source = await css();
    const rule = block(source, '.right-rail[data-layout="docked"]');
    expect(rule).toMatch(/flex:\s*0\s+0\s+auto|width:/);
  });

  it("floating：浮层是 absolute、**不参与 flex**（不占位才叫浮层）", async () => {
    const source = await css();
    const rule = block(source, '.right-rail[data-layout="floating"]');
    expect(rule).toMatch(/position:\s*absolute/);
  });

  it("★ 整份 CSS 里不再有 split 档的任何规则（拆干净）", async () => {
    const source = await css();
    expect(source).not.toMatch(/\[data-layout="split"\]/);
  });

  it("★ 槽也成对：Work 脸恒出树、另两只槽不出现（特异性 (0,3,1) 压过显形规则）", async () => {
    const source = await css();
    expect(block(source, 'body[data-face="work"] .right-rail > .workspace-file-tree')).toMatch(/display:\s*(flex|block)/);
    const hide = source.slice(source.indexOf('body[data-face="work"] .right-rail > .right-rail-preview'),
                            source.indexOf('}', source.indexOf('body[data-face="work"] .right-rail > .right-rail-preview')));
    expect(hide).toMatch(/display:\s*none/);
    expect(hide).toMatch(/right-rail-review/);
  });

  it("★ 两脸成对：五只召出钮都有脸规则，且**默认是藏的**（漏配对时安全）", async () => {
    const source = await css();
    // 兜底：默认藏 —— 将来新增一只钮忘了配对时，它不会以无样式形态出现在两张脸上
    expect(block(source, ".rail-surface-btn")).toMatch(/display:\s*none/);
    // 成对：Work 一只 + Code 四只
    expect(block(source, 'body[data-face="work"] .rail-surface-btn--work')).toMatch(/display:\s*flex/);
    expect(block(source, 'body[data-face="code"] .rail-surface-btn--code')).toMatch(/display:\s*flex/);
  });

  it("★ 修复轮 1 · F1：钮行与菜单有真样式（不是无样式块）", async () => {
    const source = await css();
    const bar = block(source, ".rail-surface-bar");
    expect(bar).toMatch(/display:\s*flex/);
    expect(bar).toMatch(/margin-left:\s*auto/); // 推到标题行右端
    const menu = block(source, ".rail-more-menu");
    expect(menu).toMatch(/position:\s*absolute/);
    expect(menu).toMatch(/top:\s*calc\(100%/);       // 向下弹（头部挂在 .back-bar）
    expect(menu).not.toMatch(/bottom:\s*calc\(100%/); // 别抄成 .wd-menu 的向上弹
    // 钮本身也有 chrome：方钮边框 + 激活高亮（设计稿 §3：激活时高亮）
    const btn = block(source, ".rail-surface-btn");
    expect(btn).toMatch(/border:\s*1px solid var\(--border-1\)/);
    expect(btn).toMatch(/border-radius:\s*var\(--radius\)/);
    expect(source).toMatch(/\.rail-surface-btn\[aria-pressed="true"\]/);
  });

  it("★ 修复轮 1 · F5：浮层下拖柄藏掉（浮层不可拖，免得拖完弹回）", async () => {
    const source = await css();
    expect(block(source, '.right-rail[data-layout="floating"] .right-rail-drag')).toMatch(/display:\s*none/);
  });

  it("★ 激活态不能与 hover 撞色（否则悬停未激活钮＝激活钮）", async () => {
    const source = await css();
    const hover = block(source, ".rail-surface-btn:hover");
    const pressed = block(source, '.rail-surface-btn[aria-pressed="true"]');
    expect(pressed.replace(/\s+/g, " ").trim()).not.toBe(hover.replace(/\s+/g, " ").trim());
    expect(pressed).toMatch(/accent/);   // 若你选的 house 做法不用 accent，按你的事实改这条并说明
  });

  it("★ 收起后仍有展开入口（UX-B2 挪锁）：side 收成细条 + 键还在，只有 overlay 整条藏", async () => {
    const source = await css();
    const collapsed = block(source, '.right-rail[data-collapsed="true"]');
    expect(collapsed).not.toMatch(/display:\s*none/);   // ← 核心：别把整条藏掉
    expect(collapsed).toMatch(/width:\s*var\(--rail-width,\s*40px\)/);
    expect(block(source, '.right-rail[data-collapsed="true"] .right-rail-collapse i')).toMatch(/rotate\(180deg\)/);
    expect(block(source, '.right-rail[data-mode="overlay"][data-collapsed="true"]')).toMatch(/display:\s*none/);
    // markup 半（"锁 CSS 没锁 markup"是本族第一号变体）：
    // ① 把手在 DOM 里，点击真的接 railOpen（重新打开）……
    const h = await html();
    expect(h).toMatch(/getElementById\("right-rail-handle"\)[\s\S]{0,120}?railOpen\(\)/);
    // ② ……而且它是 rail 的兄弟，不在 rail 块里——住在里面会随 overlay 收起一起消失
    //   （走查 UX-B2 的断头路）。数开闭标签：rail 的 <div> 必须在把手之前闭合。
    const railTag = h.indexOf('<div id="right-rail"');
    const handleAt = h.indexOf('id="right-rail-handle"');
    expect(railTag, "index.html 里找不到 #right-rail").toBeGreaterThan(-1);
    expect(handleAt, "index.html 里找不到 #right-rail-handle").toBeGreaterThan(railTag);
    const between = h.slice(railTag, handleAt);
    expect((between.match(/<div\b/g) ?? []).length, "把手还住在 rail 里——收起时它会跟着一起消失")
      .toBe((between.match(/<\/div>/g) ?? []).length);
  });

  it("★ E14 空槽 hider 必须排在显形规则之后（同为 (0,3,0)，只能靠源顺序）", async () => {
    const source = await css();
    const show = source.indexOf('.right-rail[data-surface="preview"] > .right-rail-preview');
    const hider = source.indexOf('.right-rail-preview:not(:has(> .preview-dock:not([hidden])))');
    expect(show).toBeGreaterThan(-1);
    expect(hider).toBeGreaterThan(show);
  });
});

/**
 * 窄档浮层让出对话头部（计划 4 · T5 修复轮）。
 *
 * **实测的缺陷**（1100 档真点，T5）：右列 `layout=floating` 时 top:0 起、
 * 浮满 center-row 右侧整条，把**对话头部那排召出钮**整个盖住——每只键的
 * `elementFromPoint` 命中的都是 `div#right-rail`，`page.click` 超时。
 * 于是窄档下「再点同一个键」根本点不到，与设计稿 §5「四条关闭路径都要通
 * （× / Esc / 遮罩 / 同键）」直接冲突。顺带：钮行原本住在**可滚动**的
 * 对话头部里，长对话滚到底后整排键滚出视口（1920 档实测 y=-3544）。
 *
 * **修法两条，缺一条都不成**：
 *   ① `.back-bar` 钉成**不随对话滚动**的固定条（sticky），层级高过遮罩(59)
 *      与浮层(60) ⇒ 键在任何滚动位置都露在外面、点得到；
 *   ② 浮层的 `top` 让出这条头部（高度由宿主**实测**写 `--rail-float-top`）
 *      ⇒ 浮层既不盖键，也不会把浮层自己的 ×/搜索 顶到键下面去。
 */
describe("窄档浮层让出对话头部（计划 4 · T5 修复轮）", () => {
  it("★ 浮层的 top 让出头部条（读实测变量，不是 top:0）", async () => {
    const rule = block(await css(), '.right-rail[data-layout="floating"]');
    expect(rule).toMatch(/top:\s*var\(--rail-float-top/);
    // 负向后顾：`top:` 与 0 之间不许有别的（-0 / 0px / 0 都算没让位）
    expect(rule).not.toMatch(/(?<!-)\btop:\s*0/);
  });

  it("★ 对话头部是固定条（sticky）——否则长对话里那排键会跟着滚走", async () => {
    const rule = block(await css(), ".back-bar");
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/(?<!-)\btop:\s*0/);
  });

  it("★ 头部的层级高过遮罩与浮层（盖住 = 同键不可点）", async () => {
    const source = await css();
    const zOf = (sel: string) => {
      const m = block(source, sel).match(/z-index:\s*(\d+)/);
      expect(m, `${sel} 没有 z-index`).toBeTruthy();
      return Number((m as RegExpMatchArray)[1]);
    };
    const head = zOf(".back-bar");
    // 两个对手都从 CSS 里现读——将来谁改号，这里跟着比，不是抄死数字
    expect(head).toBeGreaterThan(zOf(".right-rail-scrim"));
    expect(head).toBeGreaterThan(zOf('.right-rail[data-layout="floating"]'));
  });

  it("★ `--rail-float-top` 有默认定义（与 rail 那几个变量同一块；ui-app 的变量门也要求）", async () => {
    const source = await css();
    // 锚在 `--rail-width: 288px`（只在 :root 里这样写；规则里是 `var(--rail-width, 288px)`）
    const at = source.indexOf("--rail-width: 288px");
    expect(at, "找不到 :root 的 --rail-width 定义").toBeGreaterThan(-1);
    expect(source.slice(at, at + 600)).toMatch(/--rail-float-top:\s*0px/);
  });
});
