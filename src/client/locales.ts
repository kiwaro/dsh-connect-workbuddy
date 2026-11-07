/**
 * Plugin-card copy registered under the settings.workbuddy locale namespace.
 *
 * 参考：dingminhua/dsh-connect-trae（MIT，Copyright (c) 2026 LaoDing）
 *   — `row.*` 的文案键约定与中英 1:1 键一一对应（`zh: Record<Key, string>`
 *     强制双语同步）来自该项目，其又继承自
 *     dingminhua/dsh-subagent-default-model（MIT）。
 * 改动：文案按 WorkBuddy 的实际情况改写（积分套餐、模型倍率、多账号）。
 *
 * @module dsh-connect-workbuddy/client/locales
 */

export const en = {
  'nav.panel': 'WorkBuddy',
  'row.iconStyleLabel': 'Icon style',
  'row.iconStyleHint': 'Updates the sidebar and page icons immediately. Saved separately for this plugin in this browser.',
  'row.iconStyleClaude': 'Claude style',
  'row.iconStyleOriginal': 'Default icon',
  'row.iconStyleSaveFailed': 'The browser could not save the icon preference. Please check site storage permissions.',
  'nav.back': 'Back to conversation',
  'row.title': 'WorkBuddy credits & models',
  "row.desc": "Use WorkBuddy domestic and global models in DSH. Manage accounts, select models, view credits and claim daily check-in rewards. Refreshing the model catalog also updates credit multipliers.",
  'row.expand': 'Expand',
  'row.collapse': 'Collapse',
  'row.tabCn': 'Domestic',
  'row.tabGlobal': 'Global',
  "row.tabHint": "Domestic and global versions can be enabled together. Use the version tabs above to view and manage each version's accounts, credits and models.",
  // A zero catalog multiplier does not imply unlimited requests. Historical
  // size and load refusals do not establish a universal quota mechanism.
  'row.tabFreeQuotaWarn': 'Free models can still encounter upstream request limits or busy responses.',
  'row.tabSwitchHint': 'Uncheck to switch this provider off. Its models disappear from the DSH model picker; your account, credits, and model settings are kept and return when you check it again.',
  'row.tabSwitchAria': 'Offer the {region} provider to DSH',
  'row.tabOffNotice': 'This provider is switched off: none of its models are offered to DSH. Your account, credits, and model settings are kept — check the box above the tab to bring it back.',
  'row.signedOutHint': "Sign in from this card, import an account, or sign in to the WorkBuddy desktop app and detect accounts again.",
  'row.signedOutWrongRegion': 'Your WorkBuddy sign-in was found, but it belongs to the other region tab. Switch tabs above to use it — there is nothing to sign in again.',
  'row.signedOutEncrypted': 'Your WorkBuddy sign-in is present, but its token fields are encrypted and the plugin could not read the key. Install the WorkBuddy desktop app, or set WORKBUDDY_APP_EXECUTABLE to its executable — signing in again will not change this.',
  'row.searchedTitle': 'Paths checked',
  'row.searchedHint': 'If your WorkBuddy keeps its login somewhere else, point the plugin at it with the WORKBUDDY_AUTH_FILE environment variable.',
  'row.reasonMissing': 'not found',
  'row.reasonUnreadable': 'unreadable',
  'row.reasonInvalid': 'no usable token',
  'row.reasonEncrypted': 'encrypted — needs the desktop app',
  'row.reasonWrongRegion': 'belongs to the other region',
  'row.sourceDesktop': 'desktop app',
  'row.sourceDsh': 'plugin copy',
  'row.searchedMore': 'Show the {count} path(s) that were not found',
  'row.reloginHint': 'If errors occur, sign back in to the WorkBuddy app.',
  // Shown when the Host reports that the hidden accounts could NOT be brought
  // back: on Windows a locked vault file can defeat both the unlink and the
  // rewrite. Says what happened and what to do, instead of leaving the user
  // with a rescan that looks like it worked.
  'row.rescanHidesKept': 'The accounts you removed are still hidden: the plugin could not update its own list file. On Windows this is usually a file lock — close antivirus or sync tools that may be holding files in the DSH profile, then try again.',
  'row.credentialRejectedTitle': 'WorkBuddy refused this account\'s token',
  'row.credentialRejectedIntro': 'The token for "{accountName}" is no longer accepted by the upstream, so credits and check-in are unavailable. Signing in again only helps if the problem is the token itself — here is what actually applies:',
  'row.credentialRejectedSwitch': 'Another sign-in on this machine answered the upstream: "{accountName}". Switching to it fixes this — no need to sign in again.',
  'row.credentialRejectedSwitchAction': 'Switch to "{accountName}"',
  'row.credentialRejectedRelogin': 'No other local sign-in exists to switch to. Sign in again in the WorkBuddy desktop app.',
  'row.credentialRejectedChoose': 'Other local sign-ins exist but none of them answered the upstream just now. Try switching to one above; if none works, sign in again in the desktop app.',
  'row.requestFailed': 'Request failed',
  // Shown when a REFRESH failed but the last good snapshot is still on
  // screen — distinct from `row.requestFailed`, which replaces the panel.
  'row.requestFailedHint': 'Refresh failed — showing the last loaded data: {message}',
  // Shown when NO document ever landed for the region, so there is nothing to
  // fall back to. Distinguishes a transient transport failure (recoverable,
  // hence the automatic retry and the button) from a refused request.
  'row.usageErrorHint': 'Could not read the account status: {message}. The local DSH service may have just restarted — retrying automatically.',
  'row.usageRetry': 'Retry',
  'row.poolErrUnavailable': 'The account pool is not available in this build (or its batch route is missing). Restart the app; if it persists, the plugin needs reinstalling.',
  'row.poolErrFailed': 'The batch failed on the host side: {message}',
  'row.poolErrHttp': 'The batch was refused (HTTP {status}). Check the plugin is up to date and try again.',
  'row.poolErrRouteMissing': 'The batch endpoint did not answer (HTTP {status}, no body) — the DSH Host is probably still running older plugin code, so this route is not registered. Quit DSH completely and start it again, then retry.',
  'row.poolErrNoMembers': "No accounts are selected for this pool. Select accounts below and save.",
  'row.poolErrNoLiveMembers': 'Every account checked into this pool has lost its local sign-in, so the batch had nothing to run. Sign in again in the WorkBuddy desktop app, or save to drop them.',
  'row.poolErrNoFreeModel': "No free model is available in this region. Refresh the catalog or select a test model manually before retrying.",
  'row.poolErrNoCheckin': 'This region has no daily check-in — the action is not offered here.',
  'row.poolErrStaleModel': 'The target model is no longer offered by this region. Pick another, or switch back to automatic.',
  'row.creditsError': 'Credit query unavailable: {message}',
  'row.refresh': 'Refresh',
  'row.refreshing': 'Refreshing…',
  'row.accountUnnamed': 'Unnamed account',
  'row.accountsHint': 'Choose from locally detected sign-ins. Tokens are never shown or saved in DSH settings.',
  'row.accountsRescan': 'Detect accounts again',
  'row.accountsScanning': 'Detecting…',
  // Shown while the FIRST paint is in flight (issue #77). It replaces the
  // signed-out guidance, which used to render here and told signed-in users
  // they were not signed in for as long as the usage route took.
  'row.accountsLoading': 'Loading your accounts…',
  'row.accountsWriteFailed': 'The account change was not saved: {message} — the active profile\'s configuration file could not be updated (on Windows it may be locked by an antivirus scanner or a sync client). Your previous choice is still in effect; close whatever holds that file and try again (see docs/WINDOWS.md in the plugin repo for the exact path).',
  'row.selectionLostHint': 'The saved account no longer exists locally.',
  'row.selectionLostMessage': 'The account saved for this region is no longer among the local sign-ins (WorkBuddy replaced its login or cleaned up backups). Your other sign-ins are fine — pick a current one from the list above. Signing in again in the desktop app will not fix this.',
  'row.vaultUnreadableHint': 'The credential vault directory could not be read ({message}). This is usually a permissions problem, not a lost account: the saved accounts are still on disk. Run as administrator: takeown /F "<vault dir>" /R /D Y && icacls "<vault dir>" /reset /T, then restart DSH. The directory path is documented in docs/WINDOWS.md of the plugin repo.',
  // The card's three sections. The card is 3,500 px tall in one column, and the
  // two jobs on it are unrelated: operating an account (who serves, how much is
  // left, which order) and editing the catalog (which models, what context
  // budget, which reasoning tiers). Their COMMIT semantics even differ — an
  // account change lands on the click, a catalog change is a draft until saved —
  // so a single column puts the save button three screens from the thing it
  // saves.
  'row.panelAccounts': 'Accounts',
  'row.panelModels': 'Models',
  // Its own section because these switches GRANT capabilities (spend, tool
  // registration) rather than pick an account, and because every one of them is
  // due sub-options that a flat list under the tab bar had no room for.
  'row.panelCapabilities': 'Capabilities',
  "row.panelCapabilitiesHint": "Feature switches take effect immediately.",
  'row.panelDiag': 'Diagnostics',
  'row.panelAria': 'Card sections',
  'row.diagHint': 'What this card actually read, so a report can quote it. Nothing here changes a setting.',
  'row.diagRegion': 'Region',
  'row.diagDomain': 'Upstream domain',
  'row.diagAccount': 'Serving account',
  'row.diagToken': 'Sign-in expires',
  'row.diagCatalog': 'Models in the catalog',
  'row.diagEnabled': 'Enabled models',
  'row.diagPool': 'Account pool',
  'row.diagPoolOn': 'on · {count} accounts',
  'row.diagPoolOff': 'off',
  'row.diagFailures': 'Last failure',
  'row.diagNoFailures': 'Nothing reported.',
  // Issue #139. The upstream published daily hours for a promotion that this
  // plugin could not read, so the badge and the discounted price are hidden.
  // Saying so is the whole point: the alternative is a badge that silently
  // stops appearing, which reads as "the promotion ended" and is wrong.
  'row.diagPromoUnreadable': '{count} promotion hour(s) unreadable — badge hidden',
  // Issue #139. The host's own slot boundary draws an EMPTY div on a render
  // throw, which reads as "the plugin is not installed". This face says what
  // actually happened, so the next report can quote it.
  'row.cardCrashed': 'The configuration area failed to render.',
  'row.cardCrashedHint': 'The model provider itself is unaffected — chat and credits keep working. Quote the line above in a bug report.',
  'row.modelsTitle': 'Models',
  'row.modelsSummary': '{count} enabled',
  // Shown in the section header while the list is COLLAPSED. The save/discard
  // buttons live inside the fold, so without this a user could hide their own
  // unsaved edits behind it with nothing on screen saying so.
  'row.modelsDirty': 'unsaved changes',
  // The faint hint in the header's middle. It names the ACTION available right
  // now, so it reads as an instruction rather than as a label for the section —
  // a static "expand or collapse" would make the reader work out which applies.
  'row.modelsRefresh': 'Refresh from WorkBuddy',
  'row.modelsRefreshing': 'Refreshing models…',
  'row.discard': 'Discard changes',
  'row.save': 'Save',
  'row.saving': 'Saving…',
  'row.saveError': 'Save failed: {message}',
  'row.saveContentionHint': ' (The file was locked, so the write was refused — on Windows this is usually an antivirus scanner, a sync client such as OneDrive, or an editor with that file open. Close whatever holds it and save again; your edits are still here.)',
  'row.modelContext': 'Maximum context {context}',
  'row.contextBudget': 'DSH context budget',
  'row.modelOutput': 'Output {output}',
  'row.modelRate': '{rate}x credits',
  'row.modelMultimodal': 'Multimodal',
  'row.modelImage': 'Image',
  'row.modelImageText': 'Image input: the vendor documents this model as text-only, so a refresh leaves it unchecked. Tick it yourself only if you know it reads images.',
  'row.modelImageUnverified': 'Image input unverified: no vendor source confirms this model reads images, so a refresh leaves it unchecked rather than guessing. Tick it yourself if you have verified it works.',
  'row.modelOff': 'Can disable',
  'row.modelOffHint': 'Offer the “off” level for this model',
  'row.modelOffRefused': 'refuses off',
  'row.modelOffRefusedHint': 'Measured to reject the “off” level with HTTP 400 (code 11133) on both gateways. With this ticked, every request that carries no reasoning tier — compaction summaries above all — would fail, so it cannot be enabled here.',
  'row.modelEffortLabel': 'Default reasoning',
  'row.modelEffortAria': 'Default reasoning level for {model}',
  'row.modelEffortHint': 'The reasoning level this model uses when a request names none — new conversations, compaction summaries and session titles. Only the levels WorkBuddy itself declares for this model are offered; “Default (x)” names the level that will actually be used: your pick if you made one, otherwise the level WorkBuddy declares for this model, otherwise that model’s own middle tier (never its weakest one).',
  'row.modelEffortFollow': 'Default',
  'row.modelEffortFollowNamed': 'Default ({effort})',
  'row.modelUnknown': 'Unknown',
  'row.modelCapabilityPending': 'Only capabilities advertised by WorkBuddy are shown.',
  // The two one-click sweeps (issue #61 follow-up, mirroring the sibling `trae`
  // plugin). Cost is stated in the HINT rather than a confirm dialog, per the
  // maintainer's choice: the "all" run covers models the user did not enable, so
  // it spends more than the enabled-only run.
  'row.modelsTestEnabled': 'Test enabled models',
  'row.modelsTestAll': 'Test all models',
  'row.modelsTesting': 'Testing {done}/{total}…',
  'row.modelsTestEnabledHint': "Tests each enabled model once. Cost depends on the model rate and input size, which defaults to 25,000 tokens. Results appear as requests finish. Testing stops if the credential is rejected.",
  'row.modelsTestAllHint': "Tests every model in this region, including disabled models. Each request is billed at that model's rate and input size. Testing stops if the credential is rejected.",
  'row.tpsSweepEnabled': 'Measure speed (enabled)',
  'row.tpsSweepAll': 'Measure speed (all)',
  'row.tpsSweepEnabledHint': "Measures each enabled model three times and reports the median output speed. Each request allows up to 256 output tokens and is billed at the model's rate.",
  'row.tpsTesting': 'Measuring {done}/{total}…',
  'row.tpsMeasure': 'Speed',
  'row.tpsMeasuring': 'Measuring…',
  'row.tpsHint': "Measures output speed with three requests and reports the median. Each request allows up to 256 output tokens and is billed at the model's rate. The result includes its measurement time.",
  'row.tpsValue': '{tps} tok/s',
  'row.tpsValueTtft': '{tps} tok/s · first token {ttft}s',
  'row.tpsPartial': '{tps} tok/s ({samples} runs)',
  'row.tpsNoSample': 'Could not time this model (too few stream chunks)',
  'row.tpsNoUsage': 'Could not time this model (upstream reported no token count)',
  'row.tpsAllFailed': 'Speed measurement failed',
  'row.tpsCredit': 'cost {credit} credit',
  'row.tpsMeasuredAt': 'measured {at}',
  'row.modelsTestDone': 'Done: {available} of {total} available',
  'row.modelsTestAuth': "Testing stopped because the credential was rejected. Sign in again before retrying.",
  'row.probe': 'Test',
  'row.probing': 'Testing…',
  'row.probeHint': "Sends about 25,000 input tokens to check whether the model responds. Cost depends on the model rate and input size. A successful short request does not guarantee that a longer request will be accepted.",
  'row.probeOk': '✓ Usable',
  'row.probeOkMs': '✓ Usable ({ms})',
  'row.probeRateLimitedUnknown': '✗ Rate limited · the upstream gave no time for when it frees up',
  'row.probeRateLimitedAt': "✗ Rate limited. Retry after {at}.",
  'row.probeModelBusyUnknown': "✗ Model busy. Retry in about two minutes or select another model.",
  'row.probeModelBusyAt': '✗ This model is loaded right now · not your account; retry after {at}, or switch models',
  'row.probeOutOfCreditUnknown': '✗ Not enough credits · the upstream gave no time for when it frees up',
  'row.probeOutOfCreditAt': '✗ Not enough credits · quota refreshes {at}',
  'row.probeCredentialRejected': "✗ Sign-in rejected. Sign in again or select another account.",
  'row.probePolicyRejected': "✗ The server rejected the request under its policy. Check the cause in the WorkBuddy desktop app.",
  'row.probeChannelRejected': "✗ The request triggered the gateway's client check. Inspect third-party client identifiers in system or assistant messages.",
  // Short form for the composer panel's one-line mark (issue #108); see the
  // Chinese entry for why the long label cannot live there.
  'row.probeChannelRejectedShort': '✗ Gateway refused the prompt',
  'row.probeNotFound': '✗ The upstream does not know this model',
  'row.probeUnavailable': '✗ The upstream could not be reached — no usable answer came back',
  'row.probeFailed': '✗ Test failed',
  'row.probeFailedStatus': '✗ Test failed (HTTP {status})',
  'row.probeError': 'Could not run the test: {message}',
  'row.cheer': 'Star on GitHub',

  // ---- OAuth sign-in (QR on CN, web page on the international build) ----
  'row.oauthTitle': 'Add an account by QR sign-in',
  'row.oauthStart': 'Sign in with QR code',
  'row.oauthStarting': 'Opening…',
  // The dialog opens the authorization page in the browser automatically
  // (placeholder-window-in-gesture); the copy/reopen buttons are the fallback
  // when that open is blocked.
  'row.oauthOpenHint': 'Open the sign-in page and confirm — the account is added here automatically when you finish:',
  'row.oauthOpened': 'Opened. Waiting for you to finish…',
  'row.oauthWaiting': 'Waiting for the sign-in to finish… ({seconds}s)',
  'row.oauthExpires': 'The sign-in window expires in about {minutes} min.',
  'row.oauthCancel': 'Cancel',
  'row.oauthCancelled': 'Sign-in cancelled.',
  'row.oauthTimedOut': 'The sign-in timed out — start again when ready.',
  'row.oauthDone': 'Added “{accountName}”. Pick it above to use it.',
  'row.oauthError': 'Sign-in failed: {message}',
  'row.oauthCopy': 'Copy link',
  'row.oauthCopied': 'Link copied',
  'row.oauthReopen': 'Open page again',
  'row.oauthDialogClose': 'Close',
  // The INTERNATIONAL sign-in is a browser page, not a QR code — the CN build
  // scans with the WorkBuddy app. Only the three strings that NAME the method
  // are split; every other line (waiting, cancel, done) is method-agnostic and
  // stays shared, so the two regions cannot drift apart on the rest.
  'row.oauthTitleGlobal': 'Add an account by web sign-in',
  'row.oauthStartGlobal': 'Sign in on the web',
  // ---- Shared busy veil ----
  // The line under a veil's scenario text: why the row under it has not moved
  // yet. Same words for every operation, because the wait is the same wait.
  'row.veilHintList': 'The list refreshes as soon as this finishes.',
  'row.oauthSyncing': 'Adding the account…',
  'row.transferTitle': 'Export / import accounts',
  'row.transferHint': 'Move accounts between computers as a JSON file. The file carries the credentials — keep it private. The format is shared with other WorkBuddy credential managers.',
  'row.transferExport': 'Export accounts',
  'row.transferExporting': 'Exporting…',
  'row.transferExportPick': 'Choose the accounts to export ({total} available):',
  'row.transferExportConfirm': 'Export {count} account(s)',
  'row.transferExported': 'Exported {count} account(s) to {fileName}.',
  'row.transferImport': 'Import accounts',
  'row.transferImporting': 'Importing…',
  // Shown while the picked file is being parsed. The picker itself is the OS
  // dialog (the import button opens it directly), so this is the first line the
  // user sees after choosing — it must say what is happening, not ask again.
  'row.transferPreviewing': 'Reading the file…',
  'row.transferPreviewTotal': '{total} account(s) in the file — untick what should stay out. Accounts already stored here are overwritten by the import.',
  'row.transferImportConfirm': 'Import {count} account(s)',
  'row.transferImported': 'Imported {imported} account(s); {skipped} skipped (no token, or belongs to the other region).',
  'row.transferEntryUnknown': 'unknown account',
  'row.transferNoToken': 'no token in this record',
  'row.transferCancel': 'Cancel',
  'row.transferError': 'Transfer failed: {message}',

  // ---- Account pool ----
  'row.poolTitle': 'Account pool',
  'row.poolNoCandidate': 'No account in this pool can be used right now.',
  'row.poolNoCandidateHint': 'Members are rate-limited, out of credits, rejected, or unreachable. Rate limits, drained quotas and transient failures return to the pool on their own — at the time the upstream states, or after a 30-minute fallback. Only a rejected credential needs a new sign-in.',
  // The POOL-level verdict for "every member is blocked by the SAME model"
  // (issue #64). Distinct from `poolNoCandidate` above, which blames the
  // ACCOUNTS; here the accounts are fine and the model is the wall. Without this
  // the card's own per-row labels ("model busy") add up to a claim that is
  // false in aggregate, and the user goes looking for a bad account — the exact
  // hunt issue #56 reported.
  'row.poolModelWideBusy': 'Every member is blocked on the same model — this is the model, not your accounts.',
  'row.poolModelWideBusyHint': 'The response indicates a model-level limit. Retry after the local two-minute wait or choose a less busy model; the wait does not guarantee recovery.',
  // "Selected", not "all": the batch walks the CHECKED members only. The old
  // label said "all accounts" while the disable gate was "nothing checked", so
  // the button named a set it would never touch — unchecked rows are right there
  // in the table, which is exactly what makes "all" read as "every account I
  // have" rather than "every account in the pool".
  'row.poolCheckinAll': 'Check in selected',
  'row.poolCheckingIn': 'Checking in…',
  'row.poolTestAll': 'Test selected',
  'row.poolTesting': 'Testing…',
  'row.poolBusyHint': 'Running one account at a time…',
  'row.poolTargetAuto': 'Auto',
  'row.poolTargetStaleShort': 'target model unavailable',
  'row.poolTargetNoneShort': 'no free model',
  'row.poolTargetFree': 'Auto-picked free model: {model}',
  'row.poolTargetPreferred': 'Your chosen model: {model}',
  'row.poolTargetCurrentPreferred': 'Current: {model} (your choice).',
  'row.poolTargetCurrentFree': 'Current: {model} (auto-picked free model).',
  'row.poolTargetNone': 'This region has no zero-multiplier model yet.',
  'row.poolTargetStale': 'The target model you saved is no longer offered: {model}',
  'row.poolTargetStaleHint': 'The saved model has left this region\'s catalog. Choose another model or automatic selection before a manual test. Scheduled tests may use another zero-rate catalog model.',
  'row.poolTargetStaleClear': 'Switch back to automatic',
  'row.poolTargetStaleOption': '{model} (no longer offered)',
  'row.poolTargetNoneHint': "Automatic selection uses free models only. Refresh the catalog or select a test model manually. Paid models spend the tested account's credits.",
  'row.poolColumnAccount': 'Account',
  'row.poolColumnCredits': 'Credits',
  'row.poolColumnProbe': 'Status',
  'row.poolColumnCheckin': 'Check-in',
  'row.poolNeverTested': 'Untested',
  'row.poolTestedAt': 'Tested {at}',
  'row.poolCheckedIn': 'Checked in',
  'row.poolNotCheckedIn': 'Not checked in',
  'row.poolCheckinUnknown': '—',
  'row.probeAccountRestricted': 'Account restricted upstream',
  'row.poolCheckinEnterprise': 'N/A (enterprise)',
  'row.poolBenefitClaimable': '{title}: {count} credits',
  'row.poolBenefitUrgent': '{title}: {count} credits · {days}d left',
  'row.poolBenefitDueToday': '{title}: {count} credits · last day',
  'row.poolBenefitClaim': 'Claim',
  'row.poolBenefitClaiming': 'Claiming…',
  'row.poolBenefitClaimAria': 'Claim {title} ({count} credits) for this account',
  'row.poolLogBenefitClaimed': '{accountName} claimed {title}: {count} credits',
  'row.poolLogBenefitFailed': '{accountName} claim failed: {message}',
  'row.poolBenefitHint': 'Claim it on the plans page: {url}',
  'row.poolCreditSoon': '{count} expiring within 3 days',
  'row.poolCreditNearest': 'Nearest package expires {at}',
  'row.poolExcludedRateLimited': 'Rate limited',
  'row.poolExcludedModelBusy': 'Model busy',
  'row.poolExcludedOutOfCredit': 'Out of credits',
  'row.poolExcludedRejected': 'Rejected',
  'row.poolExcludedAccountRestricted': 'Account restricted upstream',
  'row.poolReserved': 'Reserved',
  'row.poolExcludedUnusable': 'Unusable',
  'row.poolRetryAt': 'Retry after {at}',
  // Approximate wait until the recorded retry time, which may be supplied
  // by upstream or calculated locally. It does not promise recovery.
  'row.remainingImminent': 'any moment now',
  'row.remainingMinutes': 'in about {count} min',
  'row.remainingHours': 'in about {count} h',
  'row.remainingDays': 'in about {count} d',
  // The same duration WITH its verb (`recoversInText`). On an account row the
  // bare "in about 2 h" states how long but not what happens then, which is the
  // one thing the row exists to answer.
  'row.recoversImminent': 'retry available shortly',
  'row.recoversMinutes': 'retry in about {count} min',
  'row.recoversHours': 'retry in about {count} h',
  'row.recoversDays': 'retry in about {count} d',
  // How stale a measurement is, and which writer produced it. Two sites write
  // the same account's record and overwrite each other, so without these the
  // table cannot explain a change the user just watched happen.
  'row.poolProbeJustNow': 'just now',
  'row.poolProbeMinutesAgo': '{count} min ago',
  'row.poolProbeHoursAgo': '{count} h ago',
  'row.poolProbeDaysAgo': '{count} d ago',
  'row.poolProbeSourceTest': 'tested',
  'row.poolProbeSourceLive': 'hit by a live request',
  'row.poolProbeSourceUnknown': 'source unknown',
  // WHICH model a verdict is about (issue #61). 6004 is an account × model
  // condition, so a bare "available" was readable as account-level truth while
  // the model the user actually chats with was the one being refused.
  'row.poolProbeModel': 'model {model}',
  'row.poolProbeModelUnknown': 'model not recorded',
  'row.poolSettingsTitle': 'More settings',
  'row.poolSettingsHint': 'These are preferences: they take effect when you save (same as the model list). Test results are written automatically and are not affected by this button.',
  'row.poolEnabled': 'Enable the account pool',
  'row.poolEnabledHint': 'On: the pool picks the account for every request, and only a failover-worthy failure moves to the next account — a malformed request, a busy model, a platform queue, or a channel-gate refusal does not (switching accounts would only burn quota for the same refusal). Off: the account you select serves every request, and a failure is reported as it is.',
  'row.poolModeAuto': 'picking automatically',
  'row.poolModeManual': 'you pick',
  'row.poolManualAccountLabel': 'Account in use',
  'row.poolManualAccountNone': 'No account in effect',
  'row.poolTargetLabel': 'Account test model',
  'row.poolTargetHint': "Batch tests use this model. Auto selects this region's free model with the largest context window. Selecting a paid model spends credits from every account tested.",
  'row.poolTargetAutoOption': "Auto-select a free model",
  'row.poolProbeSizeLabel': 'Test request size',
  'row.poolProbeSizeHint': 'How much text a test sends. The upstream refuses a request once it grows past roughly 20K–30K tokens, so a test smaller than your real conversations answers "usable" for an account that would refuse them. Bigger tests are more truthful but cost more credit each.',
  'row.poolProbeSizeDefault': 'Default (25K)',
  'row.poolProbeSizeOption': '{tokens}K tokens',
  'row.poolSaved': 'Save',
  'row.poolSaving': 'Saving…',
  'row.poolSaveFailed': 'Could not save: {message}',
  'row.poolSavedStaleRefresh': 'Saved, but the panel could not re-read it. The value is stored; the next refresh will show it.',
  'row.poolDiscard': 'Discard changes',
  'row.poolDirty': '● Unsaved changes',
  // The automatic daily check-in (issue #191). OFF by default, and the label
  // says what it DOES rather than naming the feature: "automatic check-in" alone
  // does not tell a user that a background job will write to their account.
  'row.poolAutoCheckin': 'Check in automatically each day',
  "row.poolAutoCheckinHint": "Enable and save to claim daily rewards for selected domestic personal accounts while DSH is running. After a restart, the plugin checks today's progress before processing remaining accounts. Failed attempts retry automatically.",
  'row.poolAutoCheckinToday': 'Today: {done} of {total} checked in',
  'row.poolAutoCheckinDone': 'Today: all {total} checked in',
  'row.poolAutoCheckinPending': '{count} still to retry',
  'row.poolAutoCheckinFailed': 'Last attempt failed: {message}',
  'row.poolManualUnlock': 'Turn off rotation',
  'row.poolLogTitle': 'Activity',
  'row.poolLogClear': 'Clear',
  'row.poolLogEmpty': 'Nothing yet. Check-ins, tests, and account switches are recorded here.',
  'row.poolLogCheckinStart': 'Checking in {count} account(s), one at a time',
  'row.poolLogCheckinClaimed': '{accountName}: checked in (+{credit})',
  'row.poolLogCheckinAlready': '{accountName}: already checked in today — skipped',
  'row.poolLogCheckinSkipped': '{accountName}: enterprise account, no daily check-in',
  'row.poolLogCheckinFailed': '{accountName}: check-in failed — {message}',
  'row.poolLogCheckinDone': 'Check-in finished',
  'row.poolLogBatchFailed': 'Batch failed — nothing ran: {message}',
  'row.poolLogTestStart': 'Testing {count} account(s) against {model}',
  'row.poolLogTestRow': '{accountName}: {outcome}',
  'row.poolLogTestDone': 'Test finished; the pool was re-ranked',
  'row.poolLogTestRowMalformed': '{accountName}: the host returned no result for this account',
  'row.poolRegionNote': 'The domestic and international pools are fully independent: accounts, switches, intervals, and target models never affect each other.',
  'row.poolMembersTitle': 'Accounts in this pool',
  "row.poolMembersHint": "Select the accounts to add to the pool below, then click Save.",
  'row.poolSelectAll': 'Select all',
  'row.poolSelectNone': 'Clear all',
  'row.poolSelectedCount': '{count} of {total} selected',
  // The ordering rule, spelled out where the arrows are used. This is the ONE
  // place the full priority order is written down for a reader; `rankPool`'s
  // doc comment is the source of truth for the code, and the numbered list
  // below must stay in the same order as that comparator.
  'row.poolOrderRulesTitle': 'How this pool chooses an account',
  'row.poolOrderRulesIntro': 'The pool always picks the first account that can actually be billed right now. The rules below are checked in order — the first one that separates two accounts decides; later rules only break ties.',
  'row.poolOrderRuleUsable': '1. Can it be billed right now? Accounts that are rate-limited, out of credit, credential-rejected, or failing are moved to the back until their cooldown ends. This outranks everything, including your own order below.',
  'row.poolOrderRuleExpiring': '2. Does it have credits expiring within 3 days? Yes goes first. This also outranks your manual order — see the note below.',
  'row.poolOrderRuleManual': '3. Your manual order. The position you set with the ↑ / ↓ arrows. Accounts you never ordered are placed after every ordered one.',
  'row.poolOrderRuleNearestExpiry': '4. Which expiry comes first? Between accounts that both have credits expiring, the one losing them sooner goes first.',
  'row.poolOrderRuleExpiringAmount': '5. How many are expiring? Between those same accounts, the one with more at stake goes first. With nothing expiring this is equivalent to comparing totals.',
  'row.poolOrderRuleTotal': '6. Total credits. The account holding more goes first, so a nearly-drained account is kept in reserve.',
  'row.poolOrderRuleFreshness': '7. Freshness of the sign-in. The more recently issued credential wins a draw.',
  'row.poolOrderRuleId': '8. Account id. A final tie-break, so the same pool always produces the same order.',
  'row.poolOrderWhy': 'Why expiring credits outrank your manual order: expiring credits are money about to disappear, while a manual order may be stale or set by accident. If the manual order won, one mis-drag could let credits lapse unused. So an account with credits expiring within 3 days always goes ahead of one without, even if you dragged it to the bottom.',
  'row.poolOrderBadgeNote': 'The badge shows the position you SAVED, not the live ranking. An account can read "No. 2" while being benched for a rate limit — the number is your saved preference, and the pool skips accounts it cannot bill right now.',
  'row.poolOrderRulesToggle': 'Show the full ordering rule',
  'row.poolNoneSelected': 'No account is checked into this pool.',
  'row.poolNoneSelectedHint': "Select at least one account and save before checking in or testing.",
  'row.poolGhostMembers': '{count} pool member(s) are no longer signed in on this machine, so they are not counted and not used: {names}. Remove any you no longer need below.',
  'row.poolGhostRemove': 'Remove {account} from this pool',
  'row.poolGhostRemoveNamed': 'Remove {account} from this pool. This account is no longer signed in on this machine.',
  'row.poolGhostRemoveUnnamed': 'Remove {account} from this pool. No name was ever recorded for this account, so what you see is the start of its id.',
  'row.poolSelectAria': 'Include {accountName} in this region\'s account pool',
  'row.poolCurrentBadge': 'In use',
  'row.poolCurrentHeader': 'Billing now: {account}',
  'row.poolNotMember': 'Not in pool',
  'row.poolNotMemberHint': 'Not in the pool: rotation skips it, and batch check-in and test leave it alone.',
  'row.poolServingOutside': '“{account}” is serving right now but is not in this pool: rotation will not pick it, and batch check-in and test will not touch it.',
  'row.poolUnsavedMembers': 'Selection changed — save to apply',
  // Manual priority ordering: the rank badge and the ↑/↓ move arrows. The badge
  // is non-interactive (it describes the current order), the arrows act on it.
  'row.poolRankLabel': 'No. {rank}',
  // Deliberately no interpolated ordinal suffix. "{rank}st" is correct for 1
  // but produces "2st" / "3st" for the ranks the badge actually shows, and an
  // English ordinal needs a suffix helper the locale table does not have. This
  // wording reads correctly for every rank and matches the badge's "No. N".
  'row.poolRankManualTitle': 'You placed this account at position {rank} in the pool manually.',
  'row.poolRankAuto': 'Auto',
  'row.poolRankAutoTitle': 'Not manually sorted yet: the pool spends expiring credits first, then picks accounts by remaining balance. Use ↑/↓ to set your own order.',
  'row.poolMoveUpTitle': 'Move account up in this pool\'s order',
  'row.poolMoveDownTitle': 'Move account down in this pool\'s order',
  'row.poolMoveUpAria': 'Move {accountName} up in this pool\'s order',
  'row.poolMoveDownAria': 'Move {accountName} down in this pool\'s order',
  // Per-row actions: test ONE account, remove ONE account.
  'row.poolRowTest': 'Test',
  'row.poolRowRemove': 'Remove',
  'row.poolRowRemoveHint': 'Remove this account from the list. The WorkBuddy desktop app is not signed out — it keeps its own sign-in. Removing only hides the account here; 「Detect accounts again」 brings it back.',
  'row.poolRowRemoveAria': 'Remove the stored credential of {accountName}',
  'row.poolRowRemoved': '{accountName}: hidden from the list. 「Detect accounts again」 re-adds it; the desktop app stays signed in.',
  'row.poolRowRemoving': 'Removing the account…',
  'row.poolRowRemoveDesktopOnly': '{accountName}: hidden from the list — this account comes from the desktop app\'s own sign-in, which is left untouched. 「Detect accounts again」 re-adds it.',
  // Device-header tier and the per-account gear (虚拟值 / 真实值).
  //
  // The 「Real」 wording promises exactly what the tier does: one real device per
  // machine, shared by every account, signed by the SDK of the WorkBuddy desktop
  // app installed on this machine. The hint names
  // the consequence (the gear is off) rather than only the mechanism, because a
  // greyed-out gear with no sentence next to it reads as a broken control.
  'row.deviceModeTitle': 'Device identity',
  'row.deviceModeVirtual': 'Virtual',
  'row.deviceModeReal': 'Real',
  'row.deviceModeHintVirtual': 'Every account presents a virtual device id derived from this machine. Use the gear on a row to set one by hand.',
  'row.deviceModeHintReal': 'Every account presents this machine\'s real device, signed by the WorkBuddy desktop SDK installed here. The gear is off — one real machine cannot be given two different ids. If the SDK is unavailable, no device header is sent at all (see 「SDK」).',
  'row.deviceModeRealUnsupported': 'Not available on this platform: the desktop SDK cannot hand out a device token here — on macOS it blocks on the main dispatch queue, which a background process never drains. Switching to Real would only fall back to Virtual, so the option is disabled. See the SDK section for the current reading.',
  'row.deviceGearHint': 'Edit this account\'s device id (X-Machine-ID / X-Session-ID)',
  'row.deviceGearBlockedHint': 'Only available in the Virtual tier',
  'row.deviceGearAria': 'Edit device parameters for {accountName}',
  'row.deviceModeRealBlockedTitle': 'Switch to Virtual first',
  'row.deviceModeRealBlocked': 'In the Real tier every account shares one real device, so there is nothing per-account to set. Switch the device identity to 「Virtual」 and open the gear again.',
  'row.deviceDialogTitle': 'Device parameters · {accountName}',
  'row.deviceDialogIntro': 'These two values are the X-Machine-ID / X-Session-ID this account presents upstream. Leave a field empty to keep deriving it from this machine\'s salt — the value that will be sent is shown under the field.',
  'row.deviceMachineLabel': 'Machine ID (X-Machine-ID)',
  'row.deviceSessionLabel': 'Session ID (X-Session-ID)',
  'row.deviceFieldPlaceholder': 'Empty = derived automatically',
  'row.deviceDerivedNow': 'Derived now:',
  'row.deviceDerivedUnavailable': 'No derived value to show — this machine has no device salt yet, so no X-Machine-ID / X-Session-ID is sent.',
  'row.deviceDerivedNoUid': 'This account has no uid, so nothing can be derived for it — it sends no X-Machine-ID / X-Session-ID.',
  'row.deviceRandom': 'Randomize',
  'row.deviceRandomHint': 'Fills both with random 36-character ids',
  'row.deviceDialogP3': 'Real device token',
  'row.deviceDialogP3Hint': 'Signed by the Turing Shield SDK of the WorkBuddy desktop app installed here. The Real tier uses it for every account; it is not editable here — see the 「SDK」 section.',
  'row.deviceDialogCancel': 'Cancel',
  'row.deviceDialogSave': 'Save',
  'row.deviceDialogSaving': 'Saving…',
  'row.deviceInvalid': 'Needs 36 lowercase hex characters (0-9a-f)',
  // 「SDK」 — the real-device section. Its own tab because it is the only page
  // with actions the user performs while nothing is broken (verify the link,
  // look at the value), whereas Diagnostics is read-only by contract.
  'row.panelSdk': 'SDK',
  'sdk.hint': 'Shows device credentials obtained through the installed WorkBuddy desktop SDK. Real-device mode uses this credential for the configured accounts. Acquisition depends on the SDK master switch.',
  'sdk.loading': 'Asking the SDK…',
  'sdk.unavailable': 'This Host build has no SDK route — real device parameters are not available here. The Virtual tier still works.',
  'sdk.state': 'Connection',
  'sdk.statusReady': 'Working',
  'sdk.statusStale': 'Reachable, but the last fetch failed — serving the previous token',
  'sdk.statusNoToken': 'SDK loaded, no token yet — open 「Refresh」',
  'sdk.statusMissing': 'No installed WorkBuddy desktop SDK found on this machine',
  'sdk.statusUnsupported': 'The SDK refused this platform',
  'sdk.statusError': 'The SDK could not be loaded',
  'sdk.statusDisabled': 'Turned off in settings',
  'sdk.masterLabel': 'Use the real-device SDK',
  'sdk.masterHint': "Obtains device credentials through the WorkBuddy desktop app and refreshes them about every 10 minutes. Reload the plugin or restart DSH after changing this switch so acquisition uses the new setting.",
  'sdk.bundle': 'SDK',
  'sdk.runtime': 'Runtime',
  'sdk.fetched': 'Last fetched',
  'sdk.tier': 'Tier in use',
  'sdk.tierReal': 'Real — accounts send this token',
  'sdk.tierVirtual': 'Virtual — this token is not sent',
  'sdk.valueLabel': 'X-Device-Token',
  'sdk.noValue': 'No token available',
  'sdk.length': '{count} chars',
  'sdk.reveal': 'Show',
  'sdk.hide': 'Hide',
  'sdk.copy': 'Copy',
  'sdk.copied': 'Copied',
  'sdk.refresh': 'Fetch again',
  'sdk.refreshing': 'Fetching…',
  'sdk.never': 'Never',
  'sdk.unknown': 'Unknown',
  'sdk.ageJustNow': 'just now',
  'sdk.ageMinutes': '{count}m ago',
  'sdk.ageHours': '{count}h {rest}m ago',
  'sdk.dirLabel': 'SDK directory',
  'sdk.dirPlaceholder': 'Empty = find the installed desktop app automatically',
  'sdk.dirSave': 'Save',
  'sdk.dirSaving': 'Saving…',
  'sdk.dirSaved': 'Saved.',
  'sdk.dirClear': 'Clear',
  'sdk.dirHint': 'Point this at the desktop app\'s native/turing-sdk folder, not the folder holding WorkBuddy.exe. Saving re-probes immediately; a wrong path turns the state above into \"not found\" with that path shown, never a silent fall back to discovery. WORKBUDDY_TURING_SDK_DIR still wins.',
  'sdk.fallbackLabel': 'Fall back to the virtual device when no real one is available',
  'sdk.fallbackHint': "When desktop device credentials are unavailable, enable this option to use virtual device identifiers. When disabled, requests omit device identifiers.",
  // Image generation is an optional spending capability. Historical sample
  // charges do not set current prices; reported usage is not a reconciled bill.
  'row.upstreamHint': 'These change what the gateway sees, not which provider serves the call. All of them are sampled when the plugin mounts, so reload the plugin (or restart DSH) after changing one.',
  'row.usageIdentityLabel': 'Make the usage page record these calls like the official client',
  'row.usageIdentityHint': 'Uses 32-hex UUIDv7 conversation ids and adds X-Request-ID. X-IDE-* headers are controlled separately by the wire profile. Off by default; this setting does not change the User-Agent or request body.',
  'row.keepPromptLastLabel': 'Record what you actually typed, not the injected context',
  'row.keepPromptLastHint': 'Moves recognized runtime context above the real prompt and removes the prompt’s leading message marker for the usage-page record. Other message text is retained. Off by default because ordering and marker removal can affect the request.',
  'row.sessionTitleLabel': 'Send session titles to the lightweight model',
  'row.sessionTitleHint': 'The host fires one title request per new session and bills it at the main model rate. This re-points that one request at a hidden lightweight model. The request still happens either way. Off by default.',
  'row.sessionTitleModel': 'Target model:',
  'row.extraPrefixesCount': 'Custom injected prefixes in effect:',
  // The channel-gate auto-continue. The copy has to say three things at once —
  // what failure it reacts to, that it spends real requests, and that the cap
  // counts CONSECUTIVE sends — because the switch is off by default and the
  // user's only other source for any of it is the config file.
  'row.channelRejectContinueLabel': 'Resend 「继续」 after the gateway refuses the request',
  'row.channelRejectContinueHint': 'LAST RESORT, not a fix for 11128. When the gateway answers 400 with code 11128 (「被网关的渠道校验拦截」), the turn just fails: the plugin never retries it in place and never swaps accounts, because the gate matches the message contents and every account sends the same ones. Fixed system fingerprints are byte-identical every turn, so resending only pays for the same 400 again; since 5.13.1 `prepareChatBody` rewrites known phrases instead. The narrow case this can help is content that changes between turns. It sends the text below as a NEW turn and spends a real request each time. Stops after N CONSECUTIVE sends (default 1); one successful turn, or one message you type yourself, resets the count. Subagent sessions are never touched. Off by default. Takes effect immediately, no reload.',
  'row.channelRejectContinueLimit': 'Max consecutive sends:',
  'row.channelRejectContinueText': 'Text sent:',
  'row.cliBridgeLabel': 'Let the local CodeBuddy CLI do the work',
  'row.cliBridgeHint': 'Adds the codebuddy_ask tool and the /codebuddy command. Each call spends CodeBuddy quota. injectResult only affects /codebuddy — its result is injected back into the session, costing one DSH turn when the session is idle; tool calls never read it. Rate-limited: 6 turns per session per hour, 20 per process per hour, one turn at a time. Off by default.',
  'row.cnBaseLabel': 'CN gateway host',
  'row.cnBaseHint': 'Leave empty to use copilot.tencent.com. Set it only if your network resets that host by TLS SNI (connection fails in milliseconds while the WorkBuddy desktop app still works) — the app itself falls back to wb.tencentbuddy.com. Accepted hosts: any subdomain of copilot.tencent.com, tencentbuddy.com, workbuddy.cn or codebuddy.cn, over https. Chat, billing, catalog and check-in all follow it; your account and region do not change.',
  'row.cnBasePlaceholder': 'https://wb.tencentbuddy.com',
  'row.cnBaseInvalidMalformed': 'That is not a full URL. Include https:// and the host, e.g. https://wb.tencentbuddy.com',
  'row.cnBaseInvalidInsecure': 'Only https is accepted — a plaintext host would send your token in the clear.',
  'row.cnBaseInvalidHost': 'That host is not one of the CN brands. Use a subdomain of copilot.tencent.com, tencentbuddy.com, workbuddy.cn or codebuddy.cn.',
  'row.cnBaseSaved': 'CN gateway saved. New requests use it; originals/CORS headers keep naming the CN web app.',
  'row.cnBaseCleared': 'Back to the built-in CN gateway.',
  'row.diagCnBase': 'CN gateway',
  'row.diagCnBaseDefault': 'built-in (copilot.tencent.com)',
  'row.sidebarPanelLabel': 'Show WorkBuddy in the sidebar',
  'row.sidebarPanelHint': 'Adds a WorkBuddy row to the DSH sidebar that opens this card as a full page. Off by default: the row takes a global sidebar slot shared by every installed plugin, and the Plugins page already reaches the same content. Takes effect on the click — no Save needed — and switching it off while the page is open returns you to the conversation.',
  // The three quick-adjust pins of the route: which model and which reasoning
  // tier the local CLI runs on, and in what order it walks the credential
  // regions. The model list is not hardcoded — it is the catalog the card
  // already synced for the active tab, so it follows the upstream; a pinned
  // value the catalog does not list still shows.
  'row.cliBridgeModelLabel': 'CLI model',
  'row.cliBridgeModelDefault': 'CLI default',
  'row.cliBridgeModelAria': 'Model the local CodeBuddy CLI runs on',
  'row.cliBridgeModelHint': 'Written to cliBridge.model and passed to the CLI as --model. "CLI default" leaves the model to the CLI itself. The list is the catalog this tab synced from the upstream.',
  'row.cliBridgeEffortLabel': 'CLI effort',
  'row.cliBridgeEffortDefault': 'CLI default',
  'row.cliBridgeEffortAria': 'Reasoning effort the local CodeBuddy CLI runs on',
  'row.cliBridgeEffortHint': 'Written to cliBridge.effort and passed to the CLI as --effort. "CLI default" leaves the tier to the CLI itself. When the picked model lists supported tiers, only those are offered.',
  'row.cliBridgeRegionOrderLabel': 'Region order',
  'row.cliBridgeRegionOrderAria': 'Order in which the local CodeBuddy CLI walks the credential regions',
  'row.cliBridgeRegionOrderHint': 'Written to cliBridge.regionOrder: the order the CLI tries the WorkBuddy credentials in, until one logs in. The region actually used is reported per turn as credential_region. Applies from the next call.',
  'row.cliBridgeRegionOrderCnFirst': 'CN first',
  'row.cliBridgeRegionOrderGlobalFirst': 'Global first',
  'row.cliBridgeRegionOrderCnOnly': 'CN only',
  'row.cliBridgeRegionOrderGlobalOnly': 'Global only',
  'row.cliBridgePickersHint': 'All three pickers write the global cliBridge block; "CLI default" on model and effort is an explicit empty value, not "unset" — the CLI then uses its own defaults; the region picker writes cliBridge.regionOrder.',
  'row.imageToolLabel': 'Let the model draw images',
  'row.imageToolHint': 'Adds the workbuddy_draw_image tool, which the MODEL may call on its own — about 5.71 credits per image on the CN gateway and about 0.03 on the international one, with no per-call confirmation. Ticking it here only authorizes THIS tab\'s region. Off everywhere means the tool is not registered at all.',
  'row.videoToolLabel': 'Let the model generate videos',
  'row.videoToolHint': 'Adds the workbuddy_draw_video tool, which the MODEL may call on its own — a video is an async task (submit, poll, then download) that costs WorkBuddy credits and runs tens of seconds to minutes, with no per-call confirmation. Ticking it here only authorizes THIS tab\'s region. Off everywhere means the tool is not registered at all.',
  'row.videoModelLabel': 'Video model per mode',
  'row.videoModelHint': 'Pinned separately for text-to-video and image-to-video, from THIS region\'s own catalog — a model id does not carry across regions. A call that names no model uses the pin; with nothing pinned the tool takes the first model of that group. A pin the catalog no longer carries quietly falls back to the first model instead of failing.',
  'row.videoModelDefault': 'Default (first in the group)',
  // The media roster. It answers "what can this region actually draw" from the
  // region's own product configuration, which is the ONLY source of truth for
  // it: the catalog carries no price and no capability flag. Its IMAGE rows stay
  // a list (one model per image tag today); the VIDEO rows are pinnable in the
  // picker above, because CN now publishes two models per video tag.
  'row.mediaModelsLabel': 'Image models in this region',
  'row.mediaModelsHint': 'Read from this account\'s product configuration. The draw tools pick their models from here: a prompt without an image uses a text-to-image model, one WITH an image uses an image-to-image model. Image rows are read-only (pass a model to the tool to change it); the VIDEO model is pinnable in the picker above.',
  'row.mediaModelsEmpty': 'This region publishes no image or video model.',
  'row.mediaModelsError': 'Could not read the media model list: {message}',
  'row.mediaModelsRefresh': 'Re-read',
  'row.mediaModelsRefreshing': 'Reading…',
  'row.mediaTagTextToImage': 'text → image',
  'row.mediaTagImageToImage': 'image → image',
  'row.mediaTagTextToVideo': 'text → video',
  'row.mediaTagImageToVideo': 'image → video',
  'row.showCreditsCn': 'Show credits in the composer toolbar',
  'row.showCreditsGlobal': 'Show credits in the composer toolbar',
  'row.showCreditsCnHint': 'Show the domestic (WorkBuddy - CN) credit balance in the composer toolbar, but only while this session uses a WorkBuddy - CN model. Click it for per-account balances and a one-click test of the checked accounts (the test spends real credits). The readout refreshes by itself every 5 minutes; the per-account table every 60 seconds while it is open.',
  // WHERE the readout sits (issue #62). The composer row is a LIST seat shared
  // with any other plugin that registers there — one report is the readout
  // disappearing once another plugin was installed — so the seat is a choice.
  'row.creditPositionLabel': 'Position',
  'row.creditPositionComposer': 'composer toolbar',
  'row.creditPositionStats': 'below the input box',
  'row.creditPositionAria': 'Credit readout position for {region}',
  // The subordinate control's own explanation, ALWAYS visible: it answers "why
  // is there a picker here at all" rather than restating the option names.
  // Restating them belongs to the disabled state only — see
  // creditPositionDisabledHint. Both are deliberately short: they are the
  // second and third text tiers under the switch's title, and a longer line
  // would push the switch itself into second place.
  'row.creditPositionHintInline': 'Where the readout sits. "composer toolbar" is the default — the row with the model picker.',
  'row.creditPositionDisabledHint': 'Unavailable while the switch above is off: tick "Show credits in the composer toolbar" first.',
  // The row's explanation: what the readout IS. Kept distinct from
  // creditPositionHintInline, which explains the picker beside it — one
  // sentence per control.
  'row.showCreditsHintInline': 'The balance for the account currently serving this tab. Click for per-account balances; it also refreshes every 5 minutes.',
  // The new-model segment (opt-IN, off by default). The wording has to carry
  // the one thing that makes "new" honest: it is FIRST SEEN BY THIS MACHINE, not
  // newly listed upstream. On a fresh install every id is first-seen, so the
  // switch is off until someone asks for it.
  'row.showNewModels': 'Show newly seen models',
  'row.showNewModelsHint': 'Adds a "· N new models" segment beside the credit readout, and a "new" mark on those rows in the model picker. "New" means this machine recorded the model id for the first time — it says nothing about when the upstream listed it. Off by default: on a new install the whole roster is "new".',
  'row.showNewModelsHintInline': 'First seen by this machine, not newly listed upstream. Off by default — on a new install the whole roster counts as new.',
  // The supplement to a quota failure (issue #63), rendered as an INLINE
  // PARENTHETICAL in the conversation — one short clause, no dialog, no button.
  // The plugin no longer claims the `shell.quota-notice` chain seat, so this is
  // NOT appended to the host's sentence by this plugin any more (that takeover
  // is what parked an unstyled span at the overlay's top-left); the host draws
  // its own sentence and this qualifies it where the user is already looking.
  // Written to be TRUE FOR BOTH cases the QUOTA code covers — a model's own daily
  // quota that has nothing to do with credits, and a genuinely empty balance —
  // because the upstream says which it is in Chinese prose the plugin must not
  // parse to make policy. The glyphs are part of the string so a locale that
  // brackets differently is not at the mercy of a CSS `content` rule.
  'quotaNotice.fallbackHead': 'The quota for this request is exhausted',
  'quotaNotice.supplement': ' (some models also have a daily limit that is unrelated to your credits)',
  'row.creditPositionHint': "The default position is on the model picker row. If another connector occupies the same position, the readout loaded later moves left automatically. Choose below the input box to show it beside the round, step and token statistics.",
  'row.showCreditsGlobalHint': 'Show the international (WB AI) credit balance in the composer toolbar, but only while this session uses a WB AI model. Click it for per-account balances and a one-click test of the checked accounts (the test spends real credits). The readout refreshes by itself every 5 minutes; the per-account table every 60 seconds while it is open.',
  'composer.pointsCn': 'WorkBuddy - CN',
  'composer.pointsGlobal': 'WB AI',
  'composer.panelTitleCn': 'WorkBuddy - CN credits',
  'composer.panelTitleGlobal': 'WB AI credits',
  'composer.account': 'Account',
  'composer.credits': 'Credits',
  'composer.switchTo': 'Switch to {account}',
  'composer.current': 'In use',
  'composer.action': 'Action',
  'composer.switch': 'Switch',
  'composer.switching': 'Switching…',
  'composer.inUse': 'In use',
  'composer.switchedNotice': 'Switched to “{account}”. Subsequent requests will use this account.',
  'composer.noAccounts': 'No account in this region',
  'composer.signedOut': 'Not signed in',
  // The panel's link to this plugin's OWN settings. Kept SHORT ("Settings", not
  // "WorkBuddy settings"): the popover is ~250px wide and the header already
  // carries the region title and the batch test, so a longer label wrapped the
  // title onto two lines. The panel is unmistakably this plugin's, and the
  // tooltip names the page, so nothing is lost by the short word.
  'composer.openSettings': 'Settings',
  'composer.openSettingsHint': 'Open this plugin\'s full page (accounts, models, switches)',
  'composer.openSettingsFailed': 'This host offers no route to the plugin page',
  // The header's REFRESH control (left of settings). Named for what the reader
  // gets — this table brought up to date — rather than for the mechanism, which
  // is a probe batch. The hint has to say the mechanism out loud, because
  // "refresh" implies a free re-read and this one spends credits and takes a
  // minute: a control that surprises you with a bill is worse than one with a
  // long label.
  'composer.refresh': 'Refresh',
  'composer.refreshing': 'Refreshing…',
  'composer.refreshHint': "Tests the selected pool members one at a time. Cost depends on the selected model and test input size.",
  // NOT `composer.refreshFailed` (below): that one is the credits read. Two
  // lines both saying "refresh failed" would leave the reader unable to tell
  // which refresh broke.
  'composer.refreshAccountsFailed': 'Could not refresh the account status',
  'composer.refreshFailed': 'Could not refresh credits',
  'composer.lastRefresh': 'Last refreshed',
  'composer.panelTitle': 'WorkBuddy credits',
  // The "· N 新模型" segment. The wording MUST stay "first seen by this
  // machine": this plugin has no upstream "listed since" field, so claiming the
  // gateway added a model would be fabricating an upstream fact. The segment
  // and its row render only when the count is non-zero.
  'composer.newModels': 'new models',
  'composer.newModelsRow': 'Models discovered in the last 7 days',
  'composer.newModelsTitle': 'Models discovered in the last 7 days: ',
  'composer.newModelsSep': ', ',
  'composer.newModelsNote': '"New" means this machine recorded the model id for the first time; it says nothing about when the upstream listed it. Only active models first seen within the last 7 days are shown. Returning models keep their original timestamp.',
  'sidebar.creditsCn': 'WorkBuddy - CN credits',
  'sidebar.creditsGlobal': 'WB AI credits',
  'sidebar.refresh': 'Refresh',
  'sidebar.refreshing': 'Refreshing…',
  'sidebar.lastRefresh': 'Last refreshed {time}',
  'sidebar.refreshFailed': 'Refresh failed',
  'sidebar.signedOut': 'Not signed in',
  // The live CodeBuddy turn readout. Kept terse: it sits in the composer's
  // ambient dock next to the shell's own round/token pills, where a sentence
  // would wrap and push the composer.
  'cliLive.running': 'CodeBuddy',
  'cliLive.toolCalls': '{count} tools',
  'cliLive.elapsed': '{seconds}s',
  'cliLive.starting': 'starting…',
  'cliLive.finishing': 'finishing…',
  'cliLive.lastTool': 'last: {tool}',
  'cliLive.chars': '{count} chars',
  'cliLive.aria': 'A CodeBuddy turn is running: {detail}',
  'row.poolRetryUnknown': 'The upstream gave no time for when this frees up',
  'row.modelToolsHint': 'Configure credit display, new-model notices and model tools for this region. Tool switches take effect after saving.',
  'row.channelRejectHint': 'This option can send an additional request after a channel rejection. Review the retry conditions before enabling it.',
  'row.sidebarPanelLead': 'Choose whether WorkBuddy appears in the DSH sidebar. This setting affects navigation.',
} as const

