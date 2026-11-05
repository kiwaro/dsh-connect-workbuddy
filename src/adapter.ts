import { WORKBUDDY_PROVIDER, WORKBUDDY_MODEL_IDENTITY, modelIdentityKeysOf } from './adapter-identity.ts'
export { WORKBUDDY_PROVIDER, WORKBUDDY_GLOBAL_PROVIDER, WORKBUDDY_PROVIDERS, WORKBUDDY_MODEL_IDENTITY, HOST_FOREIGN_API, modelIdentityKeysOf, regionOfProvider, WORKBUDDY_PROVIDER_DISPLAY_NAMES } from './adapter-identity.ts'
import { workBuddyThinkingLevelMap, toPiModel } from './adapter-model.ts'
export { workBuddyModelInput, workBuddyDisplayName, workBuddyThinkingLevelMap } from './adapter-model.ts'
import { withLegacyContext } from './adapter-transcript.ts'
export { adaptLegacyPiAiContext, alignAssistantIdentities, foreignThinkingOf, crossProviderThinkingOf, dropForeignThinking } from './adapter-transcript.ts'
import type { ForeignThinkingBlock } from './adapter-transcript.ts'
export type { ForeignThinkingBlock, TranscriptRepairOptions } from './adapter-transcript.ts'
/**
 * The WorkBuddy pi-ai providers: loopback-backed adapters registered
 * into the Harness LLM seam, assembled from public `dsh-llm-pi-ai`
 * extension points. One instance per region — `workbuddy` for the domestic
 * gateway, `workbuddy-global` for the international one — each pointing at
 * its own shim and catalog so the two regions serve simultaneously.
 *
 * 参考：corrinehu/dsh-workbuddy-connect（MIT，Copyright (c) 2026 Corrine Hu）
 *   — pi-ai provider 的组合加载方式（createProvider + openAICompletionsApi +
 *     inert auth plane + 用 shim 的进程内 secret 作为 apiKey）由该项目实现；
 *   DSH 插件结构与 provider 注册的思路参照
 *     franksong2702/dsh-codex-connect（Apache-2.0），经其转引。
 * 改动：模型描述符补上 upstream 给出的多模态与推理档位信息（若有），
 *   供 DSH 的能力判断使用；工厂参数化 provider id，支持双区域实例。
 *
 * @module dsh-connect-workbuddy/adapter
 */

import { createAssistantMessageEventStream, createProvider, isContextOverflow } from '@earendil-works/pi-ai'
import type { Api, AssistantMessage, AssistantMessageEventStream, AuthContext, CredentialStore, Model, Provider, ProviderStreams } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelReasoningInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiAdapterOptions, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { WorkBuddyCredentialStore } from './auth.ts'
import type { WorkBuddyCatalog } from './catalog.ts'
import type { WorkBuddyShim } from './shim.ts'
import { defaultEffortFor } from './default-effort.ts'
import { WORKBUDDY_DEFAULT_EFFORT } from './default-effort.ts'
import { piAiRuntimeInfo } from './pi-ai-runtime.ts'
import type { PiAiGeneration } from './pi-ai-runtime.ts'
import type { ContextRescue } from './context-rescue.ts'

/**
 * The tier a request gets when it names none — compaction summaries, above all
 * (issue #83). See the `reasoning` field in `profileFor` for why an absent
 * default is not "no opinion" but "whatever pi-ai's level map says", which is
 * how `off` became the silent default for `/compact`.
 *
 * Re-exported from `./default-effort.ts`, which is where issue #179 put the
 * per-model override: this constant is now the route-wide FALLBACK for a model
 * the user has not picked a tier for, not the final answer for the roster. The
 * name and value are unchanged so every existing caller and test still reads.
 */
export { WORKBUDDY_DEFAULT_EFFORT } from './default-effort.ts'

/** Provider idle ceiling while one stream read is outstanding. */
export const WORKBUDDY_STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * Image-request budgets at the dsh-llm-pi-ai defaults; the profile type made
 * them required in 0.1.1-rc.2.
 */
const REQUEST_IMAGE_BUDGETS = {
  maxRequestImageBytes: 20_971_520,
  requestImagePixelBudget: 4_194_304,
  requestImageMaxBytes: 1_048_576,
} as const

