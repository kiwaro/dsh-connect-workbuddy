# 上游文档完整性对照记录

> 当前状态（2026-11-10）：WorkBuddy 已修复 32 份文档，其中 21 份恢复了注明来源及适用版本的历史技术引文。已确认的问题已按第 7 节处理。全部文档的逐句语义审阅仍未完成；全文差异计算和相关测试不能替代该项审阅。第 1 至第 6 节记载修复前的发现及检查点。

## 1. 对照对象与结论

检查日期：2026-11-10。仓库为 `dsh-connect-workbuddy`，使用本地 `main` 工作区，包含检查开始时已有的未提交文档。

- 本地 HEAD：`59e1fd4c550e3e87de84523e89ea08795c689ed0`。
- 当日经代理 fetch 后的上游 main：`d03282fafaf3bff9c37c47cd164025379b4fea52`。
- 两者共同祖先：`4d5c475dea86df545e785789f301a233ca9b271d`。
- 历史语言改写提交：`0d6cf6b`。比较该提交前后，可以将本地改写与后续上游更新分开。

本次对照覆盖 69 个文档路径：Markdown、HTML 及许可证等文本。统计为：正文相同 1 份；正文存在差异 61 份；本地独有 6 份；上游独有 1 份。路径取自本地与上游 Git 跟踪文件的并集，包含上游独有文件。

**修复前结论：文档完整性审查不通过。** 已确认具体技术名称被泛化、部分技术记录被压缩，以及部分事实或参数说明不准确。语言检查记录和代码测试结果不能证明技术文档与上游信息等价。

本轮完成所有路径的全文差异计算，并对下一节列出的段落进行人工对照。逐文件表是自动对照清单，不代表每个文件均已完成逐句语义审阅。图片没有进行像素复核。第 1 至第 6 节保留修复前检查快照；后续修复结果见第 7 节。

## 2. 已复核的具体问题

