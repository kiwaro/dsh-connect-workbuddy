# issue #189：子智能体请求的渠道校验

原调查使用 macOS 26.6.1 arm64、插件标记版本 5.17.0，代码与当时 5.18.0 一致。请求发送至国内版 `www.workbuddy.cn`，模型为 `hy3`。以下状态是该次对照的历史记录。

## 1. 版本对照

| 请求体 | 结果 |
|---|---|
| 原样发（不经过插件救援） | 400 / `channel_reject` / code 11128 |
| 经过 5.12.1 的 `prepareChatBody` | 400 / `channel_reject` ← 和你看到的一样 |
| 经过当前 main（5.18.0）的 `prepareChatBody` | 200 ok |

system 和 assistant 历史中都复现了相应情况。

## 2. 提示内容与角色

隔离每条消息后得到以下结果：

| 消息开头 | 原样发 |
|---|---|
| `You are an AI agent powered by DeepSeek Harness.` | 400 / channel_reject |
| `This is a message from a subagent.` | 200 ok |
| `The background subagent finished.` | 200 ok |

DSH 身份句在所测 system 和 assistant 文本中触发拒绝，另外两句子智能体消息在最小请求中返回成功。角色对照如下：

| 那句身份话放在哪 | 原样发 |
|---|---|
| `system` / `assistant`（字符串或 parts 数组） | 400 |
| `tool` 消息里 | 200 ok |
| `user` 消息里 | 200 ok |

该组证据将调查重点限定为具体提示内容及所在角色。

## 3. 请求处理对照

完整请求还含运行上下文中的 `Tokens prefixed with @ …` 段落。各处理方式的结果为：

| 救援等级 | 同一份 body 的结果 |
|---|---|
| 原样 | 400 / `channel_reject` |
| `forceNeutralHead`（开头插中性头） | 400 / `channel_reject` |
| 零宽扰动 | 400 / `channel_reject` |
| 密集零宽扰动 | 400 / `channel_reject` |
| `prepareChatBody`（5.12.1） | 400 / `channel_reject` |
| `prepareChatBody`（5.18.0） | 200 ok |

当时 5.13.1 开始对已知固定提示进行发送前处理，5.14.0 补充 Web GUI 段落的第二句。具体规则随版本变化，维护时检查 `prepareChatBody()` 及相应测试。

## 4. 复查方式

先记录插件版本和请求中的 `requestId`，再对同一请求体进行版本对照。`11128` 还可能涉及会话标识或首条消息等结构检查，需要保存完整错误详情。

原回归为 `tests/issue189-subagent-channel-gate.spec.ts`，7 项通过。另有一次 GUI 子智能体对话使用 `workbuddy-global/hy3`，耗时 13 秒，日志中 `11128` 为 0 次。

## 5. 验证范围

该调查直接构造请求并调用 `WorkBuddyUpstreamClient.chatStream()`。`@a9i5k4/dsh-auto-memory` 的后台运行过程因原临时 profile 的依赖构建受限，未包含在这次执行中；其完整运行仍需独立验证。
