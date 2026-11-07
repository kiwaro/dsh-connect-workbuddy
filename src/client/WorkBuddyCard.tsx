import { useState } from 'react'
import { resolveCnGateway } from '../cn-gateway.ts'
import { regionCnBaseOf, nextRegionCnBase } from '../status-paths.ts'
import { writeRegionCnBase } from './account-selection.ts'
import { updateStickyTabs } from './series-layout.ts'
import { createCapabilityPreferences } from './workbuddy-capability-preferences.tsx'
import { useWorkBuddyCardState } from './use-workbuddy-card-state.tsx'
import { type WorkBuddyCardInjected, type WorkBuddyCardProps, imageCheckboxHint, promoChip, effectiveRate, SearchedPaths, formatNumber, formatDate, formatCapacity, dotStyle, tpsResultView, probeResultView } from './workbuddy-card-view.tsx'
export { tpsResultView } from './workbuddy-card-view.tsx'
export type { WorkBuddyCardProps, WorkBuddyCardInjected } from './workbuddy-card-view.tsx'
/**
 * WorkBuddy 积分和模型设置卡片。
 *
 * 参考：dingminhua/dsh-connect-trae（MIT，Copyright (c) 2026 LaoDing）的
 * 折叠卡片、账号状态与选择、积分区、模型草稿保存、轮询及清理流程。
 * 折叠外壳和 settings.plugin.item 注册方式参考
 * dingminhua/dsh-subagent-default-model（MIT）。
 *
 * 本插件的主要调整：
 * 1. 使用 CSS 绘制折叠箭头，避免依赖不同 DSH 版本的图标名称。
 * 2. 按套餐名聚合积分，避免同名套餐过多时重复列出进度条。
 * 3. 展示 WorkBuddy 模型的积分倍率、图片输入能力和推理档位。
 * 4. 国内区与国际区分别保存账号、目录及草稿，切换区域保留未保存的修改。
 *
 * @module dsh-connect-workbuddy/client/WorkBuddyCard
 */
import { Component } from 'react'
import { createElement as h } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { WORKBUDDY_DEVICE_PROFILE_PATH, WORKBUDDY_DEVICE_SDK_PATH, WORKBUDDY_GITHUB_URL, WORKBUDDY_REGIONS } from '../status-paths.ts'
import type { WorkBuddyWebSearchPath } from '../status-paths.ts'

import { AccountPool } from './AccountPool.tsx'
import { DeviceSdkPanel } from './DeviceSdkPanel.tsx'

import { OAuthSignIn } from './OAuthSignIn.tsx'
import { AccountTransfer } from './AccountTransfer.tsx'
// Issue #215: the budget tier the radios light up must be the tier the backend
// derives, so it comes from the backend's own function rather than a second
// copy of the rule in the browser.
import { effectiveContextBudget } from '../catalog.ts'

import { defaultEffortFor, selectableEfforts } from '../default-effort.ts'

import { busyIcon } from './busy-icon.tsx'
import { uiLanguage } from './promo-badge.ts'
import { inlineProbeReason } from './probe-reason.ts'

import { PluginIcon } from './plugin-icon.tsx'
import { WORKBUDDY_CARD_CSS } from './styles.ts'
import { signedOutNotice, signedOutText } from './searched-paths.ts'
import type { Translate } from './searched-paths.ts'

/** Inject or refresh the shared card CSS for the current client bundle. */
if (typeof document !== 'undefined') {
  const cssId = 'dsh-connect-workbuddy/client.css'
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${cssId}"]`)
  if (existing !== null) {
    existing.textContent = WORKBUDDY_CARD_CSS
  } else {
    const styleTag = document.createElement('style')
    styleTag.dataset.plugin = 'dsh-connect-workbuddy'
    styleTag.dataset.pluginCss = cssId
    styleTag.textContent = WORKBUDDY_CARD_CSS
    document.head.appendChild(styleTag)
  }
}

/**
 * The configuration area's own crash face (issue #139).
 *
 * WHY THIS EXISTS. The host wraps every slot entry in its own
 * `SlotErrorBoundary`, and that boundary's failure face is an EMPTY
 * `<div data-slot-error>` (`dsh-client-ui-renderer`). So a render-time throw
 * anywhere inside this card does not look like an error — it looks like the
 * plugin never installed: the header stays, the whole configuration area
 * vanishes, and the only trace is one `console.error` line. That is precisely
 * how issue #139 was reported ("配置区整块消失"), and it is why the reporter
 * could not tell a real crash from a missing card.
 *
 * WHAT IT BUYS. The same catch, with a face that says what happened: the
 * message goes on screen, so a report can quote it without opening devtools.
 * It does NOT hide the error — `componentDidCatch` still logs it, so the
 * console keeps the full stack the host would have printed anyway.
 *
 * SCOPE: the BODY only, never the header. A user whose configuration crashed
 * must still be able to collapse and re-expand the card, and the header is
 * pure static markup — it cannot be the thing that threw.
 *
 * LIMITS, stated so nobody expects more than React gives: a boundary catches
 * errors thrown during RENDER, in lifecycle methods, and in constructors. It
 * does NOT catch throws from event handlers, timers, or promise callbacks —
 * so an async failure still surfaces the way it did before (inline error text
 * or the console), which is the correct behaviour for those paths.
 */
class CardBodyBoundary extends Component<
  { readonly t: Translate; readonly children: ReactNode },
  { readonly failed: boolean; readonly message: string | undefined }
> {
  state: { readonly failed: boolean; readonly message: string | undefined } = {
    failed: false,
    message: undefined,
  }

  static getDerivedStateFromError(error: unknown): { failed: boolean; message: string | undefined } {
    // A `SlotAssemblyError` means the SHELL is miswired (a missing provider),
    // and the host's own boundary deliberately rethrows it rather than
    // degrading. Swallowing it here would turn a loud wiring fault into a
    // quiet "configuration failed", so it is rethrown on purpose.
    if (error instanceof Error && error.name === 'SlotAssemblyError') throw error
    return { failed: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    try {
      console.error('[dsh-connect-workbuddy] configuration area failed to render:', error, info.componentStack)
    } catch { /* a host without console must still draw the face */ }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="dsm-workbuddy-usage">
        <p className="dsm-workbuddy-usage-error">
          {this.props.t('row.cardCrashed')}
        </p>
        {this.state.message === undefined
          ? null
          : <p className="dsm-workbuddy-usage-error dsm-workbuddy-diag-mono">{this.state.message}</p>}
        <p className="dsm-workbuddy-diag-hint">{this.props.t('row.cardCrashedHint')}</p>
      </div>
    )
  }
}

/**
 * Render WorkBuddy sign-in state, credits, and model selection as one card.
 *
 * The body is wrapped in {@link CardBodyBoundary} INSIDE the render, not here:
 * the header must keep working when the body throws (see that class).
 */
export function WorkBuddyCard(props: WorkBuddyCardProps) {
  // The boundary needs a translation function to draw its face; the body
  // already refuses to render without one, so this throws the same error the
  // body would have thrown — just before the boundary could swallow it.
  if (props.t === undefined) throw new Error('WorkBuddy plugin card requires its translation function')
  return h(WorkBuddyCardBody, props)
}

