# 视觉纪律双样本对照（2026-09-18 深夜）

「能图形化的绝不用生硬文字」纪律的首两单真机样本，**一正一反**。
任务同文：`统计这个项目里各目录的代码行数（.ts/.js/.css/.html），按大小排序`
（措辞不点"画图"——测的是纪律自己会不会让它产图）。沙箱 = 325 文件的真实代码树
（`D:\Work\scratch\fathom-personas-20260918\stats-sandbox`，src/ui/test 带子目录）。

## 两单对照

| | run1（`8466165e`，正样本） | run2（`25d9cedf`，反样本） |
|---|---|---|
| 产物 | `linecount-report.html`（静态 SVG，16 根条） | `loc-chart.html`（**JS 渲染**）+ `loc-report.md` |
| 画布结果 | **正常渲染**（见 shots/run1-static-svg-renders.png） | **空白**（三张卡壳空着；见 shots/run2-script-rendered-blank-in-canvas.png） |
| 原因 | 几何在生成时算好、吐纯 SVG——画布零脚本依赖 | `<script>` 被画布 CSP（`default-src 'none'`）拦下 |
| 做法 | 先写 `_stats/count.cjs` 统计 → `gen.cjs` 生成 | mktemp/while-read/awk 采样 + 手写带脚本页面 |
| 轮次/墙钟 | 17 轮 / 1m21s | 13 轮 / 5m3s（端点整体偏慢，不归因） |
| 审批 | **16**（bash 12 + 写 4） | **12**（bash 7 + 写 5） |

**审批 16→12 的拆账（不许全归因）**：复跑走了另一条技术路线（mktemp/while/awk），
被 `ffc5f7f` 修的两种形态（find `\(…\)`、无 `-i` 的 sed）这单根本没出现——
**受控证据是重放**（`replay-after-fix.txt`：12 条首跑审批原文逐字重放 → 2 条转免问）；
生态样本只证明"审批量随路线浮动很大"。

## 教训（三条，按值排序）

1. **"自包含"≠"无脚本"**：第一单的成功让人以为纪律已完备，第二单立刻证明缺口——
   画布 CSP 拦内联脚本，**图表必须静态绘制（几何自己算好、纯 SVG/CSS），禁 `<script>`**。
   已补进 `VISUAL_FIRST_DISCIPLINE`（`ffc5f7f`）并加锁。
2. **生态样本 ≠ 受控实验**：复跑的路线变化让"16→12"不能归因于分类器收紧；
   受控结论必须来自重放（同输入）。
3. **复跑纪律（本轮踩坑）**：重置沙箱会把上一单产物删掉——**复跑前先把上一单产物
   拷进归档**。本目录 run1 的产物是**忠实重建**：从档案的 `write_file`/`edit_file`
   事件还原脚本（含两次编辑）重跑生成，数字逐字一致（317 files / 169,143 行 / 139,887
   代码行；compare `_stats/stats.json`）。

## 目录

- `run1-static-svg/`：`linecount-report.html` + `_stats/{count.cjs,gen.cjs,stats.json}`（重建件）
- `run2-script-rendered/`：`loc-chart.html`（反例）+ `loc-report.md`（伴侣报告）
- `asked-commands.json`：首跑 12 条 bash 审批原文（逐字，来自档案）
- `replay-after-fix.txt`：对收紧后分类器的重放结果（2/12 转免问）
- `shots/`：run1 渲染图、run2 空白图、run2 控制台原文（CSP 拒绝行 `sha256-Gfg…`）
- `shoot.mjs`：两张对照图的拍摄脚本（run2 必须走宿主 CSP 端点，file:// 无 CSP）

复跑方式：起 `personas-audit` 隔离宿主（4203）后 `node shoot.mjs`。
