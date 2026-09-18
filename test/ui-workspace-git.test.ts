// @vitest-environment jsdom
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatGitTitle,
  formatGitTriggerLabel,
  githubMcpConnected,
  initWorkspaceGitChip,
  renderDirtyCheckoutPrompt,
  renderGitMenu,
  workspaceGitHonesty,
} from "../ui/public/features/workspace-git.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function mountChip() {
  document.body.innerHTML = `
    <div class="scope-field scope-field--git" id="workspace-git-chip" hidden>
      <button type="button" id="workspace-git-trigger" class="wd-trigger" aria-expanded="false">
        <span id="workspace-git-trigger-text">—</span>
      </button>
      <div id="workspace-git-menu" class="wd-menu git-menu" hidden></div>
    </div>
  `;
  return document.getElementById("workspace-git-chip");
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("workspaceGitHonesty", () => {
  it("没 GitHub 远程就不给开 PR，只说人话", () => {
    expect(githubMcpConnected({ servers: [{ name: "github", status: "skipped" }] })).toBe(false);
    const local = workspaceGitHonesty({ present: true, branch: "main" }, null);
    expect(local.offerPr).toBe(false);
    expect(local.note).toContain("只会改这个文件夹");
    expect(local.prHref).toBeUndefined();
  });

  it("有远程就给真开 PR，不再给 compare 弱链", () => {
    const ready = workspaceGitHonesty({
      present: true, github: { owner: "acme", repo: "app" },
    }, { servers: [{ name: "github", status: "skipped" }] });
    expect(ready.offerPr).toBe(true);
    expect(ready.prHref).toBeUndefined();
    expect(ready.note).toBe("");
  });
});

describe("formatGitTriggerLabel / formatGitTitle", () => {
  it("无仓库空串；脏工作区打星；title 只写 owner/repo", () => {
    expect(formatGitTriggerLabel({ present: false })).toBe("");
    expect(formatGitTriggerLabel({
      present: true, branch: "main", dirty: true, github: { owner: "acme", repo: "app" },
    })).toBe("main *");
    expect(formatGitTitle({
      present: true, branch: "main", dirty: true, github: { owner: "acme", repo: "app" },
    })).toBe("acme/app · 有未提交改动");
    expect(formatGitTitle({
      present: true, branch: "main", github: { owner: "acme", repo: "app" },
      remoteUrl: "https://user:ghp_secret@github.com/acme/app.git",
    })).not.toContain("ghp_secret");
  });
});

