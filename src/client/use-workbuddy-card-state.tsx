import { WORKBUDDY_POLL_INTERVALS_MS, WORKBUDDY_DEFAULT_POLL_INTERVAL_MS, regionNewModelsShownOf, nextRegionNewModelsShown } from '../status-paths.ts'
import { pollIntervalMsOf, writePollIntervalMs, writeRegionNewModelsShown } from './account-selection.ts'
/** 从 WorkBuddyCard.tsx 按职责提取；来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { nextRegionCreditPosition, nextRegionCreditsShown, nextRegionEnabled, nextRegionImageToolEnabled, nextRegionPreferredVideoModels, nextRegionVideoToolEnabled, regionCreditsShownOf, regionEnabledOf, regionImageToolEnabledOf, regionPreferredVideoModelsOf, regionVideoToolEnabledOf, WORKBUDDY_ACCOUNTS_REFRESH_PATH, WORKBUDDY_DEVICE_PROFILE_PATH, WORKBUDDY_MEDIA_MODELS_PATH, WORKBUDDY_MODELS_REFRESH_PATH, WORKBUDDY_PROBE_PATH, WORKBUDDY_TPS_PATH, WORKBUDDY_REGIONS, WORKBUDDY_USAGE_PATH, toPersistedWorkBuddyModel, withWorkBuddyRegion, withWorkBuddyRegionFastDetail } from '../status-paths.ts'
import type { WorkBuddyCreditPosition, WorkBuddyWebMediaModel, WorkBuddyWebModel, WorkBuddyWebProbeResult, WorkBuddyWebTpsResult, WorkBuddyWebRegion, WorkBuddyWebUsage } from '../status-paths.ts'
import { channelRejectContinueOf, cliBridgeEffortOf, cliBridgeEnabledOf, cliBridgeModelOf, cliBridgeRegionOrderOf, extraInjectedPrefixesOf, isFileContentionWriteError, sessionTitleOf, sidebarPanelEnabledOf, upstreamSwitchOf, writeAccountSlot, writeCliBridgeEnabled, writeCliBridgeEffort, writeCliBridgeModel, writeCliBridgeRegionOrder, writeRegionCreditPosition, writeRegionCreditsShown, writeRegionEnabled, writeRegionImageToolEnabled, writeRegionPreferredVideoModels, writeRegionVideoToolEnabled, writeRegionModels, writeSidebarPanelEnabled, writeUpstreamSwitch } from './account-selection.ts'
import { setSidebarPanelWanted } from './panel-switch.ts'

import { fetchDeviceSettings, putDeviceMode, putDeviceProfile } from './device-profile.ts'
import type { WorkBuddyDeviceMode, WorkBuddyDeviceSettings } from './device-profile.ts'

import { createLatestWins } from '../account-pool.ts'

import { imageDefaultFor } from '../native-modality.ts'

import { type WorkBuddyCardProps, STATUS_RETRY_BASE_MS, STATUS_RETRY_MAX_MS, readMediaRoster, type WorkBuddyDraft } from './workbuddy-card-view.tsx'
export function useWorkBuddyCardState({ t, settingsScope, view, surface, backToConversation }: WorkBuddyCardProps) {
  if (t === undefined) throw new Error('WorkBuddy plugin card requires its translation function')
  const pageSurface = surface === 'page'
  // A page surface is always expanded; only the card chrome toggles. The
  // collapse button is not rendered in page mode, so `setCardOpen` is unused there
  // — keeping a single `open` value lets the polling effects stay untouched.
  const [cardOpen, setCardOpen] = useState(view === 'page')
  const open = pageSurface || surface === 'section' || surface === 'settings' || cardOpen
  /** The region whose tab is on screen; each tab is its own provider stack. */
  const [activeRegion, setActiveRegion] = useState<WorkBuddyWebRegion>('cn')
  /**
   * Last-known usage per region, so tab dots survive tab switches.
   *
   * EMPTY until a real document lands (issue #77). It used to be seeded with a
   * `signed-out` placeholder, which was then rendered: for as long as the usage
   * route took to answer — and that wait is exactly what #77 reports — a user
   * with several signed-in accounts was told they were not signed in, with a
   * "detect accounts" button as the only way out. An absent region now renders
   * the loading line instead, and the first paint itself arrives from the
   * `detail=fast` document (local state only, no upstream call), so the rows
   * appear before anything billing-side has answered.
   */
  const [statusByRegion, setStatusByRegion] = useState<Partial<Record<WorkBuddyWebRegion, WorkBuddyWebUsage>>>({})
  /**
   * Which of the card's three sections is on screen.
   *
   * The section tabs exist because the card grew into one 3,500 px column that
   * carried two unrelated jobs: operating an account (who serves, how much is
   * left, which order) and editing the catalog (which models, what context
   * budget, which reasoning tiers). They even commit differently — an account
   * change lands on the click, a catalog change is a draft until saved — so a
   * single column put the save button three screens away from what it saves.
   *
   * Only the ACTIVE section is visible; the others stay MOUNTED (the `hidden`
   * attribute), so switching back never refetches, a half-filled draft
   * survives, and the pool keeps its log.
   */
  /* `capabilities` is a section of its own, not a corner of `accounts`: the
   * switches it holds authorize SPEND and tool registration, they commit on the
   * click (there is no Save button anywhere near them), and each is expected to
   * grow sub-options — a working directory for the CLI route, a per-image price
   * cap, an image size. Those have nowhere to go in a flat list under the tab
   * bar, where every added control competes with the account table for the same
   * screen.
   */
  const [panel, setPanel] = useState<'accounts' | 'models' | 'capabilities' | 'diag' | 'sdk'>('accounts')
  const [busy, setBusy] = useState(false)
  const [settingsRevision, setSettingsRevision] = useState(0)
  /** Per-region unsaved model edits; a draft on one tab is never dropped by
   * switching to the other tab, only by that tab's discard/save. */
  const [drafts, setDrafts] = useState<Partial<Record<WorkBuddyWebRegion, WorkBuddyDraft>>>({})
  const [saving, setSaving] = useState(false)
  /** Save failure surfaced next to the buttons; cleared by the next attempt. */
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  /**
   * The region's MEDIA model roster (read-only), keyed by region.
   *
   * NOT part of `statusByRegion`: the usage document is the editable model
   * directory, and folding media rows into it would put them in the saved
   * `lastCatalog` — where the adapter would offer an image model as a chat
   * model. It is a separate, cheap, read-only read that only the capability
   * panel needs.
   */
  const [mediaByRegion, setMediaByRegion] = useState<Partial<Record<WorkBuddyWebRegion, readonly WorkBuddyWebMediaModel[]>>>({})
  const [mediaError, setMediaError] = useState<string | undefined>(undefined)
  const [mediaBusy, setMediaBusy] = useState(false)
  /**
   * Whether the account pool's save is in flight. Both sections write into one
   * region slot and the Host merges per-region, so two concurrent saves can
   * interleave on a stale base and revert each other while both report success
   * — the two save buttons are serialized to make that impossible.
   */
  const [poolBusy, setPoolBusy] = useState(false)
  /**
   * 设备头设置：`undefined` = 还没读到 / 这台 Host 没有这条路由。
   *
   * 两种"没有值"必须合并成同一个信号（不渲染控件），因为卡片无论哪种情况都不该
   * 显示一个点不动的开关；区别只在实现上：前者下一轮轮询会补上，后者永远不会。
   */
  const [deviceSettings, setDeviceSettings] = useState<WorkBuddyDeviceSettings | undefined>(undefined)
  /** A refused account write (silently unpersisted settings on a locked file). */
  const [accountError, setAccountError] = useState<string | undefined>(undefined)
  /** Region whose on/off checkbox write is in flight, so its box can't race. */
  const [togglingRegion, setTogglingRegion] = useState<WorkBuddyWebRegion | undefined>(undefined)
  /**
   * Region whose SIDEBAR-credit checkbox write is in flight.
   *
   * Tracked separately from {@link togglingRegion} because they are different
   * fields of the same region slot: one in-flight write must not disable the
   * other control, and both must stay serialized against the SAVE writers.
   */
  const [togglingCredits, setTogglingCredits] = useState<WorkBuddyWebRegion | undefined>(undefined)
  /**
   * Which video-model pin is being written right now: the tag string, or
   * undefined.
   *
   * A SEPARATE state from {@link togglingCredits} for the same reason those two
   * switches keep separate busy flags: the pin lives in a different field of the
   * same region slot, so one in-flight write must not disable the other control.
   */
  const [pinningVideoModel, setPinningVideoModel] = useState<string | undefined>(undefined)
  /**
   * The OPTIONAL CodeBuddy CLI route switch (global: one switch, one budget).
   *
   * `undefined` until the first Host answer arrives, so the box renders the
   * committed value instead of guessing — the same rule as `creditsShownOn`.
   */
  const [cliBridgeOn, setCliBridgeOn] = useState<boolean | undefined>(undefined)
  const [cliBridgeBusy, setCliBridgeBusy] = useState(false)
  /**
   * The OPTIONAL sidebar-row switch (PR #188).
   *
   * `undefined` until the first Host answer arrives, so the box renders the
   * committed value instead of guessing — the same rule as `cliBridgeOn`.
   */
  const [sidebarPanelOn, setSidebarPanelOn] = useState<boolean | undefined>(undefined)
  const [sidebarPanelBusy, setSidebarPanelBusy] = useState(false)
  const [pollIntervalOn, setPollIntervalOn] = useState<number | undefined>(undefined)
  const [pollIntervalBusy, setPollIntervalBusy] = useState(false)
  /**
   * The quick-adjust pins of the CLI route (model, effort, region order) made
   * by THIS card instance.
   *
   * Each is `undefined` until the user changes its picker here: the value
   * then renders from the Host's answer (the authoritative mirror) and falls
   * back to the settings snapshot only when the Host cannot say — the same
   * rule as `cliBridgeOn`. A failed write reverts to `undefined`, so the
   * picker shows the COMMITTED value again instead of one that never landed.
   */
  const [cliBridgeModel, setCliBridgeModel] = useState<string | undefined>(undefined)
  const [cliBridgeModelBusy, setCliBridgeModelBusy] = useState(false)
  const [cliBridgeEffort, setCliBridgeEffort] = useState<string | undefined>(undefined)
  const [cliBridgeEffortBusy, setCliBridgeEffortBusy] = useState(false)
  const [cliBridgeRegionOrder, setCliBridgeRegionOrder] = useState<string | undefined>(undefined)
  const [cliBridgeRegionOrderBusy, setCliBridgeRegionOrderBusy] = useState(false)
  /**
   * The upstream-identity switches the user flipped in this session.
   *
   * `undefined` means "not touched here, read the committed settings"; a flipped
   * value wins until the next snapshot agrees (same rule as `cliBridgeOn`). Each
   * switch has its own busy flag so flipping one does not disable the others —
   * they are independent writes, and a shared flag would make the card feel
   * frozen while one of them is in flight.
   */
  const [usageIdentityOn, setUsageIdentityOn] = useState<boolean | undefined>(undefined)
  const [usageIdentityBusy, setUsageIdentityBusy] = useState(false)
  const [keepPromptLastOn, setKeepPromptLastOn] = useState<boolean | undefined>(undefined)
  const [keepPromptLastBusy, setKeepPromptLastBusy] = useState(false)
  const [sessionTitleOn, setSessionTitleOn] = useState<boolean | undefined>(undefined)
  const [sessionTitleBusy, setSessionTitleBusy] = useState(false)
  const [channelRejectContinueOn, setChannelRejectContinueOn] = useState<boolean | undefined>(undefined)
  const [channelRejectContinueBusy, setChannelRejectContinueBusy] = useState(false)
  const [dropAllThinkingOn, setDropAllThinkingOn] = useState<boolean | undefined>(undefined)
  const [dropAllThinkingBusy, setDropAllThinkingBusy] = useState(false)
  /**
   * Probe results, keyed by region then model id.
   *
   * Kept per region for the same reason drafts are: the two tabs are separate
   * provider stacks, so a test run on one tab must not be clobbered — or shown —
   * as the other tab's answer.
   */
  const [probes, setProbes] = useState<Partial<Record<WorkBuddyWebRegion, Record<string, WorkBuddyWebProbeResult>>>>({})
  /** Model ids with a probe in flight, so each row's button can disable itself. */
  const [probing, setProbing] = useState<Record<string, boolean>>({})
  /** Probe failure that is not attributable to one model (a dead route, say). */
  const [probeError, setProbeError] = useState<string | undefined>(undefined)
  /**
   * The active region's probe results, mirrored into a ref.
   *
   * The sweep loop reads each verdict as soon as it lands, and state read inside
   * an async loop is the value captured when the loop STARTED — so counting from
   * `probes` would tally the previous run's answers. The ref is updated in the
   * same place the state is, so the two cannot drift.
   */
  const probesRef = useRef<Record<string, WorkBuddyWebProbeResult>>({})
  /** Progress of an in-flight sweep, or undefined when none is running. */
  const [sweeping, setSweeping] = useState<{ done: number, total: number } | undefined>(undefined)
  /**
   * Measured output speed per model (issue #92), keyed by model id.
   *
   * Kept in its own map, NOT merged into `probes`: a speed run says nothing about
   * availability and an availability run says nothing about speed, so one map
   * holding both would let a fresh speed reading overwrite a stale availability
   * verdict (or the reverse) with no field to tell them apart.
   *
   * Deliberately survives a region switch's re-render but is NOT persisted: a
   * speed number is only meaningful with the moment it was taken, and a stored
   * one would be indistinguishable from a fresh measurement. The row prints the
   * time beside it for the same reason.
   */
  const [tpsResults, setTpsResults] = useState<Record<string, WorkBuddyWebTpsResult>>({})
  /** Which speed runs are in flight, so the row and the sweep button can spin. */
  const [tpsProbing, setTpsProbing] = useState<Record<string, boolean>>({})
  /** Progress of a speed sweep, so the button can show "n/m" instead of hanging. */
  const [tpsSweeping, setTpsSweeping] = useState<{ done: number, total: number } | undefined>(undefined)
  /** When each model's speed was measured, in ms; printed beside the number. */
  const [tpsMeasuredAt, setTpsMeasuredAt] = useState<Record<string, number>>({})
  /** The last sweep's tally, cleared when the next one starts. */
  const [sweepSummary, setSweepSummary] = useState<string | undefined>(undefined)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => settingsScope?.subscribe(() => { setSettingsRevision(value => value + 1) }), [settingsScope])

  /**
   * Per-region latest-wins guard for the usage fetch.
   *
   * Two refreshes can overlap — the 60s poll, a save, a batch action, the
   * account re-scan — and they are plain `fetch`es with no ordering guarantee.
   * Without a guard the SLOWER response wins, so a snapshot taken before a
   * check-in could land after one taken after it and overwrite the newer
   * credits. The guard makes "the last request started" the one that is applied,
   * whatever order the responses arrive in.
   *
   * Keyed by region, not global: the card deliberately fetches BOTH regions at
   * once (`for (const region of WORKBUDDY_REGIONS)` below), so a single shared
   * counter would make each of those two calls cancel the other and leave one
   * tab permanently stale.
   *
   * The rule itself is the tested `createLatestWins` factory, not a second
   * implementation written here.
   *
   * `begin()` returns a probe that reports **stale**: `true` once a newer call
   * has claimed the same region (see `src/account-pool.ts`). So the variable is
   * named `stale` and the bail-out is `if (stale())` — the same polarity as the
   * Host's rotation guard in `src/index.ts`. Naming it `fresh` and writing
   * `if (!fresh())` inverts the poll: every response that is NOT superseded —
   * i.e. every response in the single-fetch case — gets discarded, and the card
   * renders its placeholder forever. That defect shipped once; the polarity is
   * now pinned by a rendered assertion rather than by the spelling of the
   * identifier.
   */
  const usageGuard = useRef(createLatestWins<WorkBuddyWebRegion>())

  const refreshUsage = useCallback(async (
    region: WorkBuddyWebRegion,
    signal?: AbortSignal,
  ): Promise<WorkBuddyWebUsage | undefined> => {
    // Claimed BEFORE the fetch: any request that starts later supersedes this
    // one, even if this one's response arrives after it.
    const stale = usageGuard.current.begin(region)
    try {
      const response = await fetch(withWorkBuddyRegion(WORKBUDDY_USAGE_PATH, region), {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const usage = value as WorkBuddyWebUsage
      // Superseded while in flight: applying now would clobber a newer snapshot.
      if (stale()) return undefined
      if (mounted.current && signal?.aborted !== true) {
        setStatusByRegion(prev => ({ ...prev, [region]: usage }))
      }
      return usage
    } catch (error: unknown) {
      // The error path is guarded too: a stale failure would otherwise replace
      // a newer successful snapshot with an error banner.
      if (stale()) return undefined
      if (mounted.current && signal?.aborted !== true) {
        const message = error instanceof Error ? error.message : t('row.requestFailed')
        // Do NOT collapse the region into the union's `{ status: 'error' }`
        // variant when we already have data. That variant carries NO fields —
        // no `accounts`, `pool`, `credits` or `models` — and the whole panel
        // body is gated on `status === 'signed-in'`, so replacing a healthy
        // snapshot with it blanks the account picker, the credits panel, the
        // model directory AND the account pool because one refresh failed. A
        // user midway through editing pool settings would watch their panel
        // vanish after pressing Save, which reads as data loss.
        //
        // Keeping the last good snapshot with a `refreshError` overlay shows
        // the same information the failure would have hidden, plus the reason —
        // the pattern `creditsError` and `checkinError` already use per section.
        setStatusByRegion(prev => {
          const previous = prev[region]
          if (previous !== undefined && previous.status === 'signed-in') {
            return { ...prev, [region]: { ...previous, refreshError: message } }
          }
          // Nothing to preserve: this region never loaded, so the bare error
          // state is the honest answer (it drives the sign-in guidance).
          return { ...prev, [region]: { status: 'error', message } }
        })
      }
      return undefined
    }
  }, [t])

  /**
   * FIRST PAINT (issue #77): the same usage document, built from LOCAL state
   * only — no billing request, no per-account check-in read.
   *
   * Why this exists. The card used to paint nothing until ONE monolithic
   * document landed, and that document's tail awaited an upstream call per
   * account (credits for every pool member, check-in for every account, plus
   * the selected account's own two). Each of those has a 30-second timeout and
   * no retry, so a slow or throttled upstream stacked the waits and the panel
   * stayed empty for the reported 30–60 seconds — showing a "not signed in"
   * placeholder the whole time, because that is what an absent document
   * rendered as.
   *
   * The Host answers `detail=fast` from the credential store, the local pool
   * roster and the measurement caches, so this is one local round trip. It
   * carries the whole account table (the row list lives in the `pool` block),
   * which is the part the user came for; credits, check-in and the selected
   * account's live figures arrive with the full document that follows.
   *
   * Deliberately a SEPARATE callback instead of a `detail` argument on
   * `refreshUsage`: the ordering guard inside that callback is pinned by a
   * source test that counts its writes and freshness checks, and a second
   * write path in there would either break the pin or hide a real regression
   * behind it. Here the rules are simple and independent — this response never
   * downgrades a region that has already answered in full.
   */
  const refreshUsageFast = useCallback(async (
    region: WorkBuddyWebRegion,
    signal?: AbortSignal,
  ): Promise<void> => {
    const stale = usageGuard.current.begin(region)
    try {
      const response = await fetch(withWorkBuddyRegionFastDetail(WORKBUDDY_USAGE_PATH, region), {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      if (!response.ok) return
      const value: unknown = await response.json().catch(() => undefined)
      const usage = value as WorkBuddyWebUsage | undefined
      if (usage === undefined) return
      // Superseded while in flight: a newer request owns this region now.
      if (stale()) return
      if (!mounted.current || signal?.aborted === true) return
      setStatusByRegion(prev => {
        const previous = prev[region]
        // A later first paint never REPLACES a region that already answered in
        // full: the fast document is the poorer one (it deliberately carries no
        // credits and no live pool figures), so writing it over a complete
        // snapshot would blank columns that were already on screen. Only a
        // region with nothing — or with a bare error from an attempt that never
        // loaded — takes the fast paint.
        if (previous !== undefined && previous.status === 'signed-in') return prev
        return { ...prev, [region]: usage }
      })
    } catch {
      // A failed first paint is not an error state: it is simply no paint yet,
      // and the full document is already on its way. The loading line stays up
      // until one of them lands.
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    // The FIRST-PAINT fetch runs before the full one (issue #77), for every
    // region and in parallel: the account table appears after one local round
    // trip instead of after the billing reads. The full document is then issued
    // as before, and because it begins its own generation after the fast one
    // has landed, the two cannot invalidate each other — the fast answer is
    // applied while it is still the newest request for that region.
    void (async () => {
      await Promise.all(WORKBUDDY_REGIONS.map(async region => {
        await refreshUsageFast(region, controller.signal)
      }))
      // The card was closed (or the tab switched) while the first paint was in
      // flight: the cleanup aborted this generation, so do not start the
      // expensive one against a dead signal.
      if (controller.signal.aborted) return
      // BOTH regions, not just the active tab: both switches are always rendered
      // in the tab bar, and the Host is where `regionOn` reads their state from.
      // Fetching only the active region left the other switch on the mirror
      // fallback until its tab was clicked — which is exactly the stale source
      // this card is trying to stop trusting.
      for (const region of WORKBUDDY_REGIONS) {
        void refreshUsage(region, controller.signal)
      }
    })()
    return () => { controller.abort() }
  }, [open, activeRegion, refreshUsage, refreshUsageFast])

  /**
   * The document this tab is rendering, or `undefined` before ANY has landed.
   *
   * The distinction is the point of issue #77: an absent document used to be
   * rendered as the `signed-out` placeholder below, so for the whole time the
   * usage route was out the card told a signed-in user they were not signed in
   * and offered "detect accounts" as the only remedy. `loading` now gates that
   * branch, and the placeholder is only a safe shape for the reads below it.
   */
  const loaded: WorkBuddyWebUsage | undefined = statusByRegion[activeRegion]
  const loading = loaded === undefined
  const status: WorkBuddyWebUsage = loaded
    ?? { status: 'signed-out', accounts: [], selectionExplicit: false }
  /**
   * Whether the ACTIVE region has a usable sign-in.
   *
   * The section tabs render only here: a signed-out card is one screen of
   * instructions, and splitting that into panels would hide the only thing it
   * has to say behind a tab.
   */
  const signedIn = status.status === 'signed-in'
  // Host readback determines the timer; invalid values use the shared default.
  const rawInterval = 'pollIntervalMs' in status ? status.pollIntervalMs : undefined
  const pollIntervalMs = typeof rawInterval === 'number' && WORKBUDDY_POLL_INTERVALS_MS.includes(rawInterval) ? rawInterval : WORKBUDDY_DEFAULT_POLL_INTERVAL_MS

  /**
   * Whether the ACTIVE region knows of any account at all.
   *
   * This is the poll's precondition in place of `status === 'signed-in'`. The
   * signed-in flag means "a credential resolves", which is false for a region
   * whose accounts exist but none is usable yet — exactly the state an import
   * or a fresh OAuth sign-in creates. Polling on it meant those regions never
   * refreshed, so the list stayed empty until the card was reopened.
   */
  const hasAccounts = status.status !== 'error' && status.accounts.length > 0

  useEffect(() => {
    // Gate on HAVING AN ACCOUNT, not on `signed-in`. A region whose only
    // accounts were just imported or just signed in through OAuth is not
    // `signed-in` (no credential resolves yet), so gating on that status left
    // the very case the import/sign-in produces with no poll at all — the new
    // account could only appear after the card was closed and reopened. An
    // account list is the real precondition for wanting a refresh.
    if (!open || !hasAccounts) return
    const controller = new AbortController()
    const timer = window.setInterval(
      () => { void refreshUsage(activeRegion, controller.signal) },
      pollIntervalMs,
    )
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [open, activeRegion, refreshUsage, status.status, pollIntervalMs])

  /**
   * 设备头设置：卡片打开时读一次。
   *
   * 不跟 60 秒轮询走：本页每次写入后，用 DSH 返回值更新状态，避免多余的定时读取。
   * 其他标签页或外部进程修改文件时，本页不会立即同步，重新打开后再读。
   */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const settings = await fetchDeviceSettings(WORKBUDDY_DEVICE_PROFILE_PATH)
        if (!cancelled && mounted.current) setDeviceSettings(settings)
      } catch {
        // 读取失败时按当前 DSH 未提供该路由处理，隐藏对应控件，
        // 设备参数是可选功能，读不到它不该在卡片上留下一行红字。
      }
    })()
    return () => { cancelled = true }
  }, [open])

  /** 切档：Host 是唯一真源，所以用它的返回值覆盖本地状态，而不是猜一个。 */
  const changeDeviceMode = async (mode: WorkBuddyDeviceMode): Promise<void> => {
    const settings = await putDeviceMode(WORKBUDDY_DEVICE_PROFILE_PATH, mode)
    if (mounted.current) setDeviceSettings(settings)
  }

  /** 保存一个账号的覆盖值。抛错由 AccountPool 接住并留在弹窗里。 */
  const saveDeviceProfile = async (
    accountId: string,
    values: { machineId: string, sessionId: string },
  ): Promise<void> => {
    const settings = await putDeviceProfile(WORKBUDDY_DEVICE_PROFILE_PATH, accountId, values)
    if (mounted.current) setDeviceSettings(settings)
  }

  /**
   * Recover from a failed status read without a close/reopen.
   *
   * Keyed on the document identity (`loaded`), not on `status.status`: every
   * failed read writes a FRESH `{ status: 'error' }` object, so the identity
   * changes and the next attempt is armed. A successful read replaces it with a
   * new object too, which resets the counter through the branch below.
   */
  const statusRetries = useRef(0)
  useEffect(() => {
    if (!open || status.status !== 'error') {
      statusRetries.current = 0
      return
    }
    const delay = Math.min(STATUS_RETRY_MAX_MS, STATUS_RETRY_BASE_MS * 2 ** statusRetries.current)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      statusRetries.current += 1
      void refreshUsage(activeRegion, controller.signal)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, activeRegion, refreshUsage, loaded])

  /**
   * Re-detect the local sign-ins and refresh the panel.
   *
   * This deliberately writes NO account selection. It used to persist whatever
   * row the store reported as "selected" whenever that differed from the saved
   * value, which had two harmful effects: with no explicit choice it turned the
   * documented default (follow the app's current sign-in) into a permanent
   * explicit binding — so a later sign-in in the app was no longer followed —
   * and with an orphaned saved id it silently re-bound the region to a
   * different account, which is the silent switch that the strict
   * no-fallback rule exists to prevent. Re-detecting and re-picking are
   * separate actions now; the picker and Clear button own the selection.
   */
  const rescanAccounts = async (): Promise<void> => {
    setBusy(true)
    setAccountError(undefined)
    try {
      const response = await fetch(withWorkBuddyRegion(WORKBUDDY_ACCOUNTS_REFRESH_PATH, activeRegion), {
        method: 'POST', headers: { accept: 'application/json' }, credentials: 'same-origin',
      })
      const body = await response.json() as { accounts?: { id: string }[]; dismissalsCleared?: boolean }
      if (!response.ok || !Array.isArray(body.accounts)) throw new Error(`HTTP ${response.status}`)
      // The Host VERIFIES that the hides are gone (see `clearDismissals`) and
      // says so; `false` means a locked vault file defeated both the unlink and
      // the rewrite. Without this line the card showed a successful scan while
      // the account the user was trying to recover stayed hidden — the button
      // silently not doing what its own tooltip promises.
      //
      // Absent means a Host that predates the flag, which is not a failure.
      if (body.dismissalsCleared === false) setAccountError(t('row.rescanHidesKept'))
      await refreshUsage(activeRegion)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const switchAccount = async (accountId: string): Promise<void> => {
    if (settingsScope === undefined) return
    setSwitchingAccount(true)
    setAccountError(undefined)
    try {
      // Verified write: `set()` resolving does not prove the value was stored
      // (see `writeAccountSlot`), and a silently dropped switch would leave the
      // picker showing one account while another one serves.
      await writeAccountSlot(settingsScope, activeRegion, accountId)
      await refreshUsage(activeRegion)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setSwitchingAccount(false)
    }
  }

  /**
   * Whether one region's provider is switched on.
   *
   * The HOST's answer wins, because on this deployment it is the only writer
   * that lands: the switch goes through the plugin's Host save endpoint (that
   * endpoint is the only writer that cannot drop the sibling region), and a
   * write made there does NOT update the browser settings mirror. Reading the
   * mirror therefore left the checkbox stuck ON after a successful disable —
   * "不能正确取消国际版/国内版" — even though `enabled: false` was already in
   * the profile configuration. The Host sends the committed value it derives
   * from its own config (`status.enabled`, see `deps.regionEnabled`), so the
   * card renders that.
   *
   * The mirror stays as the FALLBACK: a host that predates the field, or a
   * status that has not loaded yet, still renders from the stored document
   * rather than guessing. Both rules are the same opt-out rule (only an
   * explicit `false` disables), so the two sources cannot disagree — only one
   * of them can be stale.
   */
  const regionOn = (item: WorkBuddyWebRegion): boolean => {
    // The `error` arm of the union carries no `enabled` in its TYPE (the Host
    // still fills it at runtime), so the field is read through a narrow probe
    // rather than widening the union for one consumer.
    const usage = statusByRegion[item] as { enabled?: unknown } | undefined
    const fromHost = usage?.enabled
    if (typeof fromHost === 'boolean') return fromHost
    return regionEnabledOf(settingsScope?.getSnapshot().value, item)
  }
  const activeRegionOn = regionOn(activeRegion)

  /**
   * Whether one region's sidebar credit line is shown — for the ACTIVE tab.
   *
   * Prefers the Host's answer, exactly like {@link regionOn} and for the same
   * measured reason: on the affected 0.1.7 deployment the browser's settings
   * mirror never picks up this plugin's writes, so a checkbox reading the mirror
   * rendered its previous value after a successful save and looked impossible to
   * turn off ("关闭不了"). The Host is the authority; the mirror is only a
   * fallback for a Host line that predates the field.
   */
  const [togglingNewModels, setTogglingNewModels] = useState<WorkBuddyWebRegion | undefined>(undefined)
  const newModelsShownOn = (item: WorkBuddyWebRegion): boolean => {
    const usage = statusByRegion[item] as { showNewModelsInMainUi?: unknown } | undefined
    if (typeof usage?.showNewModelsInMainUi === 'boolean') return usage.showNewModelsInMainUi
    return regionNewModelsShownOf(settingsScope?.getSnapshot().value, item)
  }

  const creditsShownOn = (item: WorkBuddyWebRegion): boolean => {
    const usage = statusByRegion[item] as { showCreditsInMainUi?: unknown } | undefined
    const fromHost = usage?.showCreditsInMainUi
    if (typeof fromHost === 'boolean') return fromHost
    return regionCreditsShownOf(settingsScope?.getSnapshot().value, item)
  }

  /**
   * Whether the model may call the image tool in this region.
   *
   * Read off the Host's answer first, like {@link creditsShownOn} and for the
   * same measured reason — the browser mirror is stale for this namespace on the
   * affected 0.1.7 deployments, and here a stale `true` would be worse than a
   * dead checkbox: it would claim the spending capability is on.
   */
  const imageToolOn = (item: WorkBuddyWebRegion): boolean => {
    const usage = statusByRegion[item] as { imageToolEnabled?: unknown } | undefined
    if (typeof usage?.imageToolEnabled === 'boolean') return usage.imageToolEnabled
    return regionImageToolEnabledOf(settingsScope?.getSnapshot().value, item)
  }

  /**
   * Whether the model may call the video tool in this region. Mirrors
   * imageToolOn: read off the Host answer first, so a stale mirror cannot
   * leave the spending capability on. Absent is NOT consent.
   */
  const videoToolOn = (item: WorkBuddyWebRegion): boolean => {
    const usage = statusByRegion[item] as { videoToolEnabled?: unknown } | undefined
    if (typeof usage?.videoToolEnabled === 'boolean') return usage.videoToolEnabled
    return regionVideoToolEnabledOf(settingsScope?.getSnapshot().value, item)
  }

  /**
   * The video model pinned for one mode tag in this region, or `''` for "no pin".
   *
   * Same read order as {@link videoToolOn} and for the same measured reason: the
   * Host's answer first, because this namespace's browser mirror is stale on the
   * affected 0.1.7 deployments — a picker reading the mirror alone would keep
   * showing a pin the tool no longer uses.
   *
   * `''` rather than `undefined` because that is what the `<select>` needs for its
   * "default" row; the write path turns it back into "remove the key".
   */
  const preferredVideoModelOf = (item: WorkBuddyWebRegion, tag: string): string => {
    const usage = statusByRegion[item] as { preferredVideoModels?: unknown } | undefined
    const fromHost = usage?.preferredVideoModels
    if (typeof fromHost === 'object' && fromHost !== null) {
      const pinned = (fromHost as Record<string, unknown>)[tag]
      if (typeof pinned === 'string') return pinned
    }
    return regionPreferredVideoModelsOf(settingsScope?.getSnapshot().value, item)[tag] ?? ''
  }

  /**
   * Switch one region's provider off or on. The write carries the region's
   * whole slot through untouched — only `enabled` changes — so the user's
   * directory, model picks, image opt-ins and budgets survive a round trip.
   * The Host withdraws or restores the provider route on the next `onChange`,
   * which is what actually removes it from DSH's model picker.
   *
   * Goes through `writeRegionEnabled` rather than calling `scope.set()`
   * directly: on the affected 0.1.7 deployments that scope settles without
   * storing anything, so a direct write appeared to succeed and then silently
   * reverted. The helper adds the landed-check and the Host-endpoint fallback
   * that every other settings write already had.
   */
  const toggleRegion = async (item: WorkBuddyWebRegion, enabled: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingRegion(item)
    try {
      // `nextRegionEnabled` unwraps the settings section itself and returns the
      // bare `regions` map, which is the whole-slot merge this write starts from.
      // The mirror is only a merge base for the SLOT; the write itself lands in
      // the Host (see `writeField`), which preserves the sibling region.
      const regions = nextRegionEnabled(settingsScope.getSnapshot().value, item, enabled) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionEnabled(
        settingsScope,
        item,
        enabled,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      // Re-read the Host so the switch renders the value that was just
      // committed. The write does not touch the browser mirror, and the Host is
      // what `regionOn` now reads, so without this refresh the checkbox keeps
      // showing its previous state and the toggle looks dead even though it
      // landed — the "不能正确取消" report.
      await refreshUsage(item)
    } catch (error: unknown) {
      // Surface the reason instead of leaving the switch silently unmoved.
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingRegion(undefined)
    }
  }

  /**
   * Show or hide one region's sidebar credit line.
   *
   * This is the SECOND control for that line: the sidebar row also carries an
   * `×` that writes the same `regions.<region>.showCreditsInMainUi` flag, and
   * both go through the same landed-checked writer, so they can never disagree.
   * The checkbox stays because the sidebar is not always rendered (collapsed
   * rail, or a host that never mounts the footer slot).
   *
   * Writes the region's WHOLE slot — unchanged except for this one flag — so a
   * hide never drops the directory, model picks, budgets or pool preferences
   * that live alongside it.
   */
  /**
   * WHERE the active region's credit readout sits (issue #62).
   *
   * Read off the Host's usage answer, like {@link creditsShownOn} and for the
   * same measured reason: the browser's settings mirror for this namespace is
   * documented as stale on the affected 0.1.7 deployments, so a control reading
   * it would keep showing the previous seat after a successful write. Absent
   * means `composer`, which is what the Host resolves for a profile written
   * before the setting existed.
   */
  const creditPositionOn = (item: WorkBuddyWebRegion): WorkBuddyCreditPosition => {
    const usage = statusByRegion[item] as { creditPosition?: unknown } | undefined
    return usage?.creditPosition === 'stats' ? 'stats' : 'composer'
  }

  /**
   * Move one region's credit readout between its two seats.
   *
   * Same shape as {@link toggleCredits}: whole region slot in, landed check,
   * then a Host re-read. The re-read is load-bearing here for the same reason —
   * the control renders the Host's answer, so without it the picker keeps
   * showing the seat it had and the change looks like it did nothing.
   */
  const changeCreditPosition = async (item: WorkBuddyWebRegion, position: WorkBuddyCreditPosition): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingCredits(item)
    try {
      const regions = nextRegionCreditPosition(settingsScope.getSnapshot().value, item, position) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionCreditPosition(
        settingsScope,
        item,
        position,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingCredits(undefined)
    }
  }

  const toggleNewModels = async (item: WorkBuddyWebRegion, shown: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingNewModels(item)
    try {
      const regions = nextRegionNewModelsShown(settingsScope.getSnapshot().value, item, shown) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionNewModelsShown(
        settingsScope,
        item,
        shown,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      // Re-read for the same measured reason as `toggleCredits`: the checkbox
      // renders the Host's answer, and the browser mirror is stale for this
      // namespace on the affected deployments.
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingNewModels(undefined)
    }
  }

  const toggleCredits = async (item: WorkBuddyWebRegion, shown: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingCredits(item)
    try {
      const regions = nextRegionCreditsShown(settingsScope.getSnapshot().value, item, shown) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionCreditsShown(
        settingsScope,
        item,
        shown,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      // Re-read the Host so the checkbox renders the value that was just
      // committed. This is load-bearing, not a refresh for its own sake: the
      // checkbox reads `showCreditsInMainUi` off the Host's usage answer (the
      // browser mirror is stale for this namespace), so without this re-read the
      // box keeps showing its previous state and the toggle looks dead even
      // though it landed — the "关闭不了" report.
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingCredits(undefined)
    }
  }

  /**
   * Whether the CLI route is mounted.
   *
   * Host answer first, settings mirror second, for the same measured reason as
   * `imageToolOn`: this namespace's browser mirror goes stale on the affected
   * deployments, and here a stale `true` would claim a spending capability is on.
   */
  const cliBridgeSwitchedOn = (): boolean => {
    if (cliBridgeOn !== undefined) return cliBridgeOn
    const fromHost = (statusByRegion[activeRegion] as { cliBridgeEnabled?: unknown } | undefined)?.cliBridgeEnabled
    if (typeof fromHost === 'boolean') return fromHost
    return cliBridgeEnabledOf(settingsScope?.getSnapshot().value)
  }

  /**
   * Flip the global CLI-route switch.
   *
   * The Host rebuilds only this route on the change (`cliBridge` is volatile),
   * so no provider stack is disposed and no in-flight request is interrupted.
   * Re-reads the usage afterwards so the box shows the COMMITTED value.
   */
  const toggleCliBridge = async (enabled: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setCliBridgeBusy(true)
    try {
      await writeCliBridgeEnabled(settingsScope, enabled)
      if (mounted.current) setCliBridgeOn(enabled)
      await refreshUsage(activeRegion)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setCliBridgeBusy(false)
    }
  }

  /**
   * Whether the OPTIONAL sidebar row is switched on (PR #188).
   *
   * Read Host-first, mirror-second, for the same measured reason as
   * `cliBridgeSwitchedOn`: the browser's settings mirror is stale for this
   * namespace on the affected 0.1.7 deployments. `=== true` on both — absent is
   * not consent, and this switch claims a global sidebar seat.
   */
  const sidebarPanelSwitchedOn = (): boolean => {
    if (sidebarPanelOn !== undefined) return sidebarPanelOn
    const fromHost = (statusByRegion[activeRegion] as { sidebarPanelEnabled?: unknown } | undefined)?.sidebarPanelEnabled
    if (typeof fromHost === 'boolean') return fromHost
    return sidebarPanelEnabledOf(settingsScope?.getSnapshot().value)
  }

  /** Read the saved refresh interval, preferring this card's verified write. */
  const pollIntervalValue = (): number => {
    // This card's own successful write wins: it is the only source that is
    // certain to be current the instant a save returns, while the settings
    // mirror is documented as unreliable for this namespace.
    if (pollIntervalOn !== undefined) return pollIntervalOn
    const fromSettings = pollIntervalMsOf(settingsScope?.getSnapshot().value)
    // Then the Host's answer, which is what the TIMER is actually using — a
    // picker showing anything else would be describing a cadence nobody runs.
    if ('pollIntervalMs' in status
      && typeof status.pollIntervalMs === 'number'
      && WORKBUDDY_POLL_INTERVALS_MS.includes(status.pollIntervalMs)) {
      return status.pollIntervalMs
    }
    return fromSettings
  }

  const changePollInterval = async (intervalMs: number): Promise<void> => {
    if (settingsScope === undefined) return
    setPollIntervalBusy(true)
    try {
      await writePollIntervalMs(settingsScope, intervalMs)
      if (mounted.current) setPollIntervalOn(intervalMs)
      // Re-read so the new cadence is visible in the very document the timer
      // will next read — a save that only changed local state would leave the
      // card polling at the OLD interval until the next unrelated refresh.
      await refreshUsage(activeRegion)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setPollIntervalBusy(false)
    }
  }

  /**
   * Flip the sidebar-row switch.
   *
   * Published to the entry's opt-in store on success, because the row is built
   * from slot ENTRY METADATA and therefore cannot decide its own visibility —
   * see `panel-switch.ts`. Publishing only AFTER the write is verified keeps the
   * two from disagreeing: the row never appears for a value the Host refused.
   */
  const toggleSidebarPanel = async (enabled: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setSidebarPanelBusy(true)
    try {
      await writeSidebarPanelEnabled(settingsScope, enabled)
      if (mounted.current) setSidebarPanelOn(enabled)
      setSidebarPanelWanted(enabled)
      await refreshUsage(activeRegion)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setSidebarPanelBusy(false)
    }
  }

  /**
   * The three upstream-identity switches, read the same three-level way the CLI
   * switch is: this card's own successful write, then the settings snapshot.
   *
   * Deliberately NOT reading them from the status document: these are
   * plugin-wide request-shape switches that the Host does not report per region,
   * and inventing a status field for them would create a second source of truth
   * for a value the settings document already owns.
   */
  const usageIdentityValue = (): boolean =>
    usageIdentityOn ?? upstreamSwitchOf(settingsScope?.getSnapshot().value, 'usageIdentity')

  const keepPromptLastValue = (): boolean =>
    keepPromptLastOn ?? upstreamSwitchOf(settingsScope?.getSnapshot().value, 'keepPromptLast')

  const sessionTitleValue = (): { enabled: boolean, model: string } => {
    const committed = sessionTitleOf(settingsScope?.getSnapshot().value)
    return sessionTitleOn === undefined ? committed : { ...committed, enabled: sessionTitleOn }
  }

  /** The custom injected prefixes in effect, used only to REPORT their count. */
  const extraInjectedPrefixes = (): string[] =>
    extraInjectedPrefixesOf(settingsScope?.getSnapshot().value)

  /**
   * The auto-continue block after a channel-gate refusal (see
   * `src/channel-continue.ts`), read the three-level way the other switches are.
   *
   * The cap and the text are read from the committed document rather than
   * mirrored in card state: only `enabled` has a control here, so a local copy of
   * the other two would be a second source of truth for values this card can
   * only READ.
   */
  const channelRejectContinueValue = (): { enabled: boolean, maxConsecutive: number, text: string } => {
    const committed = channelRejectContinueOf(settingsScope?.getSnapshot().value)
    return channelRejectContinueOn === undefined ? committed : { ...committed, enabled: channelRejectContinueOn }
  }

  /**
   * The reasoning-redaction switch (issue #213).
   *
   * Same three-level resolution as every other switch: this card's own verified
   * write, then the committed snapshot. No Host mirror, because this one has no
   * status-document field — it does not change any number the card displays.
   */
  const dropAllThinkingValue = (): boolean => {
    if (dropAllThinkingOn !== undefined) return dropAllThinkingOn
    const raw = settingsScope?.getSnapshot().value as Record<string, unknown> | undefined
    return raw?.['dropAllThinking'] === true
  }

  /**
   * Flip one upstream-identity switch.
   *
   * No `refreshUsage` afterwards, unlike the CLI switch: these change the shape
   * of the NEXT request, not any value the usage document currently reports, so
   * re-reading the usage would only cost an upstream round-trip (the exact
   * stall #131 was about) for a number that cannot have moved.
   */
  const toggleUpstreamSwitch = async (
    field: 'usageIdentity' | 'keepPromptLast' | 'sessionTitle' | 'channelRejectContinue' | 'dropAllThinking',
    enabled: boolean,
  ): Promise<void> => {
    if (settingsScope === undefined) return
    const setBusy = field === 'usageIdentity'
      ? setUsageIdentityBusy
      : field === 'keepPromptLast'
        ? setKeepPromptLastBusy
        : field === 'sessionTitle'
          ? setSessionTitleBusy
          : field === 'channelRejectContinue' ? setChannelRejectContinueBusy : setDropAllThinkingBusy
    const setOwn = field === 'usageIdentity'
      ? setUsageIdentityOn
      : field === 'keepPromptLast'
        ? setKeepPromptLastOn
        : field === 'sessionTitle'
          ? setSessionTitleOn
          : field === 'channelRejectContinue' ? setChannelRejectContinueOn : setDropAllThinkingOn
    setBusy(true)
    try {
      // `sessionTitle` and `channelRejectContinue` are the two switches whose
      // field is an OBJECT: preserve their committed companions instead of
      // writing the transport shape away. Both carry values with no control on
      // this card (the title's target model, the cap and text here), so a bare
      // boolean would erase settings the user can only edit in the config file.
      const value = field === 'sessionTitle'
        ? { ...sessionTitleOf(settingsScope.getSnapshot().value), enabled }
        : field === 'channelRejectContinue'
          ? { ...channelRejectContinueOf(settingsScope.getSnapshot().value), enabled }
          : enabled
      await writeUpstreamSwitch(settingsScope, field, value)
      if (mounted.current) setOwn(enabled)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  /**
   * The pinned model / effort of the CLI route, rendered the same way the
   * switch is: this card's own successful write first, then the Host's answer
   * (the authoritative mirror), then the settings snapshot. `''` is a real
   * value on every level: "nothing is pinned, the CLI runs on its own
   * default".
   */
  const cliBridgeModelValue = (): string => {
    if (cliBridgeModel !== undefined) return cliBridgeModel
    const fromHost = (statusByRegion[activeRegion] as { cliBridgeModel?: unknown } | undefined)?.cliBridgeModel
    if (typeof fromHost === 'string') return fromHost
    return cliBridgeModelOf(settingsScope?.getSnapshot().value)
  }

  const cliBridgeEffortValue = (): string => {
    if (cliBridgeEffort !== undefined) return cliBridgeEffort
    const fromHost = (statusByRegion[activeRegion] as { cliBridgeEffort?: unknown } | undefined)?.cliBridgeEffort
    if (typeof fromHost === 'string') return fromHost
    return cliBridgeEffortOf(settingsScope?.getSnapshot().value)
  }

  /**
   * Pin the model the local CLI runs on (or `''` for "back to the CLI's
   * default").
   *
   * The write is the same two-writer order as the switch; on a refusal the
   * optimistic value is REVERTED so the picker renders the committed value
   * again, and the error surfaces through the card's shared error line.
   */
  const pickCliBridgeModel = async (model: string): Promise<void> => {
    if (settingsScope === undefined) return
    setCliBridgeModelBusy(true)
    try {
      await writeCliBridgeModel(settingsScope, model)
      if (mounted.current) setCliBridgeModel(model)
    } catch (error: unknown) {
      if (mounted.current) {
        setCliBridgeModel(undefined)
        setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
      }
    } finally {
      if (mounted.current) setCliBridgeModelBusy(false)
    }
  }

  /**
   * Pin the reasoning effort the local CLI runs on, same write-and-revert
   * rule as {@link pickCliBridgeModel}.
   */
  const pickCliBridgeEffort = async (effort: string): Promise<void> => {
    if (settingsScope === undefined) return
    setCliBridgeEffortBusy(true)
    try {
      await writeCliBridgeEffort(settingsScope, effort)
      if (mounted.current) setCliBridgeEffort(effort)
    } catch (error: unknown) {
      if (mounted.current) {
        setCliBridgeEffort(undefined)
        setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
      }
    } finally {
      if (mounted.current) setCliBridgeEffortBusy(false)
    }
  }

  /**
   * The credential-region order of the CLI route, rendered with the same
   * write-first rule. Unlike the model and effort pins, `''` is NOT a
   * meaningful committed value here: it means "nothing pinned", and the route
   * then runs on the CLI's own default order — CN first. The picker therefore
   * shows that default instead of an empty answer.
   */
  const cliBridgeRegionOrderValue = (): string => {
    if (cliBridgeRegionOrder !== undefined) return cliBridgeRegionOrder
    const fromHost = (statusByRegion[activeRegion] as { cliBridgeRegionOrder?: unknown } | undefined)?.cliBridgeRegionOrder
    const committed = typeof fromHost === 'string' && fromHost !== ''
      ? fromHost
      : cliBridgeRegionOrderOf(settingsScope?.getSnapshot().value)
    return committed !== '' ? committed : 'cn,global'
  }

  /**
   * Pin the credential-region order the local CLI walks, same
   * write-and-revert rule as {@link pickCliBridgeModel}.
   */
  const pickCliBridgeRegionOrder = async (regionOrder: string): Promise<void> => {
    if (settingsScope === undefined) return
    setCliBridgeRegionOrderBusy(true)
    try {
      await writeCliBridgeRegionOrder(settingsScope, regionOrder)
      if (mounted.current) setCliBridgeRegionOrder(regionOrder)
    } catch (error: unknown) {
      if (mounted.current) {
        setCliBridgeRegionOrder(undefined)
        setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
      }
    } finally {
      if (mounted.current) setCliBridgeRegionOrderBusy(false)
    }
  }

  const toggleImageTool = async (item: WorkBuddyWebRegion, enabled: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingCredits(item)
    try {
      const regions = nextRegionImageToolEnabled(settingsScope.getSnapshot().value, item, enabled) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionImageToolEnabled(
        settingsScope,
        item,
        enabled,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      // Re-read the Host so the box renders the committed value, for the same
      // measured reason as `toggleCredits`: this namespace's browser mirror is
      // written by the Host endpoint and does not come back through `scope.set`.
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingCredits(undefined)
    }
  }

  const toggleVideoTool = async (item: WorkBuddyWebRegion, enabled: boolean): Promise<void> => {
    if (settingsScope === undefined) return
    setTogglingCredits(item)
    try {
      const regions = nextRegionVideoToolEnabled(settingsScope.getSnapshot().value, item, enabled) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionVideoToolEnabled(
        settingsScope,
        item,
        enabled,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      // Re-read the Host so the box renders the committed value, for the same
      // measured reason as toggleImageTool: this namespace's browser mirror is
      // written by the Host endpoint and does not come back through scope.set.
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setTogglingCredits(undefined)
    }
  }

  /**
   * Pin (or clear) one region's video model for one mode tag.
   *
   * `undefined` means "no pin": the picker's default row, which the tool reads as
   * "take the first model of that group". Both directions go through the same
   * landed-checked write as every other settings control, then re-read the Host —
   * a pin that reverted silently would leave the user believing the tool would
   * use a model it never picks.
   */
  const pinVideoModel = async (
    item: WorkBuddyWebRegion,
    tag: string,
    modelId: string | undefined,
  ): Promise<void> => {
    if (settingsScope === undefined) return
    setPinningVideoModel(tag)
    try {
      const regions = nextRegionPreferredVideoModels(settingsScope.getSnapshot().value, item, tag, modelId) as Record<string, unknown>
      const slot = regions[item]
      await writeRegionPreferredVideoModels(
        settingsScope,
        item,
        tag,
        modelId,
        typeof slot === 'object' && slot !== null ? slot as Record<string, unknown> : {},
      )
      await refreshUsage(item)
    } catch (error: unknown) {
      if (mounted.current) setAccountError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setPinningVideoModel(undefined)
    }
  }

  /**
   * Read the active region's media roster. Read-only and free (the same GET the
   * image tool performs), so it is safe to run whenever the capability panel is
   * shown; `refresh` bypasses the Host's 5-minute cache for the explicit
   * button, because a user who just enabled an image model upstream should not
   * have to wait out a TTL to see it.
   *
   * A failure lands in `mediaError` INSIDE the block and nowhere else: it must
   * not touch `statusByRegion`, or one unreachable roster would replace the
   * whole panel with an error screen.
   */
  const loadMediaModels = useCallback(async (
    region: WorkBuddyWebRegion,
    refresh: boolean,
    signal?: AbortSignal,
  ): Promise<void> => {
    try {
      const url = refresh
        ? `${withWorkBuddyRegion(WORKBUDDY_MEDIA_MODELS_PATH, region)}&refresh=1`
        : withWorkBuddyRegion(WORKBUDDY_MEDIA_MODELS_PATH, region)
      const response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const models = readMediaRoster(await response.json().catch(() => undefined))
      if (models === undefined) throw new Error(`HTTP ${response.status}`)
      if (!mounted.current || signal?.aborted === true) return
      setMediaByRegion(prev => ({ ...prev, [region]: models }))
      setMediaError(undefined)
    } catch (error: unknown) {
      if (!mounted.current || signal?.aborted === true) return
      // The message only: `row.mediaModelsError` supplies the sentence.
      setMediaError(error instanceof Error ? error.message : t('row.requestFailed'))
    }
  }, [t])
  /**
   * Regions whose media roster has already been asked for, so showing the
   * capability panel does not re-read the roster on every render — and so a
   * FAILED read is not retried in a loop. The explicit "re-read" button is the
   * only thing that asks twice, because a user who just enabled a model
   * upstream is the one case where a fresh answer is the point.
   */
  const mediaRequested = useRef(new Set<WorkBuddyWebRegion>())

  /**
   * Read the media roster once per region, when the capability panel is opened.
   *
   * Lazy rather than alongside the usage fetch: the roster is only visible in
   * this one panel, and the usage fetch runs for BOTH regions on every open. If
   * the secret store happens to hold a credential for the region the user is not
   * looking at, an eager read would spend a request nobody asked for.
   */
  useEffect(() => {
    if (!open || panel !== 'capabilities' || !hasAccounts) return
    if (mediaRequested.current.has(activeRegion)) return
    mediaRequested.current.add(activeRegion)
    const controller = new AbortController()
    void loadMediaModels(activeRegion, false, controller.signal)
    return () => { controller.abort() }
  }, [open, panel, activeRegion, hasAccounts, loadMediaModels])

  const refreshModels = async (): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(withWorkBuddyRegion(WORKBUDDY_MODELS_REFRESH_PATH, activeRegion), {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      const body = await response.json() as { models?: WorkBuddyWebModel[] }
      if (!response.ok || !Array.isArray(body.models)) throw new Error(`HTTP ${response.status}`)
      const fresh = body.models
      const freshIds = new Set(fresh.map(model => model.id))
      // Re-map the user's CURRENT enabled choices and context budgets onto the
      // fresh catalog by model id, so renames and additions never silently lose
      // them. The IMAGE checkboxes are deliberately OVERWRITTEN with the
      // VENDOR-VERIFIED default: only models documented natively multimodal are
      // pre-checked (`imageDefaultFor`). NOT the platform's `supportsImages`
      // flag — that one is true for nearly the whole roster, including
      // text-only models, so it is not a capability answer. The user can still
      // adjust the boxes before saving; only another refresh re-syncs.
      const stillEnabled = [...activeEnabledIds].filter(id => freshIds.has(id))
      const upstreamImages = fresh
        .filter(model => imageDefaultFor(model))
        .map(model => model.id)
      const stillBudgets: Record<string, number> = {}
      for (const id of freshIds) {
        const budget = activeContextBudgets[id]
        if (typeof budget === 'number') stillBudgets[id] = budget
      }
      // Same shape rule for the default tiers (issue #179): keep the picks whose
      // model survived the refresh, drop the rest so a re-added model starts on
      // its upstream default instead of on a tier the roster no longer has.
      const stillEfforts: Record<string, string> = {}
      for (const id of freshIds) {
        const effort = activeDefaultEfforts[id]
        if (typeof effort === 'string' && effort !== '') stillEfforts[id] = effort
      }
      setDrafts(prev => ({
        ...prev,
        [activeRegion]: {
          models: fresh,
          enabledIds: new Set(stillEnabled),
          imageIds: new Set(upstreamImages),
          // The `off` answers are CARRIED FORWARD, not re-synced from upstream:
          // they exist precisely because the upstream declaration is wrong for
          // these models (issue #34), so re-deriving them from a refresh would
          // undo the user's correction. Only the directory is replaced.
          // The `off` selection is carried forward, not re-synced from upstream:
          // it exists precisely because the upstream declaration is wrong for
          // some models (issue #34), so re-deriving it from a refresh would undo
          // the user's correction. Only the directory is replaced.
          offIds: new Set(activeOffIds),
          contextBudgets: stillBudgets,
          // The effort picks are carried forward for the models that still
          // exist, for the same reason the `off` answers are: they are the
          // user's decisions, and a refresh only replaces the DIRECTORY. A
          // model the new roster dropped keeps no entry, so a re-added model
          // starts on the upstream default rather than on a stale pick.
          defaultThinkingEfforts: stillEfforts,
        },
      }))
    } catch (error: unknown) {
      // Same merge-not-replace rule as the usage fetch above: a failed model
      // refresh must not wipe the pool, credits and account list.
      if (mounted.current) setStatusByRegion(prev => ({
        ...prev,
        [activeRegion]: {
          ...prev[activeRegion],
          status: 'error',
          message: error instanceof Error ? error.message : t('row.requestFailed'),
        } as WorkBuddyWebUsage,
      }))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  void settingsRevision
  // The card renders the last-refreshed directory (`status.models`), never a
  // stale saved snapshot. Enabled flags come from the user's stored selection,
  // re-mapped onto the current catalog by model id.
  const draft = drafts[activeRegion]
  const visibleModels = draft?.models ?? (status.status === 'signed-in' ? status.models : [])
  /**
   * The LIVE load levels, keyed by model id.
   *
   * Read off the Host's answer rather than from the model list: the list is the
   * SAVED roster the user edits, and a saved roster has no load level in it
   * (load is a fact about this minute, not a setting — `src/busy.ts`). A model
   * the probe did not answer for simply has no entry, and draws nothing.
   */
  const busyLevels = status.status === 'signed-in' ? status.busyLevels ?? {} : {}
  const savedEnabledIds = status.status === 'signed-in' ? new Set(status.enabledModelIds) : new Set<string>()
  const activeEnabledIds = draft?.enabledIds ?? savedEnabledIds
  const savedImageIds = status.status === 'signed-in' ? new Set(status.imageModelIds) : new Set<string>()
  const activeImageIds = draft?.imageIds ?? savedImageIds
  // The `off` level (issue #34): `offModelIds` is the saved set of models that
  // offer it; a row not in the set has it withdrawn.
  const savedOffIds = status.status === 'signed-in' ? new Set(status.offModelIds) : new Set<string>()
  const activeOffIds = draft?.offIds ?? savedOffIds
  const configured = settingsScope?.getSnapshot().value
  // Context budgets come from the Host's own answer, NOT from the browser
  // settings mirror. On the affected 0.1.7 deployment that mirror never picks
  // up this plugin's writes (a save made through the Host endpoint leaves it
  // stale), so reading it here made a successful save look like it reverted —
  // the "save did nothing" report.
  const savedContextBudgets = status.status === 'signed-in' ? (status.contextBudgets ?? {}) : {}
  // The default thinking tier per model (issue #179), read from the Host for
  // exactly the reason the budgets above are: this endpoint's own writes never
  // refresh the browser mirror, so a saved pick would render as reverted.
  const savedDefaultEfforts = status.status === 'signed-in' ? (status.defaultThinkingEfforts ?? {}) : {}
  void configured
  void settingsRevision
  const activeContextBudgets = draft?.contextBudgets ?? savedContextBudgets
  const activeDefaultEfforts = draft?.defaultThinkingEfforts ?? savedDefaultEfforts
  const dirty = draft !== undefined
  /**
   * Allow edits when a settings scope is bound. The scope's writable flag is
   * not used because it stayed false on the affected DSH deployment. writeField
   * tries the Host endpoint first, then the scope fallback. A bound scope enables
   * the controls; it does not guarantee that either write path will succeed.
   */
  const canWrite = settingsScope !== undefined

  const editDraft = (edit: (current: WorkBuddyDraft) => WorkBuddyDraft): void => {
    setDrafts(prev => ({
      ...prev,
      [activeRegion]: edit(prev[activeRegion] ?? {
        models: [...visibleModels],
        enabledIds: new Set(activeEnabledIds),
        imageIds: new Set(activeImageIds),
        offIds: new Set(activeOffIds),
        contextBudgets: { ...activeContextBudgets },
        defaultThinkingEfforts: { ...activeDefaultEfforts },
      }),
    }))
  }

  const toggleModel = (modelId: string): void => {
    editDraft(current => {
      const next = new Set(current.enabledIds)
      if (!next.delete(modelId)) next.add(modelId)
      return { ...current, enabledIds: next }
    })
  }

  const toggleImage = (modelId: string): void => {
    editDraft(current => {
      const next = new Set(current.imageIds)
      if (!next.delete(modelId)) next.add(modelId)
      return { ...current, imageIds: next }
    })
  }

  /**
   * Flip one row's `off` answer (issue #34).
   *
   * Writes an EXPLICIT answer in both directions, so the built-in rule is only
   * consulted while the user has no opinion. That is also why there is no
   * "reset" control: once an answer matches the rule, the two are
   * indistinguishable in effect, and the tooltip already names the override.
   */
  // Models on the reviewed refusal table, plus the ones whose `off` tier this
  // process actually saw refused (issue #83). The checkbox stays visible but
  // disabled: hiding it would make a saved tick invisible, and the user would
  // have no way to discover why compaction kept failing.
  const offBlocked = (model: WorkBuddyWebModel): boolean =>
    model.reasoning?.offRefused === true || model.reasoning?.refusesOff === true

  const toggleOff = (modelId: string): void => {
    editDraft(current => {
      const next = new Set(current.offIds)
      if (!next.delete(modelId)) next.add(modelId)
      return { ...current, offIds: next }
    })
  }

  /**
   * Set one model's DSH context budget, or CLEAR it.
   *
   * `undefined` means "no cap — use the model's native window", and it is
   * written as the ABSENCE of the key rather than as a stored number equal to
   * the window. That distinction is the whole of issue #215: a stored
   * `{ id: 1000000 }` and an absent entry both resolve to 1,000,000 today, but
   * only the absent one keeps following the model if the upstream ever raises
   * its window. It is also what makes the "native" radio mean one thing —
   * "no budget" — instead of sometimes meaning "a budget that happens to equal
   * the window".
   *
   * The key is DELETED rather than assigned `undefined`: an explicit
   * `undefined` survives `structuredClone` and the settings write path's strict
   * JSON codec rejects the whole save (see `setDefaultThinkingEffort`, which
   * follows the same rule for the same reason).
   */
  const setContextBudget = (modelId: string, budget: number | undefined): void => {
    editDraft(current => {
      const next = { ...current.contextBudgets }
      if (budget === undefined) delete next[modelId]
      else next[modelId] = budget
      return { ...current, contextBudgets: next }
    })
  }

  /**
   * Choose one model's default thinking tier (issue #179).
   *
   * `''` — the picker's first option — means "follow the upstream default", and
   * is written as the ABSENCE of the key rather than as an empty string. The
   * stored map is the whole answer the runtime reads, so an `''` entry would
   * persist a tier nothing declares and then silently fall back; deleting the
   * key keeps "no opinion" representable, which is what lets a future upstream
   * change to `defaultEffort` take effect for this model.
   */
  const setDefaultThinkingEffort = (modelId: string, effort: string): void => {
    editDraft(current => {
      const next = { ...current.defaultThinkingEfforts }
      if (effort === '') delete next[modelId]
      else next[modelId] = effort
      return { ...current, defaultThinkingEfforts: next }
    })
  }

  const discardModels = (): void => {
    setDrafts(prev => {
      const next = { ...prev }
      delete next[activeRegion]
      return next
    })
  }

  /**
   * Probe ONE model (the route refuses more than one — see `web-status.ts`,
   * where the cap is the gate that keeps a whole-roster sweep from becoming a
   * single unaccounted spend). The HOST owns the request: the browser half sends
   * only a model id and gets an outcome back, because the credential must never
   * cross to the page.
   *
   * The plural name is historical: this used to post a whole list in one request
   * before 3.0.0 removed the batch button. It is kept because callers that
   * already hold a list (the two sweep buttons below) can still express "test
   * these" without a second code path — it just sends them one at a time.
   *
   * Probing is deliberately independent of `dirty`: a test answers "does this
   * model work right now", which is true of the SAVED selection and the draft
   * alike, and blocking it on unsaved edits would make the button dead exactly
   * when the user is deciding what to keep.
   */
  const probeModels = async (modelIds: readonly string[]): Promise<void> => {
    if (modelIds.length === 0) return
    setProbeError(undefined)
    setProbing(previous => {
      const next = { ...previous }
      for (const id of modelIds) next[id] = true
      return next
    })
    try {
      const response = await fetch(withWorkBuddyRegion(WORKBUDDY_PROBE_PATH, activeRegion), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ modelIds }),
      })
      const body = await response.json().catch(() => undefined) as
        | { results?: WorkBuddyWebProbeResult[]; error?: string }
        | undefined
      if (!response.ok || !Array.isArray(body?.results)) {
        throw new Error(body?.error ?? `HTTP ${String(response.status)}`)
      }
      if (!mounted.current) return
      const landedResults = body.results as WorkBuddyWebProbeResult[]
      // Mirror into the ref FIRST: the sweep loop reads verdicts from it, and a
      // state update is not observable until React re-renders.
      probesRef.current = { ...probesRef.current }
      for (const result of landedResults) probesRef.current[result.modelId] = result
      setProbes(previous => {
        const regionResults = { ...(previous[activeRegion] ?? {}) }
        for (const result of landedResults) {
          regionResults[result.modelId] = result
        }
        return { ...previous, [activeRegion]: regionResults }
      })
    } catch (error: unknown) {
      if (mounted.current) setProbeError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) {
        // Clear the in-flight markers for exactly the rows this run touched, so
        // a concurrent single-row test on another model keeps its spinner.
        setProbing(previous => {
          const next = { ...previous }
          for (const id of modelIds) delete next[id]
          return next
        })
      }
    }
  }

  /**
   * Run an availability sweep as sequential single-model requests.
   * Each result is displayed as it arrives. The route limits each request to one
   * model; this does not limit the total requests a client can issue.
   * The hint discloses that probes may cost credits. Actual cost depends on model,
   * request size and upstream billing. Stop on credential-rejected as a local
   * policy to avoid repeated auth failures, without claiming every other model
   * would necessarily return the same result. The summary records completed rows.
   */
  const sweepModels = async (modelIds: readonly string[]): Promise<void> => {
    if (modelIds.length === 0) return
    setProbeError(undefined)
    setSweepSummary(undefined)
    setSweeping({ done: 0, total: modelIds.length })
    let available = 0
    let measured = 0
    try {
      for (const [index, modelId] of modelIds.entries()) {
        if (!mounted.current) return
        await probeModels([modelId])
        const result = probesRef.current[modelId]
        measured += 1
        if (result?.outcome === 'ok') available += 1
        if (result?.outcome === 'credential-rejected') {
          // Stop after a credential rejection to avoid repeated auth attempts; the summary below
          // says "N of M measured" so the shortfall is visible, not silent.
          if (mounted.current) setProbeError(t('row.modelsTestAuth'))
          break
        }
        if (mounted.current) setSweeping({ done: index + 1, total: modelIds.length })
      }
      if (mounted.current) setSweepSummary(t('row.modelsTestDone', { available, total: measured }))
    } finally {
      if (mounted.current) setSweeping(undefined)
    }
  }

  /** Sweep the models this region has ENABLED (the current draft's selection). */
  const sweepEnabledModels = (): void => {
    void sweepModels(visibleModels.filter(model => activeEnabledIds.has(model.id)).map(model => model.id))
  }

  /**
   * Measure speed sequentially, using one model id per route request.
   * Continue after a model fails so later models can still be measured. A failure
   * can concern transport or credentials as well as the model. This differs from
   * the availability sweep's local stop policy for credential-rejected outcomes.
   */
  const measureTpsFor = async (modelIds: readonly string[]): Promise<void> => {
    if (modelIds.length === 0) return
    setTpsProbing(previous => {
      const next = { ...previous }
      for (const id of modelIds) next[id] = true
      return next
    })
    try {
      for (const [index, modelId] of modelIds.entries()) {
        if (!mounted.current) return
        try {
          const response = await fetch(withWorkBuddyRegion(WORKBUDDY_TPS_PATH, activeRegion), {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ modelIds: [modelId] }),
          })
          const body = await response.json().catch(() => undefined) as
            | { results?: WorkBuddyWebTpsResult[]; error?: string }
            | undefined
          if (!response.ok || !Array.isArray(body?.results)) {
            throw new Error(body?.error ?? `HTTP ${String(response.status)}`)
          }
          if (!mounted.current) return
          const landed = body.results[0]
          if (landed !== undefined) {
            setTpsResults(previous => ({ ...previous, [landed.modelId]: landed }))
            setTpsMeasuredAt(previous => ({ ...previous, [landed.modelId]: Date.now() }))
          }
        } catch (error: unknown) {
          if (!mounted.current) return
          setProbeError(error instanceof Error ? error.message : t('row.requestFailed'))
        } finally {
          if (mounted.current) {
            setTpsProbing(previous => {
              const next = { ...previous }
              delete next[modelId]
              return next
            })
          }
        }
        if (mounted.current) setTpsSweeping({ done: index + 1, total: modelIds.length })
      }
    } finally {
      if (mounted.current) setTpsSweeping(undefined)
    }
  }

  /**
   * Whether ANY speed run is in flight, for the sweep button's disabled state.
   *
   * NOT `tpsProbing !== undefined`. `tpsProbing` is a record that is ALWAYS an
   * object, so that comparison is permanently true and the button was
   * permanently disabled — the defect this corrects. The other two sweep buttons
   * compare `sweeping !== undefined` because `sweeping` really is an
   * `{done,total} | undefined` pair; this map has no such absent state, so the
   * emptiness of its keys is what "busy" means.
   */
  const tpsBusy = Object.keys(tpsProbing).length > 0

  /**
   * Sweep speed for the models this region has ENABLED.
   *
   * Enabled-only rather than the whole catalog: a speed run is three real
   * requests, so covering a 20-model roster would cost 60 requests to learn
   * something about 18 models the user does not use.
   */
  const sweepTpsEnabledModels = (): void => {
    void measureTpsFor(visibleModels.filter(model => activeEnabledIds.has(model.id)).map(model => model.id))
  }

  const saveModels = async (): Promise<void> => {
    if (settingsScope === undefined) return
    if (status.status !== 'signed-in') return
    setSaving(true)
    setSaveError(undefined)
    try {
      // Save this region's raw directory plus the pure selection. The Host
      // derives the runtime catalog from these on save/restart, so re-opening
      // the card re-reads WorkBuddy's current catalog instead of a stale
      // snapshot. The CN app and the international app expose different
      // rosters, so the write targets the slot keyed by the signed-in account's
      // region: the other region's picks are never touched.
      // toPersistedWorkBuddyModel strips the card-only fields BY KEY: explicit
      // `undefined` values are rejected by the settings write's strict JSON
      // codec, which used to fail the whole save silently.
      //
      // Verified write, because a save DISCARDS the draft: if the write did not
      // persist, throwing the user's edits away while reporting success would
      // be unrecoverable — the draft is the only copy. `writeRegionModels`
      // MERGES onto the existing region slot, so this save cannot delete the
      // pool preferences living in that same slot; `enabled` is still passed
      // explicitly because it is the committed value the card renders, and the
      // merge keeps whatever the slot already had for any field left absent.
      await writeRegionModels(settingsScope, status.region, {
        enabled: activeRegionOn,
        lastCatalog: visibleModels.map(toPersistedWorkBuddyModel),
        enabledModelIds: [...activeEnabledIds],
        imageModelIds: [...activeImageIds],
        // #168: the user has now EDITED the boxes, so this array is the whole
        // answer. Without this, an explicit untick of a verified-multimodal
        // model would be re-ticked by the Host's seed on the next read — undoing
        // a correction the user just made.
        imageSelectionExplicit: true,
        offModelIds: [...activeOffIds],
        contextBudgets: activeContextBudgets,
        // Issue #179: the whole map, sent complete. The slot merge is two levels
        // deep, so a nested dict is REPLACED rather than merged — sending a
        // partial one would delete the picks for every model it omits, and
        // "follow the upstream default" is expressed by absence, so an omitted
        // model must mean exactly that.
        defaultThinkingEfforts: activeDefaultEfforts,
      })
      // Loading stops with the WRITE. Refreshing usage awaits the upstream
      // billing route, which can wait on a 30-second per-account timeout, so
      // including it in the save's loading state told a user their edits were
      // still saving long after the verified write had landed (issue #131).
      // The refresh may still fail, but that is a display freshness problem:
      // the saved draft stays committed and a later successful poll can update the figures.
      if (mounted.current) setSaving(false)
      discardModels()
      void refreshUsage(activeRegion)
      return
    } catch (error: unknown) {
      // Drafts stay dirty on failure, so the button remains pressable for a
      // retry; the reason is shown instead of a silent unhandled rejection.
      // A contention refusal gets the remedy appended — the raw message names
      // only a temp file (see `isFileContentionWriteError`).
      if (mounted.current) {
        const reason = error instanceof Error ? error.message : t('row.requestFailed')
        setSaveError(isFileContentionWriteError(error) ? `${reason}${t('row.saveContentionHint')}` : reason)
      }
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  return { pollIntervalValue, changePollInterval, pollIntervalBusy, dropAllThinkingValue, dropAllThinkingBusy, newModelsShownOn, toggleNewModels, togglingNewModels, status, activeRegion, refreshUsage, activeRegionOn, creditPositionOn, togglingCredits, canWrite, saving, poolBusy, changeCreditPosition, imageToolOn, toggleImageTool, videoToolOn, toggleVideoTool, mediaByRegion, preferredVideoModelOf, pinningVideoModel, pinVideoModel, mediaBusy, setMediaBusy, loadMediaModels, mounted, mediaError, cliBridgeSwitchedOn, cliBridgeBusy, toggleCliBridge, sidebarPanelSwitchedOn, sidebarPanelBusy, toggleSidebarPanel, cliBridgeModelValue, visibleModels, cliBridgeEffortValue, cliBridgeRegionOrderValue, cliBridgeModelBusy, cliBridgeEffortBusy, cliBridgeRegionOrderBusy, pickCliBridgeModel, pickCliBridgeEffort, pickCliBridgeRegionOrder, usageIdentityValue, usageIdentityBusy, setUsageIdentityOn, keepPromptLastValue, keepPromptLastBusy, setKeepPromptLastOn, sessionTitleValue, sessionTitleBusy, setSessionTitleOn, toggleUpstreamSwitch, extraInjectedPrefixes, channelRejectContinueValue, channelRejectContinueBusy, creditsShownOn, toggleCredits, pageSurface, statusByRegion, regionOn, setActiveRegion, setAccountError, togglingRegion, toggleRegion, signedIn, panel, setPanel, accountError, switchingAccount, switchAccount, rescanAccounts, busy, setPoolBusy, deviceSettings, changeDeviceMode, saveDeviceProfile, dirty, activeEnabledIds, refreshModels, sweeping, sweepEnabledModels, tpsSweeping, tpsBusy, sweepTpsEnabledModels, probeError, sweepSummary, toggleModel, busyLevels, activeImageIds, toggleImage, offBlocked, activeOffIds, toggleOff, activeContextBudgets, setContextBudget, probing, probeModels, tpsProbing, measureTpsFor, activeDefaultEfforts, setDefaultThinkingEffort, probes, tpsResults, tpsMeasuredAt, saveError, discardModels, saveModels, loading, statusRetries, open, setCardOpen, cardOpen }
}
