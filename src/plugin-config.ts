/** 从 index.ts 按职责提取；参考来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */


import z from '@deepseek-ai/schemastery'

import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'

import type { WorkBuddyContextBudget, WorkBuddyModelInfo } from './catalog.ts'

import { type CliBridgeSettings } from './cli-bridge/mount.ts'

import type { WorkBuddyRegion } from './upstream.ts'

import { type WorkBuddyCreditPosition } from './status-paths.ts'
/** One region's model directory and the user's selection within it. */
export interface WorkBuddyRegionState {
  /**
   * Whether this region's provider is switched on. Opt-out: only an explicit
   * `false` disables it, so a config predating this switch keeps both providers
   * running. A disabled region is fully withdrawn from the harness — its adapter
   * route and its configurable-provider entry both hold zero routes, so it
   * disappears from DSH's model picker instead of lingering as an unselectable
   * row (see `syncRegionRegistration`).
   */
  enabled?: boolean
  /**
   * Whether this region's credit balance shows at the DSH sidebar foot.
   *
   * Per-region, independently switched: WB CN and WB AI are separate accounts
   * on separate gateways, so a user holding only one of them must be able to
   * show exactly that one. Opt-out — an absent value reads as ON, so a config
   * written before this switch existed keeps whatever the default was.
   */
  showCreditsInMainUi?: boolean
  /**
   * Whether the model may call the image-generation tool here (opt-IN).
   *
   * The only switch in this interface where an ABSENT value means OFF. Every
   * other flag here governs something the user can undo by clicking again;
   * this one authorizes the model to spend real credits on its own, so an
   * upgrade — or a config whose value could not be read — must leave it off.
   */
  imageToolEnabled?: boolean
  /**
   * Same opt-IN shape as `imageToolEnabled`, but for the video-generation tool
   * (`workbuddy_draw_video`). Absent means OFF, for the same reason: the model
   * decides to spend, so an upgrade must never hand out a spending capability.
   */
  videoToolEnabled?: boolean
  /**
   * The video model the user pinned in the card, keyed by video tag
   * (`text-to-video` / `image-to-video`), value is a model id from this
   * region's own catalog.
   *
   * Per-REGION and per-TAG on purpose: the two modes can be served by different
   * models (a catalog may carry a text-to-video-only row), and model ids do not
   * cross regions (CN publishes `kling-video-v3` and `minimax-video-h3`,
   * international only `kling-video-v3`). Absent or stale is NOT an error: the
   * tool falls back to the first model of the group, because a preference the
   * catalog no longer carries must not fail a generation the user asked for.
   */
  preferredVideoModels?: Record<string, string>
  /**
   * WHERE this region's credit readout sits (issue #62).
   *
   * Two seats, because the first one is not always available:
   *
   *   - `composer` — the composer row (`conversation.input.right`), shared
   *     with the shell's own controls. It is the closer, more glanceable seat,
   *     and it is the default so nothing moves for anyone who does not choose.
   *   - `stats` — the ambient dock below the composer card
   *     (`conversation.composer.dock`), where the shell renders its own
   *     round/step/token pills. That row is a LIST seat whose shipped occupant
   *     registers separately, so a third-party plugin that ALSO parks something
   *     in the composer row cannot crowd this readout out of existence.
   *
   * The report behind this (issue #62) was exactly that: with another plugin
   * installed, the readout vanished from the composer row. Making the seat a
   * choice is what keeps one plugin's presence from deciding another's.
   */
  creditPosition?: WorkBuddyCreditPosition
  /** The last-refreshed directory for this region; what the card displays. */
  lastCatalog?: WorkBuddyModelInfo[]
  /** The user's selection in this region, as model ids. */
  enabledModelIds?: string[]
  /**
   * Model ids the user opted into image input for this region.
   *
   * Every id here is honoured. What the SAVED array cannot express is the
   * difference between "I looked at this model and unticked it" and "this model
   * did not exist when the list was last refreshed" — so the runtime also adds
   * a model this build's vendor table classifies as verified-multimodal, UNLESS
   * {@link imageSelectionExplicit} says the user has edited these boxes. See
   * `effectiveImageIds` (issue #168); the seed never rewrites this array.
   */
  imageModelIds?: string[]
  /**
   * Whether the image boxes have been edited by a human (issue #168).
   *
   * `imageModelIds` alone cannot distinguish a DECISION from a leftover refresh
   * snapshot: the array is written both by the card's save (a judgement) and by
   * a catalog refresh (what the roster said on that day). Without that
   * distinction a model the roster gained after the last refresh was stamped
   * `multimodal: false` purely by its ABSENCE, `workBuddyModelInput` answered
   * `['text']`, and the host refused the attachment with
   * `MODEL_DOES_NOT_SUPPORT_IMAGES` — 「这个模型不支持图片」 — for a model the
   * plugin's own table calls verified-multimodal.
   *
   * `false`/absent means "nobody has chosen yet, so the table may fill the gaps";
   * a card save sets `true`, after which this array is the whole answer — which
   * is what keeps an explicit UNTICK of a verified-multimodal model from being
   * silently re-ticked on the next read.
   */
  imageSelectionExplicit?: boolean
  /**
   * Model ids whose `off` thinking level is offered (issue #34). Seeded from
   * the built-in rule (upstream declaration minus the models known to reject
   * `off`) when first read; the card's checkbox toggles membership.
   */
  offModelIds?: string[]
  /** Local DSH context budget per model in this region. */
  contextBudgets?: Record<string, WorkBuddyContextBudget>
  /**
   * The thinking tier each model runs on when a caller names none (issue #179).
   *
   * Keyed by model id because the vocabularies disagree across one roster (see
   * `regionStateConfig`'s declaration of the same field). An ABSENT key follows
   * the model's own upstream `defaultEffort` — the runtime answer is computed by
   * `defaultEffortFor` in `src/default-effort.ts`, which is the only place that
   * decides, and which refuses to name a tier the model does not declare.
   */
  defaultThinkingEfforts?: Record<string, string>
  /** This region's account-pool preferences (opt-in; see {@link WorkBuddyPoolPreferences}). */
  pool?: WorkBuddyPoolPreferences
}

