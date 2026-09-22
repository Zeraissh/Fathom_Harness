/**
 * features/transcript-grouping — 同类型重复自动折叠成组（T18）。
 *
 * ★ 真因与计划原文不同，如实记在这里（判据也按真因写）：
 *
 * 计划写的是「连续 ≥3 条**同类型工具输出**折叠成组卡」，读作"主区有 12 张
 * 独立的链接卡"。复核证据 `02-chat-code-rail-collapsed-1440.png` 后不成立：
 *   · 那面"链接墙"是**一张卡里的一张 12 行表**——`renderChatItem` 的
 *     `case "sources"` 产出的 `<aside class="chat-sources">`，底下还挂着
 *     「导出链接列表」按钮（截图里看得见），不是 12 个 chat-item；
 *   · 连续的工具调用**早就被折叠了**（`app.js` 的 `collapseToolGroups` 把
 *     相邻 `tool` 项收成一个 `kind:"tools"`，`renderToolGroup` 只铺 featured
 *     那一步）——照计划字面再做一遍连续工具折叠等于空转；
 *   · 表格每行看着占两行高，是因为「来源」列在窄栏里把 `r.title || "链接"`
 *     的兜底字样折成了"链"/"接"两行——12 行里 12 个一模一样的"链接"。
 *
 * 所以本模块折的是**同类型的重复**这件事本身，而不是"工具输出"这个类别：
 *   ① **行列表**：一张卡里同构的行 ≥3（来源表的 `tbody > tr`）→ 整表收起，
 *      只留一条「链接列表（12）」摘要行，展开后给组内搜索框；
 *   ② **兄弟卡片**：`#conversation` 里连续 ≥3 张**同签名**的 chat-item →
 *      收起成一条摘要行 + 组内搜索。签名只认白名单里的可折类型
 *      （来源表 / 产物卡 / 工具组 / 思考 / 状态提示），**结论类一律不折**
 *      （用户消息、助手正文、裁决、审批、计划、改动卡、段分界、错误）——
 *      与 reading-mode 的 classifyUnit 同一保守方向：判错了宁可多留。
 *
 * 工程约束（与 reading-mode 同款，因为它俩是同一条后处理链上的邻居）：
 *   · **纯 DOM 后处理**，不动事件流、不动 transcript 格式、不动 app.js 渲染；
 *   · 用「兄弟摘要行 + 成员加隐藏类」的做法，**不改 `#conversation` 的键控
 *     子节点结构**——`patchList` 按键管那些节点，包一层 wrapper 会让它找不到；
 *   · 跑在 reading-mode **之后**，且**绕开它已经藏掉的东西**（`.rm-hidden`）：
 *     两个后处理器都在同一个容器上干活，不让第二个去折第一个已经折过的。
 *
 * 分层与其他 features 一致：纯函数层可单测；DOM 层由宿主注入回调。
 */

// ---------------------------------------------------------------
// 纯函数层
// ---------------------------------------------------------------

/** 成组阈值：连续同类型达到这个数才折。2 条不值得多一次点击。 */
export const GROUPING_MIN = 3;

/** 文案集中一处，测试与 UI 同源 */
export const GROUPING_COPY = {
  expandTitle: "点击展开这一组",
  collapseTitle: "点击收起这一组",
  searchLabel: "在这一组里搜索",
  searchPlaceholder: "筛选…",
  noMatch: "没有匹配的条目",
};

/**
 * 卡内同构行列表的折叠目标。
 *
 * 目前只有一处真实存在的形态（来源表）。**刻意不写成"所有 table 都折"**：
 * Markdown 正文里的表是结论的一部分，折了就是把答案藏起来。
 *
 * @type {{ selector:string, rowSelector:string, hideSelector:string, label:string }[]}
 */
export const ROW_GROUP_TARGETS = [
  {
    // 来源表：aside.chat-sources 里的 tbody
    selector: "aside.chat-sources",
    rowSelector: "table.chat-sources-table tbody tr",
    hideSelector: ".md-table-wrap",
    label: "链接列表",
  },
];

/**
 * chat-item 的类型签名。
 *
 * 返回 `null` = **不可折**（锚点）。只认白名单，其余一律 null——
 * 与 reading-mode 的 classifyUnit 同一纪律：漏折是小事，误折结论是大事。
 *
 * 判据取 chat-item 的**第一个元素子节点**的形态，与 reading-mode 的分类单位
 * （chat-item 的直接子元素）对齐。
 *
 * @param {Element|null} item
 * @returns {{ sig:string, label:string }|null}
 */
export function itemSignature(item) {
  const el = item && typeof item.querySelector === "function" ? item.firstElementChild : null;
  if (!el || typeof el.matches !== "function") return null;
  if (el.matches("aside.chat-sources")) return { sig: "sources", label: "来源表" };
  if (el.matches(".chat-artifacts")) return { sig: "artifacts", label: "产物卡" };
  if (el.matches("details.chat-tool-group, details.chat-tool")) return { sig: "tool", label: "工具调用" };
  if (el.matches("details.chat-thinking")) return { sig: "thinking", label: "思考" };
  // 注意：.chat-notice 也带 .chat-activity 类，所以 notice 必须先判
  if (el.matches(".chat-notice")) return { sig: "notice", label: "状态提示" };
  if (el.matches(".chat-activity")) return { sig: "activity", label: "动作提示" };
  return null;
}

