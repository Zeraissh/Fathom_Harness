/**
 * features/attention-bar —— 侧栏顶部「待你处理（N）」跨会话聚合条（T20）。
 *
 * ★ 复用 > 重写：数据**全部来自 T4 通知中心的 store**（`getStore()` 注入），
 * 聚合口径由 `notifications.js` 的 `deriveAttentionSummary` 提供——那边已经有
 * 五类的分类（approval / question / plan_gate / run_end / budget）、
 * 同 run 同类的叠条规则（`collapseDecisionItems`）与已读语义。
 * 本模块只负责**呈现 + 直达**，不建第二份账本，也不自己解析事件。
 *
 * 为什么还要这一条（T4 已经有铃铛了）：铃铛是"点开才看得见"的浮层，
 * 而"哪些事在等我"是**常驻信息**。审视报告的原话是"没有跨会话'待你处理'
 * 聚合，多任务必须逐个翻"。
 *
 * 直达语义：待决类点进去要落到**干预点**（选中会话 + 让决定坞闪一下），
 * 而不是只把会话打开——否则用户还得自己在长对话里找那张卡。
 *
 * 呼吸点用 `--status-warning` 语义令牌，**不用彩色 emoji**（计划明文要求；
 * 也与 v2「去 emoji」那轮的成果一致）。
 */

import { deriveAttentionSummary, attentionBarCopy } from "./notifications.js";

/** 五类的图标（与通知面板 KIND_ICONS 同一套 Phosphor 名，视觉语言不分叉） */
export const ATTENTION_KIND_ICONS = {
  approval: "ph-seal-check",
  question: "ph-question",
  plan_gate: "ph-tree-structure",
  run_end: "ph-flag-checkered",
  budget: "ph-coins",
};

/**
 * 初始化聚合条。幂等：同一 mount 重复调用返回既有实例。
 *
 * host：
 *   getStore()                → T4 的 NotificationStore（必需，拿不到就恒隐藏）
 *   onOpenItem(item)          → 直达干预点（宿主决定 selectRun + revealDock）
 *   onOpenPanel()             → 打开通知中心（"查看全部"）
 *   onAnnounce(msg)           → aria-live 播报
 *
 * @param {Element|null} mount 侧栏里的挂载点
 * @param {Record<string, Function>} [host]
 * @param {{ doc?:Document }} [env]
 */
export function initAttentionBar(mount, host = {}, env = {}) {
  const doc = env.doc ?? document;
  if (!mount) return null;
  if (mount.__attentionBar) {
    mount.__attentionBar.refresh();
    return mount.__attentionBar;
  }

  /** 上一次画出来的签名：没变就不动 DOM（同 patch 纪律，避免无谓重排） */
  let sig = "";
  /** @type {import("./notifications.js").NotificationItem|null} */
  let topItem = null;

  const bar = doc.createElement("div");
  bar.className = "attn-bar";
  bar.hidden = true;

  const main = doc.createElement("button");
  main.type = "button";
  main.className = "attn-main";
  const dot = doc.createElement("span");
  dot.className = "attn-dot";
  dot.setAttribute("aria-hidden", "true");
  const copy = doc.createElement("span");
  copy.className = "attn-copy";
  const title = doc.createElement("strong");
  title.className = "attn-title";
  const detail = doc.createElement("span");
  detail.className = "attn-detail";
  copy.appendChild(title);
  copy.appendChild(detail);
  const kinds = doc.createElement("span");
  kinds.className = "attn-kinds";
  main.appendChild(dot);
  main.appendChild(copy);
  main.appendChild(kinds);
  bar.appendChild(main);

  const all = doc.createElement("button");
  all.type = "button";
  all.className = "attn-all";
  all.textContent = "全部";
  all.title = "打开通知中心，看全部条目";
  bar.appendChild(all);

  main.addEventListener("click", () => {
    if (!topItem) return;
    host.onOpenItem?.(topItem);
  });
  all.addEventListener("click", () => host.onOpenPanel?.());

  function refresh() {
    const store = host.getStore?.() ?? null;
    const summary = deriveAttentionSummary(store ?? { items: [], endedRunIds: [] });
    const text = attentionBarCopy(summary);
    topItem = summary.top;

    if (!text) {
      // 无事可办时整条消失——常驻一个「待你处理（0）」是噪声
      if (sig !== "") {
        sig = "";
        bar.hidden = true;
      }
      return;
    }

    const shownKinds = Object.entries(summary.byKind).filter(([, n]) => n > 0);
    const nextSig = [
      text.title,
      text.detail,
      summary.pending,
      shownKinds.map(([k, n]) => `${k}:${n}`).join(","),
      topItem?.id ?? "",
    ].join("|");
    if (nextSig === sig) return;
    sig = nextSig;

    bar.hidden = false;
    title.textContent = text.title;
    detail.textContent = text.detail;
    // 有待决才呼吸：跑完的回执不该一直闪
    bar.classList.toggle("attn-bar--pending", summary.pending > 0);
    dot.hidden = summary.pending === 0;
    main.setAttribute(
      "aria-label",
      topItem
        ? `${text.title}，${text.detail}。前往：${topItem.runTitle ?? "该会话"} · ${topItem.label}`
        : `${text.title}，${text.detail}`,
    );
    main.disabled = !topItem;

    kinds.innerHTML = "";
    for (const [kind, n] of shownKinds) {
      const chip = doc.createElement("span");
      chip.className = `attn-kind attn-kind--${kind}`;
      const icon = doc.createElement("i");
      icon.className = `ph ${ATTENTION_KIND_ICONS[kind] ?? "ph-dot"}`;
      icon.setAttribute("aria-hidden", "true");
      const num = doc.createElement("span");
      num.textContent = String(n);
      chip.appendChild(icon);
      chip.appendChild(num);
      chip.dataset.attnKind = kind;
      chip.title = `${kind} ${n} 条`;
      kinds.appendChild(chip);
    }
  }

  mount.appendChild(bar);
  refresh();

  const api = {
    element: bar,
    refresh,
    /** 测试与诊断用 */
    getTopItem: () => topItem,
  };
  mount.__attentionBar = api;
  return api;
}
