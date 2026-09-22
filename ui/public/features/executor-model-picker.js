/**
 * features/executor-model-picker — composer 主执行模型选择（Cursor 风格）。
 *
 * 触发钮显示当前模型；弹出层含搜索、列表（勾选当前项）、悬停详情（窗口能力）、
 * 「管理模型…」进设置。隐藏 <select id="executor-model-select"> 仍是事实源
 * （patchComposer 禁启用、提交旁路读值），与 workdir combobox 同款。
 *
 * 零依赖原生 ESM。宿主注入 onSelect / onManage；本模块不反向 import 宿主。
 */

import { executorModelOptionLabel, fillExecutorModelSelect } from "./settings.js";

/** @param {{window?:number|null, windowSource?:string}|null|undefined} win */
export function formatContextWindowLabel(win) {
  if (!win || win.windowSource === "unknown" || win.window == null) {
    return { short: "窗口未知", detail: "登记表没有这条；撞过 400 后会学到真实窗口" };
  }
  const k = win.window >= 1000 ? `${Math.floor(win.window / 1000)}k` : String(win.window);
  const src =
    win.windowSource === "learned" ? "已学"
      : win.windowSource === "registry" ? "登记表"
        : win.windowSource === "env" ? "环境变量"
          : win.windowSource;
  return {
    short: `${k} 上下文窗口`,
    detail: `${k} tokens（来源：${src}）`,
  };
}

/**
 * @param {Array<{id:string,label?:string,model?:string,provider?:string}>} models
 * @param {string} query
 */
