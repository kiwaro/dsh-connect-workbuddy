# 审计 F：修复的独立对抗式验证

本文保留当时的验证结果和未修状态；后续处理见 E-fix-log.md，不能把这些状态当作当前插件状态。

本文记录账号池第一轮修复的独立验证，覆盖 E-fix-log 中的 H-1 至 H-6、M-3、M-5、M-9 及其他 12 项修订。

测试使用 React 18.3.1 和 jsdom 挂载组件，再通过插件路由读写配置。关键项目在恢复缺陷的副本上执行同一测试，以确认断言具有区分能力。原验证期间仅新增此报告；哈希和脚本位置见下表。

## 1. 方法与验证基线

### 1.1 环境

| 项 | 值 |
| --- | --- |
| Node | v25.9.0（`--experimental-strip-types` + `register()` 钩子用 `typescript.transpileModule` 转译 `.tsx`） |
| React / react-dom / jsdom | 18.3.1（**symlink 到仓库同一份 react**，避免双实例）/ 18.3.1 / 29.1.1，装在 `/tmp/fverify/render` |
| 被测代码 | **未改动**，验证期间哈希固定（见 §1.2） |
| DSH 加载 | `new Context()` + FakeWebServer + FakeSettings，**真实 `apply()`**；`settings.mutate` **就地写回** `apply()` 收到的那个 config 对象 |
| 脚本位置 | `/tmp/fverify/`（仓库外，**已删除**；重建配方见 §8） |

**验证基线（本轮实测，全部固定）**：

```
src/client/AccountPool.tsx        7df6965a151df23f
src/client/WorkBuddyCard.tsx      5ddacbf2c360e664
src/index.ts                      33667250ac8d5bb7
src/web-status.ts                 e24fce5a7b4c673e
src/account-pool.ts               3c8d06878d17b38a
src/client/locales.ts             f55726a40682736b
src/client/account-selection.ts   825878bc073e45e6
```

> **中途变更（重要）**：`AccountPool.tsx` 在我开始验证后（07:01）被改动了一次 —— `savedRef` 从**渲染期赋值**改为 `useLayoutEffect` 同步。
> 我在**新版本**上重新运行了全部 21 个脚本（§6 的核查结论均以新版本为准），并针对这次改动单独复核（§4.1）。

### 1.2 核查判定方法

- **已修复** = 在本机复现出"修复后的正确行为"，**且**在对应变异副本上同一脚本能判出缺陷。
- **未修复** = 用修复后的代码仍能复现原缺陷现象（附复现步骤）。
- **修复引入新缺陷** = 修复本身带来了新的、可复现的错误行为。
- **无法验证** = 环境限制，说明原因。

### 1.3 变异副本（本报告的方法学核心）

仅"修复后行为正常"不足以证明修复有效——**必须证明测试能判出未修状态**。为此在 `/tmp/fverify/` 建了三棵变异测试副本，把修复**逐条回退**后跑同一脚本：

| 变异副本 | 回退内容 | 用途 |
| --- | --- | --- |
| `mutant/` | H-1（旧 `editDraft` 闭包 + 标量依赖数组）、H-2（`rotationLocked` 读草稿）、C1-3（清空不禁用） | 证明 H-1/H-2 的脚本有判别力 |
| `mutant_gating/` | H-4（tab 开关去掉 `saving \|\| poolBusy`；两个保存按钮去掉 `togglingRegion`；`siblingBusy` 只含 `saving`） | 证明 H-4 的脚本有判别力 |
| `repo-mutant/` | 逐条回退 DSH 端修复，**跑仓库自己的 vitest 套件** | 审计 §5 的回归测试是否始终为 true |

**变异副本结果摘录**（同一脚本，仅代码不同）：

```
H-1  FIXED : step 2 saved = ["ff4d…","9c84…"]   (两个成员都保留)
     MUTANT: step 2 saved = ["9c84…"]           (Alpha 被静默丢弃 ← 原缺陷复现)
H-2  FIXED : STEP 2 dropdown disabled = true     (Host 仍在轮换，UI 诚实)
     MUTANT: STEP 2 dropdown disabled = false    (一键解锁即出现"显示A计费B" ← 原缺陷复现)
H-4  FIXED : (a) tabCn/tabGlobal disabled = true during a pool save
     MUTANT: (a) tabCn/tabGlobal disabled = false
H-5  FIXED : 计数 已选 0/1、签到按钮禁用
     MUTANT(repo): "H-5 的批量测试" **仍然通过** ← 该测试始终为 true（见 §5）
```

