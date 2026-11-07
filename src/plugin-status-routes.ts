/** 从 index.ts 按职责提取；参考来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */
import { Config, unwrapVolatile } from './plugin-config.ts'
import { regionStateOf, regionEnabled, type WorkBuddyRegionStack, REGION_KEYS, REAL_TIER_AVAILABILITY } from './plugin-regions.ts'

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'

import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { workbuddyAccountId, WorkBuddyCredentialStore } from './auth.ts'

import type { WorkBuddyModelInfo } from './catalog.ts'

import { clearRegionAccountSelection, type HostSettingsService } from './catalog-write.ts'

import { describeDerivedDevices, readDeviceSettings, saveDeviceProfile, saveDeviceSdkSettings, setDeviceMode } from './device-profile.ts'
import type { WorkBuddyDeviceSettings } from './device-profile.ts'
import { createDeviceSdkPort } from './turing-sdk.ts'

import { BENEFIT_CACHE_MS, claimableBenefits, type WorkBuddyBenefitView } from './benefits.ts'

import type { ForeignThinkingBlock } from './adapter.ts'

import type { WorkBuddyMediaModel } from './image-gen.ts'
import { type CliBridgeRuntime } from './cli-bridge/mount.ts'

import { probeModel } from './probe.ts'
import { measureTps } from './tps.ts'

import {
  checkinAllAccounts,
  probeUpdatesOf,
  testAllAccounts,
} from './account-pool-run.ts'
import type {
  WorkBuddyPoolRunnerDeps,
  WorkBuddyPoolTarget,
} from './account-pool-run.ts'
import { exclusionOf } from './account-pool.ts'
import type { WorkBuddyPoolMember } from './account-pool.ts'

import { oauthPoll, oauthStart } from './oauth.ts'
import { mergeTransferRecords, parseTransferFile, previewTransferFile, transferRecordOf } from './transfer.ts'
import { effectiveMembersOf } from './account-pool.ts'
import { readPoolProbes, writePoolProbes } from './account-pool-store.ts'
import { summarizeAutoCheckin } from './auto-checkin.ts'
import type { AutoCheckinState } from './auto-checkin.ts'

import { WorkBuddyUpstreamClient, knownRegionOf } from './upstream.ts'
import type { WorkBuddyRegion } from './upstream.ts'

import type { WorkBuddyBusyLevel } from './busy.ts'
import { registerWorkBuddyStatusRoute } from './web-status.ts'

