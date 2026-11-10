# DSH 0.2.1-rc.3 兼容性复核

本文记录 2026-10-24 对 DSH `0.2.1-rc.3` 的调查及 WorkBuddy 5.8.2 的修复。当时环境为 Node 24.21.0、pnpm 11.28.5。历史修复使用 `MODEL_LABEL_PRIORITY = -0.5`；当前源码使用 `-105`，当前行为见 [DESIGN.md](DESIGN.md#11-模型标签)。本文中的历史测试数量不代表本轮重新执行的测试。

## 1. 模型标签注册失败的原因

DSH 从 rc.2 起捆绑 `@deepseek-ai/dsh-client-ui-deepseek-model-label-1017`，由 `@deepseek-ai/dsh-web-app/cordis.patch.yml` 声明。该插件为官方 `DeepSeek-V4.1-Flash` 显示“1017”发布徽章。**这里的 1017 是发布标记，不是错误码，也不是 Trae 接口的业务码。**

双方注册 `conversation.input.model.label`。该槽的类型为 `kind: "single"`；`SlotCore.register()` 拒绝同一优先级上的第二次注册。当时双方均使用默认优先级 `0`，原始错误为：

```text
single slot "conversation.input.model.label" already has a registration at
priority 0 (registered by Kb) — register at a different priority to shadow it
(lowest renders)
```

`registerModelLabel()` 捕获错误后调用 `console.error`，以保持供应商和页面可用。由此产生的可见现象是标签装饰消失，而非整个插件加载失败。

## 2. 历史修复与项目约束

当时官方组件使用 `0`，`dsh-connect-qoder` 使用 `-1`。5.8.2 将本插件改为 `-0.5`，避开两者的注册冲突。`single` 槽选择数值最低的注册者，因此 `-0.5` 优先于 `0`，但不能优先于 `-1`；该取值不保证始终由本插件渲染。

调查曾尝试枚举 `slots.entries(...)`，将其他供应商的模型行交给下一注册者。该方案需要从 `StoredEntry.locale` 读取其他插件的语言命名空间，再用 `locale.bind()` 合成其参数。其他插件也采用转交时，同一行会反复转交并触发：

```text
RangeError: Maximum call stack size exceeded
```

项目因此撤销代渲染方案。插件不得读取 `slots.entries(...)` 或 `entriesOfSlot(...)` 来调用其他插件组件；注册优先级由自身常量和 DSH 配置决定。当前对非 WorkBuddy 模型显示目录名称及目录公开的 `badge`，不合成其他插件的组件。

官方徽章插件的历史 README 在“Known Limitations and Deferred Work”中说明：

> This package occupies a `single` slot. Another model-label plugin at the same
> priority conflicts; the two presentations do not compose automatically.

该限制说明同槽组件不会自动合成。历史调查记录的 `Slots.listSubTree` 结果为 `kind: single`、`replaceRisk: shadows-shipped-ui`，当时只有优先级 `0` 的官方组件处于 `active: true`；本插件因注册失败未出现在有效注册中。

## 3. 预发布版本判断的更正

[rc.1 调查](DSH-0.2.1-RC1-FOLLOWUP.md)曾将插件能够加载归因于 `link:` 本地安装。rc.3 的源码复核确认，`evaluatePluginCompatibility()` 使用：

```js
semver.satisfies(runtime, range, { includePrerelease: true })
```

因此 `0.2.1-rc.3` 满足声明的 `>=0.1.7-rc.1 <0.3.0-0`。单独使用默认 semver 得到的结果不能替代 DSH 的真实调用条件。`tests/dsh-line.spec.ts` 保留默认 semver 与 DSH 条件的区别。

## 4. 依赖与类型对照

当时的 13 个直接依赖中，12 个包的 `lib/` 逐字节相同；`@deepseek-ai/dsh-client-ui-primitives` 只有增量变化，包括 `TooltipSide` 移至 `tooltip-placement.ts`、`Menu.current`、`minWidthFromAnchor` 和新增图标。

rc.2 到 rc.3 的功能变化集中在以下位置：

| 包 | 当时的变化 |
| --- | --- |
| `dsh-client-ui-conversation` | 新增 `conversation.session.header.views.actions` 与 `DraftInitializationOptions.whenDraftExists` |
| `dsh-client-ui-plugin-manager` | 新增 `openList()` |
| `dsh-client-ui-primitives` | 增量 UI 类型与组件能力 |
| `dsh-web-app/cordis.patch.yml` | 新增 `entry-customization` |

313 个包的 `dist.shasum` 差异主要来自 `package.json` 版本号变化。被移除的 `dsh-experimental-schedule-bundle`、`dsh-invariants`、`dsh-subagent-in-process-driver` 均未被本插件引用。

当时捆绑 `pi-ai@1.1.0`，`piContext()` 仍提供扁平的 `{systemPrompt, messages, tools}`，所以 `foldModernContext` 仍有用途。提示词身份从句与本插件所用主题 token 的调查未发现其他需要修复的变化。

## 5. 历史验证

`tests/model-label-slot-coexistence.spec.tsx` 当时包含 6 项检查，使用真实 `SlotCore` 验证同优先级拒绝、不同优先级共存、自有徽章和禁止插件联动。将常量临时改回 `0` 后，测试失败并复现相同的注册错误；恢复修复后通过。

该次完整测试为 2225 项通过、2 项按平台跳过，类型检查和构建通过。后续 DSH 版本应重新核对槽类型、注册优先级和公开参数，不能把这份历史结果当作当前版本的加载验证。