| 级别 | 文件及本地定位 | 对照结果 |
| --- | --- | --- |
| 严重：事实错误 | [docs/DSH-0.2.1-RC3-FOLLOWUP.md](DSH-0.2.1-RC3-FOLLOWUP.md)；本地第 13 行，上游第 24 行 | 原文的 1017 是官方模型发布徽章及其插件名，改写后变成错误码。原文同时解释 SlotCore 同优先级注册冲突、StoredEntry.locale 与代渲染递归；概述不能代替这条故障链。 |
| 严重：文档与源码不符 | [docs/IMAGE_GEN.md](IMAGE_GEN.md)；本地第 16 行，上游第 10 行 | 本地参数表仍将 size 写成可选且默认 1024x1024，将 image 写成字符串或数组；当前 src/image-tool.ts 的 parseSizeSpec 要求 size 必填，asImageList 要求 image 为字符串数组。上游有完整参数、requestedSize、auto、缩放与输入限制说明。这里同时存在旧说明未同步和历史细节被删，不能把最新版全部差异都归因于语言改写。 |
| 严重：技术依据丢失 | [docs/DESIGN.md](DESIGN.md)；本地第 73 行，上游第 15 行 | 设计总稿将逐项设计依据压缩成模块概述。双凭据择新、五分钟刷新余量、过期前刷新失败继续用旧 token、tool_choice 转换形态，以及不读取 slots.entries(...) / entriesOfSlot(...) 的具体限制不再完整。当前文档保留了一部分字段，但不足以替代原始条件与取舍说明。 |
| 严重：接口和并发规则丢失 | [docs/ACCOUNT_POOL_PLAN.md](ACCOUNT_POOL_PLAN.md)；本地第 26 行，上游第 245 行 | 原稿的路由常量、WorkBuddyProbeOutcome、WorkBuddyWebCredits、配置结构、siblingBusy / onBusyChange 和保存时整槽合并的原因被大幅删减。原稿还含已经废弃的方案；恢复时应保留历史标识并另列当前末位备用、自动签到与余额恢复规则。 |
| 严重：解析规则丢失 | [docs/CACHE_EVIDENCE.md](CACHE_EVIDENCE.md)；本地第 5 行，上游第 60 行 | 原文列出 pi-ai parseChunkUsage 的字段优先级、cache_write_tokens、?? 与 || 的区别、源码定位和 stream_options 的四段传递过程。现文只剩字段概述及公式，无法据此核对兼容性回归。--no-stream-options 的复现分支也从说明中消失；该参数仍在 scripts/probe-cache-convention.mjs 中。 |
| 严重：实验与复现信息丢失 | [docs/CACHE-HIT-70-RESEARCH.md](CACHE-HIT-70-RESEARCH.md)；本地第 5 行，上游第 388 行 | 研究记录中多轮实验、请求条件、隔离结果、环境变量与失败假设被压缩。脱敏可以替换设备路径与身份值，但不应连同 WORKBUDDY_BODY_REPORT 等技术标识及对照方法一起删除。 |
| 严重：算法与接口丢失 | [docs/DSML-RECOVERY-PLAN.md](DSML-RECOVERY-PLAN.md)；本地第 5 行，上游第 64 行 | 原稿的 declaredTools、RecoveryStream、DsmlStreamBuffer.standDown()、标签分类和流式失败处理被删减。现文保留总体恢复过程，但不足以还原字段级处理、工具声明校验及无恢复条件。 |
| 严重：实验细节丢失 | [docs/CHANNEL-FINGERPRINT-RESEARCH.md](CHANNEL-FINGERPRINT-RESEARCH.md)；本地第 5 行，上游第 10 行 | UNAPPROVED_CHANNEL_OPENINGS、OpeningEvidence、CHANNEL_EVIDENCE_LIMIT、forceNeutralHead、稀疏与密集处理的具体函数及幂等反例不再完整。现文保留处理概述，无法替代请求角色、文本位置与变换条件的对照。 |
| 严重：执行参数丢失 | [docs/VIDEO_GEN.md](VIDEO_GEN.md)；本地第 9 行，上游第 154 行 | 工具参数概述保留，但 VIDEO_POLL_INTERVAL_MS、VIDEO_INPUT_TIMEOUT_MS、VIDEO_DOWNLOAD_TIMEOUT_MS、VIDEO_MODEL_TTL_MS 等名称、默认值及分层超时关系不再完整。提交、轮询、下载的响应字段和实际例子也被压缩。应按本地源码恢复，不照搬未合入的新功能。 |
| 较高：精确包名被泛化 | [docs/DSH-0.2.1-RC1-FOLLOWUP.md](DSH-0.2.1-RC1-FOLLOWUP.md)；本地第 5 行，上游第 255 行 | 兼容调查由逐包、类型和版本条件的记录变为摘要。包名、类型名、semver 条件与验证命令不能用笼统的“依赖变化”替代；部分结论后来已被 rc.3 更正，恢复时需要同时保留更正。 |
| 较高：接口变化依据丢失 | [docs/DSH-0.2.1-RC5-FOLLOWUP.md](DSH-0.2.1-RC5-FOLLOWUP.md)；本地第 5 行，上游第 121 行 | rawText / text 的区别有保留，但其余包级变化、类型名、原始验证条件和测试命令被压缩。应保留历史接口名称，并注明适用的 DSH 版本。 |
| 较高：诊断步骤丢失 | [docs/WINDOWS.md](WINDOWS.md)；本地第 5 行，上游第 29 行 | Windows 证据等级、路径候选、ACL 命令与诊断示例大幅压缩。含真实用户名的路径应改占位符，不能因此删去路径结构、权限参数、来源与适用条件。 |
| 较高：运行机制丢失 | [native/turing-sdk/README.md](../native/turing-sdk/README.md)；本地第 75 行，上游第 90 行 | 宏观平台结论有保留，但 NAPI_VERSION、configure 的布尔类型错误原文、dispatch_sync、ELECTRON_RUN_AS_NODE 与主队列等待栈等证据被省略。应保留精确符号，且与当前 SDK fallback 行为分开描述。 |
| 较高：推理类型与测量丢失 | [docs/reasoning-investigation.md](reasoning-investigation.md)；本地第 5 行，上游第 122 行 | ThinkingLevel、ModelThinkingLevel、SINGULAR_EFFORT_LADDER、compat.supportsReasoningEffort 等具体名称和层间映射不再完整。推理能力与请求字段如何对应，不能仅用“归一化”概述。 |
| 较高：发布诊断步骤丢失 | [RELEASING.md](../RELEASING.md)；本地第 5 行，上游第 263 行 | 发布步骤仍在，但 staged 与 published 的错误原文、PUT 202、web-auth 轨迹及直查 registry 的命令被删减。具体 npm 行为应保留事件日期和适用版本，不能把历史个案写成无条件结论。 |
| 较高：来源说明被压缩 | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)；本地第 5 行，上游第 43 行 | 大体保留了参考项目，但 NO_CONTINUE_CODES、inboxBusy、source.kind、具体移植差异及来源对应关系被概述化。这些是代码来源和设计取舍的技术记录，应与中文叙述一并保留。 |

