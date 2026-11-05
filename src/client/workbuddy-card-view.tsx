/** 从 WorkBuddyCard.tsx 按职责提取；来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */
import { useState } from 'react'

import type { ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

import type { WorkBuddyWebMediaModel, WorkBuddyWebModel, WorkBuddyWebProbeResult, WorkBuddyWebTpsResult, WorkBuddyWebSearchPath, WorkBuddyWebUsage } from '../status-paths.ts'

import { nativeModalityOf } from '../native-modality.ts'

import { selectPromoBadge, selectPromoMultiplier } from '../promo.ts'

import { promoBadgeColor, promoBadgeLabel, promoBadgeTooltip, uiLanguage } from './promo-badge.ts'

import { remainingText } from './remaining.ts'

import { searchReasonLabel, searchedView } from './searched-paths.ts'
import type { Translate } from './searched-paths.ts'

/** Localized copy injected by the browser-plugin registration. */
export interface WorkBuddyCardInjected {
  t: Translate
  /**
   * Optional by design: a host line that provides neither settings surface
   * (or a probe before the mirror populates) leaves this undefined, and the
   * card renders read-only — saving is the only capability that needs it.
   */
  settingsScope?: {
    getSnapshot(): { status: string; value?: unknown; writable: boolean }
    subscribe(listener: () => void): () => void
    /** Whether the Host accepted the write (0.1.7); `void` on the 0.1.5 line. */
    set(field: string, value: unknown): Promise<boolean | void>
  }
}

/**
 * Props delivered by the Plugin configuration slot.
 *
 * The slot keys this card registers against (`plugins.bundle.config` /
 * `plugins.row.config`) are not enumerated in the 0.1.7 `SlotMap` types —
 * they exist at runtime, but the shipped type table does not list them — so
 * the props are typed from the injected surface rather than
 * `PropsRuntime<'…'>`. The card also receives the host's `view`
 * ('summary' | 'page').
 */
export type WorkBuddyCardProps =
  Partial<WorkBuddyCardInjected>
  & { view?: string; surface?: 'card' | 'page'; backToConversation?: () => void }

export const POLL_INTERVAL_MS = 60_000

/**
 * Retry cadence for a status read that FAILED.
 *
 * The failed read used to be terminal: `status.status === 'error'` made
 * `hasAccounts` false, which gated both the 60s poll and the open effect, so a
 * single transient failure (a WebView fetch rejected while the DSH web process
 * was restarting) left "Failed to fetch" on screen until the card was closed
 * and reopened. Backoff doubles from BASE up to MAX and resets on the first
 * read that lands; nothing is armed while the card is collapsed.
 */
export const STATUS_RETRY_BASE_MS = 3_000

export const STATUS_RETRY_MAX_MS = 30_000

/**
 * The reasoning tiers the local CodeBuddy CLI accepts for its `--effort` flag.
 *
 * Kept in sync with `EFFORT_LEVELS` in `src/cli-bridge/tool.ts` by hand: that
 * module imports the node runtime, so the client bundle cannot share the
 * constant — a drifted list here would offer a tier the CLI rejects.
 */
export const CLI_BRIDGE_EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * The credential-region orders the quick-adjust picker offers for the CLI
 * route's `regionOrder`.
 *
 * The Host builds exactly two regions — `cn` and `global` (see
 * `REGION_KEYS` in `src/index.ts`), so every meaningful order of that pair
 * fits in these four presets: a preference, a reversed preference, or a
 * single-region lock. `''` (uncommitted) renders as the CLI's own default
 * order, CN first.
 */
export const CLI_BRIDGE_REGION_ORDERS = ['cn,global', 'global,cn', 'cn', 'global'] as const

/**
 * Tooltip for one model's image checkbox. The box is pre-checked only for
 * models the vendored vendor table documents as natively multimodal, so the
 * two other outcomes need to say WHY they are off — otherwise a documented
 * text-only model and an unverified one look identically broken next to their
 * checked siblings.
 */
/**
 * The media roster from the Host's JSON, tolerantly.
 *
 * Anything that is not a row with a string id and a name is DROPPED, never
 * rendered: this is a read-only list, and a half-shaped entry is not worth an
 * exception that would take down the whole card. A Host older than the route
 * (or any other answer without `models`) yields an empty list, which the block
 * shows as "this tab publishes none" instead of as a failure.
 */
export function readMediaRoster(value: unknown): readonly WorkBuddyWebMediaModel[] | undefined {
  const models = (value as { models?: unknown } | null | undefined)?.models
  if (!Array.isArray(models)) return undefined
  const rows: WorkBuddyWebMediaModel[] = []
  for (const entry of models as readonly unknown[]) {
    const record = entry as { id?: unknown, name?: unknown, tags?: unknown } | null
    if (record === null || typeof record !== 'object') continue
    if (typeof record.id !== 'string' || record.id === '') continue
    const tags = Array.isArray(record.tags)
      ? (record.tags as readonly unknown[]).filter((tag): tag is string => typeof tag === 'string')
      : []
    rows.push({ id: record.id, name: typeof record.name === 'string' ? record.name : record.id, tags })
  }
  return rows
}

export function imageCheckboxHint(model: { id: string }, t: Translate): string {
  switch (nativeModalityOf(model.id)) {
    case 'multimodal': return t('row.modelImage')
    case 'text': return t('row.modelImageText')
    default: return t('row.modelImageUnverified')
  }
}

/**
 * The upstream's own promotion badge for one model, or nothing.
 *
 * Drawn from the model's UNRESOLVED promo list at RENDER time, because a badge
 * is a function of the clock: the upstream's promotions run on wall-clock
 * hours in a named zone, so a badge chosen when the document was read would
 * keep claiming the night after the night is over. The card re-renders at
 * least once a minute while it is open (it polls the usage route), so a
 * window edge is picked up within a minute without a second timer.
 *
 * The chip says what the UPSTREAM says — its label, its colour, its hover
 * copy — and adds nothing of its own: a badge the user cannot trace back to
 * the upstream's feed is worse than no badge.
 *
 * One badge per model: the upstream's `priority` orders the entries that name
 * a model, and a model row is one line wide — two badges would push the
 * model name out of the row.
 */
export function promoChip(model: WorkBuddyWebModel): ReactElement | null {
  const promo = selectPromoBadge(model.promos, Date.now())
  if (promo === undefined) return null
  const language = uiLanguage()
  const color = promoBadgeColor(promo)
  const tooltip = promoBadgeTooltip(promo, language)
  // A custom property cannot be written as an object literal in React's
  // `CSSProperties` type, so the style is built as a plain record first.
  const style: Record<string, string> | undefined = color === undefined
    ? undefined
    : { '--dsm-workbuddy-promo-color': color }
  return (
    <span
      className="dsm-workbuddy-model-promo"
      title={tooltip === '' ? undefined : tooltip}
      style={style}
    >
      {promoBadgeLabel(promo, language)}
    </span>
  )
}

/**
 * The multiplier to DRAW for a model right now (issue #120).
 *
 * A "night discount" badge used to sit next to the full price: the badge was
 * resolved against the clock while the number beside it was the catalog's
 * static figure. The discount lives in the same upstream entry, so both are
 * answered against the same clock — a promotion that is running and carries a
 * readable `replace` discount wins; otherwise the catalog figure stands.
 */
export function effectiveRate(model: WorkBuddyWebModel): number | undefined {
  return selectPromoMultiplier(model.promos, Date.now()) ?? model.creditMultiplier
}

/** One region's unsaved model edits; switching tabs never drops these. */
export interface WorkBuddyDraft {
  models: WorkBuddyWebModel[]
  enabledIds: Set<string>
  imageIds: Set<string>
  /** Model ids whose `off` thinking level is offered (issue #34). */
  offIds: Set<string>
  contextBudgets: Record<string, number>
  /**
   * The chosen DEFAULT thinking tier per model (issue #179).
   *
   * An absent key is a real value here — "follow the upstream's own
   * `defaultEffort`" — so removal (not an empty string) is what the picker's
   * first option writes. Keeping `''` in the map would persist a tier the model
   * does not declare and make the runtime fall back silently.
   */
  defaultThinkingEfforts: Record<string, string>
}

/**
 * One probed path, with its cause. The presentation rules — which entries are
 * worth showing up front, and how a reason is labelled — live in
 * `./searched-paths.ts` so they are unit-testable without a DOM.
 */
export function renderSearchedItem(
  item: WorkBuddyWebSearchPath,
  t: Translate,
): ReactElement {
  return (
    <li key={`${item.source}:${item.path}`}>
      <code>{item.path}</code>
      <span className={`dsm-workbuddy-searched-reason${item.reason === 'encrypted' ? ' dsm-workbuddy-searched-reason-encrypted' : item.reason === 'wrong-region' ? ' dsm-workbuddy-searched-reason-wrong-region' : ''}`}>
        {searchReasonLabel(item, t)}
        {item.message === undefined ? null : ` · ${item.message}`}
      </span>
    </li>
  )
}

/**
 * The probed-path list behind a signed-out card.
 *
 * Collapsed by default because it is a diagnostic, not a headline. The
 * interesting failures (encrypted / invalid / unreadable) are listed up front;
 * the merely-absent candidates — most of them, on any normal machine — sit
 * behind a second toggle, so the one entry that explains the failure is not
 * buried under a dozen "not found" lines. When nothing interesting was found
 * the absent list IS the explanation, so it opens directly.
 *
 * An `encrypted` failure deliberately adds NO notice of its own. It used to,
 * because the paragraph above still said "sign in once in the desktop app" —
 * the one action that cannot work when the credential exists but is encrypted.
 * `signedOutNotice` now answers that cause in the paragraph itself, so a second
 * copy here would restate it: the paragraph states the situation, this list
 * supplies the detail, and the per-entry label already says what each path is.
 */
export function SearchedPaths(
  { items, t }: { items: readonly WorkBuddyWebSearchPath[], t: Translate },
): ReactElement {
  const view = searchedView(items)
  // Only an explicit click is remembered. Initializing state from the derived
  // value instead would freeze the first answer: this card re-probes every 60
  // seconds, so a machine that first reported only absent paths and later
  // reported an encrypted file would keep the findings hidden.
  const [explicitOpen, setExplicitOpen] = useState<boolean | undefined>(undefined)
  const showMissing = explicitOpen ?? view.missingOpen
  return (
    <details className="dsm-workbuddy-searched">
      <summary>{t('row.searchedTitle')} ({view.total})</summary>
      <p className="dsm-workbuddy-searched-hint">{t('row.searchedHint')}</p>
      <ul className="dsm-workbuddy-searched-list">
        {view.interesting.map(item => renderSearchedItem(item, t))}
        {showMissing ? view.missing.map(item => renderSearchedItem(item, t)) : null}
      </ul>
      {showMissing || view.missing.length === 0
        ? null
        : <button
          type="button"
          className="dsm-workbuddy-searched-more"
          onClick={() => { setExplicitOpen(true) }}
        >
          {t('row.searchedMore', { count: view.missing.length })}
        </button>}
    </details>
  )
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Compact package-date rendering with time, e.g. `08/25 14:44`.
 *
 * `hourCycle: 'h23'` is what makes that example TRUE. Without it `Intl` defers
 * to the browser locale, and en-US produced `08/25, 02:44 PM` — 12-hour, with a
 * comma the template never asked for. `h23` (not `hour12: false`) keeps midnight
 * at `00:00` instead of `24:00`, and matches DSH's own clock cycle.
 */
export function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

export function formatCapacity(value: number | undefined, unknown: string): string {
  if (value === undefined) return unknown
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`
  return formatNumber(value)
}

export function dotStyle(status: WorkBuddyWebUsage['status']): Record<string, string> {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { background: color }
}

/**
 * The sentence a probe result gets, and how it should be coloured.
 *
 * The cooldown wording is the part that had to be got right. The upstream names
 * a "use again" time in three situations: a `Retry-After` header, the reset
 * sentence it writes into its own failure BODY (where this service actually
 * puts it — its 429s carry no rate-limit header at all), or an exhausted
 * monthly quota whose refresh point it declares. So a limited result WITHOUT
 * any stated time must say that plainly. Substituting a locally invented
 * countdown would be the single most misleading thing this feature could do: it
 * would look like an upstream answer while being a guess, and the user would
 * wait for a moment that means nothing.
 */
/**
 * ` · 约 1 小时后` for a future instant, or `''` when there is none.
 *
 * Kept beside {@link probeResultView} rather than inlined three times so the
 * "append only when non-empty" rule cannot drift between the two limited
 * outcomes. The absolute instant stays the primary text: it is the upstream's
 * own answer, and the relative form is a convenience derived from it.
 */
export function retrySuffix(t: Translate, untilMs: number | undefined, nowMs: number): string {
  if (untilMs === undefined) return ''
  const remaining = remainingText(t, untilMs, nowMs)
  return remaining === '' ? '' : ` · ${remaining}`
}

/**
 * Render one measured speed, or why there is none (issue #92).
 *
 * The timestamp is PART of the value, not decoration: speed changes with load,
 * and a number without its moment is indistinguishable from a fresh one. When the
 * measurement could not be timed the row says so and names the reason — never a
 * zero, and never a guess extrapolated from `elapsedMs`, which for some runs is
 * time-to-first-token and for others a whole-request duration.
 */
export function tpsResultView(
  result: WorkBuddyWebTpsResult,
  t: Translate,
  measuredAtMs: number | undefined,
): { text: string, tone: 'ok' | 'warn' | 'bad' } {
  const stamp = measuredAtMs === undefined ? '' : ` · ${t('row.tpsMeasuredAt', { at: formatDate(measuredAtMs) })}`
  if (result.tokensPerSecond === undefined) {
    const reason = result.reason === 'few-chunks'
      ? 'row.tpsNoSample'
      : result.reason === 'no-usage'
        ? 'row.tpsNoUsage'
        : 'row.tpsAllFailed'
    return {
      text: result.samples > 0 && result.reason !== undefined
        ? `${t(reason)}${stamp}`
        : `${t('row.tpsAllFailed')}${stamp}`,
      tone: 'bad',
    }
  }
  const speed = result.samples < TPS_EXPECTED_RUNS
    ? t('row.tpsPartial', { tps: String(result.tokensPerSecond), samples: String(result.samples) })
    : result.timeToFirstTokenMs === undefined
      ? t('row.tpsValue', { tps: String(result.tokensPerSecond) })
      : t('row.tpsValueTtft', {
        tps: String(result.tokensPerSecond),
        ttft: (result.timeToFirstTokenMs / 1000).toFixed(1),
      })
  const cost = result.credit === undefined ? '' : ` · ${t('row.tpsCredit', { credit: String(result.credit) })}`
  return { text: `${speed}${cost}${stamp}`, tone: result.samples < TPS_EXPECTED_RUNS ? 'warn' : 'ok' }
}

/** Runs a complete measurement takes; below this the row says "n runs". */
export const TPS_EXPECTED_RUNS = 3

export function probeResultView(
  result: WorkBuddyWebProbeResult,
  t: Translate,
  nowMs: number = Date.now(),
): { text: string, tone: 'ok' | 'warn' | 'bad' } {
  switch (result.outcome) {
    case 'ok': {
      const elapsed = result.elapsedMs === undefined ? undefined : `${String(result.elapsedMs / 1000)}s`
      return {
        text: elapsed === undefined ? t('row.probeOk') : t('row.probeOkMs', { ms: elapsed }),
        tone: 'ok',
      }
    }
    case 'rate-limited':
      return {
        text: result.retryAtMs === undefined
          ? t('row.probeRateLimitedUnknown')
          : t('row.probeRateLimitedAt', { at: formatDate(result.retryAtMs) })
            + retrySuffix(t, result.retryAtMs, nowMs),
        tone: 'warn',
      }
    case 'model-busy':
      // Its own state, never "被限流": the account is fine and switching it
      // would not help. `retryAtMs` here comes from the upstream's stated
      // MAGNITUDE ("about a minute", `retrySource: 'upstream-tips'`) rather than
      // a timestamp, which is why the label says what the failure actually is
      // instead of implying the upstream printed a time it never printed.
      return {
        text: result.retryAtMs === undefined
          ? t('row.probeModelBusyUnknown')
          : t('row.probeModelBusyAt', { at: formatDate(result.retryAtMs) })
            + retrySuffix(t, result.retryAtMs, nowMs),
        tone: 'warn',
      }
    case 'out-of-credit':
      // Only a quota-reset answer is a real time; without one, the honest text
      // is the same "no time given" the rate-limit branch uses.
      return {
        text: result.retryAtMs === undefined
          ? t('row.probeOutOfCreditUnknown')
          : t('row.probeOutOfCreditAt', { at: formatDate(result.retryAtMs) })
            + retrySuffix(t, result.retryAtMs, nowMs),
        tone: 'bad',
      }
    case 'credential-rejected': return { text: t('row.probeCredentialRejected'), tone: 'bad' }
    case 'account-restricted': return { text: t('row.probeAccountRestricted'), tone: 'bad' }
    case 'policy-rejected': return { text: t('row.probePolicyRejected'), tone: 'bad' }
    // `warn`, not `bad`: nothing about the account is wrong, and the row's own
    // job is to keep the user from reading this as "this account is broken".
    // The label says the remedy lives in the prompt.
    case 'channel-rejected': return { text: t('row.probeChannelRejected'), tone: 'warn' }
    case 'not-found': return { text: t('row.probeNotFound'), tone: 'bad' }
    case 'unavailable': return { text: t('row.probeUnavailable'), tone: 'bad' }
    default:
      return {
        text: result.status === undefined
          ? t('row.probeFailed')
          : t('row.probeFailedStatus', { status: String(result.status) }),
        tone: 'bad',
      }
  }
}
