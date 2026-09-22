/**
 * DOM 补丁应用器——`core/diff.js` 的执行侧。
 *
 * 唯一的硬规矩：**已存在 key 的节点永不重建，只更新**。
 * 一旦重建，节点里的输入值、光标位置、焦点、以及浏览器为它维护的滚动锚点
 * 全部清零。此前整个详情页每条事件重建一次 innerHTML，实测后果就是
 * 直播中根本没法在拒绝理由框里打字。
 */
import { diffKeyed } from "../core/diff.js";

/**
 * 键控列表补丁。
 * @param {HTMLElement} container
 * @param {any[]} items
 * @param {{
 *   key: (item:any)=>string,
 *   create: (item:any)=>HTMLElement,
 *   update?: (node:HTMLElement, item:any)=>void
 * }} spec
 */
export function patchList(container, items, spec) {
  const nodes = container.__patchNodes || (container.__patchNodes = new Map());
  const nextKeys = items.map(spec.key);
  const prevKeys = [...nodes.keys()];
  const byKey = new Map(items.map((it) => [spec.key(it), it]));

  const { removes } = diffKeyed(prevKeys, nextKeys);

  for (const key of removes) {
    const node = nodes.get(key);
    if (node && node.parentNode === container) container.removeChild(node);
    nodes.delete(key);
  }

  // 按目标顺序自后向前放置：每个节点都插到"已经就位的后继"之前。
  // 复用的节点若已在正确位置，insertBefore 是空操作，不会重建它。
  let anchor = null;
  for (let i = nextKeys.length - 1; i >= 0; i--) {
    const key = nextKeys[i];
    const item = byKey.get(key);
    let node = nodes.get(key);
    if (node) {
      spec.update?.(node, item);
    } else {
      node = spec.create(item);
      nodes.set(key, node);
    }
    if (node.nextSibling !== anchor || node.parentNode !== container) {
      container.insertBefore(node, anchor);
    }
    anchor = node;
  }
}

/**
 * 只追加的列表补丁——用于日志这种"只会在末尾增长"的流。
 *
 * 比 patchList 更省：不做差异计算，不**重建**任何已渲染的节点，因此展开/折叠
 * 状态与滚动位置天然保持。
 *
 * **复杂度更正（AC2-11 实测，2026-08-08）**：这里原本写的是"单次代价 O(新增条数)"，
 * 那是**假的**——下面这个循环遍历的是 `entries` 全量，只是每条的循环体（Map 查找 +
 * 一次 update）便宜到看不出来：2000 条实测 **0.3ms**。
 * 「假的但不重要」和「真的」是两回事，下一个人会照着那句话做判断，所以改正。
 *
 * 真正的单帧成本在**布局**不在这里：同样 2000 条，画日志的面单帧 24.4ms、
 * 不画日志的面 0.9ms。对策是 `.log-entry` 上的 `content-visibility: auto`
 * （见 styles.css），不是重写这个函数。
 *
 * @param {HTMLElement} container
 * @param {any[]} entries 必须是单调追加的有序流
 * @param {{key:(e:any)=>string, create:(e:any)=>HTMLElement, update?:(node:HTMLElement,e:any)=>void}} spec
 */
export function appendOnly(container, entries, spec) {
  const nodes = container.__patchNodes || (container.__patchNodes = new Map());
  for (const entry of entries) {
    const key = spec.key(entry);
    const existing = nodes.get(key);
    if (existing) {
      spec.update?.(existing, entry);
      continue;
    }
    const node = spec.create(entry);
    nodes.set(key, node);
    container.appendChild(node);
  }
}

/** 只在真的变了才写——避免无谓的 DOM 变更与由此引发的重排 */
export function setText(node, text) {
  const s = text == null ? "" : String(text);
  if (node.textContent !== s) node.textContent = s;
}

