# 模型选择器标签：同系列插件的实现规范

> 本文供同系列插件作者参考（`dsh-connect-workbuddy` / `dsh-connect-trae` /
> `dsh-connect-qoder` 及其他同类插件）。实现步骤不依赖具体包名。
> 适用宿主：DSH **0.2.2 及以上**（`LlmModelInfo.badge` 从这一版起存在）。
> 0.1.x 上本文方案不会显示标签，也不会影响原有功能，不需要探测版本，见「版本门槛与降级」。

## 结论

**保留原始模型名称。** 插件通过 `adapter.listModels()` 为自身模型提供 `LlmModelInfo.badge`。取得 `conversation.input.model.label` 单实例插槽渲染权的组件，还须展示其他 provider 模型自带的 `badge`。模型名称始终使用目录原值。

**所有 placement 均将标签放在模型名称之后**，自身模型与其他 provider 模型使用相同顺序。DSH 的默认组件在 `trigger` 位置将标签放在名称之前；本方案为统一插件渲染顺序采用固定后置方式，原因见第 4 步。

## 现象与原因

**现象**：同时安装三个同系列插件时，只有其中一个插件的胶囊能显示；另外两个的模型行上
未显示标签。

**原因是插槽声明为单实例。** `conversation.input.model.label` 声明为 `single`，
渲染器（`@deepseek-ai/dsh-client-ui-renderer`）对它的实现逐字是：

```js
if (spec.kind === "single") {
  const entry = host.entriesOfSlot(slotKey)[0];
  if (!entry) return entries.length > 0 ? deadCell() : <>{opts?.fallback ?? null}</>;
  return guarded(entry, entryKeyOf(entry));
}
```

单实例插槽仅渲染一个组件，**选择 priority 数值最小的条目**；`entriesOfSlot` 对非 chain 槽按 key 去重，
而 `single` 的 key 是 `undefined`，所以去重后只剩**第一个存活的**条目——其余注册虽然成功，
但不会参与渲染。

> ⚠️ **同一优先级重复注册会直接抛出异常。** `SlotCore.register()` 对 `single`
> 槽逐字是：
>
> ```js
> case "single": {
>   const f = r.entries.find(h => (h.options.priority ?? 0) === n)
>   if (f) throw new Error(`single slot "${e.name}" already has a registration ${s(f)}`)
> }
> ```
>
> 错误文案形如 `single slot "conversation.input.model.label" already has a registration at
> priority 0 (registered by Kb) — register at a different priority to shadow it (lowest renders)`。
> 宿主自带的上游插件 `ui-deepseek-model-label-1017` 就用**默认的 `0`** 注册，所以第三方插件
> 若也用默认值，在安装该插件的 DSH 中会**注册失败**（而且该异常可能被 try/catch 捕获，仅记录一条
> `console.error`，表面上页面正常）。**必须显式给一个负的、族内互不相同的 priority。**

取得渲染权的组件将为**所有 provider 的模型行**执行渲染。

因此，该组件必须读取各模型的 `badge` 才能完整展示标签。修改模型名称无法传递标签的样式、颜色和显示条件。

**为什么不能把胶囊语法写进 `model.name`**：

| 模型名称的使用位置 | 混入标签语法的影响 |
| --- | --- |
| 菜单行的 `title`（悬停提示） | 悬停会看到 `夜间折扣` 之类的原始语法 |
| 触发器的 `aria-label`（`t("trigger.aria", { model: modelLabel })`） | 读屏器会朗读原始语法 |
| 搜索框的排序键（`rankByName(items, rawQuery)` 匹配 `label ?? name`） | 搜索“夜间”可能命中模型，按模型原名搜索时排序可能后移 |
| 卡片的 `triggerLabel` / 选中态摘要 | 语法泄漏到模型选择器以外的界面 |

标签随折扣等条件变化，模型名称则是稳定标识。将动态标签写入名称，会导致标签状态变化时必须同步修改目录名称。

## 数据通道：`LlmModelInfo.badge`

DSH 的 LLM 注册表将 `badge` 作为**目录数据**传递，插件之间无需直接通信：

