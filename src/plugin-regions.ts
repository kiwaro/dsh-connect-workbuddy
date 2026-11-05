/** 从 index.ts 按职责提取；参考来源及许可证说明见原文件头与 THIRD_PARTY_NOTICES.md。 */
import { realTierAvailabilityFor } from './real-tier-availability.ts'


import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WorkBuddyCredentialStore } from './auth.ts'
import { WorkBuddyCatalog } from './catalog.ts'

import type { RosterSeenStore } from './roster-seen-store.ts'
import type { WorkBuddyShim } from './shim.ts'

import type { WorkBuddyRegion } from './upstream.ts'

import {
// The shape of the `regions` field is not trustworthy in a profile written by
// an older build (see `healedRegionsMap` in `src/status-paths.ts`): the Host's
// read and the catalog repair's write both go through this narrowing, so one
// rule heals both halves (the "restart reset" report).
regionsMapOf } from './status-paths.ts'
import { type WorkBuddyRegionState, Config, unwrapVolatile } from './plugin-config.ts'
/**
 * One region's saved model state. A config written before the region split has
 * only the flat fields: those were always captured from the CN endpoint (the
 * plugin had no international support), so they are read as the CN state and
 * only when no explicit CN slot exists. The global region never inherits them —
 * that inheritance is exactly the bug where a stale CN directory was
 * intersected with the international catalog and silently dropped the user's
 * picks.
 */
export function regionStateOf(config: Config, region: WorkBuddyRegion): WorkBuddyRegionState {
  // THROUGH `regionsMapOf`, not a bare lookup. The field is written by older
  // builds in a shape that buries the real region map one level down (the
  // "restart reset" report: the pool and the model selection looked unsaved
  // after every restart), and this one-level read is what turned that wreckage
  // into "the pool was never configured" — the Host's answer decides the pool
  // switch, the member list, the model selection and the directory.
  // `regionsMapOf` narrows the field, drops the sibling-field copies and
  // recovers a region that only survives deeper, so an already-corrupted
  // profile reads correctly BEFORE the repair write has cleaned it.
  const regions = regionsMapOf(config.regions)
  const stored = regions[region]
  // `null` counts as "no slot", exactly like `undefined`. schemastery's
  // `simplify()` serialises an EMPTY region slot as `null` (`{cn:{}}` →
  // `{cn:null}`), and a `null` reaching the return value makes every caller
  // throw on the first property read (`regionEnabled` dies on `.enabled`). It is
  // not reachable today — resolving a stored `null` slot expands it back into a
  // full default state — so this is defence, not a fix for an observed crash.
  if (stored !== undefined && stored !== null) return stored
  if (region !== 'cn') return {}
  const lastCatalog = unwrapVolatile(config.lastCatalog)
  const enabledModelIds = unwrapVolatile(config.enabledModelIds)
  const imageModelIds = unwrapVolatile(config.imageModelIds)
  const contextBudgets = unwrapVolatile(config.contextBudgets)
  return {
    ...lastCatalog === undefined ? {} : { lastCatalog },
    ...enabledModelIds === undefined ? {} : { enabledModelIds },
    ...imageModelIds === undefined ? {} : { imageModelIds },
    ...contextBudgets === undefined ? {} : { contextBudgets },
  }
}

/**
 * Whether one region's provider is switched on. Opt-out semantics: only an
 * explicit `false` disables it, so every config written before this switch
 * existed — including the pre-region-split flat fields, which never carry
 * `enabled` — keeps both providers running exactly as before. The card reads the
 * same rule through `regionEnabledOf`, so the two halves can never disagree
 * about a region's state.
 */
export function regionEnabled(config: Config, region: WorkBuddyRegion): boolean {
  return regionStateOf(config, region).enabled !== false
}

/**
 * One region's runtime stack. The two regions are fully parallel provider
 * stacks — separate credential stores, catalogs, and loopback shims — so the
 * domestic and international accounts serve simultaneously and a change on
 * one side (account switch, catalog refresh) never touches the other.
 */
export interface WorkBuddyRegionStack {
  store: WorkBuddyCredentialStore
  catalog: WorkBuddyCatalog
  shim: WorkBuddyShim
  /** This region's first-sighting history, feeding the "· N 新模型" segment. */
  rosterSeen: RosterSeenStore
}

/** Every region, in card tab order. */
export const REGION_KEYS: readonly WorkBuddyRegion[] = ['cn', 'global']

export const REAL_TIER_AVAILABILITY = realTierAvailabilityFor(process.platform)

