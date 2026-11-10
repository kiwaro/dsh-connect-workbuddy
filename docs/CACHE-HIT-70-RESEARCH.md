# 缓存命中率约 70% 的调查记录

调查日期为 2026-10-31，环境为 Windows 11、插件 5.16。本文保留当时的会话统计、对照请求与待验证方向。文中的进程号、配置状态和临时脚本路径均属于该次调查。

## 1. 统计范围与计算方法

命中率按 cacheRead / (uncached + read + write) 计算。统计前合并相邻重复 usage，小于 5000 token 的会话不纳入该组比较。

14543 次请求共包含 3320780090 个输入 token，其中未缓存输入为 83207648，命中率为 97.5%。DeepSeek 的 13282 次请求共包含 3157473803 个输入 token，命中率为 97.9%；minimax 的 278 次请求共包含 25136718 个输入 token，命中率为 44.6%。

按单次请求分类，DeepSeek 的 13251 条样本中完整命中约 96%、部分命中约 3%、冷请求约 1%；minimax 对应约为 40%、16%、44%。

## 2. 模型与账号对照

相同字节重复请求 6 次，DeepSeek 每次命中约 97%；minimax 依次为 2%、2%、2%、0%、0%、2%。输入由约 23k 增长至 26k 时，DeepSeek 的后三轮为 94.9%、95.4%、95.4%，minimax 为 0.5%、0.8%、0.7%。

账号对照中，A 账号输入 8412 和 8417 token 时均读到 8192 个缓存 token；B 账号使用相同内容时读到 0，切回 A 后再次读到 8192。该组数据说明缓存复用与账号有关。

按 0.979 和 0.446 两种命中率加权，minimax 占输入约 52.3% 时，汇总命中率约为 70%。调查机器中 minimax 只占输入的 0.76%。另一种达到 70% 的模型是单模型冷请求占比约 28.5%；这两种情形需要目标会话的数据加以区分。

## 3. keepPromptLast 的影响

当时的实现将提问之后的全部自动添加的消息移到该提问前。新一轮提问加入后，旧自动添加的消息的位置也随之变化，导致跨请求前缀断裂。对照 prepareChatBody 的输出，关闭时第 2 至第 4 次请求均保持 100% 可缓存前缀；开启时分别为 98.6%、98.8%、98.9%。

真实日志中，两个会话分别为 386 步、12 条自动添加的提示和 682 步、34 条自动添加的提示。按该形状测试 20 轮、每轮 4 步，共 79 个请求，关闭时累计可缓存比例为 100.00%，开启时为 98.26%，相差 1.74 个百分点。

该次配置文件于 2026-10-31 16:05:50 写入 keepPromptLast: true；DSH 进程 23020 启动于 2026-10-30 19:57:03。开关在挂载时读取，因此前面的 97.9% 统计据此推断对应关闭状态；仅凭启动和配置时间不能排除其他重载或配置来源。

## 4. 账号轮换与字段传递

当时每个请求都调用 prepareAccount，但 rankPool 的用户排序优先于余额，10 分钟余额刷新本身不会使账号轮换。账号排除、失败重试或用户重排会改变选择。若假设每 150 个请求换号一次、稳定命中率为 95%，估算结果约为 94.3%；目标会话仍需核对实际换号频率。

| 方向 | 排除依据 |
| --- | --- |
| 插件重编码 SSE 丢缓存字段 | `CACHE_EVIDENCE.md` 的样本保留了缓存计数；当前流处理仍需按分支核对 |
| 其他请求体改写是否破坏前缀 | 关掉该开关后，一份同时含全部改写触点的 body（banned system 开头、developer 角色、assistant 回显 banned 文案、对象形 tool_choice）在 1–10 轮的 8 个深度上实测 100.00% 前缀保留（7/7 个相邻对）。角色转换、提示头补齐与指纹处理均针对消息独立执行；tool_choice 也按固定规则处理。该对照中相邻请求保留了前缀 |
| 上报侧丢弃缓存字段 | `dsh-token-meter/lib/types/usage-projection.js` 的 `bucketsFrom` 用 `?? 0` 回退 |
| 上游只报读不报写 | 实测 `cache_write` 恒 0 属实，但那是上游行为，不影响命中率分子 |
| 计算方式错误 | 见第 1 节，`cacheRead / (uncached + read + write)` 是OpenAI 用量字段的计算方式 |

## 5. 上下文插件前后对照

调查使用代理 startedAt 划分生效前后，安装时间与该时间相差 5 小时 10 分。