```
你的 adapter.listModels()        ← 你在这里挂 badge（唯一需要你写的地方）
  → ctx.llm.listModels()         ← 注册表校验并复制（text 浅拷贝、tone 透传）
    → buildModelCatalog()        ← 会话控制器的模型目录，badge 原样带上
      → 选择器 props.model.badge ← 赢家的组件从这里读到它
```

该链路仅对 `badge` 进行规范化和复制，**不执行完整内容校验**。注册表不会检查 `tone` 是否属于四个支持值，也不会检查文本长度。`session/modelCatalog` 的 schema 虽然标着 `mode: 'strict'`，但 0.2.2-rc.1 的网关在
结果方向无法获取 `encode` 编解码器就原样放行（`codec.encode?.(value) ?? value`）。因此，无效数据可能直接导致错误展示，详见“文本与类型规则”。

类型逐字（0.2.2 起）：

```ts
/** 强调程度：neutral 陈述事实，info 突出模型，success 标记优惠，warning 请求注意。 */
export type LlmModelBadgeTone = 'neutral' | 'info' | 'success' | 'warning';

export interface LlmModelBadge {
  /** 一条字面量，或按小写语言 id 索引、且**必须含 en** 的翻译表。 */
  text: LocalizedText;
  tone: LlmModelBadgeTone;
}

export interface LlmModelInfo {
  // ...provider / id / name / description / inputModalities
  /** 目录发现阶段播报的选择器标签；精确路由解析不带它，请求与 Session 事件也不带。 */
  badge?: LlmModelBadge;
}
```

**目录传递限制**：`badge` 只走**目录**这条路。精确路由解析
（`normalizeModelInfo`）不复制它，请求与 Session 事件也不携带它。所以想显示胶囊，
必须通过 `listModels()` 提供，不能仅在 `resolveModel()` 中设置。

## 注册优先级

`single` 插槽的选择规则为：**priority 数值最小的那个渲染**，其余注册虽然成功但永远不被调用。
而**同一优先级第二次注册会直接抛错**（见「现象与原因」里的 `SlotCore.register` 原文），
异常可能被 try/catch 捕获并仅写入 `console.error`，页面其他部分仍可正常显示，排查时须核对注册错误。

所以每个同族插件都必须**显式写一个负的、族内互不相同的 priority**，绝不能用默认的 `0`：

| 插件 | priority | 说明 |
| --- | --- | --- |
| 宿主自带的 `ui-deepseek-model-label-1017` | `0` | 上游 web-app bundle 里的默认值，占了 `0` 这一格 |
| workbuddy | `-105` | 当前渲染组件（数值最小），负责展示各 provider 的标签 |
| trae | `-102` | 注册成功，不渲染 |
| qoder | `-101` | 注册成功，不渲染 |

三项注册要求：

1. **必须 < 0**，且避开宿主自带插件占用的 `0`。
2. **族内互不相同**，否则第二个装上的会注册失败。
3. **取值应避免重复，不得依赖其他插件的运行状态。** 按 `docs/DESIGN.md` §零 第 3 条，插件不应读取其他插件的优先级以调整自身行为。上表仅记录当时配置。

> **每个**同系列插件均须实现第 4 步，以支持渲染其他 provider 的标签。插件无法预先确定用户安装组合或最终取得渲染权的组件。

## 具体做法（5 步）

### 1. 确定标签内容

每个模型仅提供一个标签，应选择最需要向用户说明的一项信息：

- ✅ 放：`限时免费`、`夜间折扣`、`新`、`会员专享` —— 一分钟内不会变的判定结论
- ❌ 不放：负载等级、剩余积分、队列长度 —— 分钟级事实，见「三个已知边界」第 2 条
- ❌ 不放：模型参数（`200K`、`reasoning`）—— 此类信息应通过 `description` 与详情页说明

### 2. 在 adapter 中发布标签

覆盖 `listModels`，**仅增加 `badge`，保留其他字段原值**：