export type WorkBuddySettingsKey = keyof typeof en

export const zh: Record<WorkBuddySettingsKey, string> = {
  'nav.panel': 'WorkBuddy',
  'row.iconStyleLabel': '图标样式',
  'row.iconStyleHint': '立即更新侧边栏和页面图标，当前浏览器分别保存每个插件的选择。',
  'row.iconStyleClaude': 'Claude 风格',
  'row.iconStyleOriginal': '默认图标',
  'row.iconStyleSaveFailed': '浏览器无法保存图标选择，请检查网站存储权限。',
  'nav.back': '返回会话',
  'row.title': "WorkBuddy 积分与模型",
  'row.desc': "在 DSH 中使用 WorkBuddy 国内版和国际版模型。可管理账号、选择模型、查询积分和领取每日签到奖励。刷新模型目录时，插件同时更新积分倍率。",
  'row.expand': '展开',
  'row.collapse': '收起',
  'row.tabCn': '国内版',
  'row.tabGlobal': '国际版',
  "row.tabHint": "国内版和国际版可同时启用。切换上方版本页签，可分别查看和管理各版本的账号、积分和模型。",
  // 免费（×0）模型**不是无限量**：上游按**单次请求体积**限流（6004，实测约 25k token
  // 通过、约 30k 被拒）并按**模型侧负载**限流（14003）。两者都不是插件能读到的
  // 「时间段内累计 token 定额」——上游没有这个字段——所以这句只说限制存在，不声称
  // 插件无法验证的机制。与 `tabHint` 分开、且加粗显示，因为它要防的误读代价很高：
  // 以为 ×0 = 无限用的人，会把 6004 读成「插件坏了」而不是「这个请求太大/太忙」。
  'row.tabFreeQuotaWarn': "免费模型也可能遇到上游请求限制或服务繁忙。",
  'row.tabSwitchHint': "关闭此开关后，插件会从模型列表中隐藏该区域的模型，并保留账号和设置。再次打开开关即可恢复。",
  'row.tabSwitchAria': "启用{region}模型",
  'row.tabOffNotice': "该区域已关闭，账号和设置已保留。勾选上方开关可恢复模型。",
  'row.signedOutHint': "请在此页面登录或导入账号，也可登录 WorkBuddy 桌面端后点击「重新检测账号」。",
  'row.signedOutWrongRegion': "检测到另一个区域的登录账号，请切换到对应区域。",
  'row.signedOutEncrypted': "登录凭据已加密，读取密钥失败。请安装 WorkBuddy 桌面端，或通过环境变量 WORKBUDDY_APP_EXECUTABLE 指定程序路径。",
  'row.searchedTitle': '已检查的路径',
  'row.searchedHint': "登录文件位于其他位置时，可通过环境变量 WORKBUDDY_AUTH_FILE 指定路径。",
  'row.reasonMissing': '不存在',
  'row.reasonUnreadable': '无法读取',
  'row.reasonInvalid': "缺少登录凭据",
  'row.reasonEncrypted': "已加密，需要桌面端密钥",
  'row.reasonWrongRegion': '属于另一个地区',
  'row.sourceDesktop': "桌面端",
  'row.sourceDsh': '插件副本',
  'row.searchedMore': "显示 {count} 条未找到文件的路径",
  'row.reloginHint': "登录凭据失效时，请重新登录 WorkBuddy 桌面端。",
  // 隐藏账号没能恢复时显示：Windows 上被占用的文件会让删除与改写双双失败。
  // 说明发生了什么、该做什么，而不是让用户以为「重新检测」成功了。
  'row.rescanHidesKept': "恢复账号失败：隐藏列表文件写入失败。请检查 DSH 配置目录的权限及文件占用，然后重试。",
  'row.credentialRejectedTitle': "账号登录凭据被拒绝",
  'row.credentialRejectedIntro': "WorkBuddy 拒绝了「{accountName}」的登录凭据，插件因此无法查询积分或签到。请重新登录，或切换到通过连接测试的账号。",
  'row.credentialRejectedSwitch': "「{accountName}」已通过连接测试，可切换到该账号。",
  'row.credentialRejectedSwitchAction': '切换到「{accountName}」',
  'row.credentialRejectedRelogin': "请在 WorkBuddy 桌面端重新登录，以更新凭据。",
  'row.credentialRejectedChoose': "其他账号也未通过连接测试。请在 WorkBuddy 桌面端重新登录，再测试要使用的账号。",
  'row.requestFailed': '请求失败',
  'row.requestFailedHint': "刷新失败，暂时显示上次加载的数据。错误：{message}",
  'row.usageErrorHint': "读取账号状态失败，正在自动重试。错误：{message}",
  'row.usageRetry': '重试',
  'row.poolErrUnavailable': "账号池接口不可用，请重启 DSH；问题持续时请重新安装插件。",
  'row.poolErrFailed': "批量操作失败：{message}",
  'row.poolErrHttp': "批量操作失败，HTTP {status}。请更新插件后重试。",
  'row.poolErrRouteMissing': "账号池接口未加载，HTTP {status}。请完全退出 DSH 后重新打开。",
  'row.poolErrNoMembers': "请先在账号池中勾选账号并保存，再点击签到或测试按钮。",
  'row.poolErrNoLiveMembers': "插件无法读取所选账号的有效登录凭据。请重新登录这些账号，或将它们移出账号池后保存。",
  'row.poolErrNoFreeModel': "当前区域没有可用的免费模型，请刷新目录，或手动选择测试模型后再试。",
  'row.poolErrNoCheckin': "当前区域暂不提供每日签到。",
  'row.poolErrStaleModel': "目标模型已从当前区域目录移除。请重新选择，或切回自动选择。",
  'row.creditsError': '积分查询失败：{message}',
  'row.refresh': '刷新',
  'row.refreshing': '正在刷新…',
  'row.accountUnnamed': '未命名账号',
  'row.accountsHint': "插件列出桌面端、插件登录和导入的账号，请在此选择要使用的账号。",
  'row.accountsRescan': '重新检测账号',
  'row.accountsScanning': '正在检测…',
  // 首屏加载中的提示（issue #77）。它取代的正是「未登录」那段说明——
  // 那一段在用量接口返回前一直显示，让已登录的用户以为自己没登录。
  'row.accountsLoading': '正在加载账号…',
  'row.accountsWriteFailed': "账号设置保存失败，插件继续使用原账号。请检查配置文件权限和文件占用后重新保存。错误：{message}。文件路径见 docs/WINDOWS.md。",
  'row.selectionLostHint': "插件无法读取已保存账号的有效登录凭据。",
  'row.selectionLostMessage': "插件读取到的登录列表中已没有该账号。请在上方列表中选择其他账号，或重新登录该账号。",
  'row.vaultUnreadableHint': "账号凭据目录读取失败：{message}。请按 docs/WINDOWS.md 的凭据目录说明检查权限，再重启 DSH。管理员修复命令：takeown /F \"<vault 目录>\" /R /D Y && icacls \"<vault 目录>\" /reset /T。",
  'row.panelAccounts': '账号',
  'row.panelModels': '模型',
  'row.panelCapabilities': '能力',
  'row.panelCapabilitiesHint': "功能开关即时生效。",
  'row.panelDiag': '诊断',
  'row.panelAria': '卡片分区',
  'row.diagHint': "显示插件读取到的账号、模型和错误信息，可用于问题反馈。",
  'row.diagRegion': '区域',
  'row.diagDomain': '上游域名',
  'row.diagAccount': "当前使用账号",
  'row.diagToken': '登录有效期至',
  'row.diagCatalog': '目录中的模型',
  'row.diagEnabled': '已启用的模型',
  'row.diagPool': '账号池',
  'row.diagPoolOn': '开启 · {count} 个账号',
  'row.diagPoolOff': '关闭',
  'row.diagFailures': '最近一次失败',
  'row.diagNoFailures': '没有报错。',
  'row.diagPromoUnreadable': "{count} 条活动时段解析失败，已隐藏促销标记",
  'row.cardCrashed': "设置页面加载失败。",
  'row.cardCrashedHint': "设置页加载失败时请先刷新；若仍有问题，请在反馈中附上错误信息。",
  'row.modelsTitle': '模型',
  'row.modelsSummary': '已启用 {count} 个',
  // 折叠态显示在标题行。保存/放弃按钮在折叠区里面，没有这个提示，用户会把
  // 自己未保存的改动藏到折叠后面，而界面上什么都不说。
  'row.modelsDirty': '有未保存的修改',
  // 标题行中间的淡色提示。它说的是「此刻能做的动作」，因此读起来像一句指引，
  // 而不是区块的标签——写成固定的「展开或收起」会让读者自己去想该按哪个。
  'row.modelsRefresh': '从 WorkBuddy 刷新',
  'row.modelsRefreshing': '正在刷新模型…',
  'row.discard': '放弃修改',
  'row.save': '保存',
  'row.saving': '保存中…',
  'row.saveError': '保存失败：{message}',
  'row.saveContentionHint': "文件被占用，保存失败。请关闭占用该文件的程序后重新保存，当前编辑内容已保留。",
  'row.modelContext': '最大上下文 {context}',
  'row.contextBudget': 'DSH 上下文预算',
  'row.modelOutput': '最大输出 {output}',
  'row.modelRate': '积分 {rate}x',
  'row.modelMultimodal': '多模态',
  'row.modelImage': '图片',
  'row.modelImageText': "厂商标注该模型仅支持文本，图片输入默认关闭。",
  'row.modelImageUnverified': "图片支持信息暂缺，图片输入默认关闭。",
  'row.modelOff': '可关闭思考',
  'row.modelOffHint': '为这个模型提供「关闭思考」档位',
  'row.modelOffRefused': "不支持关闭思考",
  'row.modelOffRefusedHint': "该模型不支持 off 档位，此选项已禁用。错误代码：11133。",
  'row.modelEffortLabel': '默认推理强度',
  'row.modelEffortAria': '{model} 的默认推理强度',
  'row.modelEffortHint': "为新对话、压缩摘要和会话标题等请求选择默认推理强度。选择具体档位后，插件使用该档位；选择「默认」时，插件先采用 WorkBuddy 的默认档位，缺少该信息时采用模型的中档。列表只显示模型支持的档位。",
  'row.modelEffortFollow': '默认',
  'row.modelEffortFollowNamed': '默认（{effort}）',
  'row.modelUnknown': '未知',
  'row.modelCapabilityPending': "模型能力以 WorkBuddy 接口公布的信息为准。",
  // 两个一键遍历按钮（issue #61 的后续，与同族 trae 插件对齐）。成本写在 title 提示里
  // 而不是二次确认，按维护者的选择：「所有模型」含未启用的，所以比「仅启用」花得多。
  'row.modelsTestEnabled': "测试已启用模型",
  'row.modelsTestAll': "测试所有模型",
  'row.modelsTesting': '测试中 {done}/{total}…',
  'row.modelsTestEnabledHint': "插件向每个已启用模型发送一次测试请求，并显示结果。默认输入长度为 25000 token，按模型费率计费。服务端拒绝登录凭据后，插件停止本次测试。",
  'row.modelsTestAllHint': "插件测试当前区域的所有模型，包含未启用的模型。各模型使用相同的输入长度，按各自费率计费。服务端拒绝登录凭据后，插件停止本次测试。",
  'row.tpsSweepEnabled': "测速已启用模型",
  'row.tpsSweepAll': "测速所有模型",
  'row.tpsSweepEnabledHint': "每个模型测试 3 次，取输出速度中位数。每次最多输出 256 token，按模型费率扣除积分。",
  'row.tpsTesting': '测速中 {done}/{total}…',
  'row.tpsMeasure': '测速',
  'row.tpsMeasuring': '测速中…',
  'row.tpsHint': "测试 3 次，取输出速度中位数。每次最多输出 256 token，按模型费率扣除积分。测速结果旁显示测试时间。",
  'row.tpsValue': '{tps} tok/s',
  'row.tpsValueTtft': '{tps} tok/s · 首字 {ttft}s',
  'row.tpsPartial': '{tps} tok/s（{samples} 次）',
  'row.tpsNoSample': "测速失败：响应分段数量不足",
  'row.tpsNoUsage': "测速失败：服务端未返回 token 数量",
  'row.tpsAllFailed': '测速失败',
  'row.tpsCredit': '花费 {credit} 积分',
  'row.tpsMeasuredAt': '{at} 测',
  'row.modelsTestDone': "测试完成：{available}/{total} 个模型可用",
  'row.modelsTestAuth': "登录凭据被拒绝，测试已停止。请重新登录后再测试。",
  'row.probe': '测试',
  'row.probing': '测试中…',
  'row.probeHint': "插件发送约 25000 输入 token 的请求，检查这个模型能否响应。测试费用按模型费率和输入大小计算。",
  'row.probeOk': '✓ 可用',
  'row.probeOkMs': '✓ 可用（{ms}）',
  'row.probeRateLimitedUnknown': '✗ 被限流 · 上游未给出何时恢复',
  'row.probeRateLimitedAt': '✗ 被限流 · 可在 {at} 后重试',
  'row.probeModelBusyUnknown': "✗ 模型繁忙，请约 2 分钟后重试或切换模型",
  'row.probeModelBusyAt': "✗ 模型繁忙，可在 {at} 后重试或切换模型",
  'row.probeOutOfCreditUnknown': '✗ 积分不足 · 上游未给出何时恢复',
  'row.probeOutOfCreditAt': '✗ 积分不足 · 积分包 {at} 刷新',
  'row.probeCredentialRejected': "✗ 登录凭据被拒绝，请重新登录或切换账号",
  'row.probePolicyRejected': "✗ 请求被服务端策略拒绝，请在 WorkBuddy 桌面端核查原因",
  // PLAIN TEXT, no `**bold**` markup: this label is rendered as a JSX text
  // child (`probeResultView` → `<p>{view.text}</p>`), not through a rich-text
  // renderer, so markdown emphasis would reach the screen as literal
  // asterisks. Every sibling probe label in this file is plain text for the
  // same reason. (The `**` style IS used elsewhere — but only in strings that
  // go to other rendering paths; a native title attribute displays plain text.)
  'row.probeChannelRejected': "✗ 请求内容触发网关渠道校验。请检查 system 或 assistant 消息中的第三方客户端标识。",
  // THE SHORT FORM of the same verdict, for the composer panel's one-line mark
  // (issue #108). The full label above is an EXPLANATION — 88 characters in
  // Chinese, 179 in English — and the panel prints it beside an account name in
  // a column roughly 180 px wide. It cannot fit there by construction, so it was
  // clipped mid-sentence by `nowrap` + `overflow:hidden`, which reads as a
  // rendering bug rather than as "there is more to this". The panel gets the
  // VERDICT; the full sentence stays one hover away in the row's `title` (which
  // carries `availabilityLine`, not this) and on the pool card, which has room.
  'row.probeChannelRejectedShort': "✗ 渠道校验拦截",
  'row.probeNotFound': "✗ 模型不存在",
  'row.probeUnavailable': "✗ 服务端未返回有效响应",
  'row.probeFailed': '✗ 测试失败',
  'row.probeFailedStatus': '✗ 测试失败（HTTP {status}）',
  'row.probeError': '无法执行测试：{message}',
  'row.cheer': '鼓励一下',

  // ---- OAuth 登录（国内扫码，国际版网页） ----
  'row.oauthTitle': '扫码添加账号',
  'row.oauthStart': '扫码登录',
  'row.oauthStarting': '正在打开…',
  // 点击后通过预先打开的窗口导航到授权页。浏览器阻止自动打开时，
  // 用户可复制链接或点击按钮重新打开登录页。
  'row.oauthOpenHint': "请打开登录页并完成授权，账号随后会自动加入列表。",
  'row.oauthOpened': "登录页已打开，等待授权…",
  'row.oauthWaiting': '正在等待登录完成…（{seconds} 秒）',
  'row.oauthExpires': '登录窗口约 {minutes} 分钟后过期。',
  'row.oauthCancel': '取消',
  'row.oauthCancelled': '已取消登录。',
  'row.oauthTimedOut': "登录超时，请重新登录。",
  'row.oauthDone': "已添加「{accountName}」。请在账号池中选择要使用的账号。",
  'row.oauthError': '登录失败：{message}',
  'row.oauthCopy': '复制链接',
  'row.oauthCopied': '已复制链接',
  'row.oauthReopen': '重新打开页面',
  'row.oauthDialogClose': '关闭',
  // 国际版登录是浏览器网页，国内版才是用 App 扫码。只拆「称呼登录方式」的三条，
  // 其余（等待、取消、完成）与方式无关，继续共用，避免两个区域在别处走偏。
  'row.oauthTitleGlobal': '网页登录添加账号',
  'row.oauthStartGlobal': '网页登录',
  // ---- 共用缓冲遮罩 ----
  'row.veilHintList': '完成后列表会立即刷新。',
  'row.oauthSyncing': '正在添加账号…',
  'row.transferTitle': '导出 / 导入账号',
  'row.transferHint': "使用 JSON 文件导出账号，或将文件中的账号导入插件。文件包含登录凭据，请限制文件的访问权限。",
  'row.transferExport': '导出账号',
  'row.transferExporting': '正在导出…',
  'row.transferExportPick': '选择要导出的账号（共 {total} 个）：',
  'row.transferExportConfirm': '导出 {count} 个账号',
  'row.transferExported': '已导出 {count} 个账号到 {fileName}。',
  'row.transferImport': '导入账号',
  'row.transferImporting': '正在导入…',
  'row.transferPreviewing': '正在读取文件…',
  'row.transferPreviewTotal': "文件包含 {total} 个账号。请勾选需要导入的账号；导入时，插件会覆盖已保存的同名账号。",
  'row.transferImportConfirm': '导入 {count} 个账号',
  'row.transferImported': "已导入 {imported} 个账号。另有 {skipped} 个账号因缺少登录凭据或区域不同而未导入。",
  'row.transferEntryUnknown': '未知账号',
  'row.transferNoToken': "缺少登录凭据",
  'row.transferCancel': '取消',
  'row.transferError': '传输失败：{message}',

  // ---- 账号池 ----
  'row.poolTitle': '账号池',
  'row.poolNoCandidate': '账号池里目前没有可用的账号。',
  'row.poolNoCandidateHint': "账号可能处于限流冷却、积分耗尽、凭据被拒绝或连接失败状态。临时故障按服务端指定时间重试；服务端未指定时，默认等待 30 分钟。等待结束不代表上游已经恢复。凭据被拒绝时需重新登录。",
  // 「所有成员都撞在同一个模型上」的池级结论（issue #64）。与上面那条刻意分开：
  // 那条说的是**账号**不行，这条说的是**账号没问题、模型才是那堵墙**。没有它，
  // 卡片上每行「模型繁忙」加起来就成了一个整体上错误的结论，用户会去找一个不存
  // 在的坏账号 —— 正是 issue #56 报告的那场搜寻。
  'row.poolModelWideBusy': "所有账号请求的模型均繁忙。",
  'row.poolModelWideBusyHint': "请约 2 分钟后重试，或切换到负载较低的模型。",
  // 「勾选的」而不是「所有」：这两个按钮只走勾选进池的成员，而表格里
  // 未勾选的行就摆在旁边 —— 「所有账号」会被读成「我登录过的每一个账号」，
  // 与禁用条件（一个都没勾就置灰）和成员区那句「只有勾选的账号参与轮换、
  // 签到与测试」都对不上。
  'row.poolCheckinAll': '签到勾选的账号',
  'row.poolCheckingIn': '签到中…',
  'row.poolTestAll': '测试勾选的账号',
  'row.poolTesting': '测试中…',
  'row.poolBusyHint': "插件正在处理所选账号…",
  'row.poolTargetAuto': '自动',
  'row.poolTargetStaleShort': '目标模型已失效',
  'row.poolTargetNoneShort': '无免费模型',
  'row.poolTargetFree': '自动选中的免费模型：{model}',
  'row.poolTargetPreferred': "指定模型：{model}",
  'row.poolTargetCurrentPreferred': "测试模型：{model}（手动选择）",
  'row.poolTargetCurrentFree': "测试模型：{model}（自动选择）",
  'row.poolTargetNone': '本区域暂时没有倍率为 0 的免费模型。',
  'row.poolTargetStale': '你保存的目标模型已不在目录中：{model}',
  'row.poolTargetStaleHint': "已保存的测试模型已从目录移除，手动测试暂不可用。请选择其他模型，或切回自动选择。定时测试会在目录中另有零费率模型时使用该模型。",
  'row.poolTargetStaleClear': '切回自动',
  'row.poolTargetStaleOption': '{model}（已下架）',
  'row.poolTargetNoneHint': "自动模式仅选择免费模型，请刷新目录后重试，或手动选择测试模型；选择收费模型时会消耗被测账号积分。",
  'row.poolColumnAccount': '账号',
  'row.poolColumnCredits': '积分',
  'row.poolColumnProbe': '状态',
  'row.poolColumnCheckin': '签到',
  'row.poolNeverTested': '未测试',
  'row.poolTestedAt': '测试于 {at}',
  'row.poolCheckedIn': '已签到',
  'row.poolNotCheckedIn': '未签到',
  'row.poolCheckinUnknown': '—',
  'row.probeAccountRestricted': '账号被上游限制使用',
  'row.poolCheckinEnterprise': '不适用（企业版）',
  'row.poolBenefitClaimable': '{title}：{count} 积分',
  'row.poolBenefitUrgent': '{title}：{count} 积分 · 剩 {days} 天',
  'row.poolBenefitDueToday': '{title}：{count} 积分 · 今天截止',
  'row.poolBenefitClaim': '领取',
  'row.poolBenefitClaiming': '领取中…',
  'row.poolBenefitClaimAria': '为该账号领取{title}（{count} 积分）',
  'row.poolLogBenefitClaimed': '{accountName} 已领取{title}：{count} 积分',
  'row.poolLogBenefitFailed': '{accountName} 领取失败：{message}',
  'row.poolBenefitHint': '去套餐与积分页领取：{url}',
  'row.poolCreditSoon': '{count} 积分 3 天内过期',
  'row.poolCreditNearest': '最近积分包 {at} 过期',
  'row.poolExcludedRateLimited': '被限流',
  'row.poolExcludedModelBusy': '模型繁忙',
  'row.poolExcludedOutOfCredit': '积分耗尽',
  'row.poolExcludedRejected': '被拒绝',
  'row.poolExcludedAccountRestricted': '账号被上游限制使用',
  'row.poolReserved': '备用待启用',
  'row.poolExcludedUnusable': '不可用',
  'row.poolRetryAt': '{at} 后可重试',
  // 允许重试时间的相对表述。总是与绝对时刻**并列**显示，而不是取代它：
  // 绝对时刻是上游的原话、始终权威，这几个键只是替读者省掉一次心算。
  'row.remainingImminent': '即将可重试',
  'row.remainingMinutes': '约 {count} 分钟后',
  'row.remainingHours': '约 {count} 小时后',
  'row.remainingDays': '约 {count} 天后',
  // 带动词的同一时长（`recoversInText`）：账号行上单独一句「约 2 小时后」只说了
  // 时长，没说那一刻会发生什么 —— 读起来既可能是「限流解除」也可能是别的。
  // 这一行整行的职责就是回答「这个账号现在能不能用」，所以动词不能省。
  'row.recoversImminent': '即将可重试',
  'row.recoversMinutes': '约 {count} 分钟后可重试',
  'row.recoversHours': '约 {count} 小时后可重试',
  'row.recoversDays': '约 {count} 天后可重试',
  // 记录有多旧、以及是谁写的。两个写入方会互相覆盖同一个账号的记录，
  // 没有这两项就无法解释用户亲眼看到的变化（测出 ok，过后变成被限流）。
  'row.poolProbeJustNow': '刚刚',
  'row.poolProbeMinutesAgo': '{count} 分钟前',
  'row.poolProbeHoursAgo': '{count} 小时前',
  'row.poolProbeDaysAgo': '{count} 天前',
  'row.poolProbeSourceTest': "手动测试",
  'row.poolProbeSourceLive': "对话请求",
  'row.poolProbeSourceUnknown': '来源未知',
  // 结论是针对**哪个模型**的（issue #61）。6004 是「账号 × 模型」维度的条件，
  // 只写「可用」会被读成账号级结论，而被拒的恰恰是用户真在用的那个模型。
  'row.poolProbeModel': '模型 {model}',
  'row.poolProbeModelUnknown': '未记录模型',
  'row.poolSettingsTitle': '更多设置',
  'row.poolSettingsHint': "修改账号池设置后，请点击保存。插件会单独保存测试结果。",
  'row.poolEnabled': '启用账号池',
  'row.poolEnabledHint': "开启后，插件自动选择账号；遇到账号限流、积分耗尽或账号故障时尝试换号。关闭后，请从账号列表中选择要使用的账号。参数错误、模型繁忙、平台排队和渠道校验拦截会直接显示报错。",
  'row.poolModeAuto': "自动选择",
  'row.poolModeManual': "手动选择",
  'row.poolManualAccountLabel': "当前账号",
  'row.poolManualAccountNone': '当前没有生效的账号',
  'row.poolTargetLabel': "账号测试模型",
  'row.poolTargetHint': "批量测试使用此处选择的模型。选择「自动」时，插件使用该区域上下文窗口最大的免费模型；选择收费模型时，测试会消耗各被测账号的积分。",
  'row.poolTargetAutoOption': "自动选择免费模型",
  'row.poolProbeSizeLabel': "测试输入大小",
  'row.poolProbeSizeHint': "建议选择接近会话请求的输入长度。短请求通过测试后，较长的请求也可能触发账号限制。输入越长，收费模型的测试费用越高。",
  'row.poolProbeSizeDefault': '默认（2.5 万）',
  'row.poolProbeSizeOption': '{tokens} 万 token',
  'row.poolSaved': '保存',
  'row.poolSaving': '保存中…',
  'row.poolSaveFailed': '保存失败：{message}',
  'row.poolSavedStaleRefresh': "设置已保存，但面板刷新失败，请稍后刷新查看。",
  'row.poolDiscard': '放弃修改',
  'row.poolDirty': '● 有未保存的修改',
  // 自动签到（issue #191）。默认关，且标题写的是「它会做什么」而不是功能名。
  'row.poolAutoCheckin': '每天自动签到',
  "row.poolAutoCheckinHint": "开启并保存后，插件在 DSH 运行期间每天为所选国内版个人账号领取签到奖励。重启后，插件先检查当天的签到进度，再处理尚未签到的账号。失败时自动重试。",
  'row.poolAutoCheckinToday': '今日：已签 {done} / {total}',
  'row.poolAutoCheckinDone': '今日：{total} 个全部已签',
  'row.poolAutoCheckinPending': '待重试 {count} 个',
  'row.poolAutoCheckinFailed': '上次尝试失败：{message}',
  'row.poolManualUnlock': '关闭自动轮换',
  'row.poolLogTitle': '活动记录',
  'row.poolLogClear': '清空',
  'row.poolLogEmpty': '尚无活动。签到、测试与账号切换都会记录在这里。',
  'row.poolLogCheckinStart': "开始为 {count} 个账号签到",
  'row.poolLogCheckinClaimed': '{accountName}：签到成功 +{credit}',
  'row.poolLogCheckinAlready': "{accountName}：今日已完成签到",
  'row.poolLogCheckinSkipped': "{accountName}：每日签到仅适用于个人账号",
  'row.poolLogCheckinFailed': "{accountName}：签到失败，{message}",
  'row.poolLogCheckinDone': '签到完成',
  'row.poolLogBatchFailed': "批量操作失败：{message}",
  'row.poolLogTestStart': '开始测试 {count} 个账号 × {model}',
  'row.poolLogTestRow': '{accountName}：{outcome}',
  'row.poolLogTestDone': "测试完成，已更新可用账号列表",
  'row.poolLogTestRowMalformed': "{accountName}：服务端未返回测试结果",
  'row.poolRegionNote': "国内版和国际版各有独立的账号池设置。切换区域后，请分别设置并保存。",
  'row.poolMembersTitle': "账号池成员",
  "row.poolMembersHint": "在下方勾选要加入账号池的账号，然后点击「保存」。",
  'row.poolSelectAll': '全选',
  'row.poolSelectNone': '全不选',
  'row.poolSelectedCount': '已选 {count} / {total}',
  // 排序规则说明。顺序必须与 rankPool 的比较器完全一致（见 src/account-pool.ts）。
  'row.poolOrderRulesTitle': "账号选择顺序",
  'row.poolOrderRulesIntro': "插件按以下顺序比较账号。前一条件相同时，再比较下一条件。",
  'row.poolOrderRuleUsable': "1. 可用状态：插件优先选择可用账号。限流和临时调用故障可在等待期结束后再次尝试；凭据被拒绝时，需要重新登录并测试。",
  'row.poolOrderRuleExpiring': "2. 临期积分：有 3 天内到期积分的账号优先，此项优先于手动排序。",
  'row.poolOrderRuleManual': "3. 手动顺序：按 ↑ / ↓ 设置的位置排序，未手动排序的账号列在其后。",
  'row.poolOrderRuleNearestExpiry': "4. 到期时间：都有临期积分时，先到期的账号优先。",
  'row.poolOrderRuleExpiringAmount': "5. 临期积分数量：两个账号都有临期积分时，插件优先选择临期积分较多的账号。",
  'row.poolOrderRuleTotal': "6. 总积分：余额多的账号优先。",
  'row.poolOrderRuleFreshness': "7. 凭据有效期：插件优先选择登录凭据到期较晚的账号。",
  'row.poolOrderRuleId': "8. 账号标识：以上条件均相同时，按账号标识排序。",
  'row.poolOrderWhy': "为优先使用即将到期的积分，有 3 天内到期积分的账号会排在其他账号之前。手动顺序仅在前两项相同时生效。",
  'row.poolOrderBadgeNote': "序号表示已保存的手动位置。实际使用顺序还会考虑账号可用状态和临期积分。",
  'row.poolOrderRulesToggle': '查看完整排序规则',
  'row.poolNoneSelected': '还没有勾选任何账号。',
  'row.poolNoneSelectedHint': "请勾选至少一个账号并保存，再执行签到或测试。",
  'row.poolGhostMembers': "插件无法读取 {count} 个成员的有效登录凭据，已暂停使用这些账号：{names}。请重新登录，或在下方移除账号。",
  'row.poolGhostRemove': '把 {account} 移出本池',
  'row.poolGhostRemoveNamed': "将 {account} 移出账号池：插件无法读取该账号的有效登录凭据。",
  'row.poolGhostRemoveUnnamed': "将 {account} 移出账号池。插件未读取到账号名称，因此使用账号标识的前几位显示该账号。",
  'row.poolSelectAria': '把 {accountName} 加入本区域的账号池',
  'row.poolCurrentBadge': '当前使用',
  'row.poolCurrentHeader': '当前计费：{account}',
  'row.poolNotMember': "未加入",
  'row.poolNotMemberHint': "加入账号池后可参与轮换、批量签到和测试。",
  'row.poolServingOutside': "当前使用的「{account}」尚未加入账号池，加入并保存后才会参与轮换、批量签到和测试。",
  'row.poolUnsavedMembers': "成员选择已修改，保存后生效",
  // 手动优先级排序：排序徽标与 ↑/↓ 移动按钮。徽标不可点（只描述当前顺序），箭头负责调整。
  'row.poolRankLabel': '第 {rank} 位',
  'row.poolRankManualTitle': "已保存的手动位置：第 {rank} 位。",
  'row.poolRankAuto': '自动排序',
  'row.poolRankAutoTitle': "插件按可用状态、临期积分和余额等条件排序。使用 ↑/↓ 可设置手动顺序；手动顺序在可用状态和临期积分条件相同时生效。",
  'row.poolMoveUpTitle': '在本池顺序中上移该账号',
  'row.poolMoveDownTitle': '在本池顺序中下移该账号',
  'row.poolMoveUpAria': '在本池顺序中上移 {accountName}',
  'row.poolMoveDownAria': '在本池顺序中下移 {accountName}',
  // 行级操作：测试单个账号 / 删除单个账号。
  'row.poolRowTest': '测试',
  'row.poolRowRemove': '删除',
  'row.poolRowRemoveHint': "从插件列表隐藏该账号，桌面端保持登录。需要恢复显示时，点击「重新检测账号」。",
  'row.poolRowRemoveAria': "从插件列表删除 {accountName}",
  'row.poolRowRemoved': "{accountName} 已从插件列表隐藏，点击「重新检测账号」可恢复。",
  'row.poolRowRemoving': '正在删除账号…',
  'row.poolRowRemoveDesktopOnly': "{accountName} 已从插件列表隐藏，桌面端仍保持登录；点击「重新检测账号」可恢复显示。",
  // 设备头档位与逐账号齿轮。中文这几句的要点与英文一致：**「真实值」= 所有账号
  // 共用这台机器真实的设备**，所以齿轮关掉——一台真机不可能有两个 id。只写"不可
  // 编辑"而不写原因，用户会当成控件坏了。
  'row.deviceModeTitle': "设备标识",
  'row.deviceModeVirtual': "虚拟设备",
  'row.deviceModeReal': "本机设备",
  'row.deviceModeHintVirtual': "为每个账号自动生成设备标识。点击账号右侧齿轮可修改。",
  'row.deviceModeHintReal': "插件从 WorkBuddy 桌面端获取设备标识，所有账号共用此标识。可在 SDK 页面查看获取状态。",
  'row.deviceModeRealUnsupported': "当前系统暂不支持此选项，请选择「虚拟设备」。",
  'row.deviceGearHint': '编辑这个账号的设备标识（X-Machine-ID / X-Session-ID）',
  'row.deviceGearBlockedHint': "选择「虚拟设备」后可编辑",
  'row.deviceGearAria': '编辑 {accountName} 的设备参数',
  'row.deviceModeRealBlockedTitle': "请先选择「虚拟设备」",
  'row.deviceModeRealBlocked': "账号共用本机设备标识。需要单独设置时，请选择「虚拟设备」。",
  'row.deviceDialogTitle': '设备参数 · {accountName}',
  'row.deviceDialogIntro': "为该账号设置请求头 X-Machine-ID 和 X-Session-ID。字段留空时，插件自动生成标识，并在下方显示生成值。",
  'row.deviceMachineLabel': '机器 ID（X-Machine-ID）',
  'row.deviceSessionLabel': '会话 ID（X-Session-ID）',
  'row.deviceFieldPlaceholder': "留空时自动生成",
  'row.deviceDerivedNow': "当前自动生成值：",
  'row.deviceDerivedUnavailable': "插件尚未生成设备随机种子，暂时无法生成设备标识。",
  'row.deviceDerivedNoUid': "账号缺少 uid，设备标识暂不可用。",
  'row.deviceRandom': "随机生成",
  'row.deviceRandomHint': "为两项分别生成 36 位随机标识",
  'row.deviceDialogP3': "本机设备凭据",
  'row.deviceDialogP3Hint': "由 WorkBuddy 桌面端获取，所有账号共用。状态见 SDK 页面。",
  'row.deviceDialogCancel': '取消',
  'row.deviceDialogSave': '保存',
  'row.deviceDialogSaving': '保存中…',
  'row.deviceInvalid': '需要 36 个十六进制字符（0-9a-f）',
  'row.panelSdk': 'SDK',
  'sdk.hint': "此页面显示插件从 WorkBuddy 桌面端获取的设备凭据。选择桌面端设备模式后，插件在请求中使用该凭据。",
  'sdk.loading': "正在读取设备凭据…",
  'sdk.unavailable': "设备凭据接口不可用，请更新插件并重启 DSH。",
  'sdk.state': '连接状态',
  'sdk.statusReady': '正常',
  'sdk.statusStale': "最近获取失败，暂用上次凭据",
  'sdk.statusNoToken': "SDK 已加载，等待获取凭据",
  'sdk.statusMissing': '未在本机找到已安装的 WorkBuddy 桌面端 SDK',
  'sdk.statusUnsupported': "当前平台暂不受支持",
  'sdk.statusError': 'SDK 加载失败',
  'sdk.statusDisabled': '设置中已关闭',
  'sdk.masterLabel': "获取本机设备凭据",
  'sdk.masterHint': "插件从 WorkBuddy 桌面端获取设备凭据，并按约 10 分钟周期更新。修改此开关后，请重载插件或重启 DSH，让获取任务按新设置运行。",
  'sdk.bundle': 'SDK',
  'sdk.runtime': '运行时',
  'sdk.fetched': '最近取到',
  'sdk.tier': "当前模式",
  'sdk.tierReal': "本机设备",
  'sdk.tierVirtual': "虚拟设备",
  'sdk.valueLabel': 'X-Device-Token',
  'sdk.noValue': "尚无可用凭据",
  'sdk.length': '{count} 字符',
  'sdk.reveal': '显示',
  'sdk.hide': '隐藏',
  'sdk.copy': '复制',
  'sdk.copied': '已复制',
  'sdk.refresh': '重新获取',
  'sdk.refreshing': '获取中…',
  'sdk.never': '从未',
  'sdk.unknown': '未知',
  'sdk.ageJustNow': '刚刚',
  'sdk.ageMinutes': '{count} 分钟前',
  'sdk.ageHours': '{count} 小时 {rest} 分前',
  // 设置项（作者意见 #1 / #2）。目录这一条的每一项都要回答「留空会怎样」——
  // 一个空输入框最容易被读成「必须填」。
  'sdk.dirLabel': 'SDK 目录',
  'sdk.dirPlaceholder': "留空时自动查找 WorkBuddy 桌面端",
  'sdk.dirSave': '保存',
  'sdk.dirSaving': '保存中…',
  'sdk.dirSaved': '已保存。',
  'sdk.dirClear': '清除',
  'sdk.dirHint': "填写 WorkBuddy 安装目录中的 native/turing-sdk 路径，再保存。插件会重新检测该目录。设置了环境变量 WORKBUDDY_TURING_SDK_DIR 时，插件优先使用环境变量中的路径。",
  'sdk.fallbackLabel': "获取失败时使用虚拟设备",
  'sdk.fallbackHint': "获取桌面端设备凭据失败时，开启此选项可让插件改用虚拟设备标识。关闭此选项时，插件发送请求时省略设备标识。",
  // 生图工具允许模型发起计费请求，因此默认关闭，提示中说明测得的参考费用。
  // 插件另有视频等计费能力，不能把生图描述成唯一可自主计费的工具。
  // 单价按区分：国内区约 5.71、国际区约 0.03 积分/张（2026-10-25 实测；目录
  // 里没有价格，只有结算时的 usage.credit），工具本身回报的是实扣值。
  'row.upstreamHint': "这些设置用于调整请求标识和消息顺序，保存后需重载插件或重启 DSH。",
  'row.usageIdentityLabel': "在用量页显示客户端标识",
  'row.usageIdentityHint': "将会话标识改为 32 位十六进制格式，并添加 X-Request-ID。X-IDE-* 请求头由请求标识档位单独控制。默认关闭。",
  'row.keepPromptLastLabel': "在用量页显示用户提问",
  'row.keepPromptLastHint': "开启后，插件将运行上下文移到用户提问之前，并移除该提问开头的会话消息标记，使提问出现在用量页。默认关闭。",
  'row.sessionTitleLabel': '会话标题请求改用轻量模型',
  'row.sessionTitleHint': "新会话生成标题时使用指定的轻量模型，标题请求按该模型计费。默认关闭。",
  'row.sessionTitleModel': '目标模型：',
  'row.extraPrefixesCount': "自定义上下文前缀数量：",
  // 渠道门自动续发。这段文案要同时说清三件事：它只对哪一种失败起作用、它会花掉
  // 真实请求、上限数的是**连续**次数——因为开关默认关闭，而用户了解这些的唯一
  // 其他途径就是配置文件。
  'row.channelRejectContinueLabel': "渠道校验拦截后自动发送「继续」",
  'row.channelRejectContinueHint': "遇到 code 11128 时，以新回合发送下方文本，每次会消耗请求额度。仅当触发拦截的内容随回合变化时可能有效。默认关闭，连续发送上限为 1 次；对话成功或用户发送消息后计数清零。仅用于主会话，修改后立即生效。",
  'row.channelRejectContinueLimit': '连续发送上限：',
  'row.channelRejectContinueText': '发送的文本：',
  'row.cliBridgeLabel': "启用本机 CodeBuddy 调用",
  'row.cliBridgeHint': "提供 codebuddy_ask 工具和 /codebuddy 指令，每次调用消耗 CodeBuddy 额度。指令结果按 injectResult 设置发送给会话模型，会话空闲时会增加一次模型请求。默认每会话每小时最多 6 次、全局每小时 20 次，每会话同时执行一次。",
  'row.sidebarPanelLabel': '在侧边栏显示 WorkBuddy',
  'row.sidebarPanelHint': "在侧边栏显示 WorkBuddy 设置入口，默认关闭。开关即时生效；关闭时，已打开的设置页会返回对话。",
  // 本地 CLI 路由的三个快调旋钮：跑哪个模型、哪个推理档位、按什么顺序
  // 遍历凭据区域。模型列表不写死——是卡片已为当前页签同步到的目录，
  // 跟随上游；已选值即使目录里没有也会原样列出，不让它无声消失。
  'row.cliBridgeModelLabel': 'CLI 模型',
  'row.cliBridgeModelDefault': 'CLI 默认',
  'row.cliBridgeModelAria': '本地 CodeBuddy CLI 运行所用的模型',
  'row.cliBridgeModelHint': "选择 CodeBuddy CLI 执行任务时使用的模型。列表来自所选区域的模型目录；选择「CLI 默认」可使用 CodeBuddy 自身设置的模型。",
  'row.cliBridgeEffortLabel': "CLI 推理强度",
  'row.cliBridgeEffortDefault': 'CLI 默认',
  'row.cliBridgeEffortAria': '本地 CodeBuddy CLI 的推理档位',
  'row.cliBridgeEffortHint': "选择 CodeBuddy CLI 执行任务时使用的推理强度。插件根据模型支持情况显示可选档位；选择「CLI 默认」可使用 CodeBuddy 自身设置的档位。",
  'row.cliBridgeRegionOrderLabel': '区域顺序',
  'row.cliBridgeRegionOrderAria': '本地 CodeBuddy CLI 遍历凭据区域的顺序',
  'row.cliBridgeRegionOrderHint': "插件按此顺序尝试各区域的登录凭据，取得可用凭据后执行任务。设置在下次调用时生效，工具结果会显示所用区域。",
  'row.cliBridgeRegionOrderCnFirst': '国内优先',
  'row.cliBridgeRegionOrderGlobalFirst': '国际优先',
  'row.cliBridgeRegionOrderCnOnly': '仅国内',
  'row.cliBridgeRegionOrderGlobalOnly': '仅国际',
  'row.cliBridgePickersHint': "模型、推理强度和区域顺序保存为全局调用设置。「CLI 默认」使用 CodeBuddy 自身设置。",
  'row.imageToolLabel': "允许模型调用图片生成工具",
  'row.imageToolHint': "开启后，会话模型可调用 workbuddy_draw_image，使用当前区域的账号生成图片并扣除积分。记录的参考费用为国内版约 5.71 积分/张、国际版约 0.03 积分/张。",
  'row.videoToolLabel': "允许模型调用视频生成工具",
  'row.videoToolHint': "开启后，会话模型可调用 workbuddy_draw_video，使用当前区域的账号生成视频。提交任务会产生费用，生成通常需要几十秒至几分钟。",
  'row.videoModelLabel': '按模式指定视频模型',
  'row.videoModelHint': "分别为文生视频和图生视频选择默认模型。工具调用中指定的模型优先；省略模型参数时，插件使用此处的设置。设置中的模型已下架或留空时，插件使用对应列表中的第一个模型。",
  'row.videoModelDefault': '默认（组内第一个）',
  // 媒体模型清单。它回答的是「这一区到底能画什么」，唯一可信来源是该区账号
  // 自己的产品配置：目录里既没有价格也没有能力标志。其中「图像」那一半仍是
  // 列表（每个图像 tag 组今天只有一个模型）；「视频」那一半可以在上面的选择器
  // 里钉住，因为国内区现在每个视频 tag 组有两个模型。
  'row.mediaModelsLabel': "当前区域媒体模型",
  'row.mediaModelsHint': "插件从所选账号的产品配置中读取此列表。生成图片时，根据参考图选择文生图或图生图模型，也可通过工具参数指定模型；视频默认模型在上方设置。",
  'row.mediaModelsEmpty': '这一区的产品配置里没有图像或视频模型。',
  'row.mediaModelsError': '读取媒体模型清单失败：{message}',
  'row.mediaModelsRefresh': '重新读取',
  'row.mediaModelsRefreshing': '正在读取…',
  'row.mediaTagTextToImage': '文生图',
  'row.mediaTagImageToImage': '图生图',
  'row.mediaTagTextToVideo': '文生视频',
  'row.mediaTagImageToVideo': '图生视频',
  'row.showCreditsCn': '在输入框工具栏显示积分读数',
  'row.showCreditsGlobal': '在输入框工具栏显示积分读数',
  'row.showCreditsCnHint': "显示当前会话使用的国内版账号余额。点击查看账号明细或测试所选账号，测试会消耗积分。余额每 5 分钟刷新，面板打开时明细每 60 秒刷新。",
  // 积分显示在哪个位置（issue #62）。输入框工具栏是**共享**的 list 插槽，
  // 别的插件也注册在那里时本插件读数会消失（报告者遇到的就是这个），
  // 所以位置做成可选项。
  'row.creditPositionLabel': '显示位置',
  'row.creditPositionComposer': '输入框工具栏',
  'row.creditPositionStats': '输入框下方',
  'row.creditPositionAria': '{region} 的积分显示位置',
  // 位置选择器的从属说明，**始终可见**：它解释的是「为什么这里还有个下拉框」，
  // 而不是复述选项名称 —— 复述类说明只该在该行灰掉时出现，见
  // creditPositionDisabledHint。两段文字都刻意短：它们是主开关标题下的
  // 第二、三级文字，再长就会把主开关本身挤成次要信息。
  'row.creditPositionHintInline': "默认显示在输入框工具栏，与模型选择同一行。",
  'row.creditPositionDisabledHint': "请先开启上方积分显示开关，再调整位置。",
  // 这一行讲「读数是什么」；下面 creditPositionHintInline 讲「选位置是什么意思」。
  // 一个控件一句说明。
  'row.showCreditsHintInline': "显示当前区域正在使用的账号余额。点击查看各账号明细，每 5 分钟自动刷新。",
  // 额度失败的补充（issue #63），渲染成**对话里的行内括号**——一句短话，没有对话框、
  // 没有按钮。插件**不再**占用 DSH 的 `shell.quota-notice` 链座位，所以这句不再由本插件
  // 拼在 DSH 句子后面（那次占用才是把无样式 span 留在 overlay 左上角的原因）；DSH 自己画
  // 它那句，本插件只在这句旁边补一句。措辞对 QUOTA 覆盖的**两种**情况都成立 —— 模型自己
  // 的每日额度（与积分无关）与真的积分耗尽 —— 因为上游说的是中文散文，插件不允许解析它
  // 来下政策判断。
  'quotaNotice.fallbackHead': '当前请求的额度已用尽',
  'quotaNotice.supplement': "（部分模型还设有独立的每日额度）",
  'row.creditPositionHint': "默认与模型选择同一行显示；遇到其他连接器占用排序位置时，后加载的读数自动向左排列。也可选择「输入框下方」，与轮次、步数和 token 统计同一行显示。",
  'row.showCreditsGlobalHint': "显示当前会话使用的国际版账号余额。点击查看账号明细或测试所选账号，测试会消耗积分。余额每 5 分钟刷新，面板打开时明细每 60 秒刷新。",
  'composer.pointsCn': 'WorkBuddy - CN',
  'composer.pointsGlobal': 'WB AI',
  'composer.panelTitleCn': 'WorkBuddy - CN 积分',
  'composer.panelTitleGlobal': 'WB AI 积分',
  'composer.account': '账号',
  'composer.credits': '积分',
  'composer.switchTo': '切换到 {account}',
  'composer.current': '当前使用',
  'composer.action': '操作',
  'composer.switch': '切 换',
  'composer.switching': '切换中…',
  'composer.inUse': '使用中',
  'composer.switchedNotice': '已切换至「{account}」，后续请求使用此账号。',
  'composer.noAccounts': '该区域暂无账号',
  'composer.signedOut': '未登录',
  // 面板里通往本插件自身页面的入口。措辞取短（「设置」而不是「WorkBuddy 设置」）：
  // 这个浮层只有约 250px 宽，头部还要放区域标题和一键测试，长标签会把标题挤成
  // 两行。面板本身就只属于这个插件，去处由 tooltip 说明，短词不丢信息。
  'composer.openSettings': '设置',
  'composer.openSettingsHint': '打开本插件的设置页（账号、模型、各项开关）',
  'composer.openSettingsFailed': "插件设置入口不可用",
  // 头部的刷新按钮（在「设置」左侧）。按读者拿到的东西命名——这张表变成最新的
  // ——而不是按机制命名（机制是一批探测）。提示必须把机制说出来：「刷新」听起来
  // 是免费重读，而这个要花积分、要跑一分钟；让人意外掏钱的控件，比标签长一点的
  // 控件更糟。
  'composer.refresh': '刷新',
  'composer.refreshing': '正在刷新…',
  'composer.refreshHint': "插件逐个测试当前区域账号池中已勾选并保存的账号，再更新账号状态。测试按模型费率消耗积分；总耗时随账号数量和服务端响应变化。",
  // 不复用下面的 `composer.refreshFailed`：那条是积分读取。两行都写「刷新失败」
  // 会让读者分不清是哪一次刷新坏了。
  'composer.refreshAccountsFailed': '账号状态刷新失败',
  'composer.refreshFailed': '积分刷新失败',
  'composer.lastRefresh': '最近刷新',
  'composer.panelTitle': 'WorkBuddy 积分',
  // 「· N 新模型」段的措辞。措辞必须停在「本机首次见到」：本插件拿不到上游
  // 的「上架时间」字段，说「网关新增」就是在替上游编一个事实。段与面板行只在
  // 数量非零时渲染。
  'composer.newModels': '新模型',
  'composer.newModelsRow': "近 7 天发现的模型",
  'composer.newModelsTitle': "近 7 天发现的模型：",
  'composer.newModelsSep': '、',
  'composer.newModelsNote': "按本机首次记录时间统计，模型暂时离开目录后再次出现不会重新计时。",
  'sidebar.creditsCn': 'WorkBuddy - CN 积分',
  'sidebar.creditsGlobal': 'WB AI 积分',
  'sidebar.refresh': '刷新',
  'sidebar.refreshing': '刷新中…',
  'sidebar.lastRefresh': '最近刷新 {time}',
  'sidebar.refreshFailed': '刷新失败',
  'sidebar.signedOut': '未登录',
  'cliLive.running': 'CodeBuddy',
  'cliLive.toolCalls': '{count} 次工具',
  'cliLive.elapsed': '{seconds} 秒',
  'cliLive.starting': '启动中…',
  'cliLive.finishing': "正在整理结果…",
  'cliLive.lastTool': '最近：{tool}',
  'cliLive.chars': '{count} 字',
  'cliLive.aria': "CodeBuddy 正在执行任务：{detail}",
  'row.poolRetryUnknown': '上游未给出何时恢复',
  'row.modelToolsHint': '设置本区域的积分显示、新模型提示和模型工具权限。工具开关保存后生效。',
  'row.channelRejectHint': '开启前请阅读重试条件。遇到渠道拒绝时，此选项可能额外发送一次请求。',
  'row.sidebarPanelLead': '选择是否在 DSH 侧边栏显示 WorkBuddy。此设置只影响导航入口。',
  'row.cnBaseLabel': 'CN 网关主机',
  'row.cnBaseHint': '留空即用 copilot.tencent.com。只有当你的网络按 TLS SNI 重置这个域名时才需要填（连接在毫秒级就失败，而同一台机器上的 WorkBuddy 桌面端正常——客户端自己会退回 wb.tencentbuddy.com）。可填 copilot.tencent.com、tencentbuddy.com、workbuddy.cn、codebuddy.cn 任一域名下的子域，且必须是 https。聊天、计费、模型目录、签到都会跟着走；账号与区域不会变。',
  'row.cnBasePlaceholder': 'https://wb.tencentbuddy.com',
  'row.cnBaseInvalidMalformed': '这不是一个完整 URL。请带上 https:// 与主机名，例如 https://wb.tencentbuddy.com',
  'row.cnBaseInvalidInsecure': '只接受 https——明文主机会把你的 token 裸发出去。',
  'row.cnBaseInvalidHost': '这个主机不在 CN 品牌里。请用 copilot.tencent.com、tencentbuddy.com、workbuddy.cn、codebuddy.cn 下的子域。',
  'row.cnBaseSaved': 'CN 网关已保存，新请求即刻使用它；Origin/Referer 仍然自称 CN 网页端。',
  'row.cnBaseCleared': '已回到内置 CN 网关。',
  'row.diagCnBase': 'CN 网关',
  'row.diagCnBaseDefault': '内置（copilot.tencent.com）',
  'row.showNewModels': '显示新出现的模型',
  'row.showNewModelsHint': '在积分读数旁多加一段「· N 新模型」，并在模型选择器里给这些行标一个「新」。这里的「新」指**本机首次记到这个模型 id**，与上游何时上架无关。默认关闭：全新安装时整个目录都算「新」，那个数字说明不了任何事。',
  'row.showNewModelsHintInline': '指本机首次见到，不是上游新上架。默认关闭——全新安装时整个目录都算新。',
}