describe("renderGitMenu / initWorkspaceGitChip", () => {
  it("当前分支禁用，其它分支可切", () => {
    const menu = document.createElement("div");
    document.body.appendChild(menu);
    renderGitMenu(menu, {
      present: true,
      branch: "main",
      github: { owner: "acme", repo: "app" },
      branches: ["main", "feature"],
    });
    expect(menu.textContent).toContain("acme/app");
    expect(menu.querySelector("[data-github-pr='form']")).not.toBeNull();
    expect(menu.querySelector(".git-pr-link")).toBeNull();
    expect(menu.textContent).not.toContain("compare");
    const buttons = [...menu.querySelectorAll("[data-branch]")];
    expect(buttons.map((b) => b.dataset.branch)).toEqual(["main", "feature"]);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
  });

  it("无 workdir 保持隐藏；探测到仓库后显示分支", async () => {
    const root = mountChip();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        present: true,
        branch: "main",
        dirty: false,
        github: { owner: "acme", repo: "app" },
        branches: ["main", "dev"],
      }),
    }));
    const api = initWorkspaceGitChip(root, {
      getWorkdir: () => "/repo",
      fetch: fetchFn,
    });
    await api.refresh();
    expect(root.hidden).toBe(false);
    expect(document.getElementById("workspace-git-trigger-text").textContent).toBe("main");
    expect(fetchFn).toHaveBeenCalledWith("/api/workspace/git?workdir=%2Frepo");
  });

  /**
   * 走查 UX-D1 网络实录：一次导航/渲染有 5-11 个调用方各喊一次 refresh()，
   * 每条都是一次真实 git 调用（真机会话 4 分钟 112 条）。同一目录的重复请求
   * 由"在飞去重 + 短 TTL"收掉；目录真的换了则立即重打，TTL 不挡真变化。
   */
  it("同一目录的重复刷新被收掉：在飞去重 + 短 TTL", async () => {
    const root = mountChip();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ present: true, branch: "main", dirty: false }),
    }));
    const api = initWorkspaceGitChip(root, { getWorkdir: () => "/repo", fetch: fetchFn });

    await Promise.all([api.refresh(), api.refresh(), api.refresh()]);
    expect(fetchFn, "并发三次只该打一次").toHaveBeenCalledTimes(1);
    await api.refresh();
    expect(fetchFn, "TTL 内不该再打").toHaveBeenCalledTimes(1);
  });

  it("换目录立即重打：TTL 不挡真变化", async () => {
    const root = mountChip();
    let wd = "/repo";
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ present: true, branch: "main", dirty: false }),
    }));
    const api = initWorkspaceGitChip(root, { getWorkdir: () => wd, fetch: fetchFn });
    await api.refresh();
    wd = "/other";
    await api.refresh();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenLastCalledWith("/api/workspace/git?workdir=%2Fother");
  });

  it("点其它分支走 checkout，失败时 announce 错误、不假装切成功", async () => {
    const root = mountChip();
    const announce = vi.fn();
    const fetchFn = vi.fn(async (url, init) => {
      if (String(url).includes("/checkout")) {
        return { ok: false, json: async () => ({ error: "工作区有未提交改动" }) };
      }
      return {
        ok: true,
        json: async () => ({
          present: true,
          branch: "main",
          branches: ["main", "dev"],
        }),
      };
    });
    const api = initWorkspaceGitChip(root, {
      getWorkdir: () => "/repo",
      fetch: fetchFn,
      onAnnounce: announce,
    });
    await api.refresh();
    const trigger = document.getElementById("workspace-git-trigger");
    trigger.click();
    await flush();
    document.querySelector("[data-branch='dev']").click();
    await flush();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/workspace/git/checkout",
      expect.objectContaining({ method: "POST" }),
    );
    expect(announce).toHaveBeenCalledWith("工作区有未提交改动");
    expect(document.getElementById("workspace-git-trigger-text").textContent).toBe("main");
  });

  it("脏工作区弹出处理卡，取消不切换，暂存后带 dirtyAction 再 POST", async () => {
    const root = mountChip();
    const bodies = [];
    const fetchFn = vi.fn(async (url, init) => {
      if (String(url).includes("/checkout")) {
        bodies.push(JSON.parse(init.body));
        if (!JSON.parse(init.body).dirtyAction) {
          return {
            ok: false,
            json: async () => ({ code: "dirty_worktree", error: "工作区有未提交改动", dirty: true }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            present: true,
            branch: "dev",
            dirty: false,
            branches: ["main", "dev"],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          present: true,
          branch: "main",
          dirty: true,
          branches: ["main", "dev"],
        }),
      };
    });
    const api = initWorkspaceGitChip(root, {
      getWorkdir: () => "/repo",
      fetch: fetchFn,
    });
    await api.refresh();
    document.getElementById("workspace-git-trigger").click();
    await flush();
    document.querySelector("[data-branch='dev']").click();
    await flush();
    const menu = document.getElementById("workspace-git-menu");
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain("有未提交的改动");
    expect(menu.textContent).toContain("暂存后切换");
    menu.querySelector("[data-dirty-action='cancel']").click();
    await flush();
    expect(menu.textContent).toContain("dev");
    expect(menu.querySelector("[data-dirty-action]")).toBeNull();
    document.querySelector("[data-branch='dev']").click();
    await flush();
    menu.querySelector("[data-dirty-action='stash']").click();
    await flush();
    expect(bodies).toEqual([
      { workdir: "/repo", branch: "dev" },
      { workdir: "/repo", branch: "dev" },
      { workdir: "/repo", branch: "dev", dirtyAction: "stash" },
    ]);
    expect(document.getElementById("workspace-git-trigger-text").textContent).toBe("dev");
    expect(menu.hidden).toBe(true);
  });

  it("脏工作区处理卡用 createElement，分支名不进 HTML", () => {
    const menu = document.createElement("div");
    document.body.appendChild(menu);
    renderDirtyCheckoutPrompt(menu, { branch: "feat/<script>", fromBranch: "main" });
    expect(menu.querySelector(".git-dirty-title")?.textContent).toBe("有未提交的改动");
    expect(menu.innerHTML).not.toContain("<script>");
    expect(menu.textContent).toContain("feat/<script>");
  });
});
