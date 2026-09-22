/**
 * 产物画廊扫描与画册过期（不启宿主）。
 * 计划 2 · 任务 6 起，文件还锁「标签条与产物条共用一个真值源」的接线
 * （源码文本锁——只读 index.html，不启宿主）。
 */
import { describe, expect, it } from "vitest";
import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CITE_ARTIFACT_RELS } from "../ui/cite.js";
import {
  artifactKindForRel,
  artifactTitleForRel,
  collectWorkdirArtifactCards,
  compareArtifactCards,
  fingerprintArtifactTree,
  isDeckStale,
  listCiteArtifactsInWorkdir,
} from "../ui/artifacts.js";

describe("artifactKindForRel / title", () => {
  it("与 CITE_ARTIFACT_RELS 四条对齐", () => {
    expect(CITE_ARTIFACT_RELS).toEqual([
      "index.html",
      "pm-spec/index.html",
      "deck-basic/index.html",
      "DESIGN.md",
    ]);
    expect(artifactKindForRel("index.html")).toBe("landing");
    expect(artifactKindForRel("pm-spec/index.html")).toBe("spec");
    expect(artifactKindForRel("deck-basic/index.html")).toBe("deck");
    expect(artifactKindForRel("DESIGN.md")).toBe("design");
    expect(artifactKindForRel("other.md")).toBeNull();
    expect(artifactTitleForRel("deck-basic/index.html")).toBe("幻灯画册");
  });
});

describe("isDeckStale", () => {
  it("缺规格或缺画册都不标过期", () => {
    expect(isDeckStale(null, { exists: true, mtimeMs: 2 })).toBe(false);
    expect(isDeckStale({ exists: true, mtimeMs: 2 }, null)).toBe(false);
    expect(isDeckStale({ exists: false, mtimeMs: 9 }, { exists: true, mtimeMs: 1 })).toBe(false);
    expect(isDeckStale({ exists: true, mtimeMs: 9 }, { exists: false, mtimeMs: 1 })).toBe(false);
  });

  it("规格 mtime 新于画册 → 过期；画册更新或同时刻 → 不过期", () => {
    expect(isDeckStale({ exists: true, mtimeMs: 20 }, { exists: true, mtimeMs: 10 })).toBe(true);
    expect(isDeckStale({ exists: true, mtimeMs: 10 }, { exists: true, mtimeMs: 20 })).toBe(false);
    expect(isDeckStale({ exists: true, mtimeMs: 10 }, { exists: true, mtimeMs: 10 })).toBe(false);
  });
});

describe("扫描 workdir 与目录指纹", () => {
  it("只列出 CITE_ARTIFACT_RELS 里真实存在的文件；规格新则画册卡 deckStale", async () => {
    const dir = await mkdtemp(join(tmpdir(), "artifacts-scan-"));
    await writeFile(join(dir, "index.html"), "<html>landing</html>");
    await writeFile(join(dir, "DESIGN.md"), "# design");
    await mkdir(join(dir, "pm-spec"));
    await mkdir(join(dir, "deck-basic"));
    const specFile = join(dir, "pm-spec", "index.html");
    const deckFile = join(dir, "deck-basic", "index.html");
    await writeFile(specFile, "<html>spec-v2</html>");
    await writeFile(deckFile, "<html>deck-v1</html>");
    const old = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-02-01T00:00:00Z");
    await utimes(deckFile, old, old);
    await utimes(specFile, newer, newer);

    const listed = await listCiteArtifactsInWorkdir(dir);
    expect(listed.map((a) => a.rel).sort()).toEqual([
      "DESIGN.md",
      "deck-basic/index.html",
      "index.html",
      "pm-spec/index.html",
    ]);

    const spec = await fingerprintArtifactTree(dir, "pm-spec");
    const deck = await fingerprintArtifactTree(dir, "deck-basic");
    expect(spec.exists).toBe(true);
    expect(deck.exists).toBe(true);
    expect(spec.mtimeMs).toBeGreaterThan(deck.mtimeMs);
    expect(spec.hash).not.toBe(deck.hash);

    const cards = await collectWorkdirArtifactCards(dir, "run-1");
    const deckCard = cards.find((c) => c.kind === "deck");
    expect(deckCard?.deckStale).toBe(true);
    expect(deckCard?.runId).toBe("run-1");
    expect(cards.filter((c) => c.kind !== "deck").every((c) => c.deckStale === false)).toBe(true);

    const sorted = [...cards].sort(compareArtifactCards);
    expect(sorted.map((c) => c.kind)).toEqual(["landing", "spec", "deck", "design"]);
  });

  it("画册新于规格则不过期", async () => {
    const dir = await mkdtemp(join(tmpdir(), "artifacts-fresh-"));
    await mkdir(join(dir, "pm-spec"));
    await mkdir(join(dir, "deck-basic"));
    const specFile = join(dir, "pm-spec", "index.html");
    const deckFile = join(dir, "deck-basic", "index.html");
    await writeFile(specFile, "<html>spec</html>");
    await writeFile(deckFile, "<html>deck</html>");
    const old = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-03-01T00:00:00Z");
    await utimes(specFile, old, old);
    await utimes(deckFile, newer, newer);
    const cards = await collectWorkdirArtifactCards(dir);
    expect(cards.find((c) => c.kind === "deck")?.deckStale).toBe(false);
  });
});

