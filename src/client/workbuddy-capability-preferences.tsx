/** 从 WorkBuddyCard.tsx 按职责提取；来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */

import { CLI_BRIDGE_EFFORT_LEVELS, CLI_BRIDGE_REGION_ORDERS } from './workbuddy-card-view.tsx'

import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

import type { WorkBuddyWebMediaModel, WorkBuddyWebModel, WorkBuddyWebRegion } from '../status-paths.ts'

import type { Translate } from './searched-paths.ts'
interface CapabilityInputs {
  t: Translate
  activeRegionOn: boolean
  imageToolOn: (item: WorkBuddyWebRegion) => boolean
  activeRegion: WorkBuddyWebRegion
  togglingCredits: WorkBuddyWebRegion | undefined
  canWrite: boolean
  saving: boolean
  poolBusy: boolean
  toggleImageTool: (item: WorkBuddyWebRegion, enabled: boolean) => Promise<void>
  videoToolOn: (item: WorkBuddyWebRegion) => boolean
  toggleVideoTool: (item: WorkBuddyWebRegion, enabled: boolean) => Promise<void>
  mediaByRegion: Partial<Record<WorkBuddyWebRegion, readonly WorkBuddyWebMediaModel[]>>
  preferredVideoModelOf: (item: WorkBuddyWebRegion, tag: string) => string
  pinningVideoModel: string | undefined
  pinVideoModel: (item: WorkBuddyWebRegion, tag: string, modelId: string | undefined) => Promise<void>
  mediaBusy: boolean
  setMediaBusy: import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").Dispatch<import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").SetStateAction<boolean>>
  loadMediaModels: (region: WorkBuddyWebRegion, refresh: boolean, signal?: AbortSignal) => Promise<void>
  mounted: import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").MutableRefObject<boolean>
  mediaError: string | undefined
  cliBridgeSwitchedOn: () => boolean
  cliBridgeBusy: boolean
  toggleCliBridge: (enabled: boolean) => Promise<void>
  sidebarPanelSwitchedOn: () => boolean
  sidebarPanelBusy: boolean
  toggleSidebarPanel: (enabled: boolean) => Promise<void>
  cliBridgeModelValue: () => string
  visibleModels: readonly WorkBuddyWebModel[]
  cliBridgeEffortValue: () => string
  cliBridgeRegionOrderValue: () => string
  cliBridgeModelBusy: boolean
  cliBridgeEffortBusy: boolean
  cliBridgeRegionOrderBusy: boolean
  pickCliBridgeModel: (model: string) => Promise<void>
  pickCliBridgeEffort: (effort: string) => Promise<void>
  pickCliBridgeRegionOrder: (regionOrder: string) => Promise<void>
  usageIdentityValue: () => boolean
  usageIdentityBusy: boolean
  setUsageIdentityOn: import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").Dispatch<import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").SetStateAction<boolean | undefined>>
  keepPromptLastValue: () => boolean
  keepPromptLastBusy: boolean
  setKeepPromptLastOn: import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").Dispatch<import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").SetStateAction<boolean | undefined>>
  sessionTitleValue: () => { enabled: boolean; model: string; }
  sessionTitleBusy: boolean
  setSessionTitleOn: import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").Dispatch<import("D:/work/dsh-connect-workbuddy/node_modules/.pnpm/@types+react@18.3.31/node_modules/@types/react/index").SetStateAction<boolean | undefined>>
  toggleUpstreamSwitch: (field: "usageIdentity" | "keepPromptLast" | "sessionTitle" | "channelRejectContinue", enabled: boolean) => Promise<void>
  extraInjectedPrefixes: () => string[]
  channelRejectContinueValue: () => { enabled: boolean; maxConsecutive: number; text: string; }
  channelRejectContinueBusy: boolean
}
export function createCapabilityPreferences({ t, activeRegionOn, imageToolOn, activeRegion, togglingCredits, canWrite, saving, poolBusy, toggleImageTool, videoToolOn, toggleVideoTool, mediaByRegion, preferredVideoModelOf, pinningVideoModel, pinVideoModel, mediaBusy, setMediaBusy, loadMediaModels, mounted, mediaError, cliBridgeSwitchedOn, cliBridgeBusy, toggleCliBridge, sidebarPanelSwitchedOn, sidebarPanelBusy, toggleSidebarPanel, cliBridgeModelValue, visibleModels, cliBridgeEffortValue, cliBridgeRegionOrderValue, cliBridgeModelBusy, cliBridgeEffortBusy, cliBridgeRegionOrderBusy, pickCliBridgeModel, pickCliBridgeEffort, pickCliBridgeRegionOrder, usageIdentityValue, usageIdentityBusy, setUsageIdentityOn, keepPromptLastValue, keepPromptLastBusy, setKeepPromptLastOn, sessionTitleValue, sessionTitleBusy, setSessionTitleOn, toggleUpstreamSwitch, extraInjectedPrefixes, channelRejectContinueValue, channelRejectContinueBusy }: CapabilityInputs) {
  const imageToolPreference = (
    <label className="dsm-workbuddy-pref" title={t('row.imageToolHint')}>
      <input
        type="checkbox"
        /* Its OWN class, not the shared `.dsm-workbuddy-pref-check`: that class
           is the contract the credit-switch suite selects on ("exactly one
           switch"), and a second element carrying it makes every
           single-checkbox selector resolve to the wrong box. Same styling,
           carried by the mirrored rule in `styles.ts`. */
        className="dsm-workbuddy-image-tool-check"
        checked={activeRegionOn ? imageToolOn(activeRegion) : false}
        disabled={!activeRegionOn || togglingCredits === activeRegion || !canWrite || saving || poolBusy}
        onChange={(event: { target: { checked: boolean } }) => {
          void toggleImageTool(activeRegion, event.target.checked)
        }}
      />
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-label">{t('row.imageToolLabel')}</span>
        <span className="dsm-workbuddy-pref-hint">{t('row.imageToolHint')}</span>
      </span>
    </label>
  )
  /**
   * The video-tool opt-in. Same shape and same stakes as imageToolPreference:
   * per-region, off means the tool is NOT registered at all (not "registered
   * but refusing"), so a tick here only ever authorizes spending on THIS tab.
   * The tool is an async task that runs tens of seconds to minutes.
   */
  const videoToolPreference = (
    <label className="dsm-workbuddy-pref" title={t('row.videoToolHint')}>
      <input
        type="checkbox"
        /* Its OWN class (see imageToolPreference for why it must not be the
           shared dsm-workbuddy-pref-check class): a second element carrying
           that class would break the credit-switch suite selector. */
        className="dsm-workbuddy-video-tool-check"
        checked={activeRegionOn ? videoToolOn(activeRegion) : false}
        disabled={!activeRegionOn || togglingCredits === activeRegion || !canWrite || saving || poolBusy}
        onChange={(event: { target: { checked: boolean } }) => {
          void toggleVideoTool(activeRegion, event.target.checked)
        }}
      />
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-label">{t('row.videoToolLabel')}</span>
        <span className="dsm-workbuddy-pref-hint">{t('row.videoToolHint')}</span>
      </span>
    </label>
  )
  /**
   * What this region can actually draw. The IMAGE rows stay read-only; the
   * VIDEO rows are pinnable in `videoModelPreference` below.
   *
   * The roster used to be read-only because every tag group held exactly one
   * model in both regions (measured 2026-10-25), so a dropdown would have been a
   * choice of one. That stopped being true for VIDEO: CN publishes two models
   * per video tag (`kling-video-v3` and `minimax-video-h3`) — the very
   * "两个模型能不能挑" question. The pin therefore lives in its own block below,
   * and the roster keeps answering "can this tab draw at all, and with what".
   *
   * Indented like the position picker, because it is a property of the switch
   * above it rather than a fourth independent setting.
   */
  const mediaTagLabels: Record<string, string> = {
    'text-to-image': t('row.mediaTagTextToImage'),
    'image-to-image': t('row.mediaTagImageToImage'),
    'text-to-video': t('row.mediaTagTextToVideo'),
    'image-to-video': t('row.mediaTagImageToVideo'),
  }
  const activeMedia = mediaByRegion[activeRegion]
  /**
   * The per-mode video-model picker.
   *
   * Hidden unless the video tool is actually authorized on this tab
   * (`activeRegionOn && videoToolOn`): a pin only ever reaches the tool when that
   * region registers it, so showing the choice elsewhere would invite a decision
   * that changes nothing.
   *
   * One row per VIDEO tag, and only for tags this region's catalog still serves
   * — the tool cannot use a pin for a group that has no models. The "default"
   * row is not decoration: it is the only way back to "take the group's first
   * model", and clearing the pin DELETES the key rather than storing an empty
   * string (see `nextRegionPreferredVideoModels`).
   *
   * A pinned id the catalog no longer carries renders the "default" row too:
   * that is exactly what the tool does with it (falls back rather than failing),
   * so showing it honestly beats a select box displaying an option it does not
   * itself offer.
   */
  const videoModelTags = ['text-to-video', 'image-to-video'] as const
  const videoModelPreference = !(activeRegionOn && videoToolOn(activeRegion)) || activeMedia === undefined
    ? null
    : (
      <div className="dsm-workbuddy-pref dsm-workbuddy-media">
        <span className="dsm-workbuddy-pref-copy">
          <span className="dsm-workbuddy-pref-label">{t('row.videoModelLabel')}</span>
          <span className="dsm-workbuddy-pref-hint">{t('row.videoModelHint')}</span>
          {videoModelTags.map(tag => {
            const group = activeMedia.filter(model => model.tags.includes(tag))
            if (group.length === 0) return null
            const pinned = preferredVideoModelOf(activeRegion, tag)
            return (
              <label key={tag} className="dsm-workbuddy-media-row">
                <span className="dsm-workbuddy-media-tag">{mediaTagLabels[tag] ?? tag}</span>
                <select
                  className="dsm-workbuddy-video-model-select"
                  value={group.some(model => model.id === pinned) ? pinned : ''}
                  disabled={!canWrite || saving || poolBusy || pinningVideoModel !== undefined}
                  onChange={(event: { target: { value: string } }) => {
                    const next = event.target.value
                    void pinVideoModel(activeRegion, tag, next === '' ? undefined : next)
                  }}
                >
                  <option value="">{t('row.videoModelDefault')}</option>
                  {group.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </label>
            )
          })}
        </span>
      </div>
    )
  const mediaModelsPreference = (
    <div className="dsm-workbuddy-pref dsm-workbuddy-media">
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-lead">
          <span className="dsm-workbuddy-pref-label">{t('row.mediaModelsLabel')}</span>
          {/* Not `dsm-workbuddy-pref-indent`: that class belongs to the credit
              position picker and the suite resolves it with querySelector,
              which must keep landing on the picker. The roster is a block of
              its own anyway — it has a lead row, a hint and a list — so it is
              aligned by its own style rule instead of borrowing the picker's. */}
          <button
            type="button"
            className="dsm-btn dsm-btn-outline"
            disabled={mediaBusy || !activeRegionOn}
            onClick={() => {
              setMediaBusy(true)
              void loadMediaModels(activeRegion, true).finally(() => {
                if (mounted.current) setMediaBusy(false)
              })
            }}
          >
            {mediaBusy ? t('row.mediaModelsRefreshing') : t('row.mediaModelsRefresh')}
          </button>
        </span>
        <span className="dsm-workbuddy-pref-hint">{t('row.mediaModelsHint')}</span>
        {mediaError !== undefined
          ? <span className="dsm-workbuddy-media-error">{t('row.mediaModelsError', { message: mediaError })}</span>
          : activeMedia === undefined
            ? null
            : activeMedia.length === 0
              ? <span className="dsm-workbuddy-media-empty">{t('row.mediaModelsEmpty')}</span>
              : <ul className="dsm-workbuddy-media-list">
                  {activeMedia.map(model => (
                    <li key={model.id} className="dsm-workbuddy-media-row">
                      <span className="dsm-workbuddy-media-name">{model.name}</span>
                      <span className="dsm-workbuddy-media-id">{model.id}</span>
                      <span className="dsm-workbuddy-media-tags">
                        {model.tags.map(tag => (
                          <span key={tag} className="dsm-workbuddy-media-tag">
                            {mediaTagLabels[tag] ?? tag}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>}
      </span>
    </div>
  )

  /**
   * The CLI-route switch.
   *
   * GLOBAL, so it is not gated on the active tab's provider being on — the route
   * pulls its credential from whichever region still has a signed-in account.
   * Its own class (not `.dsm-workbuddy-pref-check`) for the same reason the image
   * box has one: the credit-switch suite's "exactly one switch" selector must
   * keep resolving to the credit box alone.
   */
  const cliBridgePreference = (
    <label className="dsm-workbuddy-pref" title={t('row.cliBridgeHint')}>
      <input
        type="checkbox"
        className="dsm-workbuddy-cli-bridge-check"
        checked={cliBridgeSwitchedOn()}
        disabled={!canWrite || saving || poolBusy || cliBridgeBusy}
        onChange={(event: { target: { checked: boolean } }) => {
          void toggleCliBridge(event.target.checked)
        }}
      />
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-label">{t('row.cliBridgeLabel')}</span>
        <span className="dsm-workbuddy-pref-hint">{t('row.cliBridgeHint')}</span>
      </span>
    </label>
  )

  /**
   * The sidebar-row switch (PR #188).
   *
   * Its own class for the reason the CLI box has one: the credit-switch suite's
   * "exactly one switch" selector (`.dsm-workbuddy-pref-check`) must keep
   * resolving to the credit box alone.
   *
   * NOT gated on the active tab's provider: the row is a property of the whole
   * plugin, not of one region, and a signed-out card can still turn it on.
   */
  const sidebarPanelPreference = (
    <div className="dsm-workbuddy-prefs">
      <span className="dsm-workbuddy-pref-hint">{t('row.sidebarPanelLead')}</span>
      <label className="dsm-workbuddy-pref" title={t('row.sidebarPanelHint')}>
      <input
        type="checkbox"
        className="dsm-workbuddy-sidebar-panel-check"
        checked={sidebarPanelSwitchedOn()}
        disabled={!canWrite || saving || poolBusy || sidebarPanelBusy}
        onChange={(event: { target: { checked: boolean } }) => {
          void toggleSidebarPanel(event.target.checked)
        }}
      />
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-label">{t('row.sidebarPanelLabel')}</span>
        <span className="dsm-workbuddy-pref-hint">{t('row.sidebarPanelHint')}</span>
      </span>
      </label>
    </div>
  )

  /**
   * The two quick-adjust pins of the CLI route, rendered under its switch the
   * way the seat picker sits under its switch: indented, and only while the
   * switch is ON — the pickers configure the route the switch turned on, and
   * they disappear together with it.
   *
   * The model options are the active tab's LIVE catalog (`visibleModels`), so
   * they follow the upstream instead of a hardcoded list; a pinned value the
   * catalog does not list is still offered as its own option rather than
   * vanishing from the select. The effort options are the six CLI tiers,
   * narrowed to the pinned model's `reasoning.supportedEfforts` when that
   * model is in the catalog and names tiers the CLI knows.
   */
  const cliBridgeModelPinned = cliBridgeModelValue()
  const cliBridgeModelOptions = visibleModels.map(model => ({
    value: model.id,
    label: model.name !== model.id ? model.name : model.id,
  }))
  if (cliBridgeModelPinned !== '' && !cliBridgeModelOptions.some(option => option.value === cliBridgeModelPinned)) {
    cliBridgeModelOptions.push({ value: cliBridgeModelPinned, label: cliBridgeModelPinned })
  }

  const cliBridgeEffortPinned = cliBridgeEffortValue()
  const pinnedCliBridgeModel = visibleModels.find(model => model.id === cliBridgeModelPinned)
  const pinnedCliBridgeTiers = pinnedCliBridgeModel?.reasoning?.supportedEfforts
  const cliBridgeEffortLevels: string[] = ((): string[] => {
    if (pinnedCliBridgeTiers === undefined || pinnedCliBridgeTiers.length === 0) {
      return [...CLI_BRIDGE_EFFORT_LEVELS]
    }
    const known = CLI_BRIDGE_EFFORT_LEVELS.filter(level => (pinnedCliBridgeTiers as readonly string[]).includes(level))
    return known.length > 0 ? known : [...CLI_BRIDGE_EFFORT_LEVELS]
  })()
  if (cliBridgeEffortPinned !== '' && !cliBridgeEffortLevels.includes(cliBridgeEffortPinned)) {
    cliBridgeEffortLevels.push(cliBridgeEffortPinned)
  }

  const cliBridgeRegionOrderPinned = cliBridgeRegionOrderValue()
  const cliBridgeRegionOrderOptions: { value: string, label: string }[] = CLI_BRIDGE_REGION_ORDERS.map(order => ({
    value: order,
    label: order === 'cn,global'
      ? t('row.cliBridgeRegionOrderCnFirst')
      : order === 'global,cn'
        ? t('row.cliBridgeRegionOrderGlobalFirst')
        : order === 'cn'
          ? t('row.cliBridgeRegionOrderCnOnly')
          : t('row.cliBridgeRegionOrderGlobalOnly'),
  }))
  if (cliBridgeRegionOrderOptions.every(option => option.value !== cliBridgeRegionOrderPinned)) {
    cliBridgeRegionOrderOptions.push({ value: cliBridgeRegionOrderPinned, label: cliBridgeRegionOrderPinned })
  }

  const cliBridgePickers = (
    <div
      className="dsm-workbuddy-pref dsm-workbuddy-pref-indent"
      title={t('row.cliBridgePickersHint')}
    >
      <span className="dsm-workbuddy-pref-copy">
        <span className="dsm-workbuddy-pref-lead dsm-workbuddy-cli-bridge-pickers">
          <label className="dsm-workbuddy-cli-bridge-pick" title={t('row.cliBridgeModelHint')}>
            <span className="dsm-workbuddy-pref-label">{t('row.cliBridgeModelLabel')}</span>
            <select
              className="dsm-workbuddy-cli-bridge-select"
              value={cliBridgeModelPinned}
              disabled={!canWrite || saving || poolBusy || cliBridgeModelBusy || cliBridgeEffortBusy || cliBridgeRegionOrderBusy}
              aria-label={t('row.cliBridgeModelAria')}
              onChange={(event: { currentTarget: { value: string } }) => {
                void pickCliBridgeModel(event.currentTarget.value)
              }}
            >
              <option value="">{t('row.cliBridgeModelDefault')}</option>
              {cliBridgeModelOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="dsm-workbuddy-cli-bridge-pick" title={t('row.cliBridgeEffortHint')}>
            <span className="dsm-workbuddy-pref-label">{t('row.cliBridgeEffortLabel')}</span>
            <select
              className="dsm-workbuddy-cli-bridge-select"
              value={cliBridgeEffortPinned}
              disabled={!canWrite || saving || poolBusy || cliBridgeModelBusy || cliBridgeEffortBusy || cliBridgeRegionOrderBusy}
              aria-label={t('row.cliBridgeEffortAria')}
              onChange={(event: { currentTarget: { value: string } }) => {
                void pickCliBridgeEffort(event.currentTarget.value)
              }}
            >
              <option value="">{t('row.cliBridgeEffortDefault')}</option>
              {cliBridgeEffortLevels.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <label className="dsm-workbuddy-cli-bridge-pick" title={t('row.cliBridgeRegionOrderHint')}>
            <span className="dsm-workbuddy-pref-label">{t('row.cliBridgeRegionOrderLabel')}</span>
            <select
              className="dsm-workbuddy-cli-bridge-select"
              value={cliBridgeRegionOrderPinned}
              disabled={!canWrite || saving || poolBusy || cliBridgeModelBusy || cliBridgeEffortBusy || cliBridgeRegionOrderBusy}
              aria-label={t('row.cliBridgeRegionOrderAria')}
              onChange={(event: { currentTarget: { value: string } }) => {
                void pickCliBridgeRegionOrder(event.currentTarget.value)
              }}
            >
              {cliBridgeRegionOrderOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </span>
        <span className="dsm-workbuddy-pref-hint">{t('row.cliBridgePickersHint')}</span>
      </span>
    </div>
  )

  /**
   * The upstream-identity switches (issue #133 suggestions 2 and 3).
   *
   * These govern what the gateway SEES and how it files the call, not which
   * provider serves it, so they sit in their own group with their own heading
   * instead of the preference list below (which is all about the card's own
   * display choices). Every one of them was already settable by hand in
   * `cordis.patch.yml`; this is only a UI route to the same fields.
   *
   * ONE shared hint about reloading, not one per switch: all four are sampled
   * when the plugin mounts into the shim, so the rule and its reason are the
   * same sentence for each, and repeating it four times would bury it.
   */
  const upstreamSwitches = (
    <div className="dsm-workbuddy-prefs">
      <span className="dsm-workbuddy-pref-hint">{t('row.upstreamHint')}</span>
      {([
        ['usageIdentity', 'row.usageIdentityLabel', 'row.usageIdentityHint', usageIdentityValue(), usageIdentityBusy, setUsageIdentityOn],
        ['keepPromptLast', 'row.keepPromptLastLabel', 'row.keepPromptLastHint', keepPromptLastValue(), keepPromptLastBusy, setKeepPromptLastOn],
        ['sessionTitle', 'row.sessionTitleLabel', 'row.sessionTitleHint', sessionTitleValue().enabled, sessionTitleBusy, setSessionTitleOn],
      ] as const).map(([field, labelKey, hintKey, on, busy, setOwn]) => (
        <label key={field} className="dsm-workbuddy-pref dsm-workbuddy-upstream-pref" title={t(hintKey)}>
          {/* A DISTINCT class, not `dsm-workbuddy-pref-check`: the credit-switch
              suite (and the layout contract it pins) reads every
              `.dsm-workbuddy-pref-check` in the card as "the one per-region
              display switch", so sharing that class would make these appear to
              be four credit switches. They are not region-scoped display
              preferences; they change the request the whole plugin sends. */}
          <input
            type="checkbox"
            className="dsm-workbuddy-upstream-check"
            checked={on}
            disabled={!canWrite || saving || poolBusy || busy}
            onChange={(event: { target: { checked: boolean } }) => {
              void toggleUpstreamSwitch(field, event.target.checked)
            }}
          />
          <span className="dsm-workbuddy-pref-copy">
            <span className="dsm-workbuddy-pref-label">{t(labelKey)}</span>
            <span className="dsm-workbuddy-pref-hint">{t(hintKey)}</span>
            {/* `sessionTitle` is the only one with a second value; it is shown
                rather than edited because the id is already configurable in
                `sessionTitle.model` and a free-text field here would be a
                second, unvalidated way to break the one thing this switch
                depends on. */}
            {field === 'sessionTitle' && on
              ? <span className="dsm-workbuddy-pref-hint">{t('row.sessionTitleModel')} {sessionTitleValue().model}</span>
              : null}
            {/* `extraInjectedPrefixes` has no control here ON PURPOSE: it is a
                list of literal strings, and a checkbox-shaped UI for it would be
                a worse editor than the config file it already lives in. It is
                REPORTED while it matters (only `keepPromptLast` reads it), so a
                user who added prefixes by hand can see they are in effect rather
                than wondering whether the plugin noticed. */}
            {field === 'keepPromptLast' && on && extraInjectedPrefixes().length > 0
              ? <span className="dsm-workbuddy-pref-hint">{t('row.extraPrefixesCount')} {extraInjectedPrefixes().length}</span>
              : null}
          </span>
        </label>
      ))}
    </div>
  )

  /**
   * The opt-in auto-continue after a channel-gate refusal.
   *
   * Its own group, NOT a row in {@link upstreamSwitches} above, because it
   * breaks that group's one shared promise: those four are sampled when the
   * plugin mounts and need a reload, while this one is read on every failure and
   * takes effect immediately. Hiding that difference behind a shared hint would
   * teach the user the wrong rule for exactly the switch where being wrong is
   * expensive — this one spends real requests.
   *
   * The cap and the text are REPORTED while the switch is on, not edited: both
   * already live in the config file, and the cap is the one number the user asked
   * to be exactly 3, so an unvalidated free-text field here would be a second way
   * to get it wrong.
   */
  const channelRejectContinuePreference = (
    <div className="dsm-workbuddy-prefs">
      <span className="dsm-workbuddy-pref-hint">{t('row.channelRejectHint')}</span>
      <label
        className="dsm-workbuddy-pref dsm-workbuddy-upstream-pref"
        title={t('row.channelRejectContinueHint')}
      >
        {/* This input carries ONLY its own class, deliberately NOT
            `dsm-workbuddy-upstream-check`: that class is the contract the
            upstream-switch suite reads to enumerate "the switches that need a
            reload", and this one is not in that set. */}
        <input
          type="checkbox"
          className="dsm-workbuddy-channel-continue-check"
          checked={channelRejectContinueValue().enabled}
          disabled={!canWrite || saving || poolBusy || channelRejectContinueBusy}
          onChange={(event: { target: { checked: boolean } }) => {
            void toggleUpstreamSwitch('channelRejectContinue', event.target.checked)
          }}
        />
        <span className="dsm-workbuddy-pref-copy">
          <span className="dsm-workbuddy-pref-label">{t('row.channelRejectContinueLabel')}</span>
          <span className="dsm-workbuddy-pref-hint">{t('row.channelRejectContinueHint')}</span>
          {channelRejectContinueValue().enabled
            ? (
              <span className="dsm-workbuddy-pref-hint">
                {t('row.channelRejectContinueLimit')} {String(channelRejectContinueValue().maxConsecutive)}
                {' · '}
                {t('row.channelRejectContinueText')} {channelRejectContinueValue().text}
              </span>
            )
            : null}
        </span>
      </label>
    </div>
  )

return { cliBridgePreference, cliBridgePickers, imageToolPreference, videoToolPreference, videoModelPreference, mediaModelsPreference, upstreamSwitches, channelRejectContinuePreference, sidebarPanelPreference }
}
