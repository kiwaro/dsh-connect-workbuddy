# issue #25、#26 的 Windows 验证记录

本文记录 2026-10-01 对早期适配器修复的验证。验证版本和命令输出属于历史证据，当前安装与故障处理见 [Windows 说明](WINDOWS.md)。

## 1. 故障与修复

早期适配器按上下文形状选择转换方式。modern pi-ai 需要从 system 消息读取系统提示和工具，legacy 版本读取顶层字段。错误转换会导致工具缺失，或使国际版请求触发渠道校验。

| pi-ai 代次 | context 形状 | 谁读它 |
|---|---|---|
| 0.87+（modern） | `{ messages: [ {role:'system', content, toolsAdded}, … ] }` | 0.87 的 api 只从首条 system 消息取 prompt 与 tools；不读顶层 `systemPrompt`/`tools` |
| 0.85（legacy） | `{ systemPrompt, tools, messages }` | 0.85 的 api 只读顶层字段；`messages` 里的 system 条目会让它的 token 估算崩溃，记录见 issue #24 |

修复按实际解析到的 pi-ai 版本选择适配方式，并在 legacy 分支中恢复工具状态。本文记录的 modern 透传规则属于当时实现；pi-ai 1.1.0 的后续上下文整理见 [rc.1 调查](DSH-0.2.1-RC1-FOLLOWUP.md)。

## 2. 验证环境

| 项 | 值 |
|---|---|
| 操作系统 | Windows 11 专业版 10.0.22621 |
| Node | v24.19.0 |
| pnpm | 11.7.0（DSH 内置；系统 PATH 中无 pnpm） |
| DSH | 0.2.0.0 |
| profile / 安装方式 | `desktop`；junction → `D:\DshProject\dsh-connect-workbuddy`（仓库本体） |
| 验证提交 | `6866d5ad66b2fd5f5c3ba805dab64255e75283d8`（即含修复 `abe09c5`） |

验证使用提交 6866d 开头的版本，包含 abe09c5 的修复。当时完整测试为 33 个文件、721 项通过。

## 3. 修复前后对照

旧构建产物采用 3.0.1、来源提交 1ada886。1920b65 只调整版本和文档，未改变源码，因此该旧构建可用于故障对照。

| 区域 | 表现 |
|---|---|
| 国内版 | 模型承认没有工具：「我没有可用的 shell 工具，无法真实执行命令……」→ #26 复现 |
| 国际版 | `400 {"message":"…{\"code\":11128,\"msg\":\"first message is not system prompt\"}…"}` → #25 复现，与判据 B1 逐字吻合 |

修复后的构建时间为 10:46:23，DSH 启动时间为 10:49:43，心跳时间为 10:49:47。doctor 确认 DSH 解析到 legacy pi-ai 0.85.1。

| 区域 | E1 真实执行 | E2 工具真名 | E3 不再 400 | E4 prompt 生效 |
|---|---|---|---|---|
| workbuddy（国内） | ✅ `pwsh` 真实调用，输出逐字 `WB-2526-FIXED` | ✅ 48 个 DSH 真名 | N/A（本无 400，全程无报错） | ✅ |
| workbuddy-global（国际） | ✅ `pwsh` 真实调用，输出逐字 `WB-2526-FIXED` | ✅ 48 个 DSH 真名 | ✅ | ✅ |

国内版和国际版均调用了 pwsh，输出 WB-2526-FIXED，并识别 48 个 DSH 工具名。

## 4. 验证范围

本次 Windows 现场验证覆盖了 legacy 依赖链。modern 市场安装路径使用单元测试模拟，其现场端到端结果需要另行记录。修改安装链接前，应先备份配置并核对链接和目标路径。

检查工具执行时，同时核对工具调用记录、命令输出和实际副作用；模型回复中的执行声明只能作为辅助信息。
