// @ts-nocheck
/**
 * 附件的纯函数层（计划 2 · 任务 2）。
 *
 * 附件在架构里是「文本行」——`附件：<路径>`——不是结构化字段。
 * 本任务给它加编号，**但不能破坏历史会话**：旧消息里没有 `#N`，
 * 它们必须照旧解析出来。这一组里那条向后兼容的用例是硬要求。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseAttachmentLine,
  stripAttachmentLine,
  splitUserMessageAttachments,
} from "../ui/public/app.js";

describe("parseAttachmentLine：新旧两种附件行", () => {
  it("旧格式（历史会话）：路径在手，编号没有——编一个出来就是假的", () => {
    expect(parseAttachmentLine("附件：uploads/a.png")).toEqual({ no: null, path: "uploads/a.png" });
    expect(parseAttachmentLine("附件: uploads/a.png")).toEqual({ no: null, path: "uploads/a.png" });
  });

  it("新格式：`附件 #3：<路径>`", () => {
    expect(parseAttachmentLine("附件 #3：uploads/pasted-1.png")).toEqual({ no: 3, path: "uploads/pasted-1.png" });
  });

  it("不是附件行就返回 null（别把普通正文吃掉）", () => {
    expect(parseAttachmentLine("看一下 Image #1 里…")).toBeNull();
    expect(parseAttachmentLine("附件列表如下")).toBeNull();
    expect(parseAttachmentLine("")).toBeNull();
  });
});

describe("stripAttachmentLine：按路径删行，两种格式都认", () => {
  it("删掉指向该路径的那一行，别的不动", () => {
    const text = "看一下这个\n附件 #1：uploads/a.png\n其余照旧";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("看一下这个\n其余照旧");
  });

  it("旧格式的行同样删得掉（否则删除附件会留下幽灵行）", () => {
    const text = "看一下这个\n附件：uploads/a.png";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("看一下这个");
  });

  it("路径不同的行不许误删", () => {
    const text = "附件 #1：uploads/a.png\n附件 #2：uploads/ab.png";
    expect(stripAttachmentLine(text, "uploads/a.png")).toBe("附件 #2：uploads/ab.png");
  });
});

describe("splitUserMessageAttachments：编号进 refs，兼容性进 attachments", () => {
  it("旧消息（无编号）的 attachments 与从前逐字相同——这是向后兼容锁", () => {
    const r = splitUserMessageAttachments("看这个\n附件：uploads/a.png\n附件：uploads/b.png");
    expect(r.attachments).toEqual(["uploads/a.png", "uploads/b.png"]);
    expect(r.attachmentRefs).toEqual([
      { no: null, path: "uploads/a.png" },
      { no: null, path: "uploads/b.png" },
    ]);
  });

  it("新消息带编号；body 保留原行（模型要看到），displayBody 去掉（气泡不重复）", () => {
    const r = splitUserMessageAttachments("看一下 Image #1\n附件 #1：uploads/a.png");
    expect(r.body).toContain("附件 #1：uploads/a.png");
    expect(r.displayBody).toBe("看一下 Image #1");
    expect(r.attachmentRefs).toEqual([{ no: 1, path: "uploads/a.png" }]);
  });

  it("格式放宽之后，`附件列表如下` 这种正文行不许被当成附件行吃掉", () => {
    const r = splitUserMessageAttachments("附件列表如下\n正文");
    expect(r.attachments).toEqual([]);
    expect(r.displayBody).toBe("附件列表如下\n正文");
  });
});

describe("接线锁（计划 1 的教训：锁接线表达式本身，不锁'这一带出现过这个名字'）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("上传写进输入框的是带编号的行", async () => {
    const source = await html();
    expect(source).toMatch(/`附件 #\$\{[^}]+\}：\$\{info\.path\}`/);
  });

  it("自动插引用发生在追加传输行**之前**（否则光标已被推到文末，插的就不是光标处）", async () => {
    const source = await html();
    // 区间锚点：uploadEntry 函数起，到 if (fileUpload) 为止。
    // Task 3 起这两步搬进了 uploadEntry（首次与重试共用），锚点跟着搬。
    const body = source.slice(source.indexOf("async function uploadEntry"), source.indexOf("if (fileUpload)"));
    const citeAt = body.indexOf("insertAtCaret(taskInput,");
    const lineAt = body.indexOf("`附件 #${attachNo}：${info.path}`");
    expect(citeAt, "找不到自动插引用").toBeGreaterThan(-1);
    expect(lineAt, "找不到传输行").toBeGreaterThan(-1);
    expect(citeAt, "★ 插引用必须在追加传输行之前").toBeLessThan(lineAt);
  });

  it("自动插引用带焦点守卫（输入框没焦点时 selectionStart 是 0，插进去会跑到全文最前面）", async () => {
    const source = await html();
    // Task 2 的 fix round 2 挣来的；Task 3 重写 uploadEntry 时不许丢
    expect(source).toMatch(/entry\.autoCite && document\.activeElement === taskInput/);
  });
});

describe("上传上限不许有两个真值源", () => {
  it("index.html 的客户端预检常量与 server.ts 的上限相等", async () => {
    const [html, server] = await Promise.all([
      readFile(join(process.cwd(), "ui/public/index.html"), "utf8"),
      readFile(join(process.cwd(), "ui/server.ts"), "utf8"),
    ]);
    const client = html.match(/UPLOAD_MAX_BYTES_CLIENT\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, "");
    const srv = server.match(/UPLOAD_MAX_BYTES\s*=\s*([\d_]+)/)?.[1]?.replace(/_/g, "");
    expect(client, "index.html 里没有 UPLOAD_MAX_BYTES_CLIENT").toBeTruthy();
    expect(srv, "server.ts 里没有 UPLOAD_MAX_BYTES").toBeTruthy();
    // 客户端预检只为了"别白传一遍"，真正的闸在服务端、一步都不能省；
    // 但两个数一旦漂移，用户会遇到"本地过了、服务端拒"这种最难解释的失败。
    expect(client).toBe(srv);
  });
});

describe("上传的接线锁（锁表达式本身，不锁'这一带出现过这个名字'）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("走的是能报进度的 XHR，不是 fetch（fetch 没有上传进度）", async () => {
    const source = await html();
    expect(source).toMatch(/new XMLHttpRequest\(\)/);
    expect(source).toMatch(/upload\.onprogress/);
  });

  it("失败的文件留在清单里带重试按钮，不是被 continue 掉", async () => {
    const source = await html();
    expect(source).toMatch(/entry\.status\s*=\s*"failed"/);
    expect(source).toMatch(/data-upload-retry/);
  });

  it("重试与首次上传共用同一个单文件函数——不许有两份 try/catch", async () => {
    const source = await html();
    // 首次上传与重试各写一遍 try/catch 一定会漂移（本仓最常吃的亏）
    expect(source.match(/await uploadEntry\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Fix round 1 的两条接线锁", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("超限条目不挂重试钮——预检会原样再拦一次、点了没反应（canRetry 判据必须在失败分支里）", async () => {
    const source = await html();
    const branch = source.slice(
      source.indexOf('if (u.status === "failed")'),
      source.indexOf('if (u.status === "uploading")', source.indexOf('if (u.status === "failed")')),
    );
    expect(branch).toMatch(/const canRetry\s*=\s*u\.bytes\s*<=\s*UPLOAD_MAX_BYTES_CLIENT\s*;/);
    // 重试钮必须真的由 canRetry 门控——判据在而钮恒挂，判据就只是摆设
    expect(branch).toMatch(/const retryBtn = canRetry\s*\?/);
  });

  it("stripAttachmentLine 的 import 真的接上了——只在壳里用不 import，点删除当场 ReferenceError（活页抓到的缝）", async () => {
    const source = await html();
    // 抠 /app.js 那一条 import：从它前面最近的 `import {` 到 `} from "/app.js";`
    const end = source.indexOf('} from "/app.js";');
    const start = source.lastIndexOf("import {", end);
    expect(start, "找不到 /app.js 的 import 块").toBeGreaterThan(-1);
    expect(source.slice(start, end), "import 列表里没有 stripAttachmentLine").toContain("stripAttachmentLine");
  });
});

describe("终审 fix round 的接线锁（编号 gate / 落盘判据 / 切走分支记 info）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("删除按「有没有落过盘」（absolutePath）分流，不是 status===\"done\"——切走对话那条 status 是 failed 但文件确实在 uploads/，按 status 判就成静默孤儿", async () => {
    const source = await html();
    // 抠 removeUploadedFile 函数体：从函数声明到下一个函数（escapeHtml）为止
    const body = source.slice(
      source.indexOf("async function removeUploadedFile"),
      source.indexOf("function escapeHtml", source.indexOf("async function removeUploadedFile")),
    );
    const gate = body.indexOf("!u.absolutePath");
    const del = body.indexOf('fetch("/api/upload"');
    expect(gate, "找不到 !u.absolutePath 这道分流").toBeGreaterThan(-1);
    expect(del, "找不到 DELETE 调用").toBeGreaterThan(-1);
    expect(gate, "★ 分流必须在打 DELETE 之前——顺序反了照样会把假话打给用户").toBeLessThan(del);
    // 反锁：status 分流正是这条缺陷的形状（切走分支 status=failed 但盘上有文件）
    expect(body).not.toMatch(/u\.status !== "done"/);
  });

  it("切走对话那条失败分支把 uploadOne 的 info 记进 entry——否则 absolutePath 还是 undefined，删盘判据形同虚设", async () => {
    const source = await html();
    // 抠切走分支：从它的 if 行到分支里的 entry.status = "failed" 为止
    // （「但你已经切换了对话」那句在 error 文案里、排在 status 之后，不能当起点）
    const branchStart = source.indexOf("if ((composerMode?.mode");
    const branch = source.slice(
      branchStart,
      source.indexOf('entry.status = "failed"', branchStart),
    );
    expect(branch, "切走分支里没有 Object.assign(entry, info)——文件落在旧 uploads/ 里却记不下来，永远删不掉").toMatch(/Object\.assign\(entry,\s*info\)/);
  });

  it("上传/清单行的「#N」只在 attachNo 已存在时拼——上传中还没有编号，别渲染出「Image #  0%」", async () => {
    const source = await html();
    // 钉表达式：attachNo !== undefined 这道 gate 拆掉的话，上传中条目
    // （attachNo 还不存在）会按旧写法 ?? "" 渲染出「Image #  0%」。
    expect(source).toMatch(/const tag = u\.attachNo !== undefined\s*\?/);
    // 反锁旧写法（双空格怪样的源头）
    expect(source).not.toMatch(/Image #\$\{u\.attachNo \?\? ""\}/);
  });
});

describe("缩略图条只给已落盘有编号的条目（review 的 Important）", () => {
  const html = () => readFile(join(process.cwd(), "ui/public/index.html"), "utf8");

  it("缩略图只给已落盘且有编号的条目标引用钮（否则会插出 Image #undefined）", async () => {
    const source = await html();
    // 钉表达式：attachNo !== undefined 这道门槛拆掉的话，
    // 失败/上传中的条目（那时 attachNo 还没有）会渲染出 data-upload-cite="undefined"，
    // 点一下就把「Image #undefined」插进正文——而真机上很难一眼看出那是错的。
    expect(source).toMatch(/u\.attachNo\s*!==\s*undefined/);
  });
});

describe("附件正则只有两份副本、两条正则，必须同口径", () => {
  it("app.js 与 ui/title.ts 里的 ATTACH_RE / ATTACH_CAPTURE_RE 逐字相同", async () => {
    const [app, title] = await Promise.all([
      readFile(join(process.cwd(), "ui/public/app.js"), "utf8"),
      readFile(join(process.cwd(), "ui/title.ts"), "utf8"),
    ]);
    // 共享不了（一个浏览器 ESM、一个 host TS），那就钉住相等——
    // 改一处忘另一处，这里会红，比"界面上标题多出一条附件行"早得多。
    // 两条都要比：只改 ATTACH_RE，宿主 titleSourceText 会把「附件 #1：」行当正文首句。
    const pick = (s: string, name: string) => s.match(new RegExp(`const ${name} = (.+);`))?.[1];
    for (const name of ["ATTACH_RE", "ATTACH_CAPTURE_RE"]) {
      const a = pick(app, name);
      const t = pick(title, name);
      expect(a, `app.js 里找不到 ${name}`).toBeTruthy();
      expect(t, `ui/title.ts 里找不到 ${name}`).toBeTruthy();
      expect(t, `${name} 两份副本不同口径`).toBe(a);
    }
  });
});