/**
 * Inert pi-ai auth plane. The workbuddy route authenticates only through the
 * shim shared secret resolved per request by `resolveApiKey`, so pi-ai's own
 * credential lifecycle and ambient discovery must never manufacture a
 * credential for it. `PiAiAdapterOptions.auth` is required since 0.1.1-rc.2;
 * every ambient question here answers "nothing stored, nothing set".
 */
const INERT_AUTH: { credentials: CredentialStore; authContext: AuthContext } = {
  credentials: {
    async read() { return undefined },
    async list() { return [] },
    async modify() {
      throw new Error('dsh-connect-workbuddy: the workbuddy route has no pi-ai credential lifecycle')
    },
    async delete() {},
  },
  authContext: {
    async env() { return undefined },
    async fileExists() { return false },
  },
}


/** Constructor dependencies. */
export interface WorkBuddyAdapterOptions {
  shim: WorkBuddyShim
  store: WorkBuddyCredentialStore
  catalog: WorkBuddyCatalog
  /** Provider route id this instance serves; defaults to the CN route. */
  provider?: string
  /** pi-ai provider name and profile display name; defaults to the CN name. */
  displayName?: string
  /**
   * Model identity stamped on every model this route serves; defaults to
   * {@link WORKBUDDY_MODEL_IDENTITY}. Tests override it to model a transcript
   * recorded by a host that still stamped per-region ids.
   *
   * It also decides the extra registry key this adapter publishes alongside
   * its route (issue #75) — see {@link modelIdentityKeysOf}, which is what
   * keeps an overridden stamp resolvable exactly like the production one.
   */
  modelIdentity?: string
  /** Resolve the durable attachment service at request time, when present. */
  resolveAttachments?: () => AttachmentStore | undefined
  /**
   * Resolve the host-side context-overflow rescue, when this host exposes one.
   * Omitted (or resolving to `undefined`) leaves the adapter exactly as it was:
   * a provider overflow is forwarded and the host's own recovery decides.
   */
  resolveContextRescue?: () => ContextRescue | undefined
  /**
   * Override the pi-ai generation gate (see {@link piAiRuntimeInfo}); tests
   * inject both branches because this checkout only ever RESOLVES one of
   * them. Production callers leave it unset.
   */
  piAiGeneration?: PiAiGeneration
  /**
   * Drop SAME-ROUTE foreign thinking blocks pi-ai would publish as prose
   * (issue #147).
   *
   * CROSS-PROVIDER turns are dropped unconditionally: after a provider switch
   * the host rebuilds the other provider's assistant turns as `dsh-foreign`,
   * their unsigned thinking blocks can never be replayed, and pi-ai would
   * otherwise flatten them into assistant prose that the WorkBuddy gateway
   * refuses with 11128 (issue #163's measured scene). This switch only widens
   * the repair to a model switch INSIDE one of this bundle's own routes.
   *
   * OFF by default for that same-route leg, and read LIVE (a getter, not a
   * boolean) so the switch takes effect on the next request without reloading
   * the plugin: turning it on mid-session is the whole point — the user sees
   * the working-notes turn, flips the switch, and the next turn is answered
   * normally.
   */
  dropForeignThinking?: () => boolean
  /**
   * Told which foreign thinking blocks a request dropped, so the reply can name
   * the condition instead of leaving the user to conclude the model broke
   * (issue #147 asks for at least a visible hint). Called at most once per
   * request; failures are swallowed.
   */
  onForeignThinking?: (blocks: readonly ForeignThinkingBlock[]) => void
  /**
   * The per-model default thinking tier the user saved (issue #179), keyed by
   * model id.
   *
   * A GETTER, not a captured map: the choice is a setting the user can change
   * mid-session, and a captured copy would keep dispatching the old tier until
   * a reload. Production reads the live region slot; tests pass a literal.
   *
   * An absent key means "follow the upstream's own `defaultEffort`" — see
   * `src/default-effort.ts` for how that is resolved against the model's real
   * vocabulary, which is what keeps a stale saved tier from ever reaching the
   * wire as an `UNSUPPORTED_REASONING_EFFORT`.
   */
  defaultThinkingEfforts?: () => Readonly<Record<string, string | undefined>>
}

/** What {@link createWorkBuddyAdapter} hands back. */
export interface WorkBuddyAdapter {
  adapter: PiAiAdapter
  /** Rebuild the adapter's provider snapshot; call after a catalog update. */
  invalidate: () => void
}