/**
 * 连续同签名的成组区间。
 *
 * @param {({ sig:string, label:string }|null)[]} signatures 逐项签名，null = 锚点
 * @param {number} [min]
 * @returns {{ start:number, length:number, sig:string, label:string }[]}
 */
export function findRuns(signatures, min = GROUPING_MIN) {
  const runs = [];
  const list = Array.isArray(signatures) ? signatures : [];
  let i = 0;
  while (i < list.length) {
    const cur = list[i];
    if (!cur || !cur.sig) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < list.length && list[j] && list[j].sig === cur.sig) j += 1;
    const length = j - i;
    if (length >= min) runs.push({ start: i, length, sig: cur.sig, label: cur.label });
    i = j;
  }
  return runs;
}

/**
 * 摘要行文案：「链接列表（12）」/「来源表 × 4」。
 *
 * 行列表用「（N）」是因为计划与审视报告都点名了这个形状；兄弟卡片用「× N」
 * 以免两种折叠在界面上长得一样、用户分不清点开会得到什么。
 *
 * @param {string} label
 * @param {number} count
 * @param {"rows"|"items"} shape
 * @returns {string}
 */
export function groupSummaryText(label, count, shape) {
  const n = Number(count) || 0;
  return shape === "rows" ? `${label}（${n}）` : `${label} × ${n}`;
}

/**
 * 组内搜索的匹配判定：大小写不敏感的子串。空查询一律命中（不做"空查询藏全部"）。
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuery(text, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  return String(text ?? "").toLowerCase().includes(q);
}

// ---------------------------------------------------------------
// DOM 层
// ---------------------------------------------------------------

const HIDDEN_CLASS = "tg-hidden";
const SUMMARY_CLASS = "tg-summary";
const BOX_CLASS = "tg-box";

/**
 * 初始化折叠组。幂等：同一容器重复 update 结果一致（每次全量重算）。
 *
 * host 回调：onAnnounce(msg) → aria-live 播报（可选）
 * env（测试注入）：doc
 *
 * @param {Record<string, Function>} [host]
 * @param {{ doc?:Document }} [env]
 */