/**
 * One region's account-pool preferences, as stored.
 *
 * Every field is a USER CHOICE, which is why the pool's measured facts are not
 * here: preferences are saved through the card's draft-and-discard path, and a
 * measurement living in the same slot would be rolled back by the next save.
 */
export interface WorkBuddyPoolPreferences {
  /**
   * Whether the pool is active for this region — which now means the
   * FAILOVER switch, not a credit ranking.
   *
   * Opt-in: default false. While on, a chat request that fails upstream is
   * retried against the other usable members of this region's pool, in order,
   * until one serves it or none is left (see `src/shim.ts`). While off the
   * plugin behaves exactly as it did before the pool existed: the account the
   * user selected serves every request, and a failure is reported as-is.
   *
   * It deliberately does NOT change the SAVED selection: while on, the pool
   * picks the serving account for every request (`applyPoolSelection` ranks
   * the usable members and sets a per-request override), but that override is
   * per-request borrowing — turning the pool off hands every request back to
   * the account the user chose, and the card can keep reporting who really
   * served. (An older version of this comment said the pool "does NOT change
   * which account serves NEXT", which was wrong the moment `applyPoolSelection`
   * started ranking on every request; what never changes is the saved choice.)
   */
  enabled?: boolean
  /** Model id to test; `''` means auto-pick a free model from this region. */
  targetModelId?: string
  /**
   * Per-account override of {@link targetModelId}, keyed by account id (#61).
   *
   * `6004` is an ACCOUNT × MODEL condition, so "can this account serve" has no
   * single answer: the reporter measured two accounts where one model answered
   * and another returned `429 / 6004` in the same second. The region-wide target
   * stays the default — this map only says "for THIS account, test THAT model",
   * which is what makes the pool's verdict match the model the user is actually
   * chatting with. An id that is no longer in the catalog is reported as stale
   * rather than replaced, so no credits are spent on a model nobody chose.
   */
  /**
   * How much input a probe sends, in tokens — the pool's biggest single knob.
   *
   * The upstream's rate limit (6004) fires on request SIZE, and the threshold
   * was measured to sit between 20k and 30k tokens. The probe has to be sized
   * near where the user's REAL conversations land: too small and it reports
   * "usable" while every long conversation is refused (the exact false positive
   * that made this knob necessary), too large and it costs real credit on every
   * batch AND excludes accounts that would have served the shorter requests the
   * user actually sends.
   *
   * A fixed value therefore cannot be right for everyone — the right size is a
   * property of the user's own traffic, which only they know. `undefined` keeps
   * the measured default ({@link DEFAULT_PROBE_INPUT_TOKENS}), so an existing
   * profile is unaffected.
   */
  probeInputTokens?: number
  /**
   * The account ids checked into this region's pool.
   *
   * An EXPLICIT opt-in, and empty by default: the batch actions claim rewards
   * and spend credits on real accounts, so membership is the user's decision
   * rather than a consequence of which sign-ins happen to exist. Empty means
   * the pool covers nothing and both buttons stay disabled.
   */
  memberAccountIds?: string[]
  /**
   * The user's hand-ordered pool order, as a list of account ids.
   *
   * SEPARATE FROM MEMBERSHIP: this is purely a display/preference of what the
   * user wants the pool to prefer, and it is independent of which accounts are
   * checked in. An id here need not be in {@link memberAccountIds} — the
   * ranking only consults this order for accounts that are actually members,
   * and ids that are not listed simply sort last. Keeping them separate lets
   * the user reorder first and check accounts in later without the ordering
   * being destroyed by an unrelated membership edit (see `poolPreferencesOf`,
   * which must always carry this list through alongside membership). Ids that
   * no longer resolve to a listed account are dropped on transmit, never
   * silently merged into membership.
   */
  orderAccountIds?: string[]
  /**
   * Whether the plugin claims the daily check-in by itself (issue #191).
   *
   * OFF by default. Claiming a daily reward is a real WRITE on the user's
   * account, and this plugin deliberately shipped without an automatic
   * check-in so it would never make that decision on someone's behalf. The
   * reasoning still holds — what changed is that the user can now make that
   * decision once and have it honoured.
   *
   * Only the CN region has a check-in, so the card hides the switch elsewhere
   * and the runner refuses to start there.
   */
  autoCheckin?: boolean
}