/**
 * Layer the host-side context-overflow rescue onto a provider's streams.
 *
 * pi-ai reports a provider failure as an `error` event rather than a throw, so
 * the rescue runs while the failing assistant message is still in hand: history
 * is folded before the event continues on its way, and the host's retry then
 * rebuilds its request against a smaller surface. Nothing is swallowed — the
 * error event is forwarded unchanged, because deciding whether to retry is the
 * host's policy, not this transport's.
 *
 * Both gates are deliberate. Without `sessionId` there is no session to fold,
 * and without a declared `contextWindow` there is no budget to fold against;
 * either absence leaves the stream untouched.
 */
function withContextRescue(
  api: ProviderStreams,
  resolve: (() => ContextRescue | undefined) | undefined,
): ProviderStreams {
  if (resolve === undefined) return api

  // Both parameters stay generic so this wrapper serves whichever pi-ai
  // generation is installed: 1.x replaced the flat `Context` with a branded
  // `TranscriptContext`, and naming either type here would pin the wrapper to
  // one generation and break the other's typecheck.
  const wrap = <ContextShape, Options>(
    inner: (model: Model<Api>, context: ContextShape, options?: Options) => AssistantMessageEventStream,
  ) =>
    (model: Model<Api>, context: ContextShape, options?: Options): AssistantMessageEventStream => {
      const source = inner(model, context, options)
      const rescue = resolve()
      // 0.85 and 1.x both carry the session id here under the same name; the
      // structural read keeps the wrapper independent of the options type.
      const sessionId = (options as { sessionId?: string } | undefined)?.sessionId
      const window = model.contextWindow
      if (rescue === undefined || sessionId === undefined || window === undefined) return source

      const out = createAssistantMessageEventStream()
      let final: AssistantMessage | undefined
      void (async () => {
        try {
          for await (const event of source) {
            if (event.type === 'done') final = event.message
            if (event.type === 'error') final = event.error
            // Fold before the consumer settles: the error still reaches it, but
            // the surface is already smaller when the host retries.
            if (event.type === 'error' && isContextOverflow(event.error)) {
              await rescue.rescue(sessionId, window)
            }
            out.push(event)
          }
          out.end(final)
        } catch {
          // Unreachable in practice: pi-ai converts every provider failure into
          // an `error` event. Close the stream rather than leave a consumer
          // waiting on an iterator that will never advance.
          out.end(final)
        }
      })()
      return out
    }

  return { ...api, stream: wrap(api.stream), streamSimple: wrap(api.streamSimple) }
}

/**
 * The tier {@link EffortNormalizingAdapter} pins a model to when the model
 * carries no reasoning metadata of its own.
 *
 * `off` is the ONE tier pi-ai offers for such a model (`getSupportedThinkingLevels`
 * returns `['off']` whenever `model.reasoning` is false), and the host's own
 * translation of it is "send no reasoning field at all" (`profileOptions` turns
 * `off` into `enabledReasoning = undefined`). So pinning it neither invents a
 * capability nor changes one byte of the upstream request body.
 */
const NO_REASONING_EFFORT = ReasoningEffortId('off')

/** What the host is told a reasoning-less model supports: exactly that tier. */
const NO_REASONING_EFFORTS: LlmModelReasoningInfo = {
  efforts: [{ id: NO_REASONING_EFFORT, name: 'Off' }],
}

