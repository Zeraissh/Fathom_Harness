/**
 * features/file-tree — 右侧工作区文件栏（MVP，不是完整 IDE）。
 *
 * 挂在 `#center-row` 最右，Work / Code 都有：对话在中间，文件在右边。
 * 展开走既有 `GET /api/workspace/files?q=dir/`（浅列 + resolveInWorkdir）。
 * 点文件走宿主 onPreview（预览坞 / 产物画布，不走 file://）。
 * 行内 @ 走宿主 onCite（同一套 insert @path）。不发明第三套交互。
 *
 * 与 memory-panel / file-preview 同一约定：纯函数可单测；
 * initFileTree(host, env) 由宿主注入回调，本模块不反向 import 宿主。
 */

import { humanizeHttpFailure } from "./humanize-error.js";

/** 空态 / 按钮 / 失败（HTTP 码不进脸上）。截断与过深用服务端 notice。 */
export const FILE_TREE_COPY = {
  title: "文件",
  collapse: "收起文件",
  expand: "显示文件",
  empty: "这个文件夹是空的。",
  emptyRoot: "这个工作目录里还没有可列出的文件。",
  confirming: "正在确认目录…",
  noWorkdir: "先选一个工作目录。",
  loading: "正在列出文件…",
  cite: "插入 @ 引用",
  network: "文件列表加载失败（网络错误）",
};

/** 折叠偏好。1 = 收起。 */
export const FILES_RAIL_PREF = "agent.ui.pref.filesRailCollapsed";

/** 目录展开态的跨会话记忆。按工作目录分组——两个项目的目录名会重名。 */
export const TREE_EXPANDED_PREF = "agent.ui.pref.treeExpanded";
/** 记多少个工作目录。超出就丢最老的——这是偏好，不是数据。 */
const TREE_EXPANDED_MAX_WORKDIRS = 20;

/** `src` → `src/`，根是空字符串。与 ui/workspace-files.ts 的 treeQueryForDir 同形。 */
export function treeQueryForDir(dir) {
  const rel = String(dir ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return rel ? `${rel}/` : "";
}

export function buildWorkspaceTreeUrl(workdir, dir) {
  const q = new URLSearchParams();
  if (workdir) q.set("workdir", String(workdir));
  const treeQ = treeQueryForDir(dir);
  if (treeQ) q.set("q", treeQ);
  return `/api/workspace/files?${q}`;
}

export function isTreeNotice(entry) {
  return Boolean(entry && typeof entry.notice === "string" && entry.notice.trim());
}

/**
 * 把服务端 files[] 分成真实条目与人话提示。
 * @param {unknown} files
 * @returns {{ entries: object[], notices: object[] }}
 */
export function splitTreeEntries(files) {
  const list = Array.isArray(files) ? files : [];
  const entries = [];
  const notices = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    if (isTreeNotice(raw)) {
      notices.push({
        notice: String(raw.notice).trim(),
        relative: String(raw.relative ?? "").replace(/\\/g, "/"),
      });
      continue;
    }
    const kind = raw.kind === "directory" ? "directory" : raw.kind === "file" ? "file" : "";
    const relative = String(raw.relative ?? "").replace(/\\/g, "/");
    const name = String(raw.name ?? "").trim() || relative.split("/").pop() || "";
    if (!kind || !relative || !name) continue;
    entries.push({ name, relative, kind });
  }
  return { entries, notices };
}

export function humanizeTreeFailure(status, bodyError) {
  const raw = typeof bodyError === "string" ? bodyError.trim() : "";
  if (raw && !/\bHTTP\s*\d{3}\b/i.test(raw) && !/^\d{3}$/.test(raw)) return raw;
  return humanizeHttpFailure(status, raw || FILE_TREE_COPY.network);
}

