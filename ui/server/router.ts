/**
 * 路由匹配：method + url → 路由描述。只管形状，不管语义——校验、鉴权、
 * 副作用都在处理器里做。纯函数，不读服务器状态。
 * 从 ui/server.ts 的 createUiServer 闭包里原样迁出（拆分阶段 1）。
 */
import { MemoryStore } from "../../src/memory.js";
import { safeDecode } from "./lib/http.js";
import { decodeSitePreviewPath } from "./lib/site-preview.js";

export type Route =
  | { type: "static"; filePath: string }
  | { type: "health" }
  | { type: "ready" }
  | { type: "metrics" }
  | { type: "harness" }
  | { type: "modelsGet" }
  | { type: "modelsPut" }
  | { type: "modelsRolesPatch" }
  | { type: "modelsTest" }
  | { type: "modelsSyncEnv" }
  | { type: "vendorsGet" }
  | { type: "vendorsEnable" }
  | { type: "pricingGet" }
  | { type: "pricingRefresh" }
  | { type: "usageGet" }
  | { type: "mcpGet" }
  | { type: "mcpPut" }
  | { type: "mcpInstall" }
  | { type: "mcpUninstall" }
  | { type: "mcpSkills" }
  | { type: "packsGet" }
  | { type: "packsDraft" }
  | { type: "packsInstall"; name: string }
  | { type: "packsDiscard"; name: string }
  | { type: "workdirsList" }
  | { type: "workdirAdd" }
  | { type: "designDraftsWorkdir" }
  | { type: "projectsList" }
  | { type: "projectCreate" }
  | { type: "projectPatch"; id: string }
  | { type: "projectRemove"; id: string }
  | { type: "campaignsList" }
  | { type: "campaignCreate" }
  | { type: "campaignGet"; id: string }
  | { type: "campaignTranscript"; id: string }
  | { type: "campaignMailbox"; id: string; childRunId: string }
  | { type: "campaignChildCancel"; id: string; childRunId: string }
  /**
   * 产物画廊（#/artifacts）：扫项目 workdirs / 当前 workdir 的 CITE_ARTIFACT_RELS。
   * 不改 cite 同 workdir 政策；不自动重做过期画册。
   */
  | { type: "artifactsList"; projectId: string | null; workdir: string | null }
  | { type: "citeCandidates"; workdir: string | null }
  | { type: "workspaceFiles"; workdir: string | null; q: string | null }
  | { type: "workdirRemove" }
  | { type: "workspaceGitGet"; workdir: string | null }
  | { type: "workspaceGitDiff"; workdir: string | null; path: string | null }
  | { type: "workspaceGitCheckout" }
  | { type: "workspaceGitPrGet"; workdir: string | null }
  | { type: "workspaceGitPrCreate" }
  | { type: "fsList"; path: string | null }
  | { type: "fsMkdir" }
  | { type: "memoryList"; scope: "current" | "all"; workdir?: string }
  | { type: "memoryRead"; name: string }
  | { type: "searchRuns"; query: string; limit: string | null }
  | { type: "runChanges"; runId: string; workdir: string | null }
  | { type: "runsList" }
  | { type: "lifecycleStream" }
  | { type: "transcript"; runId: string }
  | { type: "trace"; runId: string }
  | { type: "inspectPaths"; runId: string }
  | { type: "artifact"; runId: string; path: string; download: boolean }
  | { type: "site"; runId: string; path: string; inspect: boolean; deck: boolean; print: boolean }
  | { type: "siteZip"; runId: string; path: string }
  | { type: "designTemplates" }
  | { type: "designMd"; runId: string }
  | { type: "seedTemplate"; runId: string }
  | { type: "exportPptx"; runId: string }
  | { type: "exportPng"; runId: string }
  | { type: "filePreview"; path: string; workdir: string | null; download: boolean }
  | { type: "officePreview"; runId: string | null; path: string; workdir: string | null }
  | { type: "reveal"; runId: string }
  | { type: "stop"; runId: string }
  | { type: "deleteRun"; runId: string }
  | { type: "followUp"; runId: string }
  | { type: "forkConversation"; runId: string }
  | { type: "rewindConversation"; runId: string }
  | { type: "messageQueue"; runId: string }
  | { type: "extendBudget"; runId: string }
  | { type: "upload" }
  | { type: "uploadDelete" }
  | { type: "createRun" }
  | { type: "schedulesList"; projectId?: string }
  | { type: "scheduleCreate" }
  | { type: "scheduleUpdate"; scheduleId: string }
  | { type: "scheduleDelete"; scheduleId: string }
  | { type: "scheduleRun"; scheduleId: string }
  | { type: "events"; runId: string }
  | { type: "approval"; runId: string; toolUseId: string }
  | { type: "autoApprove"; runId: string }
  | { type: "planApproval"; runId: string }
  | { type: "handoff"; runId: string }
  | { type: "answer"; runId: string }
  | { type: "malformed" };

