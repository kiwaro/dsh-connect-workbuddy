# dsh-wb400-fix 调查记录

本记录对应2026-10-26的插件对照，当时本项目版本为5.11.0。讨论对象为 `simlerick/dsh-wb400-fix`，许可证MIT。包名、仓库和发布状态均按当时记录描述。

## 1. 名称与来源

原调查在 npm 和CDN未取得 `dsh-workbuddy-fix` 包，随后通过仓库变更记录定位到 `dsh-wb400-fix`。其1.1.1变更说明记录过临时名称 `@balong/dsh-workbuddy-fix`，代码中的插件ID为 `workbuddy-fix`。

## 2. 实现方式

对照实现包装 `globalThis.fetch`，检查 WorkBuddy和CodeBuddy聊天地址，解析请求体后修改消息内容。主要规则在 `DeepSeek Harness` 中插入U+200B，另提供首条system等选项。

| 维度 | `dsh-wb400-fix` | 本插件 5.11.0 |
|---|---|---|
| 生效范围 | 任何走 fetch 打 WB 的插件 | 仅本插件自己的上游请求 |
| 改写位置 | fetch 出口，统一改 body | adapter 内 `prepareChatBody` 构造请求 |
| 被拒后自愈 | 无重试阶梯 | `forceNeutralHead` → `perturbChannelFingerprints` |
| 指纹覆盖面 | 只认字面量 `DeepSeek Harness` | 前缀名单 + 身份从句拆词（三条 span） |
| 第三方文件 | 可选往 `dsh-our-free-model` 的 `pack.js` 插钩子并自愈 | 不碰任何第三方文件 |
| 发布形态 | npm/CDN 全 404，只能 clone | npm 5.11.0 |

## 3. 观察结果

递归修改字符串的规则会处理 `tool_calls[].function.arguments`，包括可能用于文件内容的参数。移植时需要区分提示正文、工具参数和工具结果。

对照实现只匹配特定词组，原测试对另一类身份说明记录为0次匹配。其测试脚本指向的目录在所测仓库中缺失，文档声明与可选 `pack.js` 修改功能也有差异。

这些发现分别涉及修改范围、规则覆盖及验证材料，应在采用前核对具体提交。

## 4. 后续设计条件

若需要出口级处理，可以在本项目 `upstream.ts` 自身的请求构造链中设置默认关闭的选项，并明确可处理的消息字段。修改时检查工具参数保留和请求内容的变化。

该调查提出过 `egressRewrite` 名称，属于当时建议。现有选项及生效路径应根据所用版本的 schema 和源码确认。
