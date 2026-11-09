# DSML 工具调用恢复设计

本文记录 3.3 版本的实现及 2026-11-03 对 issue #207 的修复。参考实现为 Mayer 的 MIT 许可 Python 模块；移植时保留了协议解析规则，并增加请求工具声明校验和 SSE 流处理。

## 1. 恢复范围

模型有时将工具调用标记输出到正文。插件在收到这些字节后解析完整调用，并将合法调用转换为 delta.tool_calls。转换使用已收到的内容；整轮重发会产生新的上游请求和费用。

代码围栏、行内代码、CDATA 和注释中的标记按引用内容处理。解析器仅恢复请求中已经声明的工具；tool_choice 为 none 时关闭恢复。工具名、必填参数或完整配对的标签不符合要求时，缓冲内容按原文返回。

## 2. 提交条件

| # | 检查条件 | 判据 | 数据来源 | 落在哪 |
|---|---|---|---|---|
| 1 | 开始和结束标签配对后才提交 | 找到与开标签匹配的闭标签才产出调用；否则继续等，流结束仍缺少匹配的结束标签 → 回滚成正文 | 状态变化规则自身 | `DsmlStreamBuffer.add()` / `flush()` |
| 2 | 名字必须在声明里 | 解析出的 `invoke name="X"` 必须 ∈ 本次请求的 `tools[].function.name`；`tool_choice` 是函数名时只允许那一个 | `prepared` 请求体 | `parseToolCalls(text, { declaredNames, toolChoice })` |
| 3 | 无声明工具就完全不做 | 请求没有 `tools`（或 `tool_choice: none`，此时 `normalizeToolChoice` 已删掉 `tools`）→ 根本不创建 buffer，响应原样转发 | 同上 | `src/shim.ts` 响应路径入口 |
| 4 | 校验失败时回退正文 | 必填参数缺失 / 名字不符 / 缺少匹配的结束标签 / JSON 解析失败 / 帧不可解析 → 整个块作为正文吐出，不改写 | 解析器 + 请求体 `required` | `parseToolCalls()` 返回空 → 调用方走正文分支 |

declaredTools 从准备完成的请求体读取。解析结果统一为 {id, name, arguments: string}，随后由流处理层组装协议帧。

## 3. 流处理与重发

RecoveryStream 按处理分支转发角色、usage 和其他字段，可能插入合成帧；等待中的正文缓存在 DsmlStreamBuffer。结束时先处理待输出内容，再发送相应终结信息，因此不能概括为所有原始帧始终保持原位置。

重发需要同时满足三个条件：整轮缺少正文；尚未交付正文或工具调用；残留内容完全由协议标记构成。满足条件时最多重发一次。第二次仍满足失败条件时返回原文。windowOpened 与 windowClosed 分别记录扣留窗口的起止，避免部分标记导致重发判断失准。

上游出现原生调用后，缓冲器进入 standDown 清理模式：保留普通正文，清理残留标记，并停止生成恢复调用。清理模式下的删除不报告 residue，以免触发额外重发。

## 4. 移植与文件职责

