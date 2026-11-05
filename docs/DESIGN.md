# dsh-connect-workbuddy 设计说明

本文说明 5.18.0 集成分支的模块职责、数据流和 DSH 接口。使用步骤见[项目说明](../README.md)，源码入口为 [src/index.ts](../src/index.ts)。历史测量集中在第 9 节，各项数据保留原测量日期。

## 1. DSH 组件与插件注册

插件通过 DSH 的服务和界面扩展位置注册界面。每个组件只读取自身需要的 DSH 参数，使用自身的语言资源和配置。模型标签组件对 WorkBuddy 模型显示负载等信息，对其他供应商的模型显示目录名称。

### 1.1 模型标签

`conversation.input.model.label` 是 `single` 界面扩展位置，每次由一个注册组件渲染。插件使用 `MODEL_LABEL_PRIORITY = -0.5` 注册 `WorkBuddyModelLabel`。这个组件占用界面扩展位置时，其他模型标签组件的装饰可能被替换，例如官方模型的临时发布徽标。

界面扩展位置优先级用于确定渲染组件。组件返回 `null` 时，注册仍然存在。需要释放界面扩展位置时，调用注册句柄的注销函数。

插件维护以下注册规则：

1. 组件通过自身的注册参数获取依赖。
2. 每个组件只渲染自身负责的内容。
3. 界面扩展位置冲突通过 DSH 配置和注册优先级处理。
4. 合成多个插件的模型标签需要 DSH 提供相应的界面扩展位置契约。

相关实现见 [WorkBuddyModelLabel.tsx](../src/client/WorkBuddyModelLabel.tsx)。注册规则由 [model-label-slot-coexistence.spec.tsx](../tests/model-label-slot-coexistence.spec.tsx) 检查。issue #138 的历史现象及 DSH 变化见 [rc.3 适配记录](DSH-0.2.1-RC3-FOLLOWUP.md)。

### 1.2 使用的界面扩展位置

| 界面扩展位置 | 插件提供的内容 |
| --- | --- |
| `conversation.input.right` | 输入框工具栏的积分入口 |
| `conversation.input.model.label` | 模型名称及 WorkBuddy 负载标记 |
| `conversation.composer.dock` | 输入框下方的积分入口和 CLI 任务状态 |
| `shell.quota-notice` | 额度提示组件 |
| `sidebar.panellist` | WorkBuddy 侧边栏入口 |
| `main` | WorkBuddy 设置页面 |

`sidebarPanel` 默认关闭。用户开启后，插件注册侧边栏入口和主页面；关闭后，插件注销这两项注册。

新增界面扩展位置时，需要同时检查 DSH 参数契约和 [host-slot-surface.spec.ts](../tests/host-slot-surface.spec.ts)。DSH rc.5 将推理正文区分为 `rawText` 和 `text`：读取原始输出应使用 `rawText`，显示已处理文本应使用 `text`。相关记录见 [rc.5 适配说明](DSH-0.2.1-RC5-FOLLOWUP.md)。

## 2. 模块职责与数据流

| 模块 | 职责 |
| --- | --- |
| `src/index.ts` | 读取配置，注册区域供应商、HTTP 路由和工具，协调账号池 |
| `src/auth.ts` | 发现账号、读取凭据、刷新 token、提供指定账号的凭据 |
| `src/upstream.ts` | 构造 WorkBuddy 请求，解析目录、响应和错误 |
| `src/adapter.ts` | 将模型目录及流式接口适配到 DSH/pi-ai |
| `src/shim.ts` | 提供回环转发服务，处理请求校验、账号换用和重试 |
| `src/catalog.ts` | 根据模型目录和用户选择生成运行时模型列表 |
| `src/probe.ts` | 构造测试请求，解析可用状态及恢复时间 |
| `src/default-effort.ts` | 计算每个模型的默认推理强度 |
| `src/device-profile.ts`、`src/turing-sdk.ts` | 管理设备参数及桌面端 SDK 调用 |
| `src/local-credit-journal.ts` | 将响应扣分及账号标识追加到积分日志 |
| `src/status-paths.ts` | 定义 HTTP 路径、共享类型和配置读取规则 |
| `src/client/` | 设置页、模型标签、积分面板和任务状态 |
| `src/bin.ts`、`src/host-heartbeat.ts` | 命令行诊断及 DSH 运行状态检查 |

