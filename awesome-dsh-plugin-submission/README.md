# 插件市场条目

本目录保存上游项目在 [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 注册表中的条目副本。注册表文件为 `data/plugins/dingminhua__dsh-connect-workbuddy.yml`，对应上游仓库 `dingminhua/dsh-connect-workbuddy`。

## 1. 提交记录

| 事项 | 链接与记录 |
| --- | --- |
| 首次收录 | PR [#3812](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/3812)，记录的合并日期为 2026-08-30，提交为 `c079c705` |
| 描述与图标更新 | PR [#10281](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10281)，用于更新早期版本的功能描述并添加 `icon` |
| 插件截图 | 由上游仓库的 `screenshots.json` 声明 |

表中日期和提交对应当时的收录记录。再次提交市场条目时，应核对对应 PR 的状态，并填写实际发布仓库的地址。

## 2. 条目字段

注册表规则见 [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。提交前应核对该文档的要求。

| 字段 | 本项目条目的填写方式 |
| --- | --- |
| `url` | 上游仓库地址 |
| `name` | `dingminhua/dsh-connect-workbuddy` |
| `category` | `model` |
| `description.en` | 一行英文描述，以句号结束；包含 `: ` 时使用引号 |
| `description.zh` | 中文描述 |
| `icon` | GitHub 托管的位图地址，指向 `icons/dsh-connect-workbuddy-128.png` |
| `tarball` | 本项目通过 npm 发布，省略此字段 |

仓库通过 `package.json` 中的 `dsh.bundle.patch` 声明插件入口，并使用 `dsh-plugin` topic。仓库年龄、每次提交允许修改的条目数量等要求，以注册表的贡献文档为准。

## 3. 更新流程

1. 根据代码中已实现的功能，修改本目录的 YAML 副本。
2. 同步注册表仓库的主分支，在工作分支修改对应的 `data/plugins/` 文件。
3. 按注册表要求生成预览并运行检查，提交 PR。
4. 根据维护者意见继续修改同一个 PR。

注册表的中英文 README 由脚本生成。在注册表仓库中预览时执行：

```sh
npm ci
node scripts/generate-readme.mjs
```

插件新增功能后，需要单独提交条目更新。描述中的命令、工具和功能应能在目标仓库中找到对应实现。
