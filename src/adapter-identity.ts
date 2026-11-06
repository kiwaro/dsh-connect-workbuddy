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
 * Shared pi-ai model identity for both regional adapters. Each adapter also
 * registers this identity as a key so pi-ai can resolve model.provider within
 * that region. The selectable route ids and their shim destinations stay separate.
 *
 * pi-ai compares provider, api and model id when replaying thinking. Sharing the
 * provider identity addresses one comparison; transcript repair handles host
 * fallback markers separately. Historical token-count differences do not prove
 * identical request content or a difference in billing rules. See the corrected
 * evidence and limits in docs/ISSUE59_DIAGNOSIS.md.
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