```ts
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning'
interface MyBadge { text: string | Record<string, string>, tone: BadgeTone }

/** 这个模型此刻该说的那一件事；`undefined` 表示不说。 */
function badgeOf(modelId: string): MyBadge | undefined {
  // ...你自己的判定
}

class MyAdapter extends PiAiAdapter {
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const models = await super.listModels(provider)
    return models.map((model) => {
      const badge = badgeOf(model.id)
      return { ...model, ...(badge === undefined ? {} : { badge }) }
    })
  }
}
```

⚠️ **必须用展开（`...`）而不是对象字面量直写 `badge`。** 宿主 0.1.x 的 `LlmModelInfo`
里没有 `badge` 字段，直写会在旧版类型下报「对象字面量只能指定已知属性」；展开一个变量
不受这条检查约束，同一份代码在 0.1.x 与 0.2.x 上都能编译（已用 0.1.7-rc.1 的类型实测）。
旧版宿主会在注册表里把 `badge` 静默丢弃该字段，不会因此报错；详见“版本门槛与降级”。

### 3. 渲染自身模型行

自身模型行由插件组件负责展示，可根据已有布局决定是否直接渲染 `badge`。WorkBuddy 已组合展示活动标签、负载图标和新模型标记，因此不再重复显示同一标签。其他 provider 的模型行按下一步处理。

### 4. 渲染其他 provider 的模型行

取得单实例插槽渲染权的组件，必须在其他 provider 分支中处理 `model.badge`。

宿主的 fallback（没有插件占槽时它自己会画的）逐字是：

```jsx
model.badge === undefined ? model.name : (
  <span className={badgedName}>
    {placement === "trigger" ? <><Tag tone={badge.tone}>{resolveText(badge.text)}</Tag> </> : null}
    <span className={badgedNameText}>{model.name}</span>
    {placement === "trigger" ? null : <> <Tag tone={badge.tone}>{resolveText(badge.text)}</Tag></>}
  </span>
)
```

**DSH 默认组件按 placement 调整顺序**：`trigger` 位胶囊在前，`menu`/`option` 位在后。

> ### 统一标签顺序
>
> 本方案采用与 DSH 默认组件不同的顺序，依据如下：
>
> 1. DSH fallback 仅在没有注册组件时执行；插件取得渲染权后，菜单各行由该插件组件处理。
> 2. 自身模型行通常采用“名称、标签”的顺序。若其他 provider 行按 placement 换序，同一菜单会出现两种排列方式。
> 3. 固定顺序可减少同一菜单中的展示差异。
>
> **正确规则：所有行、所有 placement，胶囊一律在名字后面。**
> 本仓库三家（workbuddy / trae / qoder）已全部统一到这一条，并有测试验证
> 「自己行与外来行的顺序必须相同」——测试比较两类行的实际顺序，而非仅匹配固定字符串。

| `placement` | 本方案的渲染顺序 | DSH fallback 的渲染顺序 |
| --- | --- | --- |
| `"trigger"`（输入框旁，当前选中） | 名字在前，**胶囊在后** | 胶囊在前 |
| `"menu"` / `"option"`（菜单行） | 名字在前，**胶囊在后** | 名字在前 |

`selected` 不参与胶囊的显示与否，只影响宿主的勾选标记。

**使用 flex 行布局，避免仅依靠 span 与空格对齐。** 空格对齐的是**文字基线**，而胶囊自身是
`inline-flex`，它的基线取自内部文字，于是整颗胶囊会被**明显推高**，与自身的
`inline-flex` 的行对不齐（这是实测到的真实缺陷，不是理论问题）：

```tsx
// ❌ 旧写法：靠空格分隔，胶囊会被抬到文字基线上
return <span>{model.name} {chip}</span>

// ✅ 正确写法：与宿主 fallback 的 .badgedName 同一个对齐模型
//    display:inline-flex; align-items:center; gap:4px
return <span className="my-model-label">   {/* 你自己的 inline-flex 类 */}
  <span>{model.name}</span>
  {chip}
</span>
```

组件里的写法（props 用**本地接口**声明 `badge`，别 import 宿主类型——旧版类型没有它）：