一次聊天请求经过以下步骤：

1. DSH 根据模型目录选择供应商和适配器。
2. 适配器将请求发送到插件的回环 shim。
3. shim 取得所用账号的凭据，整理消息和参数，再调用 WorkBuddy。
4. WorkBuddy 以流式方式返回结果，shim 将结果转发给 DSH。
5. 响应包含有效的 `usage.credit` 时，插件记录扣分和处理该请求的账号。

国内版和国际版分别注册为 `workbuddy`、`workbuddy-global`。两者各自保存账号选择、模型设置和账号池偏好。

## 3. 凭据、协议与请求处理

### 3.1 账号发现与凭据读取

凭据来源包括 WorkBuddy 桌面端登录文件、历史登录文件和插件保存的凭据。插件支持嵌套的 `auth` / `account` 文档，也处理已支持的扁平文档格式。`expiryToMs()` 将秒或毫秒时间统一为毫秒。

插件扫描凭据目录后按账号标识合并记录。桌面端文件用于读取登录信息，刷新后的凭据保存到插件自己的文件。选择凭据时，插件比较有效期；有效期接近到期时发起刷新，并合并同时发生的刷新调用。

手动选择账号时，配置保存 `accountId`。请求执行阶段再由凭据库取得该账号的 token。账号池开启后，运行时选号结果由账号池提供；关闭后，使用用户保存的选择。

WorkBuddy 的历史登录文件是桌面端生成的备份。插件通过扫描这些文件发现账号，相关解析见 [auth.ts](../src/auth.ts)。

### 3.2 加密文件与平台路径

新版 WorkBuddy 登录文件中的 token 字段可使用 AES-256-GCM 信封。插件通过已安装的桌面端程序取得解密所需信息，并在进程内缓存结果。

macOS 程序路径通过 `Info.plist` 的 `CFBundleExecutable` 确定。目录扫描覆盖国内版和国际版的应用包，并检查 `CFBundleIdentifier`。Windows 路径查找还使用默认安装目录和卸载注册表。Linux 和 HarmonyOS 路径按各自目录规则处理。

用户可通过 `WORKBUDDY_AUTH_FILE` 指定登录文件，通过 `WORKBUDDY_APP_EXECUTABLE` 指定桌面端程序。`doctor` 显示候选路径和读取结果，平台检查方法见 [WINDOWS.md](WINDOWS.md)。

诊断将以下情况分别报告：

| 情况 | 处理建议 |
| --- | --- |
| 文件缺失 | 检查登录状态或指定文件路径 |
| 文件无法读取 | 检查权限和文件占用 |
| 加密字段解密失败 | 检查桌面端程序及密钥读取能力 |
| 登录文件属于另一区域 | 切换到相应区域 |
| 保存的账号已不在登录列表 | 重新选择账号或登录该账号 |

### 3.3 聊天接口与回环服务

聊天接口为 `POST {base}/v2/chat/completions`，`base` 根据账号区域确定。请求使用流式模式，`tool_choice` 按 WorkBuddy 接口要求转换。刷新 token 使用独立的 `X-Refresh-Token` 请求头。

shim 使用随机回环端口和进程内生成的 bearer secret，并校验 Host、Origin、JSON content-type 及 bearer。secret 使用 `timingSafeEqual` 比较。适配器持有 shim 的凭据，WorkBuddy token 由 shim 在发送请求时读取。