/** 展开集合的纯函数翻转。路径统一正斜杠。 */
export function toggleExpanded(expanded, relative) {
  const key = String(relative ?? "").replace(/\\/g, "/");
  const next = new Set(expanded ?? []);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function readFilesRailCollapsed(storage) {
  try {
    return storage?.getItem?.(FILES_RAIL_PREF) === "1";
  } catch {
    return false;
  }
}

export function writeFilesRailCollapsed(storage, collapsed) {
  try {
    if (!storage) return;
    if (collapsed) storage.setItem(FILES_RAIL_PREF, "1");
    else storage.removeItem(FILES_RAIL_PREF);
  } catch { /* 存储不可写只丢偏好 */ }
}

function childDepth(relative) {
  const rel = String(relative ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!rel) return 0;
  return rel.split("/").filter(Boolean).length;
}

/**
 * 目录名属于哪个噪音组；不属于任何组返回 null（A6 的降噪折叠）。
 *
 * 判据是**约定**不是启发式：本仓的临时产物目录一律以下划线开头。
 * 两步取组名：
 *   ① 取到第一个连字符或数字之前  ② 再剥掉尾部的大写字母或数字
 * 于是 `_probe2-p1`、`_probeA-profile-9964`、`_probe-profile-9924`
 * **都落进同一个 `_probe` 组**——这是关键，第二步是 2026-09-20 拿
 * 真实目录名量过之后补的（只有第一步时，那三个会碎成三个组，
 * 而"≥2 才成组"让每族只剩一个的全部原样显示）。
 *
 * **小写结尾不剥**：`_ags` / `_research` / `_lfchk` 本身就是完整的词，
 * 剥成 `_ag` / `_researc` 是错的。
 *
 * **正常目录一律返回 null**：降噪是收拾噪音，不是替人决定什么不该看
 * （仓库树的排除规则 `shouldSkipName` 本计划不动，见 Global Constraints）。
 */
export function noiseGroupOf(name) {
  const n = String(name ?? "");
  if (!n.startsWith("_")) return null;
  const head = n.match(/^[^-\d]*/)?.[0] ?? "";
  /**
   * ★ 再剥掉尾部的**大写字母或数字**——同一族要落到同一个组
   * （2026-09-20 拿委托方的真实目录名量的）。
   *
   * 只取到"第一个连字符或数字之前"是不够的：那会把
   * `_probe` / `_probeA` / `_probeB` … 判成**七个不同的组**，再叠上
   * "≥2 才成组"，每族只剩一个的（`_probeB`..`_probeF`）就全部原样显示——
   * 实测 56 个目录里还有 24 行躺在树里，Chrome 配置目录的内容铺满整栏。
   * **而它们明明是同一族。**
   *
   * **小写结尾不许剥**：`_ags` 剥成 `_ag`、`_research` 剥成 `_researc`
   * 都是错的——那些名字本身就是完整的词。
   */
  const stem = head.replace(/[A-Z0-9]+$/, "");
  // 剥完太短就退回没剥的（`_A` 这种，名字本身就是它）
  return (stem.length >= 2 ? stem : head) || null;
}

/**
 * 把一层条目折成**有序**的一摞（A6 的降噪折叠）。
 *
 * 返回 `items` 而不是 `{shown, groups}` 两摞：**排序是服务端的事**
 * （`ui/workspace-files.ts:90-96`，目录在前 + `localeCompare("en")`），
 * `file-tree.js` 按返回顺序直接渲染、从不排序（勘查核实过）。两摞并排
 * 会让渲染层不得不决定"组插回哪儿"，那等于在这里再排一次序。
 * 组落在**它第一个成员的位置**上，顺序因此是构造出来的。
 *
 * **只有 ≥2 个成员才成组**——单个 `_qa` 折成一行反而更难找。
 *
 * @param {{name:string, relative:string, kind:string}[]|null|undefined} entries
 * @returns {{items: Array<{type:"entry", entry:object} | {type:"group", key:string, label:string, count:number, members:object[]}>}}
 */
export function foldNoiseEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** 先数一遍：只有 ≥2 个成员的组才折 */
  const counts = new Map();
  for (const e of list) {
    const key = e?.kind === "directory" ? noiseGroupOf(e.name) : null;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  /** @type {object[]} */
  const items = [];
  const placed = new Set();
  for (const e of list) {
    const key = e?.kind === "directory" ? noiseGroupOf(e.name) : null;
    if (!key || (counts.get(key) ?? 0) < 2) { items.push({ type: "entry", entry: e }); continue; }
    if (placed.has(key)) continue;                 // 已在本组里，不重复放
    placed.add(key);
    items.push({
      type: "group",
      key,
      label: `${key} 系列`,
      count: counts.get(key),
      members: list.filter((m) => m?.kind === "directory" && noiseGroupOf(m.name) === key),
    });
  }
  return { items };
}

/**
 * 读展开态记忆。**localStorage 里什么都可能有**（别的版本写的、人手改的、
 * 半截写入的），所以每一层都当坏值处理，读不出来就当没有——偏好丢了是小事，
 * 让文件树整块崩掉是大事。
 */
export function readTreeExpanded(storage) {
  try {
    const raw = storage?.getItem?.(TREE_EXPANDED_PREF);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [wd, paths] of Object.entries(parsed)) {
      if (!Array.isArray(paths)) continue;
      const clean = paths.filter((p) => typeof p === "string" && p);
      if (clean.length) out[wd] = clean;
    }
    return out;
  } catch { return {}; }
}