---

## 2. 高危修复（6 条）

| 编号 | 声明 | 核查结论 | 反证尝试与证据 |
| --- | --- | --- | --- |
| **H-1** | `editDraft` 经 `savedRef` 在 updater 内取基准 | ✅ **已修复** | 组件渲染 + 两账号：`[]` → 勾 Alpha → 保存得 `["ff4d…"]` → **再勾 Beta** → 保存得 `["ff4d…","9c84…"]`（**两个成员都在**）。同脚本在回退版上得 `["9c84…"]`，Alpha 被静默丢弃 → 脚本有判别力。**StrictMode 下重新运行同样通过**。另验证 `useLayoutEffect` 版本：H-1 序列仍成立（§4.1） |
| **H-2** | `rotationLocked` 读已保存值 + `rotationUnlockPending` | ✅ **已修复** | 四步：①已保存轮换 ON → 下拉禁用、冲突提示在、徽标「自动轮换中」；②点「关闭自动轮换」（**仅改草稿**）→ **下拉仍禁用**、提示「保存后生效 —— 在那之前插件仍在轮换。」、Host 仍 `rotateByCredits=true`（**显示与计费一致**）；③「放弃修改」→ 回到锁定态，无残留；④改草稿+保存 → Host `false`、下拉解锁、冲突消失。回退版第②步下拉立刻可点 → 原缺陷复现。**用户提的"下拉一直禁用会不会困惑"：有显式提示 + 可点的保存按钮，不存在"点了没反应"** |
| **H-3** | `loader/volatile-update` 与启动都调用 `applyRotation` | ❌ **未完全修复（存在新竞态）** | 基本路径已修：启动即轮换 ✓；关池+提交事件后 override 清除 ✓；重新开启后恢复 ✓。**但修复引入新缺陷** → 详见 **§3.1** |
| **H-4** | tab 开关加入 `saving \|\| poolBusy`；两个保存按钮加入 `togglingRegion` | ✅ **已修复** | 组件渲染 + 慢速 `__save`（400ms）在途探测：(a) 池保存在途时 **cn 与 global 的 tab 开关都禁用**、模型保存按钮禁用；(b) 区域开关在途时 **池保存按钮禁用**、模型保存按钮禁用。回退版 (a)(b) 都露出缺口 → 脚本有判别力 |
| **H-5** | DSH 返回 `effectiveMemberAccountIds`，客户端据此计数与禁用 | ⚠️ **部分修复（测试按钮仍启用）** | 计数与签到按钮已修：`memberAccountIds:['ghost-id']` → 计数「已选 0 / 1」、签到按钮 `disabled=true`、已失效的成员记录提示出现。**但测试按钮仍用 `active.memberAccountIds.length`** → 复现见 **§3.2** |
| **H-6** | `resolveTargetModel` 新增 `'stale'`，stale 时省略 `modelId` | ✅ **已修复** | 五案例矩阵全部符合预期：目录内 id → `preferred`/按钮可用/200；目录外 → `stale`/`modelId` **省略**/按钮禁用/409 `reason=target-model-stale`；无 id+有免费 → `free`/200；无 id+无免费 → `none`/409 `no-free-model`；**目录从未加载 → `stale`**（fail-safe 方向正确） |

---

## 3. 未修复 / 新缺陷

### 3.1 【新缺陷】H-3 的修复引入 `applyRotation` 竞态 —— 旧 ON 覆盖新 OFF

`applyRotation` 现在挂在**每一次** settings 提交上，但它**不是可重入的**：它在入口处同步读取偏好（`poolPreferencesOf(current(), region)`），随后 `await poolMembersOf(region)`（对每个成员发一次 `fetchCredits`），**恢复后无条件** `store.setRotatedAccount(picked?.id)`。于是一个"轮换 ON"的旧调用可以在一个"OFF"的新调用**清空之后**才完成，把 override 又写回去。

**复现（真实挂载插件，`/tmp/fverify/t8_h3_race.mjs`、`t8b_h3_race_variants.mjs`）**：