/** Plugin configuration. */
export interface Config {
  /** Explicit WorkBuddy desktop auth-file path, overriding env and platform defaults. */
  authFile?: string
  /**
   * @deprecated Legacy single-slot account selector from before the dual
   * provider split. It is attributed to whichever region the account actually
   * belongs to (resolved once at startup from the local account scan); new
   * writes go to {@link Config.accounts}.
   */
  accountId?: string
  /**
   * Per-region account selections, keyed `cn` | `global`. Each region's tab
   * writes its own slot; tokens remain outside settings.
   */
  accounts?: Partial<Record<WorkBuddyRegion, string>>
  /**
   * Per-region model state, keyed `cn` | `global`. The CN app and the
   * international WorkBuddy AI app expose different rosters, so each keeps its
   * own directory and selection and switching accounts never drops the other
   * region's picks.
   */
  regions?: Partial<Record<WorkBuddyRegion, WorkBuddyRegionState>>
  /**
   * @deprecated Legacy single-slot fields from before the region split. They
   * predate international support and are read as the CN region's state when
   * `regions.cn` is absent; new writes go to `regions`.
   */
  lastCatalog?: WorkBuddyModelInfo[]
  /** @deprecated See {@link Config.lastCatalog}. */
  enabledModelIds?: string[]
  /** @deprecated See {@link Config.lastCatalog}. */
  imageModelIds?: string[]
  /** @deprecated See {@link Config.lastCatalog}. */
  contextBudgets?: Record<string, WorkBuddyContextBudget>
  /**
   * The optional CLI route: let the locally signed-in CodeBuddy CLI do the work
   * in a separate agent instead of proxying the gateway.
   *
   * It is OFF by default and completely independent of the provider stacks, so a
   * config that never mentions it behaves exactly as before. This is a
   * client-fingerprint workaround, not an account one — see `cli-bridge/runner`.
   */
  cliBridge?: CliBridgeSettings
  /**
   * Put the WorkBuddy panel in the DSH sidebar (opt-IN, PR #188).
   *
   * OFF by default, like every other optional surface this plugin adds: the
   * panel claims a GLOBAL seat (`sidebar.panellist` row + `main` page) that
   * every bundle shares, so switching it on is a decision about the user's
   * whole sidebar rather than a preference about this card. An absent value
   * therefore reads as off, and an upgrade must never re-arrange a sidebar
   * nobody asked to change.
   *
   * The settings card is unaffected either way: this only adds a second door to
   * the same content, and the Plugins page keeps the first one.
   */
  sidebarPanel?: boolean
  /**
   * When scanned messages are perturbed with invisible characters.
   *
   * `failure` (default) learns from a successful channel-gate rescue and starts
   * later requests with the learned form; `always` starts every request with
   * the dense form for a gateway whose plain attempt is a guaranteed refusal;
   * `off` keeps only the post-failure rescue ladder.
   */
  channelPerturbation?: 'off' | 'failure' | 'always'
  /**
   * 请求头中的客户端标识档位（`docs/DEVICE-IDENTITY-AUDIT.md` 的 P1）。
   *
   * `balanced`（默认）让每一条发出的请求说同一种话：`X-Product` / `X-IDE-Name` /
   * `X-IDE-Type` 同值 `WorkBuddy`，加 `X-Agent-Purpose`、`X-CodeBuddy-Request`、
   * `Accept-Language`、`X-Root-Request-ID`，以及按账号派生的一对
   * `X-Machine-ID` / `X-Session-ID`；billing 域补齐 UA / Origin / Referer。
   *
   * `conservative` 逐字节还原 5.16.0：**连 `X-Product: SaaS` 这个改名前的值也还原**，
   * 因为"回退了但没完全回退"会造出第三个从未上线过的形状，排查时最误导人。
   *
   * 为什么默认已经是 `balanced`：P0.5 的对照实验（2026-10-31）证实这组头有效。
   * 留这一档不是为了默认值，是为了让"某台机器上某个账号忽然不行了"能先换档排除，
   * 而不必先回滚一个版本。
   */
  wireProfile?: 'conservative' | 'balanced'
  /**
   * SDK 功能的**总开关**（默认开）。
   *
   * 关掉之后：不发现 SDK 目录、不起取 token 的子进程、不后台预热——真实值档因此
   * 永远取不到 token。这是"我根本不想让这个插件碰桌面端的原生模块"的那条退路：
   * 在此之前这项能力是无条件启动的，一个只想用虚拟值档的人也照样每 10 分钟付一次
   * 子进程与一次风控取数。
   *
   * 与「取不到真实设备时退回虚拟值」不是一回事：那个管**取不到时怎么办**（落在设备
   * 设置文件里），这个管**要不要去取**。两者都关时真实值档零设备头；总开关关而回退
   * 开时，退到虚拟值。
   *
   * 关掉不影响虚拟值档：派生值全靠本机盐，与 SDK 无关。
   */
  deviceSdkEnabled?: boolean
  /**
   * 外部设备 token（`docs/DEVICE-IDENTITY-AUDIT.md` 的 P2）。
   *
   * 只收**文件**，不收内联字符串：token 是分钟级过期的，写在配置里的值十分钟后
   * 就是死值，只能靠人改配置——那条路只在一次性排障里成立。文件可以由 A 自己的
   * `.turing_token_cache.json`、一个 cron 或任何脚本刷新，插件按 `ttlMs` 重读。
   *
   * 文件支持两种形状：裸 token，或 A 的 `{"token":"v3:…","ts":…}` 信封。上限
   * 4 KB（A 实测 1210 字符，B 的 1 KB 上限会把它误杀成"没配"）。
   *
   * 读不到时**不发送该头**并记一条 warn，绝不回退成临时造一个 token。只在
   * `wireProfile: 'balanced'` 下生效——`conservative` 的契约是逐字节等于 5.16.0。
   */
  deviceToken?: {
    /**
     * token 文件的绝对路径（支持 `~`）。空 = 不启用。
     *
     * 指向 A 的缓存文件即可直接复用它的设备身份，不需要额外脚本。
     */
    file?: string
    /** 重读周期，默认 5 分钟。token 本身约 10 分钟过期。 */
    ttlMs?: number
  }
  /**
   * Adopt the official client's usage-page identity on chat requests (issue #132).
   *
   * 2026-10-31（P1）：`X-IDE-*` 从这里搬到了 {@link Config.wireProfile} 的
   * `balanced` 档（它属于"客户端是谁"，而那一层现在整体统一）。这条开关**现在
   * 只管 id 的格式**：把会话身份三连换成官方客户端用的 32 位十六进制 UUIDv7，并
   * 补一个镜像消息 id 的 `X-Request-ID`。Off by default：它是 reporter 测的、
   * 本插件未复现的显示对齐，不该成为某个账号开始失败的理由。
   */
  usageIdentity?: boolean
  /**
   * Move the harness's injected context above the real prompt (issue #132).
   *
   * The WorkBuddy usage page records the last `user` message as the request
   * text, and DSH appends its runtime context after the user's prompt — so the
   * usage column shows the injected block instead of what the user typed. The
   * reorder is order-only and matches only the harness's own injected prefixes.
   *
   * Off by default: it changes the message order the upstream counts, so it is
   * an explicit opt-in rather than a silent change on upgrade.
   */
  keepPromptLast?: boolean
  /**
   * Extra literal prefixes (issue #133) treated like the harness's injected
   * context markers when `keepPromptLast` is on, for injected blocks a
   * companion plugin produces that the built-in list does not recognize. Each
   * entry is matched literally at the start of a trailing `user` message.
   */
  extraInjectedPrefixes?: string[]
  /**
   * Drop foreign thinking blocks pi-ai would publish as prose (issue #147).
   *
   * When a session moves between providers, `dsh-llm-pi-ai` rebuilds the other
   * provider's assistant turns with `api: 'dsh-foreign'`, and pi-ai's
   * `isSameModel` then fails — so it does not DROP their `thinking` blocks, it
   * rewrites each one to plain `text` (`transform-messages.js:87–90`). The
   * other model's working notes therefore arrive as this turn's answer, and the
   * model copies that shape on every later turn.
   *
   * On, those blocks are removed from the request instead: they carry no
   * `thinkingSignature` (the host builds them without one), so they could never
   * be replayed as reasoning anyway — their only possible contribution to the
   * wire was the prose they turned into. Text blocks and tool calls are
   * untouched, and so is every message's identity.
   *
   * OFF by default: it changes bytes the upstream counts, so it is an explicit
   * opt-in on the same rule as {@link Config.usageIdentity}.
   */
  dropForeignThinking?: boolean
  /**
   * Move the host's session-title request onto the hidden lightweight model
   * (issues #132/#133). Off by default: it is a real upstream request either
   * way, and the rewrite changes which bucket it is billed against.
   */
  sessionTitle?: {
    /**
     * Whether title requests are re-pointed at {@link sessionTitle.model}.
     * The host still fires the request exactly once per new session; the
     * reporter measured the lightweight model at 0 credits for these calls
     * (request volume still counts, and the evidence is reporter-level, not
     * reproduced by this plugin).
     */
    enabled?: boolean
    /**
     * Target model for the rewritten title request. Defaults to `wb-lite`,
     * the hidden model the reporter measured; configurable in case the id
     * changes or a region exposes a different one.
     */
    model?: string
  }
  /**
   * 被网关渠道校验拦截（`channel_reject` / 11128）之后自动再发一次「继续」，
   * 可选、有上限。默认关闭。
   *
   * 这条失败**不换号也不重试**（`isFailoverWorthy` 刻意把它排除在外：网关匹配的
   * 是消息开头，换账号只会每个账号白烧一次请求），所以这一轮就此结束，用户看到的
   * 是「本轮运行失败400: … 被网关的渠道校验拦截 …」。固定指纹由 `prepareChatBody`
   * 的按句改词处理；这条开关只是**最后一次恢复尝试**：只有被拒内容刚好随轮次变化的窄情况
   * 才可能靠新回合碰过去。固定 system 指纹每轮相同，重发也救不了（#163 实测）。
   *
   * 默认关闭的理由与 {@link Config.usageIdentity} 相同：它会在用户没有发消息的
   * 情况下花掉真实请求，属于必须显式授权的开销。上限默认 1 次：1 次救不了，3 次也
   * 救不了，旧默认 3 只会把同一个 400 付三遍。
   */
  channelRejectContinue?: {
    /**
     * 是否启用自动续发。只有显式 `true` 才算开启。
     */
    enabled?: boolean
    /**
     * 连续自动续发的次数上限（默认 1，夹在 1..10）。
     *
     * 「连续」是关键：一次成功回合、或者用户自己发了一条消息，计数立刻清零。
     * 所以上限拦的是「一直过不去就一直试」，而不是这个会话一生的总次数。
     */
    maxConsecutive?: number
    /**
     * 续发时发送的文本，默认「继续」。
     */
    text?: string
  }
}