/** 同上，属性版；value 为 null/undefined 时移除该属性 */
export function setAttr(node, name, value) {
  if (value === null || value === undefined || value === false) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
    return;
  }
  const s = String(value);
  if (node.getAttribute(name) !== s) node.setAttribute(name, s);
}

/** 只在真的变了才切 class，避免影响 CSS 过渡 */
export function setClass(node, name, on) {
  if (node.classList.contains(name) !== Boolean(on)) node.classList.toggle(name, Boolean(on));
}

/**
 * 在不得不重建节点的场合，保住焦点与光标。
 *
 * 靠 `data-fk`（focus key）认人——重建后的新节点带同一个 data-fk 即可接回焦点。
 * 这是兜底，不是主路径：主路径是根本不重建（patchList / appendOnly）。
 * @param {() => void} fn
 */
export function withFocusPreserved(fn) {
  const active = document.activeElement;
  const fk = active && active.getAttribute ? active.getAttribute("data-fk") : null;
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd = active && "selectionEnd" in active ? active.selectionEnd : null;

  fn();

  if (!fk) return;
  const restored = document.querySelector(`[data-fk="${cssEscape(fk)}"]`);
  if (!restored || restored === document.activeElement) return;
  restored.focus();
  if (selStart !== null && "setSelectionRange" in restored) {
    try {
      restored.setSelectionRange(selStart, selEnd ?? selStart);
    } catch {
      // 非文本类输入不支持选区，忽略
    }
  }
}

/**
 * 滚动跟随：贴底时保持贴底，否则不动用户的滚动位置。
 * 这是 GitHub Actions / Copilot 日志面板的标准行为——用户往上翻看历史时
 * 不该被新事件拽回底部。
 *
 * 2026-08-09 重做为**意图状态**（委托方实测：批准卡出现、思考流式时
 * 跟随停在半路不动）。旧实现每次变更前按"距底 ≤ threshold"的瞬时几何判定，
 * 两类现实都会把它误杀：
 *   1. `.content-area` 的 scroll-behavior 是 smooth——程序化贴底是一段动画，
 *      流式每帧一批，下一批到达时动画还在半路，中途位置被读成"用户不在
 *      底部"，跟随从此断掉，画面停在半途（正是"停在中间不动了"）；
 *   2. 批准卡挂在滚动容器之外，出现时容器 clientHeight 突然变小、距底瞬间
 *      超阈——而这不产生任何 scroll 事件，用户什么都没做就被判了"上翻"。
 *
 * 意图态的规则：**只有用户自己的滚动才改变跟随与否**；程序化贴底自己触发的
 * 那次 scroll 事件由 `__autoScroll` 哨兵消掉。跟随中的贴底必须**瞬时落点**
 * （临时把 scroll-behavior 压成 auto）——逐帧追加的跟随本就不该逐帧动画，
 * smooth 只留给用户点「↓」这类单次跳转；这也是对样式表那句"平滑滚动只在
 * CSS 定义"的一个成文例外：这里不是在选动画，是在关掉一段会破坏判定的动画。
 *
 * **2026-09-19 补第三件：意图态只有异步的清路，会被渲染抢在前面。**
 * 委托方报「`…/loop` 那场对话一直自动往下滑，一上滑就被调到底部、回不去」。
 * 上面那条规则（只有用户的滚动能改变跟随）**本身没错，缺的是一条同步的清路**：
 * 滚动事件异步派发，而流式渲染插在它与用户滚动之间时，`atBottom()` 读到 false
 * 却没人把意图改成 false → 照旧贴底 → 迟到的事件读到"已在底部" → 跟随重开，
 * **逐帧重复**（流式下渲染频率远高于事件派发，必现）。
 * 修法：**挂输入事件**（`wheel` / `touchmove` / `keydown`）当场清跟随——
 * 它们来得比 `scrollTop` 变化还早，抢得赢；而程序化滚动与动画不产生它们。
 *
 * **一条被否掉的路，记下来免得后人再走**：想用几何自己判（"不在底部 **且**
 * `scrollTop` 比上次放下的位置小了一截"就算用户滚了）。**它分不开这两种情况**
 * ——贴底动画走到半路时 `scrollTop` 同样变小且没有事件，那时必须**保持**跟随；
 * 而用户上滑时同样变小且没有事件，必须**清掉**。光看几何，两者一模一样。
 * （写出来之后被既有那两条锁当场抓红：`批准卡出现…不打断跟随` / `贴底动画
 * 走到半路…跟随不断`。**那两条锁的价值就在这儿**。）
 *
 * @param {HTMLElement} scroller
 * @param {() => void} mutate
 * @param {number} [threshold] 距底多少像素内算"贴底"
 */
