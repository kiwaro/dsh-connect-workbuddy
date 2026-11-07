/**
 * 根据区域开关、积分显示开关及显示位置，决定是否渲染 WorkBuddy 读数。
 *
 * 参考 dingminhua/dsh-connect-trae 的 client/ComposerPointsGate.tsx。
 * 原实现采用 MIT 许可，Copyright (c) 2026 LaoDing。
 *
 * 读取 DSH 的 modelSelection，next 优先于 lastUsed。选中的供应商属于本插件
 * 时使用对应区域；选择其他供应商时不渲染 WorkBuddy 读数。
 * 组件在工具栏和输入框下方均注册，按保存的 creditPosition 选择实际位置。
 * 工具栏顺序避让由 composer-order.ts 处理。
 */
import { useEffect, useState } from 'react'
import { ComposerCredits, WORKBUDDY_COMPOSER_PROVIDERS } from './ComposerCredits.tsx'
import { regionCreditPositionOf, regionCreditsShownOf, regionEnabledOf, unwrapVolatileDeep } from '../status-paths.ts'
import type { WorkBuddyCreditPosition, WorkBuddyWebRegion } from '../status-paths.ts'
import type { WorkBuddySettingsKey } from './locales.ts'
import type { WorkBuddyCardInjected } from './WorkBuddyCard.tsx'

/** The slice of the `modelSelection` projection this decision needs. */
export interface ModelSelectionProjectionLike {
  lastUsed?: { provider?: unknown } | null
  next?: { provider?: unknown } | null
}

/**
 * The provider route the session is currently pointed at.
 *
 * `next` wins over `lastUsed`: a switch that has landed but not yet been sent
 * is still the selection the composer displays.
 */
export function selectedProviderOf(projection: ModelSelectionProjectionLike | undefined): string | undefined {
  const candidate = projection?.next ?? projection?.lastUsed
  const provider = candidate?.provider
  return typeof provider === 'string' && provider !== '' ? provider : undefined
}

/**
 * Which region's readout this session should show, or undefined for none.
 *
 * Returns undefined when the selected provider is not this plugin's — the
 * ownership test and the region choice are ONE lookup, so there is no second
 * copy of the rule to drift.
 *
 * The region's own switches are applied HERE rather than inside the component,
 * so a region that is switched off (or whose provider is off) starts no fetch
 * loop at all.
 *
 * `hostValue` is the Host's own `showCreditsInMainUi` answer for this region,
 * when a usage document carrying it is already in hand. It OUTRANKS the settings
 * scope, exactly as the card's `creditsShownOn` does and for the same measured
 * reason: the browser's settings mirror is documented as stale for this
 * namespace on the affected deployments, and — the shipped 4.3.0 defect (issue
 * #46) — the scope can be bound to a namespace nothing serves, where every read
 * is `undefined` and the opt-out rule then reads "shown" forever. The Host is
 * the authority; the scope is the fallback for a Host line that predates the
 * field.
 */
/**
 * The settings tree this plugin writes, unwrapped to a plain object.
 *
 * `unwrapVolatileDeep` first: the scope's value is a live cosmokit reference on
 * the 0.1.7 line, and reading fields off it without unwrapping yields proxies
 * whose `===` comparisons against a string are false.
 */
function scopeValueOf(scope: WorkBuddyCardInjected['settingsScope']): unknown {
  return scope === undefined ? undefined : unwrapVolatileDeep(scope.getSnapshot().value)
}