```tsx
interface HostBadge { text: string | Record<string, string>, tone: BadgeTone }

function resolveBadgeText(text: HostBadge['text'], language: string): string | undefined {
  if (typeof text === 'string') return text.trim() === '' ? undefined : text
  const lower = language.toLowerCase()
  const base = lower.split('-')[0] ?? ''
  const picked = text[lower] ?? (base === '' ? undefined : text[base]) ?? text.en
  return picked === undefined || picked.trim() === '' ? undefined : picked
}

// ...在「不是我的 provider」那一支里：
const badge = model.badge                       // 类型：HostBadge | undefined
const label = badge === undefined ? undefined : resolveBadgeText(badge.text, uiLanguage())
if (badge === undefined || label === undefined) return <span>{model.name}</span>
return (
  <span className="my-model-label">
    <span>{model.name}</span>
    <Capsule tone={badge.tone}>{label}</Capsule>
  </span>
)
```

**该分支必须为纯函数并安全处理未知数据。** 不得发起请求、读取快照或启动定时器，以免打开菜单时按模型行重复产生副作用。渲染异常会导致整个注册组件退出，影响范围不限于单个标签。无法处理的 `badge` 应降级为 `return <span>{model.name}</span>`。

标签顺序固定后，该分支无需读取 `placement`，避免保留无效的位置判断。

### 5. 标签样式

**首选：直接用宿主的 `Tag`**（`@deepseek-ai/dsh-client-ui-primitives`）。四个 `badge` 的
tone 都是合法的 `TagTone`，宿主自己的 fallback 就是 `<Tag tone={badge.tone}>`，使用该组件可保持样式一致，并随 DSH 组件更新配色：

```tsx
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
// ...
<Tag tone={badge.tone}>{label}</Tag>
```

**替代方案：在插件内实现标签样式。** 不依赖 primitives 时，可参考 DSH `Tag` 的实际 CSS
（`Tag.module.css`，0.2.2-rc.1）：

> **本仓库采用插件内实现方案**。`src/client/WorkBuddyQuotaNotice.tsx`
> 记录了相关依据：依赖 primitives 可能使整张卡片受 DSH 包变更或 stale inject 影响而无法渲染。插件内实现可减少此依赖，配色仍须与下表保持一致。接受该依赖时可直接使用 `Tag`。

| `tone` | 文字色 | 底色 | 描边 |
| --- | --- | --- | --- |
| `neutral` | `--dsw-alias-label-secondary` | `--dsw-alias-bg-module-platform` | 无 |
| `info` | `--dsw-alias-state-business-primary` | 同色 10% `color-mix` | 无 |
| `success` | `--dsw-alias-state-success-primary` | 同色 10% `color-mix` | 无 |
| `warning` | `--dsw-alias-state-warn-primary` | 同色 12% `color-mix` | 无 |

几何（同样是宿主的真值）：`display: inline-flex`、`align-items: center`、
`border-radius: 999px`、`corner-shape: round`、`padding: 1px 8px`、`font-size: 11px`、
`line-height: 17px`、`font-weight: 500`、`white-space: nowrap`。

⚠️ **注意 `info` 用的是 `state-business-primary` 而不是 `brand-primary`，`warning` 用的是
`state-warn-primary` 而不是 `state-warn-secondary`。** 使用错误变量会造成同一行标签颜色不一致。**这四种 tone 均无描边**，不得额外增加描边。

> 措辞要点：宿主 `Tag` 组件本身还有 `outline` / `solid` / `quiet` / `danger` 四个 tone，
> 其中 `outline` 是带 `0.5px` 描边的。但 `badge.tone` 只声明了 `neutral`/`info`/`success`/
> `warning` 四种，**只有这四种是「无描边」**。须区分 `Tag` 的全部 tone 与 `badge.tone` 支持的四种取值。

**未知 tone 按 `neutral` 渲染**，避免空白或异常——旧宿主或未来新增的 tone
都可能落到这一支。同理，不要为标签增加 `max-width` + 省略号：DSH 不截断标签，额外截断会
在同样的行宽下显示成「限时免…」，反而更不一致。

## 文本与类型规则