/** 写展开态记忆。工作目录数超上限就丢最老的（插入序即最老）。 */
export function writeTreeExpanded(storage, workdir, paths) {
  const wd = String(workdir ?? "");
  if (!wd) return;
  try {
    const all = readTreeExpanded(storage);
    const clean = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === "string" && p);
    delete all[wd];                        // 先删再塞：把它挪到插入序的末尾
    if (clean.length) all[wd] = clean;
    const keys = Object.keys(all);
    for (const stale of keys.slice(0, Math.max(0, keys.length - TREE_EXPANDED_MAX_WORKDIRS))) {
      delete all[stale];
    }
    if (Object.keys(all).length) storage?.setItem?.(TREE_EXPANDED_PREF, JSON.stringify(all));
    else storage?.removeItem?.(TREE_EXPANDED_PREF);
  } catch { /* 存储不可写只丢偏好 */ }
}

/**
 * @param {{
 *   mount?: HTMLElement,
 *   getWorkdir?: () => string,
 *   onPreview?: (path: string) => void,
 *   onCite?: (path: string, kind: "file"|"directory") => void,
 *   onAnnounce?: (msg: string) => void,
 * }} [host]
 * @param {{ doc?: Document, fetch?: Function, storage?: Storage|null, collapsed?: boolean }} [env]
 */
