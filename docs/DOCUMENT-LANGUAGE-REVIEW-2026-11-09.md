# 文档语言检查记录

## 1. 检查范围与方法

检查日期：2026-11-09。基线为本仓库 `main` 分支。

本次盘点 66 份 Markdown 与 HTML 文档，修订其中 21 份既有文档；本记录单独计数。范围包含根目录说明、开发与发布资料、历史更新记录、问题分析及 HTML 说明文件，排除依赖目录、Git 内部文件和构建产物。

全部文件均经过自动措辞扫描。命中项结合所在段落修订；下表明确区分全文通读修订、命中段落复核修订与扫描未命中。未命中文件不代表经过逐句人工审阅。较长的历史记录采用命中段落复核方式。

## 2. 修订边界与依据

- 将口语、比喻和指代不明的表达改为具体动作、对象、条件和结果。
- 保留原始报文、代码示例、协议字段、历史版本与测量数据；明确的用户原话按引文保留。
- 维护规则以 `AGENTS.md` 及本仓库权威隐私文档为依据。本轮规范措辞，未修改源码或新增行为说明；既有行为结论不因本轮文字修订而视为重新完成源码验证。
- 所有外部 URL 保持原值。代码围栏中的可执行内容保持不变；贡献指南与维护规则中的自然语言注释进行了规范化。
- 图片未修改。HTML 中仅修订说明、注释和展示文字；CSS 规则及脚本语法结构保持不变。

## 3. 验证结果

- `pnpm run check`：类型检查、全量测试与构建通过，测试 3431 项通过。
- `git diff --check`：通过。
- 全量文档 URL 与代码围栏对比：通过；维护规则与贡献指南的注释修改已单独核对。
- `node scripts/check-pii.mjs`：通过。三个 HTML 文档的脚本语法、脚本结构及 CSS 规则对比通过。

## 4. 逐文件记录

| 文件 | 检查状态 | 依据与结果 |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | 全文通读修订 | 按维护规则与隐私要求规范措辞，差异检查通过 |
| [CHANGELOG.md](../CHANGELOG.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 全文通读修订 | 按维护规则与隐私要求规范措辞，差异检查通过 |
| [README.en.md](../README.en.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [README.md](../README.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [RELEASING.md](../RELEASING.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [awesome-dsh-plugin-submission/README.md](../awesome-dsh-plugin-submission/README.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ACCOUNT_POOL_PLAN.md](ACCOUNT_POOL_PLAN.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/CACHE-HIT-70-RESEARCH.md](CACHE-HIT-70-RESEARCH.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/CACHE_EVIDENCE.md](CACHE_EVIDENCE.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/CHANNEL-FINGERPRINT-RESEARCH.md](CHANNEL-FINGERPRINT-RESEARCH.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/CN_GATEWAY_FALLBACK.md](CN_GATEWAY_FALLBACK.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/CREDIT-JOURNAL.md](CREDIT-JOURNAL.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DESIGN.md](DESIGN.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DSH-0.2.1-RC1-FOLLOWUP.md](DSH-0.2.1-RC1-FOLLOWUP.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DSH-0.2.1-RC3-FOLLOWUP.md](DSH-0.2.1-RC3-FOLLOWUP.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DSH-0.2.1-RC5-FOLLOWUP.md](DSH-0.2.1-RC5-FOLLOWUP.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DSH-0.2.2-RC1-FOLLOWUP.md](DSH-0.2.2-RC1-FOLLOWUP.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/DSML-LEAK-RESEARCH.md](DSML-LEAK-RESEARCH.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/DSML-RECOVERY-PLAN.md](DSML-RECOVERY-PLAN.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/DSML-RECOVERY-WINDOWS-VERIFY.md](DSML-RECOVERY-WINDOWS-VERIFY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/IMAGE_GEN.md](IMAGE_GEN.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ISSUE-184-REPLY.md](ISSUE-184-REPLY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ISSUE-189-REPLY.md](ISSUE-189-REPLY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ISSUE-213-REPLY.md](ISSUE-213-REPLY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ISSUE-214-REPLY.md](ISSUE-214-REPLY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/ISSUE-25-26-WINDOWS-VERIFY.md](ISSUE-25-26-WINDOWS-VERIFY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/MAC-VERIFY-PR188-REPORT.md](MAC-VERIFY-PR188-REPORT.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/MAC-VERIFY-PR188.md](MAC-VERIFY-PR188.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/MODEL-LABEL-SPEC.md](MODEL-LABEL-SPEC.md) | 全文通读修订 | 按维护规则与隐私要求规范措辞，差异检查通过 |
| [docs/MODULE-SPLIT-PLAN.md](MODULE-SPLIT-PLAN.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/PINNED-11128-RETRY.md](PINNED-11128-RETRY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/PINNED-CURRENT-VERSION.md](PINNED-CURRENT-VERSION.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/PINNED-UPGRADE-LAG.md](PINNED-UPGRADE-LAG.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/PLUGIN-DETAIL-GUIDE.md](PLUGIN-DETAIL-GUIDE.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/PRIVACY.md](PRIVACY.md) | 全文通读修订 | 按维护规则与隐私要求规范措辞，差异检查通过 |
| [docs/PROMO_BADGE.md](PROMO_BADGE.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/README-REVIEW.md](README-REVIEW.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/RELEASE_EXPERIENCE.md](RELEASE_EXPERIENCE.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/TEST-WINDOWS-3.4.3.md](TEST-WINDOWS-3.4.3.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/UPSTREAM-0.7.0-REVIEW.md](UPSTREAM-0.7.0-REVIEW.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/UPSTREAM-INTEGRATION-2026-11-08.md](UPSTREAM-INTEGRATION-2026-11-08.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/UPSTREAM-INTEGRATION-2026-11-09.md](UPSTREAM-INTEGRATION-2026-11-09.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/VIDEO_GEN.md](VIDEO_GEN.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/WB400-FIX-PLUGIN-RESEARCH.md](WB400-FIX-PLUGIN-RESEARCH.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/WINDOWS.md](WINDOWS.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/assets/account-pool-demo.html](assets/account-pool-demo.html) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/assets/quota-notice-inline-mock.html](assets/quota-notice-inline-mock.html) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/A-account-pool.md](audit/A-account-pool.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/audit/B-contract.md](audit/B-contract.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/audit/C-interaction.md](audit/C-interaction.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/D-verification.md](audit/D-verification.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/audit/E-fix-log.md](audit/E-fix-log.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/audit/F-fix-verification.md](audit/F-fix-verification.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/audit/G-round2-verification.md](audit/G-round2-verification.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/H-round3-verification.md](audit/H-round3-verification.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/I-round4-verification.md](audit/I-round4-verification.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/ISSUE59-BILLING.md](audit/ISSUE59-BILLING.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/ISSUE59-OPTIONS.md](audit/ISSUE59-OPTIONS.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/ISSUE59-VERIFY.md](audit/ISSUE59-VERIFY.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/LEAD-cross-layer.md](audit/LEAD-cross-layer.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [docs/audit/MASTER.md](audit/MASTER.md) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/pool-header-redesign.html](pool-header-redesign.html) | 自动扫描＋命中段落复核修订 | 保留原有技术结论，修订命中表达 |
| [docs/reasoning-investigation.md](reasoning-investigation.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
| [native/turing-sdk/README.md](../native/turing-sdk/README.md) | 自动扫描未发现需修改项 | 保留原文；不计入全文人工通读 |
