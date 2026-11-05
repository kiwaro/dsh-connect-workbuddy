/**
 * 从 adapter.ts 按职责提取；参考来源与许可证说明见原文件头和 THIRD_PARTY_NOTICES.md。
 */
import { offRefused } from './off-thinking.ts'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { WorkBuddyModelInfo } from './catalog.ts'
import { WORKBUDDY_MODEL_IDENTITY } from './adapter-identity.ts'
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const

const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

type WorkBuddyThinkingLevel = typeof THINKING_LEVELS[number]
type WorkBuddyThinkingLevelMap = Partial<Record<'off' | WorkBuddyThinkingLevel, string | null>>

/** pi-ai input modalities: images only when WorkBuddy advertises them. */
export function workBuddyModelInput(info: WorkBuddyModelInfo): ('text' | 'image')[] {
  return info.multimodal === true ? ['text', 'image'] : ['text']
}

/**
 * DSH-facing display name: the model name plus the upstream credit multiplier,
 * spelled the way WorkBuddy's own selector does (`GLM-5.3 · x0.79`).
 *
 * Display-only by construction: every DSH-side join keys on the model id —
 * the selector's current choice (`provider` + `model`), the durable
 * `model/selection` / `request/header` session events, the agent default-model
 * settings, and the request wire (`model: <id>` reaching the shim). A model
 * without a parsed multiplier keeps its bare name; a zero multiplier shows
 * `x0.00`, matching WorkBuddy's rendering of free models.
 */
export function workBuddyDisplayName(info: WorkBuddyModelInfo): string {
  const base = info.creditMultiplier === undefined
    ? info.name
    : `${info.name} · x${info.creditMultiplier.toFixed(2)}`
  // Load does NOT ride on this string any more. The host renders the model
  // name verbatim, and the plugin now draws the load badge in the host's own
  // picker through the `conversation.input.model.label` slot
  // (`src/client/WorkBuddyModelLabel.tsx`) — where it can be a COLOURED figure
  // rather than a character whose colour belongs to the emoji font. Leaving
  // the emoji here as well would show the same fact twice, in two visual
  // languages. See `src/busy.ts`.
  return base
}

/**
 * Map only levels advertised by WorkBuddy; undeclared DSH levels stay unavailable.
 *
 * `off` is offered EXACTLY when `canDisableThinking === true` and withheld
 * (mapped to `null`) otherwise. `null` is pi-ai's "this level is not
 * supported": `getSupportedThinkingLevels` filters on `mapped === null`, and
 * `openai-completions` reads `thinkingLevelMap?.off !== null` to decide whether
 * it may send a thinking-disabled request.
 *
 * This condition used to be inverted (`!== true` set the null), which locked
 * `off` OFF for precisely the models that CAN disable thinking while leaving it
 * ON for those that cannot. It stayed invisible because the only test probed
 * the `canDisableThinking: false` half, which the inverted form also passes.
 *
 * The value read here is already the EFFECTIVE one: the runtime catalog is
 * stamped by `withEffectiveOff()` before it reaches the adapter, so this is the
 * user's `off` selection when they made one — except for the ids on
 * `REFUSES_OFF_MODEL_IDS`, which the stamp forces to `false` no matter what the
 * user asked for (issue #83: this level, once ticked, also became the IMPLICIT
 * default for every request that carries no effort at all, which is how
 * compaction went to 100% failure). The table is re-checked here as well so the
 * wall does not depend on every caller remembering to stamp first.
 *
 * Absence is "unknown" and stays unoffered, matching how the rest of the plugin
 * treats undeclared capability.
 */
export function workBuddyThinkingLevelMap(info: WorkBuddyModelInfo): WorkBuddyThinkingLevelMap | undefined {
  const supported = info.reasoning?.supportedEfforts?.filter((effort): effort is WorkBuddyThinkingLevel =>
    (THINKING_LEVELS as readonly string[]).includes(effort),
  )
  if (supported === undefined || supported.length === 0) return undefined
  const map: WorkBuddyThinkingLevelMap = Object.fromEntries(
    THINKING_LEVELS.map(level => [level, supported.includes(level) ? level : null]),
  )
  if (info.reasoning?.canDisableThinking === true && !offRefused(info.id)) map.off = 'off'
  else map.off = null
  return map
}

/**
 * Build one pi-ai model descriptor pointing at the loopback shim.
 *
 * `identity` — not the route id — is what `provider` carries; see
 * {@link WORKBUDDY_MODEL_IDENTITY} for why the two must differ. The route the
 * model is REACHED by is the registry key the adapter serves, while this
 * stamped field is what pi-ai resolves the provider BY (issue #75) — so every
 * key in {@link modelIdentityKeysOf} must be a key this route registers.
 */
export function toPiModel(
  info: WorkBuddyModelInfo,
  baseUrl: string,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
): Model<Api> {
  const thinkingLevelMap = workBuddyThinkingLevelMap(info)
  return {
    id: info.id,
    name: workBuddyDisplayName(info),
    api: 'openai-completions',
    provider: identity,
    baseUrl,
    input: workBuddyModelInput(info),
    cost: NO_COST,
    contextWindow: info.contextWindow,
    maxTokens: info.maxTokens,
    reasoning: thinkingLevelMap !== undefined,
    ...thinkingLevelMap === undefined ? {} : { thinkingLevelMap },
    compat: { supportsReasoningEffort: thinkingLevelMap !== undefined },
  } as unknown as Model<Api>
}