| 统计对象 | 请求数 | 命中率 | 前缀断裂率 |
| --- | --- | --- | --- |
| 全部 workbuddy 流量 · 生效前 | 17,339 | 98.21% | 1.75% |
| 全部 workbuddy 流量 · 生效后 | 2,760 | 96.03% | 4.24% |
| 长会话汇总 reqs≥100 · 前（44 个） | 14,163 | 98.22% | 1.59% |
| 长会话汇总 reqs≥100 · 后（3 个） | 2,239 | 96.98% | 4.15% |
| 唯一跨两侧的同一会话 · 前 | 1,260 | 98.53% | 1.51% |
| 唯一跨两侧的同一会话 · 后 | 441 | 98.22% | 2.27% |

同一会话的命中率由 98.53% 变为 98.22%，相差 0.31 个百分点。全部会话汇总的变化还包含样本构成差异，因此归因时采用同会话对照。

代理当时为 billion-context 0.1.209，进程 10648，监听 127.0.0.1:18787；配置启用 compress.ccr 和 preserveRecentTools: [read]，stableSystemAnchor 与 cacheKeepalive 关闭。

## 6. 工具注册表与会话内归因

同一会话的 system/message 有 7 个版本，变更集中在第 1 至第 10 轮。同期出现 9 条 source.kind 为 tool-registry 的 developer/message。

| turn | system hash | 长度 | 同期工具事件 | 该 turn 命中率 |
| --- | --- | --- | --- | --- |
| 1 | `72c3ea0c96` | 13,512 | 首次挂载 | 88.3% |
| 3 | `c042b1da4b` | 13,516 | — | 74.5% |
| 5 | `ab407f25db` | 39,092 | +`purge_apply` / `spawn_teammate` / `team_task_*` 等 8 个 | 85.3% |
| 6 | `8ae221e73e` | 13,562 | +`create_worktree` / `session_event_*` / `session_search` | 0.0% |
| 8 | `36d55ca508` | 10,204 | −2 个工具（`tool-removal`） | 0.0% |
| 9 | `57fe05a45b` | 10,011 | +`bsk_*` 全套 + `mcp__wincu__*` 全套 | 0.0% |
| 10 | `e66c6f3b1d` | 13,834 | +`acp_*` / `compress` / `decompress` / `render_ui` | 0.0% |
| 12–37 | 未再变化 | — | 无 | 96–99.5% |

第 12 轮以后 system 内容保持一致，后续 26 轮命中率均在 96% 以上。工具增删与 system 内容变化在该组日志中对应；精确计算每次变化的 token 代价，还需要相邻请求体。

trae/deepseek-v4.1-flash 的 49 次请求命中率为 26.06%，其中 34 次连续 read=0。检查 4.6.11 的字段对应关系后，上游返回的 0 被保留。

| 来源 | 请求数 | 未命中 token | 占全部未命中 |
| --- | --- | --- | --- |
| 运行中前缀断裂（出现在自动添加提示段之后） | 30 | 2,103,038 | 45.1% |
| `trae` 通道（上游不报缓存） | 34 | 1,571,277 | 33.7% |
| 正常命中 ≥90% 的增量 | 729 | 634,125 | 13.6% |
| 空闲 >5 分钟后未命中，是否因 TTL 过期待验证 | 1 | 183,670 | 3.9% |
| 压缩 fold 之后 | 4 | 115,188 | 2.5% |
| 其它 provider（`xiaomi-token-plan-cn`） | 2 | 56,757 | 1.2% |

上表按当时的诊断假设分类，缓存计数本身不能证明后端没有缓存，也不能确定缓存的 TTL。所谓前缀断裂，统计判据为 cacheReadTokens 相对上次减少超过 20%，且上次大于 5000；它并不直接测量请求字节是否相同。

第 15 轮内另有 13 次符合该判据，其中 6 次落在添加提示后 3 步以内。早期采用“read 停止增长”的判据会误报短步骤，因此后续统计改用减少比例。具体原因仍需相邻请求体对照。

## 7. 复现材料

以下路径属于当时调查机器的临时目录，复验前需要确认脚本是否保存。标明账号对照与增长请求的脚本会调用上游并消耗积分。

| 脚本 | 作用 |
| --- | --- |
| `wb-blend.mjs` | 按模型分组统计全机命中率 |
| `wb-mixed.mjs` | 多模型会话的命中率分布 + 反推混合比例 |
| `wb-turns.mjs` | 按 turn 分组，分类 stable / degrading / no-cache |
| `wb-recent.mjs` | 最近会话的每次请求波形 |
| `wb-minimax.mjs` | minimax 会话的每次请求波形 |
| `wb-shape.mjs` | 统计自动添加的提示段分布（每 step 几条），决定 `keepPromptLast` 真实代价的关键 |
| `wb-final.mjs` | 用真实形状测跨轮前缀断裂 |
| `wb-amort.mjs` | 20 轮 × 4 step 的累计可缓存比例 |
| `wb-isolation2.mjs` | 消耗积分：A/B 账号隔离实验 |
| `wb-affinity.mjs` | 消耗积分：同凭据连发，测模型缓存 affinity |
| `wb-growth.mjs` | 消耗积分：增长型前缀四轮 |
| `dsh-attrib.mjs` | 单会话未命中按「trae / 空闲 TTL / fold / 无解释」四类归因 |
| `dsh-within.mjs` | 以 bili 代理 `startedAt` 为界的同会话前后对照 |
| `dsh-host-side.mjs` | 导出全部 `system/message` 版本 + `developer/message` 工具增删 + 自动添加的提示段分布 |
| `dsh-breaks.mjs` | 用「read 缩水 >20%」判真断裂，并标注最近成因 |
| `bili-correlate.mjs` / `bili-foldcost.mjs` | 把 `contextView.folds` 时间与会话日志匹配，量化每次 fold 的再付费 |