## 3. 历史改写造成的结构压缩

下表仅比较语言改写提交自身的父版本与提交版本；数字来自原文的逻辑行数，包含空行。它用于定位审查重点，不直接等同于技术信息损失量。当前文件还可能含后续功能更新与未提交修订。

| 文件 | 改写前行数 | 改写后行数 | 当前行数 |
| --- | ---: | ---: | ---: |
| `README.en.md` | 660 | 301 | 726 |
| `README.md` | 743 | 300 | 1205 |
| `RELEASING.md` | 252 | 140 | 140 |
| `docs/ACCOUNT_POOL_PLAN.md` | 290 | 66 | 72 |
| `docs/CACHE-HIT-70-RESEARCH.md` | 401 | 117 | 119 |
| `docs/CACHE_EVIDENCE.md` | 146 | 51 | 51 |
| `docs/CHANNEL-FINGERPRINT-RESEARCH.md` | 208 | 51 | 55 |
| `docs/DESIGN.md` | 534 | 410 | 464 |
| `docs/DSH-0.2.1-RC1-FOLLOWUP.md` | 349 | 53 | 53 |
| `docs/DSH-0.2.1-RC3-FOLLOWUP.md` | 152 | 23 | 23 |
| `docs/DSH-0.2.1-RC5-FOLLOWUP.md` | 292 | 56 | 60 |
| `docs/DSML-LEAK-RESEARCH.md` | 192 | 55 | 55 |
| `docs/DSML-RECOVERY-PLAN.md` | 399 | 131 | 131 |
| `docs/DSML-RECOVERY-WINDOWS-VERIFY.md` | 199 | 49 | 49 |
| `docs/IMAGE_GEN.md` | 264 | 114 | 114 |
| `docs/ISSUE-184-REPLY.md` | 180 | 72 | 72 |
| `docs/ISSUE-189-REPLY.md` | 112 | 58 | 58 |
| `docs/ISSUE-214-REPLY.md` | 89 | 33 | 33 |
| `docs/ISSUE-25-26-WINDOWS-VERIFY.md` | 402 | 51 | 51 |
| `docs/MAC-VERIFY-PR188-REPORT.md` | 107 | 41 | 41 |
| `docs/MAC-VERIFY-PR188.md` | 124 | 39 | 39 |
| `docs/PINNED-11128-RETRY.md` | 109 | 45 | 45 |
| `docs/PINNED-CURRENT-VERSION.md` | 172 | 61 | 68 |
| `docs/PINNED-UPGRADE-LAG.md` | 149 | 109 | 109 |
| `docs/PROMO_BADGE.md` | 250 | 126 | 128 |
| `docs/RELEASE_EXPERIENCE.md` | 155 | 51 | 51 |
| `docs/TEST-WINDOWS-3.4.3.md` | 203 | 42 | 42 |
| `docs/UPSTREAM-0.7.0-REVIEW.md` | 117 | 45 | 45 |
| `docs/VIDEO_GEN.md` | 326 | 136 | 136 |
| `docs/WB400-FIX-PLUGIN-RESEARCH.md` | 78 | 34 | 34 |
| `docs/WINDOWS.md` | 340 | 112 | 114 |
| `docs/reasoning-investigation.md` | 322 | 115 | 115 |
| `native/turing-sdk/README.md` | 110 | 81 | 81 |