describe("标签条与产物条共用一个真值源（计划 2 · 任务 6）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("标签条读的是既有派生，不是自己那份「点开过的」", async () => {
    const source = await html();
    // 锁表达式本身（计划 1 的教训：只锁「出现过这个名字」会放过接错地方）
    expect(source).toMatch(/selectPreviewArtifacts\(currentRunArtifacts\(/);
  });

  it("合并去重走既有的 ensurePreviewArtifact——不许再写一份", async () => {
    const source = await html();
    expect(source).toMatch(/ensurePreviewArtifact\(/);
    // 壳里只有这一次调用（import 行不算——那里没有左括号）
    expect(source.match(/ensurePreviewArtifact\(/g)?.length ?? 0).toBe(1);
  });

  it("派生有缓存：标签条在画布渲染路径上，不许每帧走一遍时间线", async () => {
    const source = await html();
    expect(source).toMatch(/const previewTabsCache = new Map\(\)/);
    const fn = source.match(/function openedPreviewArtifacts\(runId\) \{[\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn?.[0]).toMatch(/previewTabsCache\.(?:get|set)\(/);
    // 反锁：缓存键不许建在派生结果上（brief 第一版用 currentRunArtifacts(runId).length
    // 当键）——派生本身要走一遍时间线，拿它当键等于没缓存
    expect(fn?.[0]).not.toMatch(/currentRunArtifacts\(runId\)\.length/);
  });

  it("stamp 底料是 state 的时间线长度（O(1) 读），不派生清单", async () => {
    const source = await html();
    const fn = source.match(/function previewTabStamp\(runId\) \{[\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn?.[0]).toMatch(/timeline/);
    expect(fn?.[0]).toMatch(/\.length/);
    // 反锁：stamp 里不许出现任何派生调用——走一遍派生就当不了缓存键
    expect(fn?.[0]).not.toMatch(/deriveSessionFiles|deriveThreadFiles|currentRunArtifacts/);
  });

  it("关掉这一场产物里的标签要真关掉——藏进 dismissed，重新点开即恢复", async () => {
    const source = await html();
    expect(source).toMatch(/const dismissedPreviewFiles = new Map\(\)/);
    expect(source).toMatch(/dismissed\.add\(/);
    expect(source).toMatch(/dismissed\.delete\(/);
    const fn = source.match(/function openedPreviewArtifacts\(runId\) \{[\s\S]*?\n\}/);
    expect(fn?.[0]).toMatch(/dismissed/);
  });

  it("openPendingArtifact 的手动塞标签特例已删——标签条现在天然非空", async () => {
    const source = await html();
    const fn = source.match(/function openPendingArtifact\(\) \{[\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    expect(fn?.[0]).not.toMatch(/rememberPreviewFile|currentRunArtifacts|wrapIndex/);
    expect(fn?.[0]).toMatch(/artifactCanvasApi\?\.open\(index/);
  });

  it("缓存键的 mine/dismissed 两段用内容不用长度——账本可增可删，长度键不单射", async () => {
    const source = await html();
    const fn = source.match(/function openedPreviewArtifacts\(runId\) \{[\s\S]*?\n\}/);
    expect(fn?.[0]).toBeTruthy();
    // 键 = 内容串：mine 按序拼路径、dismissed 排序后拼（NUL 分隔——路径里
    // 不可能有 NUL）。今天的代码里每次账本变更都紧跟一次派生覆写（缓存
    // 单条目），长度键还撞不出旧清单——五步序列推演到第 5 步比对的是第
    // 4 步写的键、第 3 步的旧清单早被覆写；但「改完账本没立刻派生」的
    // 新路径会让长度键绕回旧值、撞上旧缓存。内容键把这个危险整类去掉，
    // 比锁某个具体序列更耐改（探针跑终态契约，变异红由本测试担）。
    expect(fn?.[0]).toMatch(/join\("\\x00"\)/);
    expect(fn?.[0]).toMatch(/\.sort\(\)/);
    // 反锁：长度键正是这条缺陷的形状（forgetPreviewFile 会 filter 掉 mine 的项）
    expect(fn?.[0]).not.toMatch(/mine\.length|dismissed\?\.size/);
  });
});