export function initFileTree(host = {}, env = {}) {
  const mount = host.mount;
  if (!mount) return null;
  if (mount.__fileTreeApi) return mount.__fileTreeApi;

  const doc = env.doc ?? mount.ownerDocument ?? document;
  const fetchImpl = env.fetch
    ?? (typeof fetch !== "undefined" ? fetch.bind(env.win ?? globalThis) : null);
  const storage = env.storage !== undefined
    ? env.storage
    : (() => {
        try { return (env.win ?? globalThis).localStorage ?? null; } catch { return null; }
      })();

  mount.classList.add("files-rail", "workspace-file-tree");
  mount.replaceChildren();

  const head = doc.createElement("div");
  head.className = "workspace-file-tree-head";

  const title = doc.createElement("span");
  title.className = "files-rail-title";
  title.textContent = FILE_TREE_COPY.title;

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = "files-rail-toggle";

  // A6 的一对按钮：懒加载树上做不到字面意义的「全部展开」（树逐层拉、
  // 服务端有深度 8/每层 200 两道闸），展开到第二层，title 写明这个界限。
  const allBtn = doc.createElement("button");
  allBtn.type = "button";
  allBtn.className = "files-rail-all";
  allBtn.textContent = "展开";
  allBtn.title = "展开到第二层（整棵树是逐层拉的，真的全开会把每一层都请求一遍）";
  allBtn.addEventListener("click", () => void expandTopLevel());

  const noneBtn = doc.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = "files-rail-all";
  noneBtn.textContent = "折叠";
  noneBtn.title = "全部折叠";
  noneBtn.addEventListener("click", () => { expanded = new Set(); expandedGroups.clear(); persistExpanded(); paint(); });

  const body = doc.createElement("div");
  body.className = "workspace-file-tree-body";
  body.id = "workspace-file-tree-body";
  body.setAttribute("aria-label", "工作区文件");

  toggle.setAttribute("aria-controls", body.id);
  head.appendChild(title);
  head.appendChild(toggle);
  head.appendChild(allBtn);
  head.appendChild(noneBtn);
  mount.appendChild(head);
  mount.appendChild(body);

  /** @type {Map<string, { entries: object[], notices: object[] }>} */
  const cache = new Map();
  /** @type {Set<string>} */
  let expanded = new Set();
  /** 记住展开态（A6）。reload 换目录时从记忆里恢复，不再一律清空。 */
  function persistExpanded() {
    writeTreeExpanded(storage, workdirNow(), [...expanded]);
  }
  /** @type {Set<string>} */
  const loading = new Set();
  /** @type {string} */
  let lastWorkdir = "";
  /** @type {string} */
  let rootError = "";
  let loadToken = 0;
  let collapsed = env.collapsed !== undefined
    ? Boolean(env.collapsed)
    : readFilesRailCollapsed(storage);

  function workdirNow() {
    return String(host.getWorkdir?.() ?? "").trim();
  }

  function syncCollapsedChrome() {
    mount.classList.toggle("files-rail--collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? FILE_TREE_COPY.expand : FILE_TREE_COPY.collapse);
    toggle.textContent = collapsed ? `⟨ ${FILE_TREE_COPY.title}` : `${FILE_TREE_COPY.title} ⟩`;
  }

  function setCollapsed(next) {
    const target = Boolean(next);
    if (collapsed === target) {
      syncCollapsedChrome();
      return collapsed;
    }
    collapsed = target;
    writeFilesRailCollapsed(storage, collapsed);
    syncCollapsedChrome();
    return collapsed;
  }

  function paint() {
    const wd = workdirNow();
    body.replaceChildren();
    if (!wd) {
      const empty = doc.createElement("p");
      empty.className = "ft-empty";
      // 三态：还没问完（上下文未落定）≠ 确实没有。
      // host 不提供 isContextReady 时按旧行为视为已落定 —— 独立用法与老测试不受影响。
      const settled = host.isContextReady?.() !== false;
      empty.textContent = settled ? FILE_TREE_COPY.noWorkdir : FILE_TREE_COPY.confirming;
      body.appendChild(empty);
      host.onEntriesChanged?.(null); // 未知：右列不据此自动开（走查：内容驱动）
      return;
    }
    if (rootError) {
      const err = doc.createElement("p");
      err.className = "ft-error";
      err.textContent = rootError;
      body.appendChild(err);
      host.onEntriesChanged?.(null);
      return;
    }
    renderLevel("");
    const rootCache = cache.get("");
    host.onEntriesChanged?.(rootCache ? rootCache.entries.length : null);
  }

  function appendNotice(text) {
    const p = doc.createElement("p");
    p.className = "ft-notice";
    p.textContent = text;
    body.appendChild(p);
  }

  function renderLevel(parentRel) {
    if (loading.has(parentRel)) {
      if (parentRel === "") {
        const p = doc.createElement("p");
        p.className = "ft-empty";
        p.textContent = FILE_TREE_COPY.loading;
        body.appendChild(p);
      }
      return;
    }
    const cached = cache.get(parentRel);
    if (!cached) return;
    for (const n of cached.notices) appendNotice(n.notice);
    if (!cached.entries.length && !cached.notices.length) {
      const p = doc.createElement("p");
      p.className = "ft-empty";
      p.textContent = parentRel ? FILE_TREE_COPY.empty : FILE_TREE_COPY.emptyRoot;
      body.appendChild(p);
      return;
    }
    const depth = parentRel ? childDepth(parentRel) : 0;
    for (const item of foldNoiseEntries(cached.entries).items) {
      if (item.type === "group") {
        body.appendChild(renderGroupRow(item, parentRel, depth));
        if (expandedGroups.has(groupKey(parentRel, item.key))) {
          for (const member of item.members) {
            body.appendChild(renderRow(member, depth));
            if (expanded.has(member.relative)) {
              // 与顶层同症状（review Minor-1）：记忆里展开的成员，缓存缺失时
              // 静默 return 会留下「twist 朝下却没有子行」的空转。没缓存就补拉。
              if (cache.has(member.relative)) renderLevel(member.relative);
              else void loadDir(member.relative);
            }
          }
        }
        continue;
      }
      const entry = item.entry;
      body.appendChild(renderRow(entry, depth));
      if (entry.kind === "directory" && expanded.has(entry.relative)) {
        // A6：记忆里恢复出来的展开态，子层多半还没拉过——twist 朝下却没有
        // 子行，看着像坏了。没缓存就补拉，拉到后 paint 会把子行画出来。
        if (cache.has(entry.relative)) renderLevel(entry.relative);
        else void loadDir(entry.relative);
      }
    }
  }

  function renderRow(entry, depth) {
    const row = doc.createElement("div");
    row.className = "ft-row";
    row.dataset.path = entry.relative;
    row.dataset.kind = entry.kind;
    row.style.setProperty("--ft-depth", String(depth));

    if (entry.kind === "directory") {
      const twist = doc.createElement("button");
      twist.type = "button";
      twist.className = "ft-twist";
      const open = expanded.has(entry.relative);
      twist.setAttribute("aria-expanded", String(open));
      twist.setAttribute("aria-label", open ? `折叠 ${entry.name}` : `展开 ${entry.name}`);
      twist.innerHTML = `<i class="ph ${open ? "ph-caret-down" : "ph-caret-right"}" aria-hidden="true"></i>`;
      twist.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void toggleDir(entry.relative);
      });
      row.appendChild(twist);
    } else {
      const pad = doc.createElement("span");
      pad.className = "ft-twist-spacer";
      pad.setAttribute("aria-hidden", "true");
      row.appendChild(pad);
    }

    const nameBtn = doc.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "ft-name";
    // 走查 UX-B4/E15：目录的行名按钮也能切换折叠，展开态得让读屏听得见
    if (entry.kind === "directory") {
      nameBtn.setAttribute("aria-expanded", String(expanded.has(entry.relative)));
    }
    const icon = entry.kind === "directory" ? "ph-folder" : "ph-file";
    nameBtn.innerHTML = `<i class="ph ${icon}" aria-hidden="true"></i>`;
    const label = doc.createElement("span");
    label.textContent = entry.name;
    nameBtn.appendChild(label);
    nameBtn.title = entry.relative;
    nameBtn.addEventListener("click", () => {
      if (entry.kind === "directory") void toggleDir(entry.relative);
      else host.onPreview?.(entry.relative);
    });
    row.appendChild(nameBtn);

    const cite = doc.createElement("button");
    cite.type = "button";
    cite.className = "ft-cite";
    cite.title = FILE_TREE_COPY.cite;
    cite.setAttribute("aria-label", `${FILE_TREE_COPY.cite} ${entry.relative}`);
    cite.textContent = "@";
    cite.addEventListener("click", (ev) => {
      ev.stopPropagation();
      host.onCite?.(entry.relative, entry.kind);
    });
    row.appendChild(cite);
    return row;
  }

  /** 组折叠态（A6）。内存即可——它不像目录展开态那样值得跨会话记。 */
  const expandedGroups = new Set();
  const groupKey = (parentRel, key) => `${parentRel}::${key}`;

  function renderGroupRow(g, parentRel, depth) {
    const row = doc.createElement("div");
    row.className = "ft-row";
    row.style.setProperty("--ft-depth", String(depth));
    // 组键必须带父目录：同一层里两个不同的父目录下都可能有 `_probe` 组，
    // 只用组名做键会让它们互相折叠。
    const key = groupKey(parentRel, g.key);
    const open = expandedGroups.has(key);
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "ft-name ft-group-name";
    btn.setAttribute("aria-expanded", String(open));
    btn.innerHTML = `<i class="ph ${open ? "ph-caret-down" : "ph-caret-right"}" aria-hidden="true"></i>`;
    // 文案照设计案 A6：`_probe 系列（29 个目录，已按类型降噪折叠）`。
    // 名字与计数拆成两个 span：括号里的计数要单独用小字（CSS 要求），
    // 拆开才能各写各的字号；合起来仍是一整句，活页探针按整句找。
    const label = doc.createElement("span");
    label.className = "ft-group-label";
    label.textContent = g.label;
    const count = doc.createElement("span");
    count.className = "ft-group-count";
    count.textContent = `（${g.count} 个，已降噪折叠）`;
    btn.appendChild(label);
    btn.appendChild(count);
    btn.addEventListener("click", () => {
      if (expandedGroups.has(key)) expandedGroups.delete(key);
      else expandedGroups.add(key);
      paint();
    });
    row.appendChild(btn);
    return row;
  }

  async function loadDir(dir) {
    const wd = workdirNow();
    const key = String(dir ?? "").replace(/\\/g, "/");
    // 已经在拉就不重复拉（A6：恢复补拉与「展开到第二层」可能同时点到同一层）。
    // 根除外——根靠 loadToken 判旧，重进必须真重拉。
    if (key !== "" && loading.has(key)) return;
    if (!wd || !fetchImpl) {
      if (key === "") {
        rootError = "";
        paint();
      }
      return;
    }
    const token = ++loadToken;
    loading.add(key);
    if (key === "") {
      rootError = "";
      paint();
    }
    try {
      const res = await fetchImpl(buildWorkspaceTreeUrl(wd, key));
      /**
       * ★ 工作目录在这份应答在飞的时候换掉了 → 弃掉它
       * （2026-09-20 review 的 Important）。
       *
       * 从前只有**根层**查 token，非根层的在飞应答会在工作目录切换后落地，
       * 把**旧目录的数据**以相对路径为键写进新目录的 cache（`reload()` 的
       * `cache.clear()` 发生在它落地之前）。机制是既有的，但本刀的"补拉"
       * 让"无人点击也发请求"成为常态，切换瞬间在拉的概率显著变大。
       *
       * 判据用**工作目录**而不是 token：token 是全局自增的（每次 loadDir
       * 都 `++loadToken`），而「展开到第二层」与补拉会并发拉 N 个目录——
       * 按 token 判会把先发的 N-1 个全弃掉，等于把那两个功能弄坏。
       * 这个 bug 的条件本来就是"换了目录"，用 wd（函数开头取的，天然是
       * "这份请求属于哪个目录"的标签）判最准。
       *
       * 弃掉后 finally 仍会 `loading.delete + paint`：不写 cache（该层保持
       * "没拉到"），paint 里对展开且无缓存的目录会再 kick——这次带着
       * **当前**目录重拉，自愈。
       */
      if (workdirNow() !== wd) return;
      if (token !== loadToken && key === "") return;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = humanizeTreeFailure(res.status, body?.error);
        if (key === "") rootError = message;
        else cache.set(key, { entries: [], notices: [{ notice: message, relative: key }] });
        return;
      }
      const parsed = await res.json().catch(() => null);
      const split = splitTreeEntries(parsed?.files);
      cache.set(key, split);
      if (key === "") rootError = "";
    } catch {
      const message = FILE_TREE_COPY.network;
      if (key === "") rootError = message;
      else cache.set(key, { entries: [], notices: [{ notice: message, relative: key }] });
    } finally {
      loading.delete(key);
      paint();
    }
  }

  async function toggleDir(relative) {
    const key = String(relative ?? "").replace(/\\/g, "/");
    if (!key) return;
    if (expanded.has(key)) {
      expanded.delete(key);
      persistExpanded();
      paint();
      return;
    }
    expanded.add(key);
    persistExpanded();
    if (!cache.has(key)) await loadDir(key);
    else paint();
  }

  async function reload() {
    const wd = workdirNow();
    if (wd !== lastWorkdir) {
      cache.clear();
      // 换工作目录：从记忆里恢复它的展开态，而不是一律清空（A6 的核心诉求）
      expanded = new Set(readTreeExpanded(storage)[wd] ?? []);
      lastWorkdir = wd;
    }
    rootError = "";
    cache.delete("");
    await loadDir("");
  }

  /** 展开到第二层：根 + 根下的目录。再深走 @ 搜索（那是为"找具体文件"设计的路径）。 */
  async function expandTopLevel() {
    const root = cache.get("");
    if (!root) return;
    const dirs = root.entries.filter((e) => e.kind === "directory");
    for (const d of dirs) expanded.add(d.relative);
    persistExpanded();
    paint();
    // 第二层的目录名要看得见，所以把它们的内容也拉回来（这一层是并发的，且服务端每层上限 200）
    await Promise.all(dirs.map((d) => (cache.has(d.relative) ? null : loadDir(d.relative))));
  }

  toggle.addEventListener("click", () => {
    setCollapsed(!collapsed);
  });
  syncCollapsedChrome();

  const api = {
    reload,
    expand: toggleDir,
    setCollapsed,
    isCollapsed: () => collapsed,
    element: mount,
  };
  mount.__fileTreeApi = api;
  return api;
}
