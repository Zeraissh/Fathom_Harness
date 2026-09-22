// @vitest-environment jsdom
// @ts-nocheck
/**
 * 命令面板（features/command-palette.js）的回归锁——T3。
 *
 * 分层覆盖：
 *   纯函数层：模糊评分 / 命令过滤 / 会话匹配 / 分组组装 / 导航状态机 / 执行派发
 *   DOM 层  ：jsdom 里真实初始化，验证唤起、listbox 语义、键盘导航、焦点陷阱、关闭
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fuzzyScore,
  staticCommands,
  matchCommands,
  matchConversations,
  buildPaletteItems,
  moveActiveIndex,
  clampActiveIndex,
  executeItem,
  SHORTCUTS,
  initCommandPalette,
  PALETTE_PRIORITY,
  registerPaletteCommand,
  listExternalCommands,
} from "../ui/public/features/command-palette.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------
// 模糊评分
// ---------------------------------------------------------------
describe("fuzzyScore 子序列评分", () => {
  it("子序列命中给正分，非子序列返回 null", () => {
    expect(fuzzyScore("nc", "新建对话 new chat")).not.toBeNull();
    expect(fuzzyScore("暖炭", "主题：暖炭")).not.toBeNull(); // 中文逐字子序列
    expect(fuzzyScore("xyz", "新建对话")).toBeNull();
    expect(fuzzyScore("ab", "ba")).toBeNull(); // 顺序不对
  });

  it("空查询恒匹配（0 分），空文本不匹配非空查询", () => {
    expect(fuzzyScore("", "任意")).toBe(0);
    expect(fuzzyScore("  ", "任意")).toBe(0);
    expect(fuzzyScore("a", "")).toBeNull();
    expect(fuzzyScore(null, "x")).toBe(0);
  });

  it("大小写无关", () => {
    expect(fuzzyScore("ABC", "xxAbCxx")).not.toBeNull();
  });

  it("连续命中得分高于分散命中", () => {
    const consecutive = fuzzyScore("abc", "abc---");
    const scattered = fuzzyScore("abc", "a-b-c-");
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it("前缀命中得分高于中段命中", () => {
    const prefix = fuzzyScore("chat", "chat 对话");
    const middle = fuzzyScore("chat", "继续 chat 对话");
    expect(prefix).toBeGreaterThan(middle);
  });
});

// ---------------------------------------------------------------
// 静态命令清单（状态相关）
// ---------------------------------------------------------------
describe("staticCommands 按当前状态出可用项", () => {
  it("运行中 → 有「停止当前运行」，无「继续当前对话」", () => {
    const cmds = staticCommands({ currentRunId: "r1", currentRunStatus: "running" });
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain("stop-run");
    expect(ids).not.toContain("continue-run");
    expect(ids).toContain("new-chat");
    expect(ids).toContain("focus-search");
    expect(ids).toContain("help");
  });

  it("选中但已结束 → 有「继续当前对话」，无「停止当前运行」", () => {
    const cmds = staticCommands({ currentRunId: "r1", currentRunStatus: "done" });
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain("continue-run");
    expect(ids).not.toContain("stop-run");
  });

  it("无选中 → 停止与继续都不在", () => {
    const ids = staticCommands({}).map((c) => c.id);
    expect(ids).not.toContain("stop-run");
    expect(ids).not.toContain("continue-run");
  });

  it("四主题 + 跟随系统各一条，当前主题有 current 标记", () => {
    const cmds = staticCommands({ currentTheme: "dark" });
    const themes = cmds.filter((c) => c.id.startsWith("theme-"));
    expect(themes.map((t) => t.themeId)).toEqual(["auto", "light", "dark", "graphite", "contrast"]);
    expect(themes.find((t) => t.themeId === "dark").current).toBe(true);
    expect(themes.find((t) => t.themeId === "light").current).toBe(false);
  });
});

// ---------------------------------------------------------------
// 命令过滤
// ---------------------------------------------------------------
describe("matchCommands 命令过滤", () => {
  const all = staticCommands({ currentTheme: "auto" });

  it("空查询返回全量", () => {
    expect(matchCommands("", all)).toHaveLength(all.length);
    expect(matchCommands("   ", all)).toHaveLength(all.length);
  });

  it("关键词缩小范围且不含不相关项", () => {
    const hits = matchCommands("主题", all);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((c) => c.id.startsWith("theme-"))).toBe(true);
  });

  it("hint 也参与匹配", () => {
    const hits = matchCommands("快捷键", all);
    expect(hits.map((c) => c.id)).toContain("help");
  });

  it("完全不命中返回空数组", () => {
    expect(matchCommands("zzzzqqqq", all)).toEqual([]);
  });
});

// ---------------------------------------------------------------
// 会话模糊匹配
// ---------------------------------------------------------------
describe("matchConversations 会话匹配", () => {
  const conversations = [
    { runId: "r1", title: "修复登录页样式", workdir: "D:\\proj\\web", status: "done" },
    { runId: "r2", title: "写单元测试", workdir: "D:\\proj\\api", status: "running" },
    { runId: "r3", title: "登录接口联调", workdir: "D:\\proj\\api", status: "done" },
  ];

  it("空查询返回空（动态源只在有关键词时启用）", () => {
    expect(matchConversations("", conversations)).toEqual([]);
  });

  it("按标题命中，相关度高的排前", () => {
    const hits = matchConversations("登录", conversations);
    expect(hits.map((h) => h.runId)).toEqual(expect.arrayContaining(["r1", "r3"]));
    expect(hits.map((h) => h.runId)).not.toContain("r2");
  });

  it("按工作目录命中", () => {
    const hits = matchConversations("api", conversations);
    expect(hits.map((h) => h.runId).sort()).toEqual(["r2", "r3"]);
  });

  it("标题命中优先于仅目录命中", () => {
    const convs = [
      { runId: "a", title: "api 文档整理", workdir: "D:\\x" },
      { runId: "b", title: "周报", workdir: "D:\\proj\\api" },
    ];
    const hits = matchConversations("api", convs);
    expect(hits[0].runId).toBe("a");
  });

  it("遵守 limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      runId: `r${i}`,
      title: `测试任务 ${i}`,
      workdir: null,
    }));
    expect(matchConversations("测试", many, { limit: 5 })).toHaveLength(5);
  });
});

// ---------------------------------------------------------------
// 分组组装
// ---------------------------------------------------------------
describe("buildPaletteItems 分组扁平列表", () => {
  it("空查询：只有命令组，组标题为「命令」", () => {
    const { items, groups } = buildPaletteItems({
      query: "",
      commands: staticCommands({}),
      conversations: [{ runId: "r1", title: "任意", workdir: null }],
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.group === "command")).toBe(true);
    expect(groups).toEqual([{ key: "command", label: "命令", count: items.length }]);
  });

  it("有关键词：命令组在前、对话组在后", () => {
    const { items, groups } = buildPaletteItems({
      query: "主题",
      commands: staticCommands({}),
      conversations: [{ runId: "r1", title: "主题色调整", workdir: "D:\\x" }],
    });
    expect(groups.map((g) => g.key)).toEqual(["command", "conversation"]);
    const firstConv = items.findIndex((i) => i.group === "conversation");
    const lastCmd = items.map((i) => i.group).lastIndexOf("command");
    expect(firstConv).toBeGreaterThan(lastCmd);
    const conv = items[firstConv];
    expect(conv.kind).toBe("conversation");
    expect(conv.runId).toBe("r1");
  });

  it("两组都为空 → items 与 groups 都为空（空态由 DOM 层展示）", () => {
    const { items, groups } = buildPaletteItems({
      query: "zzzzqqqq",
      commands: staticCommands({}),
      conversations: [],
    });
    expect(items).toEqual([]);
    expect(groups).toEqual([]);
  });
});

// ---------------------------------------------------------------
// T19 高频命令补全 + 排序 + 关键词
// ---------------------------------------------------------------

/**
 * ★ 真因与计划原文不同，如实记：
 *
 * 计划与审视报告都说"面板只有 4 条命令（新建对话 / 搜索对话 / 快捷键帮助 /
 * 主题切换）"。读码后不成立——`currentItems()` 一直在 merge
 * `listExternalCommands()`，而宿主早就注册了十几条（设置 / 模型设置 / 消耗 /
 * 指挥中心 / 产物 / 定时任务 / 记忆 / 全局搜索 / 本次变更 / 预览产物 /
 * 打开网页 / 新手引导）。
 *
 * 真问题是**排序 + 限高滚动**：`staticCommands` 把 **5 条主题**排在全部外部
 * 命令之前，面板列表限高可滚动（截图里「主题：高对比」正卡在下边缘被截断）
 * ——于是首屏只看得见 3 条动作 + 5 条主题，报告据此判"只有 4 条"。
 *
 * 所以本项做三件事：① 主题压到最后（PALETTE_PRIORITY）；② 补计划点名里
 * **真正缺的那两条**（切换工作目录 / 切换 Work-Code 脸，其余四条早在）；
 * ③ 给每条命令加模糊搜索别名（英文 / 拼音 / 同义词）。
 */