真实的失败模式分三档，从轻到重：

| 无效数据 | 实际影响 |
| --- | --- |
| 翻译表漏了 `en`，当前语言也没命中 | `resolveText` 回退到 `text.en` = `undefined` → **一颗空胶囊** |
| `tone` 写了四个字面量以外的值 | 宿主的 `Tag` 只把它写成 `data-tone`，没有对应 CSS → **一颗没有配色的胶囊** |
| `text` 漏了（例如传了 `{}` 或一个字符串） | 注册表规范成 `text: {}` → 同样是一颗空胶囊 |
| `badge` 是 `null` | 注册表在 `badge.text` 上**抛错** → 对应的**整个 provider** 从目录里消失（进 `failures`） |

最后一项会影响整个 provider 的目录发现，因此须明确约束：`badge` 要么是一个完整对象，
要么是 `undefined`，**不要用 `null` 表示「没有」**。

最后一行的边界值得说清：`buildModelCatalog` 对每个 provider 单独 `try/catch`，一个
provider 抛错只会让它自己变成一条 `failure` 记录，**不影响其他 provider**。所以「一个坏
`badge` 会让整份目录失败」是假的，但「会让那个插件的所有模型消失」是真的。

至于组件渲染时抛错——那属于另一条路径：`entriesOfSlot` 会跳过已退役的条目
（`if (this.abdicated.has(s)) continue`），组件发生渲染异常后，**整个组件将退出该插槽**，
让排在后面的另一个插件接管模型标签（只有当所有注册者都退役时，那格才变成 `deadCell`）。
因此，应为 `badge` 定义严格的本地接口，避免使用 `any`，并对未知数据结构进行安全降级。

关于空串：宿主 `resolveText` 对**空字符串是原样返回**的（它只对缺失的键执行回退，不过滤空值），
所以 `text: { en: '' }` 会画出一颗真的空胶囊。插件可以将空字符串视为无标签
（上面 `resolveBadgeText` 就是这么写的）——这是插件增加的过滤规则，用于避免空标签，不能作为 DSH 默认行为进行描述。

**DSH `resolveText` 的回退规则**（已按源码核对）：

```js
if (typeof text === "string") return text
return this.fallbackChain(this.snapshot.active).reduceRight((r, l) => text[localeKey(l)] ?? r, text.en)
```

即：**按 locale 注册表里声明的 fallback 链**逐个查表，最后回退到 `text.en`。
宿主内建的语言只有 `zh`（fallback `en`）与 `en` 两种。**注意：宿主并没有「取 `-` 前面的
语言基码」这层逻辑**——`zh-CN` 能命中 `zh`，是因为 `zh` 自己注册了 fallback，
不是因为宿主会截断标签。插件如需更宽松的回退（例如 `pt-br` 命中 `pt`），须明确记录扩展规则，避免与 DSH 的展示结果不一致。

键的查找会经过 `localeKey()`（小写化），所以**表里的键必须小写**。

以下是 **DSH 自身目录采用的文本约束**。第三方 adapter 应自行遵循，以保持展示一致；DSH 不会自动校验这些返回值，`badgeText()` 只存在于 `dsh-llm-deepseek` 内部）：

| 规则 | 照做的理由 |
| --- | --- |
| 文本 `trim()` 后 **≤ 12 个 grapheme** | 宿主文案遵循此上限；超过上限可能无法在一行内显示 |
| 必须有可见字符（非空白、非默认可忽略） | 否则就是一颗空胶囊（见上表第一行） |
| 不得含控制字符、行/段分隔符、双向控制符 | 会破坏行内布局 |
| 翻译表的键是小写语言 id（`en`、`zh`、`zh-hans`、`pt-br`） | `resolveText` 按 `localeKey()` 查表，大小写不匹配就查不到 |
| **`en` 必填** | 它是 `resolveText` 的回退值；缺了它，任何没命中的语言都得到空胶囊 |

