<p align="center">
  <img src="docs/assets/dsh-connect-workbuddy-usage-card.png" width="875" alt="Actual DSH model settings: catalog, multipliers, reasoning effort and context budgets" />
</p>

<h1 align="center">dsh-connect-workbuddy</h1>

Local integration includes useful upstream changes through 5.20.32: import envelopes, cooldown retesting, promotion badges, settings compatibility and layout fixes. The optional historical-thinking redaction defaults to off and takes effect on the next request. See [integration notes](docs/UPSTREAM-INTEGRATION-2026-11-08.md).

<p align="center"><b>Connect locally signed-in WorkBuddy models — CN and international — to DeepSeek Harness: read each model's credit multiplier automatically, toggle image input per model, switch between multiple accounts, and keep daily check-in with a read-only credits overview in capsule readouts on the card and in the composer.</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-connect-workbuddy"><img src="https://img.shields.io/npm/v/dsh-connect-workbuddy?style=flat-square&label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-connect-workbuddy"><img src="https://img.shields.io/npm/d18m/dsh-connect-workbuddy?style=flat-square&label=downloads&color=cb3837" alt="npm downloads"></a>
  <a href="https://github.com/dingminhua/dsh-connect-workbuddy/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/dingminhua/dsh-connect-workbuddy/ci.yml?branch=main&style=flat-square&label=tests" alt="test status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/dingminhua/dsh-connect-workbuddy?style=flat-square" alt="MIT license"></a>
  <a href="https://github.com/dingminhua/dsh-connect-workbuddy/stargazers"><img src="https://img.shields.io/github/stars/dingminhua/dsh-connect-workbuddy?style=flat-square" alt="GitHub stars"></a>
  <a href="https://dshfind.com/plugins/dingminhua/dsh-connect-workbuddy"><img src="https://dshfind.com/api/badge/dingminhua/dsh-connect-workbuddy" alt="dshfind plugin"></a>
</p>

English | [简体中文](README.md)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) bundle plugin that connects locally signed-in WorkBuddy models to the DSH model picker — **both the CN app and the international WorkBuddy AI app are supported** — with an account pool, selectable model management, and a set of read-only capabilities built around credits: **every catalog refresh reads each model's credit multiplier from upstream** (the `x0.79` figure comes entirely from the upstream catalog; the plugin neither hard-codes it nor guesses), image input is toggled per model, multiple accounts can be switched or fail over automatically through the pool, and daily check-in plus read-only credit overviews shown as compact pills on the card and in the composer. **The CN and international sides are two parallel providers (`workbuddy` / `workbuddy-global`) that can be used at the same time**; the settings page separates them with tabs for convenient management. All it needs is a WorkBuddy sign-in on this machine — or **one sign-in from the browser**.

<a id="risk-notice"></a>

## 1. Risk notice

