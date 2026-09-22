// @vitest-environment jsdom
// @ts-nocheck
/**
 * T18 同类型重复自动折叠成组（features/transcript-grouping.js）。
 *
 * ★ 真因与计划原文不同，测试按真因写：
 *   计划说「连续 ≥3 条**同类型工具输出**折叠成组卡」，读作"主区有 12 张独立的
 *   链接卡"。复核 `02-chat-code-rail-collapsed-1440.png` 后不成立——那面墙是
 *   **一张卡里的一张 12 行表**（`renderChatItem` 的 `case "sources"`，底下还挂
 *   着「导出链接列表」按钮）；而**连续工具早就被 `collapseToolGroups` 折过了**，
 *   照字面再做一遍是空转。所以折的是"同类型的重复"本身：卡内同构行列表 +
 *   兄弟卡片连续同签名。
 *
 * ★ 判据降级（jsdom 没有布局）：计划验收写的是「主区首屏高度缩短 ≥50%」。
 *   jsdom 不做布局、不做样式级联、不解析 var()，`offsetHeight` 恒为 0，
 *   这个数**量不出来**。改成**可数代理**：同一份含 12 条链接的事件流，
 *   渲染后对话里可见的行/卡节点数从 N 降到 M。
 *   **这个代理守不住真实像素高度**——它只证明"折叠真的发生了、该藏的藏了"，
 *   不证明首屏矮了多少。真实视口取证仍是 P0 遗留的截图缺口。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GROUPING_MIN,
  GROUPING_COPY,
  ROW_GROUP_TARGETS,
  itemSignature,
  findRuns,
  groupSummaryText,
  matchesQuery,
  initTranscriptGrouping,
} from "../ui/public/features/transcript-grouping.js";
import { initReadingMode } from "../ui/public/features/reading-mode.js";
import {
  createInitialState,
  reduceEvents,
  deriveChatItems,
  renderChatItem,
} from "../ui/public/app.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// ---------------------------------------------------------------
// 纯函数层
// ---------------------------------------------------------------

describe("itemSignature 只认白名单，结论类一律不可折", () => {
  const item = (html) => {
    const el = document.createElement("div");
    el.className = "chat-item";
    el.innerHTML = html;
    return el;
  };

  it("可折类型各自认得出", () => {
    expect(itemSignature(item('<aside class="chat-sources"></aside>'))).toEqual({ sig: "sources", label: "来源表" });
    expect(itemSignature(item('<div class="chat-artifacts"></div>'))?.sig).toBe("artifacts");
    expect(itemSignature(item('<details class="chat-tool-group"></details>'))?.sig).toBe("tool");
    expect(itemSignature(item('<details class="chat-thinking"></details>'))?.sig).toBe("thinking");
    expect(itemSignature(item('<div class="chat-activity chat-notice"></div>'))?.sig).toBe("notice");
    expect(itemSignature(item('<div class="chat-activity"></div>'))?.sig).toBe("activity");
  });

  it("★ 结论类返回 null——误折结论比漏折过程严重得多", () => {
    for (const html of [
      '<div class="chat-msg chat-msg--user"></div>',
      '<div class="chat-msg chat-msg--assistant"></div>',
      '<div class="chat-verdict"></div>',
      '<div class="chat-change-card"></div>',
      '<div class="segment-boundary"></div>',
      '<div class="chat-msg chat-msg--plan"></div>',
    ]) {
      expect(itemSignature(item(html)), html).toBeNull();
    }
    expect(itemSignature(null)).toBeNull();
    expect(itemSignature(item(""))).toBeNull();
  });
});

describe("findRuns 连续同签名区间", () => {
  const s = (sig) => ({ sig, label: sig });

  it(`少于 ${GROUPING_MIN} 条不成组`, () => {
    expect(findRuns([s("a"), s("a")])).toEqual([]);
    expect(findRuns([s("a"), s("a"), s("a")])).toEqual([
      { start: 0, length: 3, sig: "a", label: "a" },
    ]);
  });

  it("锚点（null）打断连续", () => {
    expect(findRuns([s("a"), s("a"), null, s("a"), s("a")])).toEqual([]);
  });

  it("不同签名不合并；多段各自成组", () => {
    const runs = findRuns([s("a"), s("a"), s("a"), s("b"), s("b"), s("b"), s("b")]);
    expect(runs).toEqual([
      { start: 0, length: 3, sig: "a", label: "a" },
      { start: 3, length: 4, sig: "b", label: "b" },
    ]);
  });

  it("空输入与畸形输入不炸", () => {
    expect(findRuns([])).toEqual([]);
    expect(findRuns(null)).toEqual([]);
    expect(findRuns([null, undefined, { sig: "" }])).toEqual([]);
  });
});

describe("groupSummaryText / matchesQuery", () => {
  it("行列表与兄弟卡片两种形状的措辞不同，用户点开前知道会得到什么", () => {
    expect(groupSummaryText("链接列表", 12, "rows")).toBe("链接列表（12）");
    expect(groupSummaryText("来源表", 4, "items")).toBe("来源表 × 4");
  });

  it("查询大小写不敏感；空查询一律命中", () => {
    expect(matchesQuery("https://Example.com/A", "example")).toBe(true);
    expect(matchesQuery("https://example.com", "  ")).toBe(true);
    expect(matchesQuery("https://example.com", "zzz")).toBe(false);
  });
});

// ---------------------------------------------------------------
// DOM 层：走真实渲染链（app.js 派生 + 渲染 → 后处理）
// ---------------------------------------------------------------

describe("T18 走真实渲染链：12 条链接的来源表", () => {
  let conversation;
  let api;

  /** 12 条裸链接的事件流——正是截图那一场的形状（title 为空，来源列全是兜底的"链接"） */
  function twelveLinkState() {
    const links = Array.from(
      { length: 12 },
      (_, i) => `https://everything.explained.today/topic-${i}/`,
    );
    const stream = [
      {
        seq: 0,
        source: "main",
        ts: 1000,
        event: { type: "assistant_text", text: `查到这些：\n${links.join("\n")}` },
      },
    ];
    return reduceEvents(createInitialState("r-links", "查资料", false), stream);
  }

  /** 把 app.js 真实渲染出来的 chat-item 铺进容器（与宿主同一份 renderChatItem） */
  function paint(state) {
    const items = deriveChatItems(state, null, {});
    conversation.innerHTML = "";
    for (const it of items) {
      const node = document.createElement("div");
      node.className = "chat-item";
      node.innerHTML = renderChatItem(it, false, {});
      conversation.appendChild(node);
    }
    return items;
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    conversation = document.createElement("div");
    conversation.id = "conversation";
    document.body.appendChild(conversation);
    api = initTranscriptGrouping({}, { doc: document });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const visibleRows = () =>
    [...conversation.querySelectorAll("table.chat-sources-table tbody tr")].filter(
      (tr) => !tr.classList.contains("tg-hidden") && !tr.closest(".tg-hidden"),
    ).length;

  it("现场复现：这份流确实渲染出一张 12 行的来源表（不是 12 张卡）", () => {
    const state = twelveLinkState();
    const items = paint(state);
    expect(items.filter((it) => it.kind === "sources")).toHaveLength(1);
    expect(conversation.querySelectorAll("table.chat-sources-table tbody tr")).toHaveLength(12);
    // 来源列全是兜底字样——报告里"每个链接都带'链接'前缀"说的就是这个
    const firstCells = [...conversation.querySelectorAll("tbody tr td:first-child")];
    expect(firstCells.every((td) => td.textContent === "链接")).toBe(true);
  });

  it("★ 可数代理：折叠后可见行数 12 → 0，顶上只留一条「链接列表（12）」摘要行", () => {
    paint(twelveLinkState());
    expect(visibleRows()).toBe(12);

    api.update(conversation);

    expect(visibleRows()).toBe(0);
    const box = conversation.querySelector(".tg-box");
    expect(box).not.toBeNull();
    expect(box.querySelector(".tg-summary").textContent).toContain("链接列表（12）");
    expect(box.querySelector(".tg-summary").getAttribute("aria-expanded")).toBe("false");
    // 整表被藏，而不是逐行藏——一条 CSS 规则管 12 行
    expect(conversation.querySelector(".md-table-wrap").classList.contains("tg-hidden")).toBe(true);
  });

  it("展开后 12 行全部回来，内容完整（折叠不是丢数据）", () => {
    paint(twelveLinkState());
    api.update(conversation);
    conversation.querySelector(".tg-summary").click();

    expect(visibleRows()).toBe(12);
    const urls = [...conversation.querySelectorAll("tbody tr td:last-child a")].map((a) => a.textContent);
    expect(urls).toHaveLength(12);
    expect(urls[0]).toContain("topic-0");
    expect(urls[11]).toContain("topic-11");
  });

  it("★ 组内搜索：展开后筛得动，清空查询回到全量", () => {
    paint(twelveLinkState());
    api.update(conversation);
    conversation.querySelector(".tg-summary").click();

    const search = conversation.querySelector("input.tg-search");
    expect(search.hidden).toBe(false);
    search.value = "topic-7";
    search.dispatchEvent(new window.Event("input"));
    expect(visibleRows()).toBe(1);

    search.value = "topic-1"; // topic-1 / topic-10 / topic-11
    search.dispatchEvent(new window.Event("input"));
    expect(visibleRows()).toBe(3);

    search.value = "";
    search.dispatchEvent(new window.Event("input"));
    expect(visibleRows()).toBe(12);
  });

  it("搜索没命中时给出明说，而不是一片空白", () => {
    paint(twelveLinkState());
    api.update(conversation);
    conversation.querySelector(".tg-summary").click();
    const search = conversation.querySelector("input.tg-search");
    search.value = "不存在的域名";
    search.dispatchEvent(new window.Event("input"));

    expect(visibleRows()).toBe(0);
    const empty = conversation.querySelector(".tg-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe(GROUPING_COPY.noMatch);
  });

  /**
   * ★ 这一条是写测试时和实现打架打出来的，如实记：第一版断言"收起再展开回到
   * 全量"，红了。查下来是**注释在说谎而不是代码错了**——搜索框的内容跨收起
   * 保留，行却回到全量，等于输入框写着 topic-7、底下铺 12 行，自相矛盾。
   * 结论：保留查询才是对的，改注释与判据，不改行为。
   */
  it("★ 查询跨收起保留：输入框留着 topic-7，再展开就只该有那一条", () => {
    paint(twelveLinkState());
    api.update(conversation);
    const summary = () => conversation.querySelector(".tg-summary");
    summary().click();
    const search = () => conversation.querySelector("input.tg-search");
    search().value = "topic-7";
    search().dispatchEvent(new window.Event("input"));
    expect(visibleRows()).toBe(1);

    summary().click(); // 收起
    expect(visibleRows()).toBe(0);
    summary().click(); // 再展开
    expect(search().value, "输入框与行必须说同一件事").toBe("topic-7");
    expect(visibleRows()).toBe(1);

    search().value = "";
    search().dispatchEvent(new window.Event("input"));
    expect(visibleRows()).toBe(12);
  });

  it("重复 update 幂等：不叠加摘要行、不重复藏", () => {
    paint(twelveLinkState());
    api.update(conversation);
    api.update(conversation);
    api.update(conversation);
    expect(conversation.querySelectorAll(".tg-box")).toHaveLength(1);
    expect(visibleRows()).toBe(0);
  });

  it("重算后展开态不丢（直播不弹回）", () => {
    paint(twelveLinkState());
    api.update(conversation);
    conversation.querySelector(".tg-summary").click();
    expect(visibleRows()).toBe(12);

    paint(twelveLinkState()); // 宿主重画
    api.update(conversation);
    expect(conversation.querySelector(".tg-summary").getAttribute("aria-expanded")).toBe("true");
    expect(visibleRows()).toBe(12);
  });

  it("少于阈值的表不折——2 行的来源表照旧铺开", () => {
    const stream = [
      { seq: 0, source: "main", ts: 1000, event: { type: "assistant_text", text: "https://a.example/\nhttps://b.example/" } },
    ];
    paint(reduceEvents(createInitialState("r2", "t", false), stream));
    expect(conversation.querySelectorAll("tbody tr")).toHaveLength(2);
    api.update(conversation);
    expect(conversation.querySelector(".tg-box")).toBeNull();
    expect(visibleRows()).toBe(2);
  });
});

