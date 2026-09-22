// @ts-nocheck
/**
 * T16 Work 脸命名统一：内部枚举值 `office` → `work`。
 *
 * 缺陷形状：界面上一直叫 **Work**，代码里的枚举值叫 `office`，存储键叫
 * `agent.ui.pref.workspaceFace`——同一个概念两套名字，计划/代码/界面三处对不上。
 *
 * 改名不能把老用户和老档案甩下：旧值会从两处回流（浏览器 localStorage 的偏好、
 * 服务端归档 meta.json 与 run 列表）。所以 `"office"` **永远认得，只是不再产出**，
 * 这条纪律由下面的白名单门禁盯着——新冒出来的 `office` 一律变红，逼人看一眼。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWorkspaceFace as normalizeClient } from "../ui/public/app.js";
import { normalizeWorkspaceFace as normalizeServer, WORKSPACE_FACES } from "../ui/history.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf-8");
const indexHtml = read("ui", "public", "index.html");

describe("T16 面值归一（前后端同一张表）", () => {
  const TABLE: [unknown, string | null][] = [
    ["work", "work"],
    ["office", "work"], // 迁移：旧值永远认得
    ["code", "code"],
    ["", null],
    [undefined, null],
    [null, null],
    ["Work", null], // 大小写不宽纵：枚举值是精确字面量，不是人话
    ["cowork", null],
    [0, null],
    [{}, null],
  ];

  it.each(TABLE)("normalize(%s) → %s（客户端与服务端逐项一致）", (input, want) => {
    expect(normalizeClient(input)).toBe(want);
    expect(normalizeServer(input)).toBe(want);
  });

  it("枚举值集合里没有 office——它只是入口认得的旧写法，不是合法值", () => {
    expect([...WORKSPACE_FACES]).toEqual(["work", "code"]);
    expect(WORKSPACE_FACES).not.toContain("office");
  });
});

describe("T16 localStorage 迁移（旧偏好不清空，读到就改写）", () => {
  /**
   * 启动那段在 index.html 的内联控制器里，jsdom 起不来（它开 EventSource、
   * 绑一整套 DOM），所以这几条是静态锁：证"迁移代码写在那儿"，
   * 证不了"运行时真的改写了"。值的正确性由上面那张表担保。
   */
  it("面偏好：旧值 office 照常进 Work 脸，并当场持久化成新值", () => {
    const at = indexHtml.indexOf("const savedFace = readPrefString(PREF_WORKSPACE_FACE");
    expect(at, "找不到面偏好的启动读取").toBeGreaterThan(0);
    const src = indexHtml.slice(at, at + 600);
    // 默认不再是写死的 "office"：缺省交给 normalize 之后的 ?? "work"
    expect(src).toMatch(/readPrefString\(PREF_WORKSPACE_FACE,\s*""\)/);
    expect(src).toMatch(/normalizeWorkspaceFace\(savedFace\)\s*\?\?\s*"work"/);
    // 读到旧值 ⇒ 这次启动就把它改写掉；本来就是新值 ⇒ 不写（不制造无谓的偏好）
    expect(src).toMatch(/needsMigration\s*=\s*savedFace\s*!==\s*""\s*&&\s*savedFace\s*!==\s*face/);
    expect(src).toMatch(/persist:\s*needsMigration/);
  });

  it("每脸工作目录：旧键 office 读得到、写回时改名并删掉旧键", () => {
    const write = indexHtml.slice(indexHtml.indexOf("function rememberWorkdirForFace"));
    expect(write.slice(0, 700)).toContain("delete map.office");
    expect(write.slice(0, 700)).toMatch(/map\[normalizeWorkspaceFace\(face\)\s*\?\?\s*"code"\]\s*=/);
    const restore = indexHtml.slice(indexHtml.indexOf("function restoreWorkdirForFace"));
    expect(restore.slice(0, 700)).toMatch(/map\.work\s*\?\?\s*map\.office/);
  });
});

describe("T16 验收：ui/ 里的 office 只剩迁移兼容分支", () => {
  /**
   * 计划的验收原文是 `grep -r '"office"' ui/` 仅剩迁移兼容分支。这里把它写成
   * 常驻门禁：注释随便写，**代码行**必须逐条在白名单里。新增一处即红——
   * 与 axe 的 incomplete 白名单同一个套路：不是"当前没问题"，是"变了就得有人看"。
   *
   * 排除的不是本项目标：officeKindFromPath / parseOfficePreview / OfficeNotify* /
   * .ac-office-* 说的是 **Microsoft Office 文档**，与工作区的脸无关。
   */
  const FILES = [
    ["ui", "public", "index.html"],
    ["ui", "public", "app.js"],
    ["ui", "public", "styles.css"],
    ["ui", "server.ts"],
    ["ui", "history.ts"],
  ];

  /** 与工作区脸无关的 office（微软 Office 文档族） */
  const NOT_THE_FACE =
    /officeKindFromPath|parseOfficePreview|OfficeNotify|officeNotif|createOfficeNotifier|resolveOfficeNotifyFromEnv|office_notify|office-preview|officePreview|runOfficePreviewMatch|ac-office|Office 预览|Office 引擎|Office 文件/;

  /** 允许留下的迁移代码行（trim 后逐字比对） */
  const ALLOWED = new Set([
    // 两份 normalizeWorkspaceFace 的迁移分支（前端 app.js / 服务端 history.ts）
    'if (value === "work" || value === "office") return "work";',
    'if (raw === "work" || raw === "office") return "work";',
    // 每脸工作目录的旧键
    "delete map.office;",
    'const wanted = key === "work" ? (map.work ?? map.office) : map.code;',
    // 400 的人话：告诉调用方旧值仍然收，别让人以为改名把老客户端锁在门外。
    // 这是文案不是分支，但它承诺的正是上面那条迁移语义——一起钉住。
    'return { status: 400, payload: { error: `workspace "${parsed.workspace}" 无效。可选：work | code（旧值 office 仍接受，会归一成 work）` } };',
  ]);

  it("非注释的 office 代码行逐条在白名单里（新增一处即红）", () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const parts of FILES) {
      for (const raw of read(...parts).split(/\r?\n/)) {
        const line = raw.trim();
        if (!/office/i.test(line)) continue;
        if (NOT_THE_FACE.test(line)) continue;
        // 注释行随便写（迁移这件事本来就该解释清楚）
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("<!--")) continue;
        seen.add(line);
        if (!ALLOWED.has(line)) offenders.push(`${parts.join("/")}: ${line}`);
      }
    }
    expect(offenders, `这些 office 代码行不在迁移白名单里：\n${offenders.join("\n")}`).toEqual([]);
    // 反向：白名单不能有陈货（迁移分支被删了就该把白名单也收掉）
    for (const allowed of ALLOWED) {
      expect(seen, `白名单里的这条已不存在，应当一起删：${allowed}`).toContain(allowed);
    }
  });

  it("界面上的脸标记用的是 work（DOM 属性、id 与 CSS 三处一致）", () => {
    expect(indexHtml).toContain('data-workspace-face="work"');
    expect(indexHtml).toContain('id="workspace-face-work"');
    expect(indexHtml).not.toContain('data-workspace-face="office"');
    // CSS 的两脸差异一直只认 body[data-face="work"]，改名后与 JS 侧终于同名
    expect(read("ui", "public", "styles.css")).toContain('body[data-face="work"]');
  });
});
