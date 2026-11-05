# 推理强度与历史推理内容如何重新发送

首次调查日期为 2026-08-30。推理档位修复随 2.0.10 发布，对应 2026-09-17 的提交 4c39645；issue #59 的补充分析截至 2026-10-18。各表按调查阶段标明用途。

## 1. 模型目录中的两种表示

当时 16 个 CLI 模型中，5 个提供 supportedEfforts 数组，11 个提供 effort 单值。单值表示默认档位；可接受的档位需要结合模型接口和请求结果确认。

| 模型 | supportedEfforts | defaultEffort | canDisableThinking |
|---|---|---|---|
| glm-5.3 | low, high, xhigh | high | true |
| glm-5.3-flash | low, high, max | high | true |
| hy3-x | low, high | high | false |
| hy4-preview | high | high | false |
| hy4-preview-x | high | high | false |

下表保留原始单值目录记录。“仅推理”等备注描述当时目录中的能力字段。

| 模型 | effort | 备注 |
|---|---|---|
| deepseek-v4-flash | high | onlyReasoning:true，表示仅推理 |
| deepseek-v4-pro | high | 仅推理 |
| hy3 | high | 仅推理 |
| auto | high | 仅推理，默认模型 |
| glm-5.2 | medium | 仅推理 |
| glm-5.1 | medium | 仅推理 |
| glm-5v-turbo | medium | 仅推理 |
| kimi-k3-1 | medium | 仅推理 |
| kimi-k2.7 | medium | 仅推理 |
| kimi-k2.6 | medium | 仅推理 |
| minimax-m3 | medium | 仅推理 |

## 2. 档位修复

早期解析器只读取 supportedEfforts，丢弃了 effort 单值。修复后保留默认值，并为对应模型提供 low、medium、high、xhigh、max 档位。minimal 当时缺少多种请求的验证依据。

当时 chat 接口接受的档位如下。省略 reasoning_effort 的实测响应中，推理输出为 0，因此默认行为需要通过请求字段明确表达。

| 模型 | 实测接受档位 |
|---|---|
| deepseek-v4-flash | low, medium, high, max |
| deepseek-v4-pro | minimal, low, medium, high, xhigh, max（全部） |
| hy3 / auto / hy3-x / hy4-preview | minimal, low, medium, high, xhigh, max（全部，前 4 个模型完整探测） |
| kimi-k3-1 | low, medium, high, max |
| minimax-m3 | low, medium, high |

| 字段 | 当前 | 修复后 | 影响模型 | 实现状态 |
|---|---|---|---|---|
| `reasoning.effort` | 不解析（丢弃） | 解析并保留 | 11 个形态 B 模型 | ✅ 已实现（折叠为全阶梯 + 默认档） |
| `supportsReasoning` | 不解析 | 解析 | 全部 16 个 | ❌ 未完成（`thinkingLevelMap` 已够用，未采纳） |
| `onlyReasoning` | 不解析 | 解析 | 全部 16 个 | ❌ 未完成（同上） |
| `disabledMultimodal` | 不解析（图片已改手动） | 作为 `supportsImages` 的一票否决 | 见下（实测无矛盾条目） | ✅ 已实现（2.2.0，随图片默认勾选一起解析） |

其中已实现项与提案在表中分别注明。reasoning 布尔值和 onlyReasoning 的界面提案未采用。disabledMultimodal 在 2.2.0 中用于能力限制；2026-09-29 的国内目录有 30 项，12 项包含该字段，其中 6 项为 true，观察中无矛盾记录。

## 3. issue #59 的请求体证据

调查的 685 条记录中，77 条包含 reasoning 块；报告者所指时间窗口内的 35 条记录均为 0。两个计数采用不同样本范围。

| 命题 | 判据 | 实测 |
| --- | --- | --- |
| (i) `reasoning` 在不在 body 里 | 报告里的 `reasoning` 桶是否非空 | 在（本机 77/685 条含 reasoning 块） |
| (ii) 上游忽不忽略它 | 同一份 body 在两个网关的计费/行为对照 | 2026-10-18 晚已可定案：不计费（报告者同区增量实测 + 本项目系数复算，见 §11.7；原记「尚未测定」） |

早期按 messageCount 分组后提出了“长度达到 901”的解释。该解释已由第 4 节的模型身份判据更正，下表仅保留当时的分组数据。