/**
 * pi-ai adapter that keeps a model WITHOUT reasoning metadata dispatchable
 * (issue #90, the `UNSUPPORTED_REASONING_EFFORT` half).
 *
 * THE FAILURE. `profileFor` pins one default tier per ROUTE
 * (`reasoning: WORKBUDDY_DEFAULT_EFFORT`, issue #83), and `dsh-llm-pi-ai`
 * resolves every request as `options.reasoningEffort ?? profile.reasoning`. For
 * a model whose catalog entry carries no `reasoning` block at all — the live CN
 * catalog has six of them (`default`, `glm-5.0`, `glm-4.7`, `glm-4.6`,
 * `hunyuan-chat`, `hunyuan-image-alpha`), the live global one two
 * (`default-model`, `deep-model`), and EVERY entry of both static fallback lists
 * — the inherited `high` is not a tier that model has. (`default-model` is the
 * international `auto` router and is not offered as a row since 5.0.1; the
 * measurement is kept verbatim because the defect it documents was observed
 * against the full roster.) `resolveReasoningLevel`
 * then throws `UNSUPPORTED_REASONING_EFFORT` before the request is even built,
 * so the model is unusable locally: no wire call, no upstream error, nothing to
 * retry. Introduced by v4.11.0, which made the profile default explicit; before
 * it the default was absent and pi-ai clamped instead of throwing.
 *
 * TWO GATES, BOTH CLOSED. The host checks the adapter's own model metadata
 * first: `resolveCallWithInfo` rejects ANY explicitly requested tier on a model
 * whose `reasoning` is absent, and `reasoningInfo` omits the field exactly for
 * models without metadata — so even `off` was refused. Then `PiAiAdapter.streamWithSnapshot`
 * rejects the route default it inherited. A fix at either seam alone still
 * fails at the other.
 *
 * THE FIX. Advertise the one tier pi-ai will actually accept for such a model
 * (`off`) and normalize the request to it at the dispatch seam, so
 * `resolveReasoningLevel` sees a supported tier and `profileOptions` sends no
 * reasoning field. Nothing about the wire body changes — pi-ai never emits
 * `reasoning_effort` for a model whose descriptor has `reasoning: false`.
 *
 * WHAT STAYS STRICT. A tier the caller EXPLICITLY asks for on a model that
 * cannot do it is still rejected, by the host, with an accurate message. That
 * is the pre-v4.11.0 contract too, and it is not this bug: the bug is a request
 * that named no tier being killed by the route's own default.
 */
class EffortNormalizingAdapter extends PiAiAdapter {
  /**
   * Whether one exact model id currently carries reasoning metadata. Read live
   * on every call because the catalog is refreshed behind the adapter
   * (`invalidate`), and a model that gains metadata mid-session must stop being
   * normalized at once.
   */
  private readonly effortCapable: (model: string) => boolean

  /**
   * The tier one exact model should advertise as its default when a caller
   * names none (issue #179).
   *
   * Read LIVE per resolve/prepare call, like {@link effortCapable}: the user can
   * change the choice mid-session, and `applySelection` re-invalidates the
   * catalog on every settings change. A captured value would make the picker
   * show the new default while requests kept the old one.
   *
   * Returns `undefined` for a model with no tier vocabulary — the caller then
   * leaves the advertised `reasoning` block exactly as pi-ai built it, which is
   * the `off`-only shape `advertiseOffOnly` below depends on.
   */
  private readonly defaultEffort: (model: string) => string | undefined

  constructor(
    config: PiAiAdapterOptions,
    effortCapable: (model: string) => boolean,
    defaultEffort: (model: string) => string | undefined = () => undefined,
  ) {
    super(config)
    this.effortCapable = effortCapable
    this.defaultEffort = defaultEffort
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.advertiseDefaultEffort(this.advertiseOffOnly(await super.resolveModel(provider, model, signal)))
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const call = await super.prepareCall(provider, model, signal)
    // Both halves matter: the host validates `model` before it ever calls
    // `stream`, and `stream` is what actually reaches `resolveReasoningLevel`.
    return {
      model: this.advertiseDefaultEffort(this.advertiseOffOnly(call.model)),
      stream: (options: GenerateOptions): AsyncIterable<StreamChunk> => call.stream(this.pinEffort(options)),
    }
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return super.stream(this.pinEffort(options))
  }

  /**
   * Advertise the per-model default tier (issue #179).
   *
   * The host materializes `reasoningEffort` into EVERY request that names none
   * from this exact field (`LlmRuntime.resolveCallWithInfo`), which is what makes
   * a saved per-model default real rather than a display preference: without
   * `defaultEffort` the host leaves the config field empty and pi-ai falls back
   * to `profile.reasoning` — the one route-wide constant this feature exists to
   * replace.
   *
   * Deliberately a no-op when the model declares no tier: pi-ai's `off`-only
   * block must keep its EXACT advertised shape, or the host's prepared-call
   * config check (`callConfigEquals`) starts disagreeing with callers that omit
   * the field — see `advertiseOffOnly` above.
   */
  private advertiseDefaultEffort(info: LlmResolvedModelInfo): LlmResolvedModelInfo {
    if (info.reasoning === undefined) return info
    const effort = this.defaultEffort(info.id)
    if (effort === undefined) return info
    // Never contradict the tier list: an entry the host would reject is worse
    // than no default at all (issue #90's `UNSUPPORTED_REASONING_EFFORT`).
    if (!info.reasoning.efforts.some(level => level.id === effort)) return info
    if (info.reasoning.defaultEffort === effort) return info
    return {
      ...info,
      reasoning: { ...info.reasoning, defaultEffort: ReasoningEffortId(effort) },
    }
  }