export function keepScrollAnchored(scroller, mutate, threshold = 40) {
  const atBottom = () =>
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= threshold;

  if (scroller.__followBottom === undefined) {
    scroller.__followBottom = atBottom();
    // 意图只被 scroll 事件改写。程序化贴底是瞬时落点，它触发的事件读到的
    // 就是底部几何，算出来仍是"跟随"——不需要哨兵去区分谁触发的
    // （初版写过哨兵：贴底若因内容不可滚而没产生事件，哨兵会吃掉下一次
    // **真实**的用户滚动——被测试当场抓出来）。
    // 测试里会传入纯对象桩（没有事件机制）——那就退化为逐次几何判定，与旧行为一致。
    if (typeof scroller.addEventListener === "function") {
      scroller.addEventListener(
        "scroll",
        () => {
          scroller.__followBottom = atBottom();
        },
        { passive: true },
      );

      /**
       * ★ **输入事件当场清跟随**（2026-09-19 修，详见文件头"第三件"）。
       *
       * `scroll` 事件是**异步派发**的（在本帧渲染步之前才发），而流式渲染
       * 完全可能插在它与用户滚动之间：用户上滑让 `scrollTop` 同步变小了，
       * 事件还没到，一次渲染进来读到 `atBottom()` 为假、却什么都不做
       * （下面那行只会写 true）→ 照旧把他拽回底部；等事件终于派发，读到的
       * 已是"在底部"，跟随又被重新打开。**逐帧重复，用户赢不了**——这就是
       * 委托方报的"一直自动往下滑动、一上滑就被调到底部"。
       *
       * 输入事件来得**比 scrollTop 变化还早**，抢得赢这场比赛；而程序化
       * 滚动与贴底动画**根本不产生它们**——所以这一条不会把意图态当初解决的
       * 两件事（批准卡压矮容器、动画走到半路）弄回来。那两条有专门的锁。
       *
       * 已知余量：**拖滚动条**不产生这些事件，仍靠异步的 scroll 事件兜底——
       * 拖拽会连续产生事件，所以最多迟一帧，不会像流式那样被永久锁死。
       */
      const releaseFollow = () => { scroller.__followBottom = false; };
      scroller.addEventListener("wheel", (e) => {
        if (e.deltaY < 0) releaseFollow();   // 往上滚才算"接管"；往下滚是在回底部
      }, { passive: true });
      scroller.addEventListener("touchmove", releaseFollow, { passive: true });
      scroller.addEventListener("keydown", (e) => {
        if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home") releaseFollow();
      });
    }
  }
  // 几何上就在底部 → 无条件跟随。覆盖"内容变短到不可滚"这类漂移，
  // 也让首次接触与旧行为一致。
  if (atBottom()) scroller.__followBottom = true;

  mutate();

  if (scroller.__followBottom) {
    const prevBehavior = scroller.style ? scroller.style.scrollBehavior : undefined;
    if (scroller.style) scroller.style.scrollBehavior = "auto";
    scroller.scrollTop = scroller.scrollHeight;
    if (scroller.style) scroller.style.scrollBehavior = prevBehavior ?? "";
  }
  return scroller.__followBottom;
}

/** CSS.escape 的最小替身（jsdom 里不一定有） */
function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, "\\$&");
}