export function composerCreditsRegionOf(
  projection: ModelSelectionProjectionLike | undefined,
  scope: WorkBuddyCardInjected['settingsScope'],
  hostValue?: unknown,
): WorkBuddyWebRegion | undefined {
  const provider = selectedProviderOf(projection)
  const region = provider === undefined ? undefined : WORKBUDDY_COMPOSER_PROVIDERS[provider]
  if (region === undefined) return undefined
  // The readout lives in the composer row, which is shared with the shell's own
  // controls, so it must be asked for rather than imposed. Opt-out semantics
  // (matching the card's checkbox) plus the provider gate: a region the user
  // switched off has no readable credits, so it must render nothing rather than
  // a permanently failing readout.
  if (typeof hostValue === 'boolean') {
    // The Host has spoken for this region: honor it and stop. Falling through to
    // the scope here would let a stale or UNBOUND mirror overrule a live Host
    // answer — the defect this parameter exists to close.
    return hostValue ? region : undefined
  }
  const value = scope === undefined ? undefined : unwrapVolatileDeep(scope.getSnapshot().value)
  if (!regionCreditsShownOf(value, region)) return undefined
  if (!regionEnabledOf(value, region)) return undefined
  return region
}

export interface ComposerCreditsGateProps {
  t: (key: WorkBuddySettingsKey, params?: Record<string, unknown>) => string
  /**
   * WHICH seat this registration occupies (issue #62).
   *
   * The component is registered once per seat and renders only in the seat the
   * setting names, so switching seats is a settings write rather than a slot
   * re-registration. Absent means `composer` — the only seat before the setting
   * existed, which keeps every existing caller and test on the old behaviour.
   */
  position?: WorkBuddyCreditPosition
  /** Settings scope from the configForms mirror; the card writes the same field. */
  settingsScope?: WorkBuddyCardInjected['settingsScope']
  /**
   * Open this plugin's FULL page from the readout's header button.
   *
   * Passed straight through from the entry's injection: the entry owns the
   * `layout` probe because this module must stay free of browser-only DSH
   * packages. Undefined means the button is not rendered at all — a control that
   * cannot do what it says is worse than one that is absent.
   */
  onOpenSettings?: () => boolean
  /**
   * Standard slot hook: reads one Host-computed projection for this session.
   * Injected by the slot, so it is absent when this gate is rendered directly
   * from a test.
   */
  useProjection?: (key: 'modelSelection') => unknown
}

export function ComposerCreditsGate(props: ComposerCreditsGateProps) {
  const { t, position, settingsScope, useProjection, onOpenSettings } = props
  // Re-render when the settings change, so ticking the card's checkbox appears
  // without a remount. `settingsScope` is a stable injected reference, so the
  // subscription is set up once per scope.
  const [, setRevision] = useState(0)
  useEffect(
    () => settingsScope?.subscribe(() => { setRevision(value => value + 1) }),
    [settingsScope],
  )
  // The projection hook is optional so the gate can be rendered in a test
  // without a Host; the fallback is handled by the result, not the call count.
  const projection = useProjection === undefined
    ? undefined
    : useProjection('modelSelection') as ModelSelectionProjectionLike | undefined

  // ONE decision, taken here: this plugin owns the provider, the region is
  // switched on, and its readout is not hidden. Otherwise nothing renders, so
  // the shared composer row is untouched and no fetch loop starts.
  //
  // No `hostValue` is passed at this stage: the Host's per-region answer only
  // exists on a usage document, and reading one here would mean a fetch loop for
  // a readout the scope might already have hidden. `ComposerCredits` re-applies
  // the rule against the Host's answer as soon as its own read lands (see the
  // `showCreditsInMainUi` check there), so the authority still wins — it just
  // wins one render later, on a document we were fetching anyway.
  const region = composerCreditsRegionOf(projection, settingsScope)
  if (region === undefined) return null
  // The seat test comes AFTER ownership and the on/off switches, so a region
  // that is switched off renders nothing in EITHER seat (rather than the
  // inactive seat briefly drawing before the region test rejects it).
  if (regionCreditPositionOf(scopeValueOf(settingsScope), region) !== (position ?? 'composer')) return null

  // `region` is non-undefined here and was derived from the provider, so the
  // provider is present too; the assertion states that rather than widening the
  // component's prop to accept an absent provider it never sees.
  const provider = selectedProviderOf(projection) as string
  return (
    <ComposerCredits
      t={t}
      provider={provider}
      region={region}
      {...settingsScope === undefined ? {} : { settingsScope }}
      {...onOpenSettings === undefined ? {} : { onOpenSettings }}
    />
  )
}