12 个 grapheme 大致是：`限时免费`(4)、`夜间折扣`(4)、`会员专享`(4)、`新`(1)、
`Free trial`(10)。**中文与 emoji 混排要按 grapheme 数**，不是按 `length`
（`'🚦'.length === 2`，`'👨‍👩‍👧'.length === 8`，用 `Intl.Segmenter` 数）。

## 版本门槛与降级

`LlmModelInfo.badge` 从 **0.2.2** 起存在。0.1.x 上：

- adapter 返回的 `badge` 被注册表**静默丢弃**（不抛错、不警告）；
- 组件的 `props.model.badge` **永远是 `undefined`**。

> 实测（2026-11-08，逐行读两个版本的 `LlmRuntime.listModels`）：0.1.7-rc.1 用
> `{ provider, id, name, ...description, ...inputModalities }` **重建**每个条目，
> `badge` 不在其中，所以确实是被重建掉的，而不是「没被读到」。0.2.2-rc.1 多了一段
> `const badge = model.badge` 与 `...badge === void 0 ? {} : { badge: { text: typeof
> badge.text === "string" ? badge.text : { ...badge.text }, tone: badge.tone } }`。
> 注意它只做**浅拷贝，不校验**：`tone` 写错不会报错，只会在前端画出一枚没有颜色的
> 胶囊；`badge: null` 则会在 `badge.text` 上**抛错**，把整个 provider 从目录里抹掉。
> 所以「没有胶囊」要用 `undefined`，绝不能用 `null`。

两个方向都自然退化成「今天的样子」——旧宿主上胶囊不显示，但**不会有任何一行崩掉**。
所以：

- ✅ **不需要探测宿主版本**，也不需要为它写分支；
- ✅ **不需要抬 `peerDependencies` 下限**：抬了只会让还在 0.1.x 上的用户装不上，
  不会带来额外兼容收益；
- ❌ 不要用 `if (badge 字段存在)` 之类的运行时探测——字段存在与否是**类型层**的事实，
  运行时只看得到 `undefined`，写了也是同一个分支。

`llm/models-updated(provider)` 事件同样是 0.2.2 才有的。它是「目录变了，重新读一次」
的广播，插件**发它**在旧宿主上是不会产生处理效果，也不会报错（cordis 按名字分发，没有监听者）；
**听它**则只在新宿主上生效。

## 三个已知边界

1. **单个标签的信息容量有限。** workbuddy 的模型行同时想表达「折扣」「负载 🚦」「新模型 ✓」，
   而 `badge` 一个模型只有一枚。这套做法的分工是：**自己的行**由自己的组件画全部，
   **别家的行**只画那枚唯一的胶囊。所以三个插件各自的胶囊都能出现，但每个插件得先
   想清楚「如果只能给别家看一件事，是哪件」。

2. **`badge` 是目录数据，不是实时状态。** 它随模型列表一起刷新。想让它跟着分钟变，
   得发 `llm/models-updated` 让选择器重读目录——而 `buildModelCatalog()` 对**每个模型**
   都要调一次 `resolveModelInfo()`，一次刷新就是 N 次调用。所以分钟级的负载态不该放进
   胶囊，留在自己行上的组件里（那里可以只读一次快照、按分钟重算）。

3. **取得渲染权的组件必须支持其他 provider 的标签。** 三个插件都注册那格槽时，仅有一个组件取得渲染权。如果该组件
   不画别家的 `badge`，别家的胶囊**永远不会出现**——这正是现在的状态。反过来说，
   这套做法的落地成本集中在一个地方：**渲染组件的外部 provider 分支**。

## 本仓库的实现状态

WorkBuddy 已于 2026-11-08 实现下列两部分：

| 功能 | 位置 | 测试 |
| --- | --- | --- |
| 发布自己的胶囊 | `src/adapter.ts` 的 `EffortNormalizingAdapter.listModels` | `tests/model-badge-publish.spec.ts` |
| 复现别家的胶囊 | `src/client/WorkBuddyModelLabel.tsx` 的 `HostBadgeChip` + 外来行分支 | `tests/model-label-slot-coexistence.spec.tsx` |

