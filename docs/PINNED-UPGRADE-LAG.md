# 插件更新与版本等待期

插件市场使用缓存或定期生成的索引，显示的版本可能落后于 npm。更新上游发布版时，先查询 npm 版本，再安装完整版本号。源码安装的插件应在源码目录中更新和构建。

## 1. 查询发布版本

```sh
npm view dsh-connect-workbuddy version
```

该命令返回上游 npm 包的 `latest` 版本。发布说明见 [Releases](https://github.com/dingminhua/dsh-connect-workbuddy/releases)，上游维护记录见 [#192](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192)。

本 fork 曾在主分支中合并上游 5.18.1，后续合入范围以主分支维护记录为准。安装方式见[项目说明](../README.md#2-安装)。

### 历史对照记录

以下是 2026-11-02 03:11 +08:00 的测量记录，供排查发布过程使用：

| 项目 | 当时的状态 |
| --- | --- |
| npm latest | 5.17.0 |
| 5.17.0 发布时间 | 2026-11-01 04:44 UTC，北京时间 12:44 |
| 前一版本 | 5.16.0，发布于 2026-10-31 09:55 UTC |
| 更早版本 | 5.15.2，发布于 2026-10-30 11:44 UTC |
| 5.18.0 | tag `06006e4` 已推送，当时 npm 和 Release 尚未发布 |
| 市场索引 | 该次检查未取得需鉴权的页面数据 |

## 2. 三种版本延迟

| 环节 | 数据来源 | 可能出现的情况 |
| --- | --- | --- |
| 社区市场索引 | 定期构建的包索引 | npm 已发布，市场列表仍显示旧版本 |
| DSH 更新检查 | npm dist-tag，带缓存及版本等待期判断 | 显示“新版等待中”，暂时无法点击更新 |
| pnpm 安装解析 | profile 中的 `minimumReleaseAge` 配置 | 浮动版本范围解析到旧版本，或精确版本号被等待期拒绝 |

等待期以发布时间计算。配置 `minimumReleaseAge: 1440` 表示等待 1440 分钟。判断等待期错误时，应核对所装版本的发布时间和 profile 配置。

2026-10-30 的一份市场索引显示插件为 5.13.1，而当时 npm 为 5.14.1。这个记录说明各包的索引可能延迟，查询其他插件的版本无法确认本插件是否已经收录。

## 3. 手动更新

用户应先执行第 1 节的查询，再将返回的版本号填入下列命令。使用网页或终端界面时，将 `desktop` 改为对应的 `web` 或 `dsh-tui` profile。

```sh
dsh plugin --profile desktop add dsh-connect-workbuddy@<版本号>
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
```

安装完成后，核对 `doctor` 显示的版本，再重启 DSH。

### 版本等待期错误

`ERR_PNPM_NO_MATURE_MATCHING_VERSION` 表示所选版本未满足 pnpm 的版本等待期。可以等待规定时长后安装；也可根据管理要求，在 profile 的 `pnpm-workspace.yaml` 中为此包设置例外：

```yaml
minimumReleaseAgeExclude:
  - dsh-connect-workbuddy
```

添加例外会改变该 profile 对此包的安装限制。修改后，再使用完整版本号安装。

### 源码安装

源码安装使用源码目录中的构建文件。在该目录执行：

```sh
git pull --ff-only
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
```

使用软链安装时，用户构建完成后可重新加载插件或重启 DSH。使用实体副本安装时，用户还须先将发布文件同步到安装副本。使用 npm 包名重新添加插件会将安装来源改为 npm，因此用户操作前应确认所需来源。

## 4. 助手更新步骤

可以向助手提供以下任务说明：

```text
更新 dsh-connect-workbuddy，使用 desktop profile。
先检查插件的安装来源。
源码安装：在对应仓库更新源码、安装依赖并构建。
npm 安装：查询 npm 版本，使用完整版本号安装。
遇到版本等待期时，报告版本的发布时间和剩余等待时间；修改 profile 配置前先说明影响并确认。
安装完成后运行 doctor，核对插件版本，再重启 DSH 并检查启动结果。
```

## 5. 检查已安装版本

```sh
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
dsh plugin --profile desktop exec dsh-connect-workbuddy status --json
```

`doctor` 首行显示插件版本，`status --json` 的顶层 `version` 字段提供相同信息。设置页的诊断分区主要显示账号、模型和错误信息，版本检查使用上述命令。

DSH 在启动或重新加载插件时读取 host 代码。完成重启或重载后，再检查改动是否生效。

## 6. 更新后问题仍然存在

1. 核对已安装版本。安装命令完成后，用第 5 节的命令确认结果。
2. 核对加载状态。确认 DSH 已重启或插件已重载。
3. 整理问题信息。提供插件版本、profile、安装来源和完整错误信息，包含 `code` 与 `requestId`。

## 7. 相关问题

- [#192：版本与发布记录](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192)
- [#162：渠道校验 11128](https://github.com/dingminhua/dsh-connect-workbuddy/issues/162)
- [#125：错误分类与报告信息](https://github.com/dingminhua/dsh-connect-workbuddy/issues/125)
- [#156：其他模型接入插件](https://github.com/dingminhua/dsh-connect-workbuddy/issues/156)

## 历史技术原文与证据

来源：本仓库语言改写前提交 `0d6cf6b^` 的同名文档。以下引用恢复被压缩的接口名称、请求条件、实验表、命令和设计取舍；涉及身份的数据已替换为占位符。原记录中的第一人称和口语作为历史引文保留，不作为维护文档的新写法。

其中 link: 和历史版本号描述当时安装方式；当前本地部署使用 main 的实体副本。

<details>
<summary>展开历史技术记录</summary>

> > 长期置顶，**只讲一件事**：怎么把本插件升到**当前真实最新版**。
> >
> > 一句话：**别拿插件市场里那个「最新」当答案**——它读的是一份会落后的索引；以 npm 的 `latest` 和仓库 Release 为准。
> > 手动跑一条命令，或者把下面那段话直接丢给 DSH 里的 AI，让它替你跑。
>
> ## 0. 现在的最新版本
>
> > **版本状态与发布节奏请看 [#192](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192)**（那边随发布更新）。本节只留判断口径与一张最小对照表，**发新包时优先改 #192**。
>
> | 事实 | 值 | 采集时间 |
> |---|---|---|
> | npm `latest` | **5.17.0** | 2026-11-02 03:11 +08:00 |
> | 5.17.0 发布时间 | 2026-11-01 04:44 UTC（北京时间 11-01 12:44） | 同上 |
> | 此前一版 | 5.16.0，2026-10-31 09:55 UTC | 同上 |
> | 再此前 | 5.15.2，2026-10-30 11:44 UTC | 同上 |
> | GitHub Releases | [v5.17.0](https://github.com/dingminhua/dsh-connect-workbuddy/releases/tag/v5.17.0)（Latest） | 同上 |
> | **5.18.0** | **tag 已推送（`06006e4`），npm 上还没有，Release 也没建** | 同上 |
> | **市场索引里的本插件** | **本次未核对**（原因见下） | 同上 |
>
> > **为什么「市场索引里是几」这一行这次不用一个数字回答**：社区市场的索引源是**每份 profile 各自配置**的（`dsh-plugin-market` 的 `sources` 是设置项，不是硬编码常量），
> > 本机 profile 没有覆盖它，页面接口又要鉴权。**判断该不该升级，永远用 `npm view` 和 Release，不要看市场里的版本号。**
>
> **最低版本要求（按你撞的问题挑，不是随便挑）**：
>
> | 你遇到的 | 至少要升到 |
> |---|---|
> | 国内区 400 + `code 11128`（「渠道校验」） | **5.14.0**（5.13.1 改了词但漏了 Web GUI 段第二句，#167） |
> | 名册里的新模型发不了图（`MODEL_DOES_NOT_SUPPORT_IMAGES`） | **5.14.1**（核验表补 `space-bunny` / `minimax-m3.1-flash`，#175 的表部分） |
> | 每次开新对话都要重挑思考强度（如 `deepseek-v4.1-flash` 想固定用 `low`） | **5.15.0**（`defaultThinkingEfforts`，#179） |
> | 切换账号后输入框的档位标签从 `low` 跳回 `high` | **5.15.0**（档位默认值不再写死成常量，#179②） |
> | 积分读数挨着权限切换器、容易误触 | **5.15.1**（改挂 `conversation.input.right`） |
> | 暗色主题下「虚拟值 / 真实值」选中项是一格空白 | **5.17.0** |
> | 弹窗里「真实设备 Token」几乎看不见 / 派生值不显示 | **5.17.0** |
> | 状态读取失败永久卡在卡片上 | 5.14.0（#170） |
> | `doctor` 把活着的宿主报成 `stale` | 5.14.0（#174①） |
> | 鸿蒙上账号池恒为 0；生视频三个故障；想要侧边栏面板 | **5.18.0——npm 上还没有**，见 [#192](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192) 的源码自编译 |
> | 没什么具体问题 | **直接上 5.17.0**，省得逐条对 |
>
> ## 1. 为什么市场里的版本会滞后
>
> 三个**互相独立**的环节，任何一个都能让你「点了更新却没升上去」：
>
> | # | 环节 | 它读到的是什么 | 后果 |
> |---|---|---|---|
> | ① | **社区市场索引**（CDN 上的 `catalog.json` / `index.json`） | 一份**定期构建的快照**，按包各自收录 | 快照里没有的版本，市场根本不会展示。2026-10-30 15:00 那次观测里本插件停在 5.13.1，而当时 npm 已是 5.14.1 |
> | ② | **DSH 市场自己的「检查更新」** | npm 的 `latest` dist-tag，30 分钟缓存；桌面宿主还会把 24 小时内发布的版本标成「新版等待中」 | 版本对，但**按钮是灰的/标签是等待中**，看起来像「没有新版」 |
> | ③ | **pnpm 的新版本等待期**（`minimumReleaseAge`） | profile 的 pnpm 配置 | 浮动范围被**静默压回旧版**；写死精确版本号则直接报错拒绝 |
>
> > **③这条仍然成立，只是现在没有正在窗口内的新版本**：`5.17.0` 发布于 2026-11-01 04:44 UTC，
> > 它的 24 小时窗口在 2026-11-02 04:44 UTC（北京时间 11-02 12:44）结束。
> > 实测过两种形态（隔离目录、pnpm 10.34.5、`--lockfile-only`，未触碰任何人的环境）：
> >
> > | 写法 | 设了 `minimumReleaseAge=1440` 的结果 |
> > |---|---|
> > | 浮动 `^5.16.0` | 解析到旧版本，不报错 ⚠️（「升级成功了，版本没变」） |
> > | 精确 `5.17.0` | `ERR_PNPM_NO_MATURE_MATCHING_VERSION`（明确拒绝，反而好判断） |
> > | 不设该配置（pnpm 默认） | 浮动范围直接解析到最新版 ✅ |
> >
> > 也就是说：**窗口一旦被配置，浮动范围会骗你，精确版本号不会**——它会如实报错，而不是假装成功。
> > 本机 `desktop` profile 的 `pnpm-workspace.yaml` **没有**设这条（2026-11-02 03:11 复核：只有 `packages` / `nodeLinker: hoisted` / `autoInstallPeers: false`），
> > 所以在本机上不会撞到；这一条对**自行加过该配置**的人仍然成立。
>
> > **①这一条要按「按包各自发生」来理解**：滞后不是全局开关。同一天里有的包索引里是新的、有的还是旧的，
> > 所以**「别人那个包显示了新版」不能证明「你这个包也该显示」**——快照收录到哪一天就是哪一天。
>
> ## 2. 手动更新（推荐先试这个）
>
> 把 `desktop` 换成你用的 profile（`web` / `dsh-tui`）：
>
> ```sh
> # 1) 装精确版本号（不要用 ^ 或 latest，理由见 §1）
> dsh plugin --profile desktop add dsh-connect-workbuddy@5.17.0
>
> # 2) 确认真的装上去了（见 §4，别凭感觉）
> dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
> ```
>
> **如果命令报 `ERR_PNPM_NO_MATURE_MATCHING_VERSION`**：那是 pnpm 的等待期在拦，不是包装坏了。两条路，选一条：
>
> ```sh
> # A) 等窗口过去（默认 24 小时，从该版本发布时刻算）
> #    5.17.0 发布于 2026-11-01 04:44 UTC → 窗口约在 2026-11-02 04:44 UTC（北京时间 11-02 12:44）结束
>
> # B) 现在就装：告诉 pnpm 这个包不必等（写进 profile 的 pnpm-workspace.yaml）
> minimumReleaseAgeExclude:
>   - dsh-connect-workbuddy
> ```
>
> **如果市场里显示「新版等待中」**：同上，②的 24 小时判断，等窗口过去，或直接用 §2 的命令装。
>
> **如果你是 `link:` 本地目录装的（本仓库开发者）**：`add` 会把 `link:` 改写成 registry 规格，别那么干。更新 = `git pull` + `pnpm run build`。
>
> ## 3. 让 AI 更新（懒人路线，效果一样）
>
> 在 DSH 里新开一句话，把下面这段**整段**发给 AI：
>
> ```text
> 把 dsh-connect-workbuddy 更新到 npm 上的最新版，按下面的步骤来，不要跳步：
> 1) 先跑 `npm view dsh-connect-workbuddy version` 确认当前 latest 是多少；
> 2) 用精确版本号安装：`dsh plugin --profile desktop add dsh-connect-workbuddy@<上一步得到的版本>`；
> 3) 如果报 ERR_PNPM_NO_MATURE_MATCHING_VERSION，不要改用浮动范围硬装（那会静默装回旧版），
>    告诉我这个版本还要等多久，或者问我是否要在 profile 的 pnpm-workspace.yaml 里加
>    minimumReleaseAgeExclude: dsh-connect-workbuddy；
> 4) 装完跑 `dsh plugin --profile desktop exec dsh-connect-workbuddy doctor`，
>    把第一行的版本号念给我听；
> 5) 提醒我重启/重载 DSH（bundle 的 host 半边在启动时加载）。
> 我的 profile 是 desktop。
> ```
>
> > AI 能做的和不能做的：**能**跑命令、读版本、核对结果；**不能**替你决定要不要改 pnpm 配置，所以第 3 步它会回来问你。
> > 也别让 AI「反复重试到成功」——等待期内重试只会得到同一个拒绝，`pnpm` 没有任何一次性的绕过开关。
>
> ## 4. 怎么确认真的升上去了（这一节纠正两条旧口径）
>
> ```sh
> # 第一行就是版本：WorkBuddy Connect 5.17.0 on vX.Y.Z
> dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
>
> # 或者看 JSON 顶层的 version 字段
> dsh plugin --profile desktop exec dsh-connect-workbuddy status --json
> ```
>
> > ⚠️ **两条以前置顶帖里写过的自查方式并不存在，以此处为准**：
> >
> > | 旧写法 | 实际 |
> > |---|---|
> > | `/workbuddy status` | 插件注册的斜杠命令是 **`/codebuddy`**（转发本机 CodeBuddy CLI），不是 `/workbuddy`。状态请用上面的 `exec ... doctor` / `status` |
> > | 「卡片『诊断』栏看 `pluginVersion`」 | 卡片诊断栏只有区域 / 域名 / 服务账号 / 登录有效期 / 目录模型数 / 已启用数 / 账号池 / 最近一次失败**八行**，**没有版本号这一行**。版本只在 CLI 输出里 |
>
> **装完要不要重启？** 要。bundle 的 host 半边在 DSH 启动时加载。一条实测的例外（#164）：同一个宿主进程内 `remove_bundle` → `install_bundle` 之后 `pluginVersion` 就已经变成新版，不必重启——但那是「重载过了」，不是「不用重载」。**重启或重载完再判断有没有修好。**
>
> ## 5. 更新后还是老样子？先排除这三种
>
> 1. **版本根本没变** → 回 §4 核对。浮动范围被压回旧版是最常见的一种，症状恰好是「升级命令跑完了、问题照旧」。
> 2. **装上了但没重载** → 请求组装路径上的改动（比如 11128 的按句改词）在挂载时采样，不重载就还是旧行为。
> 3. **真的是新问题** → 报的时候**一定带版本号**（§4 第一条命令的第一行）、profile、安装方式（市场 / 命令 / `link:` 本地目录），以及完整报错原文（含 `code` 与 `requestId`）。缺版本号的报告无法判断是不是已经修过的问题。
>
> ## 6. 相关置顶
>
> - [#192](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192) — **当前版本状态与发布节奏**（npm 上是几、包发出去没有、急用怎么自己编译）；本篇只讲「怎么升上来」
> - [#162](https://github.com/dingminhua/dsh-connect-workbuddy/issues/162) — 渠道校验 400（`11128`）的处置与改词表；本楼只负责「怎么升上来」
> - [#125](https://github.com/dingminhua/dsh-connect-workbuddy/issues/125) — 400 / 上游失败分类总表与报告模板
> - [#156](https://github.com/dingminhua/dsh-connect-workbuddy/issues/156) — WorkBuddy 用不了时的姊妹插件（Trae / Qoder）
>
> ---
>
> **一句话收尾**：市场里显示几就是几，那是快照；`npm view dsh-connect-workbuddy version` 与 [Releases](https://github.com/dingminhua/dsh-connect-workbuddy/releases) 才是准的。升的时候**写精确版本号**，升完**用 `doctor` 第一行核对**，然后**重启或重载**。不想记这些，就把 §3 那段话丢给 AI。

</details>