| 参考实现 | 目标名 | 变更 |
|---|---|---|
| `ToolMarkupTag` / `XMLElementBlock` / `ParsedToolCall` | `interface MarkupTag` / `ParsedInvoke` / `RecoveredToolCall` | 去掉 `dataclass`；`RecoveredToolCall` 统一为 `{ id, name, arguments: string }`（修掉 2.2 缺陷 2） |
| `FULLWIDTH` 对全角字符的转换 + `DSML_VARIANTS` | 复用 `src/markup-diagnosis.ts` 的 `FULLWIDTH_BAR` / `BARS` | 统一定义：把 `BARS`/标记正则提到本模块，`markup-diagnosis.ts` 改为 import（诊断侧仍需独立可用） |
| `skip_xml_ignored_section` | `skipIgnoredSection` | 保持原处理方式 |
| `markdown_code_span_end` / `last_unclosed_code_span` / `is_inside_markdown_fence` | `codeSpanEnd` / `lastUnclosedCodeSpan` / `insideMarkdownFence` | 保持代码引用区域的识别规则 |
| `normalize_fullwidth_ascii` | `normalizeFullwidth` | 保持原处理方式 |
| `has_dsml_prefix_at` / `consume_dsml_prefix` | `hasMarkupPrefixAt` / `consumeMarkupPrefix` | 保持原处理方式 |
| `match_tool_markup_name` / `scan_tool_markup_tag_at` / `find_tool_markup_tag_outside_ignored` | `matchTagName` / `scanTagAt` / `findTagOutsideIgnored` | 保持原处理方式 |
| `find_matching_tool_markup_close` | `findMatchingClose` | 保持开始和结束标签配对后提交的规则 |
| `parse_xml_attributes` / `parse_invoke_parameters` | `parseAttributes` / `parseInvokeParameters` | 保留递归；新增：返回 `params` 的同时报告「哪些参数出现」，供必填校验 |
| `parse_single_xml_tool_call` | `parseSingleInvoke` | 新增第 2 项检查：名字不在 `declaredNames` 里 → 返回 `undefined`。新增第 4 项检查：`required` 里的参数缺失 → 返回 `undefined` |
| `find_invoke_blocks`（两份） | `findInvokes` | 只带一份（修掉 2.2 缺陷 1） |
| `parse_xml_tool_calls` / `repair_missing_tool_calls_wrapper` | `parseInvokes` / `repairMissingWrapper` | 保留 |
| `parse_tool_calls(text, auto_repair)` | `parseToolCalls(text, options)` | 签名扩为 `{ declaredNames: ReadonlySet<string>, required?: ReadonlyMap<string, string[]>, toolChoice?: string }`；第 2/3 项检查在这里处理完成 |
| `remove_tool_call_markup` | `removeMarkup` | 保留（只在提交成功后被调用，不从正文里额外删标记） |
| `ToolCallStreamBuffer`（别名 `DSMLStreamBuffer`） | `class DsmlStreamBuffer` | 保留 `add()` / `flush()` 处理规则与「只扣留可能的标签开头」策略；`add()` 返回 `{ text, calls? }` |
| `should_emit_tool_calls()` / `get_detected_calls()` | 并入 `add()` 的返回值 | 去掉可变查询状态（更易测） |

参考实现中重复定义的 findInvokeBlocks、返回结构不一致和缺少声明工具校验等问题，在移植时修正。TypeScript 纯模块约 940 行，参考 Python 模块约 983 行。

src/dsml-recovery.ts 负责定位标记、匹配完整块和校验参数；src/shim.ts 与 src/shim-recovery-stream.ts 负责 SSE 转发、恢复调用提交和重发限制。

## 5. 测试矩阵

| 组 | 用例 | 期望 |
|---|---|---|
| 基本转换 | 完整 `<tool_calls><invoke name="X">…</invoke></tool_calls>`，X 已声明 | 产出 1 个调用，正文里标记被剔除 |
| 缺包裹 | 只有 `<invoke name="X">…</invoke>`（本项目真实形态） | 自动修复后产出调用 |
| 单/双竖线 | `｜DSML｜` 与 `｜｜DSML｜｜` 混用于一个块 | 都识别 |
| 检查 1 | 只有开标签、没有闭标签（流中途截断） | 不产出调用；`flush()` 把原文吐出 |
| 检查 2 | `name="notDeclared"` | 不产出调用；原文保留 |
| 检查 2' | `tool_choice` 指定了另一个函数名 | 只允许那一个 |
| 检查 3 | 调用方未启用（无声明工具） | 每次 `add()` 原样返回，buffer 不持有内容 |
| 检查 4 | `arguments` 不是合法 JSON / 必填参数缺失 | 不产出调用；原文保留 |
| 防劫持 | 代码围栏内包含标记 | 不产出调用 |
| 防劫持 | 标记写在行内反引号内 | 不产出调用 |
| 防劫持 | 标记写在 `<!-- -->` / CDATA 内 | 不产出调用 |
| 饥饿防护 | 正文含架构示例 `<tool_call><invoke>` 后跟大段普通文本 | 普通文本照常输出，不被永久扣留（参考实现的注释级修复） |
| 假开头 | 正文含 `a < b`、`<50%` | 不被当作标签开头扣留 |
| 跨 chunk | 标记逐字节切分在多个 `add()` 之间 | 与整段一次输入结果一致（对照式断言） |
| 残渣 | 流结束时 buffer 里是缺少匹配的结束标签的开头 | `flush()` 原样吐出，不吞正文 |
| 形状一致 | — | 返回的调用必须是 `{id,name,arguments}`（验证 2.2 缺陷 2 不会回归） |

