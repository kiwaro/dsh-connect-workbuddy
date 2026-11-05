# PR #188：macOS 执行记录

原测试对象为 `main` 的 `c3f9a80`，当时标记版本 5.17.0，后续以相同代码发布 5.18.0。环境为 macOS 26.6.1、Darwin 25.6.0 arm64 和 Node.js v25.9.0。

## 1. 构建与测试

| 步骤 | 命令 | 结果 |
|---|---|---|
| 装依赖 | `pnpm install` | ok（prepare 里自动构建） |
| 构建 | `pnpm run build` | ok（tsdown + `scripts/verify-entry-artifacts.mjs`） |
| 产物 | `pnpm run verify:entries` | 6 declared artifact(s) present：`lib/index.js`、`lib/index.d.ts`、`lib/bin.js`、`lib/client.js`、`cordis.patch.yml`、`package.json` |
| 类型 | `pnpm run typecheck` | exit 0（`tsconfig.json` + `tsconfig.client.json`） |
| 全量测试 | `npx vitest run` | 176 文件 / 2938 例，2936 passed + 2 skipped，41.22s，exit 0 |

原全量覆盖 176 个文件，共 2936 项通过。另有 2 项 Windows 专用测试跳过，总耗时 41.22 秒。该记录采用测试输出的通过和跳过数量。

## 2. 侧边栏

新浏览器上下文中，默认侧边栏包含插件、自动化任务和更多入口。usage 返回 `sidebarPanelEnabled: false`，配置中缺少 `sidebarPanel` 时采用默认关闭状态。

开启能力分区开关后，WorkBuddy 入口在约 3.5 秒内出现。点击后进入完整设置页面，返回按钮和品牌图标正常。

面板打开时关闭开关，侧边栏入口注销，主区域返回会话，配置保存 false。重新开启并启动测试 DSH 后，入口与勾选状态保留，配置为 true。

## 3. 设备和凭据

所测 macOS 设备模式按钮处于禁用状态，提示 SDK 等待 dispatch 主队列。SDK 页面报告 `darwin-arm64`、Electron 44.7.0，设备 token 尚未获取，所用模式为虚拟设备。

doctor 读到 9 个国内版和3个国际版账号。凭据库权限为 `-rw-------`，桌面端加密字段读取可用，程序路径来自 WorkBuddy 应用包中的 Electron。

## 4. 其他检查范围

图生视频的 GET 下载及 data URL 转换通过代码和单元测试检查；该次未执行付费生成。超时常量检查为插件570秒、内部查询540秒，保留任务标识；执行未持续至超时。

子智能体渠道校验的实际网关对照见 [issue #189 记录](ISSUE-189-REPLY.md)。HarmonyOS 使用对应平台的独立验证。

## 5. 材料与限制

验证使用 `pr188` profile 和端口7788，同一份客户端构建供测试窗口加载。原桌面 GUI 地址需要启动 cookie，界面行为主要在测试窗口验证；桌面 profile 从 DSH 接口确认默认状态。

原截图目录记为 `docs/pr188-mac-shots/`，包含默认状态、面板页面、关闭返回会话、图标、设备模式及 SDK 状态。引用截图前需要确认记录文件存在。