适配器通过 `createProvider` 和 `openAICompletionsApi()` 接入 pi-ai。模型缺少推理档位时，`EffortNormalizingAdapter` 将其可用档位及请求参数归一为 `off`，由 DSH 按接口规则省略相应字段。

### 3.4 错误分类与 DSH 显示

插件先从响应信封中读取业务码，再结合解码后的错误信息分类。`statesBusinessCode` 与错误详情解析使用相同的业务码读取逻辑，以处理空白、字符串形式的业务码及已支持的嵌套结构。

| 类别 | 典型情况 | 处理方式 |
| --- | --- | --- |
| `hard_credit` | 积分耗尽，如 14018 | 账号池可尝试其他账号 |
| `soft_rate` | 账号限流，如 6004 | 读取恢复时间，账号池可尝试其他账号 |
| `model_busy` | 模型繁忙，如 14003 | 显示繁忙原因，等待或切换模型 |
| `session_dead` | 登录失效 | 更新凭据或换号 |
| `account_restricted` | 11140 中的账号限制 | 暂停自动选择该账号，解除限制后手动测试 |
| `policy_reject` | 11140 中的内容策略拒绝 | 根据服务端提示调整请求 |
| `channel_reject` | 11128 中的渠道校验拒绝 | 检查请求结构和消息内容，执行适用的修复重试 |
| `not_found` | 模型或接口缺失 | 刷新目录并选择有效模型 |
| `server` | 服务端或传输异常 | 按错误及重试策略处理 |
| `client` | 请求参数错误 | 修正请求参数 |

DSH 会根据错误码和消息文本确定最终显示及重试方式。`model_busy` 保留原类别，使 DSH 识别为可重试的限流；`soft_rate` 转换为 `quota_exceeded`，避免在长时间限流期间持续重试。相关检查见 [issue84-model-busy-not-quota.spec.ts](../tests/issue84-model-busy-not-quota.spec.ts)。

11140 的账号限制和内容拒绝由错误文本进一步区分。账号限制记录在账号池状态中，服务端解除限制后需要测试账号，以更新可用状态。重新登录得到相同账号标识时，先前的测试记录继续适用。

### 3.5 渠道校验处理

11128 可对应请求结构或消息内容的多种校验。插件分别检查首条 system 消息、角色转换、会话标识和已知的客户端提示。错误分类读取业务码及对应字段，诊断信息保留 `requestId`。

请求准备阶段先整理消息开头，再处理已知身份说明。已知内容的匹配与变换在 [upstream.ts](../src/upstream.ts) 中定义，测试通过相同请求及其变体检查处理结果。

请求被归类为 `channel_reject` 后，shim 可依次尝试以下处理：

1. 为适用的 system 和 assistant 文本增加中性开头。
2. 在适用的文本位置插入稀疏不可见分隔字符。
3. 使用密集分隔字符处理后重试。

每条变换规则重复执行后的结果应与执行一次相同。请求已经中止时，shim 保留原始失败原因并结束处理。密集字符处理使用一次扫描，算法及耗时比较见第 9.5 节。

`channelPerturbation` 控制预先使用哪种处理方式：

| 值 | 行为 |
| --- | --- |
| `failure` | 默认值；拒绝后尝试修复，成功后供本进程后续请求复用 |
| `always` | 每次请求预先使用密集处理 |
| `off` | 保留拒绝后的修复重试 |

诊断摘要从 DSH 原始请求读取，列出被检查消息的角色、开头、结尾及长度。摘要用于定位需要检查的内容，具体匹配规则仍由 WorkBuddy 网关决定。

`channelRejectContinue` 是独立选项，默认关闭。开启后，主会话遇到相应失败可自动发送所设文本，默认“继续”，连续发送上限默认为 1 次。一次成功响应或用户发送消息会重置计数。此操作会增加请求次数，设置修改后立即生效。

### 3.6 请求标识与设备参数

`wireProfile` 提供两种请求头配置：