```
1. startup                             : {rotate:true, enabled:true}
2. 提交 #1（仍 ON，改了间隔）→ 慢速 credits 读取在途
   提交 #2（rotateByCredits = false，更新）→ 立即清空 override
   right after the OFF commit          : {rotate:false}          ← 此刻是对的
3. after the slow re-rank settles      : rotatedTo = "ff4d…"    ← 旧 ON 又写回来了
VERDICT: 轮换已关，但运行时 override 仍在 —— 关池后 override 未清理的 H-3 症状重现
```

变体 B（更贴近用户操作，**用池总开关**）：

```
A) OFF then ON     -> rotatedTo = "ff4d…"（ON 更新，正确）
B) ON then pool OFF-> enabled = false | rotatedTo = "ff4d…"   ← 池已关，override 仍在
VERDICT B: STALE OVERRIDE SURVIVES A DISABLE
```

**用户可见后果**：用户开启轮换 → 紧接着关闭账号池（或关闭轮换）并保存，若前一次 re-rank 的网络读取尚未返回，则**界面显示池已关闭，实际计费仍走轮换账号**——正是 H-3 声称修好的那条「与 `poolEnabledHint` 的承诺冲突」。
**建议**：给 `applyRotation` 加一个 per-region 序号（或 generation 令牌）——恢复后若序号已过期就直接返回；清空分支也可标记"已显式关闭"。

这与 L-5 的"按请求顺序丢弃旧响应的检查"是同一类修法，可同批做。

### 3.2 【未修复】H-5 的测试按钮：已失效的成员记录仍可点，界面宣称完成但零请求

计数与**签到**按钮已用 `effectiveMembers`，但**测试**按钮仍判 `active.memberAccountIds.length === 0`（`AccountPool.tsx:627`），DSH 路由的 409 检查也只判 `preference.memberAccountIds.length === 0`（`web-status.ts`），因此"成员全是幽灵"这一状态**仍能进入批量路径**。

**复现（`/tmp/fverify/t1_h5_test.mjs`）**：`memberAccountIds: ['ghost-account-id']`、本机只有 1 个真实登录、有免费模型：

```
buttons before: [ '一键签到所有账号|disabled=true', '一键测试所有账号|disabled=false' ]   ← 测试按钮仍可用
点击「一键测试所有账号」后：
  log: 测试完成，已重新计算候选账号
       开始测试 1 个账号 × free
  upstream delta: 0            ← 零上游请求
  actionError: (none)          ← 无任何错误
```

即 **B-1 的原始症状（界面宣称完成、实际零请求）在测试路径上完整重现**。签到路径因按钮禁用而不可达（这是修复生效的部分）。
**建议**：测试按钮改用与签到按钮同一判据（`effectiveMembers.length === 0`），并把 DSH 路由的 `no-members` 检查改为基于**可解析成员**，这样即使有绕过客户端的老卡片也会被 409 挡住。

### 3.3 【未修复】C2-4 只修了 `to` 方向，`from` 方向仍渲染原始账号标识

`E-fix-log.md` 声称 C2-4 已修（`from` 空名套占位符）。实测**只有 `to` 分支**套了占位符；`from` 分支在"上一个轮换账号名为空"时渲染**24 位十六进制 id**。

**复现（`/tmp/fverify/t19b_c24.mjs`）**：本机有 Alpha 与一个**无昵称**账号，先轮到无昵称账号，再轮到 Alpha：

```
计费账号已从 668ab37ecdaf7ab9a9a7358f 切换到 Alpha      ← from 是裸 id（缺陷）
计费账号已从 — 切换到 未命名账号                          ← to 分支正确用了占位符
```

另发现同类瑕疵：**轮换停止**行也渲染原始账号标识 ——

```
轮换已停止 —— 回到 668ab37ecdaf7ab9a9a7358f             ← 应为「未命名账号」
```

（`AccountPool.tsx:381` 的 `nameOf(previous, pool) || previous` 在 `nameOf` 返回 `''` 时回退到 id。`||` 会对空字符串执行回退；这里的问题是回退值选成原始账号 id，因而仍把 id 显示给用户。）
**建议**：两处都改为 `nameOf(previous, pool) || t('row.accountUnnamed')`，与 `to` 分支完全一致。