> **WorkBuddy has begun restricting requests from unofficial clients. This project does not promise that these endpoints will keep working; the day upstream tightens its rules, the plugin may stop working. Read the [Disclaimer](#disclaimer) at the end of this file and judge the account risk for yourself. Using the official WorkBuddy client is always the safest choice.**

It is worth stating what this plugin is actually for: **saving you the trip back and forth between the WorkBuddy client and DSH.** You are already signed in to WorkBuddy on your own machine; the plugin simply connects that existing sign-in to DSH's model picker so you can use it where you write code — it does not supply accounts, share credentials, or bypass billing. Every call spends **your own account's** quota at the multiplier upstream reports, and the plugin does not grant additional account privileges. Balance reads are read-only; chat, media generation and check-in make the corresponding upstream requests.

It depends on the WorkBuddy client's own endpoints (not a public API), so the plugin may need to follow along when upstream changes them — that is normal for a tool of this kind, and it is the reason this notice exists. **Judge the account risk yourself before deciding to install.**

<a id="features"></a>

## 2. Features

This fork is based on upstream 5.20.3. Development uses main. See [CREDIT-JOURNAL.md](docs/CREDIT-JOURNAL.md) for response credit records and account attribution.

- **CN and international providers.** Accounts and settings are separated between `workbuddy` and `workbuddy-global`. Each region can be enabled independently. Disabling a provider removes its models from the picker; a session still using one of those models must select another provider.
- **Four settings sections.** Accounts contains account selection, pool membership, balances and batch actions. Models contains the catalog and model settings. Capabilities contains optional tools and display controls. Diagnostics shows runtime information for troubleshooting. Switching sections retains the current draft.
- **Model settings and prices.** Refresh reads the upstream catalog and applies its models and prices immediately. Enabled models, context budgets, image-input selections and default reasoning levels remain drafts until Save. Image-input defaults and support for disabling reasoning come from the reviewed capability tables; users can adjust supported options. A context budget tells DSH to compact earlier and does not enlarge the upstream limit.
- **Campaign and load indicators.** Campaign badges use the catalog snapshot and declared time windows. Advertised discounts do not prove the final charge for a request. CN load indicators use a separate read-only probe; a failed or unknown reading leaves the indicator absent. The tested international endpoints did not expose load data. Details and historical measurements are in [PROMO_BADGE.md](docs/PROMO_BADGE.md).
- **Availability tests.** A model test sends a real request, normally around 25,000 input tokens, and may consume credits. A small successful probe does not establish that a longer conversation will pass upstream limits. An upstream reset time indicates when a retry may be eligible; it does not guarantee recovery. Catalog tests accept one model at a time. Pool tests run that saved model against the selected members.
- **Account management.** Sign in from the card, import credentials, or detect the desktop app's local sign-ins. Credentials are stored in the plugin vault; desktop auth files remain read-only. Removing an account removes the plugin copy and hides discovery results; detecting accounts again can restore a desktop account. Import previews redact token values. An encrypted desktop auth file requires the corresponding installed app to read its field key.
- **Account pools and reserves.** Pool membership starts empty and takes effect after Save. Automatic routing ranks usable members and can retry eligible account failures on another member. Manual check-in and tests remain available with routing disabled. CN personal accounts support optional automatic check-in, off by default; enterprise and education accounts do not receive personal rewards. The last saved member can be reserved under the rules in [Last-account reserve](#last-account-reserve).
- **Credits and account switching.** The card and composer panel show per-account balances and availability. Use an account's Switch button; the active account is marked In use. Composer visibility follows the session's selected provider. Its preferred position is configurable, and a later-loaded readout moves left when that position is occupied. Balance reads do not generate model requests; model tests, chat and image generation can consume credits.
- **Benefits.** The pool shows eligible unclaimed personal campaigns. Claim handles one campaign for one account, rechecks its status, sends the claim request and refreshes the result. The server's active and claimed flags determine eligibility; local expiry highlighting is only a display aid.
- **Image generation and editing.** `workbuddy_draw_image` is off by default and enabled per region under Capabilities. Supplying `image` selects editing; omitting it selects generation. Historical measurements used different models and credit pools: about 5.71 credits on CN and 0.03 on the international gateway. Use the current response and account records to assess charges. A failed request may already have incurred a charge. Details, supported input formats and measured sizes are in [IMAGE_GEN.md](docs/IMAGE_GEN.md).
- **Optional CLI route.** Enabling the local CodeBuddy CLI adds `codebuddy_ask` and `/codebuddy`. The CLI can read and modify files and run commands in its working directory. It uses the configured accounts and does not remove account restrictions. See [CLI route](#cli-route-optional-let-codebuddy-do-the-work).
- **Optional request handling.** Usage identity, prompt ordering, lightweight session titles and automatic continuation have separate controls. Automatic continuation is off by default, can send another real request and is bounded by a consecutive-send limit. Changing startup-only options requires reloading the plugin or restarting DSH. These options do not guarantee that an upstream refusal will be resolved.
- **Sidebar and diagnostics.** The optional sidebar entry opens the settings card as a page and is off by default. Its capability switch saves immediately. `status`, `doctor` and `logout` provide command-line account diagnostics and local sign-out controls.

<a id="how-it-works"></a>

## 3. How it works

```text
DSH PiAiAdapter (one stack per provider)
  -> secure loopback shim (one random port + in-process random secret per region)
  -> WorkBuddyUpstreamClient
  -> CN: https://copilot.tencent.com/v2/chat/completions
  -> Global: https://www.workbuddy.ai/v2/chat/completions
  -> WorkBuddy SSE
  -> DSH executes local tools and returns their results
```

The CN and international sides each own a complete runtime stack — credential store, model catalog, loopback shim, adapter — with visibility filtered by credential domain (`workbuddy.ai` / `codebuddy.ai` → international; recognized CN domains → CN), so **both regions' accounts can be signed in and used by different sessions at the same time**. The international product has two brand domains: the desktop app signs in at `workbuddy.ai`, while the CodeBuddy CLI signs in at `codebuddy.ai` — both are international.

The model catalog comes from each region's correct source, and both read the **same** `/v3/config` document the WorkBuddy app itself consumes, **as the app's own client identity** (`WorkBuddy/<app> WorkBuddy/<app> CLI/<cli>`, the header the desktop's `buildVlmGatewayHeaders` builds). That is required, not cosmetic: `/v3/config` serves a different product configuration per **client channel**, and the CLI channel's answer is a strict subset of the app channel's that publishes **neither `modelPromotions` nor `modelTiers`** — reading as the CLI is what left the CN badge empty. Chat and the availability probe still send as the CLI agent (the conversation-identity triple is bound to the chat channel); only the catalog read uses the app identity. If CN cannot read `/v3/config`, it falls back to the legacy `/v2/enterprises/personal/models` and logs a line, so that path is used only while degraded. The credits overview comes from `https://www.codebuddy.cn/v2/billing/meter/get-user-resource` (international accounts auto-route to the global gateway their credential belongs to, `workbuddy.ai` or `codebuddy.ai` — tokens are not interchangeable across the two brand domains); all are read-only.

Credentials are read (read-only) from the WorkBuddy desktop app's own auth file. Refreshed tokens are kept per region in `$DSH_HOME/.workbuddy-auth.cn.json` and `$DSH_HOME/.workbuddy-auth.global.json` (two simultaneously signed-in accounts never overwrite each other; the legacy single file `.workbuddy-auth.json` is still read as a migration source); the desktop app's file is never written.

**Encrypted credential fields**: newer desktop builds (Windows first) replace the auth file's `accessToken` / `refreshToken` strings with an AES-256-GCM envelope (`{"$wbEncrypted":1,"envelope":"…"}`), and the account's **display name (`nickname`) is encrypted the same way** — a missing usable display name is shown as an unnamed account. The envelope is sealed with a field key **compiled into the app itself**, not a user secret — so the plugin ships no key copy. When it meets an encrypted document it runs the installed app with `ELECTRON_RUN_AS_NODE` and calls that app's own native binding (`electron_browser_workbuddy_storage.loggerGet()`) to fetch the same payload and derive the key locally: it asks the very build that wrote the file. The key is cached in process memory only — never on disk, never in logs. Plain-string credential documents take the original path and never spawn a child process. `account.phoneNumber` is encrypted there too, and the plugin deliberately **neither reads nor displays it**. If the app lives somewhere unusual, point `WORKBUDDY_APP_EXECUTABLE` at its executable.

<a id="account-pool"></a>

## 4. Account pool

<img src="docs/assets/dsh-connect-workbuddy-account-pool.png" width="900" alt="Actual DSH account pool: saved order, rate limits, active account and reserved account; account identifiers redacted" />

CN and international accounts have separate pools, members and test settings. Membership starts empty. Select the accounts you want to use and save before running batch actions or enabling automatic routing.

<a id="batch-check-in-and-tests"></a>

### 4.1 Batch check-in and tests

**Check in selected** reads each saved member's daily status, then sends a claim request for eligible CN personal accounts. Already claimed rewards are shown as claimed. A failure is recorded for that account and the batch continues. Enterprise and education accounts use enterprise quota; personal rewards do not apply. Optional automatic check-in is off by default. Once enabled and saved, it checks daily status and claims unclaimed rewards for eligible CN personal accounts.

**Test selected** sends one probe request per saved member. Choose the model and input size before saving; the default input is about 25,000 tokens. Earlier measurements passed around 20,000 tokens and were limited around 30,000, so use a size representative of your conversation. Tests use the selected model's rate and can consume credits. A reset time from the response indicates when the plugin may retry; it does not guarantee that the next request will succeed.

Automatic model selection uses the region's free model with the largest context window, where free means a known zero multiplier in the current catalog. Earlier CN catalogs listed hy3 as free, while deepseek-v4.1-flash moved from 0 to 0.11; current catalog values take precedence. A manually selected model that has left the catalog returns target-model-stale and requires a new selection.

<a id="membership-and-drafts"></a>

### 4.2 Membership and drafts

Selecting accounts edits a draft. Save writes the selection to that region's settings, and the save indicator marks unsaved changes. Drafts survive tab changes and closing the card. An empty saved selection makes batch actions return a selection error.

<a id="routing-and-failover"></a>

### 4.3 Routing and failover

With the pool enabled, each request starts with the highest-ranked usable member. Account rate limits, exhausted credits, rejected credentials and connection failures can trigger another attempt with a usable member. If all attempts fail, the error includes the number of accounts tried. Malformed requests, channel-verification failures and model-busy responses follow their own handling. Streaming failures after output has started are returned directly to avoid appending a second answer.

Cooldowns and rejected credentials temporarily exclude members. Untested members initially remain eligible. Request failures update selected members' measurements, including upstream reset times when available; request-parameter failures do not change account availability. Each failover writes a warning to the DSH log. Automatic account choices are runtime state; disabling automatic routing restores the manually saved account selection.

<a id="pool-switch-and-manual-selection"></a>

### 4.4 Pool switch and manual selection

| Action | Pool enabled | Pool disabled |
| --- | --- | --- |
| Account for chat | Highest-ranked usable member | Manually selected account |
| Eligible account failure | Try another usable member | Return the current account's error |
| Batch check-in and tests | Available | Available |
| Test model and input size | Configurable | Configurable |

When routing is off, the Account in use dropdown appears in the account-pool section; selecting an account saves it immediately for that region. When routing is on, ranking determines the account and the dropdown is hidden. Detection, selection, check-in and tests remain in this section.

<a id="ranking"></a>

### 4.5 Ranking

Accounts are compared in the following order, moving to the next key when the previous key is equal:

1. Usability.
2. Whether credits expire within three days.
3. Saved manual member order.
4. Earliest expiry among accounts with expiring credits.
5. Largest amount of expiring credits.
6. Total balance.
7. Latest credential expiry.
8. Account id for stable ordering.

Balance readings remain valid for ranking for 10 minutes. Chat reuses these readings instead of fetching every member's balance for each request. Issue #70 moved expiring-credit priority ahead of total balance: in the reported example, 196.4 credits expired that day while that account ranked below accounts holding about 1,200 more credits. An account with 1 expiring credit can now precede one holding 50,000; ordinary failover handles a balance that cannot cover a complete request.

<a id="availability-and-recovery"></a>

### 4.6 Availability and recovery

| Outcome | When the plugin may try the account again |
| --- | --- |
| Usable | Immediately eligible |
| Rate limited | Upstream reset time, or after 30 minutes when absent |
| Credits exhausted | After the recorded credit-package refresh time |
| Connection or server failure | After 30 minutes |
| Credential rejected | After credentials are updated and a manual test succeeds |
| Model removed | After selecting another test model and a manual test succeeds |
| Account restricted | After upstream resolves the restriction and a manual test succeeds |

These are local eligibility rules, not guarantees of upstream recovery. Account ids are hashes of uin or uid, so signing in again retains the same stored restriction. A successful manual test restores eligibility. When a locked reserve remains and no preceding candidate is usable, the request stops. Other empty-candidate cases retain the saved-account fallback. A selection error stops the request rather than bypassing the reserve rule.

<a id="saving-model-settings-and-pool-settings"></a>

### 4.7 Saving model settings and pool settings

Model management and the account pool have separate drafts and Save/Discard actions. Each save writes its settings and reads them back before ending the busy state; a failed save retains the draft. Usage refresh follows separately. A refresh failure after a verified save is a status message, while a failed write is an alert. This addresses issue #131, where a completed save waited indefinitely for a slow refresh.

Measurements, cooldowns and the account currently serving are runtime records stored separately from editable preferences. Saving a draft preserves newer runtime measurements.

<a id="install"></a>

## 5. Install

> ⚠️ **Version requirement: DSH 0.1.7-rc.1 or newer (current window: `0.1.7-rc.1` – `0.2.x` GA).** Since v2.1.0 this plugin only supports hosts on DSH 0.1.7-rc.1 and above (older hosts cannot resolve the dependencies to install this version); hosts on 0.1.5 and earlier should stay on v2.0.15. Since v2.1.2 the upper bound is **`<0.3.0-0`**; the 0.3.0 line is explicitly refused. See [Supported host range](#supported-host-range) below.

> ⚠️ **For the CN 「channel verification」 400 (`code 11128`), make sure the plugin is ≥ 5.14.1.** From 5.13.1 the plugin rewrites the known fixed fingerprints **before the request is sent**, and 5.14.0 adds the Web-GUI paragraph's SECOND sentence (#167, the branch still reproducing on 5.13.1); 5.12.x and earlier only had the neutral-head + zero-width ladder, which measured **400 on every rung** for the same body (matrix in [#164](https://github.com/dingminhua/dsh-connect-workbuddy/issues/164)). Anyone left on an older build keeps hitting a 400 that is already fixed, and it looks like "fails every single time, restarting does nothing".
>
> ⚠️ **Do not treat the marketplace's "latest" as the schedule — it reads an index that lags.** The community marketplace serves a periodically built snapshot, collected per package: at the 2026-10-30 15:00 observation this plugin still listed only 5.13.1 while npm `latest` was already 5.14.1, and a desktop host separately flags any release under 24 hours old as "waiting". Trust `npm view dsh-connect-workbuddy version` and [Releases](https://github.com/dingminhua/dsh-connect-workbuddy/releases), and follow [Update](#update) below (pin the **exact version**); or hand [`docs/PINNED-UPGRADE-LAG.md`](docs/PINNED-UPGRADE-LAG.md) §3 to an AI and let it run.
>
> The other thing that stops people from upgrading: **pnpm's 24-hour release-age window** (`minimumReleaseAge`) **silently resolves a floating range back to the previous version**. When you need this fixed right now, pin the **exact version**: `dsh-connect-workbuddy@5.20.2`.

<a id="supported-host-range"></a>

### 5.1 Supported host range

DSH's shipped gate (`evaluatePluginCompatibility` in `packages/boot/app-boot/src/plugin-compatibility.ts`) checks every declared `dsh-*` peer range; **one unsatisfied peer skips the entire bundle** (it lands in `skippedBundles` and is only printed to stderr) — no provider is registered, no card appears, the model list goes empty, and the page shows no error at all.

| Host version | Verdict |
| --- | --- |
| `0.1.7-rc.1` – `0.1.7-rc.2` | ✅ supported |
| `0.2.x` **GA** (`0.2.0`, `0.2.1`, …) | ✅ supported (verified from 2.1.2) |
| `0.2.x` **prerelease** (`0.2.0-rc.1`, `0.2.1-rc.1`, …) | ⚠️ outside the declared range — see below |
| `0.3.0-0` and above | ❌ explicitly refused (that line is unverified) |
| `0.1.6` and earlier | ❌ explicitly refused (0.1.5 users should stay on v2.0.15) |

> **On `0.2.x` prereleases (corrected in v4.7.0)**: this table previously listed `0.2.0-rc.1` as "✅ supported". That was **wrong**.
> npm semver admits a prerelease only when a comparator carries a prerelease on the **same `major.minor.patch` tuple**.
> The declared `>=0.1.7-rc.1 <0.3.0-0` opens only `0.1.7-x`, while `<0.3.0-0` excludes the `0.3.0` tuple — so versions such as
> **`0.2.1-rc.1` is excluded under default prerelease matching** (`satisfies('0.2.1-rc.1', …) === false`).
> The practical impact is small: the host gate only evaluates the `@deepseek-ai/dsh*` namespace (other peers are skipped entirely), and
> it evaluates those peer ranges with `semver.satisfies(rt, range, { includePrerelease: true })` — so rc hosts are **admitted**: the gate
> really does check, it just lets prereleases through (the corrected attribution is in
> [`docs/DSH-0.2.1-RC3-FOLLOWUP.md`](docs/DSH-0.2.1-RC3-FOLLOWUP.md) §3). It is also **not fixable by editing the range** — no static range
> can cover "any `0.2.x` prerelease"; five candidate formulations were computed and refuted (see CHANGELOG 4.7.0). It resolves itself once
> the host ships `0.2.1` GA.

> The upper bound is written `<0.3.0-0`, not `<0.3.0`: **the DSH tags examined in the original compatibility check were prereleases** (`-alpha.N` / `-rc.N`), so `<0.3.0` alone would admit the entire unverified `0.3.0-alpha.1` / `0.3.0-rc.1` line, leaving the guardrail inert — exactly the defect shape 2.1.2 fixes. `tests/dsh-line.spec.ts` guards this contract, including the prerelease cliff.

> 🪟 **Platform support: Windows, macOS, and Linux are supported side by side.** **Windows is a first-class target**, not an afterthought: CI runs the full suite on `windows-latest`, and four areas carry Windows-specific branches with their own tests — credential paths, process heartbeat, desktop-app executable lookup, and settings writes. **When fixing a defect that only reproduces on Windows, the Windows reporter's field evidence and an encryption vector captured from a real Windows install are what the fix is judged against** (see the 2.0.6 / 2.0.11 / 2.0.12 sections of [CHANGELOG](CHANGELOG.md)). See the [Platform support](#platform-support) section for the per-platform differences and known limitations.

Sign in through the plugin, import a compatible credential, or reuse an installed WorkBuddy app's sign-in. Encrypted desktop credentials require the corresponding app to be present.

```sh
dsh plugin --profile desktop add dsh-connect-workbuddy
```

Or directly via npm:

```sh
npm install dsh-connect-workbuddy
```

Restart the DSH process after install/update/uninstall.

> ⚠️ **Pin an EXACT version for a fresh release; do not rely on a floating range.** Some DSH profiles configure a release-age window (`minimumReleaseAge`, measured as 24 hours in the profiles below), so shortly after a version ships a floating range is **silently resolved back to the previous one**: `^4.4.2` still resolves to `4.4.2`, while an exact `4.4.3` gets `4.4.3` immediately. Both spellings "install successfully", so the symptom is *"the upgrade command finished and the version did not change"* — easily misread as a failed release. Measured twice (isolated directory, `--lockfile-only`, touching nothing of the user's environment):
>
> First run, pnpm 12.3.4 (the 4.4.x era):
>
> | Target spelling | Resolved version |
> | --- | --- |
> | floating `^4.4.2` | **4.4.2** ⚠️ |
> | exact `4.4.3` | **4.4.3** |
> | floating + `--config.minimum-release-age=0` | **4.4.3** |
>
> Second run, pnpm 10.34.5 (2026-10-30, 5.14.1 eleven hours old, `minimumReleaseAge=1440` set explicitly):
>
> | Target spelling | Result |
> | --- | --- |
> | floating `^5.13.1` | resolves to **5.13.1**, **no error** ⚠️ |
> | exact `5.14.1` | `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, refused outright |
> | exact `5.14.1` + `minimumReleaseAgeExclude: [dsh-connect-workbuddy]` in the profile's `pnpm-workspace.yaml` | **5.14.1** ✅ |
> | setting absent (pnpm default) | floating `^5.13.1` → **5.14.1** ✅ |
>
> To pick up a new release right away, pin it: `dsh plugin --profile desktop add dsh-connect-workbuddy@5.20.2`; if the window refuses it, see [`docs/PINNED-UPGRADE-LAG.md`](docs/PINNED-UPGRADE-LAG.md) §2 for the two routes (wait out the window, or add that exclude line). A floating range catches up once the window elapses.

The plugin also runs under **Web** and **TUI**; pick the command matching your profile:

```sh
dsh plugin --profile web add dsh-connect-workbuddy     # Web
dsh plugin --profile dsh-tui add dsh-connect-workbuddy # TUI
```

<a id="update"></a>

## 6. Update

> **Whatever the marketplace shows is a snapshot; `npm view dsh-connect-workbuddy version` and [Releases](https://github.com/dingminhua/dsh-connect-workbuddy/releases) are the truth.**
> Measured 2026-10-30: the community index (`dsh-plugin-catalog`, built that same day) still listed only **5.13.1** for this plugin while npm `latest` was **5.14.1**. Lag happens **per package** — the same index carried `@changfenhuang/dsh-genui` 0.15.0, `dsh-client-auto-continue` 0.17.0 and `billion-context` 0.1.209 (all current) — so "that other package shows a new version" proves nothing about this one.

**Manual update**: first query `npm view dsh-connect-workbuddy version`, then install that exact version. The 5.15.1 command below is a historical example:

```sh
dsh plugin --profile desktop add dsh-connect-workbuddy@5.20.2
dsh plugin --profile desktop exec dsh-connect-workbuddy doctor   # first line carries the version
```

**Let an AI do it**: paste the block below into DSH; it runs the version check, the install and the verification, and comes back to you only when a pnpm setting has to change:

```text
Update dsh-connect-workbuddy to the latest version on npm. Follow these steps, do not skip any:
1) run `npm view dsh-connect-workbuddy version` first to learn what latest currently is;
2) install the EXACT version: `dsh plugin --profile desktop add dsh-connect-workbuddy@<version from step 1>`;
3) if it fails with ERR_PNPM_NO_MATURE_MATCHING_VERSION, do NOT fall back to a floating range
   (that silently installs the older build); tell me how long this version still has to wait, or ask
   whether to add `minimumReleaseAgeExclude: dsh-connect-workbuddy` to the profile's pnpm-workspace.yaml;
4) afterwards run `dsh plugin --profile desktop exec dsh-connect-workbuddy doctor`
   and read the version on its first line back to me;
5) remind me to restart/reload DSH (the bundle's host half loads at startup).
My profile is desktop.
```

> Do not tell an AI to "retry until it succeeds": inside the window every retry gets the same refusal, and pnpm offers no one-shot bypass.

**Confirming it actually changed**: the first line of `doctor` (`WorkBuddy Connect 5.15.1 on …`), or the top-level `version` in `status --json`. **Do not** look for `/workbuddy status` (the slash command this plugin registers is `/codebuddy`, which forwards to the local CodeBuddy CLI), and **do not** look for a version row in the card's Diagnostics tab (it has exactly eight rows — region, domain, serving account, sign-in expiry, catalog size, enabled count, account pool, last failure — and no version). Restart or reload, then judge.

Details (how the market index and the pnpm window each stop you, and both ways through) are in [`docs/PINNED-UPGRADE-LAG.md`](docs/PINNED-UPGRADE-LAG.md); the same text is posted as a long-term pinned issue.

<a id="platform-support"></a>

## 7. Platform support

All three platforms are supported targets; the differences below are **implementation facts**, not polite ways of saying "not yet supported". To change this section, change [`docs/WINDOWS.md`](docs/WINDOWS.md) too — that file is where platform-related constraints are registered.

| Aspect | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Default credential directory | `%LOCALAPPDATA%` / `%APPDATA%` first, falling back to `<home>\AppData` when unset (so a redirected profile still resolves) | `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth` | `$XDG_CONFIG_HOME` first, falling back to `~/.config` |
| Desktop-app executable | `%LOCALAPPDATA%\Programs\WorkBuddy`, `%LOCALAPPDATA%\WorkBuddy`, and both `Program Files` (located as `WorkBuddy.exe`) | Read from the bundle's `Info.plist` (`CFBundleExecutable`) — the real value is **`Electron`**, never guessed from the app name; covers the international `WorkBuddy AI.app` and apps filed under a subdirectory of `/Applications` | Not applicable (no corresponding app for encrypted credentials on Linux; point `WORKBUDDY_AUTH_FILE` at the credential) |
| Process-heartbeat timestamp source | PowerShell `Get-Process` `StartTime` (POSIX has no `ps -lstart` equivalent) | `ps -o lstart=` | `ps -o lstart=` |
| Child-process window | **`windowsHide` is required**: the host itself has no console (it is a GUI process), so without it every probe flashes a visible black window on screen | Not applicable (the option only takes effect on Windows) | Not applicable |
| Transient settings-file contention | **Does hit it**: an antivirus scanner / OneDrive / an editor locking the profile's `cordis.patch.yml` briefly makes the rename replace fail, and `@deepseek-ai/dsh-atomic-write`'s retries are enabled **only on `win32`** | Does not: POSIX rename replaces outright, so the same code never enters the retry branch | Same as macOS |
| Credential vault file permissions | **`mode: 0o600` has no effect**, because permissions come from the inherited DACL → the plugin removes inherited permissions and grants owner / SYSTEM / Administrators access with `icacls`. Other explicit grants may remain. `doctor` checks listed principals and reports `protected` / `exposed` / `unverified` | Enforced by `mode 0600` | Enforced by `mode 0600` |
| CI coverage | `windows-latest`, full suite | The developer's own Mac | `ubuntu-latest`, full suite |

**Four Windows-specific things worth knowing**:

1. **An account change may fail to save** (the profile's `cordis.patch.yml` held open). The plugin **reads the value back after writing**: it reports "cleared" only once the write is confirmed on disk, and otherwise reports the failure and keeps your previous choice. Close whatever holds the file and retry. See [Known limitations](#known-limitations).
2. **Credential paths are partly verified on real Windows hardware.** The candidate list is derived from platform conventions and pinned by unit tests (including both the unset and the blank-string fallback for `LOCALAPPDATA` / `APPDATA`). On a real Windows 11 machine, `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth` and `%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe` **did resolve**, and the encrypted credential's `keyId` matched the registered vector verbatim. **The remaining candidates are still not verified per-item** — if your credential or app lives elsewhere, point `WORKBUDDY_AUTH_FILE` / `WORKBUDDY_APP_EXECUTABLE` at it and please report what you see.
3. **Encrypted credentials (from 5.6.0) require the desktop app to be present**, on Windows exactly as on macOS; if the app lives in a custom directory (e.g. `E:\WorkBuddy\WorkBuddy.exe`), point `WORKBUDDY_APP_EXECUTABLE` at it.
4. **The credential vault stores PLAINTEXT tokens** (issue #183). The plugin's vault directory `<DSH home>/workbuddy-vault/<region>/<accountId>.json` holds the decrypted `accessToken` / `refreshToken`, **unencrypted**. From 5.16.0 on Windows, writes use `icacls` to remove inherited permissions and grant owner / SYSTEM / Administrators access. Other explicit grants may remain. The `Credential vault ACL` line checks listed principals, not all effective rights. See [WINDOWS.md](docs/WINDOWS.md) for caching and propagation limits. But **restricted permissions are not encryption** — an administrator, a SYSTEM service, or an attacker who already has your user token can still read it. For encryption at rest, keep the DSH home on a BitLocker / FileVault volume. POSIX platforms rely on `mode 0600`.

<a id="using-it-on-a-server-carry-the-credential-over"></a>

### 7.1 Using it on a server: carry the credential over

On a headless server (or any machine where you would rather not install the WorkBuddy desktop app), the plugin has no local credential to read. The way around it is to **copy the credential directory over from a machine that has already signed in to WorkBuddy** — the plugin only reads that file and does not require the app to be present (**provided the credential itself is not encrypted**, see below):

```sh
# 1) On the machine that is already signed in to WorkBuddy, locate and pack the credential dir
#    macOS:   ~/Library/Application Support/CodeBuddyExtension
#    Linux:   ${XDG_CONFIG_HOME:-~/.config}/CodeBuddyExtension
#    Windows: %LOCALAPPDATA%\CodeBuddyExtension  and  %APPDATA%\CodeBuddyExtension
tar czf codebuddy-cred.tgz -C <the parent directory above> CodeBuddyExtension

# 2) Move codebuddy-cred.tgz to the server and unpack it into the directory the plugin reads
#    Linux:
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}"
tar xzf codebuddy-cred.tgz -C "${XDG_CONFIG_HOME:-$HOME/.config}"

# 3) Confirm the plugin sees it
dsh plugin --profile web exec dsh-connect-workbuddy status
```

> **On Linux both XDG locations are read, in order** (issue #190 corrected what this note used to say). The candidate directories come from `defaultDesktopAuthDirs()` in `src/auth.ts`:
>
> | Platform | The credential directory the plugin actually reads (in probe order) |
> | --- | --- |
> | macOS | `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth` |
> | Linux | ① `${XDG_CONFIG_HOME:-~/.config}/CodeBuddyExtension/Data/Public/auth`　② `${XDG_DATA_HOME:-~/.local/share}/CodeBuddyExtension/Data/Public/auth` |
> | Windows | `CodeBuddyExtension\Data\Public\auth` under `%LOCALAPPDATA%` and `%APPDATA%` |
> | HarmonyOS | `${WORKBUDDY_USER_HOME:-/storage/Users/currentUser}/.local/share/CodeBuddyExtension/Data/Public/auth` |
>
> This note previously said "on Linux there is no `~/.local/share` path" — that was **the implementation at the time**, not a platform fact. `Data/Public/auth` is data, so by XDG convention it belongs under `$XDG_DATA_HOME`, and the machine in issue #190 did keep it there.
>
> ⚠️ **`~/.config` still comes FIRST.** The order decides which copy is used when `WORKBUDDY_AUTH_FILE` is unset, and `~/.config` has been the behaviour since day one; the Linux candidates have never been verified item by item on real hardware, so promoting the new directory would change what existing users resolve without evidence to back it. This change only adds a candidate.
>
> On HarmonyOS, `os.homedir()` returns an **app sandbox** (`/data/storage/el2/base/haps/entry/files`), not the user's home, so the path comes from the fixed system mount point instead — override it with `WORKBUDDY_USER_HOME` when your layout differs.
>
> You can always bypass all of these defaults: point `WORKBUDDY_AUTH_FILE` straight at the auth file (when set explicitly, sibling backup files in that directory are still scanned, so account switching keeps working). Unpacking into `~/.local/share/...` now works too — it is the second Linux candidate — but `~/.config/...` is still checked first, so unpack there if you want the copy you just placed to be the one that wins.

> 🔐 **Encrypted credentials (WorkBuddy 5.6.0 and later) cannot be carried over this way.** Recent desktop builds encrypt the token fields inside the auth file, and the key is fetched at runtime from the app's native binding and never written to disk. On a server without the app, copying the encrypted auth file over **will not be readable** (the plugin reports not-signed-in honestly rather than degrading into reading a truncated token). What works: carry the credential from a machine still running a pre-5.6.0 version or an unencrypted credential, or install the app on that server to obtain the key.
>
> Two `doctor` lines tell you which case you are in:
>
> ```
> Desktop auth file: present (…/CodeBuddyExtension/Data/Public/auth/.workbuddy-auth.json)
> Encrypted-credential support: unavailable (…)
> ```
>
> `Desktop auth file: present` means the file was found; if `status` still reports not-signed-in while `Encrypted-credential support` is `unavailable` (no app on the server), that is the encrypted-credential-without-key case — carrying the file over cannot fix it.

> 🔒 **The credential is the account**: that file is a directly usable session. Transfer it over an encrypted channel (`scp` / private network), tighten it with `chmod 600` once on the server, and keep it out of anything that gets packaged or committed.

<a id="cli-route-optional-let-codebuddy-do-the-work"></a>

## 8. CLI route (optional): let CodeBuddy do the work

> Off by default (`cliBridge.enabled: false`). While it is off, no tool and no command is registered, and the provider route is untouched. **The one exception** is the live pill described below: its read-only route and client component are registered unconditionally (the client needs them to tell "no turn" from "no route"), so an open page still asks that local route every 5 seconds — it never touches the upstream and spends nothing, and answers with an empty array.

This route uses CodeBuddy as a **tool** rather than as a model provider: the plugin exposes a `codebuddy_ask` tool and a `/codebuddy` command, and a local, already signed-in CodeBuddy CLI runs one real turn in its own process — reading files, running `git`, editing code — then hands the conclusion back.

**What this actually buys, stated plainly.** The provider route has to make a request look like a CodeBuddy client to pass the gateway's channel check; since 4.15.x that check matches an exact substring mid-prompt, and the plugin dodges it with zero-width spaces at punctuation boundaries. That is an arms race, and it is no longer free: issue #98 has produced an **account-level** restriction (`code 11140`, "the account shows abnormal behaviour and has been restricted").

The CLI route escapes the **client-fingerprint layer**, not the account layer. It hands the CLI `CODEBUDDY_AUTH_TOKEN` taken from this plugin's own vault — the same WorkBuddy accounts. So the claim "the process talking to the gateway really is the signed-in CodeBuddy CLI, there is no identity to forge, therefore the account cannot be restricted" **does not hold**: the identity is the same set of accounts, `11140` is account-level, and the same accounts are just as restricted on this route. What is genuinely bypassed is "does this request's client fingerprint look like CodeBuddy" — a real gain against the channel check, but not immunity from blocking. The two routes are complementary fallbacks, not a replacement.

<a id="prerequisites"></a>

### 8.1 Prerequisites

- The CodeBuddy CLI is installed (npm package `@tencent-ai/codebuddy-code`; `codebuddy` and `cbc` are the same entry point). For a non-standard install, point `cliBridge.binary` at the absolute path.
- It is signed in. Credentials are resolved in this order: the `CODEBUDDY_AUTH_TOKEN` environment variable, then this plugin's **own** vault (`$DSH_HOME/workbuddy-vault/<region>/<account>.json`). In other words, **the accounts you already signed in for this plugin are reused directly — no second sign-in.** (Verified against the real CLI: `getAuthenticationAttributesSync` checks `CODEBUDDY_AUTH_TOKEN` ahead of its own sign-in file.)
- Region **outranks freshness**: a domestic token is valid against `copilot.tencent.com`, while a global token gets a 401 there (measured: `401 Authentication required ... (target: https://copilot.tencent.com)`). Hence the default `cn,global` order, falling through only when a region fails.

<a id="turning-it-on"></a>

### 8.2 Turning it on

```jsonc
{
  "cliBridge": {
    "enabled": true
  }
}
```

Every other key has a default. See the table below. Changing them does not need a host restart: `cliBridge` is a volatile field, so a change rebuilds only this route instead of reloading both provider stacks.

<a id="the-two-entrances"></a>

### 8.3 The two entrances

| Entrance | Who triggers it | Working directory | Whose budget it spends |
| --- | --- | --- | --- |
| `codebuddy_ask` tool | the model decides to call it | the session workspace, or a `working_dir` the caller passes, or `cliBridge.workingDir` | CodeBuddy quota, plus the DSH tokens of the wake-up the result is injected into (`injectResult` is on by default) |
| `/codebuddy` command | a human types it | **always the current session workspace** | the same — the command itself skips the model, but by default the result is injected back into it |

An **empty** `/codebuddy` means "review the uncommitted changes in this workspace" (that invocation is forced to the read-only `dontAsk` permission mode and is told to run `git diff` itself and report only what it actually saw); **text after it** is sent through verbatim; **a leading `--edit`** grants write permission for that one turn (`acceptEdits`, e.g. `/codebuddy --edit fix this null deref`) without changing the default. `--edit` on its own means "review and fix what you find".

When the turn finishes, the conclusion is **injected back into the session model** (`cliBridge.injectResult`, on by default): an idle session is woken for a new turn, a running one gets it queued for its next step. **That step really spends DSH tokens** — set `injectResult` to `false` to leave the model untouched, and the `/codebuddy` result is then shown to you only. The injected text starts with `[dsh-connect-workbuddy · 由 /codebuddy 自动回注，不是用户输入]` so neither you nor the model mistakes it for a human message.

<a id="while-it-runs-the-pill-under-the-composer"></a>

### 8.4 While it runs: the pill under the composer

A Host tool call is **one-shot**: the interface learns nothing until `execute()` returns. The minutes in between — reading files, running `git`, retrying — used to be a blank spinner, and a user could not tell "still working" from "hung".

So the plugin registers a **live pill** on `conversation.composer.dock` (the row under the composer, next to the credit readout): `CodeBuddy · 7 tools · 42s · last: Bash`. It is fed by the plugin's own read-only route, `/plugins/dsh-connect-workbuddy/cli-live`, which serializes the host-side live board (`src/cli-bridge/live.ts`).

- **It appears only while a turn is live.** With nothing running the component renders `null`, so the row is untouched — and the route is registered **unconditionally** (even with the switch off) so the client can tell "no turn" from "no route" without knowing the switch's state.
- **It describes only the turn this session started.** The live board is **host-wide** (one route answers for every session in the process), so the seat — `conversation.composer.dock`, declared `scope: 'session'` — hands the registration a `sessionId` and the pill keeps only those rows. Without that filter, session A's composer would describe session B's turn (or another tab's): a line about a directory the reader is not in, with a counter that keeps moving. When the host passes no `sessionId` (an older host, or a test mounting the component directly) the filter is **off** — losing a diagnostic readout is worse than showing a neighbouring turn — and a row the host could not attribute (`sessionId: ''`) is kept for the same reason: it is still evidence of real work.
- **No provider gate.** The credit readout renders only while the session's model is a WorkBuddy provider, because it reports that provider's quota. This pill reports a local process, and the CLI route is deliberately model-independent: a turn started from a DeepSeek session has to be visible too. `cliBridge.enabled` needs no separate check either — with the bridge off no turn can begin, the board is empty, and the pill renders nothing.
- **The seconds tick locally, without extra requests.** The document is polled every 5s; the counter is advanced by a 1s local tick from `startedAt`. Concurrent sessions share **one** in-flight request (module cache + inflight dedupe), within the same page. Separate browser tabs have separate module caches and poll independently.
- **Clock skew is corrected against the host.** `startedAt` is the host's clock; a browser a minute behind would compute a negative age. The document ships `serverTime` and the client derives an offset from it — recomputed **only when a fresh document arrives**, because a cached one carries the old `serverTime` and re-measuring each poll would subtract the elapsed time again and freeze the counter.
- **The tool count is an approximation.** It counts `tool_use` frames in the CLI's NDJSON; `phase` is `starting` / `running` / `finishing`, and `lastTool` is the most recent tool name. These are progress signals for a human, not a billing figure.
- **It neither lies nor lingers.** A document whose `serverTime` is not a finite number is discarded whole (otherwise the label would print `NaNs`), and three consecutive failed polls clear the pill; the 5-second interval does not include request duration, so this is not a fixed 15-second deadline. This clears the display rather than leave a ghost describing a turn that ended. With several turns live in one session it shows the newest and appends `+N`; the directory goes in the tooltip only, because this dock is one line.

> The pill lives in the plugin's client entry (`dsh.client`), so changing it means **rebuilding `lib/client.js` and restarting the Host**, same as host-side code.

<a id="permissions-read-only-by-default"></a>

### 8.5 Permissions: read-only by default

`permissionMode` defaults to **`dontAsk`**: read-only tools (Read/Glob/Grep) run, writes and command execution are refused, and the turn **does not hang** — the CLI ends the turn itself and reports which tools were denied.

**Why not `plan`**, the more conservative candidate and the default this review suggested: under `-p` (headless), `plan` emits a `control_request` and waits on stdin for an approval, and an unattended call has nobody at the terminal to click it. Left unhandled, the CLI waits out its own 60-second protocol timeout while the plugin waits out `timeoutSecs` (900 seconds by default) — both measured attempts hung exactly this way. Hence `dontAsk` as the default, plus an explicit denial of every `control_request` in the runner. **The denial is per tool.** Only `ExitPlanMode` carries `interrupt: true` (without it `plan` will not finish; measured hanging past 70 seconds). Every other tool (Bash, Write, …) must NOT carry it: with it the whole turn aborts (measured under `acceptEdits` — a denied Bash gave `is_error`, an empty reply, and a 4.2-second turn), while without it the CLI records the denial and picks a different tool, finishing normally (measured: it switched to PowerShell and succeeded in 12 seconds). To let it edit files for real, set `acceptEdits` explicitly.

<a id="working-directory-a-four-step-ladder-plus-allowed-roots"></a>

### 8.6 Working directory: a four-step ladder plus allowed roots

`codebuddy_ask` resolves its directory as: the caller's `working_dir` → **this session's workspace** (`session.header.cwd`) → `cliBridge.workingDir` → (only when `allow_unattended` is on) a scratch directory → otherwise it **refuses and explains the three ways out**.

Whichever step wins, the directory must pass three checks: **absolute**, **exists and is a directory**, and **inside an allowed root** (the session workspace, `cliBridge.workingDir`, `cliBridge.allowedDirs`). These checks constrain the startup directory; later file access depends on CLI permissions and operating-system permissions. `allowedDirs` is a comma-separated list of absolute paths for directories outside the workspace. So a model that invents `/` or `~/.ssh` cannot get it executed, and `..` cannot walk out (the comparison uses resolved `realpath` and matches on path-separator boundaries, so `/repo-evil` is not inside `/repo`).

<a id="configuration"></a>

### 8.7 Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Enables the CLI tool and command. The read-only progress route and client component remain registered independently. |
| `binary` | `''` | Absolute path to the CLI executable. **When empty, only known install locations are probed and a miss refuses to run** — it never falls back to whatever `codebuddy` is on PATH (that binary would be handed the vault token). |
| `model` | `''` | Passed to `--model`; empty uses the CLI's own default. |
| `permissionMode` | `dontAsk` | `dontAsk` (default, read-only) / `plan` / `default` / `auto` / `acceptEdits` / `bypassPermissions`. The last two can write. |
| `effort` | `''` | `--effort`: `minimal` / `low` / `medium` / `high` / `xhigh` / `max`; empty uses the CLI default. |
| `maxTurns` | `10` | CLI turn limit for one task (hard cap 100). |
| `timeoutSecs` | `900` | Wall-clock timeout for one task, in seconds (hard cap 1800). |
| `regionOrder` | `cn,global` | Credential region priority. |
| `workingDir` | `''` | Default working directory for the tool entrance, and also one of the allowed roots. |
| `allowedDirs` | `''` | Extra allowed roots: comma-separated absolute paths. |
| `appendSystemPrompt` | `''` | Appended to the CLI system prompt; empty appends nothing. |
| `allowUnattended` | `false` | Allow falling back to a scratch directory when no working directory exists. Off by default: the CLI can read and write, so it should not run in a directory nobody named. |
| `maxReplyChars` | `60000` | Maximum characters handed back to the session model; longer replies are truncated with a note (hard cap 400000). |
| `injectResult` | `true` | Whether to inject the result back into the session model. Only `false` leaves the model completely untouched. |
| `sessionContinuity` | `auto` | Resume the CLI conversation for the same DSH session; `off` starts a new one. Explicit `session_id` takes precedence. |
| `maxTurnsPerSessionHour` | `6` | Turns per session per hour. `0` disables the cap. |
| `maxTurnsPerHour` | `20` | Turns across all sessions per hour. `0` disables the cap. |

<a id="boundaries"></a>

### 8.8 Boundaries

- **Separate conversation history.** CodeBuddy receives the task instruction and its own CLI history. It does not receive the DSH transcript automatically. From 4.14, `sessionContinuity: auto` resumes the CLI conversation for the same DSH session; `off` starts a new conversation, and an explicit `session_id` takes precedence.
- **Writing is gated, not sandboxed.** `dontAsk` is read-only by default; once you set `acceptEdits` it really does edit files in the workspace. The allowed roots constrain **where** it runs, not **what** it does there.
- **Two separate budgets.** CodeBuddy CLI quota and DSH model credit are unrelated. The command itself spends no DSH model tokens, but the default injection makes the session model take another turn — that one is real DSH usage. The tool description carries the cost signal, and the hourly caps exist to stop an "inject → model asks again → inject again" loop.
- **It fails instead of trying every account.** Only a recognised credential refusal (401 / `Authentication required` / `/login`) moves on to the next account; timeouts, crashes and a missing CLI are raised immediately — retrying a 900-second timeout across a dozen vault accounts is worse than the failure. The walk also no longer looks at what the model said: an early version scanned the CLI's **prose** too, so reviewing code that merely quoted `HTTP 401` discarded a good turn.
- **A timeout kills the whole process tree.** The CLI spawns `git` / `npm`, so killing only the direct child leaves orphans. POSIX signals the process group; Windows uses `taskkill /T`.
- **Restart needed.** New bundles and JS changes only take effect after a DSH host restart.

<a id="command-line"></a>

## 9. Command line

```sh
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-connect-workbuddy status   # sign-in state and remaining credit
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-connect-workbuddy doctor   # credential paths and host diagnostics
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-connect-workbuddy logout   # clear the plugin-held credential copy
```

`status` and `doctor` accept `--json` for machine-readable output.

<a id="device-identity-environment-variables"></a>

### 9.1 Device-identity environment variables

The outbound identity profile (`wireProfile`) and the device-header tier (`deviceTier`) are **card settings**, not environment variables. The variables below are the escape hatches for cases a card setting cannot reach:

| Variable | Default | Notes |
|---|---|---|
| `WORKBUDDY_DEVICE_TOKEN_FILE` | unset | File source for an external `X-Device-Token` in the *virtual* tier: points at a token file another tool maintains (bare value or `{"token":…}` envelope), re-read every 5 min, 4 KB cap; token bytes never reach logs or `doctor`. Same meaning as the card setting `deviceToken.file`, used when that is empty |
| `WORKBUDDY_HEADER_TRACE` | unset | Set to `1` and `doctor` prints one more section: the header **name** list each request path would send (names only — never values). For answering "what does this tier actually send" |
| `WORKBUDDY_TURING_SDK_DIR` | unset | Turing Shield SDK directory for the *real* tier. When unset the plugin **auto-discovers** the desktop app's install layouts (`/Applications`, `%LOCALAPPDATA%`, the uninstall registry hive, …); set it when the desktop app is installed yet `doctor` still reports "not found". The card's **SDK** section accepts the same directory (no env var, applies on save) and this variable takes precedence. What happens when no real device can be obtained is the next-but-one row |
| `WORKBUDDY_TURING_CHANNEL_ID` | `109144` | SDK channel id, matching the desktop app's `product.json` |
| `WORKBUDDY_TURING_PRODUCT_NAME` | `WorkBuddy` | Product name the SDK initialises with |
| `WORKBUDDY_TURING_PRODUCT_VERSION` | plugin version | Product version the SDK initialises with |
| `WORKBUDDY_TURING_KEYCHAIN_STORAGE` | unset (= off) | Set to `1` to let the SDK enable its own device-cache storage; off by default — the plugin does not write device state into the user's keychain |
| `WORKBUDDY_DEVICE_SDK_ENABLED` | unset (= off) | Bypass for the SDK master switch, for `doctor` and other standalone processes that cannot read the plugin config: `1` / `true` = on. The card's switch of the same name (`deviceSdkEnabled`, **off by default**) is the normal entry point; both mean the same thing and the plugin always passes a value explicitly. Off means no discovery, no child process, no prewarming. To check whether the SDK works at all, run `WORKBUDDY_DEVICE_SDK_ENABLED=1 node lib/bin.js doctor` |

> **Why these three commands work on a machine with nothing installed (issue #47)**
>
> The plugin declares `@deepseek-ai/dsh-atomic-write`, `@deepseek-ai/dsh-home-paths`, and the rest of the DSH packages as **peers**: the host supplies them and the plugin ships no copy. That works inside a **booted DSH process** (the host's runtime interception layer resolves those names against the installation), but `dsh plugin … exec` is not that — it runs one `pnpm exec` in the profile directory, and that child uses **stock Node resolution**. The profile is created with `autoInstallPeers: false`, so the peers are never installed there and the two packages cannot be found.
>
> Up to 4.3.1 this was a **load-time** crash (`ERR_MODULE_NOT_FOUND`), naming a file that looked unrelated to the command:
>
> ```
> Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-atomic-write'
> imported from …/profiles/dsh-tui/node_modules/dsh-connect-workbuddy/lib/host-heartbeat-*.js
> ```
>
> The reason is bundling: `auth`, `host-heartbeat`, `at-rest`, and `pi-ai-runtime` are emitted as **one shared chunk**, so the moment `lib/bin.js` imported it, the top-level import in `auth.ts` was evaluated — even for a read-only `status`. **From 4.3.2** those two packages are host-first and loaded on demand: the host's copy still wins where the host is present (keeping one cross-process write protocol shared with the host), and a small built-in implementation takes over where it is not. `exec` therefore works on a clean machine, and `doctor` prints which one is in use:
>
> ```
> Atomic writes: built-in copy (host peer not resolvable here; normal outside a booted DSH)
> ```
>
> Inside the repository checkout (peers present) it reports `host-provided (@deepseek-ai/dsh-atomic-write)` instead. The guard lives in `tests/host-peers.spec.ts`: it scans the **built output** and fails as soon as `lib/bin.js`'s dependency graph contains a bare package name again.

<a id="development"></a>

## 10. Development

To install this fork from source:

```sh
git clone --branch main https://github.com/kiwaro/dsh-connect-workbuddy.git D:/projects/dsh-connect-workbuddy
cd D:/projects/dsh-connect-workbuddy
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
dsh plugin --profile desktop add D:/projects/dsh-connect-workbuddy
```

Adjust the path, then restart DSH. The npm package is published by the upstream author.

```sh
pnpm install
pnpm run check   # typecheck + test + build
```

Local dev via a `link:` install to the desktop profile (restart DSH Desktop after editing):

```sh
dsh plugin --profile desktop add /Users/<you>/DshProject/dsh-connect-workbuddy
```

<a id="a-link-install-must-be-built-first-or-dsh-refuses-to-load-it"></a>

### 10.1 A `link:` install must be built first, or DSH refuses to load it

`lib/` is a build product and is gitignored, while a `link:` install runs **no lifecycle scripts**
(`prepare` never fires). Install from a source checkout that was never built and the files named by
`package.json`'s `main` / `exports` simply are not there, so DSH's plugin market answers:

```
声明的入口产物缺失(源码检出或构建被拦),下次启动会失败
the declared entry artifact is missing (source-only checkout or blocked build) — the next boot would fail
```

That verdict comes from `dshmarket`'s `entryArtifactExists()`: it reads `main` and `exports` in the
installed directory and that is the whole evidence. So:

```sh
pnpm install        # `prepare` builds once (lib/ appears)
# or just build
pnpm run build
```

Re-run a build after editing source (or `pnpm install` again), then restart DSH Desktop. If the warning
survives that, run the check — it prints every declared artifact, and separates "never built" from
"manifest and build disagree":

```sh
pnpm run verify:entries                                   # this checkout
node scripts/verify-entry-artifacts.mjs <installed dir>    # a specific installed copy
```

> Installing from npm (`dsh plugin add dsh-connect-workbuddy`) needs none of this: the published
> tarball already contains `lib/`, and `prepack` only regenerates it.

<a id="calling-chatstream-from-a-script-it-returns-an-envelope-not-a-stream"></a>

### 10.2 Calling `chatStream()` from a script: it returns an **envelope**, not a stream

```ts
const envelope = await client.chatStream(credential, bodyJson)
if (!envelope.ok) { /* failure: envelope.status / .kind / .message / .detail */ }
else { await envelope.response.text() /* or consume it as SSE */ }
```

**Check `envelope.ok` before consuming.** It returns `{ ok: true, response }` or `{ ok: false, status, kind, message, detail }` — not something you can `for await` directly. Skip that check and the usual outcome is **every failure reported as a success** (there is no `response`, reading it throws or is swallowed, and "all models passed"). Recorded here on the strength of the issue #56 reporter's own note, so the next person does not lose the same hour.

`kind` on a failed envelope is the failure classification used throughout this document (`soft_rate` / `model_busy` / `hard_credit` / `session_dead` / `policy_reject` / `not_found` / `server` / `client`), and `detail` carries the upstream `upstreamCode` / `requestId` / `displayMsg`.

<a id="marketplace-listing"></a>

## 11. Marketplace listing

The plugin ships an installable `dsh.bundle` manifest and is published to npm. Community marketplaces generally sync entries from the [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry; the local mirror of the entry lives at [`awesome-dsh-plugin-submission/dingminhua__dsh-connect-workbuddy.yml`](awesome-dsh-plugin-submission/dingminhua__dsh-connect-workbuddy.yml). **The entry was merged and listed via PR [#3812](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/3812) (2026-08-30).**

> ⚠️ **A merged entry does not update itself.** #3812 was merged when the plugin was at 2.0.15, so the registry line kept describing that release: no CN/international dual providers, no per-refresh credit multipliers, no account pool with failover, and nothing explaining manual check-in or the separately enabled automatic check-in. **Every meaningful capability change needs its own entry PR**; the registry review states plainly that a description is read as a claim and checked against the code. The update recorded in this document is PR [#10281](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10281).

**Listing directory rules** (per [contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)):

- One YAML per plugin: `data/plugins/<owner>__<repo>.yml` with `url` (exactly matching the repo), `name` (`owner/repo`), `category` (one of the valid values; this project uses `model`), and `description.en` (required, ending with a period) / `description.zh` (optional); a description containing `: ` must be quoted.
- The repo must declare a `dsh.bundle` manifest (here `dsh.bundle.patch: ./cordis.patch.yml`) and carry the `dsh-plugin` topic — **declaring only `dsh.client` is the most common rejection**. The 1-day repo age is checked automatically by CI (there is **no commit-count bar**; that one was removed).
- Both READMEs (`README.md` / `README.zh.md`) are generated — never edit by hand; after changing the YAML, regenerate with `node scripts/generate-readme.mjs`.
- At most 3 entries per PR; change only your own entry, never touch other plugins.

Marketplace screenshots and GitHub README badges are two separate mechanisms:

- **GitHub badges** are produced by the Shields/dshfind image links at the top of this README.
- **Marketplace screenshots** follow the current convention and are declared in the plugin's own root [`screenshots.json`](screenshots.json) (this project declares its usage-card screenshot there). The registry's `data/screenshots.json` is a legacy fallback and **no longer accepts new keys** (this project removed its edit before submitting).
- **Marketplace icons** are declared with the entry's optional `icon:` field (this project points at `icons/dsh-connect-workbuddy-128.png`): it **must be a GitHub-hosted raster** (png/jpg/jpeg/webp) — SVG and third-party image hosts are refused — and storefronts fall back to the owner avatar when it is omitted. It is not a generic npm `package.json` field, nor a README badge.

**The plugin manager reads the card title and description from package metadata** — they are **package metadata** the DSH plugin manager reads: it takes its words from `meta.title` / `meta.description` in `locale/<lang>.json` (`locale/en.json` is the anchor, so without it `zh.json` is never read; without the `"./locale/*.json"` wildcard in `exports` the whole directory is skipped **silently**), and falls back to `package.json.description` when language metadata is missing. This fork uses Chinese in the package description and provides English in `locale/en.json`. The same sentence therefore lives in three places in this repository, and [`tests/locale-meta.spec.ts`](tests/locale-meta.spec.ts) pins them together: the card dictionary (`locale/en.json` / `locale/zh.json`), the package fallback (`package.json.description`, Chinese in this fork) and the listing draft (`description.en` / `description.zh` in `awesome-dsh-plugin-submission/dingminhua__dsh-connect-workbuddy.yml`). **Edit one, edit all three.**

<a id="known-limitations"></a>

## 12. Known limitations

- The plugin depends on WorkBuddy client endpoints (not an official public API), so a WorkBuddy update may require adjustments.
- **Desktop account discovery** reads auth files left by the WorkBuddy app. Plugin sign-in and imported accounts are also available; these are not an official multi-account API. Following the app's current sign-in remains the default; switching is an explicit opt-in, and historical credentials can be invalidated by the app's cleanup or sign-out.
  - If an explicitly selected account disappears locally (the app replaced its login or cleaned up its backups), the plugin does **not** silently switch to another account — that would bill a different account. The card says the saved account no longer exists; pick an account again, or use "Follow the app's sign-in" to clear the saved choice. **Signing in again in the desktop app will not fix this**: the credentials are fine, it is the saved account id that no longer matches.
  - Users upgrading from before 2.0.0 may still carry the old top-level `accountId` (the migration source). It applies only to its own region and **stops applying once that region is explicitly cleared (`accounts.<region> = ""`)** — otherwise the account you cleared would be silently restored at the next startup. The card shows whether a region is "using the saved account" or "following the app's current sign-in": the restored default is usually the very account you just cleared, so without that line there is no way to tell a successful clear from a no-op.
- **On Windows, an account change may fail to save while the profile's `cordis.patch.yml` is held open.** DSH updates that file by writing a temp file and replacing the target; an antivirus scanner, a sync client (OneDrive), or an open editor can lock it briefly, and once the replacement retries are exhausted the failed write does **not** make `set()` reject. The plugin therefore reads the value back after writing: it shows "cleared" **only once the write is confirmed on disk**, and on failure it reports the error and keeps your previous choice (never a false confirmation that the old selection silently contradicts). Close whatever holds the file and retry.
- Windows and Linux credential paths are derived from platform conventions. On a real Windows 11 machine, `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth` and `%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe` **did resolve**, but **the remaining candidates and the Linux paths are still not verified on real hardware**; set `WORKBUDDY_AUTH_FILE` if yours lives elsewhere.
- **The standalone CLI (`dsh plugin … exec`) does not carry the host-supplied peer packages**, so outside the host the plugin falls back to a built-in atomic-write implementation (`src/host-peers.ts`). It transcribes the host's behavioural contract (the `<file>.lock` naming, the Windows `EACCES`/`EBUSY`/`EPERM` retries and their cadence) and is used **only** when those two packages cannot be resolved — inside the host, and in this checkout, the host's or the dependency's copy is still used. `doctor` reports which one is in effect. See the issue #47 note under [Command line](#command-line).
- **Encrypted credentials require the desktop app to be present.** Newer desktop builds (**from 5.6.0, on macOS as well as Windows**) encrypt the token fields in the auth file, and the plugin needs that app's own native binding to obtain the field key. If the app is not installed, was uninstalled, or lives outside the probed paths (on Windows the install registration is consulted automatically, so a non-default install is found without configuration; set `WORKBUDDY_APP_EXECUTABLE` if that misses too), an encrypted file cannot be read — the account then shows as signed out, and the plugin **never** degrades into emitting a truncated token. `doctor` reports whether this capability is available. The key is a build-time constant that may rotate with app releases; the plugin fetches it from the local app each run and caches nothing on disk, so field-key changes alone do not require shipping a key in the plugin; binding or format changes can still require an update.
  - **The executable is located from the bundle's own declaration, not guessed from the app name.** The WorkBuddy macOS bundles declare `CFBundleExecutable` as `Electron` (not `WorkBuddy`), so the plugin reads each bundle's `Info.plist` to learn the binary's name. Both the domestic `WorkBuddy.app` and the international `WorkBuddy AI.app` are candidates, and an app filed into a subdirectory of an applications folder (e.g. `/Applications/IDE/WorkBuddy.app`) is found by a one-level scan that confirms each candidate's bundle identifier before use — which reduces the risk of selecting an unrelated Electron app.
  - **"Signed out" and "your sign-in cannot be read" are reported separately.** When an encrypted file cannot be read, the advice is to install the desktop app or point `WORKBUDDY_APP_EXECUTABLE` at it — **not** to sign in again, which cannot help: the credential is fine, the key is what is missing.
- **A 403 "request illegal" (code 11140) is a server-side policy refusal, not a sign-in problem.** The chat gateway sometimes refuses a request outright under its content policy; the body reads `{"code":11140,"msg":"request illegal","requestId":"…","displayMsg":{"en":"The content did not pass the safety review. Please adjust and retry."}}`. The plugin used to file this under the generic `client` error (HTTP 400), which DSH then displayed as an AUTH failure — it looked like a broken sign-in, but **signing in again cannot fix it**: the credentials are fine; it is this one request that was refused. The refusal now passes through as 403 with the official message, `code 11140`, and the `requestId` (give that to official support). The `error.code` written back to the host is the stable class `policy_reject` rather than the numeric `11140`: the host decides in-place retrial from that class, and a policy refusal is deterministic — retrying only burns the budget, and `11140` is not a word the host knows, and the per-model "test" reports "refused by the server's content policy" instead of "token refused". Two ways out: send the same prompt from the WorkBuddy desktop app with the same account (if the desktop app is refused too, the limit is on the account/content side), or switch region/account and retry.
- **A busy model is not an exhausted balance — but the international gateway lists two same-named models, and picking the paid one really is a credit problem.** 14003 (`model_busy`) is a **model-scoped**, **transient** throttle that has nothing to do with the account or its credits; switching model works around it. The plugin used to translate it to `quota_exceeded` on the way back to the host, and the host classifies failures by regexing the error text — `quota_exceeded` happens to match `@deepseek-ai/dsh-llm`'s `isQuotaExceededError`, so the class became `QUOTA` and the chat client **replaced the plugin's message with its own hard-coded 「Request quota exhausted.」** (that sentence was never the plugin's). Since 4.12.0 `model_busy` is no longer translated: the host reads `RATE_LIMIT`, the plugin's own wording survives, and the failure lands in the host's **in-place retry** set, so `dsh-llm-retry` retries it a bounded number of times with the default 500 ms→10 s backoff. **`soft_rate` (6004) keeps the old translation**: its reset is hours away, so the retry budget cannot produce an answer and must not be spent.
  - **The other half of the report is a naming trap: the international roster has two 「Deepseek-V4.1-Flash」 entries.** Of the 28 models on `/v3/config`, `deepseek-v4.1-flash` (`x0.00`, **free**) and `deepseek-v4.1-flash-sg` (`x0.03`, **paid**) have **byte-identical names, descriptions, context windows and capability fields**; only the ` · x0.00` / ` · x0.03` suffix the plugin appends distinguishes them in the picker. A zero-credit account that selects the **paid** one gets 429 / code 14018 「Credits exhausted」 — that time the balance really is the problem, the host's wording is **correct**, and no retry can help. So when you see the quota message, check the multiplier suffix first: switch the international deepseek entry to the `x0.00` one, or use `step-5-preview` (`x0.00`, no paid twin). In the recorded catalog, the free models on the international gateway were `deepseek-v4.1-flash`, `hy3` and `step-5-preview`.
  - The host's text-based classification order is part of the trap: a `401`/`403` digit **outranks** everything (yields `AUTH`), the `quota` wording **outranks** `429` (yields `QUOTA` and triggers the substitution above), and a `400` digit yields `INVALID_REQUEST`. An error body written back to the host therefore must not carry those literals casually — `tests/issue84-model-busy-not-quota.spec.ts` pins this layer by driving the real pi-ai client against the real shim and feeding the resulting text to the host's own `isQuotaExceededError()`.


- **Switching region can increase replayed context and trigger `code 11115`.** The same history is counted under different buckets in the two regions, and the root cause is how the host's bundled `@earendil-works/pi-ai` replays history. It evaluates `isSameModel` for every assistant message (`transform-messages.js:68`, keyed on provider **and** api **and** model id all being equal): for a message that fails, its thinking is **downgraded to ordinary content** (`:88–96` — not dropped), and content is what the gateways count, while thinking goes out in a different field. This plugin registers the domestic and international editions as **two provider ids** (`workbuddy` / `workbuddy-global`, see [How it works](#how-it-works)) that carry the **same model id** — so one region switch moves **all the other side's thinking into the content bucket at once**. This conversion helps explain the token-count differences recorded in issue #59. Those token counts do not by themselves establish the credits actually deducted; see the corrections in [ISSUE59-VERIFY.md](docs/audit/ISSUE59-VERIFY.md).
  - Three consequences you can see: a region switch can move the token count by ±30%–94%, and **the increase depends on converted reasoning as well as tokenization and the rest of the request**; **switching models inside one region** triggers the same downgrade (the model leg of `isSameModel`), so the count can move without a region switch at all — the downgrade itself cannot be removed, but **its becoming prose can**, see `dropForeignThinking` below; and that jump lands on top of the host's current compaction threshold (`min(0.8 × window, window − 128000 − 65536)`), so a session that was comfortably under the limit can hit `code 11115 prompt is too long` the moment you switch region.
  - **The downgrade is not only a counting problem: the reasoning becomes the answer, and the model then copies that shape (issue #147).** The bullet above covers token-count effects of the downgrade; this one covers what it does to CONTENT. For a message where `isSameModel` fails, pi-ai does not drop its thinking — it rewrites each block to `{type:'text'}` (`transform-messages.js:87–90`), i.e. the answer channel. So after a provider switch, **another model's internal working notes are presented as this turn's reply**, and a model that reads "all of my past reasoning was plain text" keeps writing its plan into the text channel from then on. The reporter measured one real turn: 56 of 80 assistant messages carried an answer while their own `reasoning` was ≤ 1 character, 20 of those held English working notes totalling 58,960 characters, and CJK fell to 1.37% of the 60,984 visible characters where the previous six turns had been entirely Chinese. It also pushed the session from 696,966 to 758,005 total tokens against an 800,000 compaction threshold.
    - **Cross-provider foreign thinking is dropped unconditionally; the `dropForeignThinking` switch only covers a model switch inside one route (off by default)**: this plugin **removes** those foreign thinking blocks before the request goes out, instead of letting them be flattened into prose. Removal rather than preservation, because these blocks are built by the host's `foreignAssistant()` and carry **no `thinkingSignature`** — even claimed as our own turn they could never be replayed as signed reasoning, so their only possible contribution to the wire was the prose they became. Text blocks and tool calls are never touched, and neither is any message's identity.
    - **No switch for the cross-provider leg**: after a provider switch the host rebuilds the other provider's assistant turns as `dsh-foreign`, and pi-ai flattens their thinking into assistant text; the WorkBuddy gateway scans assistant messages, so the whole turn is refused with `11128` (issue #163's measured scene: 14,410 / 4,225 / 5,138 characters of reasoning replayed as prose, with all three in-place rescue rungs and three auto-`继续` attempts failing). Those blocks could never be replayed as reasoning anyway, so dropping them is a correction rather than a preference and does not wait for an opt-in. `dropForeignThinking` only widens the same repair to a model switch **inside one route** (`hy3` → `deepseek-v4.1-flash`, both served by this bundle and stamped `provider: workbuddy`); for that leg the off path is still **byte-for-byte** what earlier builds sent.
    - An automatic drop writes a warn (only while the switch is off) and still reports through `latestForeignThinking`, so the log names which blocks that request removed.
    - The ORDER is load-bearing: the repair runs **after** `alignAssistantIdentities`. A global-region turn of this plugin's own arrives carrying `api: 'dsh-foreign'` too (the host's replay-degrade path), so diagnosing first would classify it as foreign and delete its reasoning — exactly issue #102 in reverse. `tests/issue147-foreign-thinking.spec.ts` pins the order through pi-ai's real `transformMessages`.
    - Turns already recorded in history are **not** retroactively repaired: they are already stored as prose, and the switch governs later requests only. Starting a new session after the provider switch is the direct way out.
    - **It also covers switching MODELS inside one region** (`hy3` → `deepseek-v4.1-flash`, both served by this plugin, both stamped `provider: workbuddy`). The provider and api legs are equal there, so only the `model` leg separates the turn from the request — and 5.12.0's predicate compared just the first two, so that switch detected **nothing** and the switch looked broken. The model id comes from the request entry points (`model.id` on `stream` / `streamSimple`); omitting it keeps 5.12.0's behaviour exactly, which is why the card's read-only path is unaffected (it reads `lastForeignThinking`, which the request path fills).
  - **This is a mismatch between the host and pi-ai, not a bug in this plugin**: not replaying thinking across providers/models is right in itself (another model's train of thought is not context this model should be fed), and the mistake is treating `provider` as a necessary condition for "the same model" when the two provider ids here are **two access regions of one model**. The fix belongs upstream (same api + same model id, providers as an equivalence group); on the plugin side the backstop is `src/context-rescue.ts` since 4.8.0 — **once the upstream confirms an overflow, it folds history in chunks and resends**, instead of replaying the entire range the host meant to compact (which is exactly what makes a compaction request overflow itself and deadlock). To see where it happened: set `WORKBUDDY_BODY_REPORT` to capture a body-composition report — it records counts only, never text. **It appends continuously**: one `<region>.jsonl` per region, rolled to `.1` past 32 MB (one old copy kept); unset the variable and delete the files when you are done — do not leave it on for long sessions.

<a id="disclaimer"></a>

## 13. Disclaimer

**Read all of it, then decide whether to install.** (There is also a [risk notice](#risk-notice) near the top; the two say the same thing.)

- **Third-party access carries account risk.** The official terms of service restrict unauthorised third-party access. Using this project may lead to account or feature restrictions, **account bans**, or suspension and termination of service. **Working normally and being billed normally do not mean you are authorized, and do not mean there is no account risk.**
- This project is **for personal study and research only**. It drives only your own WorkBuddy / WorkBuddy AI account locally; **do not use it commercially or beyond reasonable personal use**.
- Using this project **does not guarantee continuous availability, an unrestricted account, or always-accurate credit figures**. The author cannot control the platform's limits, penalties or service changes; the day upstream tightens its rules, the plugin may stop working.
- **Understand the risk and decide for yourself whether to install.** Account restrictions, lost credits and service interruptions caused by using this project are **your own responsibility**; if you cannot accept that, use the **official WorkBuddy client**, which is always the safest choice.
- The author is **not liable for any direct or indirect loss** arising from the use or misuse of this project.
- This project is **unaffiliated with and unendorsed by Tencent, WorkBuddy, or DeepSeek**. Names appear solely to describe compatibility; **their trademarks belong to their respective owners**.

<a id="acknowledgements"></a>

## 14. Acknowledgements

This project builds on work others have published. Sources and licenses are credited honestly below; we hold that in genuine respect.

<a id="reference-for-the-connection-core"></a>

### 14.1 Reference for the connection core

- [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect) (MIT, Copyright (c) 2026 Corrine Hu) — **the principal reference for this project.** That project first validated a working WorkBuddy-to-DSH integration: desktop credential discovery and refresh, the upstream protocol and header conventions, loopback shim hardening, pi-ai provider assembly, and the status CLI were all studied from it. This project reimplements those proven capabilities while focusing on improving the experience.
- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api) (MIT) — reference implementation of the WorkBuddy upstream protocol (the `copilot.tencent.com` wire behavior), referenced via `dsh-workbuddy-connect`.
- [hawklithm/workbuddy2api](https://github.com/hawklithm/workbuddy2api) (MIT, Copyright (c) 2026 Mayer) — **the only entry in this list that is a CODE PORT rather than a design reference**: its `src/codebuddy_proxy/dsml_parser.py` is a DSML tool-call parser for a proxy in front of the same WorkBuddy/CodeBuddy upstream, and this project ported it to `src/dsml-recovery.ts` (the tag state machine, ignored-region detection, missing-wrapper repair, recursive parameter parsing, and the streaming buffer), adding the two gates it does not have (a tool name must be declared in THIS request; no declared tools means no recovery at all). The three deliberate deviations are listed in that file's header; the formal attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<a id="references-for-the-auto-continue-semantics"></a>

### 14.2 References for the auto-continue semantics

- [HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue) (MIT) — the source of the "consecutive-failure cap" semantics: the counter increments on send, stops at the cap, resets on a successful turn, and skips subagent sessions. This project's `channelRejectContinue` takes only that layer, not its engine.
- [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) (MIT) — three concrete practices: which failure codes must not be continued (quota / rate limit / transport), do not queue behind a busy inbox, and use a message's `source.kind` to tell human intervention from the plugin's own message.

<a id="baseline-for-the-plugin-presentation-and-structure"></a>

### 14.3 Baseline for the plugin presentation and structure

- [dingminhua/dsh-connect-trae](https://github.com/dingminhua/dsh-connect-trae) (MIT, Copyright (c) 2026 LaoDing) — the plugin's presentation is kept consistent with it: the settings-card structure and interaction, the model-management (refresh → select → save) and account-selection model, the read-only host↔client route shape, and the npm release engineering.
- [dingminhua/dsh-subagent-default-model](https://github.com/dingminhua/dsh-subagent-default-model) (MIT, Copyright (c) 2026 LaoDing) — source of the `dsm-*` card style system, the `row.*` bilingual copy-key convention, and the brand icon, referenced via `dsh-connect-trae`.
- [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) (Apache-2.0) — reference for the DSH plugin structure and provider registration, referenced via `dsh-workbuddy-connect`. Its Apache-2.0 obligations are discharged separately in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<a id="note"></a>

### 14.4 Note

Copyright in each project above belongs to its respective author. This project uses the listed design references and separately credits the DSML parser port. Key module headers identify their sources and the relevant implementation changes. If you find an attribution missing or incorrect, please open an issue and we will correct it promptly.

<a id="third-party-open-source-dependencies"></a>

## 15. Third-party open-source dependencies

The open-source projects referenced here, together with their licenses and compliance notes, are recorded in full in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). When introducing new WorkBuddy-related external dependencies or reusing code from other projects, update that file and honor the upstream licenses.

<a id="last-account-reserve"></a>

## 16. Last-account reserve

With at least two checked pool accounts, the last account in the saved order is reserved. It becomes eligible only when every preceding account has zero credits, has exhausted its credits, or is still account-rate-limited. Unknown balances, model congestion, and rejected credentials do not unlock it. A recovered preceding account locks the reserve again. Without a separate saved order, the saved member order is used.

Selection before a request, failover, and the displayed pool state use this rule. Failed attempts are recorded before selecting a replacement. If selection cannot be evaluated, the request stops; a locked reserve cannot be reached by falling back to the saved account.

<a id="local-integration-updates"></a>

## 17. Local integration updates

The credit panel provides a Switch button for each account and marks the active account as In use. Successful manual switching shows the target account in the panel; automatic failover identifies the original account, reason, and serving account before the answer. Recovery time is shown only when available.

Model discovery keeps the original local first-seen timestamp when a model leaves and returns. Only active models first recorded within seven days are displayed. See the [module split and verification record](docs/MODULE-SPLIT-PLAN.md) for implementation and validation details.

<a id="license"></a>

## 18. License

This project is licensed under the [MIT License](LICENSE). Copyright: **Copyright (c) 2026 LaoDing**.

Under More settings → Icon style, choose Claude style line icons or the default icon. Claude style is the default. Changes take effect immediately and are saved separately for each plugin in the current browser.