/**
 * The region that owns the image tool right now, or `undefined` when no region
 * has it switched on.
 *
 * BOTH gates are required, and both are read live: the region's provider switch
 * must be ON (`regionEnabled`, opt-OUT) and the user must have opted IN to the
 * model spending credits there (`imageToolEnabled`, opt-IN). Absence of
 * `imageToolEnabled` is never consent.
 *
 * CN wins when both regions qualify, and that order is the only backward
 * compatible one: before the international gateway carried a `text-to-image`
 * model (measured 2026-10-25: `hy-image-3.5`) CN was the only region that could
 * ever be opted in, so a profile that opted in there keeps using CN even after
 * the global tab is switched on as well. That is exactly `REGION_KEYS`' order;
 * it is not incidental.
 */
export function imageToolRegionOf(config: Config): WorkBuddyRegion | undefined {
  for (const region of REGION_KEYS) {
    if (!regionEnabled(config, region)) continue
    if (regionStateOf(config, region).imageToolEnabled === true) return region
  }
  return undefined
}

/**
 * Region that owns the video tool right now, or `undefined` when no region has
 * it switched on. Mirrors `imageToolRegionOf` but reads `videoToolEnabled`
 * (the video-generation opt-in). Both gates required, read live: region provider
 * switch ON (`regionEnabled`, opt-OUT) and the user opted IN (`videoToolEnabled`,
 * opt-IN). CN wins when both qualify (see `REGION_KEYS`).
 */
export function videoToolRegionOf(config: Config): WorkBuddyRegion | undefined {
  for (const region of REGION_KEYS) {
    if (!regionEnabled(config, region)) continue
    if (regionStateOf(config, region).videoToolEnabled === true) return region
  }
  return undefined
}

/**
 * The account id a region should select, or `undefined` for the documented
 * default: follow whatever the WorkBuddy app is currently signed in as.
 *
 * Three inputs decide it, and the ORDER is the whole point:
 *
 * 1. `accounts[region] === ''` — the Clear sentinel. It means "the user
 *    dropped this region's choice", which is the opposite of the key being
 *    absent ("never configured"). It therefore terminates the lookup: falling
 *    through to the legacy `accountId` here would re-bind the very account the
 *    user just dropped, and would do it after clearing appeared to succeed.
 * 2. `accounts[region]` set to a real id — an explicit per-region choice.
 * 3. absent key, with the pre-split `accountId` belonging to this region —
 *    the legacy migration, attributed once at startup from the local scan.
 *
 * `legacyAccountRegion` is resolved asynchronously after the first
 * `applySelection` pass, so this is a pure function of it rather than a
 * closure over the stores: the same call answers both the early pass (no
 * attribution yet) and every later one.
 */
export function selectAccountFor(
  region: WorkBuddyRegion,
  value: Config,
  legacyAccountRegion: WorkBuddyRegion | undefined,
): string | undefined {
  const accounts = unwrapVolatile(value.accounts)
  const configured = accounts?.[region]
  if (configured === '') return undefined
  if (configured !== undefined) return configured
  const accountId = unwrapVolatile(value.accountId)
  return legacyAccountRegion === region ? accountId : undefined
}

/** Whether a region carries the Clear sentinel rather than a saved choice. */
export function regionCleared(value: Config, region: WorkBuddyRegion): boolean {
  // `accounts` is volatile on the 0.1.7 line: the stored value is a live
  // cosmokit reference whose `.get()` yields the plain record, so a raw
  // `value.accounts?.[region]` read is always undefined there and the Clear
  // sentinel would never be observed (issue #13's clear path).
  return unwrapVolatile(value.accounts)?.[region] === ''
}

/**
 * Which region owns the pre-split `accountId`, or `undefined` when it cannot
 * be attributed (the field is absent, or the account is gone from every local
 * sign-in list).
 *
 * Regions the user explicitly cleared are skipped, even when the saved account
 * IS among their local sign-ins. `selectAccountFor` already refuses to fall
 * back for a cleared region, so this cannot change what runs — but it keeps the
 * attribution honest about its own decision: the region that owns this id is
 * not the one the user just told the plugin to stop pinning, so the other
 * region must get the chance to claim it.
 *
 * `accountsFor` is injected so the sequential, stop-at-first-match scan is
 * testable without a filesystem.
 */
export async function legacyAttributionRegion(
  value: Config,
  accountsFor: (region: WorkBuddyRegion) => Promise<readonly { id: string }[]>,
): Promise<WorkBuddyRegion | undefined> {
  const id = value.accountId
  if (id === undefined) return undefined
  for (const region of REGION_KEYS) {
    if (regionCleared(value, region)) continue
    if ((await accountsFor(region)).some(account => account.id === id)) return region
  }
  return undefined
}