export function initTranscriptGrouping(host = {}, env = {}) {
  const doc = env.doc ?? document;
  /** 用户展开过的组（组 key 集合）。重算后还原展开态，直播不弹回。 */
  const expandedKeys = new Set();
  /** 组 key → 当前查询串。展开态下重算要还原，否则一重画就清空输入 */
  const queries = new Map();
  /** @type {Element|null} */
  let lastConversation = null;

  /** 撤掉上一轮处理。幂等。 */
  function clearProcessed(container) {
    for (const el of container.querySelectorAll(`.${BOX_CLASS}`)) el.remove();
    for (const el of container.querySelectorAll(`.${HIDDEN_CLASS}`)) el.classList.remove(HIDDEN_CLASS);
    for (const el of container.querySelectorAll("[data-tg-of]")) el.removeAttribute("data-tg-of");
  }

  /**
   * 一个折叠组的外壳：摘要行 +（展开时）搜索框 + 未命中提示。
   *
   * `filter(query, collapsed)` 由调用方给：它负责把该藏的藏掉、该露的露出来，
   * 返回**当前可见条目数**（外壳只据此决定要不要显示"没有匹配的条目"）。
   * 行列表与兄弟卡片的隐藏对象不是一种东西（整表 vs 每张卡），统一成
   * 一个回调比在外壳里塞两套分支干净。
   *
   * @param {{ key:string, text:string, filter:(query:string, collapsed:boolean)=>number }} spec
   */
  function buildBox(spec) {
    const box = doc.createElement("div");
    box.className = BOX_CLASS;
    box.dataset.tgGroup = spec.key;

    const expanded = expandedKeys.has(spec.key);
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = SUMMARY_CLASS;
    btn.setAttribute("aria-expanded", String(expanded));
    btn.title = expanded ? GROUPING_COPY.collapseTitle : GROUPING_COPY.expandTitle;
    const icon = doc.createElement("i");
    icon.className = `ph ${expanded ? "ph-caret-down" : "ph-caret-right"}`;
    icon.setAttribute("aria-hidden", "true");
    const text = doc.createElement("span");
    text.textContent = spec.text;
    btn.appendChild(icon);
    btn.appendChild(text);
    box.appendChild(btn);

    const search = doc.createElement("input");
    search.type = "search";
    search.className = "tg-search";
    search.setAttribute("aria-label", GROUPING_COPY.searchLabel);
    search.placeholder = GROUPING_COPY.searchPlaceholder;
    search.value = queries.get(spec.key) ?? "";
    search.hidden = !expanded;
    box.appendChild(search);

    const empty = doc.createElement("p");
    empty.className = "tg-empty";
    empty.textContent = GROUPING_COPY.noMatch;
    empty.hidden = true;
    box.appendChild(empty);

    /** 按当前查询过滤；收起态一律全藏。 */
    function applyFilter() {
      const collapsed = !expandedKeys.has(spec.key);
      const shown = spec.filter(queries.get(spec.key) ?? "", collapsed);
      empty.hidden = collapsed || shown > 0;
      search.hidden = collapsed;
    }

    btn.addEventListener("click", () => {
      const next = !expandedKeys.has(spec.key);
      if (next) expandedKeys.add(spec.key);
      else expandedKeys.delete(spec.key);
      btn.setAttribute("aria-expanded", String(next));
      btn.title = next ? GROUPING_COPY.collapseTitle : GROUPING_COPY.expandTitle;
      icon.className = `ph ${next ? "ph-caret-down" : "ph-caret-right"}`;
      applyFilter();
      host.onAnnounce?.(next ? `已展开：${spec.text}` : `已收起：${spec.text}`);
    });
    search.addEventListener("input", () => {
      queries.set(spec.key, search.value);
      applyFilter();
    });

    applyFilter();
    return box;
  }

  /** ① 卡内同构行列表 */
  function applyRowGroups(container) {
    for (const target of ROW_GROUP_TARGETS) {
      for (const card of container.querySelectorAll(target.selector)) {
        if (card.closest(`.${HIDDEN_CLASS}`)) continue; // reading-mode 已经藏了，别再折
        const rows = [...card.querySelectorAll(target.rowSelector)];
        if (rows.length < GROUPING_MIN) continue;
        const hideEl = card.querySelector(target.hideSelector);
        const key = `rows:${target.label}:${rows.length}`;
        const box = buildBox({
          key,
          text: groupSummaryText(target.label, rows.length, "rows"),
          /**
           * 收起 = 整表藏掉（一行摘要顶替 12 行），同时把行上的隐藏标撤干净，
           * 免得留一层看不见的状态。
           * 展开 = 表露出来，按当前查询逐行过滤。
           *
           * **查询跨收起保留**（不清空）：搜索框本身也是保留的，输入框里写着
           * "topic-7" 却铺出 12 行才是自相矛盾。用户清空输入即回全量。
           */
          filter: (query, collapsed) => {
            if (hideEl) hideEl.classList.toggle(HIDDEN_CLASS, collapsed);
            let shown = 0;
            for (const row of rows) {
              const hide = collapsed ? false : !matchesQuery(row.textContent ?? "", query);
              row.classList.toggle(HIDDEN_CLASS, hide);
              if (!hide) shown += 1;
            }
            return collapsed ? rows.length : shown;
          },
        });
        card.insertBefore(box, hideEl ?? card.firstChild);
        for (const row of rows) row.dataset.tgOf = key;
      }
    }
  }

  /**
   * ② 兄弟卡片连续同签名。
   *
   * 已被 reading-mode 藏掉的条目**整条跳过**：它们不在屏上，既不该被折，
   * 也不该把一段连续的同类卡片从中间劈开（用户看到的就是连着的）。
   */
  function applyItemGroups(container) {
    const items = [...container.children].filter(
      (c) =>
        c.classList?.contains("chat-item")
        && !c.classList.contains("rm-hidden")
        && !c.firstElementChild?.classList?.contains("rm-hidden"),
    );
    const runs = findRuns(items.map((item) => itemSignature(item)));
    // 从后往前插：先插前面的会让后面的下标失效
    for (const run of [...runs].reverse()) {
      const members = items.slice(run.start, run.start + run.length);
      const key = `items:${run.sig}:${run.start}:${run.length}`;
      const box = buildBox({
        key,
        text: groupSummaryText(run.label, run.length, "items"),
        filter: (query, collapsed) => {
          let shown = 0;
          for (const member of members) {
            const hide = collapsed || !matchesQuery(member.textContent ?? "", query);
            member.classList.toggle(HIDDEN_CLASS, hide);
            if (!hide) shown += 1;
          }
          return shown;
        },
      });
      for (const member of members) member.dataset.tgOf = key;
      container.insertBefore(box, members[0]);
    }
  }

  /** @param {Element|null} container */
  function apply(container) {
    if (!container) return;
    clearProcessed(container);
    applyRowGroups(container);
    applyItemGroups(container);
  }

  const api = {
    /**
     * 宿主每次渲染对话详情后调用，**排在 reading-mode.update 之后**。
     * @param {Element|null} conversation
     */
    update(conversation) {
      lastConversation = conversation ?? null;
      apply(lastConversation);
    },
    /** 测试与诊断用 */
    getExpandedKeys: () => [...expandedKeys],
    getGroupCount: () => lastConversation?.querySelectorAll(`.${BOX_CLASS}`).length ?? 0,
  };
  return api;
}
