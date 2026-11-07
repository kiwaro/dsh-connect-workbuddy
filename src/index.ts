import { installPluginStatusRoutes } from './plugin-status-routes.ts'
import { type WorkBuddyRegionState, type WorkBuddyPoolPreferences, Config, asVolatile, unwrapVolatile } from './plugin-config.ts'
export { type WorkBuddyRegionState, type WorkBuddyPoolPreferences, Config, asVolatile } from './plugin-config.ts'
import { regionStateOf, regionEnabled, type WorkBuddyRegionStack, REGION_KEYS, imageToolRegionOf, videoToolRegionOf, selectAccountFor, regionCleared, legacyAttributionRegion } from './plugin-regions.ts'
export { regionStateOf, regionEnabled, imageToolRegionOf, videoToolRegionOf, selectAccountFor, regionCleared, legacyAttributionRegion } from './plugin-regions.ts'
import { realTierAvailabilityFor } from './real-tier-availability.ts'
export { realTierAvailabilityFor } from './real-tier-availability.ts'
/**
 * WorkBuddy models for DeepSeek Harness, reusing the WorkBuddy desktop
 * app's sign-in. Registers TWO provider routes — `workbuddy` (domestic CN
 * gateway) and `workbuddy-global` (international workbuddy.ai gateway) —
 * each backed by its own region-scoped credential store, model catalog, and
 * loopback shim, so both regions serve simultaneously; streaming, tool calls,
 * compaction, and permissions stay Harness-owned.
 *
 * 参考：corrinehu/dsh-workbuddy-connect（MIT，Copyright (c) 2026 Corrine Hu）
 *   — DSH 的组件加载顺序（先起 shim，拿到端口后才构造 provider，
 *     再注册 adapter 与可配置 provider，最后异步刷新目录）由其设计并验证；
 *     `installSettingsSection` 的用法、webServer 为可选服务（无头 profile
 *     下 DSH 仍工作）的处理，亦沿用其做法。
 * 参考：dingminhua/dsh-connect-trae（MIT，Copyright (c) 2026 LaoDing）
 *   — 配置 schema 的字段划分（lastCatalog 目录 + enabledModelIds 勾选分离）、
 *     `displayModels` 与 `configuredModels` 的区分、
 *     `registerModelDiscovery` 与 `discoverModels` 返回草稿目录的做法，
 *     均来自该项目。
 * 改动：关闭账号池时使用手动选择的账号；开启后按账号池规则自动选号，
 *   并移除与本项目上游无关的 1M 变体逻辑；双 provider 化后国内版与
 *   国际版各持一套 store/catalog/shim，区域由凭据域名隔离，
 *   设置卡片以 tab 区分两个供应商。
 *
 * @module dsh-connect-workbuddy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { AdapterRegistrationHandle, DirectoryRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { workbuddyAccountId, WorkBuddyCredentialStore, type WorkBuddyCredential } from './auth.ts'
import { deriveCatalog, fallbackModelsFor, withoutRouters, WorkBuddyCatalog } from './catalog.ts'
import type { WorkBuddyModelInfo } from './catalog.ts'
import {
  catalogFingerprint,
  isUnconfiguredFallbackSnapshot,
  repairedCatalog,
  resolveRoster,
} from './catalog-sync.ts'
import { healRegionsField, writeRegionCatalog, type HostSettingsService } from './catalog-write.ts'
import { createAccountUsabilityProbe } from './credential-recovery.ts'
import { createDeviceProfileLookup } from './device-profile.ts'

import { createTuringSdk } from './turing-sdk.ts'
import { WORKBUDDY_DEVICE_TOKEN_FILE_ENV } from './device-token.ts'
import { type WorkBuddyBenefitView } from './benefits.ts'
import {
  createWorkBuddyAdapter,
  regionOfProvider,
  workBuddyDisplayName,
  workBuddyModelInput,
  WORKBUDDY_GLOBAL_PROVIDER,
  WORKBUDDY_PROVIDER,
  WORKBUDDY_PROVIDER_DISPLAY_NAMES,
  WORKBUDDY_PROVIDERS,
} from './adapter.ts'
import { resolveCnGateway } from './cn-gateway.ts'
import type { CnGatewayRejection } from './cn-gateway.ts'
import { createContextRescue } from './context-rescue.ts'
import type { RescueAgents, RescueCompaction, RescueTokenMeter } from './context-rescue.ts'
import {
  channelContinueSettingsOf,
  installChannelContinue,
  type ContinueAgent,
} from './channel-continue.ts'
import type { WorkBuddyAdapter, ForeignThinkingBlock } from './adapter.ts'
import { createWorkBuddyShim } from './shim.ts'
import { MEDIA_MODEL_TTL_MS, registerWorkBuddyImageTool, type ToolsServiceLike } from './image-tool.ts'
import { registerWorkBuddyVideoTool } from './video-tool.ts'
import type { WorkBuddyMediaModel } from './image-gen.ts'
import { createCliBridgeRuntime, mountCommandSurface, mountToolSurface, type CliBridgeRuntime } from './cli-bridge/mount.ts'
import type { DirectoryOf } from './cli-bridge/tool.ts'
import type {
  BridgeCommandsService,
  BridgeProjectionReader,
  BridgeToolsService,
} from './cli-bridge/services.ts'
import { recordBodyReport, type WorkBuddyUsageCounts } from './body-report.ts'
import { cooldownOf, outcomeOfFailure, probeModel, redactUpstreamText, resolveProbeInputTokens } from './probe.ts'

import type { UpstreamErrorKind } from './upstream.ts'
import { checkinAllAccounts } from './account-pool-run.ts'
import type {
  WorkBuddyPoolRunnerDeps,
  WorkBuddyPoolTarget,
} from './account-pool-run.ts'
import { exclusionOf } from './account-pool.ts'
import type { WorkBuddyPoolCredits, WorkBuddyPoolExclusion, WorkBuddyPoolMember, WorkBuddyPoolProbe } from './account-pool.ts'
import { resolveTargetModel } from './account-pool.ts'

import {
  effectiveMembersOf,
  rankPool,
} from './account-pool.ts'
import { readPoolProbes, writePoolProbes } from './account-pool-store.ts'
import { autoCheckinRegions, emptyAutoCheckinState, foldAttempt, isDue, localDayKey, nextDelayMs, pendingTargets, AUTO_CHECKIN_IDLE_MS } from './auto-checkin.ts'
import type { AutoCheckinState } from './auto-checkin.ts'
import { readAutoCheckinState, writeAutoCheckinState } from './auto-checkin-store.ts'
import { createFileRosterSeenStore } from './roster-seen-store.ts'

import type { WorkBuddyShim } from './shim.ts'
import { WorkBuddyUpstreamClient, APP_VERSION, knownRegionOf, regionOf } from './upstream.ts'
import type { WorkBuddyRegion } from './upstream.ts'
import { attachBusyLevels } from './busy.ts'
import type { WorkBuddyBusyLevel } from './busy.ts'
import { registerWorkBuddyStatusRoute } from './web-status.ts'
import { clearHostHeartbeat, writeHostHeartbeat } from './host-heartbeat.ts'

export {
  WORKBUDDY_GLOBAL_PROVIDER,
  WORKBUDDY_PROVIDER,
  WORKBUDDY_PROVIDER_DISPLAY_NAMES,
  WORKBUDDY_PROVIDERS,
  WORKBUDDY_STREAM_IDLE_TIMEOUT_MS,
  createWorkBuddyAdapter,
  regionOfProvider,
  workBuddyDisplayName,
  workBuddyModelInput,
  workBuddyThinkingLevelMap,
  type WorkBuddyAdapter,
} from './adapter.ts'
export { createWorkBuddyShim, type WorkBuddyShim } from './shim.ts'
export {
  deriveCatalog,
  fallbackModelsFor,
  FALLBACK_WORKBUDDY_MODELS,
  FALLBACK_WORKBUDDY_MODELS_GLOBAL,
  WorkBuddyCatalog,
  type WorkBuddyModelInfo,
} from './catalog.ts'
export {
  imageDefaultFor,
  NATIVE_MODALITY_BY_MODEL_ID,
  nativeModalityOf,
  type WorkBuddyNativeModality,
} from './native-modality.ts'
// Re-exported above for consumers, and imported here because the image-selection
// seeding (issue #168) is what applies the same table the card pre-ticks with.
import { imageDefaultFor } from './native-modality.ts'
import { defaultOffModelIds, offDefaultFor, lastRefusalFor, recordRefusal, REFUSES_OFF_MODEL_IDS, withEffectiveOff } from './off-thinking.ts'
export { defaultOffModelIds, offDefaultFor, REFUSES_OFF_MODEL_IDS, withEffectiveOff }
export {
  authFileName,
  defaultDesktopAuthCandidates,
  defaultDesktopAuthDirs,
  defaultDesktopAuthPath,
  ENCRYPTED_CREDENTIAL_CODE,
  hasEncryptedCredentialFields,
  isEncryptedCredentialError,
  legacyWorkbuddyOwnAuthPath,
  parseWorkBuddyAuth,
  WORKBUDDY_AUTH_FILE_ENV,
  WORKBUDDY_AUTH_FILENAME,
  workbuddyAccountId,
  WorkBuddyCredentialStore,
  WorkBuddyEncryptedCredentialError,
  workbuddyOwnAuthPath,
  type WorkBuddyAccountChoice,
  type WorkBuddyAuthStatus,
  type WorkBuddyCandidateFailure,
  type WorkBuddyCredential,
  type WorkBuddyStoreOptions,
} from './auth.ts'
export {
  clearAtRestKeyCache,
  deriveAtRestKey,
  deriveAtRestKeyId,
  fetchAtRestKeyPayload,
  findWorkbuddyAppExecutable,
  isEncryptedFieldWrapper,
  isWorkbuddyBundle,
  macosBundleExecutable,
  macosNestedAppBundles,
  openEncryptedField,
  readAtRestKey,
  WORKBUDDY_APP_EXECUTABLE_ENV,
  workbuddyAppExecutableCandidates,
  type WorkBuddyEncryptedField,
} from './at-rest.ts'
export {
  classifyUpstreamError,
  CREDENTIAL_REJECTED_CODE,
  isCredentialRejectedError,
  parseCreditMultiplier,
  parseReasoning,
  parseUpstreamModel,
  prepareChatBody,
  modelIdOfBody,
  knownRegionOf,
  regionOf,
  WorkBuddyCredentialRejectedError,
  WorkBuddyUpstreamClient,
  type UpstreamErrorKind,
  type WorkBuddyChatResult,
  type WorkBuddyCreditPackage,
  type WorkBuddyCredits,
  type WorkBuddyReasoning,
  type WorkBuddyRefreshOutcome,
  type WorkBuddyUpstreamModel,
} from './upstream.ts'
export {
  createAccountUsabilityProbe,
  resolveCredentialRecovery,
  type WorkBuddyCredentialRecovery,
  type WorkBuddyProbeStore,
  type WorkBuddyRecoveryCandidate,
  type WorkBuddyUsabilityProbeOptions,
} from './credential-recovery.ts'
export {
  WORKBUDDY_HOST_HEARTBEAT_FILENAME,
  clearHostHeartbeat,
  isHeartbeatProcessAlive,
  processStartTimeMs,
  readHostHeartbeat,
  writeHostHeartbeat,
  workbuddyHostHeartbeatPath,
  type WorkBuddyHostHeartbeat,
} from './host-heartbeat.ts'
export { WORKBUDDY_CONNECT_VERSION } from './version.ts'
export {
  cooldownOf,
  creditOfStream,
  outcomeOfFailure,
  parseRetryAfter,
  probeModel,
  probeRequestBody,
  PROBE_INPUT_TOKEN_CHOICES,
  probeSucceeded,
  DEFAULT_PROBE_INPUT_TOKENS,
  PROBE_MAX_TOKENS,
  PROBE_SYSTEM_PROMPT,
  type WorkBuddyProbeClient,
  type WorkBuddyProbeOutcome,
  type WorkBuddyProbeResult,
} from './probe.ts'
export {
  registerWorkBuddyStatusRoute,
  workBuddyWebStatus,
  type WorkBuddyStatusRouteOptions,
} from './web-status.ts'
import { WORKBUDDY_ACCOUNTS_REFRESH_PATH, WORKBUDDY_CHECKIN_PATH, WORKBUDDY_MODELS_REFRESH_PATH, WORKBUDDY_PROBE_PATH, WORKBUDDY_TPS_PATH, WORKBUDDY_REGION_PARAM, WORKBUDDY_REGIONS, WORKBUDDY_SETTINGS_NS, WORKBUDDY_USAGE_PATH, regionOfStatusUrl, toPersistedWorkBuddyModel, withWorkBuddyRegion, regionEnabledOf, nextRegionEnabled, nextRegionSlots,
// The shape of the `regions` field is not trustworthy in a profile written by
// an older build (see `healedRegionsMap` in `src/status-paths.ts`): the Host's
// read and the catalog repair's write both go through this narrowing, so one
// rule heals both halves (the "restart reset" report).
regionsMapOf, regionsFieldIsCorrupt,
// Imported for this module's own use AND re-exported below, so moving the
// implementation to the shared bridge did not change the public API.
unwrapVolatileDeep, type WorkBuddyCreditPosition } from './status-paths.ts'
export {
  WORKBUDDY_ACCOUNTS_REFRESH_PATH,
  WORKBUDDY_CHECKIN_PATH,
  WORKBUDDY_MODELS_REFRESH_PATH,
  WORKBUDDY_PROBE_PATH,
  WORKBUDDY_TPS_PATH,
  WORKBUDDY_REGION_PARAM,
  WORKBUDDY_REGIONS,
  WORKBUDDY_SETTINGS_NS,
  WORKBUDDY_USAGE_PATH,
  regionOfStatusUrl,
  toPersistedWorkBuddyModel,
  withWorkBuddyRegion,
  regionEnabledOf,
  nextRegionEnabled,
  nextRegionSlots,
  regionsMapOf,
  regionsFieldIsCorrupt,
  unwrapVolatileDeep,
}

/** Stable Cordis plugin name. */
export const name = 'dsh-connect-workbuddy'

/** The model registry required before the provider can register. */
export const inject = ['llm', 'settings']

/**
 * 设置卡片的配置命名空间。
 * 早期通过 installSection 自选命名空间的路径已移除。DSH 0.1.7 的 settings 服务
 * 通过 describe 返回 Loader 条目 id 作为命名空间，因此实际值由 settingsNamespaceOf 取得。
 * 此常量仅用于 DSH 未暴露条目 id 时的默认值。
 * DSH 按精确命名空间查表，值不一致会使 provider 被判为未配置，影响设置入口和模型发现。
 */

/**
 * The namespace the HOST actually serves this plugin under.
 *
 * `ctx.fiber.entry` is added by the Loader, not by Cordis itself, so it is not
 * in Cordis's public types and is absent on hosts that mount a plugin without a
 * Loader entry (a test harness, or `ctx.plugin()` called directly). Hence the
 * probe plus the documented fallback, mirroring the first-party plugins:
 * `const settingsNs = ctx.fiber.entry?.options.id ?? NS`.
 */