### 3.4 【未修复】A-12 的占位项存在但**不可达**，且用户保存的失效 id 会被静默清空

`E-fix-log.md` 声称 A-12 已修（补 disabled「（已下架）」选项）。该选项**确实写进了代码**，但触发条件是 `active.targetModelId !== '' && !catalog.some(...)`。而 H-6 修复后，**Host 对 stale 目标不下发 `targetModelId`**（只在 `staleTargetModelId` 里给），于是：

**复现（`/tmp/fverify/t10b_a12.mjs`、`t27_a12_reach.mjs`）**：保存一个目录外 id → DSH 返回 `source='stale'`、`targetModelId=undefined`、`staleTargetModelId='gone-model'`：

```
select.value = ""                  ← 显示「自动」，而磁盘上保存的是 gone-model
options = "" (自动) | "free"
placeholder for the stale id present: false      ← 占位项没有渲染
```

即 **A-12 的原始症状（显示与存储值分叉）在 H-6 之后依然成立**，而新加的占位分支在当前契约下**不可能触发**（`targetModelId` 对 stale 恒为 `undefined`）。
另有一条我在探测中发现的**更危险**的路径：用户把一个**当前目录内**的模型选为草稿（未保存），随后目录刷新把它下架 → 下拉显示回落到首项「自动」，若用户此时保存，**存的就是 `''`，用户原来的选择被静默清空**（`t20_misc.mjs` (b) 实测：`before "gone-model"` → 保存后 `""`）。


**建议**：让客户端从 `staleTargetModelId` 取基准值渲染占位项（`active.targetModelId || pool.staleTargetModelId`），或让 Host 在 stale 时仍下发 `targetModelId` 而只靠 `source` 区分；两者取其一即可让显示与存储重新一致。

---

## 4. 专项复核

### 4.1 `savedRef` 的同步方式

- **原实现（渲染期赋值）**：`savedRef.current = saved` 写在渲染体内。这在 React 并发模式下确实不安全（被丢弃的渲染会把 ref 写成从未提交的树的值），该风险成立。
- **现实现（`useLayoutEffect`）**：我用**最新版本**重新运行了 H-1 全序列（含 StrictMode），通过。处理规则上也更稳：`useLayoutEffect` 在 commit 后**同步**执行，早于浏览器绘制，因此提交后的用户交互可读取同步后的引用。**没有发现新问题**。
- 一个**仍然存在**的残留窗口（**非本次声称修复项**，属 A-8 家族）：保存成功后 `discard()` 立即生效、而 `onSaved()` 的重读是异步的，两者之间界面会短暂回落到**保存前**的显示。使用 `t25_final.mjs` (3) 控制异步顺序后测得：写已实现（`Host members = ["ff4d…"]`）而界面仍显示「已选 0 / 2」，且此窗口内 `saving=false`、`siblingBusy=false`（控件可交互）。

  **该问题归入 A-8**，可与 M-4、L-5 一并处理。

### 4.2 H-4 的三个写入入口是否都阻止并发保存？有没有第四个写入者？

- **三个已知写入入口都已加入互斥检查**（§2 H-4 的双向探测）。
- **第四个写入者的候选：`switchAccount`**。它写的是 `accounts` 字段（`writeAccountSlot` → `__save` with `field:'accounts'`），与 `regions` **不是同一个顶层槽**，DSH 的 `{ ...current, ...incoming }` 在**字段**层合并，因此不会与池/模型保存互相回退。**实测确认**：池保存在途时切换账号，两个 `__save`（`["regions","accounts"]`）都正确完成，池成员与账号选择各自保留（`t6_4th_writer.mjs`）。

  → **不是第四个 regions 写入者**。
- 但它**共享同一个 Host 端点与同一条串行通道**，且**不受任何门控**：池保存在途时账号下拉仍可点（`t5_accounts_vs_regions.mjs`：`dropdown disabled = false`）。当前**不构成数据丢失**（字段隔离），属"门控清单不完整"的遗留的说明问题——`E-fix-log.md` 把写入者清单描述为已经覆盖所有入口，严格说**只对 `regions` 槽成立**。
- 全仓 `scope.set` / `writeField` 调用点已逐一核对：`account-selection.ts` 内 4 处（accounts ×1、regions ×3），`WorkBuddyCard.tsx` / `AccountPool.tsx` **无任何直接 `scope.set`**。→ **regions 槽确实只有三个写入者**。

