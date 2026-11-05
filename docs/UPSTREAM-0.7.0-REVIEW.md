# 连接器 v0.7.0 对照记录

比较对象为 `corrinehu/dsh-workbuddy-connect` v0.7.0、提交 `dd01375`，以及本项目v3.0.2。原上游检出从v0.2.3的 `d91d804` 更新了162个提交。本文记录当时发现的差异，后续版本状态需要重新检查。

## 1. 功能差异

原调查重点检查图片访问、回环请求校验和Linux凭据路径：

| # | 缺口 | 上游来源 | 本项目证据 | 影响 |
|---|------|---------|-----------|------|
| 1 | 未接 `resolveImageAccess` | `a3fb1ba`（issue #52） | `src/adapter.ts:105` 只有 `resolveAttachments`；`src/index.ts:1397` 只传它；全仓 `resolveImageAccess` 零命中 | 图片句柄文本不含本地归一化路径，模型 `read_image` 只能瞎猜 sha256 路径 |
| 2 | web 状态路由缺 Host 头回环校验 | `bd6a77d`（PR #11 review） | `src/web-status.ts:279` `loopbackOrigin()` 只查 Origin，且 `origin === undefined` 时返回 `true`；Host 校验只存在于 `src/shim.ts:190`（已于 5.8.5 修复：`src/loopback.ts` 的 `requireLoopback` 对 13 条路由同时校验 Host 与 Origin） | 状态文档（昵称、剩余积分、模型费率）可被 DNS-rebinding 页面读取 |
| 3 | Linux 桌面凭据只探 XDG config home | `38c1e5a`（issue #43） | `src/auth.ts:273` Linux 分支只有 `XDG_CONFIG_HOME ?? ~/.config`，无 `~/.local/share` | UOS/deepin 版把登录写成「未登录」 |

平台程序发现还存在以下差异：

| # | 缺口 | 上游来源 | 本项目证据 | 影响 |
|---|------|---------|-----------|------|
| 4 | macOS 无非默认安装路径回退 | `8aa1420`（issue #48） | `src/at-rest.ts:92` 只有 `WorkBuddy.app` / `WorkBuddy AI.app`，仅探 `/Applications` 与 `~/Applications`，无 `mdfind` | 装在 `/Applications/IDE/WorkBuddy.app` 时报「未登录」，加密凭据无法解密 |
| 5 | Windows 无注册表/卸载记录扫描 | `de2c795`、`2cef8c8`、`8a26464`（#59/#60/#66） | `src/at-rest.ts:274-283` 只有 `LOCALAPPDATA` / `ProgramFiles` 硬编码候选 | 非默认安装位置（如 D: 盘）完全不被发现 |
| 6 | WSL 不探挂载的 Windows 配置目录 | `91758ea`（issue #4） | 全仓 `wsl` 零命中；WSL 下 `process.platform === 'linux'`，只走 `.config` | WSL 用户被读成「未登录」 |

其中Host与Origin的统一检查后续在5.8.5通过 `src/loopback.ts` 处理。

## 2. DSH 兼容性

当时两项目分别调整 DSH 设置和模型适配。本项目已采用 DSH0.1.7及以上的接口，peer上界为 `<0.3.0-0`。旧 DSH 的settings和image-budget包装需按目标范围判断。

推理off档位、PowerShell进程时间查询、企业额度及每模型上下文预算均有各自实现。对照时需要检查实际调用链和输出，避免仅根据同名改动重复引入逻辑。

## 3. 当时提出的可选功能

| 特性 | 上游来源 | 说明 |
|------|---------|------|
| 右下角更新提醒 | `f0da1eb`、`22cb6c6`、`36620ef`、`576d3f8`、`ad0306f`（`src/update.ts` + `update-store.ts`） | 查 npm dist-tags 与 GitHub releases，按版本数列出更新说明。本项目无（`dist-tags` / `releases` 零命中） |
| 逐账号模型显隐开关 | `37a7098`、`03e6ea9`（issue #36） | 本项目的 `enabledModelIds` 是按区域的，没有按账号粒度 |
| 未声明模型的推理档位探测 | `c540939`、`360ad75` | 本项目 `src/probe.ts` 是可用性/限流体积探测（模块注释明确三个实测结论），不做档位探测 |

## 4. 跟进顺序与验证

原建议先核对 `resolveImageAccess`，随后统一Host回环校验，再补Linux和WSL候选，最后检查macOS及Windows自定义安装位置。

图片访问需要按请求取得 DSH 文件路径映射。Windows候选要考虑Electron将 `app.asar` 报告为目录的行为。路径变更需在对应系统和注入平台测试中分别核对。

调查材料包括两项目的源码、DSH0.2.0-rc.1、已安装的0.1.7-rc.1依赖及pi-ai构建文件。表中的源码位置属于当时版本，可通过提交记录定位。
