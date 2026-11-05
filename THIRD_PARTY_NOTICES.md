# 第三方开源声明

本文件记录项目参考或移植的开源实现、相应来源及许可证。平台和构建依赖的许可文件随各依赖包提供。新增外部代码时，需要同步登记来源及适用的许可要求。

## 1. 项目来源

本项目在 DSH 中接入 WorkBuddy。连接实现参考 `corrinehu/dsh-workbuddy-connect`；设置卡片和模型管理参考 `dingminhua/dsh-connect-trae`，后者的样式与语言资源组织还参考 `dingminhua/dsh-subagent-default-model`。

## 2. 参考项目

| 项目 | 来源 | 内容 | 许可证与版权 |
| --- | --- | --- | --- |
| dsh-workbuddy-connect | <https://github.com/corrinehu/dsh-workbuddy-connect> | 凭据发现、协议、回环服务、适配器及诊断 | MIT，Copyright (c) 2026 Corrine Hu |
| workbuddy2api | <https://github.com/Sliverkiss/workbuddy2api> | WorkBuddy 协议参考 | MIT |
| workbuddy2api | <https://github.com/hawklithm/workbuddy2api> | DSML 解析器移植来源 | MIT，Copyright (c) 2026 Mayer |
| dsh-connect-trae | <https://github.com/dingminhua/dsh-connect-trae> | 卡片、模型管理、账号交互和发布结构 | MIT，Copyright (c) 2026 LaoDing |
| dsh-subagent-default-model | <https://github.com/dingminhua/dsh-subagent-default-model> | CSS、图标和文案键组织 | MIT，Copyright (c) 2026 LaoDing |
| dsh-codex-connect | <https://github.com/franksong2702/dsh-codex-connect> | 经连接项目引用的插件结构及供应商注册设计 | Apache-2.0 |
| dsh-auto-continue | <https://github.com/HsiangNianian/dsh-auto-continue> | 连续失败次数与停止条件 | MIT |
| dsh-purge | <https://github.com/YuJunZhiXue/dsh-purge> | 失败类别、消息排队和用户消息识别 | MIT |

## 3. DSML 解析器移植

`src/dsml-recovery.ts` 将 Mayer 的 `src/codebuddy_proxy/dsml_parser.py` 移植为 TypeScript。移植内容包括标签状态变化规则、忽略区域判断、缺少包裹标签的处理、参数递归解析和流式缓冲。

项目在该实现上增加请求工具名校验，并依据本次请求声明的工具决定是否进行恢复。其他调整涉及参考实现中的重复函数定义及流式输出与解析结构的一致性。具体差异保存在源文件头部，保留 MIT 版权和许可声明。

## 4. DSH 工具函数的后备实现

`src/host-peers.ts` 提供独立 CLI 需要的后备工具函数。`writeFileAtomic`、`withFileLock` 对照 `@deepseek-ai/dsh-atomic-write` 的行为，`resolveDshHome` 对照 `@deepseek-ai/dsh-home-paths`。

这些函数采用相同的锁命名、Windows 瞬时错误分类和重试规则，使 CLI 与 DSH 能够操作同一文件。DSH 提供相应依赖时使用依赖实现；独立执行时按解析结果选择后备实现。说明及测试见 `tests/host-peers.spec.ts`。

## 5. 自动发送规则的参考

`src/channel-continue.ts` 参考自动继续项目的连续次数计数、成功后重置和子会话排除规则；参考 dsh-purge 的失败分类、收件箱忙碌判断及消息来源识别。

该模块仅针对所配置的渠道校验失败发送后续消息。事件订阅由调用方提供，具体实现及差异见该模块注释。

## 6. Apache-2.0 来源说明

`dsh-codex-connect` 通过 `dsh-workbuddy-connect` 提供了插件结构及供应商注册设计的间接参考。相关模块由本项目实现，该来源在项目清单中保留 Apache-2.0 标识。

原来源记录称对应仓库未提供独立 NOTICE 文件。后续采用其代码或更新参考来源时，需要重新核对许可文件和 NOTICE，并检查修改声明以及适用的专利、商标条款。该来源作者的版权及权利归其所有。

## 7. 分发与维护

`THIRD_PARTY_NOTICES.md` 列入 `package.json.files`，随包发布。中英文 README 提供来源索引，LICENSE 保留 `Copyright (c) 2026 LaoDing`。

维护者在引入新依赖或复用外部代码时，记录项目地址、许可及修改内容，并在相应源文件中注明来源。各参考项目的版权归各自作者所有。