// ---------------------------------------------------------------
// DOM 层：兄弟卡片连续同签名
// ---------------------------------------------------------------

describe("T18 兄弟卡片连续同签名", () => {
  let conversation;
  let api;

  const item = (html) => {
    const el = document.createElement("div");
    el.className = "chat-item";
    el.innerHTML = html;
    return el;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    conversation = document.createElement("div");
    conversation.id = "conversation";
    document.body.appendChild(conversation);
    api = initTranscriptGrouping({}, { doc: document });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const visibleItems = () =>
    [...conversation.querySelectorAll(".chat-item")].filter((el) => !el.classList.contains("tg-hidden")).length;

  it("★ 可数代理：4 张连续产物卡 → 可见卡数 4 → 0，多一条摘要行", () => {
    conversation.appendChild(item('<div class="chat-msg chat-msg--assistant">做好了</div>'));
    for (let i = 0; i < 4; i++) {
      conversation.appendChild(item(`<div class="chat-artifacts">产物 ${i}.html</div>`));
    }
    expect(visibleItems()).toBe(5);

    api.update(conversation);
    expect(visibleItems()).toBe(1); // 只剩助手正文
    expect(conversation.querySelector(".tg-summary").textContent).toContain("产物卡 × 4");
  });

  it("★ 结论不折：4 条连续助手正文原样铺开", () => {
    for (let i = 0; i < 4; i++) {
      conversation.appendChild(item(`<div class="chat-msg chat-msg--assistant">第 ${i} 段结论</div>`));
    }
    api.update(conversation);
    expect(conversation.querySelector(".tg-box")).toBeNull();
    expect(visibleItems()).toBe(4);
  });

  it("组内搜索按卡片正文筛", () => {
    for (const name of ["alpha.html", "beta.css", "gamma.js"]) {
      conversation.appendChild(item(`<div class="chat-artifacts">${name}</div>`));
    }
    api.update(conversation);
    conversation.querySelector(".tg-summary").click();
    expect(visibleItems()).toBe(3);

    const search = conversation.querySelector("input.tg-search");
    search.value = "beta";
    search.dispatchEvent(new window.Event("input"));
    expect(visibleItems()).toBe(1);
  });

  it("两段不同类型各自成组，不会串成一组", () => {
    for (let i = 0; i < 3; i++) conversation.appendChild(item(`<div class="chat-artifacts">a${i}</div>`));
    conversation.appendChild(item('<div class="chat-msg chat-msg--assistant">中间的结论</div>'));
    for (let i = 0; i < 3; i++) conversation.appendChild(item(`<div class="chat-activity">动作 ${i}</div>`));
    api.update(conversation);

    const texts = [...conversation.querySelectorAll(".tg-summary")].map((b) => b.textContent);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("产物卡 × 3");
    expect(texts[1]).toContain("动作提示 × 3");
  });
});

// ---------------------------------------------------------------
// 与 reading-mode 共处（同一个容器上的两个后处理器）
// ---------------------------------------------------------------

describe("T18 与 reading-mode 共处", () => {
  let conversation;
  let backBar;

  const item = (html) => {
    const el = document.createElement("div");
    el.className = "chat-item";
    el.innerHTML = html;
    return el;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    backBar = document.createElement("div");
    backBar.className = "back-bar";
    conversation = document.createElement("div");
    conversation.id = "conversation";
    document.body.appendChild(backBar);
    document.body.appendChild(conversation);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("★ 聚焦模式（T17 起是缺省）下：已被 reading-mode 藏掉的过程不会被再折一次", () => {
    conversation.appendChild(item('<div class="chat-msg chat-msg--user">问题</div>'));
    for (let i = 0; i < 4; i++) {
      conversation.appendChild(item('<details class="chat-thinking"><summary>Thought</summary></details>'));
    }
    conversation.appendChild(item('<div class="chat-msg chat-msg--assistant">结论</div>'));

    const rm = initReadingMode({}, { doc: document, storage: memStorage() });
    const tg = initTranscriptGrouping({}, { doc: document });
    rm.update(backBar, conversation); // 缺省聚焦：思考被藏、插一条 rm-summary
    expect(conversation.querySelectorAll(".rm-hidden:not(.chat-item)").length).toBe(4);

    tg.update(conversation);
    // 那 4 条已经归 reading-mode 管了，本模块不再插第二条摘要
    expect(conversation.querySelector(".tg-box")).toBeNull();
    // 而且没把 reading-mode 的成果撤掉
    expect(conversation.querySelectorAll(".rm-summary").length).toBe(1);
    expect(conversation.querySelectorAll(".rm-hidden:not(.chat-item)").length).toBe(4);
  });

  it("完整模式下：reading-mode 什么都不藏，本模块照常把连续思考折成一组", () => {
    conversation.appendChild(item('<div class="chat-msg chat-msg--user">问题</div>'));
    for (let i = 0; i < 4; i++) {
      conversation.appendChild(item('<details class="chat-thinking"><summary>Thought</summary></details>'));
    }
    const storage = memStorage();
    storage.setItem("agent-ui-reading-mode", "full");
    const rm = initReadingMode({}, { doc: document, storage });
    const tg = initTranscriptGrouping({}, { doc: document });
    rm.update(backBar, conversation);
    tg.update(conversation);

    expect(conversation.querySelector(".tg-summary").textContent).toContain("思考 × 4");
  });
});

// ---------------------------------------------------------------
// 宿主接线静态锁 + 样式令牌
// ---------------------------------------------------------------

describe("T18 宿主接线与样式", () => {
  const indexHtml = readFileSync(join(here, "..", "ui", "public", "index.html"), "utf8");
  const css = readFileSync(join(here, "..", "ui", "public", "styles.css"), "utf8");
  const src = readFileSync(join(here, "..", "ui", "public", "features", "transcript-grouping.js"), "utf8");

  it("宿主动态 import 本模块并在每次渲染后调 update", () => {
    expect(indexHtml).toMatch(/import\("\.\/features\/transcript-grouping\.js"\)/);
    expect(indexHtml).toMatch(/transcriptGroupingApi\.update\(/);
  });

  it("★ 调用顺序：必须排在 readingModeApi.update 之后", () => {
    const rmAt = indexHtml.indexOf("readingModeApi.update(");
    const tgAt = indexHtml.indexOf("transcriptGroupingApi.update(");
    expect(rmAt).toBeGreaterThan(-1);
    expect(tgAt).toBeGreaterThan(rmAt);
  });

  it("样式只用语义令牌，没有裸色值", () => {
    const block = css.slice(css.indexOf(".tg-box {"), css.indexOf(".settings-reading-mode {"));
    expect(block.length).toBeGreaterThan(200);
    expect(block, "不许写死颜色").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/var\(--border-1\)/);
    expect(block).toMatch(/\.tg-hidden\s*\{\s*display:\s*none\s*!important/);
  });

  it("不改事件流与 transcript 格式：模块不 import app.js，也不碰 fetch/EventSource", () => {
    expect(src).not.toMatch(/from\s+["']\.\.\/app\.js["']/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/EventSource/);
  });

  it("行折叠目标是白名单，不是「所有表格都折」——正文里的表是结论", () => {
    expect(ROW_GROUP_TARGETS.every((t) => t.selector.includes("chat-sources"))).toBe(true);
    expect(src).not.toMatch(/querySelectorAll\(["']table["']\)/);
  });
});
