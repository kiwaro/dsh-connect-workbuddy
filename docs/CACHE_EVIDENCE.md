# WorkBuddy 缓存字段与验证依据

本文保留 2026-09-22（2.0.4，后在 2.0.5 复核）的国内版样本，并记录 2026-10-01（3.3.0）引入 DSML 恢复后的转发规则。历史依赖行号只用于定位当时的实现；升级后应重新核对对应函数。本轮没有发送新的计费请求。

## 1. 字段优先级与统计口径

当时 `@earendil-works/pi-ai/dist/api/openai-completions.js` 的 `parseChunkUsage`（1179–1202 行）使用以下读取顺序：

```js
const promptTokens = rawUsage.prompt_tokens || 0
const cacheReadTokens = rawUsage.prompt_tokens_details?.cached_tokens
  ?? rawUsage.prompt_cache_hit_tokens ?? rawUsage.cached_tokens ?? 0
const cacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens || 0
const input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens)
const outputTokens = rawUsage.completion_tokens || 0
const totalTokens = input + outputTokens + cacheReadTokens + cacheWriteTokens
```

`??` 只在左值为 `null` 或 `undefined` 时取后项，因此首选字段明确为 `0` 时不会继续采用后面的非零字段；`||` 则还会对 `0`、`false`、空字符串等假值取后项。`simulatePiAi()` 是探测脚本的独立实现，不是对 pi-ai 函数的调用；应核对二者的字段顺序及默认值，不能用模拟结果证明依赖实现没有变化。

该版解析器的缓存写入数只读 `prompt_tokens_details.cache_write_tokens`，不读 `cache_creation_input_tokens`。读取 `cache_read_input_tokens` 也不是该版 OpenAI 解析分支的行为。判断兼容性时应保留精确字段名，不能把这些拼写统称为“缓存字段”。

`@deepseek-ai/dsh-llm-pi-ai` 当时仅在 `usage.cacheRead > 0` 时添加 `cacheReadTokens`；缓存写入亦有独立计数。`model.cost` 的 `NO_COST` 价格配置只影响费用，不会将 token 计数清零。

## 2. 三轮历史样本

探测通过 `prepareChatBody`、凭据库和 `chatStream` 执行。第一轮发送前缀，后两轮使用逐字节相同的前缀与后缀：

```text
turn 1: input=8002 cacheRead=0    cacheWrite=0 output=16
turn 2: input=136  cacheRead=7872 cacheWrite=0 output=16
turn 3: input=72   cacheRead=7936 cacheWrite=0 output=16
```

第三轮同时返回 `prompt_tokens=8008`、`prompt_tokens_details.cached_tokens=7936`、`prompt_cache_hit_tokens=7936` 和 `prompt_cache_miss_tokens=72`。其中 `cache_read_input_tokens` 与 `cache_creation_input_tokens` 为 0，不影响更高优先级的字段。

该样本满足 `7936 + 72 = 8008`，说明缓存读取量包含在 `prompt_tokens` 中。pi-ai 扣除缓存后得到 72 个未缓存输入 token，命中率为 `7936 / 8008`，约 99%。这是该次样本的守恒关系，不代表所有区域和模型始终采用相同格式。

## 3. 流式 usage 的四段传递

1. pi-ai 在 `compat.supportsUsageInStreaming !== false` 时设置 `stream_options = { include_usage: true }`。
2. 当时检测默认值为 `true`，模型覆盖值通过 `model.compat.supportsUsageInStreaming ?? detected.supportsUsageInStreaming` 选择。
3. 插件适配器仅设置相应的 `supportsReasoningEffort`，没有关闭 `supportsUsageInStreaming`。
4. `prepareChatBody()` 调整 `stream`、角色和 `tool_choice`，保留 `stream_options`，让该字段到达 WorkBuddy。

usage 通常位于 SSE 流末。只打印前六帧的 `.slice(0, 6)` 检查会遗漏尾部计数；验证必须消费完整流。

## 4. DSML 恢复后的转发

3.3.0 之前的响应路径使用 `body.pipe(res)`；此后引入 `RecoveryStream`。因此旧稿“没有响应改写”的说明已经失效。

恢复器处理带 `choices[0].delta` 的帧，修改 `delta.content`，必要时增加 `delta.tool_calls`。usage 帧、未知字段和解析失败的帧由各自分支保留。维护者应验证处理前后 `usage` 内容一致，不能将当前实现概括为“任何情况下都不可能丢字段”。详细算法见 [DSML-RECOVERY-PLAN.md](DSML-RECOVERY-PLAN.md)。

## 5. 复现命令及解释限制

```sh
node scripts/probe-cache-convention.mjs
node scripts/probe-cache-convention.mjs --turns 4
node scripts/probe-cache-convention.mjs --no-stream-options
node scripts/probe-cache-convention.mjs --region global
```

脚本会发送真实请求，并按所用模型扣费。`--no-stream-options` 用于对照该字段是否影响请求受理和尾部 usage；国际版需独立采样，不能引用国内版结果代替。

前缀内容、账号、模型、system 消息及历史编辑都会影响对照。首次请求可能是冷请求；服务端已有缓存时，重新运行的第一轮也可能命中。历史样本中的缓存写入数均为 0，这只能描述所测响应，不能据此断言服务端没有缓存写入过程。