import { type WorkBuddyWebPoolExclusion, type WorkBuddyWebTpsResult, type WorkBuddyTransferExportAnswer, type WorkBuddyTransferImportAnswer, type WorkBuddyTransferPreview, type WorkBuddyTransferRecord, type WorkBuddyCreditPosition } from './status-paths.ts'
interface StatusRouteDependencies {
  readonly stacks: Record<WorkBuddyRegion, WorkBuddyRegionStack>
  readonly client: WorkBuddyUpstreamClient
  readonly accountUsabilityProbe: (region: WorkBuddyRegion, account: import("./credential-recovery.ts").WorkBuddyRecoveryCandidate) => Promise<boolean>
  readonly cliRuntime: CliBridgeRuntime | undefined
  readonly turing: import("./turing-sdk.ts").TuringSdk
  readonly config: Config
  readonly writeDeviceSdkEnabled: (enabled: boolean) => Promise<boolean>
  readonly displayModels: (value: Config, region: WorkBuddyRegion) => readonly WorkBuddyModelInfo[]
  readonly current: () => Config
  readonly liveBusyLevels: (region: WorkBuddyRegion) => Record<string, WorkBuddyBusyLevel>
  readonly effectiveImageIds: (state: ReturnType<typeof regionStateOf>, models: readonly WorkBuddyModelInfo[]) => ReadonlySet<string>
  readonly savedOffModelIds: (state: ReturnType<typeof regionStateOf>, roster: readonly WorkBuddyModelInfo[]) => readonly string[]
  readonly discoverModels: (region: WorkBuddyRegion, signal?: AbortSignal) => Promise<readonly WorkBuddyModelInfo[]>
  readonly persistRefreshedModels: (region: WorkBuddyRegion, models: readonly WorkBuddyModelInfo[]) => Promise<void>
  readonly readMediaModels: (region: WorkBuddyRegion, options?: { readonly signal?: AbortSignal; readonly refresh?: boolean; }) => Promise<readonly WorkBuddyMediaModel[]>
  readonly latestForeignThinking: { blocks: readonly ForeignThinkingBlock[]; atMs: number; } | undefined
  readonly creditPositionOf: (config: Config, region: WorkBuddyRegion) => WorkBuddyCreditPosition
  readonly quotaRefreshOf: (region: WorkBuddyRegion, credential: Awaited<ReturnType<WorkBuddyCredentialStore["resolve"]>>) => Promise<number | undefined>
  readonly invalidateCatalog: () => void
  readonly poolPreferencesOf: (config: Config, region: WorkBuddyRegion) => { memberAccountIds: string[]; orderAccountIds: string[]; autoCheckin: boolean; probeInputTokens?: number; enabled: boolean; targetModelId: string; }
  readonly poolMembersOf: (region: WorkBuddyRegion) => Promise<WorkBuddyPoolMember[]>
  readonly localPoolMembers: (region: WorkBuddyRegion) => Promise<WorkBuddyPoolMember[]>
  readonly checkinStateCache: Partial<Record<WorkBuddyRegion, Record<string, { checkedIn: boolean; atMs: number; }>>>
  readonly CHECKIN_CACHE_MS: number
  readonly benefitStateCache: Partial<Record<WorkBuddyRegion, Record<string, { views: readonly WorkBuddyBenefitView[]; atMs: number; }>>>
  readonly applyPoolSelection: (region: WorkBuddyRegion) => Promise<boolean>
  readonly servingAccountIsExcluded: (region: WorkBuddyRegion) => Promise<boolean>
  readonly autoCheckinEnabled: (region: WorkBuddyRegion) => boolean
  readonly autoCheckinState: Partial<Record<WorkBuddyRegion, AutoCheckinState>>
  readonly poolTargets: (region: WorkBuddyRegion) => Promise<WorkBuddyPoolTarget[]>
  readonly poolRunnerDeps: (region: WorkBuddyRegion) => WorkBuddyPoolRunnerDeps
  readonly regionTargetModel: (region: WorkBuddyRegion) => string | undefined
  readonly hostSettings: () => HostSettingsService | undefined
  readonly settingsNs: SettingsNamespace
  readonly legacyAccountRegion: WorkBuddyRegion | undefined
  readonly ctx: Context
}
export function installPluginStatusRoutes(webCtx: Parameters<typeof registerWorkBuddyStatusRoute>[0], dependencies: StatusRouteDependencies) {
    /**
     * 池子里每个账号的 uid，用来算"留空时会发出什么"。
     *
     * 按 accountId 去重：同一个账号可能同时出现在两个区域的凭据目录里（用户
     * 两边都登录过），而它的设备身份只该有一个。`credentialFor` 每账号一次
     * 文件读，只在这条路由被打开/保存时发生，不在请求热路径上。
     */
    const deviceAccounts = async (): Promise<{ accountId: string, uid: string }[]> => {
      const entries: { accountId: string, uid: string }[] = []
      const seen = new Set<string>()
      for (const region of REGION_KEYS) {
        for (const account of await dependencies.stacks[region].store.accounts()) {
          if (seen.has(account.id)) continue
          const credential = await dependencies.stacks[region].store.credentialFor(account.id)
          if (credential === undefined || credential.uid === '') continue
          seen.add(account.id)
          entries.push({ accountId: account.id, uid: credential.uid })
        }
      }
      return entries
    }
    /**
     * 给设置补上派生值。读、切档、保存三条路都走它，三个响应因此永远同形。
     *
     * 派生值算不出来（本机没有设备盐）时整块缺席，而不是回一个空对象：缺席是
     * "这次没算"，空对象是"算过，一个都没有"，弹窗对这两种情况要说不同的话。
     */
    const withDerived = async (settings: WorkBuddyDeviceSettings): Promise<WorkBuddyDeviceSettings> => {
      // 派生值只是"给用户看"的附加物：列举账号时的一次 IO 失败不该让整条设置
      // 路由返回 500，否则会连带影响仍可使用的档位开关和编辑按钮。
      //
      // `realTier` 与派生值不同：它**永远**要带上，包括派生值算失败的那条路径。
      // 少了它，界面就退回"不禁用任何东西"，于是 mac 上那个点不动的「真实值」
      // 又会恢复为可点状态，导致用户能够选择实际不可用的档位。
      try {
        const derived = await describeDerivedDevices(await deviceAccounts())
        return derived === undefined
          ? { ...settings, realTier: REAL_TIER_AVAILABILITY }
          : { ...settings, derived, realTier: REAL_TIER_AVAILABILITY }
      } catch {
        return { ...settings, realTier: REAL_TIER_AVAILABILITY }
      }
    }
    return registerWorkBuddyStatusRoute(webCtx, {
    store: region => dependencies.stacks[region].store,
    client: dependencies.client,
    // Verifies whether some OTHER local account is still accepted upstream, so
    // a refused credential can be answered with "switch accounts" instead of a
    // re-login instruction that would change nothing. Cached per account and
    // issuance time; only ever consulted after a rejection.
    accountUsable: dependencies.accountUsabilityProbe,
    /**
     * The CLI route's live turns, for the composer readout.
     *
     * Read through `cliRuntime` rather than captured once: the runtime is rebuilt
     * whenever `cliBridge` settings change, and the board belongs to the runtime.
     * A captured board would keep answering for a runtime nothing drives any
     * more. Switched off means `undefined`, which the route reports as an empty
     * document.
     */
    cliLive: () => dependencies.cliRuntime?.live.snapshot() ?? { turns: [], serverTime: Date.now() },
    /**
     * 设备头设置（「虚拟值 / 真实值」+ 每账号覆盖参数）。
     *
     * 卡片提供 accountId，DSH 从凭据库解析构造请求头所需的 uid。
     * 这样无需向浏览器暴露网关侧的账号标识。
     *
     * 每次响应都带一份 `derived`：**留空时真正会发出去的那一对 id**。弹窗把它
     * 显示在空输入框下面，于是"自动派生"不再是句承诺，而是一个能核对的值。
     * 派生用 uid（与 `deviceHeaders()` 同一份输入），所以界面上的值等于线上的值。
     */
    deviceSettings: {
      read: async () => withDerived(await readDeviceSettings()),
      setMode: async mode => withDerived(await setDeviceMode(mode)),
      saveAccount: async (accountId, values) => {
        for (const region of REGION_KEYS) {
          const credential = await dependencies.stacks[region].store.credentialFor(accountId)
          if (credential !== undefined) {
            return withDerived(await saveDeviceProfile(accountId, { ...values, uid: credential.uid }))
          }
        }
        // 账号在本机已经不存在（凭据被清掉、或来自另一个 profile）：值照写，
        // 只是没有 uid，于是它不会影响任何请求，直到该账号重新出现并再次保存。
        return withDerived(await saveDeviceProfile(accountId, values))
      },
      saveSdk: values => saveDeviceSdkSettings(values),
    },
    /**
     * 真实设备参数（本机安装的桌面端 SDK）的状态与取值。
     *
     * `mode` 现读而不是缓存：切档与面板是同一屏的两件事，中间隔一次 5 秒缓存就会
     * 出现"已经切到真实值、面板还说虚拟值"的一屏。
     */
    deviceSdk: createDeviceSdkPort({
      sdk: dependencies.turing,
      mode: async () => (await readDeviceSettings()).mode,
      /**
       * 总开关走插件配置（`Config.deviceSdkEnabled`），不走设备设置文件。
       *
       * read 使用 current()，读取 DSH 交给 apply() 的配置引用，
       * 所以 `ctx.settings.update` 写完它就能读到新值（`asVolatile` 会就地改）。
       * 回 `undefined` 让卡片把开关标成不可用，而不是把它画成"关"。
       */
      enabled: {
        read: async () => unwrapVolatile(dependencies.config.deviceSdkEnabled) !== false,
        write: dependencies.writeDeviceSdkEnabled,
      },
    }),
    /**
     * Why each of the region's accounts cannot serve right now, for the composer
     * panel's table.
     *
     * Runs the SAME `exclusionOf` the pool ranks by, against every account the
     * region knows — not only pool members. Deriving it any other way (a second
     * expiry comparison, or `probe.outcome` read raw) would let the panel call an
     * account rate-limited while the pool has already moved past its cooldown.
     */
    accountExclusions: async (region: WorkBuddyRegion) => {
      const probes = await readPoolProbes(region)
      const nowMs = Date.now()
      const out: Record<string, WorkBuddyWebPoolExclusion> = {}
      for (const [accountId, probe] of Object.entries(probes)) {
        const excludedBy = exclusionOf(probe, nowMs)
        if (excludedBy !== undefined) out[accountId] = excludedBy
      }
      return out
    },
    displayModels: region => dependencies.displayModels(dependencies.current(), region),
    /**
     * The LIVE load levels, read beside the saved roster the card lists.
     *
     * The card's model list is the SAVED `lastCatalog`, which carries no load
     * level (load is not persisted — `src/busy.ts`), so the badge has to come
     * from the live roster instead.
     */
    busyLevels: region => dependencies.liveBusyLevels(region),
    enabledModelIds: region => regionStateOf(dependencies.current(), region).enabledModelIds ?? [],
    // #168: the card's model editor must show the SAME image ticks the runtime
    // is stamping. Reporting the raw stored array while the runtime seeds from
    // the vendor table would show an unticked box on a model that is actually
    // served as multimodal — and the next save would then write that mismatch
    // down as a decision.
    imageModelIds: region => [...dependencies.effectiveImageIds(
      regionStateOf(dependencies.current(), region),
      dependencies.displayModels(dependencies.current(), region),
    )],
    offModelIds: region => dependencies.savedOffModelIds(regionStateOf(dependencies.current(), region), dependencies.displayModels(dependencies.current(), region)),
    contextBudgets: region => regionStateOf(dependencies.current(), region).contextBudgets ?? {},
    // Issue #179: the card picks a default tier per model, and the Host answers
    // with what it will actually DISPATCH, not what the browser mirror says.
    defaultThinkingEfforts: region => regionStateOf(dependencies.current(), region).defaultThinkingEfforts ?? {},
    discoverModels: dependencies.discoverModels,
    // Issue #214: the refresh route's answer is only useful if it is REMEMBERED.
    // Without this the press repainted the response and nothing else, so the
    // card — which renders `displayModels()` — kept showing the saved
    // directory's prices while the reply carried the upstream's.
    persistModels: dependencies.persistRefreshedModels,
    /**
     * This region's first-sighting readout, the data behind the composer pill's
     * "· N 新模型" segment.
     *
     * READ-ONLY here: only the reconciler's `note` writes first-sighting
     * history, so no amount of polling by the pill or the card can change who
     * counts as new — the one property that keeps the marker honest.
     */
    rosterSeen: region => dependencies.stacks[region].rosterSeen.readout(),
    mediaModels: dependencies.readMediaModels,
    regionEnabled: region => regionEnabled(dependencies.current(), region),
    /**
     * The region's committed sidebar-credit flag, read from the same config the
     * card writes. Exposed on the Host's answer because the browser settings
     * mirror goes stale for this namespace on the affected 0.1.7 deployments,
     * which made the switch look unable to turn the line off ("关闭不了").
     */
    showNewModelsInMainUi: region => regionStateOf(dependencies.current(), region).showNewModelsInMainUi === true,
    showCreditsInMainUi: region => regionStateOf(dependencies.current(), region).showCreditsInMainUi !== false,
    /**
     * Whether the model may call the image tool here. Read from the committed
     * value like the flag above, and deliberately `=== true`: an absent setting
     * is NOT consent to let the model spend.
     */
    imageToolEnabled: region => regionStateOf(dependencies.current(), region).imageToolEnabled === true,
    /** Whether the model may call the video tool here. Same opt-IN read as above. */
    videoToolEnabled: region => regionStateOf(dependencies.current(), region).videoToolEnabled === true,
    /**
     * The video model pinned per tag in this region, for the card's per-mode
     * picker. Read from the committed value like the switches above: the picker
     * must render what the TOOL will actually use, not what the browser mirror
     * happens to hold.
     */
    preferredVideoModels: region => regionStateOf(dependencies.current(), region).preferredVideoModels ?? {},
    /**
     * Whether the optional CodeBuddy CLI route is mounted (`codebuddy_ask` tool
     * + `/codebuddy` command).
     *
     * GLOBAL, so it takes no region. `=== true` like `imageToolEnabled`, not
     * `!== false`: switching this on lets a child process edit files and spend
     * CodeBuddy quota, so an absent value must read as OFF rather than as
     * consent. `cliBridge` is a volatile field, hence the unwrap.
     */
    cliBridgeEnabled: () => unwrapVolatile(dependencies.current().cliBridge)?.enabled === true,
    /**
     * Whether the optional DSH sidebar panel is switched on (PR #188).
     *
     * GLOBAL, so it takes no region. `=== true` like `cliBridgeEnabled`, not
     * `!== false`: the row claims a `sidebar.panellist` seat and a `main` page
     * that every installed bundle shares, so an absent value must read as "not
     * asked for" rather than as consent. Volatile, hence the unwrap.
     */
    sidebarPanelEnabled: () => unwrapVolatile(dependencies.current().sidebarPanel) === true,
    /**
     * The model / reasoning effort the optional CodeBuddy CLI route runs on.
     *
     * `cliBridge` is volatile, hence the unwrap; absent keys read as `''` —
     * "the CLI's own default" — because an empty pin is a COMMITTED value the
     * card's pickers can render, not a missing one.
     */
    cliBridgeModel: () => unwrapVolatile(dependencies.current().cliBridge)?.model ?? '',
    cliBridgeEffort: () => unwrapVolatile(dependencies.current().cliBridge)?.effort ?? '',
    cliBridgeRegionOrder: () => unwrapVolatile(dependencies.current().cliBridge)?.regionOrder ?? '',
    /**
     * Whether the request path drops foreign thinking blocks (issue #147), read
     * live so the card's switch reflects the value the NEXT request will use
     * rather than the one captured at mount.
     */
    dropForeignThinking: () => unwrapVolatile(dependencies.current().dropForeignThinking) === true,
    /**
     * What the last request had to drop, so the card can explain a turn that
     * arrived looking like working notes instead of leaving the user to conclude
     * the model broke. `undefined` until a request actually removes something —
     * an empty report would render as a permanent warning.
     */
    latestForeignThinking: () => dependencies.latestForeignThinking,
    /**
     * WHERE the readout sits, resolved here rather than read from the browser
     * settings mirror, for the same measured reason as the flag above: on the
     * affected 0.1.7 deployments that mirror never picks up this plugin's
     * writes, and a control reading it would keep showing the old seat.
     */
    creditPosition: region => dependencies.creditPositionOf(dependencies.current(), region),
    /**
 * Probe each named model through this region's resolved credential.
 * The browser sends model ids and receives outcomes on this route; credential
 * export/import uses a separate route. Input size defaults to the probe default.
 * Known quota refresh times supplement Retry-After and reset messages. Model
 * congestion may use the local waiting period defined in probe.ts.
 */
    async probeModels(region, modelIds, options) {
      let credential
      try {
        credential = await dependencies.stacks[region].store.resolve()
      } catch (error: unknown) {
        // No usable credential is a batch-wide, actionable answer: report it as
        // each requested model's outcome rather than failing the whole route, so
        // the card can show WHICH problem it hit.
        return modelIds.map(modelId => ({
          modelId,
          outcome: 'credential-rejected' as const,
          message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        }))
      }
      const quotaRefreshAtMs = await dependencies.quotaRefreshOf(region, credential)
      const results = []
      for (const modelId of modelIds) {
        results.push(await probeModel({
          client: dependencies.client,
          credential,
          modelId,
          nowMs: Date.now(),
          ...quotaRefreshAtMs === undefined ? {} : { quotaRefreshAtMs },
          ...options?.signal === undefined ? {} : { signal: options.signal },
        }))
      }
      return results
    },
    /**
     * Output-speed measurement (issue #92), region-scoped like every other
     * spending path.
     *
     * Deliberately NOT routed through the probe's failover machinery: a speed
     * number describes the MODEL, and having the pool silently serve the run
     * from a different account would attach one account's rate limit (6004) to
     * another's measurement. The selected credential runs all three samples, so
     * "it failed" means this account could not measure it, which is the honest
     * answer.
     */
    async measureTps(region, modelIds, options) {
      let credential
      try {
        credential = await dependencies.stacks[region].store.resolve()
      } catch (error: unknown) {
        // A missing credential is per-model, actionable information: report it
        // rather than failing the route, so the card can show WHY.
        const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
        return modelIds.map(modelId => ({
          modelId,
          outcome: 'credential-rejected' as const,
          samples: 0,
          message,
        }))
      }
      const results: WorkBuddyWebTpsResult[] = []
      for (const modelId of modelIds) {
        const sample = await measureTps({
          client: dependencies.client,
          credential,
          modelId,
          ...options?.signal === undefined ? {} : { signal: options.signal },
        })
        results.push({
          modelId: sample.modelId,
          outcome: sample.tokensPerSecond === undefined ? 'failed' as const : 'ok' as const,
          ...sample.tokensPerSecond === undefined ? {} : { tokensPerSecond: sample.tokensPerSecond },
          ...sample.timeToFirstTokenMs === undefined ? {} : { timeToFirstTokenMs: sample.timeToFirstTokenMs },
          ...sample.outputTokens === undefined ? {} : { outputTokens: sample.outputTokens },
          samples: sample.samples,
          ...sample.reason === undefined ? {} : { reason: sample.reason },
          ...sample.credit === undefined ? {} : { credit: sample.credit },
        })
      }
      return results
    },
    // The card re-reads this on every poll and rescan, so a sign-in the user
    // performs after startup brings the region's models back without a restart.
    regionUsable(region, usable) {
      if (dependencies.stacks[region].catalog.setRegionUsable(usable)) dependencies.invalidateCatalog()
    },
    /**
     * The account pool, resolved per region.
     *
     * Region-scoped throughout: the CN and international pools are separate
     * stacks of accounts, so one region's pool can never rank or bill the
     * other's accounts.
     *
     * The pool decides who serves a FAILED request (see `failoverAccountFor`),
     * and it does so without writing `config.accounts[region]`: a retry borrows
     * another member's credential for that one request, leaving the record of
     * what the user picked — and the account the next request starts from —
     * untouched.
     */
    pool: {
      preferences: region => dependencies.poolPreferencesOf(dependencies.current(), region),
      members: region => dependencies.poolMembersOf(region),
      /**
       * The first-paint member list (issue #77): local state only.
       *
       * This is `localPoolMembers`, i.e. the SAME list the request path already
       * consults — saved members, their last credit snapshot (if it is still
       * fresh), and their last probe result. No upstream call, so the card's
       * account table can paint before any billing endpoint answers; live
       * figures arrive with the full document a moment later.
       *
       * A member whose credit snapshot has expired simply carries no `credits`,
       * which the card renders as "—" rather than as zero.
       */
      localMembers: region => dependencies.localPoolMembers(region),
      /**
       * The checked accounts that resolve to a local sign-in.
       *
       * A local scan only — no upstream calls — so the route's empty-pool guard
       * can use it on every batch. {@link poolMembersOf} is the expensive one
       * (it fetches credits per account) and is not suitable there.
       */
      effectiveMemberAccountIds: async region => {
        const saved = dependencies.poolPreferencesOf(dependencies.current(), region).memberAccountIds
        if (saved.length === 0) return []
        const accounts = await dependencies.stacks[region].store.accounts()
        // SAVED order, because this is the list the card compares against the
        // user's own checks; the roster it renders is ordered separately.
        return effectiveMembersOf(saved, new Set(accounts.map(account => account.id)))
      },
      /**
       * Last measured display name per saved member id (issue #60).
       *
       * Answers the one question the card cannot answer itself: a saved member
       * whose sign-in is gone has no row in the roster, so the name the pool
       * once saw is the only thing that can identify it. Read from the runtime
       * probe store — no upstream call, and no credential touched.
       *
       * Best-effort, and deliberately NOT filtered to ghosts here: the route
       * knows which ids are unlisted (it built the roster) and names only
       * those, so this stays a plain lookup with one meaning.
       */
      memberNames: async (region: WorkBuddyRegion) => {
        const probes = await readPoolProbes(region)
        const names: Record<string, string> = {}
        for (const [accountId, probe] of Object.entries(probes)) {
          if (probe.accountName === undefined || probe.accountName === '') continue
          names[accountId] = probe.accountName
        }
        return names
      },
      /**
       * Local sign-ins the pool does NOT cover.
       *
       * Sent so the card can offer them to check in. Membership is an explicit
       * opt-in, and a user cannot opt in to an account the card never shows.
       */
      async otherAccounts(region) {
        const wanted = new Set(dependencies.poolPreferencesOf(dependencies.current(), region).memberAccountIds)
        const accounts = await dependencies.stacks[region].store.accounts()
        return accounts
          .filter(account => !wanted.has(account.id))
          .map(account => ({
            id: account.id,
            accountName: account.accountName,
            ...account.enterprise === true ? { enterprise: true } : {},
          }))
      },
      /**
       * Today's check-in state per account, for the pool table.
       *
       * Read per account through `credentialFor` (never `resolve`), so asking
       * about an account cannot change which one is billing. A per-account
       * failure is simply omitted, which the card renders as unknown.
       */
      async checkedInToday(region) {
        // Skip the read entirely when the pool is off: the card renders no pool
        // section in that state, so N upstream requests per poll would be pure
        // waste (and cost, on the upstream's side).
        if (!dependencies.poolPreferencesOf(dependencies.current(), region).enabled) return {}
        const store = dependencies.stacks[region].store
        const accounts = await store.accounts()
        const now = Date.now()
        const entries = await Promise.all(accounts.map(async account => {
          // Serve from the cache while it is fresh. The card polls every 60
          // seconds, but "did this account check in today" only changes when a
          // check-in runs or the day rolls over — so re-reading it on every
          // poll meant ~14,400 requests/day for a 10-account pool. A check-in
          // this plugin performs invalidates its own entry (see `checkin`).
          const cached = dependencies.checkinStateCache[region]?.[account.id]
          if (cached !== undefined && now - cached.atMs < dependencies.CHECKIN_CACHE_MS) {
            return [account.id, cached.checkedIn] as const
          }
          const credential = await store.credentialFor(account.id).catch(() => undefined)
          if (credential === undefined) return undefined
          const status = await dependencies.client.fetchCheckinStatus(credential).catch(() => undefined)
          if (status === undefined) return undefined
          dependencies.checkinStateCache[region] = {
            ...dependencies.checkinStateCache[region],
            [account.id]: { checkedIn: status.todayCheckedIn, atMs: now },
          }
          return [account.id, status.todayCheckedIn] as const
        }))
        return Object.fromEntries(entries.filter(entry => entry !== undefined))
      },
      /**
       * Today's check-in state from the cells already measured this process.
       *
       * The first-paint counterpart (issue #77) of `checkedInToday`: it reads
       * `checkinStateCache` and nothing else, so painting the table never waits
       * on one request per account. An unmeasured account is absent, which the
       * card already renders as unknown rather than as "not checked in".
       */
      cachedCheckedInToday(region) {
        // Same guard as the full read: with the pool off there is no table to
        // fill, so nothing is reported.
        if (!dependencies.poolPreferencesOf(dependencies.current(), region).enabled) return {}
        const now = Date.now()
        const state = dependencies.checkinStateCache[region] ?? {}
        const cached: Record<string, boolean> = {}
        for (const [accountId, entry] of Object.entries(state)) {
          if (now - entry.atMs >= dependencies.CHECKIN_CACHE_MS) continue
          cached[accountId] = entry.checkedIn
        }
        return cached
      },
      /**
       * Claimable promotional benefits per account (issue #79).
       *
       * Only campaigns the account can STILL claim are returned — a claimed or
       * lapsed one is absent, which is what the issue asked for. Absent means
       * the card shows no benefit line at all.
       *
       * Two status reads per account, so it is cached for `BENEFIT_CACHE_MS` and
       * skipped entirely when the pool is off (same reasoning as
       * `checkedInToday`: no table, no request).
       */
      async benefits(region) {
        if (!dependencies.poolPreferencesOf(dependencies.current(), region).enabled) return {}
        const store = dependencies.stacks[region].store
        const accounts = await store.accounts()
        const now = Date.now()
        const entries = await Promise.all(accounts.map(async account => {
          const cached = dependencies.benefitStateCache[region]?.[account.id]
          if (cached !== undefined && now - cached.atMs < BENEFIT_CACHE_MS) {
            return [account.id, cached.views] as const
          }
          const credential = await store.credentialFor(account.id).catch(() => undefined)
          if (credential === undefined) return undefined
          // Upstream's read endpoints advertise campaigns for enterprise/education
          // members while every WRITE answers `10001 企业账号不支持该操作`. The UI
          // must not present a button that is certain to fail (issue #129), so
          // these accounts simply have no claimable benefits.
          if (credential.enterpriseId !== undefined && credential.enterpriseId !== '') return [account.id, []] as const
          const read = await dependencies.client.fetchBenefits(credential).catch(() => undefined)
          // A failed read is UNKNOWN, not "no benefits": caching an empty answer
          // would make one bad request look like a fully-claimed pool for half
          // an hour.
          if (read === undefined) return undefined
          const views = claimableBenefits(read, now)
          dependencies.benefitStateCache[region] = {
            ...dependencies.benefitStateCache[region],
            [account.id]: { views, atMs: now },
          }
          return [account.id, views] as const
        }))
        return Object.fromEntries(entries.filter(entry => entry !== undefined))
      },
      /**
       * Claimable benefits from the readings already taken this process.
       *
       * The first-paint counterpart of `benefits`, mirroring
       * `cachedCheckedInToday`: no request, so painting never blocks on two
       * calls per account. An unmeasured account is absent, not empty.
       */
      cachedBenefits(region) {
        if (!dependencies.poolPreferencesOf(dependencies.current(), region).enabled) return {}
        const now = Date.now()
        const state = dependencies.benefitStateCache[region] ?? {}
        const cached: Record<string, readonly WorkBuddyBenefitView[]> = {}
        for (const [accountId, entry] of Object.entries(state)) {
          if (now - entry.atMs >= BENEFIT_CACHE_MS) continue
          cached[accountId] = entry.views
        }
        return cached
      },
      /**
       * Drop one account's cached benefit reading (issue #79).
       *
       * The claim route writes upstream itself, so this cache is the ONLY thing
       * that can keep answering "claimable" after a successful claim — and it was
       * never invalidated: the credits went up, the 领取 pill stayed for up to 30
       * minutes, and the claim looked like it had silently failed. That is the
       * exact symptom the user reported. `checkin` already deletes its entries
       * after a batch; this is the same rule for the claim.
       *
       * Deleting (rather than overwriting with the post-claim read) keeps the
       * ownership where it belongs: the route already made the authoritative
       * re-read, and the next `benefits()` refills this from live data.
       */
      invalidateBenefit(region, accountId) {
        const cached = dependencies.benefitStateCache[region]
        if (cached !== undefined) delete cached[accountId]
      },
      async currentAccountId(region) {
        // Apply the SAME selection the request path applies, then report what the
        // store would bill. Going through `applyPoolSelection` instead of
        // re-deriving "who should serve" here is what keeps the card and the
        // router from disagreeing: one rule, one answer.
        //
        // It also means the card is correct immediately on a settings change,
        // rather than only after the next chat request happens to re-point the
        // store.
        await dependencies.applyPoolSelection(region).catch(() => undefined)
        const credential = await dependencies.stacks[region].store.current().catch(() => undefined)
        if (credential === undefined) return undefined
        // With a member measured unusable and nobody else to take over, the
        // request still falls back to the saved selection — but reporting that
        // account as "in use" would contradict the table right below it, which
        // says the same account is rate-limited. Answer "nobody" instead: the
        // card already has a state for that, and it is the truth.
        if (await dependencies.servingAccountIsExcluded(region).catch(() => false)) return undefined
        return workbuddyAccountId(credential)
      },
      /**
       * Only the CN app rewards a daily check-in; the international region has
       * no equivalent here, so its card must not offer the action.
       */
      checkinSupported: region => region === 'cn',
      /**
       * What the background check-in has settled today (issue #191).
       *
       * Answers from the runner's in-memory state, which is the same object the
       * tick updates — so the card never has to guess which accounts a previous
       * attempt already handled. `undefined` when the switch is off or nothing
       * has run, which the card renders as "no status line" rather than "0 of N".
       */
      autoCheckinToday: region => {
        if (!dependencies.autoCheckinEnabled(region)) return undefined
        const state = dependencies.autoCheckinState[region]
        if (state === undefined) return undefined
        // The denominator came with the state, so this runs on the card's poll
        // without enumerating the credential store (see `scopeSize`).
        return summarizeAutoCheckin(state)
      },
      checkin: async region => {
        const rows = await checkinAllAccounts(
          await dependencies.poolTargets(region),
          dependencies.poolRunnerDeps(region),
        )
        // Drop the cached readings for accounts this batch touched, so the
        // card's check-in column reflects the result immediately rather than
        // showing the pre-batch state until the TTL expires.
        for (const row of rows) {
          if (row.status === 'failed') continue
          const cached = dependencies.checkinStateCache[region]
          if (cached !== undefined) delete cached[row.accountId]
        }
        return rows
      },
      test: async (region, modelId, onRow) => {
        const rows = await testAllAccounts(
          await dependencies.poolTargets(region),
          modelId,
          dependencies.poolRunnerDeps(region),
          // Forwarded so the route can report each account as it lands. The
          // measurements are still persisted ONCE, after the whole batch: a
          // per-row write would interleave with a concurrent batch and re-read
          // the file on every account for nothing.
          onRow,
        )
        // Persist the measurements: they are what keeps failover off an account
        // that is known to be limited or rejected.
        await writePoolProbes(region, probeUpdatesOf(rows))
        return rows
      },
      catalog: region => dependencies.displayModels(dependencies.current(), region),
      /**
       * Test ONE account against the region's target model.
       *
       * The per-row button's Host half. Reuses the batch's probe dependency
       * (same client, same probe size, same quota-refresh input) so a row
       * result and a batch result are the SAME measurement — only the
       * persistence is scoped to one id instead of every member.
       *
       * Returns undefined when the region cannot name a target model (the
       * same refusal the batch route reports as 409) — the card says so
       * rather than pretending a test ran.
       */
      testOne: async (region, accountId) => {
        const target = dependencies.regionTargetModel(region)
        if (target === undefined) return undefined
        const store = dependencies.stacks[region].store
        const credential = await store.credentialFor(accountId).catch(() => undefined)
        if (credential === undefined) {
          return {
            accountId,
            accountName: '',
            result: {
              modelId: target,
              outcome: 'credential-rejected' as const,
              status: 0,
              message: 'no stored credential for this account',
            },
          }
        }
        const accounts = await store.accounts().catch(() => [])
        const accountName = accounts.find(account => account.id === accountId)?.accountName ?? ''
        const deps = dependencies.poolRunnerDeps(region)
        const result = await deps.probe(credential, target)
        // Persist exactly like the batch does, scoped to the one id: the next
        // ranking, failover decision, and table render all read the same file.
        await writePoolProbes(region, probeUpdatesOf([{ accountId, accountName, result }]))
        return { accountId, accountName, result }
      },
      /**
       * Forget ONE account's plugin-stored credential (the vault entry; the
       * desktop app's files are never touched). The card rescans afterwards,
       * so the row disappears the moment the write lands.
       *
       * AND DROP THE REGION'S PERSISTED PIN, when this was the pinned account
       * (issue #155's second report). `removeAccount` forgets the selection in
       * memory only, so the next `applySelection` — a restart, or any settings
       * save — re-reads the dead id out of `accounts.<region>`, re-pins it, and
       * the tab returns to「已保存的账号在本机已不存在」with the card's advice
       * pointing at a list that state does not render. The clear is decided from
       * the settings document rather than from the store, and is scoped to the
       * one region that pinned this account: an unrelated removal must not move
       * anybody off the account they chose.
       *
       * FAIL-SOFT, like the field repair above: the credential is already gone by
       * the time this runs, so a settings write that cannot land must not be
       * reported as a failed removal — that would tell the user the account is
       * still there when it is not.
       */
      removeOne: async (region, accountId) => {
        const removed = await dependencies.stacks[region].store.removeAccount(accountId)
        try {
          await clearRegionAccountSelection(
            dependencies.hostSettings(),
            dependencies.settingsNs,
            region,
            accountId,
            // Read the flat field as it is PERSISTED, not as the store holds it:
            // the pre-split profile pins through this key while `accounts` is
            // empty, and `selectAccountFor` falls back to it per region.
            unwrapVolatile(dependencies.current().accountId),
            dependencies.legacyAccountRegion,
          )
        } catch (error: unknown) {
          dependencies.ctx.logger.warn(
            'dsh-connect-workbuddy: the account was removed, but the region could not be un-pinned from settings; the selection may reappear as orphaned after a restart',
            error,
          )
        }
        return removed
      },
    },
    /**
     * OAuth QR sign-in for this card. The session lives in `src/oauth.ts`
     * (in-process, keyed by loginId); the Host's only extra duty is
     * persisting the finished credential into the region's vault — the same
     * store the request path reads, so the account is selectable the moment
     * the poll answers.
     */
    oauth: {
      async start(region) {
        return oauthStart(region)
      },
      async poll(region, loginId) {
        const answer = await oauthPoll(loginId, region)
        if (!answer.done) return answer
        if ('error' in answer) return answer
        const store = dependencies.stacks[region].store
        const accountId = await store.addOAuthAccount({
          accessToken: answer.account.accessToken,
          refreshToken: answer.account.refreshToken,
          expiresAtMs: answer.account.expiresAtMs,
          ...answer.account.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: answer.account.refreshExpiresAtMs },
          domain: answer.account.domain,
          uid: answer.account.uid,
          ...answer.account.nickname === undefined ? {} : { nickname: answer.account.nickname },
          ...answer.account.uin === undefined ? {} : { uin: answer.account.uin },
          ...answer.account.enterpriseId === undefined ? {} : { enterpriseId: answer.account.enterpriseId },
        }).catch((error: unknown) => {
          throw new Error(
            'the account was signed in but could not be saved: '
            + (error instanceof Error ? error.message : String(error)),
          )
        })
        const accounts = await store.accounts().catch(() => [])
        const saved = accounts.find(account => account.id === accountId)
        return {
          done: true,
          accountId,
          accountName: saved?.accountName ?? answer.account.nickname ?? '',
        }
      },
    },
    /**
     * Batch credential export / import, in the transfer file format the
     * sibling credential managers share. The Host owns every byte of the
     * vault; the route only ferries parsed answers.
     */
    transfer: {
      async exportAccounts(region, accountIds): Promise<WorkBuddyTransferExportAnswer> {
        const store = dependencies.stacks[region].store
        const accounts = await store.accounts().catch(() => [])
        const wanted = new Set(accountIds)
        const records: WorkBuddyTransferRecord[] = []
        for (const account of accounts) {
          if (!wanted.has(account.id)) continue
          const credential = await store.credentialFor(account.id).catch(() => undefined)
          if (credential === undefined) continue
          records.push(transferRecordOf(credential, {
            auth: {
              accessToken: credential.accessToken,
              refreshToken: credential.refreshToken,
              expiresAt: credential.expiresAtMs > 0 ? Math.floor(credential.expiresAtMs / 1000) : 0,
              ...credential.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAt: Math.floor(credential.refreshExpiresAtMs / 1000) },
              ...credential.lastRefreshAtMs === undefined ? {} : { lastRefreshTime: Math.floor(credential.lastRefreshAtMs / 1000) },
              domain: credential.domain,
            },
            account: {
              uid: credential.uid,
              ...credential.enterpriseId === undefined ? {} : { enterpriseId: credential.enterpriseId },
              ...credential.nickname === undefined ? {} : { nickname: credential.nickname },
              ...credential.uin === undefined ? {} : { uin: credential.uin },
            },
          }))
        }
        return { accounts: records }
      },
      async previewImport(region, text): Promise<WorkBuddyTransferPreview> {
        void region
        return previewTransferFile(text)
      },
      async importAccounts(region, text, indexes): Promise<WorkBuddyTransferImportAnswer> {
        // Parse FIRST so a malformed file fails the request before any vault
        // write, with the parse error as the message.
        const records = parseTransferFile(text)
        const { changes, imported, skipped } = mergeTransferRecords(
          records,
          indexes,
          region,
          domain => knownRegionOf(domain),
        )
        const store = dependencies.stacks[region].store
        for (const [id, credential] of changes) {
          await store.addOAuthAccount(credential).catch(error => {
            throw new Error(
              'imported account ' + id + ' could not be stored: '
              + (error instanceof Error ? error.message : String(error)),
            )
          })
        }
        return { imported, skipped }
      },
    },
    })
  }
