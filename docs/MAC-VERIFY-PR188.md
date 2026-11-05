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

侧边栏导航根据槽位元数据生成，验证时应检查注册和注销结果。仅让页面组件返回空值仍会保留注册信息。

## 4. macOS 项目

检查设备模式按钮及 SDK 获取状态。所测版本将 macOS 的 SDK token 获取能力标记为 broken，界面应解释其状态。复查后续版本时，记录所用 SDK 和运行时。

检查 `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth` 的账号读取，并通过 doctor 查看目录选择及加密字段支持。凭据文件按 POSIX 权限规则处理。

## 5. 其他回归

检查图生视频的远程图片读取是否使用 GET，并检查超时信息是否包含任务标识。渠道校验复查应记录完整错误及请求标识。HarmonyOS 路径需要在对应系统单独验证。

提交结果时记录操作系统、插件提交、profile、重启后的配置值及实际界面表现。
