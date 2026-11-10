# PR #188：macOS 验证步骤

本清单对应 `pr188-opt-in` 分支的 `5157dbd`，用于检查默认关闭的 WorkBuddy 侧边栏。对应历史执行结果见 [MAC-VERIFY-PR188-REPORT.md](MAC-VERIFY-PR188-REPORT.md)。

## 1. 构建与安装

在所测源码目录执行依赖安装、构建及入口检查，再将该目录添加到测试 profile。重启测试 DSH 后开始检查。

```sh
pnpm install
pnpm run build
pnpm run verify:entries
dsh plugin --profile pr188 add .
```

## 2. 默认状态

打开未设置 `sidebarPanel` 的 profile，检查侧边栏及 usage 接口。默认应关闭 WorkBuddy 侧边栏入口，接口中的 `sidebarPanelEnabled` 应为 false。

## 3. 开启和关闭

1. 在能力分区打开侧边栏开关。
2. 点击新增入口，检查完整页面、品牌图标和返回会话按钮。
3. 在面板打开时关闭开关，检查入口注销及主区域返回会话。
4. 再次开启并重启测试 DSH，检查保存状态。

侧边栏导航根据界面扩展位置元数据生成，验证时应检查注册和注销结果。仅让页面组件返回空值仍会保留注册信息。

## 4. macOS 项目

检查设备模式按钮及 SDK 获取状态。所测版本将 macOS 的 SDK token 获取能力标记为 broken，界面应解释其状态。复查后续版本时，记录所用 SDK 和运行时。

检查 `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth` 的账号读取，并通过 doctor 查看目录选择及加密字段支持。凭据文件按 POSIX 权限规则处理。

## 5. 其他回归

检查图生视频的远程图片读取是否使用 GET，并检查超时信息是否包含任务标识。渠道校验复查应记录完整错误及请求标识。HarmonyOS 路径需要在对应系统单独验证。

提交结果时记录操作系统、插件提交、profile、重启后的配置值及实际界面表现。

## 历史技术原文与证据

来源：本仓库语言改写前提交 `0d6cf6b^` 的同名文档。以下引用恢复被压缩的接口名称、请求条件、实验表、命令和设计取舍；涉及身份的数据已替换为占位符。原记录中的第一人称和口语作为历史引文保留，不作为维护文档的新写法。

此处为原验证计划，不能将待执行项目视为本轮或当前机器已经通过。SDK fallback 按当前配置执行。

<details>
<summary>展开历史技术记录</summary>