| 配置 | 用途 |
| --- | --- |
| `balanced` | 默认值；为聊天、图片和积分接口设置统一的 WorkBuddy 客户端标识及适用请求头 |
| `conservative` | 兼容 5.16.0 的请求头形态，供对照排查 |

目录读取、模型负载查询及凭据刷新各有接口要求。修改请求头时，应核对对应接口的构造函数及测试。CodeBuddy CLI 的 HTTP 请求由 CLI 程序生成。

`usageIdentity` 默认关闭，控制聊天会话标识的格式。开启后使用 32 位十六进制 UUIDv7 标识，并添加对应的 `X-Request-ID`。聊天请求的 `User-Agent` 保持该通道所需格式。

设备设置分为以下两类：

| 模式 | 请求使用的设备信息 |
| --- | --- |
| `virtual` | 根据设备盐和账号 uid 生成 `X-Machine-ID`、`X-Session-ID`，支持账号级覆盖值 |
| `real` | 从 WorkBuddy 桌面端 SDK 取得 `X-Device-Token`，供账号共用 |

`real` 模式获取失败时，`sdkFallbackToVirtual` 决定后续行为。该选项默认开启，插件回退到虚拟设备模式，并在诊断中报告实际模式。关闭该选项时，获取失败的请求省略设备头。

设备盐保存在 `$DSH_HOME/.workbuddy-device.json`。SDK token 默认每 10 分钟更新，后台在到期前 15 秒刷新。获取失败后 60 秒重试，SDK 缺失时每 5 分钟重新检查。24 小时内的旧值可按过期状态使用，超过该时限报告不可用。SDK 缺失、调用失败和平台限制见 [SDK 说明](../native/turing-sdk/README.md)。

### 3.7 消息顺序与推理内容

`keepPromptLast` 默认关闭。开启后，插件把已识别的尾部运行上下文移到用户提问之前，并移除该提问开头的会话消息标记，使提问内容出现在用量页。其他历史消息保留原来的标记。

跨供应商切换时，DSH 可能将其他供应商的无签名思考内容转换为普通文本。插件在按当前模型检查消息来源后移除这类思考块。`dropForeignThinking` 控制同一路由内切换模型时是否扩大该处理范围，默认关闭。相关消息变换见 [adapter.ts](../src/adapter.ts) 中的 `alignAssistantIdentities` 和 `dropForeignThinking`。

服务端确认上下文超限后，插件还可通过 [context-rescue.ts](../src/context-rescue.ts) 组织分段摘要并重试，以处理摘要请求本身超限的情况。

## 4. 模型、账号与设置

### 4.1 模型目录与保存

插件分别保存模型目录和用户选择。目录刷新更新 `lastCatalog` 及积分倍率，用户选择的 `enabledModelIds`、`imageModelIds`、`contextBudgets` 和 `defaultThinkingEfforts` 通过保存按钮提交。

运行时目录由 `deriveCatalog()` 根据目录数据和已保存的选择生成。设置页显示刷新所得目录，使用未保存标记提示尚未提交的选择。刷新接口、状态接口和配置文件应提供一致的目录及倍率；相关检查见 [issue214-fallback-price.spec.ts](../tests/issue214-fallback-price.spec.ts)。

| 数据 | 用途 |
| --- | --- |
| `id`、`name` | 模型标识和显示名称 |
| `maxInputTokens`、`maxOutputTokens` | 上下文及最大输出 |
| `credits` | 解析积分倍率，无法解析时省略倍率 |
| `supportsImages` | 平台提供的图片输入声明 |
| `reasoning.supportedEfforts`、`reasoning.effort` | 模型支持的推理档位 |
| `reasoning.defaultEffort` | 上游提供的默认档位 |
| `descriptionZh`、`descriptionEn` | 模型描述 |
| `onlyReasoning`、`supportsToolCall` | 模型能力信息 |

### 4.2 图片输入判定