export function matchRoute(method: string, url: string): Route {
  if (method === "GET" && url === "/health") return { type: "health" };
  if (method === "GET" && url === "/ready") return { type: "ready" };
  if (method === "GET" && url === "/metrics") return { type: "metrics" };
  if (method === "GET" && (url === "/" || url === "/index.html")) {
    return { type: "static", filePath: "index.html" };
  }
  if (method === "GET" && url.startsWith("/") && !url.startsWith("/api/")) {
    const file = url.slice(1);
    if (file.includes("..")) return { type: "malformed" };
    return { type: "static", filePath: file };
  }

  if (method === "GET" && url === "/api/harness") {
    return { type: "harness" };
  }

  /**
   * MODEL-02 模型库端点。路由层只管形状；校验（provider 枚举 / 模型名 /
   * baseUrl 白名单 / roles 引用完整性）全部在 model-config.ts 的
   * validateModelConfig —— 与 schedules 的"路由管形状、处理器管语义"同模式。
   */
  if (method === "GET" && url === "/api/models") {
    return { type: "modelsGet" };
  }
  if (method === "PUT" && url === "/api/models") {
    return { type: "modelsPut" };
  }
  /** 只改角色分配（composer 快捷换执行模型）；不动库条目与密钥。 */
  if (method === "PATCH" && url === "/api/models/roles") {
    return { type: "modelsRolesPatch" };
  }
  if (method === "POST" && url === "/api/models/test") {
    return { type: "modelsTest" };
  }
  if (method === "POST" && url === "/api/models/sync-env") {
    return { type: "modelsSyncEnv" };
  }
  if (method === "GET" && url === "/api/vendors") {
    return { type: "vendorsGet" };
  }
  if (method === "POST" && url === "/api/vendors") {
    return { type: "vendorsEnable" };
  }
  if (method === "GET" && url === "/api/pricing") {
    return { type: "pricingGet" };
  }
  if (method === "POST" && url === "/api/pricing/refresh") {
    return { type: "pricingRefresh" };
  }
  if (method === "GET" && url === "/api/usage") {
    return { type: "usageGet" };
  }
  if (method === "GET" && url === "/api/mcp") {
    return { type: "mcpGet" };
  }
  if (method === "PUT" && url === "/api/mcp") {
    return { type: "mcpPut" };
  }
  if (method === "POST" && url === "/api/mcp/install") {
    return { type: "mcpInstall" };
  }
  if (method === "POST" && url === "/api/mcp/uninstall") {
    return { type: "mcpUninstall" };
  }
  if (method === "POST" && url === "/api/mcp/skills") {
    return { type: "mcpSkills" };
  }
  if (method === "GET" && url === "/api/packs") {
    return { type: "packsGet" };
  }
  if (method === "POST" && url === "/api/packs/drafts") {
    return { type: "packsDraft" };
  }
  const packInstallMatch = method === "POST" && url.match(/^\/api\/packs\/drafts\/([^/]+)\/install$/);
  if (packInstallMatch) {
    return { type: "packsInstall", name: decodeURIComponent(packInstallMatch[1]!) };
  }
  const packDiscardMatch = method === "DELETE" && url.match(/^\/api\/packs\/drafts\/([^/]+)$/);
  if (packDiscardMatch) {
    return { type: "packsDiscard", name: decodeURIComponent(packDiscardMatch[1]!) };
  }

  /**
   * V-29 运行时白名单扩展（委托方："工作目录切换只能重启宿主，很麻烦——
   * 新建对话的时候就开始选目录"）。路由层只管形状；校验（绝对路径 / 存在 /
   * 是目录 / env 声明不可删 / 在飞保护）与 loopback 门都在处理器里——
   * 与 /api/models 的"路由管形状、处理器管语义"同模式。
   */
  if (method === "GET" && url === "/api/workdirs") {
    return { type: "workdirsList" };
  }
  if (method === "POST" && url === "/api/workdirs") {
    return { type: "workdirAdd" };
  }
  if (method === "POST" && url === "/api/design-drafts-workdir") {
    return { type: "designDraftsWorkdir" };
  }
  const citeCandidatesMatch = method === "GET" && url.match(/^\/api\/cite-candidates(?:\?(.*))?$/);
  if (citeCandidatesMatch) {
    const params = new URLSearchParams(citeCandidatesMatch[1] ?? "");
    return { type: "citeCandidates", workdir: params.get("workdir") };
  }
  const workspaceFilesMatch = method === "GET" && url.match(/^\/api\/workspace\/files(?:\?(.*))?$/);
  if (workspaceFilesMatch) {
    const params = new URLSearchParams(workspaceFilesMatch[1] ?? "");
    return { type: "workspaceFiles", workdir: params.get("workdir"), q: params.get("q") };
  }
  if (method === "DELETE" && url === "/api/workdirs") {
    return { type: "workdirRemove" };
  }
  if (method === "GET" && url === "/api/projects") {
    return { type: "projectsList" };
  }
  if (method === "POST" && url === "/api/projects") {
    return { type: "projectCreate" };
  }
  const projectPatchMatch = method === "PATCH" && url.match(/^\/api\/projects\/([^/]+)$/);
  if (projectPatchMatch) {
    return { type: "projectPatch", id: decodeURIComponent(projectPatchMatch[1]!) };
  }
  const projectRemoveMatch = method === "DELETE" && url.match(/^\/api\/projects\/([^/]+)$/);
  if (projectRemoveMatch) {
    return { type: "projectRemove", id: decodeURIComponent(projectRemoveMatch[1]!) };
  }
  if (method === "GET" && url === "/api/campaigns") {
    return { type: "campaignsList" };
  }
  if (method === "POST" && url === "/api/campaigns") {
    return { type: "campaignCreate" };
  }
  const campaignTranscriptMatch = method === "GET" && url.match(/^\/api\/campaigns\/([^/]+)\/transcript$/);
  if (campaignTranscriptMatch) {
    return { type: "campaignTranscript", id: decodeURIComponent(campaignTranscriptMatch[1]!) };
  }
  const campaignMailboxMatch = method === "GET" && url.match(/^\/api\/campaigns\/([^/]+)\/mailbox\/([^/]+)$/);
  if (campaignMailboxMatch) {
    return {
      type: "campaignMailbox",
      id: decodeURIComponent(campaignMailboxMatch[1]!),
      childRunId: decodeURIComponent(campaignMailboxMatch[2]!),
    };
  }
  const campaignCancelMatch = method === "POST" && url.match(/^\/api\/campaigns\/([^/]+)\/children\/([^/]+)\/cancel$/);
  if (campaignCancelMatch) {
    return {
      type: "campaignChildCancel",
      id: decodeURIComponent(campaignCancelMatch[1]!),
      childRunId: decodeURIComponent(campaignCancelMatch[2]!),
    };
  }
  const campaignGetMatch = method === "GET" && url.match(/^\/api\/campaigns\/([^/]+)$/);
  if (campaignGetMatch) {
    return { type: "campaignGet", id: decodeURIComponent(campaignGetMatch[1]!) };
  }

  /**
   * ----- 产物画廊 #/artifacts（section 3 + deck-stale）-----
   * 只加这一条 GET。不改上面的 projects 处理器，也不动 cite-candidates。
   */
  const artifactsMatch = method === "GET" && url.match(/^\/api\/artifacts(?:\?(.*))?$/);
  if (artifactsMatch) {
    const params = new URLSearchParams(artifactsMatch[1] ?? "");
    return {
      type: "artifactsList",
      projectId: params.get("projectId"),
      workdir: params.get("workdir"),
    };
  }

  const workspaceGitMatch = method === "GET" && url.match(/^\/api\/workspace\/git(?:\?(.*))?$/);
  if (workspaceGitMatch) {
    const params = new URLSearchParams(workspaceGitMatch[1] ?? "");
    return { type: "workspaceGitGet", workdir: params.get("workdir") };
  }
  if (method === "POST" && url === "/api/workspace/git/checkout") {
    return { type: "workspaceGitCheckout" };
  }
  const workspaceGitPrMatch = method === "GET" && url.match(/^\/api\/workspace\/git\/pr(?:\?(.*))?$/);
  if (workspaceGitPrMatch) {
    const params = new URLSearchParams(workspaceGitPrMatch[1] ?? "");
    return { type: "workspaceGitPrGet", workdir: params.get("workdir") };
  }
  if (method === "POST" && url === "/api/workspace/git/pr") {
    return { type: "workspaceGitPrCreate" };
  }
  const workspaceGitDiffMatch = method === "GET" && url.match(/^\/api\/workspace\/git\/diff(?:\?(.*))?$/);
  if (workspaceGitDiffMatch) {
    const params = new URLSearchParams(workspaceGitDiffMatch[1] ?? "");
    return { type: "workspaceGitDiff", workdir: params.get("workdir"), path: params.get("path") };
  }

  /**
   * 目录浏览（给「添加目录」浮层供数）。只列目录不列文件，隐藏目录（.开头）
   * 不列；path 省略时给常用起点。读权限问题与符号链接归一都在处理器里。
   */
  const fsListMatch = method === "GET" && url.match(/^\/api\/fs\/list(?:\?(.*))?$/);
  if (fsListMatch) {
    const params = new URLSearchParams(fsListMatch[1] ?? "");
    return { type: "fsList", path: params.get("path") };
  }
  if (method === "POST" && url === "/api/fs/mkdir") {
    return { type: "fsMkdir" };
  }

  /**
   * T5 记忆面板（L5 可审查化）：只读暴露默认 workdir 作用域的 .agent-memory/。
   * name 与 MemoryStore.NAME_RE 对齐（含嵌套路径）；捕获 catch-all 段并 decode，
   * ".." 与 resolvePath 仍防穿越。注意顺序：/:name 在精确 /api/memory 之后。
   */
  if (method === "GET" && (url === "/api/memory" || url.startsWith("/api/memory?"))) {
    const params = new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
    const scopeRaw = String(params.get("scope") ?? "current").trim().toLowerCase();
    const scope = scopeRaw === "all" ? "all" : "current";
    const asked = params.get("workdir");
    return {
      type: "memoryList",
      scope,
      ...(asked ? { workdir: asked } : {}),
    };
  }
  /**
   * T5 /api/memory/:name 的合法记忆名：与 MemoryStore.NAME_RE 对齐（允许嵌套
   * lessons/foo.md）。路径穿越仍由 ".." 与 resolvePath 双保险挡住。
   */
  const memoryReadMatch = method === "GET" && url.match(/^\/api\/memory\/([^?#]+)$/);
  if (memoryReadMatch) {
    const name = safeDecode(memoryReadMatch[1]!).replaceAll("\\", "/");
    if (!MemoryStore.NAME_RE.test(name) || name.includes("..")) return { type: "malformed" };
    return { type: "memoryRead", name };
  }

  /**
   * T6 全局搜索：q/limit 经查询串传入，具体校验（最短长度/上限钳位）在
   * 处理器里做——路由层只管形状，不管语义（与 /api/runs/:id/artifact 同模式）。
   */
  const searchMatch = method === "GET" && url.match(/^\/api\/search(?:\?(.*))?$/);
  if (searchMatch) {
    const params = new URLSearchParams(searchMatch[1] ?? "");
    return { type: "searchRuns", query: params.get("q") ?? "", limit: params.get("limit") };
  }

  /**
   * T8 变更审查：聚合一个 run 的写盘工具触碰。路由层只管形状；
   * 圈禁（resolveInWorkdir）与 git 降级都在处理器里。
   *
   * T14：可选 ?workdir=——调用方声明"我按这个目录在看这场运行"。路由层照收，
   * 是否与该 run 自己记下的目录一致由处理器判（形状与语义分开，同 /artifact）。
   */
  const changesMatch = method === "GET" && url.match(/^\/api\/runs\/([^/]+)\/changes(?:\?(.*))?$/);
  if (changesMatch) {
    const params = new URLSearchParams(changesMatch[2] ?? "");
    return { type: "runChanges", runId: changesMatch[1]!, workdir: params.get("workdir") };
  }

  if (method === "GET" && url === "/api/runs") {
    return { type: "runsList" };
  }

  if (method === "GET" && url === "/api/stream") {
    return { type: "lifecycleStream" };
  }

  const transcriptMatch = method === "GET" && url.match(/^\/api\/runs\/([^/]+)\/transcript$/);
  if (transcriptMatch) {
    return { type: "transcript", runId: transcriptMatch[1]! };
  }
  const traceMatch = method === "GET" && url.match(/^\/api\/runs\/([^/]+)\/trace$/);
  if (traceMatch) {
    return { type: "trace", runId: traceMatch[1]! };
  }

  const inspectPathsMatch =
    method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/paths\/inspect$/);
  if (inspectPathsMatch) {
    return { type: "inspectPaths", runId: inspectPathsMatch[1]! };
  }

  /**
   * 产物取件（委托方："最终生成的文件有没有办法有超链接给用户直接点击打开"）。
   *
   * 不能用 `file://`——浏览器一律拦截 http 页面跳本地文件协议。所以要经宿主：
   * 它知道这次运行的 workdir，也只肯在那个圈里取文件。
   */
  const artifactMatch = method === "GET" && url.match(/^\/api\/runs\/([^/]+)\/artifact\?(.*)$/);
  if (artifactMatch) {
    const q = new URLSearchParams(artifactMatch[2]!);
    const wanted = q.get("path");
    if (!wanted) return { type: "malformed" };
    return {
      type: "artifact",
      runId: artifactMatch[1]!,
      path: wanted,
      download: q.get("download") === "1",
    };
  }

  /**
   * 整站预览：路径式取件，使 HTML 内相对 CSS/JS 能解析到同目录资源。
   * 仍圈在 run workdir；CSP 允许同源脚本，但 iframe 故意无 allow-same-origin。
   * 查询串（?v=、?inspect=1、?deck=1）必须先剥掉再解码路径。
   */
  const siteQ = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const sitePathOnly = url.split("?", 1)[0]!;
  const siteZipMatch = method === "GET" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/site-zip$/);
  if (siteZipMatch) {
    const qs = new URLSearchParams(siteQ);
    const wanted = qs.get("path");
    if (!wanted) return { type: "malformed" };
    return { type: "siteZip", runId: siteZipMatch[1]!, path: wanted };
  }
  if (method === "GET" && url === "/api/design-templates") {
    return { type: "designTemplates" };
  }
  const designMdMatch = method === "GET" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/design-md$/);
  if (designMdMatch) {
    return { type: "designMd", runId: designMdMatch[1]! };
  }
  const seedTemplateMatch =
    method === "POST" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/seed-template$/);
  if (seedTemplateMatch) {
    return { type: "seedTemplate", runId: seedTemplateMatch[1]! };
  }
  const exportPptxMatch =
    method === "POST" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/export\/pptx$/);
  if (exportPptxMatch) {
    return { type: "exportPptx", runId: exportPptxMatch[1]! };
  }
  const exportPngMatch =
    method === "POST" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/export\/png$/);
  if (exportPngMatch) {
    return { type: "exportPng", runId: exportPngMatch[1]! };
  }
  const siteMatch = method === "GET" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/site\/(.+)$/);
  if (siteMatch) {
    try {
      const qs = new URLSearchParams(siteQ);
      return {
        type: "site",
        runId: siteMatch[1]!,
        path: decodeSitePreviewPath(siteMatch[2]!),
        inspect: qs.get("inspect") === "1",
        deck: qs.get("deck") === "1",
        print: qs.get("print") === "1",
      };
    } catch {
      return { type: "malformed" };
    }
  }

  /**
   * V-35 文件预览：不绑定 run 的只读取件——上传完还没有 run、或要看的
   * 文件不属于当前会话时走这里。圈禁口径与上传同一条线（白名单工作目录），
   * 具体校验在处理器里——路由层只管形状，与 artifact 同模式。
   */
  const filePreviewMatch = method === "GET" && url.match(/^\/api\/file-preview\?(.*)$/);
  if (filePreviewMatch) {
    const q = new URLSearchParams(filePreviewMatch[1]!);
    const wanted = q.get("path");
    if (!wanted) return { type: "malformed" };
    return {
      type: "filePreview",
      path: wanted,
      workdir: q.get("workdir"),
      download: q.get("download") === "1",
    };
  }

  /**
   * Office 预览 JSON：.pptx / .docx 拆页（文本 + 嵌入图）。
   * 圈禁与 file-preview / artifact 同一把尺；只出结构化页，不执行宏、不解密。
   */
  const officePreviewMatch = method === "GET" && url.match(/^\/api\/office-preview\?(.*)$/);
  if (officePreviewMatch) {
    const q = new URLSearchParams(officePreviewMatch[1]!);
    const wanted = q.get("path");
    if (!wanted) return { type: "malformed" };
    return { type: "officePreview", runId: null, path: wanted, workdir: q.get("workdir") };
  }
  const runOfficePreviewMatch =
    method === "GET" && sitePathOnly.match(/^\/api\/runs\/([^/]+)\/office-preview$/);
  if (runOfficePreviewMatch) {
    const wanted = new URLSearchParams(siteQ).get("path");
    if (!wanted) return { type: "malformed" };
    return {
      type: "officePreview",
      runId: runOfficePreviewMatch[1]!,
      path: wanted,
      workdir: null,
    };
  }

  const revealMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/reveal$/);
  if (revealMatch) {
    return { type: "reveal", runId: revealMatch[1]! };
  }

  const stopMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/stop$/);
  if (stopMatch) {
    return { type: "stop", runId: stopMatch[1]! };
  }

  const deleteMatch = method === "DELETE" && url.match(/^\/api\/runs\/([^/]+)$/);
  if (deleteMatch) {
    return { type: "deleteRun", runId: deleteMatch[1]! };
  }

  if (method === "POST" && url === "/api/upload") {
    return { type: "upload" };
  }

  // 附件清单的删除：与上传同一条圈禁线，且只许碰 uploads/ 子目录内的文件
  if (method === "DELETE" && url === "/api/upload") {
    return { type: "uploadDelete" };
  }

  const followUpMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/messages$/);
  if (followUpMatch) {
    return { type: "followUp", runId: followUpMatch[1]! };
  }

  const forkMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/fork$/);
  if (forkMatch) {
    return { type: "forkConversation", runId: forkMatch[1]! };
  }

  const rewindMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/rewind$/);
  if (rewindMatch) {
    return { type: "rewindConversation", runId: rewindMatch[1]! };
  }

  // 信息队列：取消排队中的消息。body 可带 { index } 取消单条；空 body = 清空整队
  const queueMatch = method === "DELETE" && url.match(/^\/api\/runs\/([^/]+)\/queue$/);
  if (queueMatch) {
    return { type: "messageQueue", runId: queueMatch[1]! };
  }

  const extendBudgetMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/extend-budget$/);
  if (extendBudgetMatch) {
    return { type: "extendBudget", runId: extendBudgetMatch[1]! };
  }

  if (method === "POST" && url === "/api/runs") {
    return { type: "createRun" };
  }

  /**
   * T9 定时任务：/api/schedules CRUD + 手动触发。路由层只管形状；
   * 校验（task 非空 / workdir 白名单 / schedule 合法）都在处理器里，
   * 与 /api/runs 的"路由管形状、处理器管语义"同模式。
   */
  if (method === "GET") {
    const [schedulesPath, schedulesQuery = ""] = url.split("?", 2);
    if (schedulesPath === "/api/schedules") {
      const asked = new URLSearchParams(schedulesQuery).get("projectId")?.trim();
      return { type: "schedulesList", ...(asked ? { projectId: asked } : {}) };
    }
  }
  if (method === "POST" && url === "/api/schedules") {
    return { type: "scheduleCreate" };
  }
  const scheduleRunMatch = method === "POST" && url.match(/^\/api\/schedules\/([^/]+)\/run$/);
  if (scheduleRunMatch) {
    return { type: "scheduleRun", scheduleId: scheduleRunMatch[1]! };
  }
  const schedulePatchMatch = method === "PATCH" && url.match(/^\/api\/schedules\/([^/]+)$/);
  if (schedulePatchMatch) {
    return { type: "scheduleUpdate", scheduleId: schedulePatchMatch[1]! };
  }
  const scheduleDeleteMatch = method === "DELETE" && url.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleDeleteMatch) {
    return { type: "scheduleDelete", scheduleId: scheduleDeleteMatch[1]! };
  }

  const eventsMatch = method === "GET" && url.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (eventsMatch) {
    return { type: "events", runId: eventsMatch[1]! };
  }

  const planApprovalMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/plan-approval$/);
  if (planApprovalMatch) {
    return { type: "planApproval", runId: planApprovalMatch[1]! };
  }

  const handoffMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/handoff$/);
  if (handoffMatch) {
    return { type: "handoff", runId: handoffMatch[1]! };
  }

  // §5.2：委托方回答 agent 的澄清问题（或显式跳过）
  const answerMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/answer$/);
  if (answerMatch) {
    return { type: "answer", runId: answerMatch[1]! };
  }

  const autoApproveMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/auto-approve$/);
  if (autoApproveMatch) {
    return { type: "autoApprove", runId: autoApproveMatch[1]! };
  }

  const approvalMatch = method === "POST" && url.match(/^\/api\/runs\/([^/]+)\/approvals\/([^/]+)$/);
  if (approvalMatch) {
    // approvalId 形如 `toolUseId#seq`；`#` 在 URL 里是片段分隔符，客户端必须
    // encodeURIComponent 后再拼路径，这里对应解码
    return {
      type: "approval",
      runId: approvalMatch[1]!,
      toolUseId: safeDecode(approvalMatch[2]!),
    };
  }

  return { type: "malformed" };
}