workbuddy 发出去的是**当前生效的那一枚促销**（`限时免费` / `夜间折扣` 之类）。
上游促销**通常只有中文文案**（没有 `labelEn`），这时 `en = labelEn ?? label` 让两语相同，
于是退化成**纯字符串**——英文用户会看到中文胶囊。这是**有意的取舍**：上游只给了一种文案，
插件自行翻译将无法保持上游文案原样。只有上游确实提供了英文时才会发 `{ en, zh }` 双语表。

负载 🚦 与「新模型」标记**不进**胶囊——理由见上面「三个已知边界」第 2 条，
它们留在 workbuddy 自己行的组件里。

**须区分插件本地 `dsh-llm` 依赖版本与 DSH 运行版本**：

| 哪一份 | 版本 | 影响什么 |
| --- | --- | --- |
| 本仓库 `node_modules` 里的 `dsh-llm` | 0.1.7-rc.1 | **只影响编译期类型**（没有 `badge` 字段，所以要用展开写法） |
| 实际运行的宿主 app | **0.2.2-rc.1** | **决定运行时 `badge` 是否被保留**——而它 ≥0.2.2，所以会保留 |

丢弃发生在**宿主**的 `LlmRuntime.listModels` 里，不是发生在插件自己的依赖里。所以
workbuddy 发的胶囊在真机上**是有效的**；本地 0.1.7 依赖仅要求使用展开写法，以确保代码可在 0.1.x 类型下编译。trae 与 qoder 的 `node_modules` 也是 0.2.2-rc.1，
但它们真正的运行时同样由宿主决定。

## 自检清单

- [ ] `listModels()` 使用展开写法提供可选 `badge`，保留其他模型字段。
- [ ] 自身模型行与其他 provider 模型行使用独立的渲染分支。
- [ ] 其他 provider 分支展示模型名称及有效标签，未知数据安全降级。
- [ ] 所有 placement（含 `trigger`）均将标签置于名称之后。
- [ ] 测试比较自身模型行与其他 provider 行的实际标签顺序。
- [ ] 名称与标签为 flex 行中的两个子元素。
- [ ] 其他 provider 分支不发起请求、不读取快照、不启动定时器。
- [ ] `tone` 属于支持的四种取值，翻译表包含 `en` 且键为小写。
- [ ] 文案不超过 12 个 grapheme，中英混排及 emoji 均有验证。
- [ ] 在 0.1.x DSH 中验证：标签不显示，但不报错、不影响模型行。
- [ ] 不将标签语法写入 `model.name`。
- [ ] 不读取其他插件的插槽注册信息，也不渲染其他插件的组件。

## 与本仓库 `docs/DESIGN.md` §零 的关系

**该方案通过 DSH 目录传递数据，不引入插件间联动。** 它满足 §零 的四项约束：

- 不读取其他插件的注册信息——`model.badge` 来自宿主目录，不是从 `slots.entries(...)` 里翻出来的；
- 不渲染其他插件的组件，由当前插件绘制自身的标签；
- 不依赖其他插件的优先级——这条规则和谁赢那格槽无关；
- 不因其他插件是否安装而改变行为——**这一条是关键**：复现 `badge` 只取决于这一行自己的数据。
  无论 Trae 或 Qoder 是否安装，均按当前模型数据渲染，不增加基于其他插件存在状态的分支。

它和 §零 拒绝过的第 2 条（「接管时补画官方徽标」）的区别也在这里：那条要把某个具体插件的
判断和样式**复制到自身代码**会造成硬编码耦合；此处仅展示宿主提供的字段，无需识别字段的来源插件。数据经宿主单向传递，两个插件之间不存在直接通信通道。

所以 §零 那句「契约下限（**纯目录名**）」里的括号会过时——宿主 0.2.2 起它自己的 fallback
就是「名字 + 可选胶囊」，契约下限本身变宽了。这只是一处**描述需要跟上**，不是不变量要让步：
同时将那半句改成「目录名，以及该模型自带的 `model.badge`（0.2.2 起）」即可，不必当成
开工前的门槛。

不得通过判断具体插件是否安装，或枚举同一插槽的注册信息来决定渲染内容；此类做法违反插件独立性约束。