| `messageCount` 桶 | 条数 | 含 reasoning | 平均字符 |
| --- | --- | --- | --- |
| 100–199 | 70 | 0 | 363,821 |
| 200–299 | 61 | 0 | 409,583 |
| 300–399 | 89 | 0 | 484,553 |
| 400–499 | 53 | 0 | 571,364 |
| 500–599 | 93 | 0 | 700,786 |
| 600–699 | 98 | 0 | 782,050 |
| 700–799 | 95 | 0 | 888,560 |
| 800–899 | 49 | 0 | 868,367 |
| 900–999 | 48 | 48 | 944,262 |
| 1000–1099 | 29 | 29 | 1,006,304 |

## 4. 历史推理内容再次发送时的规则

pi-ai 1.1.0 的 isSameModel 同时比较 provider、api 和 model。三者相同时，历史 thinking 通过 reasoning_content 再次发送；身份不同的记录会将 thinking 转成普通文本。两个区域使用不同 provider，因此同一模型跨区域再次发送历史消息也会进入文本转换路径。

| 情况 | 行号 | 结果 |
| --- | --- | --- |
| thinking 为空 | `:85–87` | 丢弃 |
| `isSameModel` 为真 | `:88–91` | 原样保留为 thinking 块 |
| `isSameModel` 为假 | `:92–96` | 改为 `{ type: "text", text: block.thinking }` |

核对的 790 条历史消息中，签名均为 reasoning_content；另有 557 个可见 thinking 块没有签名。固定索引 899 附近的身份变化解释了前面的计数分组，后续分析应按消息身份核对再次发送时使用的字段。

## 5. 计费证据及其来源

报告者提供了国际侧 06:06:40 至 06:06:55 的增量：promptTokens 增加 416，reasoning 增加 1290 字符，其余内容增加 892 字符。

若按包含 reasoning 的字符数计算，密度为 416 / (892 + 1290) = 0.1907 token/字符；按其余内容计算，密度为 416 / 892 = 0.4664。后者与本项目测得的 tool-result 密度 0.4555 相差约 2.4%。该步新增内容为一次工具调用及其结果。

另一项复算使用国际侧工具调用 284466 字符与工具结果 674817 字符，合计 959283。乘以 0.4555 得到约 436953 token，占 promptTokens 447306 的 97.7%。剩余 10353 token：包含 reasoning 时对应密度 0.0126，排除该字段后约为 0.2955。

这些证据由报告者的上游记录和本项目系数复算组成。调查机器缺少 global.jsonl；cn.jsonl 的 685 条旧记录均未采集 promptTokens。独立复验需要补充带上游计数的国际侧捕获，或受控的推理开关对照请求。

## 6. 数据更正

| 数 | 原值 | 更正 | 我们的处理 |
| --- | --- | --- | --- |
| `text`（CN） | 741,952 | 741,687（= user 69,431 + assistant 672,256） | `src/body-report.ts:16`、`tests/issue59-body-report.spec.ts:27`、`docs/audit/ISSUE59-OPTIONS.md` 三处已改 |
| 隐含系数 0.3518 tok/char | 报过 | 作废：分母串了，真分母是 555,724（两区 reasoning 之差），不是 812,815 | 从未进过任何公开文档；C7 当初「无法复现」的疑问至此解释完毕 —— 计算方法需要更正 |

早期使用的 0.697 是两侧非推理字符密度的比值。计费假设下，两侧字符总数为 1815142 与 1812398，相差约 0.15%，对应预测比值约为 1.00；实测 token 比值为 642800 / 447306 = 1.4370。后续说明采用这一组按相同方法统计的数据。

报告者的总字符数 1815142 / 1742872，比本项目分块统计分别多 30507 / 30772。额外内容的类别当时尚待确认，引用时须保留各自来源。关于“单区运行后切区的跳变接近 0”的说法仍属预测，需要独立捕获验证。

## 7. 相关记录

计费复算见[计费调查](audit/ISSUE59-BILLING.md)，方案取舍见[方案记录](audit/ISSUE59-OPTIONS.md)，独立核查见[验证记录](audit/ISSUE59-VERIFY.md)。操作说明以 [README](../README.md) 和[设计文档](DESIGN.md)为准。