| 用例 | 期望 |
|---|---|
| 上游把标记写进 `delta.content`，请求声明了工具 | 客户端看到的 SSE 里该帧变成 `delta.tool_calls`，`finish_reason = "tool_calls"`，正文无标记 |
| 同一响应上游也发了原生 `delta.tool_calls` | 原生调用出现后停止继续生成恢复调用，并清理残留标记；已经交付的内容无法撤回 |
| 请求没有 `tools` | 标记原样转发（检查 3） |
| `tool_choice: "none"` | `normalizeToolChoice` 已删 `tools` → 原样转发；断言它确实走的是检查 3 而不是检查 2 |
| 帧被 TCP 切分（一次 `write` 半个 `data:` 行） | 输出帧完整且顺序不变 |
| 上游流中途断开 | 既有行为保留：`data: [DONE]\n\n` 被合成，且残渣先吐出（回归既有断言） |
| 缺少匹配的结束标签块 + 流正常结束 | 标记作为正文出现，`[DONE]` 正常 |
| 多块（一次响应里两段泄漏） | 两段都恢复，正文顺序不变 |

| 用例 | 期望 |
|---|---|
| 整轮只有泄漏块、无任何正文 | 重发恰好一次，第二次仍如此则回滚成正文（不得无限重发） |
| 泄漏块之后又来正常正文 | 不触发重发：正文一到立即转发，标记按 A 露成正文 |
| 泄漏块之前已写出过 `content` 帧 | 不重发，按 A 处理（避免两段回答拼接） |
| `role` / 无内容帧先到 | 照常原样传递，不影响扣留窗口的判定 |

实现记录中的纯模块测试为 27 项、流处理测试为 12 项、声明工具测试为 5 项；完整测试为 813 项。后续记录出现 814 项时，应同时记录对应提交，保留各次运行的统计范围。

## 6. 流式边界修正

解析器会暂存可能构成标记的部分前缀，例如 <｜，并允许前缀中的空格。hasProse 会移除识别到的标记后再判断正文，避免把截断标记当作可交付文本。

早期 gate 3 测试与 gate 2 的条件重叠。补充用例将输入分成两段，检查第一段是否立即转发，从而单独检验流处理条件。

| 变异 | 结果 |
|---|---|
| 去掉检查 2（不校验声明工具名） | 3 项失败 |
| 去掉检查 3（空声明也照做） | 1 项失败（首版不失败，见下） |
| 去掉忽略区域（围栏/代码段内的标记被劫持） | 23 项失败 |
| 削弱检查 1（缺少结束标签也被当作完整调用） | 2 项失败 |
| 去掉检查 4（不校验必填参数） | 1 项失败 |
| shim：重发不看「是否已交付」 | 1 项失败 |
| shim：扣留窗口不关闭（帧被丢弃） | 2 项失败 |
| shim：忽视检查 3 | 2 项失败 |

## 7. issue #207 的修复

calls 收尾别名加入 CANONICAL_TAG_NAMES，并加入 MARKER_ONLY_TAG_NAMES。带 marker 的 calls 可以作为协议别名，普通 HTML 的普通 calls 标签继续按正文处理。

stripLoneClosers 使用 openerSeen 判断响应中是否出现过带 marker 的开标签。该标记记录出现事实；按名字计算嵌套深度会误删校验失败块的闭标签，因此不适用于原文回退路径。

原生调用后的清理通过 standDown 完成。相关测试检查正文是否完整、标记是否清理，并确认上游请求只有一次。

| 变异 | 结果 |
|---|---|
| 删掉 `['calls', 'tool_calls']` | 5 项失败（含 `parseToolCalls` 与流式路径） |
| 去掉 `openerSeen \|= hasMarkedOpener(...)` | 1 项失败（伪造名 opener 的 verbatim 契约） |
| 删掉 `shim.ts` 里的 `this.buffer?.standDown()` | 2 项失败（清理与保留正文） |

该次完整测试为 2986 项通过、2 项跳过；类型检查和构建通过，构建生成 6 个声明产物。这些结果对应 2026-11-03 的修复版本。

## 8. 后续验证

Windows 操作步骤见[恢复验证说明](DSML-RECOVERY-WINDOWS-VERIFY.md)，问题来源见[泄漏调查](DSML-LEAK-RESEARCH.md)。验证时同时检查正文、工具调用、结束原因和上游请求次数，并将模拟测试与上游调用记录分别说明。
