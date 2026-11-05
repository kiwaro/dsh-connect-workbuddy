# 插件更新与版本等待期

插件市场使用缓存或定期生成的索引，显示的版本可能落后于 npm。更新上游发布版时，先查询 npm 版本，再安装完整版本号。源码安装的插件应在源码目录中更新和构建。

## 1. 查询发布版本

```sh
npm view dsh-connect-workbuddy version
```

该命令返回上游 npm 包的 `latest` 版本。发布说明见 [Releases](https://github.com/dingminhua/dsh-connect-workbuddy/releases)，上游维护记录见 [#192](https://github.com/dingminhua/dsh-connect-workbuddy/issues/192)。

本 fork 的集成分支基于 5.18.0，安装方式见[项目说明](../README.md#2-安装)。

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

先执行第 1 节的查询，再将返回的版本号填入下列命令。使用网页或终端界面时，将 `desktop` 改为对应的 `web` 或 `dsh-tui` profile。

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

构建完成后重启 DSH。使用 npm 包名重新添加插件会将安装来源改为 npm，操作前应确认需要使用的来源。

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