## 4. 全部文档的逐文件对照

“未同形出现的标识”只统计上游行内代码在本地全文中缺少相同形式的数量，集合按文件去重。Markdown 格式变化、隐私脱敏、功能差异、历史更正及上游新增内容均可能产生该数字，因此它只用于定位，不能直接判为误删。代码块数量同样只是结构指标。SHA256 按统一 LF 换行后的 UTF-8 正文计算，列出前 12 位，便于复核本次工作区快照。

| 文件 | 对照状态 | 本地/上游行数 | 本地/上游代码块 | 未同形出现的标识 | 本地正文 SHA256 |
| --- | --- | ---: | ---: | ---: | --- |
| `AGENTS.md` | 正文存在差异 | 77/67 | 2/2 | 0 | `07c21ddc73db` |
| `CHANGELOG.md` | 正文存在差异 | 7394/8341 | 12/33 | 285 | `d7923a6dcf41` |
| `CONTRIBUTING.md` | 正文存在差异 | 35/36 | 2/2 | 0 | `88afb24e2e46` |
| `LICENSE` | 正文相同 | 21/21 | 0/0 | 0 | `8664487c9d35` |
| `README.en.md` | 正文存在差异 | 726/698 | 16/17 | 121 | `ce95c82bd2ef` |
| `README.md` | 正文存在差异 | 1205/792 | 22/22 | 306 | `9f21d15094cb` |
| `RELEASING.md` | 正文存在差异 | 140/281 | 9/13 | 117 | `79d6d3363e87` |
| `THIRD_PARTY_NOTICES.md` | 正文存在差异 | 50/69 | 0/0 | 31 | `527cd4846769` |
| `awesome-dsh-plugin-submission/README.md` | 正文存在差异 | 45/49 | 1/1 | 12 | `6b0b3aa46953` |
| `docs/ACCOUNT_POOL_PLAN.md` | 正文存在差异 | 72/290 | 0/2 | 95 | `efa98a80312c` |
| `docs/CACHE-HIT-70-RESEARCH.md` | 正文存在差异 | 119/401 | 0/13 | 108 | `e1a1faa0a96a` |
| `docs/CACHE_EVIDENCE.md` | 正文存在差异 | 51/146 | 3/5 | 64 | `491ebb644219` |
| `docs/CHANNEL-FINGERPRINT-RESEARCH.md` | 正文存在差异 | 55/218 | 0/0 | 46 | `897785fd6f47` |
| `docs/CN_GATEWAY_FALLBACK.md` | 正文存在差异 | 70/102 | 0/0 | 8 | `71b7d0dfce16` |
| `docs/CREDIT-JOURNAL.md` | 本地独有 | 49/0 | 2/0 | 0 | `5a51b8c90878` |
| `docs/DESIGN.md` | 正文存在差异 | 464/571 | 1/5 | 421 | `547ffe09e5fd` |
| `docs/DOCUMENT-LANGUAGE-REVIEW-2026-11-09.md` | 本地独有 | 189/0 | 0/0 | 0 | `ed7a24afbd8c` |
| `docs/DSH-0.2.1-RC1-FOLLOWUP.md` | 正文存在差异 | 53/349 | 0/8 | 204 | `050cf33f8a13` |
| `docs/DSH-0.2.1-RC3-FOLLOWUP.md` | 正文存在差异 | 23/152 | 0/2 | 81 | `eae3dfe5a1d2` |
| `docs/DSH-0.2.1-RC5-FOLLOWUP.md` | 正文存在差异 | 60/292 | 0/6 | 135 | `dda49c82286f` |
| `docs/DSH-0.2.2-RC1-FOLLOWUP.md` | 正文存在差异 | 358/361 | 10/10 | 6 | `5c9110f318e9` |
| `docs/DSML-LEAK-RESEARCH.md` | 正文存在差异 | 55/192 | 0/1 | 42 | `aa70d2b3f2df` |
| `docs/DSML-RECOVERY-PLAN.md` | 正文存在差异 | 131/399 | 0/1 | 131 | `6f9d404be921` |
| `docs/DSML-RECOVERY-WINDOWS-VERIFY.md` | 正文存在差异 | 49/199 | 3/11 | 25 | `62a4d24e6a8c` |
| `docs/IMAGE_GEN.md` | 正文存在差异 | 114/823 | 0/1 | 188 | `3760f12b68c4` |
| `docs/ISSUE-184-REPLY.md` | 正文存在差异 | 72/180 | 2/7 | 17 | `36c8f2d9782c` |
| `docs/ISSUE-189-REPLY.md` | 正文存在差异 | 58/112 | 0/0 | 19 | `1a7ba9fee411` |
| `docs/ISSUE-213-REPLY.md` | 正文存在差异 | 53/64 | 1/1 | 16 | `0602caca3a59` |
| `docs/ISSUE-214-REPLY.md` | 正文存在差异 | 33/89 | 0/1 | 18 | `0c4b0b5366cc` |
| `docs/ISSUE-25-26-WINDOWS-VERIFY.md` | 正文存在差异 | 51/402 | 0/20 | 55 | `7eda97202a15` |
| `docs/MAC-VERIFY-PR188-REPORT.md` | 正文存在差异 | 41/107 | 0/1 | 42 | `5c624baeba3f` |
| `docs/MAC-VERIFY-PR188.md` | 正文存在差异 | 39/124 | 1/3 | 23 | `b245a6903dae` |
| `docs/MODEL-LABEL-KEYED-REPLY.md` | 上游独有 | 0/191 | 0/4 | 51 | `不存在` |
| `docs/MODEL-LABEL-SPEC.md` | 正文存在差异 | 452/587 | 9/13 | 28 | `352229c84b8b` |
| `docs/MODULE-SPLIT-PLAN.md` | 本地独有 | 70/0 | 0/0 | 0 | `8eb8a90b921d` |
| `docs/PINNED-11128-RETRY.md` | 正文存在差异 | 45/109 | 0/1 | 44 | `6fee97b362be` |
| `docs/PINNED-CURRENT-VERSION.md` | 正文存在差异 | 68/319 | 2/4 | 119 | `50673d3c9e10` |
| `docs/PINNED-UPGRADE-LAG.md` | 正文存在差异 | 109/164 | 6/4 | 53 | `e796a129ecb0` |
| `docs/PLUGIN-DETAIL-GUIDE.md` | 正文存在差异 | 152/152 | 7/7 | 0 | `4970c22fa8da` |
| `docs/PRIVACY.md` | 正文存在差异 | 189/196 | 2/2 | 6 | `ee66d616b673` |
| `docs/PROMO_BADGE.md` | 正文存在差异 | 128/250 | 1/5 | 67 | `a48cac3d98fa` |
| `docs/README-REVIEW.md` | 本地独有 | 58/0 | 0/0 | 0 | `dacfc110058d` |
| `docs/RELEASE_EXPERIENCE.md` | 正文存在差异 | 51/155 | 0/3 | 31 | `1eb2d3d5b252` |
| `docs/TEST-WINDOWS-3.4.3.md` | 正文存在差异 | 42/203 | 1/11 | 32 | `64b9aba8524b` |
| `docs/UPSTREAM-0.7.0-REVIEW.md` | 正文存在差异 | 45/117 | 0/0 | 76 | `dc41bc66dc01` |
| `docs/UPSTREAM-INTEGRATION-2026-11-08.md` | 本地独有 | 36/0 | 0/0 | 0 | `c7eeaf146f47` |
| `docs/UPSTREAM-INTEGRATION-2026-11-09.md` | 本地独有 | 23/0 | 0/0 | 0 | `6c584b11f08a` |
| `docs/VIDEO_GEN.md` | 正文存在差异 | 136/326 | 0/0 | 132 | `0d50681c545d` |
| `docs/WB400-FIX-PLUGIN-RESEARCH.md` | 正文存在差异 | 34/78 | 0/0 | 39 | `ec0bfd36eefb` |
| `docs/WINDOWS.md` | 正文存在差异 | 114/340 | 1/9 | 257 | `c2a730bc651f` |
| `docs/assets/account-pool-demo.html` | 正文存在差异 | 917/931 | 0/0 | 12 | `013ec9a11457` |
| `docs/assets/quota-notice-inline-mock.html` | 正文存在差异 | 96/96 | 0/0 | 0 | `813c9013bba3` |
| `docs/audit/A-account-pool.md` | 正文存在差异 | 187/182 | 1/1 | 11 | `1bca5cc9ef42` |
| `docs/audit/B-contract.md` | 正文存在差异 | 291/291 | 10/10 | 8 | `e93679fade35` |
| `docs/audit/C-interaction.md` | 正文存在差异 | 182/180 | 2/2 | 2 | `4b004aacc541` |
| `docs/audit/D-verification.md` | 正文存在差异 | 243/251 | 2/3 | 10 | `3d8af122ddd5` |
| `docs/audit/E-fix-log.md` | 正文存在差异 | 676/608 | 4/4 | 4 | `62456e96597e` |
| `docs/audit/F-fix-verification.md` | 正文存在差异 | 293/288 | 8/8 | 6 | `f74bd5495122` |
| `docs/audit/G-round2-verification.md` | 正文存在差异 | 282/280 | 2/2 | 1 | `e8b165368edc` |
| `docs/audit/H-round3-verification.md` | 正文存在差异 | 418/415 | 8/8 | 3 | `82c18f7a3f5a` |
| `docs/audit/I-round4-verification.md` | 正文存在差异 | 657/656 | 8/8 | 1 | `5e50cf1b5cd5` |
| `docs/audit/ISSUE59-BILLING.md` | 正文存在差异 | 54/49 | 1/1 | 0 | `762f60de77ac` |
| `docs/audit/ISSUE59-OPTIONS.md` | 正文存在差异 | 216/210 | 2/2 | 0 | `b9dae0f1f4d5` |
| `docs/audit/ISSUE59-VERIFY.md` | 正文存在差异 | 74/69 | 1/1 | 0 | `97b7fecaf0fb` |
| `docs/audit/LEAD-cross-layer.md` | 正文存在差异 | 142/143 | 3/3 | 0 | `a3d04ce8b5a7` |
| `docs/audit/MASTER.md` | 正文存在差异 | 200/209 | 0/0 | 6 | `837e6f161ba1` |
| `docs/pool-header-redesign.html` | 正文存在差异 | 218/218 | 0/0 | 0 | `f692bacf013f` |
| `docs/reasoning-investigation.md` | 正文存在差异 | 115/322 | 0/2 | 102 | `7563e4400cc4` |
| `native/turing-sdk/README.md` | 正文存在差异 | 81/110 | 2/2 | 32 | `aed16cd18d6c` |

