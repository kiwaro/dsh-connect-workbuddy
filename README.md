# dsh-connect-workbuddy

本插件将 WorkBuddy 国内版和国际版模型接入 DeepSeek Harness（DSH）。在插件设置页可管理账号池、选择模型并查看积分余额。

[安装](#2-安装) · [账号与模型](#3-账号与模型) · [账号池](#4-账号池) · [常见问题](#8-常见问题) · [更新日志](CHANGELOG.md) · [英文说明](README.en.md)

<img src="docs/assets/dsh-connect-workbuddy-usage-card.png" width="640" alt="WorkBuddy 插件设置页，包含账号与模型设置" />

## 1. 仓库与版本

此项目是 [dingminhua/dsh-connect-workbuddy](https://github.com/dingminhua/dsh-connect-workbuddy) 的 fork。

| 分支或安装来源 | 内容 |
| --- | --- |
| `main` | 上游代码；中文首页另行维护 |
| [workbuddy-local-integration](https://github.com/kiwaro/dsh-connect-workbuddy/tree/workbuddy-local-integration) | 基于 5.18.0 的集成修改：每次响应的积分记录、账号轮换后的积分归属，以及中文提示调整 |
| npm 包 `dsh-connect-workbuddy` | 上游作者发布的版本 |

插件会记录每次响应消耗的积分，日志格式和读取方法见[积分日志说明](https://github.com/kiwaro/dsh-connect-workbuddy/blob/workbuddy-local-integration/docs/CREDIT-JOURNAL.md)。

插件通过 WorkBuddy 客户端接口调用模型，费用由所用账号承担。第三方接入可能导致账号限制或封禁；接口调整可能中断服务。使用范围限定为个人学习、研究和个人合理用量，并应遵守 WorkBuddy 服务条款。

## 2. 安装

### 2.1 安装集成分支

需要 Git、pnpm 和符合 `^22.19.0 || >=24.0.0` 范围的 Node.js。DSH 依赖范围见 [package.json](package.json) 的 `peerDependencies`。

以下示例将仓库放在 Windows 的 `D:/projects` 目录。使用其他目录时，请同步修改命令中的路径。

```sh
git clone --branch workbuddy-local-integration https://github.com/kiwaro/dsh-connect-workbuddy.git D:/projects/dsh-connect-workbuddy
cd D:/projects/dsh-connect-workbuddy
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
dsh plugin --profile desktop add D:/projects/dsh-connect-workbuddy
```

运行上述命令后，重启 DSH 以加载插件。以后修改 TypeScript 源码时，也需要重新构建并重启 DSH。

### 2.1.1 支持的 DSH 版本

| DSH 版本 | 插件兼容范围 |
| --- | --- |
| 0.1.5 及更早 | 使用上游插件 2.0.15 |
| >=0.1.7-rc.1 且 <0.3.0-0 | 本分支声明支持的范围 |
| 0.3.0 及其预发布版 | 超出本分支声明的范围，需要检查依赖和接口后适配 |

### 2.2 安装上游发布版

```sh
dsh plugin --profile desktop add dsh-connect-workbuddy
```

网页和终端界面分别使用 `web`、`dsh-tui` profile。安装、更新或卸载插件后，重启对应的 DSH 进程。

### 2.3 登录并启用模型

1. 登录 WorkBuddy 桌面端，或在插件设置中添加账号。
2. 在 DSH 的插件设置中打开 WorkBuddy，选择国内版或国际版。
3. 刷新模型目录，勾选要使用的模型并保存。
4. 返回会话，从模型列表中选择 WorkBuddy 模型。

国内版和国际版的 provider ID 分别为 `workbuddy` 和 `workbuddy-global`。两者的账号、积分和模型列表分别保存。

### 2.4 更新

更新集成分支时，在仓库目录中执行：

```sh
git pull --ff-only
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

上游发布版可先查询版本，再安装指定版本：

```sh
npm view dsh-connect-workbuddy version
dsh plugin --profile desktop add dsh-connect-workbuddy@<版本号>
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
```

完成后重启 DSH。遇到新版本等待期错误时，按[更新说明](docs/PINNED-UPGRADE-LAG.md)处理。

## 3. 账号与模型

设置页包含账号、模型、能力和诊断四个分区。

| 设置 | 作用与生效方式 |
| --- | --- |
| 国内版／国际版开关 | 开启后，将该区域已勾选的模型加入 DSH 模型列表；关闭后保留账号和设置 |
| 刷新模型目录 | 更新模型列表、积分倍率和活动信息，刷新后生效 |
| 模型勾选 | 勾选需要加入 DSH 模型列表的模型，保存后生效 |
| 上下文预算 | 设置 DSH 使用的上下文上限，可选 200K、500K 或模型原生窗口 |
| 图片输入 | 为所选模型启用图片输入，保存后生效 |
| 默认推理强度 | 为未指定推理档位的请求设置默认值，包含新会话、摘要和会话命名请求 |
| 关闭思考 | 允许模型使用 off 推理档位；模型拒绝该档位后，此选项会被禁用 |
| 测试 | 发送请求检查模型可用性，按模型费率消耗积分 |
| 测速 | 发送 3 次短请求，取输出速度中位数，按模型费率消耗积分 |

修改模型列表后，点击模型分区的保存按钮；修改账号池成员或偏好后，点击账号池的保存按钮。能力分区的开关在切换后立即生效。

插件从 WorkBuddy 模型目录读取积分倍率和活动时间，并在模型列表中显示。国内版还显示模型的繁忙程度。不同账号可能获得不同的模型列表和价格，调用时按所用账号计费。

积分面板显示账号余额。可在设置中选择将面板放在输入框工具栏或输入框下方，也可在能力分区开启侧边栏入口。

## 4. 账号池

### 4.1 成员与自动选择

在账号池中勾选需要使用的账号并保存。插件从这些账号中自动选号，也使用这些账号执行批量签到和测试。

开启账号池后，插件自动选择账号发送请求。遇到符合换号条件的错误，插件尝试其他账号。

关闭账号池后，在“使用中的账号”下拉框中选择账号，插件使用该账号发送请求。需要批量签到或测试时，点击相应按钮。

插件按以下顺序比较账号。两个账号在前一条件下相同时，插件继续比较下一条件：

1. 账号可用状态：可用账号优先。
2. 临期积分：有 3 天内到期积分的账号优先。
3. 手动顺序：按保存的位置排序。
4. 临期积分到期时间：先到期的优先。
5. 临期积分数量：数量多的优先。
6. 总积分：余额多的优先。
7. 登录凭据有效期：到期较晚的优先。
8. 账号标识：以上条件相同时，按标识排序。

触发换号的错误包括账号限流、积分耗尽、登录失效和连接故障。插件收到这类错误后，会尝试其他可用成员。模型繁忙时可稍后重试或切换模型。遇到渠道校验或参数错误时，需要根据报错调整请求。

### 4.2 批量测试

批量测试用于检查所选账号能否调用指定模型。测试前，在账号池中完成以下设置：

1. 选择测试模型。默认使用该区域上下文窗口最大的免费模型；也可选择其他模型。使用收费模型时，每个被测账号都会产生相应的积分消耗。
2. 设置测试输入长度。建议接近实际对话的请求长度，以便检查账号能否处理日常使用中的请求。
3. 勾选需要测试的账号，保存设置，再点击“测试勾选的账号”。

测试结果对应本次所用的模型和输入长度。例如，短请求测试通过后，较长的对话请求仍可能触发账号限制。因此，判断账号是否适合某个会话时，还需要比较测试输入和会话请求的长度。

### 4.3 每日签到

插件仅为国内版个人账号签到。在账号池中勾选需要签到的账号并保存，点击“签到勾选的账号”领取当日奖励。

自动签到默认关闭。打开自动签到开关并保存后，插件每天为账号池成员领取签到奖励。插件记录签到结果，当天只处理尚未完成签到的账号。

### 4.4 账号恢复

| 状态 | 处理方式 |
| --- | --- |
| 账号限流 | 按服务端给出的恢复时间等待；缺少恢复时间时，默认等待 30 分钟 |
| 积分耗尽 | 等待积分包刷新，或选择其他有额度的账号 |
| 连接失败或服务端异常 | 默认等待 30 分钟，随后插件可再次选择该账号 |
| 登录凭据被拒绝 | 更新登录凭据后手动测试 |
| 模型已移除 | 在账号池中选择其他测试模型，再次测试该账号 |
| 账号被限制使用 | 联系 WorkBuddy 官方处理，解除后手动测试 |

## 5. 图片、视频与 CodeBuddy CLI

使用图片生成、视频生成或 CodeBuddy CLI 前，先在能力分区打开对应开关。这三个功能默认关闭。

| 功能 | 入口 | 费用与权限 |
| --- | --- | --- |
| 图片生成 | `workbuddy_draw_image` | 使用所授权区域的账号，每次生成扣除积分 |
| 视频生成 | `workbuddy_draw_video` | 提交生成任务后计费，完成后下载视频 |
| CodeBuddy CLI | `codebuddy_ask`、`/codebuddy` | 消耗 CodeBuddy 额度，按权限设置访问工作目录 |

开关启用后，会话模型可调用图片或视频生成工具，每次调用按 WorkBuddy 规则计费。模型选择与参数说明见[图片生成](docs/IMAGE_GEN.md)和[视频生成](docs/VIDEO_GEN.md)。

先安装 `@tencent-ai/codebuddy-code`，再启用 CodeBuddy CLI。将工作目录设为会话工作区中的目录，或通过 `allowedDirs` 允许访问其他目录。

默认权限模式为 `dontAsk`，CLI 使用只读工具。在指令中添加 `--edit`，可允许 CLI 在本次执行中修改工作区文件。

```text
/codebuddy
/codebuddy 审查当前模块的错误处理
/codebuddy --edit 修复已确认的空指针错误
```

`cliBridge.injectResult` 控制 `/codebuddy` 结果是否发送给会话模型，默认开启。会话空闲时，发送结果会增加一次模型请求及相应 token 消耗。

### 5.1 CLI 配置

在配置对象 `cliBridge` 中设置以下字段。

| 字段 | 默认值 | 作用 |
| --- | --- | --- |
| `enabled` | `false` | 启用工具和指令 |
| `binary` | 空 | CLI 程序入口的绝对路径，留空时自动查找已知安装位置 |
| `model` | 空 | 指定模型，留空时使用 CLI 设置 |
| `permissionMode` | `dontAsk` | 可选 dontAsk、plan、default、auto、acceptEdits、bypassPermissions；后两项允许写入 |
| `effort` | 空 | 推理强度：minimal、low、medium、high、xhigh、max |
| `maxTurns` | `10` | 执行轮数上限，最大 100 |
| `timeoutSecs` | `900` | 超时秒数，最大 1800 |
| `regionOrder` | `cn,global` | 登录凭据的区域尝试顺序 |
| `workingDir` | 空 | 默认工作目录 |
| `allowedDirs` | 空 | 允许访问的其他目录，以逗号分隔绝对路径 |
| `appendSystemPrompt` | 空 | 追加的系统提示 |
| `allowUnattended` | `false` | 允许通用问答在临时目录中执行 |
| `maxReplyChars` | `60000` | 返回文字长度上限，最大 400000 |
| `injectResult` | `true` | 将指令结果发送给会话模型 |
| `sessionContinuity` | `auto` | 自动续接 CLI 会话；off 表示每次新建会话 |
| `maxTurnsPerSessionHour` | `6` | 每个会话每小时调用上限，0 表示不限 |
| `maxTurnsPerHour` | `20` | 每个进程每小时调用上限，0 表示不限 |

## 6. 诊断与凭据

```sh
dsh plugin --profile desktop exec dsh-connect-workbuddy status
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
```

`status` 显示登录状态和积分，`doctor` 显示版本、凭据路径、设备信息及 DSH 状态。两个命令均支持 `--json`。

凭据库以明文保存 `accessToken` 和 `refreshToken`，导出的账号文件也包含登录凭据。请限制这些文件的访问权限。Windows 可通过 ACL 设置目录权限；macOS 和 Linux 可设置文件权限。需要加密存储时，可启用 BitLocker 或 FileVault。

插件通过 WorkBuddy 桌面端程序获取密钥，读取加密的登录文件。使用自定义安装目录或登录文件路径时，请设置以下环境变量。

| 环境变量 | 作用 |
| --- | --- |
| `WORKBUDDY_AUTH_FILE` | 指定登录文件 |
| `WORKBUDDY_APP_EXECUTABLE` | 指定 WorkBuddy 桌面端程序 |
| `WORKBUDDY_TURING_SDK_DIR` | 指定 Turing Shield SDK 目录，也可在设置页填写 |
| `WORKBUDDY_DEVICE_SDK_ENABLED` | 为独立诊断命令开启 SDK，值为 1 或 true |
| `WORKBUDDY_DEVICE_TOKEN_FILE` | 指定设备凭据文件 |
| `WORKBUDDY_HEADER_TRACE` | 值为 1 时显示请求头名称，供诊断使用 |
| `WORKBUDDY_TURING_CHANNEL_ID` | SDK 渠道号，默认 109144 |
| `WORKBUDDY_TURING_PRODUCT_NAME` | SDK 产品名，默认 WorkBuddy |
| `WORKBUDDY_TURING_PRODUCT_VERSION` | SDK 产品版本，默认插件版本 |
| `WORKBUDDY_TURING_KEYCHAIN_STORAGE` | 值为 1 时开启 SDK 的设备缓存存储 |
| `WORKBUDDY_USER_HOME` | HarmonyOS 用户目录，默认 /storage/Users/currentUser |

平台差异、Windows 文件占用及目录权限处理见[Windows 说明](docs/WINDOWS.md)。HarmonyOS 和 Linux 的凭据路径说明见[设计文档](docs/DESIGN.md)。

## 6.1 平台支持

| 平台 | 检查范围 |
| --- | --- |
| Windows | 开发和回归测试覆盖安装路径、文件占用、权限和子进程启动 |
| macOS | 支持桌面端账号与程序路径发现；设备 SDK 的 token 获取限制见模块说明 |
| Linux / HarmonyOS | 凭据路径按平台目录结构处理，具体安装需通过 doctor 检查 |

平台检查方法见 [Windows 说明](docs/WINDOWS.md)，设备模块限制见 [SDK 说明](native/turing-sdk/README.md)。

## 7. 开发

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm run typecheck
pnpm test
pnpm run verify:entries
```

构建命令将生成文件保存到 `lib/`。按上述顺序先构建再测试，测试便可检查包入口。修改源码后，重新构建，再重启加载该插件的 DSH 进程。

相关文档：

- [架构与模型能力](docs/DESIGN.md)
- [活动标记](docs/PROMO_BADGE.md)
- [积分日志](https://github.com/kiwaro/dsh-connect-workbuddy/blob/workbuddy-local-integration/docs/CREDIT-JOURNAL.md)
- [Windows 平台](docs/WINDOWS.md)
- [更新与版本等待期](docs/PINNED-UPGRADE-LAG.md)
- [第三方代码与许可证](THIRD_PARTY_NOTICES.md)

## 8. 常见问题

| 情况 | 处理方式 |
| --- | --- |
| 安装后模型列表为空 | 检查对应区域的登录状态和开关，刷新目录后勾选模型并保存 |
| 源码安装提示入口缺失 | 在仓库目录执行构建，再运行 verify:entries，随后重启 DSH |
| 新版本安装被等待期拒绝 | 查看更新说明，确认版本号和 pnpm 的 minimumReleaseAge 设置 |
| ERR_PNPM_IGNORED_BUILDS | 查看诊断日志中列出的包及构建脚本，再按该包的安装说明处理 |
| 账号设置保存失败 | 检查配置文件权限和文件占用，关闭占用程序后重试 |
| 找到登录文件但读取失败 | 检查 WorkBuddy 桌面端安装路径和加密凭据支持状态 |
| code 11128 | 网关拒绝了请求的渠道校验。反馈时附上插件版本、完整错误信息和 requestId |
| code 11133 | 检查模型参数；拒绝 off 档位时，调整模型的关闭思考选项 |
| code 14003 | 模型繁忙，稍后重试或切换模型 |
| code 11140 | 按服务端返回的信息区分内容策略拒绝与账号限制，必要时联系 WorkBuddy 官方 |

## 9. 致谢与许可证

上游作者：LaoDing，Copyright © 2026。代码采用 [MIT 许可证](LICENSE)。名称与商标归各自权利人所有。

本项目由独立开发者维护，与腾讯、WorkBuddy 和 DeepSeek 均无关联，未获上述主体授权或认可。账号限制、额度损失和服务中断等使用后果由使用者承担；项目作者不对使用或滥用造成的直接或间接损失负责。

主要参考项目及许可证：

| 项目 | 来源与用途 |
| --- | --- |
| [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect) | MIT；凭据读取、协议处理、模型接入与诊断设计 |
| [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api) | MIT；WorkBuddy 协议参考 |
| [hawklithm/workbuddy2api](https://github.com/hawklithm/workbuddy2api) | MIT；DSML 解析器的移植来源，具体修改见源码和第三方声明 |
| [HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue) | MIT；自动继续的次数与停止规则 |
| [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) | MIT；失败分类、消息排队与用户消息识别 |
| [dingminhua/dsh-connect-trae](https://github.com/dingminhua/dsh-connect-trae) | MIT；设置卡片、模型管理与插件结构 |
| [dingminhua/dsh-subagent-default-model](https://github.com/dingminhua/dsh-subagent-default-model) | MIT；界面样式和双语文字组织 |
| [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) | Apache-2.0；DSH 插件结构与模型注册参考 |

完整来源与许可证义务见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
