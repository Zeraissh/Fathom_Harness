// @vitest-environment jsdom
// @ts-nocheck
/**
 * 变更审查视图（features/changes-panel.js）的回归锁——T8。
 *
 * 分层覆盖：
 *   纯函数层：响应整形 / 文本预览判定 / 前 N 行截取 / 徽章派生
 *   DOM 层  ：jsdom 里真实初始化 + 注入 fetchFn，验证 rail 分区渲染
 *             （路径/徽章/元信息）、展开预览（前 100 行 + 截断标注）、
 *             空态、404/500 降级、mount re-parent、幂等
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeChanges,
  optionalNumber,
  isTextPreviewable,
  firstLines,
  badgesForEntry,
  CHANGES_COPY,
  PREVIEW_MAX_LINES,
  initChangesPanel,
} from "../ui/public/features/changes-panel.js";

const NOW = 1_700_000_000_000;

// ---------------------------------------------------------------
// 纯函数层
// ---------------------------------------------------------------
describe("normalizeChanges 响应整形", () => {
  it("合法负载原样通过，非法字段降级", () => {
    const out = normalizeChanges({
      runId: "r1",
      workdir: "/proj",
      git: true,
      changes: [
        {
          path: "src/a.ts", ops: ["write", "edit"], count: 3, lastAt: NOW,
          outOfScope: false, exists: true, sizeBytes: 100, mtimeMs: NOW - 1000,
          git: { status: "M", added: 5, deleted: 2 },
        },
        { path: "b.bin", ops: ["write"], count: "bad", lastAt: "bad", git: null },
      ],
    });
    expect(out.runId).toBe("r1");
    expect(out.git).toBe(true);
    expect(out.changes).toHaveLength(2);
    expect(out.changes[0]).toMatchObject({
      path: "src/a.ts", ops: ["write", "edit"], count: 3,
      git: { status: "M", added: 5, deleted: 2 },
    });
    // 数字字段非法 → null/0，不抛
    expect(out.changes[1].count).toBe(0);
    expect(out.changes[1].lastAt).toBeNull();
    expect(out.changes[1].git).toBeNull();
  });

  it("畸形负载降级为空列表；无路径条目被过滤", () => {
    expect(normalizeChanges(null)).toEqual({ runId: null, workdir: null, git: false, changes: [] });
    expect(normalizeChanges({ changes: [{ ops: ["write"] }, 42, { path: "ok.txt" }] }).changes)
      .toHaveLength(1);
    // git 形状不合法 → null
    expect(normalizeChanges({ changes: [{ path: "a", git: { added: 1 } }] }).changes[0].git).toBeNull();
  });

  it("JSON null 数字字段保持 null——Number(null)===0 不得把未跟踪文件画成 +0/-0", () => {
    expect(optionalNumber(null)).toBeNull();
    expect(optionalNumber(undefined)).toBeNull();
    expect(optionalNumber("")).toBeNull();
    expect(optionalNumber(0)).toBe(0);
    const out = normalizeChanges({
      changes: [{
        path: "ui-brand-fathom/index.html",
        ops: ["write"],
        count: 1,
        lastAt: null,
        sizeBytes: null,
        mtimeMs: null,
        git: { status: "??", added: null, deleted: null },
      }],
    });
    expect(out.changes[0].lastAt).toBeNull();
    expect(out.changes[0].sizeBytes).toBeNull();
    expect(out.changes[0].git).toEqual({ status: "??", added: null, deleted: null });
    expect(badgesForEntry(out.changes[0]).diff).toBeNull();
  });
});

describe("isTextPreviewable 文本预览判定", () => {
  it("常见文本扩展名放行，二进制不放行", () => {
    expect(isTextPreviewable("src/main.ts")).toBe(true);
    expect(isTextPreviewable("README.MD")).toBe(true);
    expect(isTextPreviewable("a/b/c.jsonl")).toBe(true);
    expect(isTextPreviewable("img/logo.png")).toBe(false);
    expect(isTextPreviewable("dist/app.exe")).toBe(false);
  });

  it("无扩展名的知名文本文件名放行", () => {
    expect(isTextPreviewable("Makefile")).toBe(true);
    expect(isTextPreviewable("dir/Dockerfile")).toBe(true);
    expect(isTextPreviewable("randomfile")).toBe(false);
  });
});

describe("firstLines 预览截取", () => {
  it("行数不超上限原样返回；超出截断并标注", () => {
    const short = firstLines("a\nb\nc", 100);
    expect(short.truncated).toBe(false);
    expect(short.text).toBe("a\nb\nc");
    const long = Array.from({ length: 150 }, (_, i) => `L${i + 1}`).join("\n");
    const cut = firstLines(long, 100);
    expect(cut.truncated).toBe(true);
    expect(cut.totalLines).toBe(150);
    expect(cut.text.split("\n")).toHaveLength(100);
    expect(cut.text.endsWith("L100")).toBe(true);
  });
});

describe("badgesForEntry 徽章派生", () => {
  it("ops 去重保序；git 状态映射到已知徽章；diff 摘要拼接", () => {
    const { ops, git, diff } = badgesForEntry({
      path: "a.ts", ops: ["edit", "write", "edit"], count: 3, lastAt: null,
      outOfScope: false, exists: true, sizeBytes: 1, mtimeMs: null,
      git: { status: "M", added: 5, deleted: 2 },
    });
    expect(ops.map((b) => b.label)).toEqual(["修改", "写入"]);
    expect(git.label).toBe("M");
    expect(diff).toBe("+5/-2");
  });

  it("无 git 或无增删数时 diff 为 null；未知状态原样透出", () => {
    const untracked = badgesForEntry({
      path: "n.txt", ops: ["write"], count: 1, lastAt: null,
      outOfScope: false, exists: true, sizeBytes: 1, mtimeMs: null,
      git: { status: "??", added: null, deleted: null },
    });
    expect(untracked.git.label).toBe("??");
    expect(untracked.diff).toBeNull();
    const emptyStat = badgesForEntry({
      path: "same.ts", ops: ["write"], count: 1, lastAt: null,
      outOfScope: false, exists: true, sizeBytes: 1, mtimeMs: null,
      git: { status: "??", added: 0, deleted: 0 },
    });
    expect(emptyStat.diff, "+0/-0 没有信息，不画").toBeNull();
    const unknown = badgesForEntry({
      path: "r.txt", ops: ["write"], count: 1, lastAt: null,
      outOfScope: false, exists: true, sizeBytes: 1, mtimeMs: null,
      git: { status: "R", added: null, deleted: null },
    });
    expect(unknown.git.label).toBe("R");
    const noGit = badgesForEntry({
      path: "x.txt", ops: ["write"], count: 1, lastAt: null,
      outOfScope: false, exists: true, sizeBytes: 1, mtimeMs: null, git: null,
    });
    expect(noGit.git).toBeNull();
    expect(noGit.diff).toBeNull();
  });
});

// ---------------------------------------------------------------
// DOM 层
// ---------------------------------------------------------------
function mockJsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function mockTextResponse(status, text) {
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const LIST_PAYLOAD = {
  runId: "r1",
  workdir: "/proj",
  git: true,
  changes: [
    {
      path: "src/app.ts", ops: ["write", "edit"], count: 3, lastAt: NOW - 5000,
      outOfScope: false, exists: true, sizeBytes: 2048, mtimeMs: NOW - 60_000,
      git: { status: "M", added: 12, deleted: 4 },
    },
    {
      path: "notes/new.md", ops: ["write"], count: 1, lastAt: NOW - 3000,
      outOfScope: false, exists: true, sizeBytes: 120, mtimeMs: NOW - 30_000,
      git: { status: "??", added: null, deleted: null },
    },
    {
      path: "../escape.txt", ops: ["write"], count: 1, lastAt: NOW - 1000,
      outOfScope: true, exists: false, sizeBytes: null, mtimeMs: null, git: null,
    },
  ],
};

/** 等待面板内出现满足条件的节点（load/fillPreview 是异步的） */
async function waitFor(fn, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value && (typeof value.length !== "number" || value.length > 0)) return value;
    if (Date.now() > deadline) throw new Error("waitFor 超时");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("initChangesPanel DOM 层", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  function mountApi(fetchFn) {
    const rail = document.createElement("div");
    rail.className = "rail-body";
    document.body.appendChild(rail);
    const api = initChangesPanel({}, { fetchFn, now: () => NOW });
    api.mount(rail);
    return { api, rail };
  }

  it("setRun 拉取变更列表并渲染路径 / 徽章 / 元信息", async () => {
    const fetchFn = vi.fn(async (url) => mockJsonResponse(200, LIST_PAYLOAD));
    const { api } = mountApi(fetchFn);
    api.setRun("r1");
    const rows = await waitFor(() => document.querySelectorAll(".chg-row"));
    expect(rows).toHaveLength(3);
    expect(fetchFn).toHaveBeenCalledWith("/api/runs/r1/changes");

    const first = rows[0];
    expect(first.querySelector(".chg-path").textContent).toBe("src/app.ts");
    // 写入 + 修改两个 op 徽章、git M 徽章、+12/-4 摘要、触碰次数、大小
    const badgeText = first.querySelector(".chg-badges").textContent;
    expect(badgeText).toContain("写入");
    expect(badgeText).toContain("修改");
    expect(badgeText).toContain("M");
    expect(badgeText).toContain("+12/-4");
    const meta = first.querySelector(".chg-meta").textContent;
    expect(meta).toContain("触碰 3 次");
    expect(meta).toContain("2.0 KB");
    expect(meta).toContain("分钟前");

    // 未跟踪新文件：?? 徽章在，不画假的 +0/-0
    expect(rows[1].querySelector(".chg-git-badge").textContent).toBe("??");
    expect(rows[1].querySelector(".chg-diff")).toBeNull();
    expect(rows[1].querySelector(".chg-badges").textContent).not.toContain("+0/-0");
    // 越界路径：不可展开（非 button），meta 标注越界
    expect(rows[2].querySelector("button.chg-row-head")).toBeNull();
    expect(rows[2].querySelector(".chg-meta").textContent).toContain("越出");
    // 分区计数徽标
    expect(document.querySelector(".changes-section .aside-peek").textContent).toBe("3");
  });

  it("展开文本文件拉取 artifact 预览，超 100 行截断并标注", async () => {
    const longText = Array.from({ length: 120 }, (_, i) => `line-${i + 1}`).join("\n");
    const fetchFn = vi.fn(async (url) => {
      if (url === "/api/runs/r1/changes") return mockJsonResponse(200, LIST_PAYLOAD);
      if (url.startsWith("/api/runs/r1/artifact")) return mockTextResponse(200, longText);
      return mockJsonResponse(404, {});
    });
    const { api } = mountApi(fetchFn);
    api.setRun("r1");
    const rows = await waitFor(() => document.querySelectorAll(".chg-row"));
    rows[0].querySelector("button.chg-row-head").click();

    const pre = await waitFor(() => document.querySelector(".chg-preview-code"));
    expect(fetchFn).toHaveBeenCalledWith(
      `/api/runs/r1/artifact?path=${encodeURIComponent("src/app.ts")}`,
    );
    expect(pre.textContent.split("\n")).toHaveLength(PREVIEW_MAX_LINES);
    expect(pre.textContent.endsWith(`line-${PREVIEW_MAX_LINES}`)).toBe(true);
    const note = document.querySelector(".chg-preview-note");
    expect(note.textContent).toBe(CHANGES_COPY.previewTruncated(PREVIEW_MAX_LINES));
    // 再点一次收起
    document.querySelector("button.chg-row-head").click();
    expect(document.querySelector(".chg-preview-code")).toBeNull();
  });

  it("预览失败降级为行内错误文案", async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === "/api/runs/r1/changes") return mockJsonResponse(200, LIST_PAYLOAD);
      return mockTextResponse(404, "");
    });
    const { api } = mountApi(fetchFn);
    api.setRun("r1");
    const rows = await waitFor(() => document.querySelectorAll(".chg-row"));
    rows[0].querySelector("button.chg-row-head").click();
    const preview = await waitFor(() => {
      const el = document.querySelector(".chg-preview");
      return el && el.textContent.includes(CHANGES_COPY.previewError(404)) ? el : null;
    });
    expect(preview.textContent).toBe(CHANGES_COPY.previewError(404));
  });

  it("空态：无写盘操作的 run 展示引导文案", async () => {
    const fetchFn = vi.fn(async () =>
      mockJsonResponse(200, { runId: "r2", workdir: "/proj", git: false, changes: [] }));
    const { api } = mountApi(fetchFn);
    api.setRun("r2");
    const hint = await waitFor(() => {
      const el = document.querySelector(".chg-hint");
      return el && el.textContent === CHANGES_COPY.empty ? el : null;
    });
    expect(hint).toBeDefined();
    expect(document.querySelector(".changes-section .aside-peek").hidden).toBe(true);
  });

  it("API 空但本场有写出文件时只列文件，不说没有写盘", async () => {
    const fetchFn = vi.fn(async () =>
      mockJsonResponse(200, { runId: "r3", workdir: "/proj", git: false, changes: [] }));
    const { api } = mountApi(fetchFn);
    api.setRun("r3");
    await waitFor(() => {
      const el = document.querySelector(".chg-hint");
      return el && el.textContent === CHANGES_COPY.empty ? el : null;
    });
    api.setKnownWrites([{ path: "hello-verify-ask.txt", writes: 1 }]);
    const rows = await waitFor(() => document.querySelectorAll(".chg-row"));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("hello-verify-ask.txt");
    expect(document.body.textContent).not.toContain(CHANGES_COPY.empty);
    expect(document.querySelector(".chg-hint")).toBeNull();
  });

  it("错误态：404 说档案不存在，其它失败用人话", async () => {
    const fetchFn = vi.fn(async () => mockJsonResponse(404, { error: "nope" }));
    const { api } = mountApi(fetchFn);
    api.setRun("gone");
    await waitFor(() => document.querySelector(".chg-error"));
    expect(document.querySelector(".chg-error").textContent).toBe(CHANGES_COPY.runGone);
    expect(api.getState().status).toBe("error");
  });

  /**
   * T14：服务端给 /changes 加了 `?workdir=` 口径校验，这里是宿主这一侧的渲染锁。
   * 「加字段必须同一个提交把宿主接上并补一条渲染锁」——不接的话，服务端那道
   * 校验永远不会被触发，等于白加。
   */
  it("T14 setRun 带上这场运行自己的目录，拼进 ?workdir=", async () => {
    const fetchFn = vi.fn(async () => mockJsonResponse(200, LIST_PAYLOAD));
    const { api } = mountApi(fetchFn);
    api.setRun("r1", "D:/Work/scratch/liquid demo");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 3);
    expect(fetchFn).toHaveBeenCalledWith(
      `/api/runs/r1/changes?workdir=${encodeURIComponent("D:/Work/scratch/liquid demo")}`,
    );
  });

  it("T14 不给目录时 URL 不变（旧调用方与不知道目录的场景都照旧）", async () => {
    const fetchFn = vi.fn(async () => mockJsonResponse(200, LIST_PAYLOAD));
    const { api } = mountApi(fetchFn);
    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 3);
    expect(fetchFn).toHaveBeenCalledWith("/api/runs/r1/changes");
  });

  it("T14 目录对不上时照抄服务端那句具体原因，不拿通用文案盖过去", async () => {
    const serverSaid = '这次运行的工作目录是 "D:/a"，与请求里的 "D:/b" 不同';
    const fetchFn = vi.fn(async () =>
      mockJsonResponse(400, { error: serverSaid, runWorkdir: "D:/a" }));
    const { api } = mountApi(fetchFn);
    api.setRun("r1", "D:/b");
    await waitFor(() => document.querySelector(".chg-error"));
    expect(document.querySelector(".chg-error").textContent).toBe(serverSaid);
    expect(document.querySelector(".chg-error").textContent)
      .not.toBe(CHANGES_COPY.listError(400));
  });

  it("setRun(null) 收起分区；换 run 清空旧数据并重新加载", async () => {
    const fetchFn = vi.fn(async (url) => {
      if (url === "/api/runs/r1/changes") return mockJsonResponse(200, LIST_PAYLOAD);
      return mockJsonResponse(200, { runId: "r2", workdir: "/proj", git: false, changes: [] });
    });
    const { api } = mountApi(fetchFn);
    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 3);
    api.setRun(null);
    expect(api.element.hidden).toBe(true);
    expect(api.getState().changes).toEqual([]);

    api.setRun("r2");
    await waitFor(() => document.querySelector(".chg-hint"));
    expect(api.element.hidden).toBe(false);
  });

  it("mount 把分区 re-parent 到新骨架（换 run 重建详情页的形态）", async () => {
    const fetchFn = vi.fn(async () => mockJsonResponse(200, LIST_PAYLOAD));
    const { api, rail } = mountApi(fetchFn);
    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 3);

    // 模拟 app.js 骨架重建：旧 rail-body 整个换掉
    const newRail = document.createElement("div");
    newRail.className = "rail-body";
    document.body.appendChild(newRail);
    rail.remove();
    api.mount(newRail);
    expect(newRail.querySelector(".changes-section")).toBe(api.element);
    // 已加载的数据不丢
    expect(api.getState().changes).toHaveLength(3);
    expect(newRail.querySelectorAll(".chg-row")).toHaveLength(3);
  });

  it("reveal：无选中会话返回 false；有则展开并播报", async () => {
    const onAnnounce = vi.fn();
    const fetchFn = vi.fn(async () => mockJsonResponse(200, LIST_PAYLOAD));
    const rail = document.createElement("div");
    document.body.appendChild(rail);
    const api = initChangesPanel({ onAnnounce }, { fetchFn, now: () => NOW });
    api.mount(rail);
    expect(api.reveal()).toBe(false);

    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 3);
    api.element.open = false;
    expect(api.reveal()).toBe(true);
    expect(api.element.open).toBe(true);
    expect(api.element.classList.contains("changes-section--flash")).toBe(true);
    expect(onAnnounce).toHaveBeenCalled();
  });

  it("幂等：重复初始化返回既有实例，不重复挂 DOM", async () => {
    const fetchFn = vi.fn(async () => mockJsonResponse(200, LIST_PAYLOAD));
    const rail = document.createElement("div");
    document.body.appendChild(rail);
    const first = initChangesPanel({}, { fetchFn, now: () => NOW });
    first.mount(rail);
    const second = initChangesPanel({}, { fetchFn, now: () => NOW });
    expect(second).toBe(first);
    expect(document.querySelectorAll(".changes-section")).toHaveLength(1);
  });
});

