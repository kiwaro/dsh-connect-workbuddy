# DSH 0.2.1-rc.1 兼容性调查

调查日期为 2026-10-17，补充结论截至 2026-10-24。调查以插件 4.6.7 为基线，修复随 4.7.0 发布。本文记录当时的依赖差异与验证结果。

## 1. 调查结论

pi-ai 从 0.85.1 升至 1.1.0 后，上下文读取方式发生变化。DSH 提供的顶层 systemPrompt 和 tools 需要由插件整理到首条 system 消息中，否则发送的请求会缺少系统提示和工具声明。

DSH 使用 includePrerelease: true 检查插件版本范围，0.2.1-rc.1 可以通过加载检查。早期报告根据 semver 默认行为判断 DSH 会拒绝加载，该判断在后续复核中更正。

## 2. 请求体对照

调查通过实际 createProvider、openAICompletionsApi 和本地 SSE 服务捕获请求体。输入采用 DSH 生成的上下文形状 {systemPrompt, tools, messages}。

| pi-ai 版本 | 线上 `messages[].role` | 线上 system 文本 | 线上 `body.tools` |
|---|---|---|---|
| 0.85.1 | `["system","user"]` | `SYS-PROMPT-MARKER` | `1` ✅ |
| 1.1.0（现状） | `["user"]` | `null`（prompt 丢了） | `0`（工具全丢） |
| 1.1.0（格式转换后） | `["system","user"]` | `SYS-PROMPT-MARKER` | `1` ✅ |
| 1.1.0（再次转换已处理的格式） | `["system","user"]` | `SYS-PROMPT-MARKER` | `1` ✅（再次执行时保留原结果） |

0.85.1 读取顶层字段；1.1.0 从消息序列中读取系统提示和工具。原来的 modern 分支直接转交输入，因此即使识别为 modern，输出请求仍会丢失字段。

## 3. 修复与验证

foldModernContext 将 systemPrompt 和 toolsAdded 放入首条 system 消息，设置 timestamp 为 0，并删除已转移的顶层字段。对于已经整理过的输入，重复处理保持结果一致。

| 对象 | roles | system | tools |
|---|---|---|---|
| 修复后的构建产物 | `system,user` | `SYS-PROMPT-MARKER` | 1 |
| 把该分支改回 `return api` 的同一构建 | `user` | `null` | 0 |

adapter-outgoing-body.spec.ts 按 pi-ai 代际与上下文形状组成对照矩阵，并使用实际安装的 pi-ai 发送请求。调查基线的结果为 1346 项通过，测试文件 80 个通过、1 个跳过；这些计数属于当时的依赖环境。

## 4. 依赖范围

当时 pi-ai 的 peer 范围调整为 >=0.85.0 <0.88.0 || >=1.0.0-0 <2.0.0。DSH 版本检查必须同时核对声明范围和 DSH 调用 semver 时传入的选项。

| 包 | 0.1.7 → 0.2.1 | 插件使用点 | 结论 |
|---|---|---|---|
| `dsh-llm` | `AdapterRegistrationHandle` / `DirectoryRegistrationHandle` / `registerAdapter` / `registerConfigurableProviders` / `registerModelDiscovery` 签名全同 | `src/index.ts:30, 2033-2035, 2079` | 无需改 |
| `dsh-settings` | 全部 `.d.ts` 字节内容相同（md5 一致）；`configure({auto}, owner)` 仍在 | `src/index.ts:29, 287-289, 1958-1960` | 无需改 |
| `dsh-host-webserver` | `register(WebRoute)` / `WebRouteKind` / `registerUpgrade` / `registerFallback` 全同 | `src/web-status.ts` 10 处 `kind:'exact'` | 插件未读取 port getter，返回类型变化对当时调用无影响 |
| `dsh-llm-pi-ai` | `PiAiAdapter` 构造、`ResolvedPiAiProviderProfile` 字节内容相同 | `src/adapter.ts:401-425` | 无需改 |
| `dsh-atomic-write` / `dsh-home-paths` | 仅新增可选能力 | `src/host-peers.ts:84, 288-322` | 无需改（可选用 `signal`） |
| `cordis` 4.0.2→4.0.5 | 仅 `Fiber.update()` 返回值类型范围缩小 | 插件未调用 | 无需改 |
| `schemastery` 3.18.4→3.18.5 | `.d.ts` 字节内容相同 | `src/index.ts:28` | 无需改 |

## 5. 后续问题

issue #83 涉及压缩请求携带 off 推理档位，后续通过模型限制、请求体检查及配置默认值修复。issue #84 涉及错误分类：保留 model_busy，将短时限流转换为 quota_exceeded，以便 DSH 选择对应的重试行为。

当前适配说明见[设计文档](DESIGN.md)，后续 DSH 复核见 [rc.3 记录](DSH-0.2.1-RC3-FOLLOWUP.md)和 [rc.5 记录](DSH-0.2.1-RC5-FOLLOWUP.md)。