会话日志为 zstd 压缩的 JSONL，可使用 Node 的 zstdDecompressSync 解压。导出时只保留分析所需的 usage、模型、账号切换和工具变更信息，并清理凭据及提示正文。

## 8. 目标会话所需信息与后续工作

确认约 70% 的目标会话，需要展开模型列表、子代理默认模型设置，以及脱敏后的请求用量计数。调查时原截图因 SSL 握手失败而未取得，curl 与 Node fetch 各尝试 3 次，目标会话成因尚待这些材料确认。

后续方向包括：捕获相邻 system 内容以核对工具增删代价；为 keepPromptLast 增加跨请求前缀测试并评估稳定排序；单独评估 acp 标记与压缩端点的关系。2026-10-31 的授权范围为调查报告，这些建议在该次调查中均未作为产品修改执行。

## 历史技术原文与证据

来源：本仓库语言改写前提交 `0d6cf6b^` 的同名文档。以下引用恢复被压缩的接口名称、请求条件、实验表、命令和设计取舍；涉及身份的数据已替换为占位符。原记录中的第一人称和口语作为历史引文保留，不作为维护文档的新写法。

本文实验解释以本页更正后的正文为准；历史统计和候选假设不能证明服务端内部实现或通用阈值。

<details>
<summary>展开历史技术记录</summary>