刷新模型目录时，插件根据 [native-modality.ts](../src/native-modality.ts) 中的核验表设置图片输入的默认勾选。用户可继续修改勾选，保存后写入 `imageModelIds`，运行时据此生成 `multimodal`。

| 字段 | 来源与用途 |
| --- | --- |
| `supportsImages` | WorkBuddy 平台声明；显式为 false 时禁止默认启用图片输入 |
| `native_modality` | 按精确模型 ID 查询核验表，确定原生输入模态 |
| `multimodal` | 根据用户保存的图片输入设置生成，供运行时使用 |

核验为 `multimodal` 的模型可默认勾选；`text` 和 `unknown` 保持未勾选。核验表按精确 ID 匹配，新增模型需要补充来源与核验日期。厂商文档和目录描述分别记录来源，历史核验表见第 9.2 节。

### 4.3 默认推理强度

`defaultEffortFor()` 按以下顺序选择模型默认档位：

1. 用户保存且该模型支持的档位。
2. 上游声明且该模型支持的默认档位。
3. 模型支持档位按固定顺序排列后的中间偏高档位，索引为 `Math.floor(length / 2)`。

模型未声明可用思考档位时，适配器按对应接口规则处理 `off`。是否提供关闭思考选项由 `offModelIds` 管理，默认思考档位设置表只保存思考档位。

上游的 `reasoning` 可提供 `supportedEfforts` 数组，也可提供单个 `effort`。解析器将已识别的单值转换为可用档位和默认值。卡片选择器显示该模型支持的档位，原始档位名称保持原样。

保存 `defaultThinkingEfforts` 时，客户端提交完整的模型与档位对应表。用户选择跟随默认时，删除该模型的自定义键。适配器发布 `defaultEffort` 后，DSH 用它处理缺少显式档位的请求，包括会话标题及摘要请求。

### 4.4 账号池、测试与签到