const modelConfig = z.object({
  id: z.string().required(),
  name: z.string().required(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
})

/**
 * One region's account-pool PREFERENCES.
 *
 * Only user choices live here. The pool's MEASURED facts (probe outcomes,
 * cooldowns, the account currently billed) are deliberately NOT part of this
 * schema — see `src/account-pool-store.ts`. The card saves preferences with a
 * draft-and-discard write, so storing measurements in the same slot would let
 * one "Save" press overwrite results the timer had just written.
 */
const poolConfig = z.object({
  enabled: z.boolean().default(false).description('Whether this region\'s account pool is active (opt-in). While on, a failed chat request is retried against the other usable pool members before the error is reported.'),
  targetModelId: z.string().default('').description('Model id to test; empty means pick a zero-multiplier model from this region\'s catalog'),
  /**
   * Sizing of the test probe, as a token count the user picks from a fixed set.
   *
   * A closed set rather than a free number: each step is a meaningful position
   * relative to the measured 20k~30k threshold, and an arbitrary value would
   * invite a size that is neither safely under nor clearly over it. `0` (and any
   * unknown value) falls back to the measured default, so a profile written by
   * an older build — and one hand-edited to something odd — behaves identically.
   */
  probeInputTokens: z.number().step(1).default(0).description('Input tokens each test probe sends: 10000 / 20000 / 30000 / 50000 / 100000. Bigger probes catch a rate limit real conversations would hit, but cost more credit per test and may mark an account unusable for large requests only. 0 uses the measured default (25000)'),
  memberAccountIds: z.array(z.string()).default([]).description('Account ids checked into this pool (opt-in; empty means the pool covers nothing)'),
  /**
   * Whether the plugin claims the daily check-in by itself (opt-IN, default off).
   *
   * OFF BY DEFAULT, and that is the whole design (issue #191). Claiming a daily
   * reward is a real WRITE on the user's account, and this plugin shipped with no
   * automatic check-in precisely so it would never make that decision for
   * someone. The reasoning still holds — what changed is that the user can now
   * make the decision once and have it honoured.
   *
   * The alternative was worse than it looks: a missed day resets the streak to
   * zero (the reporter was at 32), and the claim costs no credits and is
   * idempotent upstream. So the trade is "one switch" against "a 32-day streak
   * lost to a weekend".
   *
   * Only the CN region has a check-in; the switch is hidden elsewhere and the
   * runner refuses to start there, so a hand-edited profile cannot make the
   * background path spend a request per account per day learning a refusal.
   */
  autoCheckin: z.boolean().default(false).description('Claim the daily check-in automatically for the accounts checked into this pool (opt-in). Idempotent: an account already checked in today is reported, never re-claimed. Only the CN region has a daily check-in.'),
  orderAccountIds: z.array(z.string()).default([]).description('The user\'s hand-ordered pool order, as account ids. Independent of membership: an id need not be checked in (it only takes effect once the account is a member), and ids not listed sort last. Separate from memberAccountIds so reordering never conflicts with, or is destroyed by, a membership edit.'),
})

const regionStateConfig = z.object({
  enabled: z.boolean().default(true).description('Whether this region\'s provider is offered to DSH (opt-out; false withdraws it entirely)'),
  /**
   * Whether this region's credit line shows at the DSH sidebar foot.
   *
   * Per-REGION rather than one global switch, because the two sides are
   * independent providers the user may hold only one account on: a CN-only user
   * has nothing to read from the international line and vice versa, and a
   * single shared switch would force them to either show a permanently empty
   * row or lose the one that works.
   *
   * ON by default (opt-out). The plugin card is not reachable in every host —
   * a market plugin can own the Plugins tab and never render
   * `plugins.bundle.config` — so a feature that is off until discovered would be
   * off forever for those users. The line carries its own `×` in the sidebar,
   * which is reachable exactly where the feature renders.
   */
  showCreditsInMainUi: z.boolean().default(true).description('Show this region\'s remaining credits at the DSH sidebar foot (opt-out; the line carries its own hide button)'),
  creditPosition: z.union([z.const('composer'), z.const('stats')]).default('composer').description('Where the credit readout sits: "composer" = the composer tool row (default), "stats" = the ambient row below the composer card, next to the shell\'s own token pills. Choose "stats" if another plugin occupies the composer row.'),
  lastCatalog: z.array(modelConfig).default([]),
  enabledModelIds: z.array(z.string()).default([]),
  imageModelIds: z.array(z.string()).default([]),
  /**
   * Whether the model may call the image-generation tool (opt-IN, default off).
   *
   * Per-REGION like the credit switches, and it now means the same thing on both
   * tabs: each region's catalog carries its own `text-to-image` model (CN
   * `hunyuan-image-alpha`, international `hy-image-3.5`; measured 2026-10-25,
   * see `docs/IMAGE_GEN.md`). Whichever region is switched on AND opted in owns
   * the tool; CN wins when both qualify (see `imageToolRegionOf`).
   *
   * Every other spending path in this plugin requires a human action: a chat
   * request is one the user sent, and the per-model "test" button is one the
   * user clicked. `workbuddy_draw_image` is the first capability where the
   * MODEL decides to spend — it calls the tool on its own, at about 5.71 credits
   * an image on CN and 0.03 on the international gateway (measured, not a price
   * list: the media catalog carries no cost, so the tool reports the
   * `usage.credit` the upstream actually settles), and there is no per-call
   * approval seam in the host to ask the user first (`needsApproval` /
   * `toolApproval` do not exist; verified against the shipped `app.asar`).
   *
   * So it is opt-in, the same way the account pool's credit-based rotation is
   * opt-in (3.0.0's reasoning): a feature that can move money on its own must be
   * one the user switched on, not one that arrives with an upgrade. Off also
   * means that region contributes nothing, and with no opted-in region at all
   * the tool is not REGISTERED, so the model never sees it and cannot attempt a
   * call that would be refused.
   */
  imageToolEnabled: z.boolean().default(false).description('Let the model call workbuddy_draw_image on its own (opt-in; an image costs ~5.71 credits on the CN gateway and ~0.03 on the international one, and there is no per-call approval). Off by default, and off means no region registers the tool at all.'),
  /**
   * Whether the model may call the video-generation tool (opt-IN, default off).
   * Per-REGION like `imageToolEnabled`, gated the same way: the region must be
   * switched on AND the user must opt in. CN wins when both qualify. A video
   * costs real credits per generation and the task runs tens of seconds to
   * minutes, so no per-call approval exists in the host — hence opt-in.
   */
  videoToolEnabled: z.boolean().default(false).description('Let the model call workbuddy_draw_video on its own (opt-in; a video is an async task that costs WorkBuddy credits and runs tens of seconds to minutes). Off by default, and off means no region registers the tool at all.'),
  /**
   * The video model pinned for one tag (`text-to-video` / `image-to-video`),
   * as a model id from THIS region's catalog.
   *
   * Written by the card's per-mode picker. The tool reads it only when the call
   * itself did not name a model, and falls back to the group's first model when
   * the pinned id is no longer in this region's directory — see
   * `preferredVideoModel` in `src/video-tool.ts`.
   */
  preferredVideoModels: z.dict(z.string()).default({}).description('Video model pinned per tag ("text-to-video"/"image-to-video"), as a model id from this region catalog. Used only when a tool call names no model.'),
  /**
   * Per-model override of whether thinking `off` is offered, keyed by model id
   * (issue #34). An ABSENT key means "use the built-in rule" — the upstream's
   * `canDisableThinking` declaration minus the ids known to refuse `off` (see
   * `src/off-thinking.ts`).
   *
   * Seeded from {@link defaultOffModelIds} on first read so the checkbox is
   * ticked correctly without the user having to save.
   */
  offModelIds: z.array(z.string()).default([]).description('Model ids whose "off" thinking level is offered; seeded from the built-in rule when first read.'),
  /**
   * Whether a human has edited the image boxes (issue #168). `false` lets the
   * vendor-verified table fill ids the saved array does not mention; `true`
   * makes `imageModelIds` the whole answer, so an explicit untick sticks.
   */
  imageSelectionExplicit: z.boolean().default(false),
  contextBudgets: z.dict(z.number().step(1).min(1)).default({}),
  /**
   * The thinking tier each model runs on when a caller names none (issue #179).
   *
   * Keyed by model id because the tier VOCABULARY is per model, not per route:
   * the live CN roster carries `low/high/max` (deepseek, glm-5.3), `high/xhigh`
   * (glm-5.2, deepseek-v4-pro), `low/medium/high` (step-5-preview) and five
   * tiers on `space-bunny` / `minimax-m3.1-flash`. A single route-wide default —
   * the `WORKBUDDY_DEFAULT_EFFORT` constant this replaces — therefore cannot be
   * right for more than a subset of the roster, and naming a tier a model does
   * not have is a hard `UNSUPPORTED_REASONING_EFFORT` (issue #90).
   *
   * An ABSENT key means "follow this model's own upstream `defaultEffort`",
   * which the great majority of the live catalog declares (measured 2026-10-30:
   * `high` on thirteen of fifteen, `max` on the two five-tier ones) — and where
   * the upstream declares none, "follow this model's own MIDDLE tier", never its
   * weakest one (qoder 518ecbb's rule; see `src/default-effort.ts`). That is NOT
   * the same as "no opinion": the adapter must still pin SOMETHING for the request
   * paths that name no tier, and issue #83 is the record of what happens when
   * that is left to pi-ai's level map — it filled in `off`, the upstream answers
   * 400 / 11133, and `/compact` failed.
   *
   * `off` is deliberately absent from this field's vocabulary: whether a model
   * offers `off` is `offModelIds`' decision (issue #34), and letting both own it
   * would give one question two answers that can disagree.
   */
  defaultThinkingEfforts: z.dict(z.string()).default({}),
  pool: poolConfig.default({}),
})

const accountSelectionConfig = z.object({
  cn: z.string().description('Selected domestic (CN) account id (never a token)'),
  global: z.string().description('Selected international account id (never a token)'),
})

/**
 * Mark a schema's field as volatile on the DSH lines that support it.
 *
 * `volatile()` exists from schemastery 3.18.3 (the DSH 0.1.7 line, which is the
 * only line whose settings write gate reads the marker). Older pinning (3.18.2,
 * the 0.1.5 line) has no such method, and the schema must stay byte-identical to
 * the unmarked original there: hand-writing `meta.volatile = true` would bypass
 * schemastery's own validateVolatileSchema checks and produce a schema no 0.1.5
 * consumer understands — so on that line this degrades to an identity no-op.
 *
 * Exported so BOTH arms are testable on any machine. The capability is decided
 * by whichever schemastery the dependency tree resolves, so without a seam the
 * no-op arm would silently stop being exercised the moment the pinned version
 * moved up — which is exactly how the volatile-path defect below went unseen.
 */
export function asVolatile<T>(schema: z<T>): z<T> {
  if (typeof (schema as unknown as { volatile?: () => z<T> }).volatile === 'function') {
    return (schema as unknown as { volatile: () => z<T> }).volatile()
  }
  return schema
}

export function unwrapVolatile<T>(value: T): T {
  if (value !== null && typeof value === 'object' && 'get' in (value as object) && typeof (value as any).get === 'function') {
    return (value as any).get()
  }
  return value
}

/**
 * Deep copy of a config value with every `{get(): T}` live reference replaced
 * by the value it resolves to.
 *
 * {@link unwrapVolatile} only peels the ONE level a caller reads, which is all
 * the ordinary read paths need. Handing a config object to a settings service
 * is different: the service validates and `structuredClone`s the WHOLE object,
 * so a reference surviving anywhere inside it fails schema validation with a
 * message that names the field but not the cause —
 * `$.authFile expected string but got [object Object]`.
 *
 * That is exactly what happened on the 0.1.5 line once volatile marking became
 * active: `installSection` received the raw config, whose volatile fields were
 * live references, and every field it validated threw. The namespace never
 * registered, so the card's settings silently disappeared.
 *
 * The implementation now lives in the node-free host<->client bridge, because
 * the browser half needs the SAME unwrap before it spreads a resolved field —
 * spreading a live reference is `{get: <function>}`, which drops every sibling
 * region. It is imported and re-exported from here so the Host entry keeps
 * exposing it as part of its public API.
 */

const cliBridgeConfig = z.object({
  enabled: z.boolean().default(false).description(
    'Mount the optional CodeBuddy CLI route (tool codebuddy_ask + /codebuddy). Off by default; '
    + 'the provider stacks are unaffected either way.',
  ),
  binary: z.string().default('').description(
    'Absolute path to the CodeBuddy CLI JS entry (the package\'s bin/codebuddy, not its .cmd shim). '
    + 'Empty means auto-detect in the usual global npm/pnpm/yarn/volta/nvm/fnm locations. '
    + 'There is deliberately no fallback to whatever "codebuddy" is on PATH.',
  ),
  model: z.string().default('').description(
    'Model id passed as --model. Empty means the CLI\'s own configured default.',
  ),
  permissionMode: z.string().default('dontAsk').description(
    'Permission mode passed as --permission-mode: dontAsk (default: read tools allowed, writes refused, never blocks), '
    + 'plan / default / auto, acceptEdits (may edit files), or bypassPermissions (allows everything).',
  ),
  effort: z.string().default('').description(
    'Reasoning effort passed as --effort: minimal, low, medium, high, xhigh or max. Empty means unset.',
  ),
  maxTurns: z.number().step(1).min(1).default(10).description(
    'Agent turn budget for one bridged call. Clamped to 100.',
  ),
  timeoutSecs: z.number().step(1).min(1).default(900).description(
    'Wall-clock budget for one bridged call, in seconds. Clamped to 1800.',
  ),
  regionOrder: z.string().default('cn,global').description(
    'Credential region preference for the CLI, comma separated. Domestic tokens are accepted by '
    + 'copilot.tencent.com; global tokens are refused there with 401.',
  ),
  workingDir: z.string().default('').description(
    'Default working directory for a bridged call when the caller names none. Must exist and be a directory. '
    + 'Empty means a call has to name one (or come from a session that has one).',
  ),
  allowedDirs: z.string().default('').description(
    'Extra roots a bridged call may be pointed at, comma separated absolute paths. A call can always run '
    + 'inside its own session workspace; anything else has to be listed here. Empty means only the session workspace.',
  ),
  appendSystemPrompt: z.string().default('').description(
    'Extra system prompt appended to every bridged call. Passed as --append-system-prompt, never through a shell.',
  ),
  allowUnattended: z.boolean().default(false).description(
    'Allow a bridged call with no directory at all to run in a throwaway temp directory. '
    + 'Off by default: an agent that can edit files should not be aimed at a directory nobody chose.',
  ),
  maxReplyChars: z.number().step(1).min(1).default(60_000).description(
    'Reply length cap handed back to the model, in characters. Clamped to 400000.',
  ),
  injectResult: z.boolean().default(true).description(
    'Hand a successful /codebuddy result to the session model so the conversation knows about it. '
    + 'That wake-up costs a real DSH turn; set false to keep results purely local.',
  ),
  sessionContinuity: z.string().default('auto').description(
    'Whether a second /codebuddy (or codebuddy_ask) in the same session continues the previous CodeBuddy '
    + 'conversation: auto (default) resumes it via --session-id, off starts a fresh one every time. '
    + 'An explicit session_id argument always wins over this setting.',
  ),
  maxTurnsPerSessionHour: z.number().step(1).min(0).default(6).description(
    'Bridged calls allowed per hour in one session. 0 disables the limit.',
  ),
  maxTurnsPerHour: z.number().step(1).min(0).default(20).description(
    'Bridged calls allowed per hour across the whole process. 0 disables the limit.',
  ),
})

export const Config: z<Config> = z.object({
  authFile: asVolatile(z.string().description('WorkBuddy desktop auth file (defaults to the app\'s own location)')),
  accountId: z.string().description('Deprecated: pre-split account selector, attributed to its own region'),
  accounts: asVolatile(accountSelectionConfig.default({} as any).description('Per-region account selections, keyed cn | global')) as z<Partial<Record<WorkBuddyRegion, string>>>,
  regions: asVolatile(z.dict(regionStateConfig).default({}).description('Per-region model directory and selection, keyed cn | global')),
  lastCatalog: z.array(modelConfig).description('Deprecated: pre-region-split CN model directory') as z<WorkBuddyModelInfo[]>,
  enabledModelIds: z.array(z.string()).default([]).description('Deprecated: pre-region-split CN selection'),
  imageModelIds: z.array(z.string()).default([]).description('Deprecated: pre-region-split CN image opt-in'),
  contextBudgets: z.dict(z.number().step(1).min(1)).default({}).description('Deprecated: pre-region-split CN context budgets'),
  // Volatile: a user turning the route on or retuning its budget should not need
  // a full plugin reload (which disposes both provider stacks and drops every
  // in-flight request). The mount listens for `loader/volatile-update` and
  // rebuilds only when the serialized settings actually changed.
  cliBridge: asVolatile(
    cliBridgeConfig.default({} as any).description('Optional CodeBuddy CLI route; off by default and independent of the providers'),
  ) as unknown as z<CliBridgeSettings>,
  // Volatile for the same reason as the block above: the browser card's switch
  // writes it, and a full plugin reload (which disposes both provider stacks and
  // drops in-flight requests) would be a wildly disproportionate price for
  // adding one nav row.
  sidebarPanel: asVolatile(
    z.boolean()
      .default(false)
      .description('Add a WorkBuddy panel to the DSH sidebar: a nav row that opens the credits / accounts / model catalog as a full page. Off by default — the row claims a global sidebar seat shared by every bundle, and the Plugins page already reaches the same content.'),
  ) as unknown as z<boolean>,
  channelPerturbation: asVolatile(
    z.union([z.const('off'), z.const('failure'), z.const('always')])
      .default('failure')
      .description('When to perturb scanned messages with invisible characters: "off" only rescues after a channel-gate refusal, "failure" (default) learns from a successful rescue and starts later requests perturbed, "always" starts every request with the dense rescue for a gateway whose plain attempt is guaranteed to fail.'),
  ) as unknown as z<'off' | 'failure' | 'always'>,
  usageIdentity: asVolatile(
    z.boolean()
      .default(false)
      .description("Send the chat conversation ids in the official client's 32-hex UUIDv7 shape and add a mirroring X-Request-ID. Off by default — it is a display alignment measured by a reporter, not by this plugin, and the chat channel identity (User-Agent) and request body never change."),
  ) as unknown as z<boolean>,
  wireProfile: asVolatile(
    z.union([z.const('conservative'), z.const('balanced')])
      .default('balanced')
      .description('Outbound identity profile. "balanced" (default) makes every request claim the same client (WorkBuddy product/IDE/agent headers, X-CodeBuddy-Request, Accept-Language, X-Root-Request-ID, and a per-account X-Machine-ID/X-Session-ID pair) and gives the billing routes a User-Agent plus Origin/Referer. "conservative" restores the 5.16.0 bytes exactly, including X-Product: SaaS.'),
  ) as unknown as z<'conservative' | 'balanced'>,
  deviceSdkEnabled: asVolatile(
    z.boolean()
      .default(false)
      .description('Master switch for the real-device SDK. OFF by default, matching the default Virtual tier: turning it on makes the plugin discover the installed desktop SDK, fetch its device token in a background child process and keep it fresh. A capability that reaches into a third party\'s native modules on your machine should be opted into, and with the Virtual tier (the default) the token it fetches would never be sent anyway. On: discover, fetch, prewarm. Off: none of that — no discovery, no child process, no prewarming — so the Real tier has no token to send; the Virtual tier is unaffected (its ids derive from the local salt).'),
  ) as unknown as z<boolean>,
  deviceToken: asVolatile(
    z.object({
      file: z.string().default(''),
      ttlMs: z.number().step(1).min(1000).default(300_000),
    }).default({})
      .description('Optional X-Device-Token supplied by a file, re-read every ttlMs (default 5 min; the token itself expires in about 10). Accepts a bare token or an {"token":…} JSON envelope, so pointing it at workbuddy2openapi\'s .turing_token_cache.json works as-is. Empty file = off. Only used by wireProfile "balanced"; a token that cannot be read is skipped with a warning, never invented.'),
  ) as unknown as z<{ file: string, ttlMs: number }>,
  keepPromptLast: asVolatile(
    z.boolean()
      .default(false)
      .description("Move the harness-injected runtime context above the real prompt, so the " +
        "WorkBuddy usage page records what you actually typed instead of the injected block. " +
        "Message count and text are preserved; the one edit is the recorded prompt's own leading " +
        "<acp> marker. Off by default because it changes the message order the upstream counts."),
  ) as unknown as z<boolean>,
  extraInjectedPrefixes: asVolatile(
    z.array(z.string())
      .default([])
      .description('Extra literal prefixes (issue #133) treated like the harness-injected context markers when keepPromptLast is on — for blocks a companion plugin injects that the built-in list does not recognize. Each entry matches the start of a trailing user message; read only while keepPromptLast is enabled. Sampled when the plugin mounts: reload the plugin (or restart the host) after changing it.'),
  ) as unknown as z<string[]>,
  dropForeignThinking: asVolatile(
    z.boolean()
      .default(false)
      .description('Drop foreign thinking blocks that pi-ai would publish as prose (issue #147). ' +
        'CROSS-PROVIDER turns are dropped automatically: after a provider switch the other provider\'s ' +
        'unsigned thinking blocks can never be replayed, and pi-ai would flatten them into assistant prose ' +
        'that the gateway refuses with 11128 (issue #163\'s measured scene). This switch only widens the ' +
        'repair to a model switch inside one of this bundle\'s own routes. On, those blocks are removed ' +
        'from the request; text and tool calls are untouched. Off by default for the same-route leg ' +
        'because it changes bytes the upstream counts.'),
  ) as unknown as z<boolean>,
  sessionTitle: asVolatile(
    z.object({
      enabled: z.boolean().default(false),
      model: z.string().default('wb-lite'),
    }).default({})
      .description('Move the host session-title request onto a hidden lightweight model (issues #132/#133). The host fires one real upstream request per new session either way; enabled re-points it at `model` (default wb-lite, measured 0 credits by the reporter) instead of billing the main paid model. Request volume still counts, and the lightweight model is reporter-measured, not reproduced here. Sampled when the plugin mounts: reload the plugin (or restart the host) after changing it.'),
  ) as unknown as z<{ enabled: boolean, model: string }>,
  channelRejectContinue: asVolatile(
    z.object({
      enabled: z.boolean().default(false),
      maxConsecutive: z.number().step(1).min(1).max(10).default(1),
      text: z.string().default('继续'),
    }).default({})
      .description('LAST RESORT, not a fix for 11128. After the gateway refuses a turn with `channel_reject` (business code 11128), send 「继续」 once automatically. Off by default: it spends a real request without the user typing anything. Fixed system fingerprints are handled by prepareChatBody\'s sentence rewrites; they are byte-identical every turn, so resending only pays for the same 400 again. The narrow case this can help is content that changes between turns. `maxConsecutive` (default 1) counts CONSECUTIVE auto-sends: one successful turn, or one real user message, resets it. Subagent sessions are never touched. Live: the engine reads this on every failure, so no reload is needed.'),
  ) as unknown as z<{ enabled: boolean, maxConsecutive: number, text: string }>,
}) as unknown as z<Config>