> > 报告：https://github.com/dingminhua/dsh-connect-workbuddy/issues/184
> > 「长任务执行，缓存命中太低。应该是插件的问题，换成反代就没事了」
> >
> > 日期：2026-10-31 · 取证时版本：5.16.0 · 平台：Windows 11 (zh-CN)
> > 数据来源：报告人指定的 DSH 用量页 + 本机 `~/.dsh/sessions/**/session.v4.jsonl.zstd`
> >
> > 配套文档：[`CACHE_EVIDENCE.md`](./CACHE_EVIDENCE.md) —— 那一篇回答「缓存字段有没有被插件丢掉」，
> > 结论是**没有**。这一篇回答「命中率为什么不高」，是另一件事。
>
> ## 结论摘要
>
> **本机无法复现 70%。** 全机 workbuddy 流量加权命中率 **97.5%**，主力模型
> `deepseek-v4.1-flash` 是 **97.9%**（13,282 次请求 / 3,157,473,803 prompt token）。
> 但查出了四条能真实压低命中率的机制，其中**只有一条量级足够解释 70%**：
>
> | # | 机制 | 实测影响 | 能否解释 70% |
> | --- | --- | --- | --- |
> | 1 | **会话混用模型**（其中一方不复用缓存） | 混用会话落在 **55–75%** | ✅ **能，唯一量级吻合** |
> | 2 | `minimax-m3.1-flash` 本身不复用缓存 | 该模型 **44.6%**（278 次请求） | ✅ 作为 #1 的成因 |
> | 3 | 账号池换号（缓存按账号隔离） | 每次换号付一次完整冷前缀 | ⚠️ 需每 3.8 请求换一次，实测远低 |
> | 4 | `keepPromptLast` 重排断裂跨轮前缀 | 累计 **98.26% vs 100.00%**，即 **−1.74 点** | ❌ 差一个数量级 |
> | 5 | **工具注册表在会话中途增删工具**（改 system 段） | 单会话 7 个 system 版本，相邻 turn 命中率直接归零 | ⚠️ 见第 8 节，量级可到 45% |
>
> **给报告人的第一条建议不是关开关**，而是确认那条 70% 的会话里有没有混入
> `minimax-m3.1-flash`（本机 `dsh-subagent-default-model` 用 `strategy: random`
> 把它混进子任务池）。`keepPromptLast` 可以关，但它的实测上限只有 1.74 个点，
> 关掉不会有可见变化——把它当成 70% 的答案会让真正的成因继续存在。
>
> ## 1. 命中率口径（先确认读数本身可信）
>
> DSH 聊天页顶部「用量」pill 的缓存命中率，全 `app.asar` 扫描后唯一的计算处是
> `dsh-client-ui-chat/lib/client.js:7490-7506`：
>
> ```js
> function cacheHitPercent(usage) {
>     const denominator = billedInputTokens(usage);
>     return formatCacheHitPercent(usage.cacheReadTokens, denominator);
> }
> function billedInputTokens(usage) {
>     return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
> }
> ```
>
> 关键性质，逐条实测确认：
>
> - **分母是 prompt 侧三桶之和**，不含 output。system prompt 不单独成桶，它落在
>   `uncachedInputTokens` 里——所以 system 越长、命中率越低。
> - **是整条 durable log 的累计加权平均**（源码注释原文 "over the whole durable log"），
>   不是当前轮瞬时值。「一直在 70 徘徊」字面上就是这个统计量的形态：冷启动被后面的
>   高命中轮次慢慢稀释。
> - **`prompt_tokens` 是总数**（OpenAI 口径），不是未命中数。pi-ai 解析层
>   `@earendil-works/pi-ai/dist/api/openai-completions.js:1163-1188`：
>   `const input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens)`。
>   实测 `hit + miss == prompt_tokens` 恒成立（7936+72=8008、8192+225=8417）。
> - **插件不改写 usage 帧**：`src/shim.ts` 的 noteUsage 只上报，SSE 逐帧原位转发。
>
> 所以「70% 是算错的」这个方向不成立，读数是真的。
>
> ## 2. 本机实测：按模型分组
>
> 解压全部 `session.v4.jsonl.zstd`（node 自带 `zlib.zstdDecompressSync`），按
> `request/context` 事件的 provider/model 分组，累加 `inputTokens` / `cacheReadTokens`：
>
> | model | sess | reqs | prompt tok | uncached tok | hit% |
> | --- | ---: | ---: | ---: | ---: | ---: |
> | deepseek-v4.1-flash | 45 | 13282 | 3157473803 | 67575106 | 97.9 |
> | space-bunny | 7 | 862 | 132648250 | 1332081 | 99.0 |
> | hy4-preview | 1 | 76 | 3956243 | 147155 | 96.3 |
> | hy3 | 1 | 27 | 1011059 | 111674 | 89.0 |
> | glm-5.3-flash | 1 | 18 | 554017 | 127009 | 77.1 |
> | minimax-m3.1-flash | 9 | 278 | 25136718 | 13914623 | 44.6 |
> | BLENDED (whole machine) | — | 14543 | 3320780090 | 83207648 | 97.5 |
>
> 去重口径：会话日志会把同一请求的 usage 记两遍，统计前按「与上一条完全相同」剔除。
> 分母 < 5000 prompt token 的会话不计入。
>
> 逐请求分类（full ≥90% / partial 10–90% / cold <10%）：
>
> ```
> deepseek-v4.1-flash   n=13251  full= 96%  partial=  3%  cold=  1%
> minimax-m3.1-flash    n=  278  full= 40%  partial= 16%  cold= 44%
> ```
>
> **`minimax-m3.1-flash` 的 44% cold 是它拉低整体命中率的直接原因。**
>
> ## 3. 决定性实验：缓存按账号隔离，且 minimax 不复用缓存
>
> ### 3.1 缓存是 per-account 的
>
> 脚本 `C:\Users\<you>\AppData\Local\Temp\wb-isolation2.mjs`，
> 前缀 `FILLER.repeat(420)`，model `deepseek-v4.1-flash`，同一分钟内发同样的字节：
>
> ```
> A warm   : prompt=8412 hit=8192 (97.4%)
> A same   : prompt=8417 hit=8192 (97.3%)
> B same   : prompt=8417 hit=0    (0.0%)
> A ctrl   : prompt=8417 hit=8192 (97.3%)
> ```
>
> A 账号 97.3%，B 账号 0.0%，A 事后仍命中。→ **CACHE IS PER-ACCOUNT**，
> 排除「前缀未热」。推论：任何账号切换都要付一次完整冷前缀。
>
> ### 3.2 minimax-m3.1-flash 完全不复用缓存
>
> 脚本 `wb-affinity.mjs`：**同一凭据、同一份字节连发 6 次**，中间不换号：
>
> ```
> deepseek-v4.1-flash: 97% → 97% → 97% → 97% → 97% → 97%   STABLE
> minimax-m3.1-flash :  2% →  2% →  2% →  0% →  0% →  2%   ALTERNATING
> ```
>
> 再用「增长型前缀」（真实对话形状，23k→26k token，同一凭据 4 轮）：
>
> ```
> deepseek-v4.1-flash  round2 94.9%  round3 95.4%  round4 95.4%
> minimax-m3.1-flash   round2  0.5%  round3  0.8%  round4  0.7%
> ```
>
> → 与插件无关，是模型/后端事实。形态与 `9router` issue #2929 记录的
> 「上游多后端推理实例无 session affinity，请求被 round-robin 到不同实例，
> 各实例只有本地 prompt cache」一致。
>
> ### 3.3 混用模型的会话恰好落在 55–75%
>
> 这是「70 左右徘徊」的直接来源。本机 61 个会话带多组 (provider, model)，
> 按命中率升序：
>
> ```
>   0.1%  n= 209  trae/deepseek-v4.1-flash | minmax/MiniMax-M3.1-Flash
>  24.4%  n=  79  workbuddy/minimax-m3.1-flash | workbuddy/hy4-preview
>  42.0%  n=  26  qoder-global/qfmodel | go/beam-free
>  55.3%  n=  50  modelflare/gpt-6.1-sol | workbuddy/deepseek-v4.1-flash
>  56.8%  n=1789  (8 个模型，含 workbuddy/deepseek-v4.1-flash)
>  57.2%  n=1809  (同上)
>  68.4%  n= 207  modelflare/gpt-6.1-sol | minmax/MiniMax-M3.1-Flash | api/gpt-6.1-sol | workbuddy/deepseek-v4.1-flash
>  68.6%  n=  21  api/gpt-6.1-sol | workbuddy/space-bunny
>  74.4%  n= 779  (6 个模型，含 workbuddy/deepseek-v4.1-flash)
> ```
>
> **反推需要多大的混合比例**，用本机实测的两个端值
> （deepseek `h=0.979`、minimax `h=0.446`）：
>
> ```
> H = w_ds·0.979 + w_mm·0.446 = 0.70
> ⇒ w_mm = 52.3%
> ```
>
> 即「一半 prompt 量落在 minimax 上」正好 70%。对照：本机 minimax 只占
> 25,136,718 / 3,320,780,090 = **0.76%**，所以全机是 97.5%。
>
> **另一个等价的解释**（同一模型 + 大量冷启动）：
>
> ```
> cold requests 10%  →  88.1%
> cold requests 20%  →  78.3%
> cold requests 28.5% →  70.0%   ← 需要 28.5% 的请求是冷的
> cold requests 35%  →  63.6%
> ```
>
> 实测 deepseek 的冷请求占比是 **1%**，minimax 是 **44%**。所以只有两种形状能到 70%：
> **混入大量 minimax**，或**同一模型上大面积冷启动**（换号/无 affinity）。
> 报告人那张截图无法取得（`github user-attachments` 在本机 SSL 握手失败，
> curl 与 node fetch 各试 3 次），所以无法直接判定是哪一种。
>
> ## 4. `keepPromptLast` 确实是 bug，但不是 70% 的原因
>
> ### 4.1 机制
>
> `src/upstream.ts:2949 function keepPromptLast(messages: unknown[], pattern: RegExp): boolean`
> 从尾向前找最后一条非注入非空 `user` 得 `promptIndex`，然后：
>
> ```js
> const trailing = messages.slice(promptIndex + 1).filter(value => isInjectedUserMessage(...))
> const kept = messages.filter((value, index) => !(index > promptIndex && isInjectedUserMessage(...)))
> kept.splice(promptIndex, 0, ...trailing)
> ```
>
> 搬的是「提问之后**所有**注入」，不只末尾连续段。当轮看着正确，下一轮因为前面插了
> 新提问而整体右移一位，**跨轮前缀从早期就断裂**。
>
> 用真实 `prepareChatBody`（`lib/index.js`）配真实消息形状（工具结果用
> `role: "tool"`，见 `pi-ai/dist/api/openai-completions.js:1080`）实测：
>
> ```
> keepPromptLast: false
>   request 2  OK     100.0% cacheable
>   request 3  OK     100.0% cacheable
>   request 4  OK     100.0% cacheable
>
> keepPromptLast: true
>   request 2  BREAK   98.6% cacheable  break@msg[6]
>   request 3  BREAK   98.8% cacheable  break@msg[10]
>   request 4  BREAK   98.9% cacheable  break@msg[14]
> ```
>
> **注意断点在 msg[6] 这种极靠前的位置**，不是某些分析推测的「~22.8k 处的引导块末尾」。
>
> ### 4.2 真实代价只有 1.74 个百分点
>
> 关键在于真实宿主**并不每个 step 都注入**。扫两个真实会话的 `user/message` 事件：
>
> ```
> ld-rl-poker session-<session-id> : 386 个 step，12 条注入  → 0.03 条/step
> 当前会话   session-<session-id> : 682 个 step，34 条注入  → 0.05 条/step
> ```
>
> 注入集中在**每轮第 1 步**（time sample / runtime context / system-reminder），
> 不是每 step 一条。用这个真实形状跑 20 轮 × 4 step = 79 个请求：
>
> ```
> keepPromptLast=false  cumulative cacheable=100.00%  broken-prefix requests= 0
> keepPromptLast=true   cumulative cacheable= 98.26%  broken-prefix requests=19
> ```
>
> → **−1.74 点**。报告人要解释的差距是 −28 点，差一个数量级。
>
> （如果按「每 step 都注入」这个**不存在的工况**算，step 20 会掉到 49.1%——
> 我一度据此判断它是主因，查真实日志后已修正。这个数字不作为结论使用。）
>
> ### 4.3 本机当前状态：已配置但未生效
>
> `~/.dsh/profiles/desktop/cordis.patch.yml:1403` 是 `keepPromptLast: true`，
> 文件 mtime `2026-10-31 16:05:50`；但监听 GUI 端口 9278 的宿主进程 PID 23020
> 启动于 `2026-10-30 19:57:03`，而该开关在**挂载期读一次**
> （`src/index.ts:1316` → `src/shim.ts:1449 const keepPromptLastEnabled = options.keepPromptLast === true`）。
> → 该开关**当前未生效**，本机 97.9% 是关闭状态下测得的。
>
> ## 5. 账号池换号：有影响，但量级不足
>
> `src/shim.ts:1655 await prepareAccount?.()` 每请求都调
> → `src/index.ts:1356 prepareAccount: () => applyPoolSelection(region)`
> → `src/index.ts:3243` 内 `rankPool(await localPoolMembers(region), Date.now(), orderAccountIds)`
> 后 `store.setRotatedAccount(winner?.account.id)`，**不记上次选了谁**。
>
> 但 `rankPool`（`src/account-pool.ts:457`）的排序键里**用户手排的 `orderAccountIds`
> 排在余额之前**，所以 `CREDITS_SNAPSHOT_MS = 10 * 60_000`（`src/index.ts:3102`）
> 的余额刷新本身不会换号。真正换号只有三处：
>
> 1. 账号被排除（`src/account-pool.ts:305 exclusionOf`）：
>    `credential-rejected` / `account-restricted` / `not-found` → **永久排除**；
>    `unavailable` / `failed` / `rate-limited` / `out-of-credit` → `retryDue` 到期才恢复；
>    `model-busy` → `MODEL_BUSY_COOLDOWN_MS`；
>    `policy-rejected` / `channel-rejected` → **始终是候选**。
> 2. failover 重试（`src/shim.ts:1905`）。
> 3. 用户手改顺序。
>
> 按「10 分钟换一次号、请求间隔约 4 秒」换算：约 150 个请求换一次 → `f≈0.007`
> → `H ≈ 0.95 × 0.993 = 94.3%`。**不可能造成 70%。**
>
> ## 6. 已排除的方向
>
> | 方向 | 排除依据 |
> | --- | --- |
> | 插件重编码 SSE 丢缓存字段 | `CACHE_EVIDENCE.md` 已证；usage 帧原位转发 |
> | 插件改写 body 破坏前缀（`keepPromptLast` 之外） | 关掉该开关后，一份同时含全部改写触点的 body（banned system 开头、developer 角色、assistant 回显 banned 文案、对象形 tool_choice）在 1–10 轮的 8 个深度上实测 **100.00% 前缀保留**（7/7 个相邻对）。`developer`→`system`、system 头补齐、指纹中和、`tool_choice` 展平全是**逐消息确定性变换**，构造上保前缀 |
> | 上报侧吞掉缓存字段 | `dsh-token-meter/lib/types/usage-projection.js` 的 `bucketsFrom` 用 `?? 0` 兜底 |
> | 上游只报读不报写 | 实测 `cache_write` 恒 0 属实，但那是上游行为，不影响命中率分子 |
> | 口径算错 | 见第 1 节，`cacheRead / (uncached + read + write)` 是标准 OpenAI 口径 |
>
> ## 7. 复现脚本
>
> 全部在 `C:\Users\<you>\AppData\Local\Temp\`，零上游调用（除标注）：
>
> | 脚本 | 作用 |
> | --- | --- |
> | `wb-blend.mjs` | 按模型分组统计全机命中率 |
> | `wb-mixed.mjs` | 多模型会话的命中率分布 + 反推混合比例 |
> | `wb-turns.mjs` | 按 turn 分组，分类 stable / degrading / no-cache |
> | `wb-recent.mjs` | 最近会话的逐请求波形 |
> | `wb-minimax.mjs` | minimax 会话的逐请求波形 |
> | `wb-shape.mjs` | 统计注入块分布（每 step 几条），**决定 `keepPromptLast` 真实代价的关键** |
> | `wb-final.mjs` | 用真实形状测跨轮前缀断裂 |
> | `wb-amort.mjs` | 20 轮 × 4 step 的累计可缓存比例 |
> | `wb-isolation2.mjs` | **消耗积分**：A/B 账号隔离实验 |
> | `wb-affinity.mjs` | **消耗积分**：同凭据连发，测模型缓存 affinity |
> | `wb-growth.mjs` | **消耗积分**：增长型前缀四轮 |
> | `dsh-attrib.mjs` | 单会话未命中按「trae / 空闲 TTL / fold / 无解释」四类归因 |
> | `dsh-within.mjs` | 以 bili 代理 `startedAt` 为界的**同会话**前后对照 |
> | `dsh-host-side.mjs` | 导出全部 `system/message` 版本 + `developer/message` 工具增删 + 注入块分布 |
> | `dsh-breaks.mjs` | 用「read 缩水 >20%」判真断裂，并标注最近成因 |
> | `bili-correlate.mjs` / `bili-foldcost.mjs` | 把 `contextView.folds` 时间轴与会话日志对齐，量化每次 fold 的再付费 |
>
> 会话日志解压：`node -e "console.log(require('zlib').zstdDecompressSync(require('fs').readFileSync(P)).toString())"`。
>
> ## 8. 追加取证：其它插件是否造成前缀不稳定（2026-10-31）
>
> 起因是怀疑「上下文插件」（`billion-context`）把前缀打散了。结论：**它确实在请求链路上，
> 但不是主因**；真正改 system 段的是**工具注册表类的按需装配**。以下全部只读观测，
> 未改动任何产品代码。
>
> ### 8.1 `billion-context` 的位置与开关
>
> - 进程 `pid 10648`，监听 `127.0.0.1:18787`，`v0.1.209`；装入 profile `2026-10-30 19:44:46 +08`，
>   宿主（`pid 23020`）`19:57:03` 重启后生效；代理自身 `startedAt = 2026-10-30T15:54:28.404Z`。
> - `GET /__bili/config` 只有 `compress.ccr.enabled: true` 与 `preserveRecentTools: ["read"]`；
>   `stableSystemAnchor`、`cacheKeepalive.enabled` 均未开启，`passthrough.enabled: false`。
> - `GET /__bili/plugin/status?conversationId=<sid>` 暴露 `contextView.folds` 与 `contextView.switches`
>   （`dim` 为 `key` / `restart`），`GET /__bili/cache-report` 暴露它自己的未命中归因。
>
> ### 8.2 前后对照：同会话只掉 0.31 个点
>
> 以代理 `startedAt` 为分界（**不是**安装时间——两者差 5 小时 10 分，用错会把跨越期算进「生效后」）：
>
> | 口径 | 请求数 | 命中率 | 前缀断裂率 |
> | --- | --- | --- | --- |
> | 全部 workbuddy 流量 · 生效前 | 17,339 | 98.21% | 1.75% |
> | 全部 workbuddy 流量 · 生效后 | 2,760 | 96.03% | 4.24% |
> | 长会话汇总 reqs≥100 · 前（44 个） | 14,163 | 98.22% | 1.59% |
> | 长会话汇总 reqs≥100 · 后（3 个） | 2,239 | 96.98% | 4.15% |
> | **唯一跨两侧的同一会话 · 前** | 1,260 | 98.53% | 1.51% |
> | **唯一跨两侧的同一会话 · 后** | 441 | 98.22% | 2.27% |
>
> 汇总口径掉 2.2 个点是**样本构成污染**（生效后只有 4 个会话，且混着 trae / minimax 通道）。
> 可比的同会话对照组只掉 **0.31 个点**。⇒ `billion-context` 有开销，但撑不起 70%。
>
> 它自己的 `cache-report` 账目（同一会话 749 次请求）：`new content 622.5K /
> compress re-pay 115.2K / unattributed 2.84M`，恒等式残差 0。那 2.84M「无法归因」
> 正是 8.3 与 8.4 查出来的东西。
>
> ### 8.3 主因：工具注册表中途改写 system 段
>
> 一条会话（`session-<session-id>`）里 `system/message` 共 **7 个版本、两两不同**，且全部落在 turn 1–10：
>
> | turn | system hash | 长度 | 同期工具事件 | 该 turn 命中率 |
> | --- | --- | --- | --- | --- |
> | 1 | `72c3ea0c96` | 13,512 | 首次挂载 | 88.3% |
> | 3 | `c042b1da4b` | 13,516 | — | 74.5% |
> | 5 | `ab407f25db` | **39,092** | +`purge_apply` / `spawn_teammate` / `team_task_*` 等 8 个 | 85.3% |
> | 6 | `8ae221e73e` | 13,562 | +`create_worktree` / `session_event_*` / `session_search` | **0.0%** |
> | 8 | `36d55ca508` | 10,204 | −2 个工具（`tool-removal`） | **0.0%** |
> | 9 | `57fe05a45b` | 10,011 | +`bsk_*` 全套 + `mcp__wincu__*` 全套 | **0.0%** |
> | 10 | `e66c6f3b1d` | 13,834 | +`acp_*` / `compress` / `decompress` / `render_ui` | **0.0%** |
> | 12–37 | **未再变化** | — | 无 | 96–99.5% |
>
> 自然对照：**turn 12 之后 system 一次未变，26 个 turn 命中率全部 ≥96%，多数 98–99.5%**；
> turn 6/7/8/9/10/11 六连 0% 正好夹在连续的 system 改写之间。驱动者是
> `developer/message`（`source.kind: tool-registry`）共 9 条，全部落在 turn 1–10。
>
> 这不是某个插件的 bug，是**所有按需装配工具插件的共同副作用**：装载/卸载工具 ⇒ system 段换血
> ⇒ 整段前缀失效。
>
> ### 8.4 次因：`trae` 通道上游不报缓存
>
> 同一会话 `trae/deepseek-v4.1-flash` 49 次请求命中率 **26.06%**，其中 turn 6–11 连续
> **34 次 `read=0`**。字段映射本身正确（`dsh-connect-trae` 4.6.11 的
> `lib/index.js:4889`：`details["cached_tokens"] ?? usage["prompt_cache_hit_tokens"] ?? usage["cached_tokens"]`），
> 所以 0 不是解析丢失，是上游没缓存可报。贡献本会话未命中的 **33.7%**。
>
> ### 8.5 本会话未命中归因（799 次请求，命中 95.59%）
>
> | 来源 | 请求数 | 未命中 token | 占全部未命中 |
> | --- | --- | --- | --- |
> | 运行中前缀断裂（与注入块对齐） | 30 | 2,103,038 | 45.1% |
> | `trae` 通道（上游不报缓存） | 34 | 1,571,277 | 33.7% |
> | 正常命中 ≥90% 的增量 | 729 | 634,125 | 13.6% |
> | 空闲 >5 分钟 TTL 过期 | 1 | 183,670 | 3.9% |
> | 压缩 fold 之后 | 4 | 115,188 | 2.5% |
> | 其它 provider（`xiaomi-token-plan-cn`） | 2 | 56,757 | 1.2% |
>
> 断裂判据：**`cacheReadTokens` 相对上一请求缩水 >20%**（且上一请求 `read>5000`）。
> 另有 13 次真断裂在 turn 15 内，其中 **6 次落在注入块之后 3 步内**
> （注入 seq `822/1326/1844/2115/2220/2390` ↔ step `23/109/194/240/256/285`），
> 另 7 次无注入块——所以修 `keepPromptLast` 只覆盖一部分。
>
> > 判据修正记录：一度用「`read` 冻结不动」当断裂信号，那是错的——短 step 增量小也会满足，
> > 会报出大量假阳性。改用缩水比例后才是上面的 30 次。
>
> ## 9. 给报告人的具体请求
>
> 要让这份报告从「本机无法复现」变成「确认成因」，需要：
>
> 1. 那条 70% 会话的**截图里展开模型列表**，或直接说清楚是否用了子代理。
> 2. `dsh-subagent-default-model` 的配置（DSH 设置页 → 子代理默认模型）。
>    若 `strategy: random` 且候选里含 `minimax-m3.1-flash`，那就是本报告的 #1 成因。
> 3. 若方便，把该会话的 `session.v4.jsonl.zstd` 脱敏后附上（不含 prompt 正文，
>    只含 usage 计数器即可定位）。第 7 节的 `wb-mixed.mjs` 可直接跑出结论。
>
> ## 10. 待办（按性价比）
>
> **本节全部是「只记录、暂不动手」的状态。** 用户 2026-10-31 明确要求：上下文/缓存这条线
> 只出报告，不改代码。下面按影响排序，供后续决定，不代表已排期。
>
> 1. **工具注册表中途增删（影响最大，8.3）**：需要请求体才能把「哪次工具增删花了多少
>    token」算成逐次账目。开关是 `WORKBUDDY_BODY_REPORT`（`src/body-report.ts:93`
>    的 `WORKBUDDY_BODY_REPORT_ENV`），打开后逐请求 diff 相邻 system 段即可。
>    注意：**这属于产品行为改动，本次未做。**
> 2. **`keepPromptLast` 的重排补一条属性测试**：给定同一份会话历史，连续 N 个请求的
>    产出必须满足 `request[i]` 是 `request[i+1]` 的字节前缀。现有
>    `tests/upstream.spec.ts:339-571` 的 13 个用例全是**单请求快照断言**，
>    没有一个测跨请求前缀稳定性——这是它能 13/13 全绿却带着 bug 上线的原因。
> 3. **修重排逻辑**：从「只搬尾部」改成「所有注入块按同一规则归位到所属提问前」，
>    并加幂等守卫（已紧贴真实提问的注入视为已归位、不再动）。
> 4. **`<acp>` 标记的处理单独决策**：剥全部真实提问 = 前缀稳定 + 用量页正确 +
>    牺牲 `compress` 区间端点；只剥记录那条 = 保留端点 + 每轮断一次。产品取舍，需拍板。
> 5. **`trae` 通道 0% 命中**（8.4）：字段映射正确，是上游行为。只能换通道或接受。
> 6. **不建议**把「关掉 `keepPromptLast`」作为 issue #184 的答案：实测上限 1.74 点。

</details>