  /**
   * Give a reasoning-less model the one tier it can dispatch at. No
   * `defaultEffort` on purpose: the host materializes one into EVERY request
   * that names no tier, and that would turn the host's own prepared-call config
   * check (`callConfigEquals`) against callers that omit the field.
   */
  private advertiseOffOnly(info: LlmResolvedModelInfo): LlmResolvedModelInfo {
    return info.reasoning === undefined ? { ...info, reasoning: NO_REASONING_EFFORTS } : info
  }

  /** Replace an unusable tier with the one pi-ai accepts for this model. */
  private pinEffort(options: GenerateOptions): GenerateOptions {
    if (this.effortCapable(options.model)) return options
    return options.reasoningEffort === NO_REASONING_EFFORT
      ? options
      : { ...options, reasoningEffort: NO_REASONING_EFFORT }
  }
}

/**
 * Assemble the adapter. The provider's `getModels` reads the live catalog,
 * and every model's `baseUrl` is re-resolved per read so the shim's
 * ephemeral port applies from the first snapshot after startup.
 */
export function createWorkBuddyAdapter(options: WorkBuddyAdapterOptions): WorkBuddyAdapter {
  const { shim, store, catalog, resolveAttachments } = options
  const providerId = options.provider ?? WORKBUDDY_PROVIDER
  const providerName = options.displayName ?? 'WorkBuddy'
  // The model identity is shared by both regions on purpose — that is the whole
  // of issue #59's fix, and it is NOT inert (issue #75): `requireProvider` and
  // `getAuth` resolve the registry BY the stamped `model.provider`. The route
  // id below is NOT shared: it keys the registry a user selects from, and each
  // region's route resolves to that region's own shim. So the identity is
  // published as an EXTRA registry key of the same route (see
  // `modelIdentityKeysOf`) instead of replacing the route id — the two halves
  // of #59 and #75 that way stay true at once.
  const modelIdentity = options.modelIdentity ?? WORKBUDDY_MODEL_IDENTITY
  // The generation gate: what THIS plugin resolves, not what the host runs —
  // a nested 0.85 on disk shadows the host's 0.87 and vice versa, and only
  // the resolved copy decides which context shape the api below can consume.
  const generation = options.piAiGeneration ?? piAiRuntimeInfo().generation
  void store

  const buildModels = (): Model<Api>[] => {
    // The OpenAI SDK pi-ai drives appends `/chat/completions` to baseURL,
    // so the shim's routes line up with the `/v1` prefix in place.
    const baseUrl = `${shim.baseUrl()}/v1`
    return catalog.current().map(info => toPiModel(info, baseUrl, modelIdentity))
  }

  const base = createProvider({
    id: providerId,
    name: providerName,
    auth: {
      apiKey: {
        name: 'WorkBuddy OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'WorkBuddy' }
        },
      },
    },
    models: buildModels(),
    api: withContextRescue(
      // BOTH of this bundle's routes are owned by this adapter, so a message
      // stamped with either is ours to align (issue #111). Anything else in
      // the transcript belongs to another provider and is left untouched.
      withLegacyContext(openAICompletionsApi(), generation, modelIdentity, undefined, {
        // Both read per request: the switch is meant to be flipped WHILE
        // looking at the bad turn, and a captured boolean would need a reload.
        get dropForeignThinking() { return options.dropForeignThinking?.() === true },
        ...options.onForeignThinking === undefined ? {} : { onForeignThinking: options.onForeignThinking },
      }),
      options.resolveContextRescue,
    ),
  })

  // `getModels` is delegated to a live read (the reuse-catalog pattern from
  // dsh-llm-pi-ai): stream dispatch still runs through the constructed
  // provider, while the catalog answer tracks the upstream refresh.
  const provider: Provider = { ...base, getModels: () => buildModels() }

  // One profile per published registry key. The `piProvider` is what actually
  // lands in the registry, and `Models.setProvider` keys that map on
  // `piProvider.id` (`models.js:37` on 0.85.1, `:49` on 1.1.0) — NOT on the
  // profile's `provider` field — so the identity key needs a provider object
  // that CLAIMS that id. It is the route's own provider under a second id, so
  // the models, baseUrl, api and auth the request runs with stay this region's
  // and nothing about the gateway is duplicated. Sharing the very same object
  // under both keys would register the route id twice and leave the stamped
  // identity unresolved, which is exactly issue #75.
  const profileFor = (key: string): ResolvedPiAiProviderProfile => ({
    provider: key,
    displayName: providerName,
    streamIdleTimeoutMs: WORKBUDDY_STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-connect-workbuddy retryPolicy'),
    configuredMaxTokens: new Map(),
    // Per-model failures gate every request: `modelOf` throws INVALID_CONFIG
    // for any id present here. The workbuddy catalog is built from live reads,
    // so an empty map is the accurate answer — no known-bad model — and the
    // route must never pre-condemn a model that the catalog later supplies.
    // (Required by ResolvedPiAiProviderProfile since 0.1.5-rc.1.)
    modelErrors: new Map(),
    /**
     * The ROUTE-WIDE fallback tier, pinned to the SAME value pi-ai's level map
     * would fill in for an absent one (issue #83).
     *
     * `dsh-llm-pi-ai` resolves every request's tier as
     * `options.reasoningEffort ?? profile.reasoning`, so an absent default here
     * means "whatever pi-ai fills in" — and for a model whose map carried
     * `off → "off"`, that was `"off"`, i.e. every compaction summary asked a
     * model like `deepseek-v4.1-flash` to disable thinking, which it answers with
     * 400 / 11133. Nothing structurally prevents a level or a catalog snapshot
     * from disagreeing with the adapter's own map, so the default must never be
     * that.
     *
     * Since issue #179 this is only the LAST resort: `advertiseDefaultEffort`
     * publishes the user's per-MODEL choice as `defaultEffort`, and the host
     * materializes that into every request that names none — so a user who
     * picked `low` for one model gets `low` while every other model keeps its own
     * upstream default. This constant survives for a model whose catalog entry
     * declares no default at all, which is the only case that reaches here.
     */
    reasoning: WORKBUDDY_DEFAULT_EFFORT,
    ...REQUEST_IMAGE_BUDGETS,
    piProvider: key === providerId ? provider : { ...provider, id: key },
  })

  // Single source for BOTH the initial map and `invalidate`: an `invalidate`
  // that rebuilt only the route key would silently re-break the identity key,
  // i.e. issue #75 all over again on the first catalog refresh.
  const buildProfiles = (): Map<string, ResolvedPiAiProviderProfile> =>
    new Map(modelIdentityKeysOf(providerId, modelIdentity)
      .map((key): [string, ResolvedPiAiProviderProfile] => [key, profileFor(key)]))

  // Replacing (not mutating) the map is what `invalidate` uses to force the
  // adapter's next profiles read to rebuild its snapshot.
  let profiles = buildProfiles()

  /**
   * Whether one exact model id currently advertises ANY thinking tier.
   *
   * Same predicate `toPiModel` derives the descriptor's `reasoning` flag from,
   * so the two can never disagree — and it reads the live catalog, so a refresh
   * that adds (or drops) metadata for a model takes effect on the next request
   * without an `invalidate` round trip.
   */
  const effortCapable = (model: string): boolean =>
    catalog.current().some(info => info.id === model && workBuddyThinkingLevelMap(info) !== undefined)

  /**
   * The tier one exact model should run on when a caller names none (#179).
   *
   * Resolved against the LIVE catalog and the user's LIVE saved map, exactly
   * like `effortCapable`: the answer is a function of two things that both
   * change mid-session, and caching either would let the advertised default and
   * the dispatched tier drift apart.
   */
  const resolveDefaultEffort = (model: string): string | undefined => {
    const info = catalog.current().find(entry => entry.id === model)
    if (info === undefined) return undefined
    return defaultEffortFor(info, options.defaultThinkingEfforts?.() ?? {})
  }

  const adapter = new EffortNormalizingAdapter({
    profiles: () => profiles,
    auth: INERT_AUTH,
    // Resolve the shim's per-process shared secret as the OpenAI apiKey so
    // pi-ai sends it as `Authorization: Bearer <shared-secret>`. The shim
    // validates this before forwarding and resolves the real WorkBuddy token
    // itself via the store, so the secret never reaches upstream.
    resolveApiKey: async () => shim.token(),
    ...resolveAttachments === undefined ? {} : { resolveAttachments },
  }, effortCapable, resolveDefaultEffort)

  return {
    adapter,
    invalidate: () => {
      profiles = buildProfiles()
    },
  }
}
