# 发布流程

本文记录上游仓库 `dingminhua/dsh-connect-workbuddy` 和同名 npm 包的发布操作。fork 发布需要使用对应的仓库、账号和包名。发布前核对目标仓库及版本，并确认操作账号拥有对应包的发布权限。

## 1. 准备账号与工具

使用已获 npm 包发布权限的账号，在交互式终端中登录。上游历史维护账号为 `dmh2002`，GitHub 维护账号为 `dingminhua`。检查命令如下：

```sh
npm whoami
gh auth status
```

账号启用浏览器 2FA 时，由维护者在交互式终端执行发布并完成浏览器确认。授权和日志保存的历史记录见 [RELEASE_EXPERIENCE.md](docs/RELEASE_EXPERIENCE.md)。

## 2. 检查代码、平台和依赖

在待发布仓库中执行：

```sh
pnpm run check
npm pack --dry-run
```

`check` 按脚本顺序完成类型检查、测试和构建。

打包预览显示将要发布的文件，用于核对包入口及资源是否齐备。发布清单以 `package.json.files` 为准。

### 2.1 版权与来源

确认 LICENSE 保留 `Copyright (c) 2026 LaoDing`。`THIRD_PARTY_NOTICES.md` 随包发布，中英文 README 保留来源和许可证。新增或移植代码需要同步登记来源，Apache-2.0 项目按其要求保存相关声明。

```sh
grep -F "Copyright (c) 2026 LaoDing" LICENSE
grep -F "THIRD_PARTY_NOTICES.md" package.json
grep -F "corrinehu/dsh-workbuddy-connect" README.md README.en.md
grep -F "dingminhua/dsh-connect-trae" README.md README.en.md
grep -F "dsh-codex-connect" README.md README.en.md
```

### 2.2 平台核对

按照 [WINDOWS.md](docs/WINDOWS.md) 检查 Windows 路径、权限、文件占用和子进程。新增平台测试通过参数指定平台及目录，以覆盖相应分支。Windows GUI 启动的后台子进程需要设置 `windowsHide: true`。

平台变更同时更新平台记录和中英文 README。检查 CI 覆盖 Windows 与 Linux，并根据测量记录说明实际验证范围。

### 2.3 DSH 版本兼容性核对

检查 `package.json.peerDependencies` 与所支持的 DSH 接口。此分支声明的 DSH 包范围为 `>=0.1.7-rc.1 <0.3.0-0`；`-0` 用于正确限制预发布版本。

修改范围时，先核对对应 DSH 版本和接口，再运行兼容性测试，并更新 README 的“支持的 DSH 版本”与变更说明。测试见 `tests/dsh-line.spec.ts`。

## 3. 更新版本与变更记录

将 `package.json.version` 更新为目标版本 `X.Y.Z`。在 CHANGELOG 顶部添加 `## X.Y.Z (YYYY-MM-DD)`，说明功能、修复及文档变化。

提交前检查实际差异，将本次发布所需文件加入提交，并确认 Git tag 指向该提交。

```sh
git add <本次发布文件>
git commit -m "chore: 版本升级至 X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z: <一句话说明>"
git push origin main
git push origin vX.Y.Z
```

已有 tag 指向其他提交时，先核对远程发布情况，确定发布修正方式。已公开使用的版本应保持可追溯。

## 4. 发布到 npm

维护者在交互式终端执行：

```sh
npm publish
```

根据 npm 提示完成浏览器授权。链接失效时，重新执行命令生成授权会话，再完成确认。

npm 可能使用暂存发布。返回 `202 Accepted` 表示发布请求已受理，维护者还需在 npm 网站的 Staged Packages 中审核并批准。相关版本是否已经公开，使用第 5 节的 registry 查询确定。

历史环境记录中，npm 11.15.0 及以上提供 `npm stage list` 和 `npm stage approve <stage-id>`；使用前应检查所装 npm 的命令帮助及账号权限。

## 5. 核对 registry

检查版本是否存在、latest 是否更新以及上传包是否与待发布构建一致：

```sh
npm view dsh-connect-workbuddy@X.Y.Z --prefer-online version
npm view dsh-connect-workbuddy --prefer-online dist-tags.latest
```

存在代理缓存疑问时，可直接读取 registry：

```sh
curl -s --noproxy '*' -H "Cache-Control: no-cache" https://registry.npmjs.org/dsh-connect-workbuddy
```

从 registry 中确认 `versions['X.Y.Z']` 存在，再检查 `dist-tags.latest` 和发布时间。将 tarball 的 shasum 与待发布构建比较，确认包内容一致。

## 6. 创建 GitHub Release

npm 与 GitHub 分别发布。npm 包确认可用后，为已推送的 tag 创建 GitHub Release：

```sh
gh release create vX.Y.Z \
  --title "vX.Y.Z — <一句话说明>" \
  --notes-file /tmp/release-X.Y.Z.md \
  --verify-tag
```

`--verify-tag` 要求 tag 已经存在。正文从 `--notes-file` 读取，说明该版本的主要变化、使用影响和验证结果。项目采用人工整理的公告正文；`--generate-notes` 生成的提交列表适合作为编写材料。

正式版本按正式 Release 发布。包通过 npm 分发，GitHub Release 记录版本说明。核对命令为：

```sh
gh release view vX.Y.Z --json name,tagName,isDraft,isPrerelease,assets
gh release list
```

确认标题使用 `vX.Y.Z — `，tag 与发布提交一致，草稿及预发布状态符合目标版本，附件符合分发方式。

## 7. 常见问题

| 情况 | 排查步骤 |
| --- | --- |
| `EOTP` 或授权链接被遮蔽 | 在维护者交互式终端重新执行，完成浏览器确认 |
| 授权链接返回 404 | 重新生成授权会话，再完成确认 |
| `Cannot publish over previously staged version` | 检查 npm 的暂存包，处理该版本的审核状态 |
| `previously published versions` | 查询 registry，核对版本和构建校验值 |
| 返回 202 后版本仍未公开 | 检查暂存发布审批状态 |
| `npm view` 返回旧版本 | 使用在线查询及直接 registry 读取排除缓存影响 |
| `npm whoami` 返回 E401 | 更新 npm 登录凭据 |
| `gh release create` 提示 tag 缺失 | 核对 tag 指向并推送该 tag |
| GitHub 返回 403 | 用 `gh auth status` 核对仓库权限 |

## 8. 历史操作记录

早期发布中，v2.0.0、v2.0.16 和 v2.0.17 曾遗漏 GitHub Release；v2.1.1 在 npm 发布近两天后补充 Release。发布清单因此包含第 6 节。

2FA 的一次历史超时记录为约 92 次轮询、4.6 分钟，维护者直接在终端确认的记录为 13 次轮询、49 秒。npm 日志记录的保留上限曾为 10 份，排查时应及时保存请求状态、轮询次数和退出结果。原材料及证据说明见 [发布经验](docs/RELEASE_EXPERIENCE.md)。