### 4.3 模块级 Map（`logStore` / `rotationMemory`）的内存与正确性

- **跨卸载残留**：实测**存在且是有意的**（`t17_maps.mjs`：卸载卡片再挂载，同一 region 的历史仍在）。这正是 C2-1 的修复前提（没有它，折叠卡片就会丢历史并写假记录）。
- **区域隔离**：实测**成立**——cn 的历史不会出现在 global 标签页（`t17_maps.mjs`），跨区轮换记录也不串（`t14_c23.mjs`：global 日志不含 cn 的账号 id）。→ **C2-3 已修**。
- **内存上界**：`logStore` 每 region 最多 60 行、`rotationMemory` 每 region 一个对象、`checkinStateCache` 每 region 每账号一条。前两者具有固定上限；签到缓存的总量随账号数量变化，不能仅凭每账号一条证明固定内存上界，仍需核对账号移除后的清理。
- **"插件重载残留残留数据"**：**是真实存在的处理规则**（模块级 Map 在插件重新 `apply()` 时不会重置，因为模块缓存不清），但影响面为**每 region 60 行活动日志**与**一个 `last/primed` 标记**，且两者都只是显示层。最坏情况：重载后第一条轮换记录可能因 `primed=true` 而被跳过。**属可接受的设计取舍**，建议在注释里点明"进程内缓存、不随插件重载重置"。
- 未发现正确性缺陷。

---

## 5. 对 `tests/pool-e2e.spec.ts` 新增回归测试的审查（含变异副本实测）

仓库自带 584 个测试**全部通过**（`repo-mutant` 上执行完成整套件复核）。我用**逐条回退 Host 修复**的变异副本检验每条新测试是否真能判出缺陷：

| 测试 | 变异副本回退内容 | 结果 | 核查结论 |
| --- | --- | --- | --- |
| `H-5: reports EFFECTIVE membership` | 删掉 `effectiveMemberAccountIds` 下发 | **失败**（`undefined ≠ []`） | ✅ 有判别力 |
| **`H-5: the batch still refuses, and the ghost id is never touched`** | 同上（回退 H-5） | **仍然通过** | ❌ **始终为 true/无效测试** |
| `H-6: refuses a test whose saved target model left the catalog` | 回退 `resolveTargetModel` 校验 | **失败** | ✅ 有判别力 |
| `M-3: names the failure cause structurally` | 删掉两个 409 的 `reason` | **失败** | ✅ 有判别力 |
| `M-5: does not read check-in state while the pool is off` | 删掉池关闭跳过 | **失败** | ✅ 有判别力 |
| `M-5: caches check-in state across polls` | 删掉 TTL 缓存 | **失败** | ✅ 有判别力 |

**变异副本仍能通过测试的原因**：`H-5: the batch still refuses` 断言 `rows === []` 且 `upstream === 0`。但**已失效的账号 id 本来就解析不出凭据**，`poolMemberAccounts()` 过滤后为空 → 批量本来就不发任何请求。也就是说该测试断言的正是"修复**没有**改变的行为"，**与 `effectiveMemberAccountIds` 无关**；它在回退版上必然也通过。

你在自查里修掉的两个隔离问题（把 usage 面板的签到读取算进批量、断言增量必须为 0）**确实修对了方向**，但这条漏了同一类问题的另一面。


**建议**：把断言换成能区分的行为 —— 例如断言"点击测试按钮时按钮应处于 `disabled`"（这才能捕获 §3.2 的缺口），或断言 DSH 路由对"全部成员均失效"返回 409。

**这条测试通过，并不能排除 §3.2 的缺口。**

**覆盖面缺口**：新增回归测试只覆盖 H-5/H-6/M-3/M-5。**H-1 / H-2 / H-3 / H-4 这四个最高危（数据丢失、错误计费）没有任何自动化回归测试**——正是本轮最容易再退化的四条。建议至少把 H-1（两账号保存序列）与 H-2（未保存时下拉保持禁用）做成组件级测试；本报告的脚本可直接改造为测试用例（§8）。

---

## 6. 其余修复的核查结论（逐条）

