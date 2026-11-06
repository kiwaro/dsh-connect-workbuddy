# DSH 0.2.1-rc.5 兼容性复核

复核日期为 2026-10-30，环境为 Node 24.21、pnpm 11.28.5。本文中的接口、界面扩展位置和测试计数均对应当时版本。

## 1. 升级结论

本插件当时使用的接口无需改动。14 个直接依赖中，13 个包的库文件相同，DSH 供给的 pi-ai 保持为 1.1.0。版本检查允许 rc.1 至 rc.5，通过上限检查后拒绝 0.3.0-rc.1。

## 2. 新增推理界面扩展位置

DSH 新增 conversation.chat.reasoning.body。该界面扩展位置的 rawText 提供推理原文，text 提供处理后的文本。后续接入此界面扩展位置时，应根据显示目的选择字段，并保留 DSH 已有的文本处理行为。

## 3. 插件使用的界面扩展位置和路由

下表为复核时的注册情况。conversation.input.left 属于当时的实现，现有注册位置以源码为准。

| 界面扩展位置 | kind / scope | 当时注册的组件及优先级 |
|---|---|---|
| `conversation.input.left` | list / session | trae `4`、qoder `4`、workbuddy `4` — 全部 `active: true` |
| `conversation.input.model.label` | single / session | qoder `-1`（active）、workbuddy `-0.5`、trae `0` |
| `conversation.composer.dock` | list / session | DSH `activity`/`usage`，trae `10`、qoder `10`、workbuddy `10`、workbuddy-cli-live `11` |
| `shell.quota-notice` | chain / root | DSH 一条 + workbuddy 一条，均 `active: true` |

本机路由调用结果如下。POST 与 GET 的请求方法差异也纳入了检查。

| 请求 | 结果 |
|---|---|
| `GET …/usage?region=cn` | 200，18317 字节，`status: signed-in`，15 个模型 / 9 个账号 |
| `POST …/media-models?region=cn` | 200 |
| `GET …/models-refresh?region=cn` | 404 → 该路由是 POST-only，`GET` 落在 DSH 404 是正确行为 |
| `GET …/account-credits?region=cn` | 200，939 字节，三个账号读数齐全 |

## 4. 依赖与主题

| 包 | rc.3 vs rc.5 | 说明 |
|---|---|---|
| `dsh-app-boot` | 字节内容相同 | 兼容版本检查实现未变 |
| `dsh-system-prompt` | 字节内容相同 | 提示词归属包 |
| `dsh-harness-dev-context` | 字节内容相同 | 同上 |
| `dsh-file-reference` | 字节内容相同 | 同上 |
| `dsh-web-app` | 字节内容相同 | `personaPrefix`（`You are a coding agent powered by the {{model}} model.`）与 1017 徽章插件的 patch 行都在原位 |
| `dsh-cordis-client-runner` | 仅 `slot-catalog.ts` 的 sourcemap 行号 + `reasoning.body` 的 summary/doc/ownerProps | 对应第 2 节所述新增位置的目录记录 |
| `dsh` 包的依赖表 | 86 条，键集合与版本形态完全一致，仅 `0.2.1-rc.N` 的号一起翻 | 依赖集没有增删 |
| `@deepseek-ai/cordis` / `schemastery` | `~4.0.5` / `~3.18.5`，两版相同 | 运行时底座未动 |

复核还检查了 86 个依赖键和 348 份包清单。客户端使用的 24 个主题令牌中，19 个有 DSH 定义，5 个依靠回退值显示。

## 5. 测试范围与结果

项目原有依赖环境下，2655 项通过、2 项跳过，158 个测试文件中 157 个通过、1 个跳过。

替换为 rc.5 DSH 别名包后，2653 项通过、2 项失败、2 项跳过。失败来自测试检测器与运行时解析了不同的 pi-ai 版本：检测器读取 0.85，运行时使用别名 1.1。移除别名后相关测试 6 项通过，modern 分支单独检查 4 项通过。

本机 doctor 记录的插件版本为 5.14.1、DSH 进程号为 35629，账号池包含国内版 9 个、国际版 3 个账号。这些数据用于说明当时的检查环境。

新增的 host-slot-surface.spec.ts 包含 5 项检查。变异测试分别对源码引入 3 种缺陷，均触发了预期失败。后续升级应继续核对界面扩展位置、路由和主题回退，测试结果须附依赖版本。

## 6. 后续设置页补充

2026-11-06 新增 `settings.section` 与 `settings.section.icon`，用于 DSH 设置栏中的独立页面及图标。这两处不读取推理正文，不改变 rc.5 的 `rawText` 与 `text` 处理结论。界面扩展位置清单已同步到设计说明与测试。