> 分支：`pr188-opt-in`，head `5157dbd`。
> 已推送位置（你自己的仓库，Mac 上直接拉这个）：
>
> ```
> git clone -b pr188-opt-in https://github.com/dingminhua/dsh-connect-workbuddy.git
> ```
>
> CI 在 `5157dbd` 上三个 job 全绿（ubuntu / windows / pi-ai 1.1.0），所以下面要看的
> 都是 **CI 覆盖不到的东西**——主要是真实宿主里的侧边栏行为，以及 macOS 独有的两条。
>
> ---
>
> ## 0. 先构建，再装
>
> `link:` 安装不跑 `prepare`，`lib/` 是 gitignore 的：
>
> ```sh
> pnpm install          # prepare 会构建一次
> dsh plugin --profile desktop add .   # 或绝对路径
> pnpm run verify:entries              # 自查每个声明的产物在不在
> ```
>
> 改完源码要重新 `pnpm run build` 再重启 DSH Desktop。
>
> ---
>
> ## 1. 最重要的一条：确认它**默认不出现**
>
> 装好、重启，**在完全没动设置的情况下**看侧边栏。
>
> - ✅ 期望：**没有** WorkBuddy 那一行。
> - ❌ 如果出现了，说明 opt-in 没生效，这是本次改动的核心断言，直接回我。
>
> 这一条在 CI 里只有源码级断言（`registerAllSlots` 里没有 `registerPanel()`），
> 真宿主里没验过——因为 `ui-sidebar` 的导航行是用**槽位条目元数据**拼的，
> `null` 组件只会得到空白按钮，所以"没注册"和"注册了但空"在源码测试里分不开。
>
> ---
>
> ## 2. 打开它，确认整条链路
>
> 卡片「能力」栏最下面 → 勾上「在侧边栏显示 WorkBuddy」。
>
> - [ ] 侧边栏**立刻**出现那一行（不用保存、不用重载页面）
> - [ ] 点它，中间栏出现 WorkBuddy 整页，**左上有「返回会话」按钮**
> - [ ] 点返回，回到对话
> - [ ] 顶上的图标是彩色品牌图，不是空白方块
>
> ---
>
> ## 3. 开着面板时把它关掉（最容易出问题的一步）
>
> 在**面板正开着**的状态下，回到「插件」页把开关取消勾选。
>
> - [ ] 中间栏**自动回到对话**，不留一个空白页
> - [ ] 侧边栏那一行消失
>
> 预期机制：`ui-layout` 的 `retainMainPanels` 会丢掉 `main` 里已经不存在的
> `activePanelId`。这条我在 Windows 上没实测过（我改的是插件侧），
> **如果你这里卡住白屏，请重点回我这一条。**
>
> ---
>
> ## 4. 重启后仍然记得
>
> 勾上开关 → 完全退出 DSH Desktop → 重新打开。
>
> - [ ] 侧边栏那一行还在
> - [ ] 「能力」栏的复选框仍然是勾着的
>
> （这一步验的是 `sidebarPanel` 写进了 `cordis.patch.yml` 并且 volatile 读取正常。）
>
> ---
>
> ## 5. macOS 独有的两条
>
> ### 5.1 「真实值」这一档应该是**灰的并说明原因**
>
> `realTierAvailabilityFor()` 对 `darwin` 硬编码返回 `broken`（mac 上 SDK 的
> `dispatch_sync` 有限制，机器验不了）。所以在 Mac 上打开设备参数弹窗：
>
> - [ ] 「真实值」这一档选中不了，且**给出了原因**
> - [ ] 「虚拟值」照常可用
>
> 如果 Mac 上这一档其实是好的，那说明 `realTierAvailabilityFor` 的 darwin 分支
> 该改——请把你看到的现象告诉我。
>
> ### 5.2 凭据路径 / 文件权限
>
> mac 只认一条路径（没有 env 变量可回退）：
>
> ```
> ~/Library/Application Support/CodeBuddyExtension/Data/Public/auth
> ```
>
> - [ ] 卡片能读到本机已登录账号
> - [ ] 如果读不到，跑 `dsh-connect-workbuddy doctor` 看它报的候选路径
>
> 另外 5.16.0 给 Windows 加了 `icacls` 加固（issue #183）。mac 上走的是
> POSIX 权限那条分支——**这条我只在 Windows 上验过**，如果 Mac 上出现
> 权限相关的报错，把原文发我。
>
> ---
>
> ## 6. 顺带能验的三个已修 issue
>
> 都在这个分支里（已合入 main），Mac 上顺便看一眼更省事：
>
> | Issue | 怎么验 | 期望 |
> |---|---|---|
> | #187 图生视频 | 给工具的 `image` 参数传一个 **https URL** | 不再 403；签名过期会在建任务**之前**报 `INVALID_ARGS` |
> | #187 超时 | 不再需要跑满 10 分钟 | 报错里现在**带 task id**；上限 570s（内部 540s） |
> | #189 子智能体套话 | 开 `autoConsolidate`，让子智能体跑一轮 | 不再 11128（需 ≥5.14.0，这个分支已经是） |
> | #190 鸿蒙 | Mac 上验不了 | 跳过 |
>
> ---
>
> ## 需要我改的吗
>
> 第 3 条（开着面板时关掉）和第 5.1 条（真实值档位）是我最没把握的两处，
> 因为都涉及"宿主/平台替我做了决定"而我只能从源码推断。其它任何一处不对，
> 把现象发我即可。

</details>