// ---- P4: 展开一行时给「改了哪几行」----
describe("P4 变更面板的逐行改动", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { document.body.innerHTML = ""; });

  function mount(fetchFn, host = {}) {
    const rail = document.createElement("div");
    rail.className = "rail-body";
    document.body.appendChild(rail);
    const api = initChangesPanel(host, { fetchFn, now: () => NOW });
    api.mount(rail);
    return api;
  }
  const base = { runId: "r1", workdir: "D:/w", git: false, changes: [
    { path: "src/app.ts", ops: ["edit"], count: 1, exists: true, sizeBytes: 10, mtimeMs: NOW },
  ] };

  it("有逐行改动时展开先给「改动 N 处」，含 - 与 + 两种行", async () => {
    const fetchFn = vi.fn(async (url) => (
      String(url).includes("/changes") ? mockJsonResponse(200, base) : mockTextResponse(200, "let x = 2")
    ));
    const api = mount(fetchFn, {
      getEditHunks: () => [{ oldText: "let x = 1", newText: "let x = 2" }],
    });
    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 1);
    document.querySelector(".chg-row-head").click();
    const box = await waitFor(() => document.querySelector(".chg-hunks"));
    expect(box.querySelector(".chg-hunks-title").textContent).toBe("改动 1 处");
    expect(box.querySelector(".chg-hunk-line--del").textContent).toBe("- let x = 1");
    expect(box.querySelector(".chg-hunk-line--add").textContent).toBe("+ let x = 2");
  });

  it("宿主没有 getEditHunks 时不出改动块（覆盖写拿不到旧版本，不编）", async () => {
    const fetchFn = vi.fn(async (url) => (
      String(url).includes("/changes") ? mockJsonResponse(200, base) : mockTextResponse(200, "hi")
    ));
    const api = mount(fetchFn);
    api.setRun("r1");
    await waitFor(() => document.querySelectorAll(".chg-row").length === 1);
    document.querySelector(".chg-row-head").click();
    await waitFor(() => document.querySelector(".chg-preview"));
    expect(document.querySelector(".chg-hunks")).toBeNull();
  });
});