## 5. 差异的处理规则

1. 英文产品名、包名、API、类型、函数、字段、HTTP header、协议值与命令参数保持原形。需要中文解释时，在原名附近补充解释，保留参数条件和错误分支。
2. 历史研究保留日期、环境版本、原始响应结构、测量值及可复现步骤。后来被证伪的推断应追加更正，不能删除原实验后使读者无法追溯。真实账号、机器路径与会话标识按权威隐私规则替换。
3. 当前设计以本地源码为依据，另列与上游的差异。账号顺序、末位备用、签到后余额恢复、实体部署、积分差分和计费口径等本地修改需要保留。
4. 上游独有文件先通过 Git 历史确认新增时间和适用实现。未合入本地的版本说明或接口设计属于待同步资料，不能全部记为本地语言修订误删。
5. 现有文档语言检查报告仅证明其记载的检查过程。修复前尚未恢复技术内容；后续已按第 7 节恢复确认缺失的信息，全部文档的逐句审阅仍须继续。

## 6. 修复前检查点与验证范围

本轮新增本对照记录，并在既有语言检查报告顶部增加完整性复核说明。原有工作区内容继续保留。功能代码、构建产物与运行中的插件均未因本轮对照发生修改。

- `git diff --check`：通过。
- `node scripts/check-pii.mjs`：453 个文件通过文本与随包内容扫描，随包文件为 30 个。既有图标存在 eXIf 块，扫描器未发现可读身份文本。
- 本轮没有修改图片，未进行图片像素复核。
- 对照记录与语言检查报告均未位于 `package.json` 的发布白名单，本轮无需替换安装目录中的运行文件。
- 该检查点尚未执行原文恢复。后续修复见第 7 节；本记录不构成全部文档逐句审阅通过的声明。

