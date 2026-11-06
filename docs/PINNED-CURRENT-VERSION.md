# 5.18.1 发布状态记录

上游于北京时间 2026 年 11 月 5 日 02:53 发布 5.18.1，对应发布页为 [v5.18.1](https://github.com/dingminhua/dsh-connect-workbuddy/releases/tag/v5.18.1)。5.18.0 的内容并入该版本。本 fork 的 main 分支合并了上游 5.18.1，并保留积分记录和中文说明修改。

安装上游包前可运行 npm view dsh-connect-workbuddy version 查询；安装本仓库源码见 [安装说明](../README.md#2-安装)。

## 1. 历史记录范围


本文整理2026年11月初的上游发布通知。表中的版本状态对应当时的记录，安装前请用 npm 查询及仓库发布页核对目标版本。现有安装方法见 [README](../README.md#2-安装)。

## 2. 当时的发布渠道

| 渠道 | 版本 | 状态 |
| --- | --- | --- |
| npm `dsh-connect-workbuddy` | 5.17.0 | 最新可安装版本，`dsh plugin add` / 市场拿到的都是它。发布于 2026-11-01 04:44 UTC |
| git tag `v5.18.0` | 5.18.0 | 已推送，指向提交 `06006e4` |
| GitHub Releases | v5.17.0（Latest） | 没有 v5.18.0 的 Release，tag 有、Release 没有 |
| npm 5.18.0 | — | 未发布，等 2026-11-05 |

该记录中tag已存在，npm发布等待维护者完成交互授权。通知预计于北京时间2026-11-05继续处理，属于当时的安排。

## 3. 版本内容

5.18.0 增加了默认关闭的侧边栏入口、HarmonyOS 账号路径和默认关闭的设备 SDK 总开关，同时调整了视频输入图处理及内部超时。

`v5.18.0` 指向 `06006e4`。后续用于检查issue #199和#198的 `v5.18.1-unreleased` 指向 `7822da9`，涉及凭据目录权限及窄屏上下文预算。

## 4. 源码安装

选择需要核对的tag，在独立目录安装依赖、构建并检查入口。Node.js范围为 `^22.19.0 || >=24.0.0`，具体要求以该版本的package.json为准。

```sh
git clone --depth 1 --branch v5.18.0 https://github.com/dingminhua/dsh-connect-workbuddy.git
cd dsh-connect-workbuddy
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm run verify:entries
node lib/bin.js doctor
```

将构建目录或所打包的tgz添加到测试profile，重启后检查加载。更新运行目录前先完成构建和备份，保留该次构建与提交的对应关系。

## 5. 原构建校验值

以下数据来自原版本与锁文件的重复构建：

| 文件 | 字节数 | SHA-256 |
| --- | --- | --- |
| `lib/index.js` | 627,974 | `b38ebd35759dbd553df2941aa639d47ebddf4f3465ac48dfbea58c8cebde8605` |
| `lib/client.js` | 749,570 | `30d1c74b68eae4df885504fa01b5ac598c06f88a85e44dc2385eff6e30ab2d09` |
| `lib/index.d.ts` | 294,431 | `4674cd4e36df0f325549700529dbbac03e5811ba1ffe46840965439f3b86c044` |
| `lib/bin.js` | 36,779 | `d9832d905ca2fa4494a45c6ef3f24cba3026295d037bc542a926c68428d510b4` |
| `lib/bin.d.ts` | 1,061 | `65e244980e5eed0372fb1d15d9292d52df88c5d650c24f2641d470dad044218a` |
| `lib/host-heartbeat-CPpLIZhM.js` | 455,322 | `c0287893e5113ec5dfc471cd6f0eeebf44d533d812f2cb67e5bcc28c1386c63a` |

源码、锁文件或构建器变化后，校验值也可能变化。核对文件内容时，应同时记录这些输入。

## 6. 发布包安装与诊断

查询目标版本后使用完整版本号安装。profile配置了 `minimumReleaseAge` 时，检查该版本是否满足等待期。安装和移除操作以所用profile及来源为准，账号配置位于DSH数据目录。

```sh
npm view dsh-connect-workbuddy version
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor
```

doctor显示已加载插件的版本。更新机制及缓存检查见 [PINNED-UPGRADE-LAG.md](PINNED-UPGRADE-LAG.md)。
