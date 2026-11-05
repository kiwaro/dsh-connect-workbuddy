/**
 * 从 adapter.ts 按职责提取；参考来源与许可证说明见原文件头和 THIRD_PARTY_NOTICES.md。
 */
import type { WorkBuddyRegion } from './upstream.ts'

/** Provider route this bundle owns for the domestic (CN) gateway. */
export const WORKBUDDY_PROVIDER = 'workbuddy'

/** Provider route this bundle owns for the international gateway. */
export const WORKBUDDY_GLOBAL_PROVIDER = 'workbuddy-global'

/** The provider id each region registers as. */
export const WORKBUDDY_PROVIDERS: Readonly<Record<WorkBuddyRegion, string>> = {
  cn: WORKBUDDY_PROVIDER,
  global: WORKBUDDY_GLOBAL_PROVIDER,
}

/**
 * Model identity BOTH regions stamp on their models — the fix for issue #59.
 *
 * pi-ai keeps a historical thinking block as `thinking` only when the message
 * that carried it names the SAME provider, api and model id as the request in
 * flight (`transform-messages.js:68`); every other block is downgraded to plain
 * `text` (`:88–96`) — downgraded, not dropped, which is why no byte count ever
 * explained the 1.94× regional jump. The two gateways are two provider STRINGS
 * for ONE model, so a transcript recorded in one region was replayed as text in
 * the other, and issue #59's reporter measured exactly that: 708K → 1.374M on
 * byte-identical history, and a compression request that could then never fit
 * the window it was computed for.
 *
 * The stamp is NOT inert, and reading it as inert is what broke issue #75.
 * `provider` is the KEY pi-ai dispatches on: `requireProvider` resolves
 * `this.providers.get(model.provider)` and throws
 * `Unknown provider: ${model.provider}` when it is absent (`models.js:410–416`
 * on the host's 1.1.0, `:351–357` on the 0.85.1 this repo resolves), and
 * `getAuth` resolves the same key, answering `Provider is not configured`
 * instead (`:334–341` and `:429`; `:275–280` and `:366` on 0.85.1). Both sit on
 * the LIVE chat path: `dsh-llm-pi-ai` streams through
 * `snapshot.models.streamSimple(model, …)` (`lib/index.js:1983`), which calls
 * `requireProvider` before a byte is sent (`models.js:454–459`). Each region
 * builds its OWN registry from its own adapter — `current()` registers
 * `profile.piProvider` per profile (`lib/index.js:1852–1862`) — so the
 * `workbuddy-global` region registered only `workbuddy-global` and could not
 * dispatch a model stamped `workbuddy`: every request failed with
 * `Unknown provider: workbuddy` before reaching the gateway.
 * {@link modelIdentityKeysOf} is the correction: the identity has to be a
 * registry key of its own in every region, or the stamp cannot be shared.
 *
 * Lookup by ROUTE is a separate question and stays intact: `getModel(provider,
 * id)` is `getModels(provider).find(...)` (`models.js:116–118`), i.e. it goes
 * through the map key, while the STAMPED field is whatever the provider put
 * there. So the route stays `workbuddy`/`workbuddy-global` (each with its own
 * shim, catalog and credential store) while every model it serves advertises
 * THIS id. The openai-completions api reads `model.provider` only for
 * provider-specific quirks (none of which match these ids) and as an
 * error-message label.
 *
 * Deliberately NOT the same string as the global route: a message is only
 * same-model when provider, api AND model id all match, so the shared id must
 * not be reachable as a route a user could pick — it names one model, not one
 * gateway. It IS reachable as a pi-ai registry key, which is the point: those
 * are internal and never surface as a route, because `registerAdapter` takes
 * the route list explicitly (`dsh-llm/lib/index.js:1842–1861`,
 * `prepareRoutes` `:1867–1885`) and this plugin passes exactly the two region
 * ids (`src/index.ts:2069–2086`).
 */
export const WORKBUDDY_MODEL_IDENTITY = 'workbuddy'

/**
 * The api string `dsh-llm-pi-ai` stamps on a replayed message it could not
 * rebuild natively (`foreignAssistant()`), i.e. a message that went through the
 * host's fallback path rather than this plugin's own request builder.
 *
 * It is the ONLY api value {@link alignAssistantIdentities} repairs, because it
 * is the only one that proves the field is a host marker instead of a shape this
 * plugin really produced.
 */
export const HOST_FOREIGN_API = 'dsh-foreign'

/**
 * Registry keys an adapter serving `providerId` must publish so that every
 * stamp its models carry resolves inside its own region (issue #75).
 *
 * The route id first, then the model identity, de-duplicated — route-first so
 * `profiles()` opens with the route the adapter actually serves. CN yields one
 * key (`workbuddy` is both its route and the shared identity) and the global
 * region yields two (`workbuddy-global`, `workbuddy`); the two regions
 * therefore publish different key sets, and each must publish the shared one.
 *
 * `identity` is a parameter because {@link WorkBuddyAdapterOptions.modelIdentity}
 * can override the stamp: the keys have to follow the stamp, or a test that
 * stamps a per-region id would get the production keys back.
 */
export function modelIdentityKeysOf(
  providerId: string | undefined,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
): readonly string[] {
  return [...new Set([providerId, identity].filter((key): key is string => key !== undefined))]
}

/** Region a provider route id belongs to. */
export function regionOfProvider(provider: string): WorkBuddyRegion | undefined {
  for (const [region, id] of Object.entries(WORKBUDDY_PROVIDERS) as [WorkBuddyRegion, string][]) {
    if (id === provider) return region
  }
  return undefined
}

/** Human-readable provider name, shown in the DSH model picker. */
export const WORKBUDDY_PROVIDER_DISPLAY_NAMES: Readonly<Record<WorkBuddyRegion, string>> = {
  cn: 'WorkBuddy',
  global: 'WorkBuddy Global',
}