## 7. 修复执行结果

本次修复在本地 `main` 工作区执行。正文修复 11 份，另有 21 份历史研究恢复原始引文。以下清单只统计相对修复开始时备份发生变化的文档，不将原有源码和测试改动计入本轮。第 4 节的行数与摘要保留修复前快照，不能用作当前文件校验值。

当前设计根据源码补回凭据来源、刷新条件、工具参数及响应解析。`refreshNow()` 的旧 token 回退要求有效期超过当前时间 30 秒；视频结果读取 `data.data[].url` 和 `data.usage.credit`，不能将工具输出字段误写成上游协议字段。图片尺寸说明保留函数名、单边范围及面积限制。

21 份历史资料在末尾增加“历史技术原文与证据”，以折叠引文保留语言改写前的技术记录，标明来源提交与适用版本。引文中的旧结论和口语仅作为历史材料保存；现有更正与当前说明继续保留。原始测量不因语言修订被删除，身份信息使用占位符。

| 修复文件 | 处理方式 |
| --- | --- |
| `AGENTS.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `RELEASING.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `THIRD_PARTY_NOTICES.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/ACCOUNT_POOL_PLAN.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/CACHE-HIT-70-RESEARCH.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/CACHE_EVIDENCE.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/CHANNEL-FINGERPRINT-RESEARCH.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/DESIGN.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/DSH-0.2.1-RC1-FOLLOWUP.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/DSH-0.2.1-RC3-FOLLOWUP.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/DSH-0.2.1-RC5-FOLLOWUP.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/DSML-LEAK-RESEARCH.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/DSML-RECOVERY-PLAN.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/DSML-RECOVERY-WINDOWS-VERIFY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/IMAGE_GEN.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/ISSUE-184-REPLY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/ISSUE-189-REPLY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/ISSUE-214-REPLY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/ISSUE-25-26-WINDOWS-VERIFY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/MAC-VERIFY-PR188-REPORT.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/MAC-VERIFY-PR188.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/PINNED-11128-RETRY.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/PINNED-CURRENT-VERSION.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/PINNED-UPGRADE-LAG.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/PROMO_BADGE.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/reasoning-investigation.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/TEST-WINDOWS-3.4.3.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/UPSTREAM-0.7.0-REVIEW.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/VIDEO_GEN.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `docs/WB400-FIX-PLUGIN-RESEARCH.md` | 保留当前正文，补入注明来源及更正条件的历史技术引文 |
| `docs/WINDOWS.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |
| `native/turing-sdk/README.md` | 复核相关段落，恢复技术标识或修正事实与维护流程 |

### 7.1 验证与交付条件

`pnpm exec vitest run tests/dsh-line.spec.ts tests/host-slot-surface.spec.ts tests/privacy-gate.spec.ts`：3 个文件、35 项测试通过。

新增相对文件链接未发现目标缺失，修改未引入未闭合的 Markdown 代码围栏；`git diff --check` 通过。源码和测试的差异与修复开始前的备份逐块一致。本轮没有修改历史截图，未进行图片像素复核。

随包文档同步到两个本地实体安装副本后逐文件核对 SHA256，具体清单由安装同步记录保存于仓库外。纯文档变更无需重载插件。

全部路径已完成全文差异计算；本轮逐段复核和修复范围如上表所示，不将自动差异计算等同于全部文档逐句人工验收。上游新增且本地尚未实现的版本说明，以及有效的本地功能差异，不作为语言修订误删恢复。

### 7.2 技术保真规则的执行遗漏

LCL CORE A5 已要求英文专有名词、命令、路径和版本保持原形。本次问题属于既有规则执行遗漏，无需新增等价通用规则。两仓 AGENTS.md 已补充技术保真及删除信息的逐项核对要求，防止仅凭措辞检查或代码测试声明技术内容完整。