function WorkBuddyCardBody(props: WorkBuddyCardProps) {
  const { t, settingsScope, view, surface, backToConversation } = props
  if (t === undefined) throw new Error('WorkBuddy plugin card requires its translation function')
  const { newModelsShownOn, toggleNewModels, togglingNewModels, status, activeRegion, refreshUsage, activeRegionOn, creditPositionOn, togglingCredits, canWrite, saving, poolBusy, changeCreditPosition, imageToolOn, toggleImageTool, videoToolOn, toggleVideoTool, mediaByRegion, preferredVideoModelOf, pinningVideoModel, pinVideoModel, mediaBusy, setMediaBusy, loadMediaModels, mounted, mediaError, cliBridgeSwitchedOn, cliBridgeBusy, toggleCliBridge, sidebarPanelSwitchedOn, sidebarPanelBusy, toggleSidebarPanel, cliBridgeModelValue, visibleModels, cliBridgeEffortValue, cliBridgeRegionOrderValue, cliBridgeModelBusy, cliBridgeEffortBusy, cliBridgeRegionOrderBusy, pickCliBridgeModel, pickCliBridgeEffort, pickCliBridgeRegionOrder, usageIdentityValue, usageIdentityBusy, setUsageIdentityOn, keepPromptLastValue, keepPromptLastBusy, setKeepPromptLastOn, sessionTitleValue, sessionTitleBusy, setSessionTitleOn, toggleUpstreamSwitch, extraInjectedPrefixes, channelRejectContinueValue, channelRejectContinueBusy, creditsShownOn, toggleCredits, pageSurface, statusByRegion, regionOn, setActiveRegion, setAccountError, togglingRegion, toggleRegion, signedIn, panel, setPanel, accountError, switchingAccount, switchAccount, rescanAccounts, busy, setPoolBusy, deviceSettings, changeDeviceMode, saveDeviceProfile, dirty, activeEnabledIds, refreshModels, sweeping, sweepEnabledModels, sweepAllModels, tpsSweeping, tpsBusy, sweepTpsEnabledModels, probeError, sweepSummary, toggleModel, busyLevels, activeImageIds, toggleImage, offBlocked, activeOffIds, toggleOff, activeContextBudgets, setContextBudget, probing, probeModels, tpsProbing, measureTpsFor, activeDefaultEfforts, setDefaultThinkingEffort, probes, tpsResults, tpsMeasuredAt, saveError, discardModels, saveModels, loading, statusRetries, open, setCardOpen, cardOpen } = useWorkBuddyCardState(props)

  const [cnBaseDraft, setCnBaseDraft] = useState<string | undefined>(undefined)
  const [cnBaseSaving, setCnBaseSaving] = useState(false)
  const [cnBaseError, setCnBaseError] = useState<string | undefined>(undefined)
  const [cnBaseNotice, setCnBaseNotice] = useState<string | undefined>(undefined)
  const settingsSurface = surface === 'settings'
  const cnBaseSaved = regionCnBaseOf(settingsScope?.getSnapshot().value, 'cn')
  const cnBaseDraftValue = cnBaseDraft ?? cnBaseSaved
  const cnBaseDirty = cnBaseDraft !== undefined && cnBaseDraft.trim() !== cnBaseSaved.trim()
  const cnBasePreview = resolveCnGateway(cnBaseDraftValue)

  const saveCnBase = async (): Promise<void> => {
    if (settingsScope === undefined || cnBaseSaving) return
    const resolved = cnBasePreview
    if (!resolved.ok) {
      // Worded per rule, in the block itself: a single "invalid" would leave the
      // user guessing which of the three checks their value failed.
      setCnBaseError(
        resolved.reason === 'malformed'
          ? t('row.cnBaseInvalidMalformed')
          : resolved.reason === 'insecure' ? t('row.cnBaseInvalidInsecure') : t('row.cnBaseInvalidHost'),
      )
      return
    }
    setCnBaseSaving(true)
    setCnBaseError(undefined)
    try {
      const next = resolved.overridden ? resolved.base : ''
      await writeRegionCnBase(
        settingsScope,
        'cn',
        next,
        nextRegionCnBase(settingsScope.getSnapshot().value, 'cn', next),
      )
      if (mounted.current) {
        setCnBaseDraft(undefined)
        setCnBaseNotice(t(next === '' ? 'row.cnBaseCleared' : 'row.cnBaseSaved'))
      }
      await refreshUsage('cn')
    } catch (error: unknown) {
      if (mounted.current) setCnBaseError(error instanceof Error ? error.message : t('row.requestFailed'))
    } finally {
      if (mounted.current) setCnBaseSaving(false)
    }
  }

  const cnBasePreference = activeRegion !== 'cn'
    ? null
    : (
      <div className="dsm-workbuddy-cnbase" title={t('row.cnBaseHint')}>
        <label className="dsm-workbuddy-cnbase-row">
          <span className="dsm-workbuddy-pref-copy">
            <span className="dsm-workbuddy-pref-label">{t('row.cnBaseLabel')}</span>
            <span className="dsm-workbuddy-pref-hint">{t('row.cnBaseHint')}</span>
          </span>
          <input
            type="url"
            className="dsm-workbuddy-cnbase-input"
            value={cnBaseDraftValue}
            placeholder={t('row.cnBasePlaceholder')}
            disabled={!canWrite || saving || cnBaseSaving}
            spellCheck={false}
            autoComplete="off"
            onChange={(event: { target: { value: string } }) => {
              setCnBaseDraft(event.target.value)
              setCnBaseError(undefined)
              setCnBaseNotice(undefined)
            }}
          />
        </label>
        {cnBaseError !== undefined
          ? <p className="dsm-workbuddy-cnbase-error" role="alert">{cnBaseError}</p>
          : null}
        {cnBaseError === undefined && cnBaseNotice !== undefined
          ? <p className="dsm-workbuddy-cnbase-notice" role="status">{cnBaseNotice}</p>
          : null}
        {/* The Save pair appears only while there is something to save: a
            permanently visible pair of buttons under a field nobody edited turns
            a settings row into a form, and the section's own note says the other
            controls here commit on the click. */}
        {cnBaseDirty
          ? <div className="dsm-workbuddy-cnbase-actions">
              <button
                type="button"
                className="dsm-btn dsm-btn-outline"
                disabled={cnBaseSaving}
                onClick={() => { setCnBaseDraft(undefined); setCnBaseError(undefined); setCnBaseNotice(undefined) }}
              >
                {t('row.poolDiscard')}
              </button>
              <button
                type="button"
                className="dsm-btn dsm-btn-primary"
                disabled={cnBaseSaving}
                onClick={() => { void saveCnBase() }}
              >
                {cnBaseSaving ? t('row.poolSaving') : t('row.poolSaved')}
              </button>
            </div>
          : null}
      </div>
    )

  const title = t('row.title')
  /**
   * Show a name, or a placeholder when the desktop app recorded none.
   *
   * The Host sends `''` rather than an identifier, because a `uin`/`uid` shown
   * where a name belongs reads as "the plugin does not know who this is" — the
   * placeholder says the honest thing instead.
   */
  const nameOf = (value: string): string => value === '' ? t('row.accountUnnamed') : value
  /** The saved choice no longer matches a local sign-in (tokens are fine). */
  const selectionLost = status.status === 'signed-out' && status.selectionLost === true
  /**
   * The vault directory could not be READ at all (issue #199).
   *
   * A permissions failure masquerades as "the account is gone": `syncVault`
   * skips the vault when its readdir fails, so the saved OAuth-only account
   * drops out of the list while the desktop scan's accounts remain. Without
   * this the card tells the user to re-sign-in, which cannot repair a DACL.
   * The raw error is shown because it names the actual failing operation.
   */
  const vaultUnreadable = status.status === 'signed-out' ? status.vaultUnreadable : undefined
  /**
   * The paths the Host probed, on the branch where nothing was found at all.
   * Absent on the legacy card payload (an older Host), so it defaults empty
   * rather than rendering an empty diagnostic.
   */
  const searched: readonly WorkBuddyWebSearchPath[]
    = status.status === 'signed-out' ? status.searched ?? [] : []
  /**
   * What the signed-out paragraph says, and whether to append the Host's raw
   * error. The rule lives in `./searched-paths.ts` because it is the fix for a
   * real duplication: `resolve()`'s message already enumerated every path, and
   * the list below enumerates them again with better reasons.
   */
  const notice = signedOutNotice({
    selectionLost,
    message: status.status === 'signed-out' ? status.message : undefined,
    searched,
  })
  /**
   * Whether this region runs a saved choice, per the Host. `undefined` only on
   * the error branch, which renders no picker and therefore no state line.
   */
  const selectionExplicit = status.status === 'error' ? undefined : status.selectionExplicit

  /**
   * Account-adding and account-migration controls, defined ONCE and rendered
   * in both sign-in states: inside the pool settings block when an account
   * exists, and in the signed-out branch when it does not (the pool section is
   * not rendered there at all). Two JSX copies would be free to drift, and the
   * two states are the same feature — a user who learns these controls in one
   * must find them in the same order in the other.
   */
  const accountTools = (
    <>
      <OAuthSignIn
        t={t}
        region={activeRegion}
        // A finished sign-in stores a credential the Host's snapshot predates;
        // re-read so the new account appears while the veil is still up.
        onAdded={() => refreshUsage(activeRegion)}
      />
      <AccountTransfer
        t={t}
        region={activeRegion}
        // An import writes vault entries the Host already had no snapshot of;
        // re-read so the new accounts join the table while the veil is still
        // up, instead of on some later poll the region may not even run.
        onChanged={() => refreshUsage(activeRegion)}
        // The error branch reports no accounts, and the transfer section is
        // not rendered there — passing an empty list keeps the type honest
        // without inventing a fallback that could only ever be wrong.
        accounts={status.status === 'error'
          ? []
          : status.accounts.map(account => ({ id: account.id, accountName: account.accountName }))}
      />
    </>
  )

  /**
   * WHERE the readout sits — a two-way choice, active tab's region only
   * (issue #62).
   *
   * It sits directly under the show/hide switch because the two answer one
   * question together ("show it, and where"), and because a user only reaches
   * for this when the default seat is unavailable — typically after installing
   * another plugin that occupies the composer row. Rendered as a `<select>`
   * rather than a pair of radios so it stays one compact row.
   *
   * LABEL LEFT, CONTROL RIGHT — the reverse of the first draft, which put the
   * select first. Under an always-visible caption the label is what the eye
   * scans for ("显示位置"), so it leads and the value follows; leading with the
   * control made it read as a second checkbox whose box happened to be a
   * dropdown. It also matches the reference settings screen, where the option
   * name sits left of its picker.
   *
   * Disabled with the region, exactly like the switch: a region that is off has
   * no readout to place.
   */
  const creditPositionPicker = (
    <select
      className="dsm-workbuddy-credit-position"
      value={activeRegionOn ? creditPositionOn(activeRegion) : 'composer'}
      disabled={!activeRegionOn || togglingCredits === activeRegion || !canWrite || saving || poolBusy}
      aria-label={t('row.creditPositionAria', { region: activeRegion === 'cn' ? t('row.tabCn') : t('row.tabGlobal') })}
      onChange={(event: { currentTarget: { value: string } }) => {
        void changeCreditPosition(activeRegion, event.currentTarget.value === 'stats' ? 'stats' : 'composer')
      }}
    >
      <option value="composer">{t('row.creditPositionComposer')}</option>
      <option value="stats">{t('row.creditPositionStats')}</option>
    </select>
  )

  /*
   * The caption under the picker, ALWAYS visible regardless of whether the
   * picker can be used.
   *
   * It states what the setting MEANS, not what its options say — the reference
   * card's caption works the same way, and it is the copy that makes the
   * indented control legible as a child of the switch rather than as a stray
   * row. Restating the option names only when the control is greyed out is what
   * the DISABLED caption below does; folding both duties into one string is why
   * an always-visible line would either repeat the options pointlessly or leave
   * a dead picker unexplained.
   */
  const creditPositionCaption = t('row.creditPositionHintInline')

  /* Shown only when the picker is inert. It names the CAUSE (the switch above)
     and the FIX, which the generic caption deliberately does not. */
  const creditPositionDisabledCaption = t('row.creditPositionDisabledHint')

  /*
   * THE CAPABILITY SWITCHES: what the plugin may DO for this tab (route work to
   * the local CLI, let the model buy an image) and what it may SHOW (the credit
   * readout and where it sits).
   *
   * Order is deliberate and is not by region: SPEND first, display last. The
   * first two cost credits without asking again; the last two only change what
   * is drawn.
   *
   * Placement history, because this block keeps drifting: it started as two
   * boxes side by side under the tab bar (read as ONE shared setting rather than
   * as this tab's), moved into the ACCOUNT POOL's heading row as `headerExtra`
   * (shared a baseline with 「账号池」 and pushed the serving-account badge off to
   * the far right), then became a headed section (its far-right control column
   * split each sentence into a label at one edge and a control at the other).
   * It now has a SECTION of its own — 「能力」 — because these are grants, not
   * account facts, and because each is due sub-options (a working directory for
   * the CLI route, a price cap or size for the image tool) that a flat list
   * competing with the account table had no room for.
   *
   * The layout inside is still the reference card's: a checkbox on a line that
   * commits on the click, the explanation UNDER its label, and the picker that
   * belongs to a switch indented to that switch's label.
   *
   * It renders OUTSIDE AccountPool (below), not through `headerExtra`, so it
   * survives a Host that reports no pool state instead of vanishing with the
   * section that happened to carry it.
   */
  /**
   * The image tool opt-in, rendered above the credit preferences.
   *
   * It sits first because it is the only preference here that authorizes SPEND
   * rather than display: the credit line is a readout, this one lets the model
   * buy an image without asking again. Shown on BOTH tabs: each gateway now
   * publishes its own `text-to-image` model (CN `hunyuan-image-alpha`,
   * international `hy-image-3.5`, measured 2026-10-25), so the global box is no
   * longer a control that can never do anything. The flag is per-region and the
   * tool uses whichever region is BOTH enabled and switched on (CN first), so
   * ticking it here only ever authorizes spending on THIS tab.
   */
  const { cliBridgePreference, cliBridgePickers, imageToolPreference, videoToolPreference, videoModelPreference, mediaModelsPreference, upstreamSwitches, channelRejectContinuePreference, sidebarPanelPreference } = createCapabilityPreferences({ t, activeRegionOn, imageToolOn, activeRegion, togglingCredits, canWrite, saving, poolBusy, toggleImageTool, videoToolOn, toggleVideoTool, mediaByRegion, preferredVideoModelOf, pinningVideoModel, pinVideoModel, mediaBusy, setMediaBusy, loadMediaModels, mounted, mediaError, cliBridgeSwitchedOn, cliBridgeBusy, toggleCliBridge, sidebarPanelSwitchedOn, sidebarPanelBusy, toggleSidebarPanel, cliBridgeModelValue, visibleModels, cliBridgeEffortValue, cliBridgeRegionOrderValue, cliBridgeModelBusy, cliBridgeEffortBusy, cliBridgeRegionOrderBusy, pickCliBridgeModel, pickCliBridgeEffort, pickCliBridgeRegionOrder, usageIdentityValue, usageIdentityBusy, setUsageIdentityOn, keepPromptLastValue, keepPromptLastBusy, setKeepPromptLastOn, sessionTitleValue, sessionTitleBusy, setSessionTitleOn, toggleUpstreamSwitch, extraInjectedPrefixes, channelRejectContinueValue, channelRejectContinueBusy })
  const creditPreferences = (
    <div className="dsm-workbuddy-prefs">
      <span className="dsm-workbuddy-pref-hint">{t('row.modelToolsHint')}</span>
      <label
        className="dsm-workbuddy-pref"
        title={activeRegion === 'cn' ? t('row.showCreditsCnHint') : t('row.showCreditsGlobalHint')}
      >
        <input
          type="checkbox"
          className="dsm-workbuddy-pref-check"
          /* Same two rules as the first draft — the flag is forced OFF for a
             region that is off, and every writer of that region slot is
             serialized — kept HERE because this row owns the write. */
          checked={activeRegionOn ? creditsShownOn(activeRegion) : false}
          disabled={!activeRegionOn || togglingCredits === activeRegion || !canWrite || saving || poolBusy}
          onChange={(event: { target: { checked: boolean } }) => {
            void toggleCredits(activeRegion, event.target.checked)
          }}
        />
        <span className="dsm-workbuddy-pref-copy">
          <span className="dsm-workbuddy-pref-label">
            {activeRegion === 'cn' ? t('row.showCreditsCn') : t('row.showCreditsGlobal')}
          </span>
          <span className="dsm-workbuddy-pref-hint">{t('row.showCreditsHintInline')}</span>
        </span>
      </label>
      <label
        className="dsm-workbuddy-pref"
        title={t('row.showNewModelsHint')}
      >
        {/* A DISTINCT class, not `dsm-workbuddy-pref-check`: the credit-switch
            suite uses that class as its "the one per-region credit switch"
            selector, so a second element carrying it would make every
            single-checkbox selector in that suite resolve wrongly. Same rule
            the CLI bridge switch follows (see its own comment). */}
        <input
          type="checkbox"
          className="dsm-workbuddy-new-models-check"
          checked={activeRegionOn ? newModelsShownOn(activeRegion) : false}
          disabled={!activeRegionOn || togglingNewModels === activeRegion || !canWrite || saving || poolBusy}
          onChange={(event: { target: { checked: boolean } }) => {
            void toggleNewModels(activeRegion, event.target.checked)
          }}
        />
        <span className="dsm-workbuddy-pref-copy">
          <span className="dsm-workbuddy-pref-label">{t('row.showNewModels')}</span>
          <span className="dsm-workbuddy-pref-hint">{t('row.showNewModelsHintInline')}</span>
        </span>
      </label>
      {/* Indented to the checkbox's LABEL (15px box + 10px row gap), not to the
          card edge: the picker is a property of the switch above it, and an
          unindented row would read as a third, unrelated setting. */}
      <label
        className="dsm-workbuddy-pref dsm-workbuddy-pref-indent"
        title={t('row.creditPositionHint')}
      >
        <span className="dsm-workbuddy-pref-copy">
          <span className="dsm-workbuddy-pref-lead">
            <span className="dsm-workbuddy-pref-label">{t('row.creditPositionLabel')}</span>
            {creditPositionPicker}
          </span>
          <span className="dsm-workbuddy-pref-hint">
            {activeRegionOn ? creditPositionCaption : creditPositionDisabledCaption}
          </span>
        </span>
      </label>

      {imageToolPreference}
      {videoToolPreference}
      {videoModelPreference}
      {mediaModelsPreference}
      {cliBridgePreference}
      {cliBridgeSwitchedOn() ? cliBridgePickers : null}

    </div>
  )

  /**
   * The page header: the sidebar panel's own page, and the Settings section.
   *
   * Both are "a page about WorkBuddy" rather than a row in someone else's list,
   * so both say what this is in one line. They differ in exactly one control:
   * the sidebar page needs a way back to the conversation, while the Settings
   * section is inside a dialog the shell closes for you — a back arrow there
   * would point at a place the reader did not come from.
   */
  const pageHead = pageSurface || settingsSurface ? (
    <div className={settingsSurface ? 'dsm-workbuddy-page-head dsm-workbuddy-settings-head' : 'dsm-workbuddy-page-head'}>
      {pageSurface && backToConversation !== undefined
        ? (
            <button type="button" className="dsm-workbuddy-page-back" onClick={backToConversation}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t('nav.back')}</span>
            </button>
          )
        : null}
      <PluginIcon className="dsm-workbuddy-page-icon" />
      <span className="dsm-workbuddy-page-title">{title}</span>
      <span className="dsm-workbuddy-page-desc">{t('row.desc')}</span>
    </div>
  ) : null

  const cardBody = (
    <CardBodyBoundary t={t}>
      <div className="dsm-workbuddy-usage">
              <div className="dsm-workbuddy-tabs" role="tablist" aria-label={title}>
                {WORKBUDDY_REGIONS.map(region => {
                  const regionStatus = statusByRegion[region]
                  const regionOnState = regionOn(region)
                  return (
                    <div key={region} className="dsm-workbuddy-tab-cell">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={region === activeRegion}
                        className={`dsm-workbuddy-tab${region === activeRegion ? ' dsm-workbuddy-tab-active' : ''}${regionOnState ? '' : ' dsm-workbuddy-tab-off'}`}
                        onClick={() => { setActiveRegion(region); setAccountError(undefined) }}
                      >
                        {regionStatus === undefined
                          ? null
                          : <span aria-hidden="true" className="dsm-workbuddy-tab-dot" style={dotStyle(regionStatus.status)} />}
                        {region === 'cn' ? t('row.tabCn') : t('row.tabGlobal')}
                      </button>
                      <label className="dsm-workbuddy-tab-switch" title={t('row.tabSwitchHint')}>
                        <input
                          type="checkbox"
                          checked={regionOnState}
                          /* Serialized with the two SAVE writers. All three
                             write the SAME region slot, and the Host's
                             `__save` merges PER REGION (`{ ...current,
                             ...incoming }`), so a toggle carrying a stale
                             snapshot can roll back a concurrent save — and vice
                             versa. Gating only two of the three left exactly
                             that window open. */
                          disabled={togglingRegion === region || !canWrite || saving || poolBusy}
                          aria-label={t('row.tabSwitchAria', { region: region === 'cn' ? t('row.tabCn') : t('row.tabGlobal') })}
                          onChange={(event) => { void toggleRegion(region, event.target.checked) }}
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
              {/* What the two cells above ARE, stated once, directly under them.
                  It used to sit inside the accounts panel — below the section
                  tabs — where it read as a caption for 「账号 / 模型 / 能力」,
                  the row that is not what it describes. A description of the
                  region pair belongs against the region pair; and because it
                  now lives outside every panel it stays readable from all five
                  sections instead of disappearing with the first one. */}
              <p className="dsm-workbuddy-models-summary dsm-workbuddy-tab-hint">{t('row.tabHint')}</p>
              {/* Its OWN paragraph rather than a clause appended to the hint
                  above: this one is BOLD and is the only sentence here that
                  corrects a wrong assumption rather than describing a fact.
                  Appending it in the same grey run is what let the ×0 tiers
                  read as "unlimited" in the first place (issue #56's reporter
                  lost 30 minutes to exactly that reading).

                  It belongs HERE, with the region pair and its explanation, and
                  not inside the accounts panel where it used to sit: the two
                  sentences answer the same question ("what am I looking at, and
                  what are its limits"), and separating them by the section tabs
                  put a rule and three tabs between a statement and its caveat.
                  Living outside every panel also keeps it readable from the
                  model section, which is where the ×0 tiers actually appear. */}
              <p className="dsm-workbuddy-models-summary dsm-workbuddy-free-quota-warn">
                {t('row.tabFreeQuotaWarn')}
              </p>
              {/* THE CARD'S THREE SECTIONS. Above them, the region pair is the
                  SCOPE (which provider's data this whole panel is about) and
                  scrolls with the content like any other header row. */}
              {signedIn
                ? <div className="dsm-workbuddy-panels" role="tablist" aria-label={t('row.panelAria')}>
                    <button
                      type="button"
                      role="tab"
                      id="dsm-workbuddy-tab-accounts"
                      aria-controls="dsm-workbuddy-panel-accounts"
                      aria-selected={panel === 'accounts'}
                      className={`dsm-workbuddy-panel-tab${panel === 'accounts' ? ' dsm-workbuddy-panel-tab-active' : ''}`}
                      onClick={() => { setPanel('accounts') }}
                    >
                      {t('row.panelAccounts')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="dsm-workbuddy-tab-models"
                      aria-controls="dsm-workbuddy-panel-models"
                      aria-selected={panel === 'models'}
                      className={`dsm-workbuddy-panel-tab${panel === 'models' ? ' dsm-workbuddy-panel-tab-active' : ''}`}
                      onClick={() => { setPanel('models') }}
                    >
                      {t('row.panelModels')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="dsm-workbuddy-tab-capabilities"
                      aria-controls="dsm-workbuddy-panel-capabilities"
                      aria-selected={panel === 'capabilities'}
                      className={`dsm-workbuddy-panel-tab${panel === 'capabilities' ? ' dsm-workbuddy-panel-tab-active' : ''}`}
                      onClick={() => { setPanel('capabilities') }}
                    >
                      {t('row.panelCapabilities')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="dsm-workbuddy-tab-diag"
                      aria-controls="dsm-workbuddy-panel-diag"
                      aria-selected={panel === 'diag'}
                      className={`dsm-workbuddy-panel-tab${panel === 'diag' ? ' dsm-workbuddy-panel-tab-active' : ''}`}
                      onClick={() => { setPanel('diag') }}
                    >
                      {t('row.panelDiag')}
                    </button>
                    {/* 「SDK」 sits with the other sections rather than inside
                        Diagnostics: this is the page a user opens to CONFIRM
                        something works (and to copy a value), which is the one
                        thing the read-only Diagnostics tab must not become. */}
                    <button
                      type="button"
                      role="tab"
                      id="dsm-workbuddy-tab-sdk"
                      aria-controls="dsm-workbuddy-panel-sdk"
                      aria-selected={panel === 'sdk'}
                      className={`dsm-workbuddy-panel-tab${panel === 'sdk' ? ' dsm-workbuddy-panel-tab-active' : ''}`}
                      onClick={() => { setPanel('sdk') }}
                    >
                      {t('row.panelSdk')}
                    </button>
                  </div>
                : null}

              {/* ACCOUNTS — the default section: the account pool, the two
                  credit switches, and every notice about the credential, all at
                  the top instead of three screens down a single column. */}
              <div
                className="dsm-workbuddy-panel"
                role="tabpanel"
                id="dsm-workbuddy-panel-accounts"
                aria-labelledby="dsm-workbuddy-tab-accounts"
                /* `signedIn &&` — a signed-out card has no section tabs, so its
                   one screen of instructions must not be hidden by a panel
                   state the user cannot see or change. */
                hidden={signedIn && panel !== 'accounts'}
              >
              {!activeRegionOn
                ? <p className="dsm-workbuddy-tab-off-notice">{t('row.tabOffNotice')}</p>
                : null}
              {/* The credit/CLI/image preferences are NOT here any more: they
                  moved to their own 「能力」 section, which is where a control
                  that authorizes spending (or registers a tool) belongs. This
                  panel is about WHICH account serves the tab; those switches are
                  about WHAT the plugin may do with it, and every one of them is
                  expected to grow sub-options that had no room in a flat list
                  competing with the account table. */}
              {/* The signed-in status card is GONE: the account name and the
                  token expiry were both information the rest of the card already
                  carries, and this line was actively the wrong place for it.
                  With a pool, several accounts are signed in at once, so naming
                  one was never the whole truth; the pool block names the account
                  actually serving and its table lists every account with its
                  state. The token auto-renews, so its expiry is nothing the user
                  can act on — and when the credential genuinely breaks, the
                  dedicated panels below say so with a remedy.

                  What remains here is only text the user must ACT on: the
                  re-login hint for a failed region, and the orphaned-choice
                  notice. A region's health at a glance is still on its tab dot. */}
              {status.status === 'error'
                || (status.status === 'signed-in' && status.creditsError !== undefined)
                // A refusal gets its own, specific advice in the panel below;
                // the generic "sign in again" would contradict it.
                ? status.status === 'signed-in' && status.credentialRejected === true
                  ? null
                  : <p className="dsm-workbuddy-usage-hint">{t('row.reloginHint')}</p>
                : null}
              {/* The ACCOUNT-level failures: a rescan whose hides could not be
                  lifted, and an account switch that was refused. This state was
                  already written by both paths but never rendered, so a refused
                  write and a stuck-vault re-scan both read as clicks that did
                  nothing. Rendered here, once, above the panels it explains —
                  both call sites are on this card, and neither owns a status
                  area of its own. */}
              {accountError === undefined
                ? null
                : <p className="dsm-workbuddy-account-error" role="alert">{accountError}</p>}
              {selectionLost
                ? <p className="dsm-workbuddy-usage-hint">{t('row.selectionLostHint')}</p>
                : null}
              {/* Issue #199: shown INSTEAD of blaming the account list. When
                  the vault is unreadable, "the saved account is gone" is not
                  just unhelpful — it is false; the accounts are on disk, this
                  process just may not read the folder. The raw error names the
                  failing operation so a paste into an issue is usable. */}
              {vaultUnreadable !== undefined
                ? <p className="dsm-workbuddy-account-error" role="alert">
                    {t('row.vaultUnreadableHint', { message: vaultUnreadable })}
                  </p>
                : null}
              {status.status === 'signed-in'
                ? <>
                    {status.credentialRejected === true
                      ? <section className="dsm-workbuddy-usage-error" role="alert">
                          <strong>{t('row.credentialRejectedTitle')}</strong>
                          <p>{t('row.credentialRejectedIntro', { accountName: nameOf(status.accountName) })}</p>
                          {status.recovery?.usableAccount !== undefined
                            ? <p>{t('row.credentialRejectedSwitch', { accountName: nameOf(status.recovery.usableAccount.accountName) })}</p>
                            : status.recovery?.reloginRequired === true
                              ? <p>{t('row.credentialRejectedRelogin')}</p>
                              : <p>{t('row.credentialRejectedChoose')}</p>}
                          {status.recovery?.usableAccount === undefined
                            ? null
                            : <button
                                type="button"
                                className="dsm-btn dsm-btn-outline"
                                disabled={switchingAccount || !canWrite}
                                onClick={() => {
                                  const target = status.recovery?.usableAccount
                                  if (target !== undefined) void switchAccount(target.accountId)
                                }}
                              >
                                {switchingAccount
                                  ? t('row.accountsScanning')
                                  : t('row.credentialRejectedSwitchAction', { accountName: nameOf(status.recovery.usableAccount.accountName) })}
                              </button>}
                        </section>
                      : null}
                    {status.creditsError === undefined ? null
                      : <p className="dsm-workbuddy-usage-error">{t('row.creditsError', { message: status.creditsError })}</p>}
                    {status.refreshError === undefined ? null
                      : <p className="dsm-workbuddy-usage-error" role="alert">{t('row.requestFailedHint', { message: status.refreshError })}</p>}
                    {/* The account pool. Rendered only when the Host reports
                        pool state, so an older Host shows an unmodified card.
                        It owns the rotation-vs-manual conflict: while rotation
                        is on it reports `locked` and the account picker above
                        is disabled, because two writers deciding the same slot
                        is how "shows A, bills B" happens. The two sections'
                        save buttons are also serialized (`siblingBusy` /
                        `onBusyChange`): both write into ONE region slot and the
                        Host merges per-region, so concurrent saves could revert
                        each other. */}
                    <AccountPool
                      t={t}
                      region={activeRegion}
                      {...status.pool === undefined ? {} : { pool: status.pool }}
                      {...settingsScope === undefined ? {} : { settingsScope }}
                      // Account DISCOVERY lives with the pool now: the pool's
                      // member table is where accounts are chosen, so re-reading
                      // the local sign-ins belongs beside it rather than in the
                      // card's status header — one place to manage accounts.
                      onRescan={() => { void rescanAccounts() }}
                      rescanning={busy}
                      // Manual account selection lives here too, and ONLY while
                      // the pool is OFF. With the pool off nothing else can pick
                      // the serving account — the ranking is out of the picture —
                      // so removing this from the card header without putting it
                      // here left the user with no way to choose at all. With the
                      // pool ON it is deliberately not rendered: the ranking
                      // decides the serving account, so a picker would be a
                      // control that changes nothing.
                      onSelectAccount={(accountId) => { void switchAccount(accountId) }}
                      selectingAccount={switchingAccount}
                      accountTools={accountTools}
                      siblingBusy={saving || togglingRegion !== undefined}
                      onBusyChange={setPoolBusy}
                      // Returns the promise so the pool section can AWAIT the
                      // display refresh that follows a verified write (A-8).
                      //
                      // The draft is NO LONGER held until this resolves (5.8.0,
                      // issue #131): it is discarded the moment the write
                      // verifies, because the re-read is a network round trip and
                      // "saving…" stayed on over settings that had already
                      // landed. So the boolean below drives the STALE NOTICE, not
                      // a draft decision — `refreshUsage` reports a failed fetch
                      // by RESOLVING (undefined) rather than throwing, so `true`
                      // here means "the snapshot was actually applied" and
                      // `false` means "stored, display not refreshed"; `false`
                      // renders `row.poolSavedStaleRefresh` and must not be
                      // reported as a save failure.
                      onSaved={async () => (await refreshUsage(activeRegion)) !== undefined}
                      // Hands the PROMISE back, not a fire-and-forget call: the
                      // pool keeps its row veil up until the fresh snapshot has landed
                      // (see the `onRefresh` prop note in AccountPool).
                      onRefresh={() => refreshUsage(activeRegion)}
                      // 设备头设置（「虚拟值 / 真实值」+ 每账号齿轮）。三件一起
                      // 只在 DSH 实际回了设置时才传：一个没有这条路由的 Host
                      // 不该出现一个点不动的开关。
                      {...deviceSettings === undefined ? {} : {
                        deviceMode: deviceSettings.mode,
                        deviceProfiles: deviceSettings.accounts,
                        // 派生值随每次响应刷新：切档/保存后弹窗里显示的那一对必须
                        // 与下一条请求真正发出的一致，不能停在打开页面时读取的旧值。
                        ...deviceSettings.derived === undefined ? {} : { deviceDerived: deviceSettings.derived },
                        onDeviceModeChange: changeDeviceMode,
                        onSaveDeviceProfile: saveDeviceProfile,
                        // Host 判定的「真实值」可用性：界面不猜平台（mac 上 SDK 能发现、
                        // probe 也答 ready，坏的是取 token 那一环，光看平台名判断不出装没装）。
                        ...deviceSettings.realTier === undefined ? {} : { realTier: deviceSettings.realTier },
                      }}
                    />
                  </>
                : null}
              </div>

              {signedIn
                ? <div
                  className="dsm-workbuddy-panel"
                  role="tabpanel"
                  id="dsm-workbuddy-panel-models"
                  aria-labelledby="dsm-workbuddy-tab-models"
                  hidden={panel !== 'models'}
                >
                    <section className="dsm-workbuddy-models" aria-label={t('row.modelsTitle')}>
                      {/* The model list no longer folds. It used to be a native
                          <details>: a header that toggled on click, with a
                          chevron and a "click to collapse" hint. The list is what
                          users came for, so collapsing it only ever hid the thing
                          they wanted — and it made this section the only one on
                          the card with a click-to-hide header, which reads as a
                          different kind of section rather than the same one. */}
                      <div className="dsm-workbuddy-models-fold">
                        <div className="dsm-workbuddy-models-head">
                          <div>
                            <div className="dsm-workbuddy-models-title-row">
                              <h3 className="dsm-workbuddy-models-title">
                                {t('row.modelsTitle')}
                                {dirty
                                  ? <span className="dsm-workbuddy-models-dirty">{t('row.modelsDirty')}</span>
                                  : null}
                              </h3>
                            </div>
                            <p className="dsm-workbuddy-models-summary">{t('row.modelsSummary', { count: activeEnabledIds.size })}</p>
                          </div>
                          <div className="dsm-workbuddy-models-head-actions">
                            <button
                              type="button"
                              className="dsm-btn dsm-btn-outline"
                              disabled={busy}
                              onClick={() => { void refreshModels() }}
                            >
                              {busy ? t('row.modelsRefreshing') : t('row.modelsRefresh')}
                            </button>
                            {/* Two sweeps, by request of the maintainer after
                                comparing with the sibling `trae` plugin — which
                                ships the same pair. Both stay ONE model per
                                request (the route refuses more, and that cap is
                                what keeps a sweep from being an unaccounted
                                spend), so the loop lives here rather than in the
                                Host. The "all" button carries the cost hint: it
                                covers the models you did NOT enable as well, so
                                it spends more than the enabled-only run. */}
                            <button
                              type="button"
                              className="dsm-btn dsm-btn-outline dsm-workbuddy-models-sweep"
                              disabled={busy || sweeping !== undefined || activeEnabledIds.size === 0}
                              title={t('row.modelsTestEnabledHint')}
                              onClick={sweepEnabledModels}
                            >
                              {sweeping === undefined
                                ? t('row.modelsTestEnabled')
                                : t('row.modelsTesting', { done: sweeping.done, total: sweeping.total })}
                            </button>
                            <button
                              type="button"
                              className="dsm-btn dsm-btn-outline dsm-workbuddy-models-sweep"
                              disabled={busy || sweeping !== undefined || visibleModels.length === 0}
                              title={t('row.modelsTestAllHint')}
                              onClick={sweepAllModels}
                            >
                              {sweeping === undefined
                                ? t('row.modelsTestAll')
                                : t('row.modelsTesting', { done: sweeping.done, total: sweeping.total })}
                            </button>
                            {/* Speed sweep (issue #92). A separate button from the
                                two above because it answers a different question
                                and costs a different amount: the availability
                                probes send 25k input tokens each, while a speed
                                run sends ~35 and asks for 256 back, so this is
                                roughly 30x cheaper per model yet still three real
                                requests. Keeping it separate means the cost hint
                                on each button stays true. */}
                            <button
                              type="button"
                              className="dsm-btn dsm-btn-outline dsm-workbuddy-models-sweep"
                              disabled={busy || tpsSweeping !== undefined || tpsBusy
                                || activeEnabledIds.size === 0}
                              title={t('row.tpsSweepEnabledHint')}
                              onClick={sweepTpsEnabledModels}
                            >
                              {tpsSweeping === undefined
                                ? t('row.tpsSweepEnabled')
                                : t('row.tpsTesting', { done: tpsSweeping.done, total: tpsSweeping.total })}
                            </button>
                          </div>
                        </div>
                      {probeError === undefined ? null
                        : <p className="dsm-workbuddy-model-probe-result dsm-workbuddy-model-probe-result-bad" role="alert">
                            {t('row.probeError', { message: probeError })}
                          </p>}
                      {/* The sweep's tally, under the buttons. Absent until a
                          sweep runs, so the section does not grow a line that
                          says nothing. */}
                      {sweepSummary === undefined ? null
                        : <p className="dsm-workbuddy-models-sweep-summary" role="status">{sweepSummary}</p>}
                      <div className="dsm-workbuddy-model-list">
                        {visibleModels.map(model => (
                          <div className={`dsm-workbuddy-model${activeEnabledIds.has(model.id) ? '' : ' dsm-workbuddy-model-disabled'}`} key={model.id}>
                            <div className="dsm-workbuddy-model-head">
                              <label className="dsm-workbuddy-model-enabled">
                                <input
                                  type="checkbox"
                                  checked={activeEnabledIds.has(model.id)}
                                  disabled={!canWrite || saving}
                                  onChange={() => { toggleModel(model.id) }}
                                />
                                <span className="dsm-workbuddy-model-copy">
                                  <span className="dsm-workbuddy-model-name">
                                    {model.name}
                                    {effectiveRate(model) === undefined ? null
                                      // The SAME token the picker shows: the label slot
                                      // appends `x0.00` to the model name (see
                                      // `adapter.ts`), and a card saying `(0.00x)` would
                                      // make one number look like two. The 7px gap above
                                      // already separates it from the name, so no dot.
                                      : <span className="dsm-workbuddy-model-name-rate">x{effectiveRate(model)!.toFixed(2)}</span>}
                                  </span>
                                  {/* The upstream's own promotion badge, when one
                                      holds for this model right now. It sits NEXT
                                      to the name rather than inside it: the name
                                      truncates with an ellipsis, and a badge
                                      inside it would be cut off with the text. */}
                                  {promoChip(model)}
                                  {/* The upstream's LIVE load level, drawn as an
                                      icon. It sits NEXT to the name for the same
                                      reason the promo badge does: the name
                                      truncates, and a marker inside it would be
                                      cut off with the text. A level that is not
                                      worth drawing (or was not measured) draws
                                      nothing at all. */}
                                  {busyIcon(busyLevels[model.id], uiLanguage())}
                                </span>
                              </label>
                              <label
                                className="dsm-workbuddy-model-image"
                                title={imageCheckboxHint(model, t)}
                              >
                                <input
                                  type="checkbox"
                                  checked={activeImageIds.has(model.id)}
                                  disabled={!canWrite || saving}
                                  onChange={() => { toggleImage(model.id) }}
                                />
                                <span>{t('row.modelImage')}</span>
                              </label>
                              <label
                                className={`dsm-workbuddy-model-off${offBlocked(model) ? ' dsm-workbuddy-model-off-blocked' : ''}`}
                                title={offBlocked(model) ? t('row.modelOffRefusedHint') : t('row.modelOffHint')}
                              >
                                <input
                                  type="checkbox"
                                  checked={activeOffIds.has(model.id)}
                                  disabled={!canWrite || saving || offBlocked(model)}
                                  onChange={() => { toggleOff(model.id) }}
                                />
                                <span>{t('row.modelOff')}</span>
                                {/* The tick can be a leftover from an older build,
                                    and this build will not send the level anyway —
                                    so say so instead of leaving a checkbox that
                                    looks saved but cannot take effect (issue #83). */}
                                {offBlocked(model) ? <span className="dsm-workbuddy-model-off-flag">{t('row.modelOffRefused')}</span> : null}
                              </label>
                              {/* ONE SELECT, NOT A ROW OF RADIOS (requested).
                                  It was three radios — 200K / 500K / native —
                                  wrapping to a second line on a narrow column
                                  and reading as three independent switches when
                                  they are one choice.

                                  THE CORRECTNESS RULE IS UNCHANGED (issue #215).
                                  The selected option is still computed from
                                  `effectiveContextBudget()` — the same function
                                  the backend's window is derived from — so the
                                  control cannot claim a cap the host did not
                                  take. Only the SHAPE changed: three clickable
                                  targets became one, and the tiers stay exactly
                                  the ones the model can actually use. */}
                              <select
                                className="dsm-workbuddy-context-budget"
                                aria-label={t('row.contextBudget')}
                                value={String(effectiveContextBudget(model.nativeContextWindow, activeContextBudgets[model.id]))}
                                disabled={!canWrite || saving}
                                onChange={event => {
                                  const picked = Number(event.target.value)
                                  // Native is stored as `undefined`, not as the
                                  // window's number: storing the number would
                                  // stop following the model if the upstream
                                  // raises its window, and would make "native"
                                  // indistinguishable from a cap that happens to
                                  // equal it.
                                  setContextBudget(model.id, picked === model.nativeContextWindow ? undefined : picked)
                                }}
                              >
                                {/* Tiers are gated on the model's REAL window so
                                    an option above it is never offered: a 192K
                                    model would otherwise show a 500K choice that
                                    silently lowers nothing. Same gates as the
                                    radios had. */}
                                {model.nativeContextWindow > 200_000
                                  ? <option value={200_000}>200K</option>
                                  : null}
                                {model.nativeContextWindow > 500_000
                                  ? <option value={500_000}>500K</option>
                                  : null}
                                <option value={model.nativeContextWindow}>
                                  {formatCapacity(model.nativeContextWindow, t('row.modelUnknown'))}
                                </option>
                              </select>
                                <div className="dsm-workbuddy-model-actions-buttons">
                                {/* Test button. Deliberately NOT gated on `canWrite`
                                    or `saving`: a probe writes no settings, so it
                                    works on a read-only card and while a save is
                                    in flight. It IS gated on being signed in,
                                    because without a credential the only possible
                                    answer is "rejected".

                                    It sends a REAL-VOLUME request (see
                                    DEFAULT_PROBE_INPUT_TOKENS in src/probe.ts), because
                                    the upstream's 6004 throttle fires on request
                                    size: a tiny probe would report "usable" while
                                    every real request in a long conversation is
                                    refused. That also means it costs real
                                    credits, so it is per-model and manual only —
                                    there is deliberately no batch button. */}
                                <button
                                  type="button"
                                  className="dsm-btn dsm-btn-outline dsm-workbuddy-model-probe"
                                  disabled={probing[model.id] === true || status.status !== 'signed-in'}
                                  title={t('row.probeHint')}
                                  onClick={() => { void probeModels([model.id]) }}
                                >
                                  {probing[model.id] === true ? t('row.probing') : t('row.probe')}
                                </button>
                                {/* Speed, beside availability (issue #92). Its own
                                    button because the two answers are about
                                    different things: a model can be perfectly
                                    available and half the speed of its
                                    neighbour at the same credit multiplier. */}
                                <button
                                  type="button"
                                  className="dsm-btn dsm-btn-outline dsm-workbuddy-model-probe"
                                  disabled={tpsProbing[model.id] === true || status.status !== 'signed-in'}
                                  title={t('row.tpsHint')}
                                  onClick={() => { void measureTpsFor([model.id]) }}
                                >
                                  {tpsProbing[model.id] === true ? t('row.tpsMeasuring') : t('row.tpsMeasure')}
                                </button>
                                </div>
                              </div>
                              <div className="dsm-workbuddy-model-details">
                                <div className="dsm-workbuddy-model-meta">
                                  <span>{t('row.modelContext', { context: formatCapacity(model.nativeContextWindow, t('row.modelUnknown')) })}</span>
                                  <span>{t('row.modelOutput', { output: formatCapacity(model.maxTokens, t('row.modelUnknown')) })}</span>
                                  {/* Issue #179: the tier the model runs on when a
                                      caller names none, chosen per model.

                                      This REPLACES the read-only 「推理强度: low / high /
                                      max」 line. That line disclosed the vocabulary;
                                      the picker discloses the same list AND is the
                                      setting, so one control now answers both
                                      questions instead of two surfaces restating
                                      each other.

                                      The vocabularies genuinely differ across the
                                      roster (`low/high/max` on deepseek, `high/xhigh`
                                      on glm-5.2), so the options are this model's
                                      own tiers, named exactly as the upstream names
                                      them — the same words every other client shows.

                                      The first option names the tier the runtime
                                      will actually use with no saved choice, so
                                      the label can never disagree with what the
                                      adapter advertises. */}
                                  {(() => {
                                    const efforts = selectableEfforts(model.reasoning)
                                    if (efforts.length === 0) return null
                                    const saved = activeDefaultEfforts[model.id]
                                    const chosen = typeof saved === 'string' && efforts.includes(saved) ? saved : ''
                                    // Name the tier this model will actually run
                                    // on if the user picks the FIRST option — i.e.
                                    // with the saved choice cleared. Resolved with
                                    // an EMPTY map on purpose: passing the saved
                                    // picks would describe the user's own choice
                                    // instead of the option they are reading, so
                                    // the label would say "Default (low)" on the
                                    // very row where `low` is a separate option.
                                    //
                                    // `defaultEffortFor` is the single source of
                                    // that answer (upstream default > this model's
                                    // own MIDDLE tier), so the card can never
                                    // claim a tier the adapter does not advertise
                                    // — or, for a model whose upstream declares no
                                    // default, show a bare "Default" while the
                                    // adapter silently dispatches the middle tier.
                                    const follow = defaultEffortFor(model)
                                    const followLabel = follow !== undefined
                                      ? t('row.modelEffortFollowNamed', { effort: follow })
                                      : t('row.modelEffortFollow')
                                    return (
                                      <label
                                        className="dsm-workbuddy-model-effort"
                                        title={t('row.modelEffortHint')}
                                      >
                                        <span>{t('row.modelEffortLabel')}</span>
                                        <select
                                          className="dsm-workbuddy-model-effort-select"
                                          value={chosen}
                                          disabled={!canWrite || saving}
                                          aria-label={t('row.modelEffortAria', { model: model.name })}
                                          onChange={(event: { currentTarget: { value: string } }) => {
                                            setDefaultThinkingEffort(model.id, event.currentTarget.value)
                                          }}
                                        >
                                          <option value="">{followLabel}</option>
                                          {efforts.map(level => (
                                            <option key={level} value={level}>{level}</option>
                                          ))}
                                        </select>
                                      </label>
                                    )
                                  })()}
                                </div>
                              </div>
                              {(() => {
                                const result = probes[activeRegion]?.[model.id]
                                if (result === undefined) return null
                                const view = probeResultView(result, t)
                                const reason = inlineProbeReason(result.outcome, result.message)
                                return (
                                  <p
                                    className={`dsm-workbuddy-model-probe-result dsm-workbuddy-model-probe-result-${view.tone}`}
                                    role="status"
                                    // The full upstream text, kept reachable even
                                    // when the line below shortens or drops it.
                                    {...result.message === undefined ? {} : { title: result.message }}
                                  >
                                    {view.text}
                                    {reason === undefined ? null : ' · ' + reason}
                                  </p>
                                )
                              })()}
                              {/* Speed sits on its OWN line, below the
                                  availability verdict: the two are independent
                                  facts and merging them into one <p> would make
                                  a fast-but-unavailable model read as one
                                  combined state that does not exist. */}
                              {(() => {
                                const measured = tpsResults[model.id]
                                if (measured === undefined) return null
                                const view = tpsResultView(measured, t, tpsMeasuredAt[model.id])
                                return (
                                  <p
                                    className={`dsm-workbuddy-model-probe-result dsm-workbuddy-model-probe-result-${view.tone}`}
                                    role="status"
                                  >
                                    {view.text}
                                  </p>
                                )
                              })()}
                          </div>
                        ))}
                      </div>
                      <p className="dsm-workbuddy-model-capability-note">{t('row.modelCapabilityPending')}</p>
                      <div className="dsm-workbuddy-model-actions">
                        <a
                          className="dsm-workbuddy-usage-cheer"
                          href={WORKBUDDY_GITHUB_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('row.cheer')}
                          <span className="dsm-workbuddy-usage-cheer-star" aria-hidden="true">★</span>
                        </a>
                        {saveError === undefined ? null
                          : <span className="dsm-workbuddy-model-save-error">{t('row.saveError', { message: saveError })}</span>}
                        <div className="dsm-workbuddy-model-actions-buttons">
                          <button type="button" className="dsm-btn dsm-btn-outline" disabled={!dirty || saving || poolBusy || togglingRegion !== undefined} onClick={discardModels}>
                            {t('row.discard')}
                          </button>
                          <button type="button" className="dsm-btn dsm-btn-primary" disabled={!dirty || saving || poolBusy || togglingRegion !== undefined || activeEnabledIds.size === 0} onClick={() => { void saveModels() }}>
                            {saving ? t('row.saving') : t('row.save')}
                          </button>
                        </div>
                      </div>
                      </div>
                    </section>
              </div>
                : null}
              {/* CAPABILITIES — what the plugin is allowed to DO, as opposed to
                  which account it does it with. Three switches, no Save button:
                  each one commits on the click, which is exactly why they cannot
                  sit inside a section whose note promises 「点保存才生效」.

                  `signedIn &&` matches the accounts panel: a signed-out card has
                  no tab bar, so the section must stay reachable (and it is the
                  only place the CLI switch lives on an older Host that reports no
                  pool state). */}
              <div
                className="dsm-workbuddy-panel"
                role="tabpanel"
                id="dsm-workbuddy-panel-capabilities"
                aria-labelledby="dsm-workbuddy-tab-capabilities"
                hidden={signedIn && panel !== 'capabilities'}
              >
                <p className="dsm-workbuddy-panel-note">{t('row.panelCapabilitiesHint')}</p>
                {/* The CN gateway override, first: it is the only control here
                    that a user reaches for when NOTHING works, and burying it
                    under four switches is how the reporter of issue #220 spent a
                    day on the wrong layer. */}
                {cnBasePreference}
                {creditPreferences}
                {sidebarPanelPreference}

                {upstreamSwitches}
                {channelRejectContinuePreference}
              </div>
              {/* DIAGNOSTICS — the third section, and the one that earns its tab
                  by holding nothing the other two already say: the facts a bug
                  report needs (which region, which host, which account, which
                  credential expiry, how big the catalog actually is) plus the
                  upstream's own error text rather than a summary of it. No
                  control lives here, on purpose. */}
              <div
                className="dsm-workbuddy-panel"
                role="tabpanel"
                id="dsm-workbuddy-panel-diag"
                aria-labelledby="dsm-workbuddy-tab-diag"
                hidden={!signedIn || panel !== 'diag'}
              >
                {status.status !== 'signed-in'
                  ? null
                  : <>
                      <div className="dsm-workbuddy-diag">
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagRegion')}</span>
                          <span className="dsm-workbuddy-diag-value">
                            {status.region === 'cn' ? t('row.tabCn') : t('row.tabGlobal')}
                          </span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagDomain')}</span>
                          <span className="dsm-workbuddy-diag-value dsm-workbuddy-diag-mono">
                            {status.domain === undefined || status.domain === ''
                              ? t('row.modelUnknown')
                              : status.domain}
                          </span>
                        </div>
                        {/* WHICH GATEWAY IS ACTUALLY IN FORCE (issue #220).
                            The row reports the RESOLVED value, not the saved
                            string: a saved value that failed validation still
                            routes to the built-in gateway, and a diagnostics
                            panel that echoed the unvalidated text would tell a
                            user their override is live when it is not. Only on
                            the CN tab — the international gateways follow the
                            credential's brand and have no override. */}
                        {status.region === 'cn'
                          ? <div className="dsm-workbuddy-diag-row">
                              <span className="dsm-workbuddy-diag-label">{t('row.diagCnBase')}</span>
                              <span className="dsm-workbuddy-diag-value dsm-workbuddy-diag-mono">
                                {(() => {
                                  const resolved = resolveCnGateway(regionCnBaseOf(settingsScope?.getSnapshot().value, 'cn'))
                                  return resolved.ok && resolved.overridden
                                    ? resolved.base
                                    : t('row.diagCnBaseDefault')
                                })()}
                              </span>
                            </div>
                          : null}
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagAccount')}</span>
                          <span className="dsm-workbuddy-diag-value">{nameOf(status.accountName)}</span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagToken')}</span>
                          <span className="dsm-workbuddy-diag-value dsm-workbuddy-diag-mono">
                            {formatDate(status.tokenExpiresAtMs)}
                          </span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagCatalog')}</span>
                          <span className="dsm-workbuddy-diag-value">{formatNumber(status.models.length)}</span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagEnabled')}</span>
                          <span className="dsm-workbuddy-diag-value">{formatNumber(status.enabledModelIds.length)}</span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagPool')}</span>
                          <span className="dsm-workbuddy-diag-value">
                            {status.pool?.enabled === true
                              ? t('row.diagPoolOn', { count: status.pool.accounts.length })
                              : t('row.diagPoolOff')}
                          </span>
                        </div>
                        <div className="dsm-workbuddy-diag-row">
                          <span className="dsm-workbuddy-diag-label">{t('row.diagFailures')}</span>
                          {(() => {
                            const failures: string[] = []
                            if (status.credentialRejected === true) failures.push(t('row.credentialRejectedTitle'))
                            if (status.refreshError !== undefined) failures.push(status.refreshError)
                            if (status.creditsError !== undefined) failures.push(status.creditsError)
                            // Issue #139: a promotion whose published hours could
                            // not be read draws NO badge and NO discount (see
                            // `promoWithinDailyWindow`), which is indistinguishable
                            // from "the promotion ended". Counting them here is what
                            // makes that visible instead of silent — and this is the
                            // symptom a future upstream format change will actually
                            // produce, not the render crash the report guessed at.
                            const unreadable = status.models.reduce(
                              (count, model) => count + (model.promos ?? []).filter(
                                promo => promo.schedule?.dailyUnusable === true,
                              ).length,
                              0,
                            )
                            if (unreadable > 0) failures.push(t('row.diagPromoUnreadable', { count: unreadable }))
                            // The upstream's OWN text, joined — not a rewritten
                            // sentence. This panel exists to be quoted.
                            return failures.length === 0
                              ? <span className="dsm-workbuddy-diag-value">{t('row.diagNoFailures')}</span>
                              : <span className="dsm-workbuddy-diag-value dsm-workbuddy-diag-bad dsm-workbuddy-diag-mono">
                                  {failures.join(' · ')}
                                </span>
                          })()}
                        </div>
                      </div>
                      <p className="dsm-workbuddy-diag-hint">{t('row.diagHint')}</p>
                    </>}
              </div>
              {/* SDK — the real-device section. Mounted only when its tab is
                  open, unlike the panels above which stay mounted to keep their
                  state: this one's first render spawns a probe child process,
                  and a virtual-tier user who never opens it should never pay
                  for that. Hidden-on-503 is handled inside the panel. */}
              <div
                className="dsm-workbuddy-panel"
                role="tabpanel"
                id="dsm-workbuddy-panel-sdk"
                aria-labelledby="dsm-workbuddy-tab-sdk"
                hidden={!signedIn || panel !== 'sdk'}
              >
                {panel === 'sdk'
                  ? <DeviceSdkPanel
                      t={t}
                      path={WORKBUDDY_DEVICE_SDK_PATH}
                      settingsPath={WORKBUDDY_DEVICE_PROFILE_PATH}
                    />
                  : null}
              </div>
              {status.status === 'signed-out' && loading
                // NOT the signed-out branch: nothing has answered yet. Showing
                // "not signed in" here was issue #77 — a signed-in user with a
                // pool full of accounts was told to sign in, for as long as the
                // usage route took, and the only control on screen detected
                // accounts they already had. The line below is what a first
                // paint in flight looks like; the `detail=fast` document
                // normally replaces it within one local round trip.
                ? <p className="dsm-workbuddy-usage-text" role="status">{t('row.accountsLoading')}</p>
                : null}
              {status.status === 'signed-out' && !loading
                ? <>
                    <p className="dsm-workbuddy-usage-text">
                      {/* An orphaned saved id is NOT a signed-out machine: the
                          tokens are fine and re-signing in would not repair the
                          id. Say what actually helps (re-pick, or follow the app
                          again) instead of echoing the resolve() error, which
                          tells the user to sign in — the one action that cannot
                          fix this. The same goes for a wrong-region sign-in.
                          When a probed-path list follows, its paths ARE the
                          enumeration the resolve() error repeats, so the
                          paragraph states the situation and the list supplies
                          the detail. */}
                      {signedOutText(notice, t)}
                    </p>
                    {/* Re-detect stays HERE as well, not only in the pool block:
                        the pool renders for a signed-in region only, and "I just
                        signed in over there, look again" is precisely a
                        signed-OUT action. Moving the control without this copy
                        would have removed the only way out of that state. */}
                    <div className="dsm-workbuddy-usage-account-actions">
                      <button
                        type="button"
                        className="dsm-btn dsm-btn-outline"
                        disabled={busy}
                        onClick={() => { void rescanAccounts() }}
                      >
                        {busy ? t('row.accountsScanning') : t('row.accountsRescan')}
                      </button>
                    </div>
                    {/* Account tools, signed-OUT flavour. The pool section
                        that normally hosts these does not render without an
                        account, and a signed-out machine is exactly where both
                        matter most: QR is the only way to add an account
                        without the desktop app, and a file exported from
                        another computer is how this one gains its accounts.
                        Same container and same order as the signed-in copy, so
                        the two states do not read as two different features. */}
                    <div className="dsm-workbuddy-pool-tools">{accountTools}</div>
                    {searched.length > 0 ? <SearchedPaths items={searched} t={t} /> : null}
                  </>
                : null}
              {status.status === 'error'
                ? <div className="dsm-workbuddy-usage-error-block">
                    <p className="dsm-workbuddy-usage-error" role="alert">
                      {t('row.usageErrorHint', {
                        message: status.message === '' ? t('row.requestFailed') : status.message,
                      })}
                    </p>
                    <button
                      type="button"
                      className="dsm-btn dsm-btn-outline"
                      onClick={() => {
                        statusRetries.current = 0
                        void refreshUsage(activeRegion)
                      }}
                    >
                      {t('row.usageRetry')}
                    </button>
                  </div>
                : null}
            </div>
          </CardBodyBoundary>
  )

  if (surface === 'section') {
    return (
      <div className="dsm-workbuddy-section">
        <div className="dsm-workbuddy-section-head">
          <h2 className="dsm-workbuddy-section-title">{title}</h2>
          <p className="dsm-workbuddy-section-desc">{t('row.desc')}</p>
        </div>
        {cardBody}
      </div>
    )
  }

  if (settingsSurface) {
    return (
      <div className="dsm-workbuddy-settings">
        {pageHead}
        <div className="dsm-workbuddy-page-body">{cardBody}</div>
      </div>
    )
  }

  if (pageSurface) {
    return (
      <div className="dsm-workbuddy-page" ref={page => { if (page !== null) requestAnimationFrame(() => { updateStickyTabs(page) }) }} onScroll={event => { updateStickyTabs(event.currentTarget) }}>
        {pageHead}
        <div className="dsm-workbuddy-page-body">{cardBody}</div>
      </div>
    )
  }

  return (
    <li className={`dsm-plugin-card${open ? ' dsm-plugin-card-open' : ''}`}>
      <button
        type="button"
        className="dsm-plugin-card-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'row.collapse' : 'row.expand')}: ${title}`}
        onClick={() => { setCardOpen(!cardOpen) }}
      >
        <PluginIcon className="dsm-plugin-card-icon" />
        <span className="dsm-plugin-card-head">
          <span className="dsm-plugin-card-title">{title}</span>
          <span className="dsm-plugin-card-description">{t('row.desc')}</span>
        </span>
        <span aria-hidden="true" className={`dsm-plugin-card-chevron${open ? ' dsm-plugin-card-chevron-open' : ''}`} />
      </button>
      <div className="dsm-plugin-card-body" hidden={!open}>
        {open ? cardBody : null}
      </div>
    </li>
  )
}