| 编号 | 核查结论 | 证据（脚本） |
| --- | --- | --- |
| **M-3** 409 结构化 + 本地化 | ✅ 已修复 | `t19_c24_m3.mjs`：池关闭时点批量，界面渲染 `本区域的账号池是关闭的。请先启用并保存，再执行批量操作。`，**英文原文不再出现**，且与 zh 字典逐字一致 |
| **M-5** TTL 缓存 + 池关闭不读 | ✅ 已修复 | `t24_m5_clean.mjs`（3 账号）：池关时每次轮询 `checkin-activity-status` 仅 1 次（usage 文档自带的选中账号面板读，未按账号池成员分别查询）；池开时首轮 3 次（每成员一次），随后 0 次（TTL 生效）。变异副本回退后两条测试都失败 → 有判别力 |
| **M-9 / C4-3** `usable` 只算成员 | ✅ 已修复 | `t23_c43_clean.mjs`：唯一成员被限流、同时存在一个**未入池**账号 → 强制重读后「账号池里目前没有可用的账号」**正常出现**（回退前该警告永不出现）。**注意**：不重读时看不到（批量后界面不自动刷新，属 M-4） |
| **C2-1** 重挂载写假轮换记录 | ✅ 已修复 | `t25_final.mjs` (1)：**轮换已开启**时挂载卡片 → 日志为空；折叠后重新展开仍为空（`t13_rotationlog.mjs` 用标记法确认不是"销毁+新写"） |
| **C2-2** 回退不记录 / 同账号漏记 | ✅ 已修复 | `t13_rotationlog.mjs`：轮换停止写入「轮换已停止 —— 回到 …」；再次轮到**同一账号**也有新记录（旧代码会静默跳过） |
| **C2-3** 日志/ref 跨区泄漏 | ✅ 已修复 | `t14_c23.mjs`：cn 轮换记录不出现在 global 标签页日志中 |
| **C2-4** `from` 空名占位符 | ❌ **未修复（仅修了 `to` 方向）** | 见 §3.3 |
| **C1-1** 批量失败写日志 | ✅ 已修复 | `t15_cheap2.mjs`：500 响应 → 日志出现「批量操作失败 —— 没有执行：boom」（此前只有悬空的「开始…」） |
| **C1-3** 批处理中禁用清空 | ✅ 已修复 | `t26_clean.mjs`：批处理在途 `disabled = true`，结束后 `false` |
| **C4-2 / A-9** `targetLabel` 接入渲染 | ✅ 已修复 | `t10_cheap.mjs`：`preferred`→「你指定的模型：paid」；`free`→「自动选中的免费模型：free」；`none`→提示行。三条分支都真的渲染出来了 |
| **C4-5** 摘要自相矛盾 | ✅ 已修复 | 同上：`source='none'` 时摘要显示「目标模型 无免费模型」，与下方告警一致（`contradicts itself? false`） |
| **A-5** 保存中拒绝编辑 | ✅ 已修复 | `t16_a5.mjs`：保存中点击复选框 → 草稿不变（`已选 1 / 1` 保持），且 **React 的受控回写把 DOM 勾选态复位**，未留下"看着勾上了其实没有"的显示错误；保存写入完成后 DSH 与界面一致 |
| **A-11** `row.result.outcome` 校验 | ✅ 已修复 | `t15_cheap2.mjs`：桩化无 `result` 的行 → 渲染「Alpha：Host 未返回该账号的结果」、循环继续、**写出「测试完成」**，无 `TypeError` |
| **A-12** 失效占位项 | ❌ **未修复（不可达 + 静默清空）** | 见 §3.4 |
| **C4-7/8/9** 文案据实修正 | ✅ 已修复（抽验） | 文案与实现逐条对照一致（区域开关前置条件、第四种排除原因 `unusable`、token 过期并列排序键均已写入文案） |

---

## 7. 汇总

### 7.1 核查结论计数