账号池成员和偏好按区域保存。开启账号池后，插件根据可用状态、临期积分、手动顺序、积分数量及凭据有效期等条件选号。比较器见 [account-pool.ts](../src/account-pool.ts)，使用步骤见[账号池说明](../README.md#4-账号池)。

测试请求由 Host 构造和发送。浏览器提交模型及测试设置，取得可用状态和错误原因。默认输入为 25000 token，输出上限为 1 token；账号池可选择其他输入长度。测试费用取决于模型及输入长度。

恢复时间按以下来源依次读取：失败响应的 `Retry-After`、响应正文中的重置时间，以及仅适用于积分耗尽的套餐刷新时间。模型繁忙还使用专门的等待策略。成功响应按成功处理，卡片显示已有来源支持的恢复信息。账号池内部的重试等待由其状态规则管理。

国内版个人账号支持每日签到。手动按钮处理已保存的账号池成员。自动签到默认关闭，开启后，插件记录当天的完成情况，并对尚未完成签到的适用账号执行领取。

### 4.5 积分读数与响应日志

积分面板显示账号余额及积分包信息。周期套餐显示下一次刷新时间，一次性积分包显示到期信息；同名积分包可聚合显示。

聊天响应的扣分日志独立保存到 `DSH_HOME/storages/dsh-connect-workbuddy/response-credits.jsonl`。日志字段分别表示响应标识及其扣分，并注明处理请求的账号和写入时间。读取程序按响应标识关联会话，并在汇总前去重。账号池换号和重试的处理见[积分日志说明](CREDIT-JOURNAL.md)。

### 4.6 区域开关与错误提示

区域是否提供模型同时取决于用户启用状态和账号可用状态。模型适配器与目录通过注册句柄更新，更新时提交完整条目集。

设置页按情况分别显示登录提示、账号选择提示和文件诊断。段落说明处理建议，路径列表列出检查结果。路径缺失条目可折叠显示；有效但属于其他区域的文件用于说明应切换区域。

提示文案位于 `src/client/locales.ts`，诊断展示规则位于 `src/client/searched-paths.ts`。每次修改同类提示时，需要同时检查模型设置、账号池、积分面板及命令输出中的对应说明。

### 4.7 可选工具

图片生成、视频生成及 CodeBuddy CLI 默认关闭，由用户在能力分区开启。图片与视频工具使用相应区域的账号，生成费用由 WorkBuddy 扣除。CodeBuddy CLI 使用其账号额度和所设文件权限。

工具参数、执行限制和输出见[图片工具说明](IMAGE_GEN.md)、[视频工具说明](VIDEO_GEN.md)及[CLI 配置](../README.md#51-cli-配置)。会话标题请求可通过默认关闭的 `sessionTitle` 选项改用指定轻量模型。

## 5. 目录与接口

```text
dsh-connect-workbuddy/
  src/                 Host、请求处理、账号、工具及客户端代码
  locale/              供 DSH 读取的插件标题和简介
  lib/                 构建文件
  tests/               行为及文档契约测试
  scripts/             诊断与验证脚本
  native/turing-sdk/   SDK 子进程脚本
  docs/                使用、设计与研究记录
  package.json         包入口、依赖和发布文件
  cordis.patch.yml     DSH bundle 插入配置
```

HTTP 路径统一在 [status-paths.ts](../src/status-paths.ts) 定义，包括积分查询、模型刷新、账号刷新、签到、测试、账号池、登录、设备设置、媒体目录和账号导入导出。新增接口时，需要同步类型、DSH 路由及客户端调用。

## 6. 来源与许可证

### 6.1 参考来源

| 来源 | 参考内容 |
| --- | --- |
| `corrinehu/dsh-workbuddy-connect` | 凭据发现、协议处理、回环服务、适配器和诊断 |
| `dingminhua/dsh-connect-trae` | 设置卡片、模型选择、配置保存及发布结构 |
| `dingminhua/dsh-subagent-default-model` | 界面样式、图标和双语文案组织 |
| `Sliverkiss/workbuddy2api` | WorkBuddy 协议参考 |
| `hawklithm/workbuddy2api` | DSML 解析器移植来源 |
| `HsiangNianian/dsh-auto-continue` | 连续失败次数和停止条件 |
| `YuJunZhiXue/dsh-purge` | 失败分类、消息排队及用户消息识别 |
| `franksong2702/dsh-codex-connect` | 经连接项目引用的插件结构与供应商注册设计 |

完整来源、版权及许可证说明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。源文件头应注明参考项目、所参考的设计或代码及修改内容。

### 6.2 分发要求

MIT 来源保留版权与许可声明。Apache-2.0 来源按适用要求保留许可、改动说明及 NOTICE 等信息。`THIRD_PARTY_NOTICES.md` 列入发布文件，中英文项目说明均提供引用。项目 LICENSE 保留 `Copyright (c) 2026 LaoDing`。

## 7. 凭据保护与使用风险

插件的浏览器接口提供显示名称、账号标识、凭据有效期和积分等业务数据。登录 token 由 DSH 端读取和使用。账号显示名称优先采用昵称等显示字段，缺少名称时使用未命名占位。

凭据库及导出的账号文件包含敏感登录信息。保存和迁移时需要控制访问权限，文件权限及 Windows ACL 处理见 [WINDOWS.md](WINDOWS.md)。诊断脚本应对身份信息脱敏，并仅输出排查需要的凭据长度或格式。

插件依赖 WorkBuddy 桌面端接口和文件格式。这些接口及加密格式随产品更新可能变化，第三方接入也可能导致账号限制。使用范围及责任说明见[项目说明](../README.md#9-致谢与许可证)。

## 8. 插件元数据与中文文案

DSH 插件管理器从包的 `locale/en.json` 定位语言资源目录，再读取其他语言文件中的 `meta.title` 和 `meta.description`。包需要同时满足以下条件：

1. `locale/en.json` 存在，用于定位资源目录。
2. `package.json` 导出 `./locale/*.json`。
3. 发布文件包含 `locale` 目录。

插件标题使用 `meta.title`，缺少时回退到包名。简介使用语言资源中的内容，缺少时回退到 `package.json.description`。该包的 `description` 为中文，英文资源提供英文简介。

| 文案位置 | 读取方 |
| --- | --- |
| `locale/en.json`、`locale/zh.json` | DSH 插件管理器 |
| `package.json.description` | 包管理器及 DSH 简介回退 |
| `src/client/locales.ts` | 插件设置页和组件 |
| 市场条目 YAML | 社区市场注册表 |

同一功能的描述需要一致。修改标题和简介时，检查语言资源、包描述及市场条目；修改操作说明时，检查设置页、项目说明和专题文档。相关测试见 [locale-meta.spec.ts](../tests/locale-meta.spec.ts)。

## 9. 历史测量与回归依据

本节保留原文档中的测量日期和数据，用于说明设计依据。模型目录、费率及平台状态可能随版本变化，使用时应结合所用账号和插件版本检查。

### 9.1 平台图片声明：2026-09-29

| 网关 | CLI 模型 | `supportsImages=true` | `=false` | 缺失 |
|---|---|---|---|---|
| CN `copilot.tencent.com` | 16 | 15 | 1（仅 `glm-5.1`） | 0 |
| 国际 `www.workbuddy.ai` | 23 | 23（全部） | 0 | 0 |

这组数据表明，当时目录中的 `supportsImages` 普遍为 true。图片默认勾选因此同时参考原生模态核验表。

### 9.2 原生模态核验记录

厂商文档记录核验于 2026-09-25；另外两项目录描述核验于 2026-10-30。原表来源如下：

| id | kind | 档位 | 来源 |
|---|---|---|---|
| `glm-5.3` / `glm-5.2` / `glm-5.1` | `text` | A | <https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3.md> 等（「仅支持文本」） |
| `glm-5.3-flash` | `multimodal` | A | <https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md>（原生多模态，图片/视频/文本） |
| `glm-5v-turbo` | `multimodal` | A | <https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5v-turbo.md> |
| `deepseek-v4-pro` | `text` | A | <https://api-docs.deepseek.com/quick_start/pricing>（V4-Pro 的 Vision：Not supported） |
| `deepseek-v4.1-flash` | `multimodal` | A | 同一来源；该型号记录为支持 Vision |
| `minimax-m3` | `multimodal` | A | <https://platform.minimax.io/docs/guides/text-generation.md> |
| `kimi-k2.6` / `kimi-k2.7` | `multimodal` | A | <https://platform.moonshot.cn/docs/overview> |
| `kimi-k3-1` | `multimodal` | A | <https://github.com/MoonshotAI/Kimi-K3> |
| `hy3` / `hy4-preview` | `text` | A | <https://huggingface.co/tencent/Hy3>、`.../Hy4-preview`（模型卡 `pipeline_tag: text-generation`） |
| `space-bunny` | `multimodal` | B | 目录 `descriptionZh`：「推理速度极快，编码能力强劲，并支持原生多模态输入的匿名大模型」 |
| `minimax-m3.1-flash` | `multimodal` | B | 目录 `descriptionZh`：「原生多模态，擅长 office、agentic、编程任务…」 |

厂商文档来源由 `workbuddy-manager/server/services/native_modalities.json` 整理；目录描述来源为 WorkBuddy 5.8.3 的国内版缓存 `acc-product-config-v3.json`，文档日期为 2026-10-14。新增记录应核对具体型号及来源。

2026-10-30 的国内版 CLI 目录共有 21 项，其中 7 项默认勾选图片输入：厂商来源 5 项，目录描述来源 2 项。

纯文本模型包括 `glm-5.3`、`glm-5.2`、`glm-5.1`、`hy3`、`hy4-preview` 和 `deepseek-v4-pro`。

另有 8 项缺少来源，按 unknown 处理：`hy3-x`、`step-5-preview`、`kimi-k3.1-pro`、`kimi-k2.8-preview`、`mimo-v2.6-pro`、`fast-model`、`balanced-model`、`deep-model`。

国际版保留的是 2026-09-29 的记录：23 项中有 3 项具备厂商来源。相关日期应与该次目录记录一同使用。

### 9.3 早期短请求测试：2026-09-29

| 网关 | 抽样 | 结果 | 单次耗时 | `credit` |
|---|---|---|---|---|
| CN `copilot.tencent.com` | `auto` / `hy4-preview` / `hy3` / `glm-5.3` / `minimax-m3` | 全部 200 | 0.8～3.4s | 0～0.01 |
| 国际 `www.workbuddy.ai` | `fast-model` / `balanced-model` / `primary-model` | 全部 200 | 1.0～2.1s | 0 |

该次测试前后记录的余额均为 933。这是早期短请求的测量数据；第 4.4 节说明现有测试输入和计费条件。

### 9.4 推理档位目录：2026-10-30

| 档位集合 | 模型 |
|---|---|
| `low / high / max` | `deepseek-v4.1-flash`、`glm-5.3`、`glm-5.3-flash`、`kimi-k3.1-pro`、`kimi-k2.8-preview` |
| `high / xhigh` | `glm-5.2`、`deepseek-v4-pro` |
| `low / medium / high` | `step-5-preview` |
| `low / medium / high / xhigh / max` | `space-bunny`、`minimax-m3.1-flash`、`mimo-v2.6-pro` |
| `low / high / xhigh` | `kimi-k3-1` |
| 单档 `high` | `hy4-preview` |
| `low / high` | `hy3`、`hy3-x` |

该表记录当日国内版目录的档位声明。模型默认值的计算以第 4.3 节和 `default-effort.ts` 为准。

### 9.5 渠道处理的测量与回归

2026-10-21 的消息位置对照中，已知提示放在 system 或 assistant 消息开头时返回 400；放在消息中间、user 开头及 tool 结果开头时返回 200。后续二分实验还定位过一段 221 字符的 system 文本。请求准备和重试规则随这些测量补充，详见 [渠道匹配研究](CHANNEL-FINGERPRINT-RESEARCH.md)。

身份说明处理的历史测量使用 10818 字符提示，密集处理增加 7742 个 U+200B 字符，字节增量约 70.7%；定向处理增加约 28 个字符，字节增量约 0.26%。各规则再次执行后应保留原结果，并通过对应测试。

2026-10-28 对密集处理算法的比较记录如下：

| 输入字符数 | 原实现耗时 |
| --- | --- |
| 11575 | 1.3 秒 |
| 23075 | 5.2 秒 |
| 46075 | 22.8 秒 |
| 92075 | 82.7 秒 |
| 184075 | 322.8 秒 |

一次扫描实现处理约 92 KB 数据的记录约为 10 毫秒。验证包括 22 个固定用例、1500 组固定种子的随机比较，以及 60 KB 到 120 KB 输入的增长比检查。测试见 [issue159-dense-rescue-cost.spec.ts](../tests/issue159-dense-rescue-cost.spec.ts)。

客户端断开连接的对照记录：保留中止检查时，额外调用为 0 次，保留 `channel_reject`，账号测量保持原结果；删除该检查时，额外调用为 2 次，最终结果变为 `server`，并产生错误测量。回归见 [issue159-abort-gate.spec.ts](../tests/issue159-abort-gate.spec.ts)。

### 9.6 账号文件发现记录

早期目录扫描记录中，6 个登录文件合并为 2 个账号。两个账号均返回 28 个模型及 16 个 CLI 模型，积分余额分别为 1875 和 0。探测脚本为 [probe-account-switch.mjs](../scripts/probe-account-switch.mjs)，输出需要保持脱敏。