describe("T19 命令面板：排序、条数与关键词", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexHtml = readFileSync(join(here, "..", "ui", "public", "index.html"), "utf8");

  /** 从 index.html 里把宿主注册的外部命令 id 全抓出来（静态分析——它们在单测里不会真跑） */
  function hostRegisteredIds() {
    const ids = [];
    const re = /registerPaletteCommand\(\{\s*[\s\S]{0,200}?id:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(indexHtml))) ids.push(m[1]);
    return ids;
  }

  it("★ 排序：空查询下，任何主题项都不许排在功能入口之前", () => {
    const all = [
      ...staticCommands({ currentRunId: "r1", currentRunStatus: "running" }),
      { id: "open-settings", label: "打开设置", priority: PALETTE_PRIORITY.entry },
      { id: "open-board", label: "指挥中心", priority: PALETTE_PRIORITY.entry },
    ];
    const ordered = matchCommands("", all);
    const firstTheme = ordered.findIndex((c) => c.id.startsWith("theme-"));
    const lastEntry = ordered.map((c) => c.priority).lastIndexOf(PALETTE_PRIORITY.entry);
    expect(firstTheme).toBeGreaterThan(-1);
    expect(lastEntry).toBeGreaterThan(-1);
    expect(firstTheme, "主题必须在全部功能入口之后").toBeGreaterThan(lastEntry);
    // 高频动作仍在最前
    expect(ordered[0].id).toBe("new-chat");
    expect(ordered.slice(0, 3).map((c) => c.id)).toContain("stop-run");
  });

  it("★ 排序只在空查询下生效——有查询时相关性说话，不许被档位压过", () => {
    const all = staticCommands({ currentTheme: "auto" });
    const hits = matchCommands("暖炭", all);
    expect(hits[0].id).toBe("theme-dark"); // chrome 档，但它最相关
  });

  it("★ 计划点名的六条能力，面板里都有（四条早在、两条本轮补）", () => {
    const hostIds = hostRegisteredIds();
    const staticIds = staticCommands({ currentRunId: "r1", currentRunStatus: "running" }).map((c) => c.id);
    const has = (id) => hostIds.includes(id) || staticIds.includes(id);
    expect(has("switch-workdir"), "切换工作目录（本轮补）").toBe(true);
    expect(has("toggle-workspace-face"), "切换 Work/Code 脸（本轮补）").toBe(true);
    expect(has("open-settings"), "打开设置（早在）").toBe(true);
    expect(has("stop-run"), "停止当前运行（早在）").toBe(true);
    expect(has("open-board"), "跳运行指挥中心（早在）").toBe(true);
    expect(has("view-memory"), "查看记忆面板（早在）").toBe(true);
  });

  it("★ 命令总条数 ≥ 10（不含主题——主题凑数不算高频命令）", () => {
    const nonTheme = staticCommands({ currentRunId: "r1", currentRunStatus: "running" })
      .filter((c) => !c.id.startsWith("theme-"));
    const total = nonTheme.length + new Set(hostRegisteredIds()).size;
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it("★ 每条命令都有可命中的模糊搜索关键词：拿自己的标题去搜必须搜得到自己", () => {
    const all = staticCommands({ currentRunId: "r1", currentRunStatus: "running" });
    for (const cmd of all) {
      const hits = matchCommands(cmd.label, all);
      expect(hits.map((c) => c.id), `搜「${cmd.label}」搜不到自己`).toContain(cmd.id);
    }
  });

  it("★ 关键词（英文/拼音/同义词）参与匹配，且不压过正牌标题", () => {
    const all = staticCommands({ currentRunId: "r1", currentRunStatus: "running" });
    expect(matchCommands("stop", all).map((c) => c.id)).toContain("stop-run");
    expect(matchCommands("tingzhi", all).map((c) => c.id)).toContain("stop-run");
    expect(matchCommands("中止", all).map((c) => c.id)).toContain("stop-run");
    expect(matchCommands("theme", all).every((c) => c.id.startsWith("theme-"))).toBe(true);
  });

  /**
   * ★ 变异验证逼出来的一条：原本想用「搜标题时标题那条排第一」证明"别名打 1 折"，
   * 但静态清单里没有任何命令的**别名**会撞上另一条的**标题**，所以把折扣改成
   * 加成（`k - 1` → `k + 20`）照样全绿——判据对这个形态完全不敏感。
   * 这里把冲突显式造出来：甲的标题 = 乙的别名，同一个查询下甲必须在前。
   */
  it("★ 别名打折是可判的：标题命中必须压过同字面的别名命中", () => {
    const pair = [
      { id: "t19-title", label: "打开设置" },
      { id: "t19-alias", label: "无关命令", keywords: ["打开设置"] },
    ];
    const hits = matchCommands("打开设置", pair);
    expect(hits.map((c) => c.id)).toEqual(["t19-title", "t19-alias"]);
  });

  it("宿主注册的两条新命令带了关键词与动作档位（不是光有 label）", () => {
    for (const id of ["switch-workdir", "toggle-workspace-face"]) {
      const at = indexHtml.indexOf(`id: "${id}"`);
      expect(at, id).toBeGreaterThan(-1);
      const block = indexHtml.slice(at, at + 700);
      expect(block, `${id} 缺 keywords`).toMatch(/keywords:\s*\[/);
      expect(block, `${id} 缺 priority`).toMatch(/priority:\s*palette\.PALETTE_PRIORITY\.action/);
      expect(block, `${id} 缺 run`).toMatch(/run:\s*\(\)\s*=>/);
    }
  });

  it("registerPaletteCommand 透传 keywords；priority 缺省落 entry 档", () => {
    const off1 = registerPaletteCommand({ id: "t19-a", label: "甲", keywords: ["alpha"] });
    const off2 = registerPaletteCommand({ id: "t19-b", label: "乙" });
    try {
      const list = listExternalCommands();
      const a = list.find((c) => c.id === "t19-a");
      const b = list.find((c) => c.id === "t19-b");
      expect(a.keywords).toEqual(["alpha"]);
      expect(a.priority).toBe(PALETTE_PRIORITY.entry);
      expect(b.keywords).toBeUndefined();
      expect(b.priority).toBe(PALETTE_PRIORITY.entry);
      expect(matchCommands("alpha", list).map((c) => c.id)).toContain("t19-a");
    } finally {
      off1();
      off2();
    }
  });
});

// ---------------------------------------------------------------
// 键盘导航状态机
// ---------------------------------------------------------------
describe("导航状态机 moveActiveIndex / clampActiveIndex", () => {
  it("空列表恒为 -1", () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
    expect(clampActiveIndex(3, 0)).toBe(-1);
  });

  it("环形：末尾再向下回到 0，0 向上到末尾", () => {
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
  });

  it("无激活（-1）时向下落在 0，向上环形到末尾", () => {
    expect(moveActiveIndex(-1, 1, 5)).toBe(0);
    expect(moveActiveIndex(-1, -1, 5)).toBe(4);
  });

  it("列表缩短后钳位到最后一项", () => {
    expect(clampActiveIndex(7, 3)).toBe(2);
    expect(clampActiveIndex(-1, 3)).toBe(0);
  });
});

// ---------------------------------------------------------------
// 执行派发
// ---------------------------------------------------------------
describe("executeItem 回调派发", () => {
  function makeHost() {
    return {
      onOpenConversation: vi.fn(),
      onNewChat: vi.fn(),
      onStopRun: vi.fn(),
      onContinueRun: vi.fn(),
      onFocusSearch: vi.fn(),
      onSelectTheme: vi.fn(),
      onToggleHelp: vi.fn(),
    };
  }

  it("会话条目 → onOpenConversation(runId)，消费关闭", () => {
    const host = makeHost();
    const consumed = executeItem({ kind: "conversation", runId: "r9" }, host);
    expect(consumed).toBe(true);
    expect(host.onOpenConversation).toHaveBeenCalledWith("r9");
  });

  it("静态命令各自落到对应回调", () => {
    const host = makeHost();
    executeItem({ kind: "new-chat" }, host);
    executeItem({ kind: "stop-run" }, host);
    executeItem({ kind: "continue-run" }, host);
    executeItem({ kind: "focus-search" }, host);
    expect(host.onNewChat).toHaveBeenCalledOnce();
    expect(host.onStopRun).toHaveBeenCalledOnce();
    expect(host.onContinueRun).toHaveBeenCalledOnce();
    expect(host.onFocusSearch).toHaveBeenCalledOnce();
  });

  it("主题条目 → onSelectTheme(themeId)", () => {
    const host = makeHost();
    executeItem({ kind: "theme", themeId: "graphite" }, host);
    expect(host.onSelectTheme).toHaveBeenCalledWith("graphite");
  });

  it("帮助条目展开浮层但不关闭面板（返回 false）", () => {
    const host = makeHost();
    expect(executeItem({ kind: "help" }, host)).toBe(false);
    expect(host.onToggleHelp).toHaveBeenCalledOnce();
  });

  it("未知条目安全返回 false", () => {
    expect(executeItem({ kind: "nope" }, makeHost())).toBe(false);
    expect(executeItem(null, makeHost())).toBe(false);
  });
});

// ---------------------------------------------------------------
// DOM 层：jsdom 真实初始化
// ---------------------------------------------------------------
describe("initCommandPalette DOM 行为", () => {
  const conversations = [
    { runId: "r1", title: "修复登录页样式", workdir: "D:\\proj\\web", status: "done" },
    { runId: "r2", title: "写单元测试", workdir: "D:\\proj\\api", status: "running" },
  ];
  let host;

  beforeEach(() => {
    document.body.innerHTML = '<input id="run-search" /><button id="palette-open-btn"></button><textarea id="task-input"></textarea>';
    host = {
      getConversations: () => conversations,
      getCurrentRun: () => ({ runId: "r2", status: "running" }),
      getTheme: () => "light",
      onOpenConversation: vi.fn(),
      onNewChat: vi.fn(),
      onStopRun: vi.fn(),
      onContinueRun: vi.fn(),
      onFocusSearch: vi.fn(),
      onSelectTheme: vi.fn(),
      onAnnounce: vi.fn(),
    };
  });

  function keydown(target, init) {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  }

  function paletteEls() {
    return {
      overlay: document.getElementById("command-palette"),
      input: document.querySelector(".palette-input"),
      list: document.getElementById("command-palette-list"),
    };
  }

  it("Ctrl+K 唤起：role=dialog / aria-modal / 输入框自动聚焦", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { overlay, input, list } = paletteEls();
    expect(overlay.hidden).toBe(false);
    const dialog = overlay.querySelector("[role=dialog]");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(list.getAttribute("role")).toBe("listbox");
    // 选项具备 option 语义
    expect(list.querySelectorAll("[role=option]").length).toBeGreaterThan(0);
  });

  it("Cmd+K（metaKey）同样唤起；再按一次关闭", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", metaKey: true });
    expect(paletteEls().overlay.hidden).toBe(false);
    keydown(document.body, { key: "k", metaKey: true });
    expect(paletteEls().overlay.hidden).toBe(true);
  });

  it("输入框聚焦时 Ctrl+K 也能唤起（不被输入框吃掉）", () => {
    initCommandPalette(host);
    const other = document.getElementById("task-input");
    other.focus();
    keydown(other, { key: "k", ctrlKey: true });
    expect(paletteEls().overlay.hidden).toBe(false);
  });

  it("运行中的当前对话 → 列表里有「停止当前运行」并标记当前主题", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const labels = [...document.querySelectorAll(".palette-item-label")].map((el) => el.textContent);
    expect(labels).toContain("停止当前运行");
    expect(labels).not.toContain("继续当前对话");
    const current = document.querySelector(".palette-item-current");
    expect(current).not.toBeNull();
  });

  /**
   * ★ T19「键盘全程可达」的行为锁。
   *
   * 纯函数验的是 moveActiveIndex 的环形算术；这一条走真实 DOM：注册两条
   * 外部命令让列表足够长（≥10），只用 ArrowDown 一路走到最后一项，
   * 再 Enter 执行——证明**排在主题之后的外部命令也能只靠键盘摸到并触发**
   * （面板限高滚动，鼠标看不见的那些正是这些）。
   */
  it("★ T19 键盘全程可达：ArrowDown 能走到主题之后的外部命令并 Enter 执行", () => {
    const ran = vi.fn();
    const off = registerPaletteCommand({
      id: "t19-kbd",
      label: "键盘可达探针",
      hint: "只靠方向键应当摸得到",
      keywords: ["kbd"],
      run: ran,
    });
    try {
      initCommandPalette(host);
      keydown(document.body, { key: "k", ctrlKey: true });
      const { input, list } = paletteEls();
      const options = () => [...list.querySelectorAll("[role=option]")];
      expect(options().length).toBeGreaterThanOrEqual(10);

      // 只用方向键：一路走到那条外部命令
      const targetAt = options().findIndex((el) => el.textContent.includes("键盘可达探针"));
      expect(targetAt, "外部命令没进列表").toBeGreaterThan(-1);
      for (let i = 0; i < targetAt; i++) keydown(input, { key: "ArrowDown" });
      expect(options()[targetAt].getAttribute("aria-selected")).toBe("true");

      keydown(input, { key: "Enter" });
      expect(ran).toHaveBeenCalledTimes(1);
      expect(paletteEls().overlay.hidden).toBe(true);
    } finally {
      off();
    }
  });

  it("输入关键词 → 出现「对话」分组，Enter 派发到 onOpenConversation", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { input, list } = paletteEls();
    input.value = "单元测试";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const groups = [...list.querySelectorAll(".palette-group")].map((el) => el.textContent);
    expect(groups).toContain("对话");
    // 下移到「对话」组的第一项
    const items = [...list.querySelectorAll(".palette-item")];
    const convIdx = items.findIndex((el) => el.querySelector(".palette-item-label").textContent.includes("单元测试"));
    expect(convIdx).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < convIdx; i++) keydown(input, { key: "ArrowDown" });
    keydown(input, { key: "Enter" });
    expect(host.onOpenConversation).toHaveBeenCalledWith("r2");
    // 执行后面板关闭
    expect(paletteEls().overlay.hidden).toBe(true);
  });

  it("↑↓ 导航维护 aria-activedescendant 与 aria-selected", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { input, list } = paletteEls();
    const options = list.querySelectorAll("[role=option]");
    // 初始激活第 0 项
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    keydown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    expect(options[0].getAttribute("aria-selected")).toBe("false");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    // 环形：0 向上到末尾
    keydown(input, { key: "ArrowUp" });
    keydown(input, { key: "ArrowUp" });
    const last = options[options.length - 1];
    expect(input.getAttribute("aria-activedescendant")).toBe(last.id);
  });

  it("无匹配显示空态文案", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { input } = paletteEls();
    input.value = "zzzzqqqq";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const empty = document.querySelector(".palette-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("没有匹配");
  });

  it("Esc 关闭并把焦点还给打开前的元素", () => {
    initCommandPalette(host);
    const before = document.getElementById("task-input");
    before.focus();
    keydown(document.body, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(paletteEls().input);
    keydown(paletteEls().input, { key: "Escape" });
    expect(paletteEls().overlay.hidden).toBe(true);
    expect(document.activeElement).toBe(before);
  });

  it("点击遮罩关闭，点击对话框不关闭", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { overlay } = paletteEls();
    overlay.querySelector(".palette-dialog").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(overlay.hidden).toBe(false);
    overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(overlay.hidden).toBe(true);
  });

  it("Tab 焦点陷阱：只在输入框与关闭按钮之间循环", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { input, overlay } = paletteEls();
    const closeBtn = overlay.querySelector(".palette-close");
    expect(document.activeElement).toBe(input);
    keydown(overlay, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);
    keydown(overlay, { key: "Tab" });
    expect(document.activeElement).toBe(input);
    keydown(overlay, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("侧栏入口按钮点击也能打开", () => {
    initCommandPalette(host);
    document.getElementById("palette-open-btn").click();
    expect(paletteEls().overlay.hidden).toBe(false);
  });

  it("「快捷键帮助」在面板内展开浮层，面板不关；Esc 先收帮助再收面板", () => {
    initCommandPalette(host);
    keydown(document.body, { key: "k", ctrlKey: true });
    const { input } = paletteEls();
    input.value = "快捷键帮助";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    keydown(input, { key: "Enter" });
    const { overlay } = paletteEls();
    expect(overlay.hidden).toBe(false); // 不关面板
    const help = overlay.querySelector(".palette-help");
    expect(help.hidden).toBe(false);
    expect(help.textContent).toContain("Ctrl");
    expect(SHORTCUTS.length).toBeGreaterThan(0);
    keydown(input, { key: "Escape" });
    expect(help.hidden).toBe(true);
    expect(overlay.hidden).toBe(false);
    keydown(input, { key: "Escape" });
    expect(overlay.hidden).toBe(true);
  });

  it("重复初始化幂等：不重复挂 DOM", () => {
    initCommandPalette(host);
    initCommandPalette(host);
    expect(document.querySelectorAll("#command-palette")).toHaveLength(1);
  });
});