export function filterModels(models, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [...models];
  return models.filter((m) => {
    const hay = `${m.label ?? ""} ${m.model ?? ""} ${m.provider ?? ""} ${m.id ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export { fillExecutorModelSelect, executorModelOptionLabel };

/**
 * 执行者看不看得见图（三轮走查 L2，2026-09-19）。
 *
 * 判据在服务端（`nameSuggestsVision`，随 `/api/models` 的 `suggestsVision` 下发）；
 * 这里只负责**在换之前说出来**。委托方把执行者从 `deepseek-flash` 换成 `kimi-k3`
 * 时 `view_image` 静默消失——那条 run 以 partial 收尾，收尾清单里写着
 * 「篆字外皮在近景里未实测过、夜景外皮泛光未实测过」。
 *
 * 保守取舍本身站得住（宁可不认，也不要把只会回 `[Unsupported Image]` 的端点当成
 * VL——09-16 有活探针对照）；站不住的是换的那一刻界面上什么也没说。
 */
export const VISION_TAG = "看不见图";
export const VISION_CAVEAT =
  "这个执行模型看不见图：`view_image` 不进工具面，要看像素得另配识图角色，或换个能看图的执行者。" +
  "（判据是模型名，属保守取舍——宁可不认，也不要把只会回 [Unsupported Image] 的端点当成 VL。）";

/** @param {{suggestsVision?:boolean}|null|undefined} m */
export function visionTag(m) {
  return m?.suggestsVision === false ? VISION_TAG : "";
}

/**
 * @param {{
 *   root?: Document|HTMLElement,
 *   select: HTMLSelectElement,
 *   trigger: HTMLButtonElement,
 *   menu: HTMLElement,
 *   list: HTMLElement,
 *   search: HTMLInputElement,
 *   detail: HTMLElement,
 *   manageBtn: HTMLButtonElement,
 *   valueEl: HTMLElement,
 *   onSelect: (id: string) => void | Promise<void>,
 *   onManage: () => void,
 *   isDisabled?: () => boolean,
 * }} opts
 */
export function initExecutorModelPicker(opts) {
  const doc = opts.root?.ownerDocument ?? (opts.root instanceof Document ? opts.root : document);
  const {
    select,
    trigger,
    menu,
    list,
    search,
    detail,
    manageBtn,
    valueEl,
    onSelect,
    onManage,
    isDisabled,
  } = opts;

  /** @type {any[]} */
  let models = [];
  let selectedId = "";
  let activeIndex = -1;
  let open = false;

  function selectedModel() {
    return models.find((m) => m.id === selectedId) ?? models[0] ?? null;
  }

  function paintTrigger() {
    const m = selectedModel();
    if (!m) {
      valueEl.textContent = models.length ? "选择模型" : "未配置";
      trigger.title = "先在设置 → 模型里保存至少一个执行模型";
      return;
    }
    valueEl.textContent = m.label || m.model;
    const win = formatContextWindowLabel(m.contextWindow);
    // 当前执行者看不见图时，触发键自己就把话说出来——不必点开才知道
    const tag = visionTag(m);
    trigger.title =
      `${m.label || m.model}（${m.provider} · ${m.model}）· ${win.detail}。切换会按新窗口重算水位；进行中的这一轮不受影响。` +
      (tag ? ` ⚠ ${VISION_TAG}：${VISION_CAVEAT}` : "");
  }

  function paintDetail(m) {
    if (!m) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }
    const win = formatContextWindowLabel(m.contextWindow);
    detail.hidden = false;
    detail.innerHTML =
      `<div class="model-picker-detail-title"></div>` +
      `<div class="model-picker-detail-sub"></div>` +
      `<div class="model-picker-detail-win"></div>` +
      `<p class="model-picker-detail-note"></p>`;
    detail.querySelector(".model-picker-detail-title").textContent = m.label || m.model;
    detail.querySelector(".model-picker-detail-sub").textContent = `${m.provider} · ${m.model}`;
    detail.querySelector(".model-picker-detail-win").textContent = win.short;
    detail.querySelector(".model-picker-detail-note").textContent =
      !m.contextWindow || m.contextWindow.windowSource === "unknown" || m.contextWindow.window == null
        ? win.detail
        : `切换后水位按 ${win.detail} 重算`;
    const tag = visionTag(m);
    if (tag) {
      const caveat = doc.createElement("p");
      caveat.className = "model-picker-detail-caveat";
      caveat.textContent = `${VISION_TAG}：${VISION_CAVEAT}`;
      detail.appendChild(caveat);
    }
  }

  function visibleModels() {
    return filterModels(models, search.value);
  }

  function paintList() {
    const vis = visibleModels();
    list.innerHTML = "";
    if (vis.length === 0) {
      const empty = doc.createElement("li");
      empty.className = "model-picker-empty";
      empty.textContent = models.length ? "没有匹配的模型" : "模型库为空——点下方管理模型添加";
      list.appendChild(empty);
      paintDetail(null);
      activeIndex = -1;
      return;
    }
    if (activeIndex < 0 || activeIndex >= vis.length) {
      activeIndex = Math.max(0, vis.findIndex((m) => m.id === selectedId));
    }
    vis.forEach((m, i) => {
      const li = doc.createElement("li");
      li.className = "model-picker-item";
      li.setAttribute("role", "option");
      li.dataset.id = m.id;
      li.id = `executor-model-opt-${m.id}`;
      if (m.id === selectedId) li.setAttribute("aria-selected", "true");
      if (i === activeIndex) li.classList.add("is-active");
      const win = formatContextWindowLabel(m.contextWindow);
      li.innerHTML =
        `<span class="model-picker-item-main">` +
        `<span class="model-picker-item-label"></span>` +
        `<span class="model-picker-item-sub"></span>` +
        `<span class="model-picker-item-flag" hidden></span>` +
        `</span>` +
        `<i class="ph ph-check model-picker-check" aria-hidden="true"></i>`;
      li.querySelector(".model-picker-item-label").textContent = m.label || m.model;
      li.querySelector(".model-picker-item-sub").textContent = `${m.model} · ${win.short}`;
      // 一眼看出这个候选换过去会丢什么——不必逐个悬停读详情
      const tag = visionTag(m);
      if (tag) {
        const flag = li.querySelector(".model-picker-item-flag");
        flag.textContent = tag;
        flag.hidden = false;
      }
      if (m.id !== selectedId) li.querySelector(".model-picker-check").hidden = true;
      li.addEventListener("pointerenter", () => {
        if (activeIndex === i) {
          paintDetail(m);
          return;
        }
        activeIndex = i;
        for (const el of list.querySelectorAll(".model-picker-item")) el.classList.remove("is-active");
        li.classList.add("is-active");
        paintDetail(m);
        trigger.setAttribute("aria-activedescendant", li.id);
      });
      li.addEventListener("click", (e) => {
        e.preventDefault();
        void choose(m.id);
      });
      list.appendChild(li);
    });
    const active = vis[activeIndex];
    if (active) {
      paintDetail(active);
      trigger.setAttribute("aria-activedescendant", `executor-model-opt-${active.id}`);
    }
  }

  function setOpen(next) {
    if (next && isDisabled?.()) return;
    open = next;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) trigger.setAttribute("aria-controls", menu.id);
    else trigger.removeAttribute("aria-controls");
    if (open) {
      search.value = "";
      activeIndex = Math.max(0, visibleModels().findIndex((m) => m.id === selectedId));
      paintList();
      paintDetail(selectedModel());
      queueMicrotask(() => search.focus());
    } else {
      trigger.removeAttribute("aria-activedescendant");
    }
  }

  async function choose(id) {
    if (!id || isDisabled?.()) return;
    const prev = selectedId;
    selectedId = id;
    select.value = id;
    paintTrigger();
    setOpen(false);
    if (id === prev) return;
    try {
      await onSelect(id);
    } catch {
      selectedId = prev;
      select.value = prev;
      paintTrigger();
    }
  }

  function setPayload(payload) {
    models = Array.isArray(payload?.models) ? payload.models : [];
    fillExecutorModelSelect(select, payload ?? { models: [], roles: {} });
    selectedId = select.value || "";
    paintTrigger();
    if (open) paintList();
  }

  function setDisabled(disabled) {
    trigger.disabled = Boolean(disabled);
    if (disabled && open) setOpen(false);
  }

  trigger.addEventListener("click", () => {
    if (trigger.disabled) return;
    setOpen(!open);
  });
  manageBtn.addEventListener("click", () => {
    setOpen(false);
    onManage();
  });
  search.addEventListener("input", () => {
    activeIndex = 0;
    paintList();
  });
  search.addEventListener("keydown", (e) => {
    const vis = visibleModels();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!vis.length) return;
      activeIndex = (activeIndex + 1) % vis.length;
      paintList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!vis.length) return;
      activeIndex = (activeIndex - 1 + vis.length) % vis.length;
      paintList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = vis[activeIndex];
      if (m) void choose(m.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.focus();
    }
  });
  doc.addEventListener("pointerdown", (e) => {
    if (!open) return;
    const t = /** @type {Node} */ (e.target);
    if (menu.contains(t) || trigger.contains(t)) return;
    setOpen(false);
  });
  doc.addEventListener("keydown", (e) => {
    if (open && e.key === "Escape") {
      setOpen(false);
      trigger.focus();
    }
  });

  paintTrigger();

  return {
    setPayload,
    setDisabled,
    close: () => setOpen(false),
    getSelectedId: () => selectedId,
  };
}
