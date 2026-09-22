// @vitest-environment jsdom
// @ts-nocheck
/**
 * 右侧工作区文件栏（features/file-tree.js）回归锁。
 *
 * 纯函数：树 URL / 展开集合 / 人话失败 / files[] 拆成条目与 notice。
 * DOM：树形状、点文件夹展开（q=dir/）、圈禁逃逸与 403 不把 HTTP 码画到脸上。
 * 挂载：在 #center-row 右侧，不在左栏；Work/Code 都能用，不绑 Code 脸。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FILE_TREE_COPY,
  FILES_RAIL_PREF,
  treeQueryForDir,
  buildWorkspaceTreeUrl,
  isTreeNotice,
  splitTreeEntries,
  humanizeTreeFailure,
  toggleExpanded,
  readFilesRailCollapsed,
  writeFilesRailCollapsed,
  initFileTree,
} from "../ui/public/features/file-tree.js";

const here = dirname(fileURLToPath(import.meta.url));
const htmlSrc = readFileSync(join(here, "..", "ui", "public", "index.html"), "utf-8");
const cssSrc = readFileSync(join(here, "..", "ui", "public", "styles.css"), "utf-8");
const treeSrc = readFileSync(join(here, "..", "ui", "public", "features", "file-tree.js"), "utf-8");

const flush = () => new Promise((r) => setTimeout(r, 0));

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mountTree(host = {}, env = {}) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const api = initFileTree({ mount: root, ...host }, { storage: null, ...env });
  return { root, api };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("treeQueryForDir / buildWorkspaceTreeUrl", () => {
  it("根不带 q；子目录带尾斜杠", () => {
    expect(treeQueryForDir("")).toBe("");
    expect(treeQueryForDir("src")).toBe("src/");
    expect(treeQueryForDir("src/nested/")).toBe("src/nested/");
    expect(buildWorkspaceTreeUrl("D:\\work", "")).toBe(
      "/api/workspace/files?workdir=D%3A%5Cwork",
    );
    expect(buildWorkspaceTreeUrl("D:\\work", "src")).toContain("q=src%2F");
  });
});

describe("splitTreeEntries / toggleExpanded / 人话", () => {
  it("notice 与真实条目拆开；展开集合按路径翻转", () => {
    expect(isTreeNotice({ notice: "这个路径不在当前工作目录里。" })).toBe(true);
    const { entries, notices } = splitTreeEntries([
      { name: "src", relative: "src", kind: "directory" },
      { name: "hello.txt", relative: "hello.txt", kind: "file" },
      { name: "", relative: "../secret", kind: "directory", notice: "这个路径不在当前工作目录里。" },
      { name: "skip", relative: "", kind: "file" },
    ]);
    expect(entries.map((e) => e.relative)).toEqual(["src", "hello.txt"]);
    expect(notices.map((n) => n.notice)).toEqual(["这个路径不在当前工作目录里。"]);

    const once = toggleExpanded(new Set(), "src");
    expect([...once]).toEqual(["src"]);
    expect([...toggleExpanded(once, "src")]).toEqual([]);
  });

  it("失败文案不出现 HTTP 码", () => {
    expect(humanizeTreeFailure(403, "工作目录不在白名单内。")).toBe("工作目录不在白名单内。");
    const fallback = humanizeTreeFailure(403, "");
    expect(fallback).not.toMatch(/HTTP/i);
    expect(fallback).not.toMatch(/\b403\b/);
    expect(humanizeTreeFailure(500, "HTTP 500 boom")).not.toMatch(/HTTP\s*500/i);
  });
});

describe("initFileTree DOM", () => {
  it("树形状：根下列出文件夹与文件", async () => {
    const fetchFn = vi.fn(async () => mockResponse(200, {
      files: [
        { name: "src", relative: "src", kind: "directory" },
        { name: "hello.txt", relative: "hello.txt", kind: "file" },
      ],
    }));
    const { root } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn });
    await root.__fileTreeApi.reload();
    await flush();
    const rows = [...root.querySelectorAll(".ft-row")];
    expect(rows.map((el) => el.dataset.path)).toEqual(["src", "hello.txt"]);
    expect(rows.map((el) => el.dataset.kind)).toEqual(["directory", "file"]);
    expect(fetchFn).toHaveBeenCalledWith("/api/workspace/files?workdir=D%3A%2Fproj");
  });

  it("展开文件夹再打 q=dir/，子节点挂在树里", async () => {
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("q=src%2F")) {
        return mockResponse(200, {
          files: [{ name: "app.js", relative: "src/app.js", kind: "file" }],
        });
      }
      return mockResponse(200, {
        files: [{ name: "src", relative: "src", kind: "directory" }],
      });
    });
    const { root } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn });
    await root.__fileTreeApi.reload();
    await flush();
    root.querySelector('.ft-row[data-path="src"] .ft-twist').click();
    await flush();
    await flush();
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes("q=src%2F"))).toBe(true);
    expect(root.querySelector('.ft-row[data-path="src/app.js"]')).toBeTruthy();
    expect(root.querySelector('.ft-row[data-path="src"] .ft-twist').getAttribute("aria-expanded")).toBe("true");
  });

  it("点文件走 onPreview，行内 @ 走 onCite，不发明第三套", async () => {
    const onPreview = vi.fn();
    const onCite = vi.fn();
    const fetchFn = vi.fn(async () => mockResponse(200, {
      files: [{ name: "hello.txt", relative: "hello.txt", kind: "file" }],
    }));
    const { root } = mountTree(
      { getWorkdir: () => "D:/proj", onPreview, onCite },
      { fetch: fetchFn },
    );
    await root.__fileTreeApi.reload();
    await flush();
    root.querySelector(".ft-name").click();
    expect(onPreview).toHaveBeenCalledWith("hello.txt");
    root.querySelector(".ft-cite").click();
    expect(onCite).toHaveBeenCalledWith("hello.txt", "file");
  });

  it("E15：目录行名按钮带 aria-expanded（折叠状态不只靠三角图标）", async () => {
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes("q=src%2F")) return mockResponse(200, { files: [] });
      return mockResponse(200, { files: [{ name: "src", relative: "src", kind: "directory" }] });
    });
    const { root } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn });
    await root.__fileTreeApi.reload();
    await flush();
    expect(
      root.querySelector('.ft-row[data-path="src"] .ft-name').getAttribute("aria-expanded"),
    ).toBe("false");
    root.querySelector('.ft-row[data-path="src"] .ft-twist').click();
    await flush();
    await flush();
    expect(
      root.querySelector('.ft-row[data-path="src"] .ft-name').getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("圈禁逃逸 notice 与 403 都是人话，没有 HTTP 码", async () => {
    const escaped = vi.fn(async () => mockResponse(200, {
      files: [{
        name: "",
        relative: "../secret",
        kind: "directory",
        notice: "这个路径不在当前工作目录里。",
      }],
    }));
    const { root, api } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: escaped });
    await api.reload();
    await flush();
    expect(root.querySelector(".ft-notice")?.textContent).toBe("这个路径不在当前工作目录里。");
    expect(root.textContent).not.toMatch(/HTTP/i);
    expect(root.querySelector(".ft-row")).toBeNull();

    const denied = vi.fn(async () => mockResponse(403, { error: "工作目录不在白名单内。" }));
    const second = mountTree({ getWorkdir: () => "D:/outside" }, { fetch: denied });
    await second.api.reload();
    await flush();
    expect(second.root.querySelector(".ft-error")?.textContent).toBe("工作目录不在白名单内。");
    expect(second.root.textContent).not.toMatch(/HTTP/i);
    expect(second.root.textContent).not.toMatch(/\b403\b/);
  });

  it("空目录与未选工作目录用人话", async () => {
    const empty = mountTree({ getWorkdir: () => "" }, { fetch: vi.fn() });
    await empty.api.reload();
    expect(empty.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.noWorkdir);

    const fetchFn = vi.fn(async () => mockResponse(200, { files: [] }));
    const { root, api } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn });
    await api.reload();
    await flush();
    expect(root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.emptyRoot);
  });

  it("上下文没落定时说「正在确认目录…」，不说「先选一个工作目录。」", async () => {
    const pending = mountTree({ getWorkdir: () => "", isContextReady: () => false }, { fetch: vi.fn() });
    await pending.api.reload();
    expect(pending.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.confirming);
    expect(pending.root.textContent).not.toContain(FILE_TREE_COPY.noWorkdir);
  });

  it("上下文落定且确实没目录，才说「先选一个工作目录。」", async () => {
    const settled = mountTree({ getWorkdir: () => "", isContextReady: () => true }, { fetch: vi.fn() });
    await settled.api.reload();
    expect(settled.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.noWorkdir);
  });

  it("宿主不提供 isContextReady 时保持旧行为（向后兼容）", async () => {
    const legacy = mountTree({ getWorkdir: () => "" }, { fetch: vi.fn() });
    await legacy.api.reload();
    expect(legacy.root.querySelector(".ft-empty")?.textContent).toBe(FILE_TREE_COPY.noWorkdir);
  });

  it("折叠栏：默认展开，点开关收起并记偏好", () => {
    const store = new Map();
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    const { root, api } = mountTree({ getWorkdir: () => "" }, { storage, fetch: vi.fn() });
    expect(root.classList.contains("files-rail")).toBe(true);
    expect(root.classList.contains("files-rail--collapsed")).toBe(false);
    expect(api.isCollapsed()).toBe(false);
    root.querySelector(".files-rail-toggle").click();
    expect(api.isCollapsed()).toBe(true);
    expect(root.classList.contains("files-rail--collapsed")).toBe(true);
    expect(store.get(FILES_RAIL_PREF)).toBe("1");
    expect(root.querySelector(".files-rail-toggle").getAttribute("aria-expanded")).toBe("false");
    api.setCollapsed(false);
    expect(api.isCollapsed()).toBe(false);
    expect(store.has(FILES_RAIL_PREF)).toBe(false);
  });

  it("子节点缩进写 --ft-depth，不靠空格垫", async () => {
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("q=src%2F")) {
        return mockResponse(200, {
          files: [{ name: "app.js", relative: "src/app.js", kind: "file" }],
        });
      }
      return mockResponse(200, {
        files: [{ name: "src", relative: "src", kind: "directory" }],
      });
    });
    const { root } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn });
    await root.__fileTreeApi.reload();
    await flush();
    root.querySelector('.ft-row[data-path="src"] .ft-twist').click();
    await flush();
    await flush();
    expect(root.querySelector('.ft-row[data-path="src"]').style.getPropertyValue("--ft-depth")).toBe("0");
    expect(root.querySelector('.ft-row[data-path="src/app.js"]').style.getPropertyValue("--ft-depth")).toBe("1");
  });
});

describe("挂载：右侧栏，不在左栏，不绑 Code 脸", () => {
  it("HTML 把树挂在 #center-row、#main-area 之后；左栏没有树", () => {
    const sidebarEnd = htmlSrc.indexOf('id="sidebar-expand"');
    const sidebar = htmlSrc.slice(htmlSrc.indexOf('id="sidebar"'), sidebarEnd);
    expect(sidebar).not.toContain('id="workspace-file-tree"');
    expect(sidebar).toContain('id="run-list"');

    const center = htmlSrc.slice(htmlSrc.indexOf('id="center-row"'), htmlSrc.indexOf('id="scroll-nav"'));
    expect(center).toContain('id="workspace-file-tree"');
    expect(center.indexOf('id="main-area"')).toBeLessThan(center.indexOf('id="workspace-file-tree"'));
    expect(center).toMatch(/class="[^"]*files-rail/);
  });

  it("宿主按工作目录刷新，不按 Code 脸开关", () => {
    expect(htmlSrc).not.toMatch(/if\s*\(\s*(?:face|workspaceFace)\s*===\s*"code"\s*\)\s*void fileTreeApi/);
    expect(htmlSrc).toMatch(/function refreshWorkdirDependents/);
    expect(htmlSrc).toMatch(/function currentWorkdir\(\)[\s\S]*getWorkdirSelection/);
    expect(htmlSrc).toMatch(/function paintWorkdirsForFace[\s\S]*refreshWorkdirDependents/);
    expect(htmlSrc).toMatch(/function populateKnobs[\s\S]*refreshWorkdirDependents/);
    expect(treeSrc).not.toMatch(/workspaceFace|workspace-face|face === ["']code["']/);
  });

  it("CSS 不再把树藏进 Code 脸左栏", () => {
    expect(cssSrc).not.toMatch(/\.sidebar\[data-workspace-face="code"\]\s+\.workspace-file-tree/);
    expect(cssSrc).not.toMatch(/\.sidebar\[data-workspace-face="code"\]\s+\.run-list/);
    expect(cssSrc).toMatch(/\.files-rail--collapsed/);
    expect(cssSrc).toMatch(/--ft-depth/);
    expect(cssSrc).toMatch(/padding-left:\s*calc\(8px \+ var\(--ft-depth\) \* 12px\)/);
  });

  it("折叠偏好读写：1 收起，去掉键即展开", () => {
    const store = new Map();
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    expect(readFilesRailCollapsed(storage)).toBe(false);
    writeFilesRailCollapsed(storage, true);
    expect(readFilesRailCollapsed(storage)).toBe(true);
    writeFilesRailCollapsed(storage, false);
    expect(readFilesRailCollapsed(storage)).toBe(false);
  });
});

describe("A6 补拉的过期与自愈锁（2026-09-20 review）", () => {
  it("非根层在飞应答跨工作目录切换后落地必须被弃，不得写进新目录的 cache", async () => {
    // 失败场景（review 的 Important）：A 的 sub 在飞（gate 卡住）时切到 B，
    // reload 的 cache.clear 发生在旧应答落地之前——旧应答落地会把 A 的
    // 内容以相对路径为键写进 B 的 cache；B 下再展开同名目录就看到 A 的内容。
    let wd = "D:/A";
    let releaseOld;
    const gate = new Promise((r) => { releaseOld = r; });
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("q=sub%2F")) {
        if (wd === "D:/A") {
          await gate; // A 的 sub 在飞时被切走——这份应答必须被弃
          return mockResponse(200, {
            files: [{ name: "a-old.txt", relative: "sub/a-old.txt", kind: "file" }],
          });
        }
        return mockResponse(200, {
          files: [{ name: "b-new.txt", relative: "sub/b-new.txt", kind: "file" }],
        });
      }
      return mockResponse(200, {
        files: [{ name: "sub", relative: "sub", kind: "directory" }],
      });
    });
    const { root } = mountTree({ getWorkdir: () => wd }, { fetch: fetchFn });
    await root.__fileTreeApi.reload();
    await flush();
    root.querySelector('.ft-row[data-path="sub"] .ft-twist').click(); // A 的 sub 在飞
    await flush();
    wd = "D:/B";
    await root.__fileTreeApi.reload(); // 切到 B
    await flush();
    releaseOld(); // 旧应答此刻才落地
    await flush();
    await flush();
    // B 根下展开 sub：旧应答若落了地，cache.has("sub") 为真 → 直接画 A 的内容
    root.querySelector('.ft-row[data-path="sub"] .ft-twist').click();
    await flush();
    await flush();
    await flush();
    expect(root.querySelector('.ft-row[data-path="sub/b-new.txt"]')).toBeTruthy();
    expect(root.querySelector('.ft-row[data-path="sub/a-old.txt"]')).toBeNull();
  });

  it("组展开后，记忆里展开的成员缓存缺失时补拉子层（不静默空转）", async () => {
    // review 的 Minor-1：上一会话展开过 _probe2-p1 → 刷新后组回到折叠、
    // 成员仍在 expanded → 点开组后成员 twist 朝下却没有子行、也不发请求。
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("q=_probe2-p1%2F")) {
        return mockResponse(200, {
          files: [{ name: "x.txt", relative: "_probe2-p1/x.txt", kind: "file" }],
        });
      }
      return mockResponse(200, {
        files: [
          { name: "_probe2-p1", relative: "_probe2-p1", kind: "directory" },
          { name: "_probe3-p2", relative: "_probe3-p2", kind: "directory" },
        ],
      });
    });
    const storage = {
      getItem: (k) => (k === "agent.ui.pref.treeExpanded"
        ? JSON.stringify({ "D:/proj": ["_probe2-p1"] })
        : null),
      setItem: () => {},
      removeItem: () => {},
    };
    const { root } = mountTree({ getWorkdir: () => "D:/proj" }, { fetch: fetchFn, storage });
    await root.__fileTreeApi.reload();
    await flush();
    root.querySelector(".ft-group-name").click(); // 展开组：成员渲染，_probe2-p1 在记忆里展开
    await flush();
    await flush();
    await flush();
    expect(root.querySelector('.ft-row[data-path="_probe2-p1/x.txt"]')).toBeTruthy();
    expect(fetchFn.mock.calls.some((c) => String(c[0]).includes("q=_probe2-p1%2F"))).toBe(true);
  });
});
