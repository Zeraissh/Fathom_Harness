# 代码行数统计（.ts / .js / .css / .html）

统计对象：`D:\Work\scratch\fathom-personas-20260918\stats-sandbox`
统计日期：2026-09-18

## 口径

- 计入扩展名：`.ts`、`.js`、`.css`、`.html`（大小写敏感，按字面匹配）；其余文件一律不计（`ui/*.md`、`ui/public/fathom-mark.svg`、`src/tools/kicad-py/*.py` 均被排除）。
- 总行数 = 文件按换行切分后的记录数（文件末尾无换行符的残行也计 1 行）。
- 非空行 = 去掉行尾 `\r` 后，不是空字符串也不是纯空白/制表符的行。
- 未做注释剥离，也未做代码生成/压缩文件的特殊处理。
- 文件数 = 命中扩展名的文件个数，不做去重。
- 本次任务的产物本身不计入：`loc-report.md`（扩展名不在列表中）与 `loc-chart.html`（自身为 `.html`，85 行）均已排除，故表中 317 文件 / 169143 行不受报告生成行为影响。剔除该文件前后总行数核对为：169228 → 169143，差量 85 恰好等于 `loc-chart.html`。
- 目录内所有匹配扩展名均为小写（无 `.TS` / `.JS` 之类），故大小写敏感匹配与不敏感匹配结果一致。

## 1. 按顶层模块（含全部子目录）排序

| 目录 | 总行数 | 非空行 | 文件数 | 占比 |
| --- | ---: | ---: | ---: | ---: |
| test | 68478 | 62904 | 166 | 40.5% |
| ui | 66052 | 62420 | 60 | 39.0% |
| src | 34613 | 32327 | 91 | 20.5% |
| 合计 | 169143 | 157651 | 317 | 100% |

## 2. 按目录子树（目录自身 + 所有子目录）排序

| 目录 | 行数 | 文件数 |
| --- | ---: | ---: |
| test | 68478 | 166 |
| ui | 66052 | 60 |
| ui/public | 46381 | 37 |
| src | 34613 | 91 |
| ui/public/features | 15701 | 26 |
| src/tools | 4828 | 25 |
| ui/public/core | 1340 | 7 |
| ui/public/dom | 202 | 1 |
| test/fixtures | 43 | 1 |

## 3. 按目录自身（不含子目录）排序

| 目录 | 总行数 | 非空行 | 文件数 |
| --- | ---: | ---: | ---: |
| ./test | 68435 | 62865 | 165 |
| ./src | 29785 | 27827 | 66 |
| ./ui/public | 29138 | 27682 | 3 |
| ./ui | 19671 | 18718 | 23 |
| ./ui/public/features | 15701 | 14606 | 26 |
| ./src/tools | 4828 | 4500 | 25 |
| ./ui/public/core | 1340 | 1228 | 7 |
| ./ui/public/dom | 202 | 186 | 1 |
| ./test/fixtures | 43 | 39 | 1 |

注：`./ui/public` 只有 3 个文件就占了 29138 行，因为 `app.js`、`styles.css`、`index.html` 三个大文件都直接放在该目录下。

## 4. 按扩展名排序

| 扩展名 | 行数 | 文件数 |
| --- | ---: | ---: |
| .ts | 122830 | 283 |
| .js | 29354 | 32 |
| .css | 10925 | 1 |
| .html | 6034 | 1 |
| 合计 | 169143 | 317 |

## 5. 行数最多的 15 个文件

| 文件 | 行数 |
| --- | ---: |
| ./ui/server.ts | 14613 |
| ./ui/public/app.js | 12179 |
| ./ui/public/styles.css | 10925 |
| ./test/ui-server.test.ts | 10084 |
| ./ui/public/index.html | 6034 |
| ./test/ui-patch.test.ts | 5943 |
| ./test/ui-app.test.ts | 3474 |
| ./src/cli.ts | 2548 |
| ./ui/public/features/settings.js | 2430 |
| ./src/execution-broker.ts | 2375 |
| ./ui/public/features/artifact-canvas.js | 1998 |
| ./ui/public/features/review-mode.js | 1474 |
| ./test/ui-faces.test.ts | 1447 |
| ./src/loop.ts | 1320 |
| ./test/ui-a11y.test.ts | 1284 |

## 复现命令

```bash
find . -type f \( -name '*.ts' -o -name '*.js' -o -name '*.css' -o -name '*.html' \) \
  ! -name 'loc-chart.html' ! -name 'loc-report.md' -print0 |
while IFS= read -r -d '' f; do
  printf '%s\t%s\n' "$(dirname "$f")" "$(awk '{sub(/\r$/,"")} END{print NR+0}' "$f")"
done
```