export function settingsNamespaceOf(ctx: unknown): SettingsNamespace {
  const id = (ctx as { fiber?: { entry?: { options?: { id?: unknown } } } })?.fiber?.entry?.options?.id
  return typeof id === 'string' && id !== '' ? id as SettingsNamespace : WORKBUDDY_SETTINGS_NS as SettingsNamespace
}

/**
 * Start both regions' loopback endpoints, register the `workbuddy` (CN) and
 * `workbuddy-global` (international) providers, and refresh each region's
 * model catalog from the upstream once that region's credentials allow it.
 * The static fallback catalogs serve from the first moment, so an offline
 * upstream never leaves a provider empty.
 */
export function apply(ctx: Context, config: Config): void {
  // The CN catalog prefers `/v3/config` and falls back to the legacy document.
  // A fallback is worth a line in the log: it means the card's roster may no
  // longer match the app's prices, which is a user-visible difference rather
  // than a purely internal degradation.
  /**
   * 每账号的设备覆盖值（设置里齿轮改的那份）。
   *
   * 读盘缓存在 `device-profile.ts` 里是**模块级**的，所以这里、路由、以及客户端
   * 看到的永远是同一份；`saveDeviceProfile` 写完后会立即失效它，改完下一条请求
   * 就生效，不需要重启。
   */
  const deviceProfiles = createDeviceProfileLookup()
  /**
   * 管理真实设备参数的预热和定时刷新。
   * 启用时 startAutoRefresh 立即获取一次，成功后在缓存到期前刷新，失败按重试间隔再试。
   * 每次获取启动子进程，卸载时通过 ctx.effect 调用 stopAutoRefresh 清理定时器。
   * 目录由 dirSource 在每次 probe 时读取；设备设置缓存为 5 秒，保存后立即失效。
   * 关闭 deviceSdkEnabled 时不预取、不建定时器，但保留 SDK 端口，使界面可以显示 disabled 状态。
   */
  /**
   * 总开关：**默认关**（`default(false)`）。
   *
   * 与档位默认值一致：档位默认「虚拟值」本来就不发这个 token，那么默认去发现
   * SDK、起子进程、每 10 分钟取一次，取到的东西一次也用不上。更一般地说，一个
   * 会碰用户机器上第三方原生模块的能力，默认该由用户主动打开。
   *
   * `=== true` 而不是 `!== false`：`undefined`（老配置文件里没有这个字段）必须
   * 落到"关"，与 `default(false)` 同一个答案。写成 `!== false` 会让"未设置"和
   * "显式开启"分叉，升级后老用户静默拿到与 schema 默认相反的行为。
   */
  const deviceSdkEnabled = unwrapVolatile(config.deviceSdkEnabled) === true
  const turing = createTuringSdk({
    productVersion: APP_VERSION,
    dirSource: () => deviceProfiles.sdkDir(),
    // 关掉之后连发现链都不该跑：目录仍然解析得出来，但 probe 直接答 disabled，
    // 因此不会有任何一次子进程被创建。
    enabled: deviceSdkEnabled,
  })
  if (deviceSdkEnabled) turing.startAutoRefresh()
  ctx.effect(() => () => { turing.stopAutoRefresh() })

  /**
   * Announce a CN gateway override, ONCE per distinct value / failure.
   *
   * The reader runs on every CN request, so logging unconditionally would turn
   * one misconfiguration into a warn per request. Keyed on the VALUE rather than
   * a plain boolean, so fixing the setting and breaking it again both get said —
   * a user who is iterating on hosts needs to see each attempt acknowledged.
   */
  let announcedCnBase: string | undefined
  let announcedCnBaseFailure: string | undefined
  const warnCnBaseOnce = (base: string): void => {
    if (announcedCnBase === base) return
    announcedCnBase = base
    // Per-request failure text is deliberately part of it: an ECONNRESET here is
    // the whole point of the setting, and naming the host is what tells the user
    // which of their attempts is in force.
    ctx.logger.warn(`dsh-connect-workbuddy: CN gateway overridden to ${base} (issue #220). Chat, billing, catalog and check-in follow it; Origin/Referer still name the CN web app.`)
  }
  const warnCnBaseInvalidOnce = (reason: CnGatewayRejection, value: string): void => {
    const key = `${reason}:${value}`
    if (announcedCnBaseFailure === key) return
    announcedCnBaseFailure = key
    const why = reason === 'malformed'
      ? 'it is not an absolute URL'
      : reason === 'insecure'
        ? 'only https is accepted (a plaintext base would put the bearer token on the wire in clear)'
        : 'its host is not one of the CN brands (copilot.tencent.com, wb.tencentbuddy.com, workbuddy.cn, codebuddy.cn)'
    ctx.logger.warn(`dsh-connect-workbuddy: ignoring regions.cn.cnBase "${value}" — ${why}. Using the built-in CN gateway.`)
  }

  const client = new WorkBuddyUpstreamClient(
    message => {
      ctx.logger.warn(`dsh-connect-workbuddy: ${message}`)
    },
    {
      usageIdentity: unwrapVolatile(config.usageIdentity) === true,
      // 未配置时使用 upstream 的 DEFAULT_WIRE_PROFILE，避免维护两份默认值。
      ...unwrapVolatile(config.wireProfile) === undefined
        ? {}
        : { profile: unwrapVolatile(config.wireProfile) },
    },
    (() => {
      // 将设备 token 文件源配置传给客户端，由读取器按 TTL 重读。
      // 插件配置非空时优先，否则使用 WORKBUDDY_DEVICE_TOKEN_FILE；doctor 也读取该环境变量。
      const token = unwrapVolatile(config.deviceToken)
      const configured = typeof token?.file === 'string' ? token.file.trim() : ''
      const file = configured !== '' ? configured : (process.env[WORKBUDDY_DEVICE_TOKEN_FILE_ENV] ?? '').trim()
      return {
        deviceTokenFile: file,
        ...typeof token?.ttlMs === 'number' ? { deviceTokenTtlMs: token.ttlMs } : {},
        // 每账号覆盖值（设置里齿轮保存的那些）。请求路径按 uid 查，读盘有 5 秒
        // 缓存；保存会立刻失效那次缓存，所以改完下一条请求就生效。
        deviceProfiles,
        // 真实值档的 token 源。档位由 `deviceProfiles.mode()` 决定：真实值档只
        // 认这一个源，虚拟值档完全不碰它（见 `wireIdentity`）。
        realDevice: turing.tokens,
        /**
         * 每次请求读取国内版网关配置，见 issue #220。
         * regions 支持保存后即时更新，因此不能仅在构造客户端时读取一次。
         * 只有国内版且 resolveCnGateway 校验通过时返回覆盖值。
         * 无效配置使用默认网关并记录警告，避免每个请求都因配置错误抛出异常。
         */
        cnBase: () => {
          const live = current()
          const raw = regionStateOf(live, 'cn').cnBase
          const resolved = resolveCnGateway(raw)
          if (resolved.ok) {
            if (resolved.overridden) warnCnBaseOnce(resolved.base)
            return resolved.overridden ? resolved.base : ''
          }
          warnCnBaseInvalidOnce(resolved.reason, resolved.value)
          return ''
        },
      }
    })(),
  )

  /**
   * How long a check-in reading is reused before asking the upstream again.
   *
   * The card polls the usage route every 60 seconds, but "did this account
   * check in today" changes only when a check-in runs or the day rolls over.
   * Without a cache, a 10-account pool cost ~14,400 upstream requests a day for
   * an answer that was almost always identical.
   */
  const CHECKIN_CACHE_MS = 10 * 60_000

  /**
   * Per-region, per-account check-in readings.
   *
   * Invalidated by this plugin's check-in batch. Other clients or a day boundary
   * can change upstream state while a cached reading remains reusable.
   */
  const checkinStateCache: Partial<
    Record<WorkBuddyRegion, Record<string, { checkedIn: boolean, atMs: number }>>
  > = {}

  /**
   * Per-region, per-account benefit readings (issue #79).
   *
   * Same shape and same reasoning as `checkinStateCache`: claim state changes
   * when a human acts on the web page or in the desktop app, not spontaneously,
   * so a per-poll read of two endpoints per account would be thousands of
   * requests a day to learn nothing. Coarser than the check-in TTL because a
   * benefit window is measured in days, not hours.
   */
  const benefitStateCache: Partial<
    Record<WorkBuddyRegion, Record<string, {
      views: readonly WorkBuddyBenefitView[]
      atMs: number
    }>>
  > = {}

  // The namespace the host actually serves (see `settingsNamespaceOf`). On
  // 0.1.7 this is the Loader entry id, and the harness looks it up by EXACT
  // match — advertising anything else makes our provider read as unconfigured.
  const settingsNs = settingsNamespaceOf(ctx)

  const stacks = {} as Record<WorkBuddyRegion, WorkBuddyRegionStack>
  for (const region of REGION_KEYS) {
    // `authFile` is volatile on the 0.1.7 line: the raw config value is a live
    // cosmokit reference, and passing it through would hand the store a
    // reference object instead of a path.
    const authFile = unwrapVolatile(config.authFile)
    const store = new WorkBuddyCredentialStore({
      region,
      ...authFile === undefined ? {} : { desktopPath: authFile },
      refresh: credential => client.refreshToken(credential),
    })
    const catalog = new WorkBuddyCatalog(region)
    // This region's OWN first-sighting history, the source of the composer
    // pill's "· N 新模型". Region-scoped like the credential and pool copies:
    // the two catalogs are separate, so a CN first-sighting says nothing about
    // the international roster, and they must never overwrite each other.
    const rosterSeen = createFileRosterSeenStore(region)
    /**
     * Where the next upstream `usage` should be written.
     *
     * The body report records the sent body, then the reported usage, and the two phases are
     * wired through different callbacks, so the seam between them has to live
     * somewhere. `noop` rather than `undefined` keeps the usage path free of a
     * presence check on the hot request path — and a request whose report was
     * disabled resolves to the same noop, so nothing needs to know whether
     * reporting is on.
     */
    let pendingUsage: (usage: WorkBuddyUsageCounts | undefined) => void = () => {}
    const shim = createWorkBuddyShim({
      store,
      client,
      catalog,
      logger: ctx.logger,
      channelPerturbation: unwrapVolatile(config.channelPerturbation) ?? 'failure',
      keepPromptLast: unwrapVolatile(config.keepPromptLast) === true,
      extraInjectedPrefixes: unwrapVolatile(config.extraInjectedPrefixes) ?? [],
      sessionTitle: unwrapVolatile(config.sessionTitle) ?? {},
      /**
       * Pool routing, bound to THIS region.
       *
       * The region is captured in the closure rather than passed per call: each
       * region owns its own store, pool and shim, and routing that consulted the
       * other region's members would bill an account from a different account
       * pool than the one in play.
       *
       * `prepareAccount` runs before every request (so the ranking decides who
       * serves), `failoverAccount` runs after a failure (so the ranking decides
       * who to try next). Both are resolved lazily — they read pool plumbing
       * defined below — but never called before it exists: the shim only takes
       * traffic once the provider is registered, which happens after this whole
       * setup completes.
       */
      // What went upstream, in counts (issue #59). Off unless
      // `WORKBUDDY_BODY_REPORT` is set; the region is captured here because the
      // shim deliberately does not know about regions.
      //
      // The returned handle carries the upstream's `usage` back onto the SAME
      // line. This shared handle keeps only the newest report in the region.
      // Concurrent streams can replace it before an earlier usage arrives, so
      // this wiring does not establish reliable per-request usage attribution.
      onRequestBody: body => {
        void recordBodyReport(region, body, { onError: error => ctx.logger.warn('dsh-connect-workbuddy: body report failed', error) })
          .then(attach => { pendingUsage = attach })
          .catch((error: unknown) => ctx.logger.warn('dsh-connect-workbuddy: body report failed', error))
      },
      onUpstreamUsage: usage => { pendingUsage?.(usage) },
      // Remember a tier refusal so the model card can name it (issue #83). The
      // reply text is not enough: compaction reads the failure as a boolean and
      // renders "could not produce a useful summary", so this is the only route
      // the observation takes to a surface the user can see.
      reportRefusal: report => { recordRefusal(report) },
      prepareAccount: () => applyPoolSelection(region),
      failoverAccount: triedAccountIds => failoverAccountFor(region, triedAccountIds),
      // Asked only after a request has ALREADY failed and the pool found nowhere
      // to go, so the reply can say why instead of only that it tried. It runs at
      // most once per failed request — never on a request that succeeded.
      //
      // Deliberately takes no argument from the shim: the explanation describes
      // the POOL's state, which the host can read directly, and threading the
      // tried ids through would duplicate a fact the host already holds.
      failoverShortfall: () => explainPoolShortfall(region),
      // Record what a live request learned, so the NEXT one starts from an
      // account that works instead of re-discovering this failure.
      onAccountFailure: (accountId, failure) => {
        return recordAccountFailure(region, accountId, failure)
      },
    })
    stacks[region] = { store, catalog, shim, rosterSeen }
  }

  // Answers "would switching to this account help?" after the upstream refuses
  // the selected credential. It reads a candidate credential WITHOUT touching
  // the live selection, so probing can never silently re-route billing.
  const accountUsabilityProbe = createAccountUsabilityProbe({
    store: region => stacks[region].store,
    client,
  })

  // Stamp the user's explicit image opt-in onto a model list. This is the ONLY
  // source of `multimodal`; upstream capability flags are never trusted. Applied
  // to every runtime catalog path (save, discovery, startup seed) so a model's
  // image capability is consistent across them.
  const withImageSelection = (
    models: readonly WorkBuddyModelInfo[],
    images: ReadonlySet<string>,
  ): readonly WorkBuddyModelInfo[] =>
    models.map(model => ({
      ...model,
      ...images.has(model.id) ? { multimodal: true } : { multimodal: false },
    }))

  /**
   * The image selection one region should be stamped with (issue #168).
   *
   * The saved array alone cannot answer "does this model take images?", because
   * it has two writers with different meanings: the user ticking a box (a
   * DECISION, retained until another settings write changes it) and a catalog refresh re-deriving the
   * vendor-verified defaults (a SNAPSHOT of the roster as it stood that day).
   * Stamping the snapshot marks every model the roster gained SINCE as
   * text-only, `workBuddyModelInput` then answers `['text']`, and the host
   * refuses the attachment outright — `Model "…" does not support image input`
   * (`MODEL_DOES_NOT_SUPPORT_IMAGES`) — for a model `imageDefaultFor`
   * classifies as verified-multimodal.
   *
   * So the two sides are UNIONED, each contributing exactly what it can know:
   *
   *   - the SAVED array states every model the user has ticked. A tick is
   *     honoured even where the vendor table disagrees (someone may have verified image support
   *     on this account).
   *   - the VENDOR TABLE states the models this build can vouch for, and is
   *     consulted only for ids the saved array says nothing about. That is what
   *     un-breaks a newcomer without touching a single decision already made.
   *
   * `imageSelectionExplicit` closes the one gap a union cannot: the array cannot
   * say whether an ABSENT id was unticked or simply did not exist yet. Once a
   * human has edited the boxes, absence is a decision again and the table stops
   * contributing at all.
   *
   * This keeps every existing shape working: an empty `imageModelIds` on a
   * never-edited region now means "the user has not chosen any" and is filled
   * from the verified list; a populated one keeps every id it carries. It is
   * deliberately NOT a hard gate on the flag alone, because the settings seam
   * (`ctx.settings.update`) is a public write path and
   * `tests/settings-integration.spec.ts` pins that writing `imageModelIds`
   * there must reach the adapter without a second "I edited it" call.
   */
  const effectiveImageIds = (
    state: ReturnType<typeof regionStateOf>,
    models: readonly WorkBuddyModelInfo[],
  ): ReadonlySet<string> => {
    const chosen = new Set(state.imageModelIds ?? [])
    if (state.imageSelectionExplicit === true) return chosen
    for (const model of models) {
      // `chosen.has` first: the saved array wins, so a model it names is never
      // added or dropped by the table.
      if (!chosen.has(model.id) && imageDefaultFor(model)) chosen.add(model.id)
    }
    return chosen
  }

  // Runtime catalog derives from the last-refreshed directory plus the user's
  // selection; an empty selection serves the whole directory so a never-
  // configured plugin still exposes models. Image input is the user's explicit
  // opt-in (`imageModelIds`) and never inferred from upstream capability flags.
  //
  // The roster to derive FROM is resolved in three steps, and the middle one is
  // what fixes issue #32. `state.lastCatalog?.length` alone treated "saved slot
  // with no directory" exactly like "never configured", so it served the STATIC
  // fallback roster — and `applySelection` then committed that over the live
  // catalog, deleting every model the live discovery had registered (the
  // user's in-use model disappeared mid-session, with no error). `liveModels`
  // is that region's currently-registered roster, passed in by `applySelection`
  // so a partial saved slot can DEMOTE to the live directory but never past it
  // to the static list. The static list stays the last resort, for the case it
  // was written for: an offline upstream with nothing discoverable at all.
  //
  // ISSUES #114 AND #115 CHANGE THE FIRST STEP. The saved directory used to
  // WIN over the live roster, which froze the roster at a stale snapshot
  // forever: a model the upstream added (`deepseek-v4.1-flash` on the CN
  // roster) could never reach the user, because the only thing that wrote
  // `lastCatalog` was the card's explicit save, and the card saved the SAVED
  // directory back. The saved directory is now the user's NAMES, and the live
  // roster is the CAPABILITIES — see `src/catalog-sync.ts`.
  const configuredModels = (
    value: Config,
    region: WorkBuddyRegion,
    liveModels: readonly WorkBuddyModelInfo[] = [],
  ): readonly WorkBuddyModelInfo[] => {
    const state = regionStateOf(value, region)
    // `keepLoadLevel` is ON: this is the RUNTIME roster, and the load badge
    // the model picker draws lives here. The card's directory drops it (see
    // `displayModels`), because load is never persisted.
    const roster = resolveRoster(state.lastCatalog ?? [], liveModels, region, { keepLoadLevel: true })
    // `canDisableThinking` must be carried into `lastCatalog` by the card's
    // save or the next load loses it and withdraws `off` from every model
    // (the same mechanism as `imageModelIds` / `multimodal`); so stamp the
    // effective value on top of the image stamp, then let the user's selection
    // decide the final answer.
    const declared = withImageSelection(
      deriveCatalog(roster, new Set(state.enabledModelIds ?? []), state.contextBudgets ?? {}),
      // #168: seeded from the vendor table while the user has never edited the
      // boxes. The SET is computed from the roster this call is about to serve,
      // not from the stored array, so a model the roster gained since the last
      // refresh is stamped on its own verified capability instead of on its
      // absence from a stale snapshot.
      effectiveImageIds(state, roster),
    )
    // A refusal observed at request time is an OBSERVATION about the model, so it
    // is stamped beside the table's verdict — the card shows both, and one
    // cannot be mistaken for the other (issue #83).
    const stamped = withEffectiveOff(declared, new Set(savedOffModelIds(state, declared)))
    return stamped.map(model => model.reasoning === undefined || lastRefusalFor(model.id) === undefined
      ? model
      : { ...model, reasoning: { ...model.reasoning, refusesOff: true } })
  }

  /**
   * The region's `off` selection as a Set (issue #34).
   *
   * `undefined` means "the user has never saved" — seed from the built-in rule
   * so the checkbox is ticked correctly on first read. An explicit `[]` means
   * the user UNticked everything and must stay empty: `regionStateOf` reads the
   * raw stored slot, so `undefined` and `[]` are distinguishable here, and
   * collapsing them would silently re-enable every model on the next load.
   */
  const savedOffModelIds = (
    state: ReturnType<typeof regionStateOf>,
    roster: readonly WorkBuddyModelInfo[],
  ): readonly string[] =>
    state.offModelIds ?? defaultOffModelIds(roster)
  // What the card displays: this region's last-refreshed directory, so the user
  // re-reads the current catalog rather than a stale saved snapshot. Same
  // three-step roster as `configuredModels` (issue #32): a saved slot that lost
  // its directory must show the LIVE catalog, not the static fallback, or the
  // card reports the user's in-use model as withdrawn ("已下架") while the
  // runtime is still serving it.
  //
  // ISSUES #114/#115: the saved directory no longer SUPPRESSES the live
  // roster. The card used to list the saved snapshot, so a stale snapshot
  // kept a newly added upstream model invisible AND kept a model with no
  // `reasoning` block listed with no thinking tiers. The live roster is now
  // merged OVER the saved one — the card shows what the upstream actually
  // offers, and the user's own models are still kept.
  const displayModels = (value: Config, region: WorkBuddyRegion): readonly WorkBuddyModelInfo[] => {
    const state = regionStateOf(value, region)
    // Routers are dropped at every read, not just in the fresh roster. A
    // `lastCatalog` saved by an earlier version still names `auto` /
    // `default-model`, and this snapshot is what the card lists — so without
    // the filter the row would survive the upgrade and only vanish at the next
    // refresh, which reads as "the fix did not work".
    //
    // ⚠️ ONLY WHEN THAT ROSTER IS REALLY LIVE (issue #214). `current()` is
    // seeded with the STATIC fallback table by the constructor, and
    // `resolveRoster` cannot tell a static list from an upstream answer (it
    // only sees a non-empty array). Passing it unconditionally made the built-in
    // table speak as the upstream:
    //
    //   - `overlayLiveCapabilities` gives the live side ownership of
    //     `creditMultiplier` / `reasoning` / `supportsImages`, so a table that
    //     declares one of those overrides the user's saved value. THIS IS THE
    //     #214 PRICE BUG; the table's captured rates are what actually did the
    //     damage, and they are gone (see `src/catalog.ts`).
    //   - `mergeRoster` lists the live roster FIRST and appends saved-only
    //     models, so the card's directory was led by a placeholder roster.
    //
    // `applySelection` was fixed for this in 5.18.0; this reader was not, which
    // is why the report survived the upgrade. The guard is now defence in depth
    // rather than the fix: the table asserts no live-owned field, so it is not
    // observable today (the regression test says so explicitly). It stays
    // because the next field someone adds to that table would otherwise
    // silently start overriding a saved value again — which is exactly how
    // this issue began.
    const live = stacks[region]?.catalog?.hasLiveRoster() === true
      ? stacks[region].catalog.current()
      : []
    // `keepLoadLevel` is OFF: this is the card's DIRECTORY, and the load level
    // is a fact about this minute that is deliberately never persisted (see
    // `src/busy.ts`). The card reads the level from a separate map instead —
    // `liveBusyLevels` — so the badge reads the live map instead of saved load data.
    return resolveRoster(state.lastCatalog ?? [], live, region)
  }

  /**
   * Live load levels keyed by model id. displayModels strips load metadata from
   * the editable directory, so the card reads this separate map for badges.
   * A missing entry means this roster supplied no load value for that model.
   */
  const liveBusyLevels = (region: WorkBuddyRegion): Record<string, WorkBuddyBusyLevel> => {
    const live = stacks[region]?.catalog?.current() ?? []
    const levels: Record<string, WorkBuddyBusyLevel> = {}
    for (const model of live) {
      if (model.busyLevel !== undefined) levels[model.id] = model.busyLevel
    }
    return levels
  }

  /**
   * The most recent request whose foreign thinking blocks were dropped
   * (issue #147).
   *
   * Process-local and last-wins, deliberately: this is DIAGNOSTIC state that
   * answers "why did my answer look like working notes", and it is only read by
   * the status endpoint. Persisting it would let a stale turn from yesterday
   * explain a session that has since been fixed — the whole point is that the
   * reader is looking at the turn that just happened. It forgets on restart,
   * which is the natural expiry for "what this process removed recently".
   *
   * Declared HERE rather than inside the adapter mount because the status route
   * is registered outside that callback and must be able to read it.
   */
  let latestForeignThinking: { blocks: readonly ForeignThinkingBlock[], atMs: number } | undefined

  let current = () => config
  let invalidateCatalog = (): void => {}

  /**
   * 在渠道校验拒绝后按设置发起新的继续回合。
   * adapter 已在同一次请求中完成三级重试，继续原请求无法重新组装消息内容。
   * 因此在 DSH 写入 turn/end 后发起新回合，由 DSH 重建请求内容，见 docs/PINNED-11128-RETRY.md。
   * 此操作会产生真实请求，默认关闭，仅在配置显式为 true 时启用。
   */
  const disposeChannelContinue = installChannelContinue({
    // 活值：用户拨动开关之后，下一次失败立刻按新值处置，不必重载插件。
    getConfig: () => {
      const block = unwrapVolatile(current().channelRejectContinue) as
        | { enabled?: unknown, maxConsecutive?: unknown, text?: unknown }
        | undefined
      return channelContinueSettingsOf(block?.enabled, block?.maxConsecutive, block?.text)
    },
    // 每次发送时现取 agent：用户可能在两次失败之间关掉了会话，而缓存的 agent
    // 引用会 followup 到一个已经不在的会话上。
    getAgent: sessionId => {
      const agents = (ctx as unknown as { get(service: string): unknown }).get('agents') as
        | { get(id: string): ContinueAgent | undefined }
        | undefined
      return agents?.get(sessionId)
    },
    log: message => { ctx.logger.warn(`dsh-connect-workbuddy: ${message}`) },
    // 通过结构类型声明订阅 session/event 所需的接口，避免为事件监听新增
    // dsh-session 运行时依赖。引擎可在不加载 DSH 包的测试中独立验证。
    //
    // 返回值的真实类型是 `() => boolean`（「取消时它是否还在」），这里照实写：
    // 保留 boolean 返回值，便于调用方识别取消时监听器是否仍然存在。
    onSessionEvent: listener =>
      (ctx as unknown as {
        on(name: string, handler: (session: unknown, event: unknown) => void): () => boolean
      }).on('session/event', listener),
  })
  ctx.effect(() => () => { disposeChannelContinue() })

  /**
   * REPAIR a region's saved directory against the live upstream roster.
   *
   * ISSUES #114 AND #115, THE PERSISTED HALF. The read side now serves the
   * live roster (see {@link resolveRoster}), but the SAVED directory would
   * still hold the stale snapshot — and the card's save writes the saved
   * directory back, so the stale snapshot would outlive the fix and could be
   * written back over the healed one. So the directory is repaired once, when
   * the live roster lands.
   *
   * WHAT IS WRITTEN: the live roster merged over the saved one, so a newly
   * added upstream model enters the directory and the user's own models stay.
   * `enabledModelIds` is NOT touched — the selection is its own field, and a
   * model leaving the upstream roster must not lose its tick.
   *
   * WHEN IT IS WRITTEN: only when the fingerprint actually differs, so a
   * profile that is already in agreement is never written to. Without that
   * guard every startup would write, and a write per startup is a write storm
   * on a profile the user opens often.
   *
   * THE FALLBACK-SNAPSHOT CASE. A directory that is byte-identical to the
   * static fallback table was never a user's selection — it is the plugin's
   * own placeholder that came back as if the user had chosen it (issue
   * #114's root cause). It is replaced by the live roster outright.
   *
   * FAIL-SOFT: a repair that cannot be written is not a reason to fail a
   * request. The read side is already correct without it, so the repair is
   * an optimisation that heals the profile, never a precondition.
   */
  const repairRegionCatalog = async (
    region: WorkBuddyRegion,
    live: readonly WorkBuddyModelInfo[],
    options: { readonly strict?: boolean } = {},
  ): Promise<void> => {
    if (live.length === 0) return
    const state = regionStateOf(current(), region)
    const saved = state.lastCatalog ?? []
    // A saved directory that is the static fallback table is not a selection.
    // The load level is dropped either way: it is a fact about this minute and
    // the saved directory must never carry one (`src/busy.ts`), and an
    // explicit `undefined` would fail the settings write's strict JSON codec.
    const repaired = (isUnconfiguredFallbackSnapshot(saved, region)
      ? withoutRouters(live)
      : repairedCatalog(saved, live)
    ).map(model => {
      if (model.busyLevel === undefined) return model
      const { busyLevel: _dropped, ...rest } = model
      return rest as WorkBuddyModelInfo
    })
    if (repaired.length === 0) return
    // The fingerprint compares what MATTERS (ids, capability fields), so a
    // directory that differs only in a load level or a promo badge is not
    // rewritten — those are not persisted anyway.
    //
    // A CORRUPTED FIELD IS WRITTEN EVEN WHEN THE DIRECTORY AGREES (the "restart
    // reset" report). The repair is also the only writer that replaces the whole
    // `regions` field with a freshly merged map, so it is the one place that can
    // clean out the sibling-field copies an older build wrote in. Gating that on
    // the model directory alone would leave every in-agreement profile dirty
    // forever — which is precisely the shape that made the pool look unsaved,
    // outliving the fix that stopped producing it. One write per corrupted
    // profile: after it lands, the field is clean and this branch stops firing.
    const directoryDiffers = catalogFingerprint(repaired) !== catalogFingerprint(saved)
    if (!directoryDiffers && !regionsFieldIsCorrupt(current().regions)) return
    try {
      await writeRegionCatalog(hostSettings(), settingsNs, region, repaired)
    } catch (error: unknown) {
      // STRICT means the caller PROMISED this write (issue #214). The refresh
      // route answers "here are the fresh prices, and they are recorded"; if the
      // recording failed, a 200 would be a lie the user acts on — they would
      // close the card believing the new rate was saved. Such a caller gets the
      // error and reports it, instead of a log line nobody reads.
      if (options.strict === true) throw error
      // The read side already serves the live roster, so a failed automatic
      // repair can leave a stale persisted directory for the next restart. Log and move on.
      ctx.logger.warn(
        `dsh-connect-workbuddy: could not repair the ${region} model directory against the live roster`,
        error,
      )
    }
  }

  /**
   * The Host's settings service, or `undefined` when it is not available.
   *
   * Read through `ctx.get` at the moment of the write rather than sampled
   * once during `apply`: the service is optional on some hosts, and a
   * snapshot taken too early would be `undefined` forever.
   */
  const hostSettings = (): HostSettingsService | undefined =>
    (ctx as unknown as { get?: (name: string) => unknown }).get?.('settings') as HostSettingsService | undefined

  /**
   * Clean a `regions` field a previous version corrupted, once, at boot.
   *
   * The corruption itself is fixed at the source (`src/catalog-write.ts`) and the
   * read paths heal in memory, so a dirty profile is CORRECT long before this
   * runs — but it stays dirty in the file, and the next save would carry the
   * debris forward. The catalog repair writes the same clean shape, yet it only
   * runs when a live roster arrives: a disabled region, an unreachable upstream
   * or an empty answer would leave the wreckage in place for as long as those
   * conditions hold. This needs no upstream at all.
   *
   * FAIL-SOFT, exactly like the repair: the read side is already right, so a
   * write that cannot land costs tidiness and nothing else.
   */
  const healRegionsFieldIfCorrupt = async (): Promise<void> => {
    try {
      await healRegionsField(hostSettings(), settingsNs)
    } catch (error: unknown) {
      ctx.logger.warn(
        'dsh-connect-workbuddy: could not clean the shape of the regions setting',
        error,
      )
    }
  }

  /**
   * Legacy migration for the pre-split single `accountId`: its region is
   * resolved once from the local account scan and the selection is then
   * attributed to that region ONLY — the other region keeps its documented
   * default (follow the app's current sign-in) instead of silently inheriting
   * a selection that belongs to the other side of the split.
   */
  let legacyAccountRegion: WorkBuddyRegion | undefined
  const effectiveAccountFor = (region: WorkBuddyRegion, value: Config): string | undefined =>
    selectAccountFor(region, value, legacyAccountRegion)

  const discoverModels = async (
    region: WorkBuddyRegion,
    signal?: AbortSignal,
  ): Promise<readonly WorkBuddyModelInfo[]> => {
    const credential = await stacks[region].store.resolve()
    // The user's own selection rides along with the refresh. The upstream
    // roster may drop a model the user is running (the app channel's `cli`
    // roster dropped `minimax-m2.7` on 2026-10-21), and the runtime catalog
    // filters the roster by that selection — so without the kept ids a
    // refresh would silently withdraw the model the user is on, which is the
    // exact failure issue #32 was filed for. The document still publishes it
    // and the chat endpoint still answers for it, so it stays in the roster.
    const keep = regionStateOf(current(), region).enabledModelIds ?? []
    return client.fetchModels(credential, signal, keep)
  }
  /**
   * Record a refresh the card just asked for (issue #214).
   *
   * The reported bug, in one sentence: the refresh button was the only code
   * path that read the CURRENT upstream prices, and it discarded them. So the
   * fresh numbers were visible only inside the response to that one press —
   * the card went on rendering `displayModels()` (the saved directory) and the
   * runtime went on serving the catalog built at startup, which is why the
   * reporter saw 0.69 from `models/refresh` and 0.79 from `usage` on the same
   * host at the same moment.
   *
   * TWO WRITES, and they are deliberately different:
   *
   *   1. the live CATALOG, so the running provider and the picker's price
   *      labels follow the upstream immediately — this is the in-memory answer
   *      the user was looking at when they pressed the button;
   *   2. the saved DIRECTORY, through the Host's merge, so the price survives
   *      the settings card being closed and the harness being restarted.
   *
   * What is NOT written is the user's selection. `enabledModelIds`,
   * `imageModelIds`, `contextBudgets` and `defaultThinkingEfforts` remain the
   * card's DRAFT until Save — the card's own refresh handler re-maps them onto
   * the fresh rows and keeps them dirty, and the reporter's report shows the
   * draft list containing models that were not ticked. Committing them here
   * would turn one press of "refresh" into an unrequested "save".
   *
   * `origin: 'upstream'` on the catalog write is correct and load-bearing: this
   * roster IS a fresh upstream answer, which is what lets `hasLiveRoster()`
   * become true and every other reader stop mistaking the static table for the
   * upstream (see `displayModels`).
   */
  const persistRefreshedModels = async (
    region: WorkBuddyRegion,
    models: readonly WorkBuddyModelInfo[],
  ): Promise<void> => {
    if (models.length === 0) return
    const state = regionStateOf(current(), region)
    // Derive the runtime roster from the SAME rules the startup refresh uses,
    // so a mid-session refresh and a restart land on the same catalog. Without
    // this the two writers would disagree about the image seed and the `off`
    // stamp, and which one you got would depend on whether you had pressed a
    // button since starting the harness.
    const next = withEffectiveOff(
      withImageSelection(
        deriveCatalog(models, new Set(state.enabledModelIds ?? []), state.contextBudgets ?? {}),
        effectiveImageIds(state, models),
      ),
      new Set(savedOffModelIds(state, models)),
    )
    stacks[region].catalog.set(next)
    invalidateCatalog()
    // The DIRECTORY. `repairRegionCatalog` is the one writer that knows the
    // merge (it preserves the other region and this slot's sibling fields,
    // drops the never-persisted `busyLevel`, and skips the write when the
    // fingerprint already agrees). Reusing it rather than writing here keeps
    // one definition of "what a correct directory looks like".
    //
    // `strict` because THIS call is the answer to a user's click: the route
    // reports the fresh prices on the strength of this write, so a swallowed
    // failure would produce a 200 for a save that did not happen — the exact
    // class of bug being fixed here.
    await repairRegionCatalog(region, models, { strict: true })
  }
  /**
   * The region's MEDIA models, cached briefly for the card's read-only roster.
   *
   * Two callers ask the same question — the image tool (to validate a model
   * argument) and the card's roster block (to SHOW what exists) — and both get
   * the same answer from the same free GET. The cache exists because the card
   * re-reads it on every settings render, not because the answer is expensive.
   *
   * Region-keyed, and a failure is NOT cached: a gateway hiccup must not make
   * the roster read "no models" for five minutes.
   */
  const mediaCaches = new Map<WorkBuddyRegion, { readonly at: number; readonly models: readonly WorkBuddyMediaModel[] }>()
  const readMediaModels = async (
    region: WorkBuddyRegion,
    options?: { readonly signal?: AbortSignal; readonly refresh?: boolean },
  ): Promise<readonly WorkBuddyMediaModel[]> => {
    const cached = mediaCaches.get(region)
    const now = Date.now()
    if (options?.refresh !== true && cached !== undefined && now - cached.at < MEDIA_MODEL_TTL_MS) {
      return cached.models
    }
    const credential = await stacks[region].store.resolve()
    const models = await client.fetchMediaModels(credential, options?.signal)
    mediaCaches.set(region, { at: Date.now(), models })
    return models
  }

  /**
   * Stamp each model's LIVE load level onto the runtime roster.
   *
   * Deliberately NOT part of {@link discoverModels}: that reader feeds the
   * settings card's "Refresh from WorkBuddy" draft, which is SAVED into
   * `lastCatalog` — and a saved load level is a lie the moment the settings page
   * is closed (`src/busy.ts`). So the level is stamped only on the path that
   * builds the RUNTIME catalog, and it dies with the process.
   *
   * Fail-soft on purpose: a refresh that cannot read the load probe still
   * delivers the roster. Losing a badge is nothing; losing the model list
   * because a 5-second probe timed out would be the same defect this plugin
   * spends most of its comments avoiding.
   */
  const withBusyLevels = async (
    region: WorkBuddyRegion,
    models: readonly WorkBuddyModelInfo[],
    signal?: AbortSignal,
  ): Promise<readonly WorkBuddyModelInfo[]> => {
    if (models.length === 0) return models
    try {
      const credential = await stacks[region].store.resolve()
      const levels = await client.fetchModelBusy(credential, models.map(model => model.id), signal)
      return levels.size === 0 ? models : attachBusyLevels(models, levels)
    } catch (error: unknown) {
      ctx.logger.warn(
        'dsh-connect-workbuddy: model load probe unavailable; refreshing the roster without load levels',
        error,
      )
      return models
    }
  }

  /**
   * Re-stamp the LIVE load levels onto a roster that was just recomputed.
   *
   * WHY A REPLAY NEEDS THIS. `configuredModels()` rebuilds the roster from the
   * SAVED `lastCatalog`, and a saved roster has no load level in it — load is
   * deliberately not persisted (`src/busy.ts`: a cached level is a lie the
   * moment the settings page closes). So every config change — switching
   * region, changing the model selection, toggling a level, moving an account —
   * used to wipe the badges that were on screen a second earlier, and the user
   * saw "极度拥堵" appear and then vanish without touching the upstream at all.
   *
   * The fix is to ask again rather than to remember: the probe is read-only,
   * free, and answers in ~190 ms for the whole roster. Keeping the level out
   * of disk is the point, so the honest place to get it back is the upstream.
   *
   * Fail-soft, like the other probe: a level that cannot be read is a missing
   * badge, never a missing model list.
   */
  const restampBusyLevels = async (
    region: WorkBuddyRegion,
    models: readonly WorkBuddyModelInfo[],
  ): Promise<readonly WorkBuddyModelInfo[]> => {
    if (models.length === 0) return models
    try {
      const credential = await stacks[region].store.resolve()
      const levels = await client.fetchModelBusy(credential, models.map(model => model.id))
      return levels.size === 0 ? models : attachBusyLevels(models, levels)
    } catch (error: unknown) {
      ctx.logger.warn(
        'dsh-connect-workbuddy: load probe unavailable while re-applying the selection; the roster keeps no load levels',
        error,
      )
      return models
    }
  }

  /** Push the current config into every region's store selection and catalog. */
  const applySelection = (value: Config): void => {
    const authFile = unwrapVolatile(value.authFile)
    for (const region of REGION_KEYS) {
      stacks[region].store.setDesktopPath(authFile)
      stacks[region].store.selectAccount(effectiveAccountFor(region, value))
      // Hand the region's CURRENT roster in as the fallback for a saved slot
      // that lost its directory: a partial save must not be able to replace a
      // live catalog with the static one (issue #32). Read before `set`, which
      // is what keeps this from observing the write it is about to make.
      //
      // ⚠️ ONLY when that roster is really live. `catalog.current()` returns the
      // static fallback until the first refresh lands, and `resolveRoster` cannot
      // tell a static list from a live one (it only sees a non-empty array). So
      // passing it unconditionally let a settings write that arrives BEFORE the
      // first refresh copy the static roster into the catalog as if it were
      // upstream — reopening issue #32 from the other side. `hasLiveRoster()`
      // is the discriminator; without a live roster the region's saved slot is
      // resolved on its own, which is the pre-refresh behaviour it wants anyway.
      const liveRoster = stacks[region].catalog.hasLiveRoster() ? stacks[region].catalog.current() : []
      stacks[region].catalog.set(configuredModels(value, region, liveRoster), 'derived')
    }
    invalidateCatalog()
    // The replay above rebuilt each roster from the SAVED directory, which
    // carries no load level (see `restampBusyLevels`). Ask the upstream again
    // so the badges survive a settings change instead of blinking out. This runs
    // AFTER the synchronous work on purpose: the roster must be published
    // first, so the model list is never held hostage to a probe.
    for (const region of REGION_KEYS) {
      void (async () => {
        // `origin: 'derived'` on purpose: this re-stamps load levels onto the
        // roster `applySelection` just derived; it is NOT a fresh upstream
        // answer. Marking it live would let the static fallback (which the
        // roster can still be, before the first refresh) claim to be live —
        // the same mistake the loop above was fixed for.
        const live = await restampBusyLevels(region, stacks[region].catalog.current())
        if (live.length === 0) return
        stacks[region].catalog.set(live, 'derived')
        invalidateCatalog()
      })()
    }
    syncRegionRegistration(value)
    // The image tool is gated on this same region switch, and the switch is a
    // volatile field: the loader only broadcasts it, it does not re-apply. So
    // the tool is registered/unregistered HERE, on the same call that moves the
    // routes, or it would follow a stale answer.
    syncImageTool(value)
    // The video tool is gated on the same region switch, for the same reason
    // as the image tool: the switch is volatile, so it must follow HERE.
    syncVideoTool(value)
    // The CLI route reads its settings the same way: `cliBridge` is volatile, so
    // turning it on arrives through this same call and the surfaces have to
    // follow here (they cannot re-apply).
    syncCliBridge(value)
    void refreshRegionUsability()
  }

  /**
   * Tell each catalog whether its region has ANY local sign-in, so a region the
   * user has no account for advertises nothing instead of a roster that can
   * only 401 (issue #12).
   *
   * `accounts()` is the right source rather than the SELECTED credential: an
   * orphaned saved id must not blank a region that still has other sign-ins to
   * fall back on, and a region the user deliberately cleared must come back to
   * life the moment its first account appears.
   *
   * Deliberately fire-and-forget and idempotent — it runs on every settings
   * change, and `setRegionUsable` reports whether anything moved so a
   * no-change pass costs nothing beyond the scan. A failed scan leaves the
   * previous answer alone (the catalog starts permissive), so a transient
   * filesystem error never blanks a working region.
   */
  const refreshRegionUsability = async (): Promise<void> => {
    for (const region of REGION_KEYS) {
      let accounts
      try {
        accounts = await stacks[region].store.accounts()
      } catch (error) {
        ctx.logger('workbuddy').warn('region usability scan failed for %s: %s', region, error)
        continue
      }
      const changed = stacks[region].catalog.setRegionUsable(accounts.length > 0)
      if (changed) invalidateCatalog()
    }
  }

  /**
   * Live registration handles per region, filled once the shim is listening.
   * A disabled region holds ZERO routes while staying registered: DSH allows
   * `replace([])` for exactly this case ("a settings section that emptied holds
   * zero routes while staying registered"), which is what makes the on/off
   * switch reversible without a restart. Withdrawing the adapter route is what
   * actually removes the region's models from DSH's model picker — hiding the
   * card tab alone would leave every model selectable.
   */
  const registration: Record<WorkBuddyRegion, {
    adapter?: AdapterRegistrationHandle
    directory?: DirectoryRegistrationHandle
  }> = { cn: {}, global: {} }

  /**
   * Publish each region's on/off state to the harness (issue #11-style region
   * switch). Both swaps are single synchronous sections, so no request can
   * observe a half-applied state, and `replace` announces itself through
   * `llm/adapters-updated`, which is what makes third-party consumers drop the
   * region too. No-op until the shim has registered; `applySelection` runs again
   * on every card write (and once more after registration completes), so a
   * toggle lands immediately.
   */
  const syncRegionRegistration = (value: Config): void => {
    // Each region owns its OWN adapter registration, so a per-region replace is
    // exactly that region's complete route set.
    for (const region of REGION_KEYS) {
      registration[region].adapter?.replace(regionEnabled(value, region) ? [WORKBUDDY_PROVIDERS[region]] : [])
    }
    // The directory is ONE registration holding BOTH entries: `replace` sets the
    // complete entry set, so it is called once with the full enabled list.
    // Replacing per region would make the last region win and silently drop the
    // other's entry — a disabled region would take its enabled sibling with it.
    registration.cn.directory?.replace(REGION_KEYS
      .filter(region => regionEnabled(value, region))
      .map(region => ({
        provider: WORKBUDDY_PROVIDERS[region],
        displayName: WORKBUDDY_PROVIDER_DISPLAY_NAMES[region],
        settingsNs,
        settingsPath: [],
        declared: false,
      })))
  }

  // 生图工具跟随两个区域的当前开关状态。任一区启用且允许自主生图时注册。
  // 国内版和国际版均有可用媒体模型；2026-10-25 国际版实测为 hy-image-3.5。
  // 两区费率不同，因此报告上游 data.usage.credit，不写死单价；该字段未独立核对账单。
  // 通过 ctx.inject 等待 DSH 的 tools 服务，避免仅在 apply 时查找而漏掉稍后注册的服务。
  // regions 支持 volatile 更新且不重新 apply，因此注册状态也须随配置更新，
  // 避免开关打开后工具缺失，或关闭后仍显示工具并误报未登录。
  let imageTools: ToolsServiceLike | undefined
  let disposeImageTool: (() => void) | undefined
  const syncImageTool = (value: Config): void => {
    // TWO gates, both required: SOME enabled region must have an image model
    // (both do since 2026-10-25 — CN `hunyuan-image-alpha`, global
    // `hy-image-3.5`), and the user must have opted in for THAT region to let
    // the model spend credits on its own. `imageToolEnabled` is opt-IN, so an
    // upgrade never hands anyone a spending capability they did not ask for.
    const wanted = imageToolRegionOf(value) !== undefined
    if (wanted && disposeImageTool === undefined && imageTools !== undefined) {
      disposeImageTool = registerWorkBuddyImageTool(imageTools, {
        // 每次调用都重新挑区、重新解析凭据：用户可能在两次调用之间换账号、
        // 关掉某个区，或把「自主生图」从国内区挪到国际区。
        //
        // 只挑**开着且显式打开**的区。给一个没被授权的区画图，等于绕过用户
        // 按区做出的选择（开关是逐区的，见 `imageToolRegionOf`）。`resolve()`
        // 未登录时 resolve() 会抛错，此处继续尝试下一个已授权区域。
        // 所有区域均无可用账号时返回 undefined，由工具显示对应提示。
        resolveCredential: async () => {
          const live = current()
          for (const region of REGION_KEYS) {
            if (!regionEnabled(live, region)) continue
            if (regionStateOf(live, region).imageToolEnabled !== true) continue
            try {
              return await stacks[region].store.resolve()
            } catch {
              continue
            }
          }
          return undefined
        },
        listMediaModels: (credential, signal) => client.fetchMediaModels(credential, signal),
        generateImage: (credential, request, signal) => client.generateImage(credential, request, signal),
        editImage: (credential, request, signal) => client.editImage(credential, request, signal),
        logger: ctx.logger,
      })
      return
    }
    if (!wanted && disposeImageTool !== undefined) {
      disposeImageTool()
      disposeImageTool = undefined
    }
  }
  ctx.inject(['tools'], (toolsCtx) => {
    imageTools = (toolsCtx as unknown as { tools?: ToolsServiceLike }).tools
    if (imageTools === undefined) return
    syncImageTool(current())
    toolsCtx.effect(() => () => {
      disposeImageTool?.()
      disposeImageTool = undefined
      imageTools = undefined
    })
  })

  // 视频生成工具：架构同生图工具（跟随两个区开关、ctx.inject 等 tools 服务出现、
  // 注册/卸载读活值），只是执行层是 submitVideo→pollVideoTask→downloadVideo 的
  // 异步流程（见 video-tool.ts / docs/VIDEO_GEN.md）。选模型复用同一个媒体目录缓存
  // 与 video 标签（text-to-video / image-to-video）。
  let videoTools: ToolsServiceLike | undefined
  let disposeVideoTool: (() => void) | undefined
  const syncVideoTool = (value: Config): void => {
    const wanted = videoToolRegionOf(value) !== undefined
    if (wanted && disposeVideoTool === undefined && videoTools !== undefined) {
      disposeVideoTool = registerWorkBuddyVideoTool(videoTools, {
        resolveCredential: async () => {
          const live = current()
          for (const region of REGION_KEYS) {
            if (!regionEnabled(live, region)) continue
            if (regionStateOf(live, region).videoToolEnabled !== true) continue
            try {
              return await stacks[region].store.resolve()
            } catch {
              continue
            }
          }
          return undefined
        },
        listMediaModels: (credential, signal) => client.fetchMediaModels(credential, signal),
        submitVideo: (credential, request, signal) => client.submitVideo(credential, request, signal),
        pollVideoTask: (credential, taskId, signal) => client.pollVideoTask(credential, taskId, signal),
        // 卡片上按模式钉住的模型。读 CURRENT 配置而不是注册组件时读取的数据，和上面
        // resolveCredential 读活值同一个理由：用户可能在两次调用之间改偏好。
        // 区域由凭据自己的登录域决定，所以「国内区钉了 kling、国际区没钉」
        // 这种组合能各按各的来。
        preferredVideoModel: (credential, tag) =>
          regionStateOf(current(), regionOf(credential.domain)).preferredVideoModels?.[tag],
        downloadVideo: (credential, url, signal) => client.downloadVideo(credential, url, signal),
        logger: ctx.logger,
      })
      return
    }
    if (!wanted && disposeVideoTool !== undefined) {
      disposeVideoTool()
      disposeVideoTool = undefined
    }
  }
  ctx.inject(['tools'], (toolsCtx) => {
    videoTools = (toolsCtx as unknown as { tools?: ToolsServiceLike }).tools
    if (videoTools === undefined) return
    syncVideoTool(current())
    toolsCtx.effect(() => () => {
      disposeVideoTool?.()
      disposeVideoTool = undefined
      videoTools = undefined
    })
  })

  // Optional CLI route (`codebuddy_ask` + `/codebuddy`).
  //
  // Mounted the SAME way as the image tool above, and for the same reason: both
  // `tools` and `commands` are host services that can appear after this row, so
  // they are awaited with `ctx.inject` instead of sampled with `ctx.get()` once
  // during apply. Sampling looks identical until the day a Host (Desktop) loads
  // the surface later than the plugin, and then the entrance silently never
  // exists — there is no error, just an empty `/` command list.
  //
  // The runtime (normalized options + ONE shared turn gate) is rebuilt only when
  // the serialized settings actually change, which is what makes this safe to
  // run from the volatile-update listener: re-mounting on every unrelated
  // volatile write would reset the hourly budget the user is being held to.
  let cliTools: BridgeToolsService | undefined
  let cliCommands: BridgeCommandsService | undefined
  // Reads a session's LIVE working directory. Set when the Host publishes its
  // session projections and left undefined otherwise, which is exactly the
  // pre-projection behaviour (the ladder then reads the session header).
  let cliDirectoryOf: DirectoryOf | undefined
  // THE PROBE, not the value. The runtime snapshots `directoryOf` once at
  // `createCliBridgeRuntime`, but `sessionProjections` can arrive AFTER the
  // runtime was built on the tools/commands row — and `syncCliBridge` keys the
  // rebuild on the serialized settings only, so a settings-unchanged rebuild is a
  // no-op and the runtime would keep the `undefined` it captured at build time.
  // Wiring the mutable cell through a stable closure makes the runtime read the
  // CURRENT source on every turn, which is what kills the ordering dependency.
  // `null` from an unset cell is indistinguishable from "no projection service",
  // so the header fallback is unchanged.
  const cliDirectoryProbe: DirectoryOf = (session) => cliDirectoryOf?.(session) ?? null
  let cliRuntime: CliBridgeRuntime | undefined
  let cliRuntimeKey = ''
  let disposeCliTool: (() => void) | undefined
  let disposeCliCommand: (() => void) | undefined

  const disposeCliSurfaces = (): void => {
    disposeCliTool?.()
    disposeCliTool = undefined
    disposeCliCommand?.()
    disposeCliCommand = undefined
  }

  const syncCliBridge = (value: Config): void => {
    const settings = unwrapVolatile(value.cliBridge)
    // The key covers everything that changes behavior; anything else in the
    // settings object is derived from these fields anyway.
    const key = JSON.stringify(settings ?? {})
    if (key !== cliRuntimeKey) {
      cliRuntimeKey = key
      disposeCliSurfaces()
      cliRuntime?.deps.gate?.clear()
      cliRuntime = createCliBridgeRuntime(
        settings,
        REGION_KEYS.map(region => ({ region, store: stacks[region].store })),
        message => ctx.logger.warn(`dsh-connect-workbuddy: ${message}`),
        cliDirectoryProbe,
      )
    }
    if (cliRuntime === undefined) {
      disposeCliSurfaces()
      return
    }
    if (cliTools !== undefined && disposeCliTool === undefined) {
      disposeCliTool = mountToolSurface(cliRuntime, cliTools)
    }
    if (cliCommands !== undefined && disposeCliCommand === undefined) {
      disposeCliCommand = mountCommandSurface(cliRuntime, cliCommands)
    }
  }

  ctx.inject(['tools'], (toolsCtx) => {
    cliTools = (toolsCtx as unknown as { tools?: BridgeToolsService }).tools
    if (cliTools === undefined) return
    syncCliBridge(current())
    toolsCtx.effect(() => () => {
      // Only this surface: the other one may still be mounted on a fiber that
      // outlives this one, and tearing it down here would leave `cliTools`
      // unset but `disposeCliCommand` undefined, so nothing would re-mount it.
      disposeCliTool?.()
      disposeCliTool = undefined
      cliTools = undefined
    })
  })

  ctx.inject(['commands'], (commandsCtx) => {
    cliCommands = (commandsCtx as unknown as { commands?: BridgeCommandsService }).commands
    if (cliCommands === undefined) return
    syncCliBridge(current())
    commandsCtx.effect(() => () => {
      disposeCliCommand?.()
      disposeCliCommand = undefined
      cliCommands = undefined
    })
  })

  // The CLI route's directory source: the Host's session projections.
  //
  // WHY THIS INJECT EXISTS. The bridge used to default a turn's directory to
  // `agent.session.header.cwd`, which the Host documents as detached, deep-frozen
  // creation metadata — the directory the session was OPENED with, not the one it
  // is in now. The live directory is a session projection (key
  // `"workingDirectory"`, committed on every /cd), and it is what the Host itself
  // prints into the model's system prompt. Reading the projection here is what makes
  // /codebuddy and codebuddy_ask agree with the model about where the work is
  // happening.
  //
  // SAME REASON AS THE TWO INJECTS ABOVE: sessionProjections is a host service that
  // can appear after this row, so it is awaited rather than sampled once at apply
  // time. Sampling would lose it on Desktop exactly the way tools and commands were
  // being lost before.
  //
  // DEGRADATION IS THE POINT. A Host without this service leaves cliDirectoryOf
  // undefined, and the bridge then reads the session header — the pre-projection
  // behaviour, unchanged. Nothing here is load-bearing: no route disappears and no
  // turn is refused because of a missing projection.
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    const reader = (projectionCtx as unknown as { sessionProjections?: BridgeProjectionReader })
      .sessionProjections
    if (reader === undefined || typeof reader.stateOf !== 'function') return

    /**
     * The one place the projection key is spelled out.
     *
     * It must match the Host's own registration — key
     * `"workingDirectory"`, stateVersion 1, in the Host's
     * @deepseek-ai/dsh-working-directory package. If the Host renames the key, this is
     * the line that has to follow, and the comment is what tells the next reader
     * where to look.
     *
     * Returns null for `"no committed directory"`, which is the same signal the header
     * path produces when it has nothing — so the ladder below it behaves identically.
     * NOTE what it deliberately does NOT do: fall back to the service's own default.
     * The Host's get() answers stateOf(...) ?? defaultDirectory, and that fallback is
     * the Host process's cwd, i.e. a directory nobody chose. Substituting it here would
     * quietly turn `"we do not know"` into `"use this one"`, which is the one change this
     * whole refactor must not make.
     */
    const WORKING_DIRECTORY_PROJECTION_KEY = 'workingDirectory'
    cliDirectoryOf = (session: unknown): string | null => {
      let state: unknown
      try {
        state = reader.stateOf(session, WORKING_DIRECTORY_PROJECTION_KEY)
      } catch {
        // A projection reader that throws is treated as one that does not exist: the
        // header fallback below still produces a usable directory.
        return null
      }
      if (typeof state !== 'string') return null
      const trimmed = state.trim()
      return trimmed === '' ? null : trimmed
    }

    // Nothing to rebuild: the runtime was wired with `cliDirectoryProbe`, which
    // reads THIS cell on every turn, so the source takes effect on the next call
    // whether the runtime existed before or after this service appeared. (The old
    // code called `syncCliBridge` here expecting a rebuild, but that path keys on
    // the serialized settings — unchanged — so it was a no-op and the projection
    // silently never reached an already-built runtime. The probe is the fix.)

    projectionCtx.effect(() => () => {
      cliDirectoryOf = undefined
    })
  })

  // Same-origin routes backing the Plugin-configuration card. `webServer`
  // can mount after this row, so wait reactively for it instead of sampling
  // ctx.get() once during apply (which silently loses all routes on Desktop).
  ctx.inject(['webServer'], (webCtx) => installPluginStatusRoutes(webCtx, {
    get stacks() { return stacks },
    get client() { return client },
    get accountUsabilityProbe() { return accountUsabilityProbe },
    get cliRuntime() { return cliRuntime },
    get turing() { return turing },
    get config() { return config },
    get writeDeviceSdkEnabled() { return writeDeviceSdkEnabled },
    get displayModels() { return displayModels },
    get current() { return current },
    get liveBusyLevels() { return liveBusyLevels },
    get effectiveImageIds() { return effectiveImageIds },
    get savedOffModelIds() { return savedOffModelIds },
    get discoverModels() { return discoverModels },
    get persistRefreshedModels() { return persistRefreshedModels },
    get readMediaModels() { return readMediaModels },
    get latestForeignThinking() { return latestForeignThinking },
    get creditPositionOf() { return creditPositionOf },
    get quotaRefreshOf() { return quotaRefreshOf },
    get invalidateCatalog() { return invalidateCatalog },
    get poolPreferencesOf() { return poolPreferencesOf },
    get poolMembersOf() { return poolMembersOf },
    get localPoolMembers() { return localPoolMembers },
    get checkinStateCache() { return checkinStateCache },
    get CHECKIN_CACHE_MS() { return CHECKIN_CACHE_MS },
    get benefitStateCache() { return benefitStateCache },
    get applyPoolSelection() { return applyPoolSelection },
    get servingAccountIsExcluded() { return servingAccountIsExcluded },
    get autoCheckinEnabled() { return autoCheckinEnabled },
    get autoCheckinState() { return autoCheckinState },
    get poolTargets() { return poolTargets },
    get poolRunnerDeps() { return poolRunnerDeps },
    get regionTargetModel() { return regionTargetModel },
    get hostSettings() { return hostSettings },
    get settingsNs() { return settingsNs },
    get legacyAccountRegion() { return legacyAccountRegion },
    get ctx() { return ctx },
  }))

  /**
   * The region's nearest monthly quota refresh, or undefined when unknown.
   *
   * The monthly resource (`CapacityType 4`) is the one package that never
   * expires and resets on a cycle, so its `refreshAtMs` is a real answer to
   * "when can I use this again" after the quota runs out. The probe passes it
   * through; a failure to read it is not an error, because a probe without a
   * cooldown is still a useful probe.
   */
  const quotaRefreshOf = async (
    region: WorkBuddyRegion,
    credential: Awaited<ReturnType<WorkBuddyCredentialStore['resolve']>>,
  ): Promise<number | undefined> => {
    try {
      const credits = await client.fetchCredits(credential)
      const refreshes = credits.packages
        .filter(pack => pack.monthly && pack.refreshAtMs !== undefined)
        .map(pack => pack.refreshAtMs as number)
      return refreshes.length === 0 ? undefined : Math.min(...refreshes)
    } catch {
      return undefined
    }
  }

  /**
   * The next account to try for a request whose current account just failed,
   * or `undefined` when this region's pool has nobody left.
   *
   * Reads the pool's EXISTING measurements instead of probing: a request that
   * just failed must not spend further requests deciding who serves next (and a
   * probe of the target model would itself be billed). Candidates are this
   * region's checked-in members in rank order, minus everyone this request has
   * already tried, minus anyone a measurement says cannot serve right now — a
   * limited account whose stated cooldown has not elapsed, or one whose
   * credential the upstream rejected.
   *
   * The pool switch gates this: off means the user's account serves every
   * request and a failure is reported as-is, exactly as before the pool existed.
   *
   * Reads the candidate through `credentialFor()`, never `resolve()`: the saved
   * selection and the store's runtime state stay untouched, so this is
   * per-request borrowing rather than a silent change of who pays.
   *
   * Uses `localPoolMembers`, NOT `poolMembersOf`. This runs on the failure path
   * of a request the user is already waiting on, and `poolMembersOf` fetches
   * credits per member — so the expensive version turned one failed request into
   * N extra upstream calls before the retry even left. The doc above always said
   * "must not spend further requests"; the code used to contradict it. Credits
   * still steer the ranking when a recent snapshot exists, because
   * `localPoolMembers` reads the one the card's poll already paid for.
   */
  const failoverAccountFor = async (
    region: WorkBuddyRegion,
    triedAccountIds: readonly string[],
  ): Promise<WorkBuddyCredential | undefined> => {
    if (!poolPreferencesOf(current(), region).enabled) return undefined
    const tried = new Set(triedAccountIds)
    // The saved manual order, so failover honors the user's preference order
    // (issue #70's expiry guard still outranks it, inside `rankPool`).
    const order = poolPreferencesOf(current(), region).orderAccountIds
    for (const row of rankPool(await localPoolMembers(region), Date.now(), order, true)) {
      // `excludedBy` carries the reason a measurement rules an account out.
      // Skipping on it is what makes "try until none is usable" mean usable
      // rather than merely "not yet tried": re-hitting an account the upstream
      // just limited would burn a round trip to learn what we already recorded.
      if (row.excludedBy !== undefined) continue
      if (tried.has(row.account.id)) continue
      const credential = await stacks[region].store.credentialFor(row.account.id)
      if (credential !== undefined) return credential
    }
    return undefined
  }

  /**
   * Why the pool left a failed request with nowhere to go, in one short clause.
   *
   * Runs ONLY after a request has already failed, so it may afford work the hot
   * path cannot — but it still reads local state only (the probe store and the
   * member list), because spending a network call to explain a failure would add
   * a second delay to a request the user is already waiting on.
   *
   * It counts rather than lists. The reply is one line inside an error message,
   * and enumerating accounts there would bury the advice; the card is where a
   * per-account breakdown belongs, and it already shows one.
   *
   * Returns `undefined` when the pool is OFF or has no members — in which case
   * there is no pool story to tell, and the shim renders its own sentence
   * without one. That is a real state, not a failure: the plugin supports
   * running with no pool at all.
   */
  const explainPoolShortfall = async (region: WorkBuddyRegion): Promise<string | undefined> => {
    if (!poolPreferencesOf(current(), region).enabled) return undefined
    const members = await localPoolMembers(region)
    if (members.length === 0) return undefined
    const nowMs = Date.now()
    // Uses the ranking exclusion rule again. State may have changed since the
    // failed selection, so this explanation is a later observation.
    const excluded = members
      .map(member => ({ id: member.account.id, excludedBy: exclusionOf(member.probe, nowMs) }))
      .filter((entry): entry is { id: string, excludedBy: WorkBuddyPoolExclusion } => entry.excludedBy !== undefined)
    if (excluded.length === 0) {
      // Nothing is excluded, yet failover found no candidate: every member was
      // either already tried this request or has no resolvable credential. The
      // first is the common case and the honest one to report.
      return '池中其余账号本次请求都已尝试过'
    }
    // One clause per DISTINCT reason, with a count, so "三个账号都在冷却" reads
    // as one fact rather than three repetitions of the same sentence.
    const counts = new Map<WorkBuddyPoolExclusion, number>()
    for (const entry of excluded) counts.set(entry.excludedBy, (counts.get(entry.excludedBy) ?? 0) + 1)
    const parts = [...counts.entries()].map(([reason, count]) => `${String(count)} 个${poolExclusionClause(reason)}`)
    return `池中已无可用账号（${parts.join('、')}）`
  }

  /**
   * One exclusion reason as a short Chinese clause for
   * {@link explainPoolShortfall}.
   *
   * Separate from the card's own labels (`exclusion-text.ts` in the client half)
   * on purpose: those are standalone table cells ("被限流"), where these are
   * glued into a sentence and must read after a count ("1 个账号被限流"). Sharing
   * one string would force one of the two to read wrong.
   */
  function poolExclusionClause(reason: WorkBuddyPoolExclusion): string {
    switch (reason) {
      case 'rate-limited': return '账号被限流'
      case 'out-of-credit': return '账号积分耗尽'
      case 'model-busy': return '账号请求的模型繁忙'
      case 'credential-rejected': return '账号登录已失效'
      case 'account-restricted': return '账号被上游限制使用'
      case 'not-found': return '账号已不存在'
      case 'unusable': return '账号不可用'
      default: return '账号不可用'
    }
  }

  /**
   * The last CREDITS reading per region, so a request can rank by balance
   * without fetching one.
   *
   * Balances contribute after eligibility, expiry and manual order, and need upstream reads per
   * member. A chat request must never pay that: it happens on the hot path, and
   * `fetchCredits` per member would turn one page of conversation into N extra
   * requests. So the request path uses whatever the pool last read (the card's
   * 60-second poll, a batch test, or a save) and simply skips the key when the
   * snapshot is too old to speak for today's balances.
   */
  const creditsSnapshot: Partial<Record<WorkBuddyRegion, ReadonlyMap<string, WorkBuddyPoolCredits>>> = {}
  /** How long a credits reading may steer routing. */
  const CREDITS_SNAPSHOT_MS = 10 * 60_000

  /** When each region's snapshot was taken, for the freshness check above. */
  const creditsSnapshotAt: Partial<Record<WorkBuddyRegion, number>> = {}

  /**
   * One region's pool members from LOCAL sources only: the credential store and
   * the probe store, plus the credits snapshot when it is fresh.
   *
   * The request path calls this on every chat completion, so it must not touch
   * the network. `poolMembersOf` is the honest-but-expensive version (it fetches
   * credits per member) and stays on the card's route, which is where those
   * readings come from in the first place.
   */
  async function localPoolMembers(region: WorkBuddyRegion): Promise<WorkBuddyPoolMember[]> {
    const accounts = await poolMemberAccounts(region)
    const probes = await readPoolProbes(region)
    const fresh = Date.now() - (creditsSnapshotAt[region] ?? 0) <= CREDITS_SNAPSHOT_MS
    const credits = fresh ? creditsSnapshot[region] : undefined
    return accounts.map(account => {
      const reading = credits?.get(account.id)
      return {
        account: {
          id: account.id,
          accountName: account.accountName,
          ...account.enterprise === true ? { enterprise: true } : {},
        },
        ...reading === undefined ? {} : { credits: reading },
        ...probes[account.id] === undefined ? {} : { probe: probes[account.id] as WorkBuddyPoolProbe },
        tokenExpiresAtMs: account.tokenExpiresAtMs,
      }
    })
  }

  /**
   * Record a failure a LIVE request hit, so the NEXT request starts from a
   * usable account.
   *
   * Without this the ranking only knew what the manual batch test had measured:
   * an account that had just answered 429 carried no measurement, so
   * `exclusionOf` returned "candidate" and the ranking kept picking it — every
   * request paid one failed round trip before failing over. Keeping traffic off
   * an account the upstream just refused is the pool's whole point
   * (`account-pool.ts` says exactly that about `rate-limited`), and it only
   * works if live failures count as measurements.
   *
   * Deliberately NOT recorded for `client` (HTTP 400): the upstream rejected the
   * REQUEST, which says nothing about the account, and recording it would
   * sideline a good account over a bad body.
   *
   * The reset time comes from the upstream's own words — the 429 body carries
   * 「将在 … 重置」 — which `cooldownOf` parses. When it states no time, the store's
   * own short window applies rather than a guess at a long one.
   *
   * THE QUOTA REFRESH POINT IS PASSED IN, and it is not decoration. This path
   * used to omit `quotaRefreshAtMs` while the PROBE path supplied it, so one
   * `out-of-credit` failure got two different answers depending on which door it
   * arrived through: the probe said "the quota refreshes on the 1st" (a time the
   * billing side states outright) while a live chat failure said "30 minutes
   * from now" — a window the account cannot possibly clear, so the pool put it
   * back and paid another refused round trip. Worse, the write below combines
   * with the stored record, and the stored refresh point was being LOST in the
   * process (see {@link mergePoolProbe}).
   *
   * Reading it costs one `fetchCredits`, affordable here but not on every
   * failure: it runs only for `out-of-credit`, where the refresh point is the one
   * honest answer and there is no cheaper source. Failing to read it is not an
   * error — the fallback still applies.
   *
   * The upstream's text is persisted alongside the outcome so the card can name
   * the reason. It is REDACTED first because this message is a raw upstream body:
   * without that, a failure containing a token-shaped string would write it into
   * a file on disk.
   */
  const recordAccountFailure = async (
    region: WorkBuddyRegion,
    accountId: string,
    failure: { status: number, kind: UpstreamErrorKind, message: string, modelId?: string },
  ): Promise<void> => {
    if (!poolPreferencesOf(current(), region).enabled) return
    if (failure.kind === 'client') return
    // A request that never reached an HTTP response says nothing about the
    // account: it is the transport, not the model. Persisting it would bench a
    // healthy account for POOL_UNKNOWN_COOLDOWN_MS (30 minutes), because a
    // transport failure carries no `retryAtMs` — the same defect that let one
    // probe timeout empty the pool. `status: 0` is this codebase's convention
    // for "no HTTP response observed" (see probeChat and chatStream);
    // it does not prove the server received no bytes.
    if (failure.status === 0) return
    // Only accounts this pool covers. Membership is the explicit "yes, spend
    // this account's credits" tick, and a measurement steers routing.
    const members = poolPreferencesOf(current(), region).memberAccountIds
    if (members.length > 0 && !members.includes(accountId)) return
    const outcome = outcomeOfFailure(failure.status, failure.message)
    // Only for the outcome that HAS a real answer to look up. `quotaRefreshOf`
    // makes an upstream call, and a rate limit or a transport blip has no
    // refresh point to find — paying for that read would spend a request to
    // learn nothing.
    const quotaRefreshAtMs = outcome === 'out-of-credit'
      ? await stacks[region].store.credentialFor(accountId)
        .then(credential => credential === undefined ? undefined : quotaRefreshOf(region, credential))
        .catch(() => undefined)
      : undefined
    const { retryAtMs } = cooldownOf({
      outcome,
      retryAfter: null,
      nowMs: Date.now(),
      body: failure.message,
      ...quotaRefreshAtMs === undefined ? {} : { quotaRefreshAtMs },
    })
    const message = failure.message === '' ? '' : redactUpstreamText(failure.message)
    await writePoolProbes(region, {
      [accountId]: {
        outcome,
        atMs: Date.now(),
        // Named explicitly, because this site OVERWRITES whatever the last
        // "test" measured. Without the label, a user who watched this account
        // measure `ok` and then found it limited had no way to tell "a live
        // request really hit the limit just now" from "the file went back to
        // an older value" — and the record kept no history to check.
        source: 'live-request',
        // WHICH model failed (issue #61). `6004` is account × model, so a live
        // failure on model A must not read as a statement about model B — nor
        // erase the fact that a different model once answered.
        ...failure.modelId === undefined ? {} : { modelId: failure.modelId },
        ...retryAtMs === undefined ? {} : { retryAtMs },
        ...message === '' ? {} : { message },
      },
    })
  }

  /**
   * Point this region's store at whoever the pool's ranking says should serve.
   *
   * Called once per chat request. With the pool ON the ranking decides the
   * serving account — the whole point of the switch, and the reason the card can
   * show a "current account" that is not simply the saved selection. With the
   * pool OFF the override is CLEARED, which restores the user's own choice
   * immediately: leaving a stale override in place would keep billing under a
   * switch that reads as off.
   *
   * The override is runtime-only and never written to settings, so the user's
   * recorded choice survives untouched either way — turning the pool off gives
   * it back verbatim.
   *
   * Best-effort: a failure here leaves the previous state in effect, and the
   * request still goes out (to the user's account when the pool is off, which is
   * the safe default).
   */
  const applyPoolSelection = async (region: WorkBuddyRegion): Promise<boolean> => {
    const store = stacks[region].store
    if (!poolPreferencesOf(current(), region).enabled) {
      store.setRotatedAccount(undefined)
      return true
    }
    const ranked = rankPool(await localPoolMembers(region), Date.now(), poolPreferencesOf(current(), region).orderAccountIds, true)
    const winner = ranked.find(row => row.excludedBy === undefined)
    // 备用未解锁且没有前序候选时返回 false，阻止请求回退到保存账号。
    // 其他没有候选的情况保留原有选择回退行为。
    store.setRotatedAccount(winner?.account.id)
    return winner !== undefined || !ranked.some(row => row.excludedBy === 'reserved')
  }

  /**
   * Whether the account the store would bill is one the pool has measured as
   * unusable.
   *
   * The two questions differ exactly when the pool runs out of usable members: a
   * REQUEST still has to go somewhere (the saved selection), but the CARD must
   * not label that account "in use" while the same table says it is rate-limited.
   * One screen contradicting itself is how a user learns to trust neither half —
   * and "the pool moved to an available account" is unverifiable if the display
   * keeps naming an account the table calls excluded.
   */
  const servingAccountIsExcluded = async (region: WorkBuddyRegion): Promise<boolean> => {
    if (!poolPreferencesOf(current(), region).enabled) return false
    const credential = await stacks[region].store.current().catch(() => undefined)
    if (credential === undefined) return false
    const servingId = workbuddyAccountId(credential)
    const row = rankPool(await localPoolMembers(region), Date.now(), poolPreferencesOf(current(), region).orderAccountIds, true)
      .find(candidate => candidate.account.id === servingId)
    // Not a member at all (unchecked, or the pool is empty) means the pool has no
    // opinion, so it must not assert one.
    return row !== undefined && row.excludedBy !== undefined
  }

  /**
   * One region's POOL members, each with its credits and last measurement.
   *
   * Only CHECKED accounts: an unchecked account is not a candidate to bill, so
   * it must not reach the ranking that decides who serves.
   *
   * Read through `credentialFor()` — never `resolve()` — so no account's
   * selection state is touched: a batch must measure every member without
   * changing which one is billing. Credits are fetched per account and a
   * failure degrades to "unknown" for that row only — one unreadable balance
   * must not blank the whole pool.
   */
  async function poolMembersOf(region: WorkBuddyRegion): Promise<WorkBuddyPoolMember[]> {
    const store = stacks[region].store
    const accounts = await poolMemberAccounts(region)
    const probes = await readPoolProbes(region)
    const rows = await Promise.all(accounts.map(async account => {
      const credential = await store.credentialFor(account.id).catch(() => undefined)
      const credits = credential === undefined
        ? undefined
        : await client.fetchCredits(credential).catch(() => undefined)
      return {
        account: {
          id: account.id,
          accountName: account.accountName,
          ...account.enterprise === true ? { enterprise: true } : {},
        },
        ...credits === undefined ? {} : {
          credits: {
            // The upstream client already aggregates these two, and the card
            // displays the same figures — so re-deriving them here would let
            // the pool and the card disagree about one account's expiry.
            total: credits.total,
            expiringSoon: credits.expiringSoon,
            ...credits.nearestExpiryMs === undefined
              ? {}
              : { nearestExpiryMs: credits.nearestExpiryMs },
          },
        },
        ...probes[account.id] === undefined ? {} : { probe: probes[account.id] as WorkBuddyPoolProbe },
        tokenExpiresAtMs: account.tokenExpiresAtMs,
      }
    }))
    // Remember the balances for the REQUEST path, which cannot afford to fetch
    // them (`localPoolMembers`). Written here because this is the one place the
    // pool pays for a credits reading — the card's poll and every batch test run
    // through it — so the snapshot is exactly as fresh as the numbers the user
    // is looking at.
    creditsSnapshot[region] = new Map(
      rows
        .filter(row => row.credits !== undefined)
        .map(row => [row.account.id, row.credits as WorkBuddyPoolCredits]),
    )
    creditsSnapshotAt[region] = Date.now()
    return rows
  }

  /**
   * The model a per-row test would use right now: the SAME resolution the
   * batch route performs (`resolveTargetModel` over the region's displayed
   * catalog and the saved region preference). There is no per-account override.
   * A settings change between requests can still select a different model.
   * Undefined mirrors the route's 409 states.
   */
  const regionTargetModel = (region: WorkBuddyRegion): string | undefined => {
    const target = resolveTargetModel(
      displayModels(current(), region),
      poolPreferencesOf(current(), region).targetModelId,
    )
    return target.modelId
  }

  /** One region's pool preferences, with the schema's defaults applied. */
  /**
   * WHERE this region's credit readout sits (issue #62).
   *
   * A local reader rather than a schema default so a config written before the
   * setting existed reads as `composer` — the seat that was the only one, so an
   * upgrade moves nothing on screen.
   */
  const creditPositionOf = (config: Config, region: WorkBuddyRegion): WorkBuddyCreditPosition =>
    regionStateOf(config, region).creditPosition === 'stats' ? 'stats' : 'composer'

  const poolPreferencesOf = (config: Config, region: WorkBuddyRegion) => {
    const pool = regionStateOf(config, region).pool
    const probeInputTokens = pool?.probeInputTokens
    return {
      enabled: pool?.enabled === true,
      targetModelId: pool?.targetModelId ?? '',
      // Passed through as a plain copy: the config value is a live cosmokit
      // reference on the 0.1.7 line, and handing that to a route would let a
      // settings mutation change what a running request resolves against.
      // Passed through RAW (not coerced here): `resolveProbeInputTokens` owns
      // that decision and is the only place that knows the offered set. Coercing
      // in two places is how a menu and its validation drift apart.
      //
      // Spread rather than assigned, because `exactOptionalPropertyTypes` makes
      // an explicit `undefined` a different thing from an absent key — and the
      // consumers of this type rely on absence meaning "never chose".
      ...probeInputTokens === undefined ? {} : { probeInputTokens },
      memberAccountIds: pool?.memberAccountIds ?? [],
      orderAccountIds: pool?.orderAccountIds?.length ? pool.orderAccountIds : pool?.memberAccountIds ?? [],
      // `=== true`, not `?? false`: an older profile has no key at all, and an
      // absent answer must read as OFF — this switch authorises a real WRITE.
      autoCheckin: pool?.autoCheckin === true,
    }
  }

  /**
   * The accounts the user has checked into this region's pool.
   *
   * Membership is an EXPLICIT opt-in list, not "every local sign-in": the two
   * batch actions spend real credits and claim real rewards, so which accounts
   * they touch has to be the user's decision rather than a side effect of
   * having signed in on this machine. An account that is not checked is
   * untouched by check-in, testing, and rotation alike.
   */
  async function poolMemberAccounts(region: WorkBuddyRegion) {
    const saved = poolPreferencesOf(current(), region).memberAccountIds
    if (saved.length === 0) return []
    const accounts = await stacks[region].store.accounts()
    const byId = new Map(accounts.map(account => [account.id, account]))
    // The shared rule ANSWERS this question and this site only supplies the
    // store's order (see `effectiveMembersOf`'s contract) plus the id→row
    // lookup. The obvious shape — filter `accounts` by a set built from the
    // rule — is deceptive: it makes the delegation unobservable, because
    // `accounts.filter(id ∈ (store ∩ saved))` collapses to `accounts ∩ saved`
    // for ANY membership rule at all. That version passed every test while the
    // rule could have been deleted; the independent verification proved it. So
    // the rule's own output drives the result.
    return effectiveMembersOf(
      accounts.map(account => account.id),
      new Set(saved),
    ).flatMap(id => {
      const account = byId.get(id)
      return account === undefined ? [] : [account]
    })
  }

  /** The batch runner's view of one region's pool members. */
  async function poolTargets(region: WorkBuddyRegion): Promise<WorkBuddyPoolTarget[]> {
    const accounts = await poolMemberAccounts(region)
    return accounts.map(account => ({
      accountId: account.id,
      accountName: account.accountName,
      // Enterprise members have no consumer check-in (issue #124); the runner
      // skips them instead of spending a request on a refusal it can predict.
      ...account.enterprise === true ? { enterprise: true } : {},
    }))
  }

  /**
   * The two actions' shared dependency set.
   *
   * `credentialFor` — never `resolve()` — is what makes a batch possible at
   * all: it fetches any account's credential WITHOUT changing the region's
   * selection, so testing every account cannot switch the account that bills
   * the user's live traffic.
   */
  function poolRunnerDeps(region: WorkBuddyRegion): WorkBuddyPoolRunnerDeps {
    const store = stacks[region].store
    return {
      credentialFor: accountId => store.credentialFor(accountId),
      fetchCheckinStatus: credential => client.fetchCheckinStatus(credential),
      claimDailyCheckin: credential => client.claimDailyCheckin(credential),
      probe: async (credential, modelId) => {
        // The SAME quota-refresh input the single-model probe route passes.
        // Without it an exhausted account reports "the upstream gave no time",
        // so the card could not say when a drained account returns — and the
        // pool would re-test it blindly instead of waiting for the reset. The
        // read is best-effort: a probe without a cooldown is still a useful
        // probe (see `quotaRefreshOf`).
        const quotaRefreshAtMs = await quotaRefreshOf(region, credential)
        // The user's chosen probe size, coerced against the offered set. Read
        // HERE rather than captured when these deps were built, so changing the
        // setting takes effect on the very next test rather than the next reload.
        const inputTokens = resolveProbeInputTokens(
          poolPreferencesOf(current(), region).probeInputTokens,
        )
        return probeModel({
          client,
          credential,
          modelId,
          nowMs: Date.now(),
          inputTokens,
          ...quotaRefreshAtMs === undefined ? {} : { quotaRefreshAtMs },
        })
      },
    }
  }

  /**
   * The automatic daily check-in (issue #191).
   *
   * A single timer per region, armed only when the user ticks the switch. The
   * rules live in `src/auto-checkin.ts` (pure) and the memory in
   * `src/auto-checkin-store.ts`; this block owns only the two things those
   * modules deliberately do not: a real clock and a real batch call.
   *
   * ## Why a re-arming one-shot instead of `setInterval`
   *
   * The interval is not constant: a failure walks a widening backoff, a finished
   * day idles, and a day rollover resets everything. `setInterval` can only
   * express a fixed period, so the delay is computed per tick and the timer is
   * re-armed from the tick's own `finally`. The alternative — a 30-minute
   * `setInterval` plus "is it due?" inside — would sleep past the short first
   * retries (30 s, 60 s) and make a transient fault look like a 30-minute outage.
   *
   * ## Why the timer never stops
   *
   * Even when the day is finished the timer re-arms at {@link AUTO_CHECKIN_IDLE_MS}.
   * A timer that stops after its first successful day cannot notice the next
   * local midnight, so the feature would silently work exactly once — the
   * failure mode this whole design exists to avoid. The idle tick costs no
   * request: `isDue` answers "nothing pending" before any I/O.
   *
   * ## Why it is safe to run alongside a manual press
   *
   * `checkinAllAccounts` reads status before claiming. That avoids a write when
   * the read reports completion, but overlapping manual and automatic runs can
   * both read incomplete state and attempt a claim. Serial order within one
   * batch does not serialize different batches.
   */
  const autoCheckinTimers: Partial<Record<WorkBuddyRegion, ReturnType<typeof setTimeout>>> = {}
  /** In-memory mirror of the on-disk state, so a tick does not re-read the file. */
  const autoCheckinState: Partial<Record<WorkBuddyRegion, AutoCheckinState>> = {}
  /** Guards against a second tick landing while one is still running. */
  const autoCheckinRunning: Partial<Record<WorkBuddyRegion, boolean>> = {}

  /** Whether the user has asked for the background check-in on this region. */
  function autoCheckinEnabled(region: WorkBuddyRegion): boolean {
    if (!autoCheckinRegions().includes(region)) return false
    return poolPreferencesOf(current(), region).autoCheckin === true
  }

  /**
   * One tick: decide, run, fold, persist, re-arm.
   *
   * Deliberately never throws — a background feature that can take down `apply`
   * (or a later tick) over a disk error would be worse than not having it.
   */
  async function autoCheckinTick(region: WorkBuddyRegion): Promise<void> {
    if (autoCheckinRunning[region] === true) return
    autoCheckinRunning[region] = true
    try {
      // Read the switch EVERY tick, not once at `apply`: turning it off must
      // stop the next tick, and the settings object is live.
      if (!autoCheckinEnabled(region)) return
      const nowMs = Date.now()
      const today = localDayKey(nowMs)
      const stored = autoCheckinState[region] ?? await readAutoCheckinState(region)
      // A new local day resets everything. `day` is the only field that decides
      // this, so a clock change (a laptop crossing a timezone) simply starts a
      // fresh day rather than trusting a stale `doneAccountIds`.
      const state = stored === undefined || stored.day !== today
        ? emptyAutoCheckinState(today)
        : stored
      autoCheckinState[region] = state
      const targets = pendingTargets(await poolTargets(region), state)
      if (!isDue(state, targets.length, nowMs)) {
        // Nothing owed right now. Re-arm and do NO I/O — this is the branch that
        // makes an idle day cost nothing.
        scheduleAutoCheckin(region, AUTO_CHECKIN_IDLE_MS)
        return
      }
      const rows = await checkinAllAccounts(targets, poolRunnerDeps(region))
      // Drop the cached readings for accounts this batch touched, exactly as the
      // manual action does, so the card's column reflects the result at once.
      for (const row of rows) {
        if (row.status === 'failed') continue
        const cached = checkinStateCache[region]
        if (cached !== undefined) delete cached[row.accountId]
      }
      // `scopeSize` is the count this attempt was measured against: pending
      // targets PLUS whatever the day already settled, which is the honest
      // denominator for "N of M" even after a membership edit.
      const folded = foldAttempt(state, rows, nowMs, targets.length + state.doneAccountIds.length)
      autoCheckinState[region] = folded
      await writeAutoCheckinState(region, folded)
      const pending = pendingTargets(await poolTargets(region), folded).length
      scheduleAutoCheckin(region, nextDelayMs(folded, pending) ?? AUTO_CHECKIN_IDLE_MS)
    } catch (error: unknown) {
      // A throw here is OUR fault (a store read, a pool enumeration), not the
      // upstream's. Log it and re-arm on the slow clock so one bad tick cannot
      // stop the feature for the rest of the day.
      ctx.logger.warn(`dsh-connect-workbuddy: auto check-in tick failed (${region})`, error)
      scheduleAutoCheckin(region, AUTO_CHECKIN_IDLE_MS)
    } finally {
      autoCheckinRunning[region] = false
    }
  }

  /** Arm the next tick, replacing any pending one. */
  function scheduleAutoCheckin(region: WorkBuddyRegion, delayMs: number): void {
    const existing = autoCheckinTimers[region]
    if (existing !== undefined) clearTimeout(existing)
    const timer = setTimeout(() => { void autoCheckinTick(region) }, delayMs)
    // A pending check-in must not hold the host process open: this is a
    // convenience, and a host that is shutting down should not wait 30 minutes
    // for it. (Tests' fake timers have no `unref`.)
    timer.unref?.()
    autoCheckinTimers[region] = timer
  }

  /**
   * Arm or disarm every region to match the saved switches.
   *
   * Called once at `apply` and again on every settings change, so flipping the
   * switch takes effect without a restart. Disarming clears the pending timer. A batch already in progress can
   * continue until its current work completes; clearing a timer does not cancel I/O.
   */
  function syncAutoCheckin(): void {
    for (const region of autoCheckinRegions()) {
      if (autoCheckinEnabled(region)) {
        if (autoCheckinTimers[region] === undefined) scheduleAutoCheckin(region, 0)
        continue
      }
      const timer = autoCheckinTimers[region]
      if (timer !== undefined) {
        clearTimeout(timer)
        delete autoCheckinTimers[region]
      }
    }
  }

  /** Stop every timer; called on unload. */
  function stopAutoCheckin(): void {
    for (const region of autoCheckinRegions()) {
      const timer = autoCheckinTimers[region]
      if (timer !== undefined) clearTimeout(timer)
      delete autoCheckinTimers[region]
    }
  }

  syncAutoCheckin()
  ctx.effect(() => () => { stopAutoCheckin() })

  // Settings registration (0.1.7+ only).
  // `SettingsForms` dropped `installSection` entirely and exposes
  // `configure({auto}, owner)`; calling the removed method unconditionally made
  // `apply()` throw on 0.1.7 (`ctx.settings.installSection is not a function`)
  // and took down the WHOLE plugin. Since 2.1.0 the plugin supports DSH
  // 0.1.7-rc.1 and up only, so `configure` is the sole path and is called
  // unconditionally — the pre-0.1.7 `SettingsProvider.installSection` branch
  // is gone with the line it served.
  //
  // The call goes through a narrow local type rather than a blanket `any`: the
  // installed typings describe the 0.1.5 line only, so `configure` is not on
  // `SettingsProvider` and the event names below are not in `Events`. Naming
  // the shapes here keeps the widening honest and reviewable.
  interface SettingsShapes {
    configure: (presentation: { auto?: boolean }, owner?: unknown) => () => void
    /**
     * 写入指定设置命名空间中的字段，供卡片 SDK 总开关使用。
     * DSH 0.1.7 起支持该服务；不支持时卡片显示只读状态，避免整页抛出异常。
     */
    update?: (ns: string, patch: Record<string, unknown>) => Promise<unknown>
  }

  // `inject` rather than a direct read: `settings` is an optional service, and
  // the callback runs once it is actually present. `configure` returns a
  // disposer that must be registered with the calling plugin's effects, or the
  // presentation policy leaks past disposal (the first-party plugins do the
  // same: `child.effect(() => child.settings.configure({ auto: false }, …))`).
  ctx.inject(['settings'], (sctx) => {
    const settings = sctx.settings as unknown as SettingsShapes
    ctx.effect(() => settings.configure({ auto: true }, ctx.fiber))
  })

  /**
   * Host-side writer for the SDK master switch. Other card settings have
   * their own write paths.
   *
   * Resolved lazily (not captured at mount) because `settings` is an optional
   * service and the card may ask before that service is present — a captured
   * `undefined` would make the switch permanently read-only on that host.
   * Returns `false` rather than throwing when the host has no `update`: the
   * panel renders the same switch either way, and a thrown error there would
   * surface as "saving failed" for a capability the host simply lacks.
   *
   * ⚠️ The namespace MUST be `settingsNs` — the Loader entry id the host
   * actually serves — never the declared `WORKBUDDY_SETTINGS_NS` fallback. The
   * settings service resolves an entry by EXACT id
   * (`entries().find(row => row.options.id === ns)`) and throws
   * `No configurable plugin entry "workbuddy"` for a name it does not serve.
   * Every other write path here already threads `settingsNs`
   * (`writeRegionCatalog`, `healRegionsField`, the `__save` route); this one
   * shipped with the bare constant, so on the live Desktop host — whose entry is
   * `include:dsh-connect-workbuddy` — the switch answered HTTP 500 and could
   * never be turned on.
   */
  const writeDeviceSdkEnabled = async (enabled: boolean): Promise<boolean> => {
    const host = ctx.get('settings') as unknown as SettingsShapes | undefined
    if (host?.update === undefined) return false
    await host.update(settingsNs, { deviceSdkEnabled: enabled })
    return true
  }

  // 0.1.7 hands volatile values back as live references and announces each
  // write on this event, so the card's selections are re-read after one. The
  // event does not exist on 0.1.5, which never emits it.
  ;(ctx as unknown as { on(name: string, listener: () => void): unknown })
    .on('loader/volatile-update', () => {
      applySelection(current())
      // The auto check-in switch lives in the same volatile region slot, so this
      // is also where turning it on or off takes effect — without a restart.
      syncAutoCheckin()
    })

  // Initial wiring: selections, per-region catalogs from the saved state.
  applySelection(config)

  // Attribute the legacy single-account selection to its own region once the
  // local scan can tell which one that is, then re-apply. Until this resolves
  // (or when no legacy field exists) both regions simply run their defaults.
  void (async () => {
    try {
      const region = await legacyAttributionRegion(current(), async candidate =>
        stacks[candidate].store.accounts())
      if (region === undefined) {
        // Either no legacy field, or the saved account vanished (the app
        // replaced its sign-in): both regions keep their defaults and the card
        // lets the user re-select.
        return
      }
      legacyAccountRegion = region
      applySelection(current())
    } catch {
      // Scan failure: keep defaults; the next card-driven scan converges.
    }
  })()

  let stopped = false

  ctx.effect(() => () => {
    stopped = true
    for (const region of REGION_KEYS) void stacks[region].shim.close()
    void clearHostHeartbeat()
  })

  void Promise.all(REGION_KEYS.map(region => stacks[region].shim.ready))
    .then(async () => {
      if (stopped) return

      const adapters = {} as Record<WorkBuddyRegion, WorkBuddyAdapter>
      // The host services that can fold history are optional: a host without the
      // compaction bundle loaded simply has no `compaction` service, and the
      // rescue then reports "nothing folded" instead of failing a request.
      // Resolved per attempt rather than captured, because plugin load order
      // decides when each service exists.
      const hostService = <Service>(name: string): Service | undefined =>
        (ctx as unknown as { get(service: string): unknown }).get(name) as Service | undefined
      const contextRescue = createContextRescue(() => ({
        meter: hostService<RescueTokenMeter>('tokenMeter'),
        compaction: hostService<RescueCompaction>('compaction'),
        agents: hostService<RescueAgents>('agents'),
        log: (message: string, error?: unknown) => { ctx.logger.warn(message, error) },
      }))
      try {
        // Constructed only once the listeners hold their ports: a provider's
        // models read the shim origin at construction time.
        for (const region of REGION_KEYS) {
          adapters[region] = createWorkBuddyAdapter({
            shim: stacks[region].shim,
            store: stacks[region].store,
            catalog: stacks[region].catalog,
            provider: WORKBUDDY_PROVIDERS[region],
            displayName: WORKBUDDY_PROVIDER_DISPLAY_NAMES[region],
            resolveAttachments: () => ctx.get('attachments'),
            resolveContextRescue: () => contextRescue,
            /**
             * Issue #179: the per-model default tier, read LIVE for the same
             * reason as the switch below — the card saves it mid-session, and a
             * captured map would keep dispatching the old tier until a reload.
             *
             * `current()` rather than the captured `config` is what makes a save
             * take effect on the very next request; `applySelection` still runs
             * `invalidateCatalog()` on the same write, which is what re-publishes
             * the advertised `defaultEffort` to the host's model catalog.
             */
            defaultThinkingEfforts: () => regionStateOf(current(), region).defaultThinkingEfforts ?? {},
            // Read through `current()` (not the captured `config`) so the
            // switch applies to the NEXT request: the user turns it on while
            // looking at a working-notes turn, and a stale capture would make
            // that look like a broken toggle.
            dropForeignThinking: () => unwrapVolatile(current().dropForeignThinking) === true,
            onForeignThinking: blocks => {
              latestForeignThinking = { blocks, atMs: Date.now() }
              // Cross-provider blocks are dropped even when the switch is off.
              // Name that edit in the log: it changes bytes the upstream would
              // otherwise count, and the user may be looking for the reason
              // their transcript lost the other provider's working notes.
              if (unwrapVolatile(current().dropForeignThinking) !== true) {
                ctx.logger.warn(
                  `dsh-connect-workbuddy: dropped ${blocks.length} cross-provider thinking block(s) `
                  + 'before a WorkBuddy request (provider switch); see issue #163',
                )
              }
            },
          })
        }
        invalidateCatalog = () => {
          for (const region of REGION_KEYS) adapters[region].invalidate()
        }

        let releaseAdapterCn: (() => void) | undefined
        let releaseAdapterGlobal: (() => void) | undefined
        let releaseDirectory: (() => void) | undefined
        try {
          // Always register the route first: an empty INITIAL registration is
          // invalid (`INVALID_ADAPTER`), while `replace([])` on a live one is
          // explicitly legal. `syncRegionRegistration` below then withdraws the
          // route for a region the user has switched off, in the same synchronous
          // section, so nothing observes the transient route.
          releaseAdapterCn = registration.cn.adapter = ctx.llm.registerAdapter([WORKBUDDY_PROVIDER], adapters.cn.adapter)
          releaseAdapterGlobal = registration.global.adapter = ctx.llm.registerAdapter([WORKBUDDY_GLOBAL_PROVIDER], adapters.global.adapter)
          releaseDirectory = registration.cn.directory = ctx.llm.registerConfigurableProviders([
            {
              provider: WORKBUDDY_PROVIDER,
              displayName: WORKBUDDY_PROVIDER_DISPLAY_NAMES.cn,
              settingsNs,
              settingsPath: [],
              declared: false,
            },
            {
              provider: WORKBUDDY_GLOBAL_PROVIDER,
              displayName: WORKBUDDY_PROVIDER_DISPLAY_NAMES.global,
              settingsNs,
              settingsPath: [],
              declared: false,
            },
          ])
        } finally {
          if (releaseAdapterCn === undefined || releaseAdapterGlobal === undefined || releaseDirectory === undefined) {
            // Registration threw; release whichever half landed.
            releaseAdapterCn?.()
            releaseAdapterGlobal?.()
            releaseDirectory?.()
          }
        }
        try {
          ctx.effect(() => () => {
            releaseAdapterCn?.()
            releaseAdapterGlobal?.()
            releaseDirectory?.()
          })
        } catch {
          // The plugin was disposed during registration; release immediately —
          // the plugin-level disposer already closed the shims.
          releaseAdapterCn?.()
          releaseAdapterGlobal?.()
          releaseDirectory?.()
        }

        // Converge both regions on the saved on/off state: a region switched off
        // while the harness was down is withdrawn here, before the startup seed
        // below. `syncRegionRegistration` is a no-op for the freshly registered
        // routes until this very call populates their handles.
        syncRegionRegistration(current())

        ctx.llm.registerModelDiscovery(settingsNs, async (request, signal) => {
          const region = regionOfProvider(request.provider ?? '')
          if (region === undefined) return []
          // A switched-off region advertises nothing: its route is withdrawn, so
          // this is defence in depth against a stale model-picker refresh.
          if (!regionEnabled(current(), region)) return []
          const discovered = await discoverModels(region, signal)
          // Load levels are stamped on the RUNTIME roster only — see
          // `withBusyLevels` for why the settings draft stays free of them.
          const live = await withBusyLevels(region, discovered, signal)
          const state = regionStateOf(current(), region)
          const next = withImageSelection(
            deriveCatalog(
              live,
              new Set(state.enabledModelIds ?? []),
              state.contextBudgets ?? {},
            ),
            // #168: a discovery read is exactly the path that reveals a NEW
            // model, so an unedited region must be seeded from the table here
            // rather than from the array a previous refresh wrote.
            effectiveImageIds(state, live),
          )
          return next.map(model => ({
            id: model.id,
            name: workBuddyDisplayName(model),
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens,
            inputModalities: workBuddyModelInput(model),
          }))
        })

        // The host bundle is live: write a heartbeat so the status CLI can
        // report host health without a browser. Cleared on disposal; a stale
        // heartbeat after a crash is detected by PID in the reader.
        void writeHostHeartbeat()
      } catch (error: unknown) {
        ctx.logger.error('dsh-connect-workbuddy: provider registration failed', error)
        return
      }

      // Seed each region's catalog from that region's selected account (or the
      // live sign-in default when nothing is selected yet).
      if (stopped) return

      // Heal the FIELD before anything depends on the other write paths: the
      // catalog repair below also cleans it, but only after a live roster lands
      // (so never for a disabled region, an offline start, or an empty answer).
      // The boot does not wait for it — the write only changes the file's shape,
      // and the read side is already healed in memory — but the repair below
      // DOES await it, because two full-field writers racing could otherwise
      // land the older directory last and undo the repair for this boot.
      const regionsFieldHealed = healRegionsFieldIfCorrupt()

      for (const region of REGION_KEYS) {
        // A switched-off region is skipped entirely: its route is withdrawn, so
        // the request would be pure waste — and skipping it is also what keeps a
        // disabled region from contributing an error to the log on every start.
        if (!regionEnabled(current(), region)) continue
        void (async () => {
          try {
            const credential = await stacks[region].store.resolve()
            const models = await withBusyLevels(
              region,
              await client.fetchModels(
                credential,
                undefined,
                regionStateOf(current(), region).enabledModelIds ?? [],
              ),
            )
            if (stopped) return
            const state = regionStateOf(current(), region)
            stacks[region].catalog.set(withEffectiveOff(
              withImageSelection(
                deriveCatalog(models, new Set(state.enabledModelIds ?? []), state.contextBudgets ?? {}),
                // #168: the startup seed is the FIFTH writer of `multimodal` and
                // the one that decides what the picker shows for a whole
                // session. Seeding it from the stored array is what froze a
                // newly-added verified-multimodal model at `['text']`.
                effectiveImageIds(state, models),
              ),
              new Set(savedOffModelIds(state, models)),
            ))
            adapters[region].invalidate()
            // Record when THIS machine first saw each id of the roster that just
            // landed — the whole "· N 新模型" story. This is the ONLY writer of
            // that history; the usage route answering the pill is read-only, so
            // a panel poll can never change "who is new".
            //
            // A failure is a warning, NOT a reason to fall back to the static
            // list (the catalog above is already set), and it is logged with its
            // reason rather than silently answered as "no new models": those are
            // two entirely different facts.
            try {
              await stacks[region].rosterSeen.note(models.map(model => model.id))
            } catch (error: unknown) {
              ctx.logger.warn(`dsh-connect-workbuddy: ${region} first-sighting history not updated`, error)
            }
            // `lastCatalog` is deliberately NOT seeded here: it belongs to the
            // user's saved selection, written only by the card's explicit save
            // (via settingsScope). Until then the card shows the live fallback
            // directory and one press of "Refresh" captures the real one.
            //
            // BUT A STALE DIRECTORY IS REPAIRED (issues #114/#115). A directory
            // written by an older build — or one that a cold start seeded with
            // the static fallback table — would keep the roster frozen at that
            // snapshot, and the card's next save would write it back. So the
            // directory is healed against the roster that just landed. The
            // repair writes only when the fingerprint differs, so a profile
            // already in agreement is never touched.
            //
            // The shape heal goes first, so the directory this describes is the
            // CLEANED one: the repair reads the field through `describe()` right
            // before writing, and awaiting here is what keeps the two writers
            // from landing out of order.
            await regionsFieldHealed
            await repairRegionCatalog(region, models)
          } catch (error: unknown) {
            ctx.logger.warn(
              `dsh-connect-workbuddy: dynamic ${region} model catalog unavailable; serving the static fallback list`,
              error,
            )
          }
        })()
      }
    })
    .catch((error: unknown) => {
      ctx.logger.error('dsh-connect-workbuddy: loopback endpoint failed to start; providers not registered', error)
    })
}