| 核查结论 | 数量 | 条目 |
| --- | --- | --- |
| ✅ **已修复** | **17 个分组** | H-1、H-2、H-4、H-6、M-3、M-5、M-9/C4-3、C2-1、C2-2、C2-3、C1-1、C1-3、C4-2/A-9、C4-5、A-5、A-11、C4-7/8/9（其中 M-9 与 C4-3 为同一条） |
| ⚠️ **部分修复** | **1** | **H-5**（计数与签到按钮已修；**测试按钮仍启用 → 原症状可复现**） |
| ❌ **未修复** | **2** | **C2-4**（只修 `to` 方向，`from` 仍渲染原始账号标识）、**A-12**（占位项不可达；且失效 id 会被静默清空） |
| 🆕 **修复引入新缺陷** | **1** | **H-3**（`applyRotation` 竞态：旧 ON 覆盖新 OFF → 关池后 override 仍在，H-3 症状重现） |
| ⚪ **无法验证** | **0** | — |

### 7.2 修复范围与剩余问题

H-1 的两账号保存序列、H-2 的已保存配置判定、H-4 的三方互斥均通过独立复现。switchAccount 写入 accounts 字段，与 regions 槽隔离；实测并发保存时，两者的值均得到保留。

复核发现四项剩余问题：H-5 的测试按钮仍使用原始成员数；C2-4 的 from 分支仍显示账号标识；A-12 的占位项因旧值提前清空而不可达；H-3 在配置变化后可能被旧异步调用覆盖。

后续验证需要覆盖每个判断条件的所有入口，并检查新增分支的触发条件和异步函数的并发行为。H-5 的原测试只断言空结果与零请求，恢复缺陷后也能通过，应改为检查按钮禁用状态及 DSH 的有效成员判断。

**优先级建议**（按用户可感知的破坏力）：
1. **H-3 竞态**（界面说池已关，实际仍按轮换账号计费 —— 与 H-3 原缺陷同害，且更隐蔽）
2. **H-5 测试按钮**（界面宣称"测试完成"，实际零请求）
3. **A-12 静默清空**（用户保存的选择被抹掉，且无提示）
4. **C2-4 `from` 原始账号标识**（观感问题，改动最小）

---

## 8. 复现脚本与清理

全部脚本保存于 `/tmp/fverify/`（**仓库外**），按任务要求**已删除**。仓库内零残留：本会话唯一写入是本文件；`src/`、`tests/` 一字未改（哈希见 §1.1，与 E-fix-log 记录一致）。

**一个必须记录的事故与处置**：初版 harness **未隔离 `$DSH_HOME`**，导致被测插件把一条合成测试结果（`ff4d…: rate-limited`）写进了**真实的 `~/.dsh/.workbuddy-pool.cn.json`**。发现后立即：
① 备份现场（`/tmp/fverify/pool.cn.json.polluted-backup`）；
② 按时间戳分离出**唯一**由本会话添加的那条记录并删除，其余 7 条（06:27–06:42 写入，早于本会话）**逐字节保留**；
③ 给 harness 补上 `DSH_HOME`/`HOME`/`USERPROFILE`/`LOCALAPPDATA`/`APPDATA`/`XDG_CONFIG_HOME` 全部指向临时目录（与仓库 `vitest.config.ts:39` 的做法一致），之后所有结果均在隔离环境下重新运行。


`.workbuddy-pool.global.json` 与 `~/.dsh` 下其余文件未被本会话改动。

**重建配方（四个非显然要点，与 D 报告一致）**：

1. `/tmp/fverify/render` 里 `npm install react-dom@18.3.1 jsdom`，并把该目录的 `react` 换成指向仓库 `node_modules/react` 的 **symlink**（否则 hooks 双实例崩溃）。
2. `.tsx` 加载：`node:module` 的 `register()` 写 `load` 钩子，内部 `typescript.transpileModule(src, { jsx: JsxEmit.ReactJSX })`。
3. FakeSettings 的 `mutate` **必须就地写回** `apply()` 收到的那个 config 对象，否则 `current()` 看不到写入，H-1/H-3/H-5 全部失真。
4. 复选框用 `input.click()`（jsdom 会走 activation behavior）；数字/下拉框用原生 setter + `Simulate.change`；测试结果与 `current()` 都依赖 `$DSH_HOME`，**必须隔离**。

**变异副本做法**：`cp -R src <mutant>/src` + `ln -s <repo>/node_modules <mutant>/node_modules`，用脚本把修复逐条替换回缺陷版本，再以 `TREE=<mutant>` 跑同一脚本；`repo-mutant` 则是整仓副本（含 `tests/`），可直接 `vitest run`。
