/** 从 auth.ts 按职责提取；来源与许可证说明见原文件头及 THIRD_PARTY_NOTICES.md。 */

import { join } from 'node:path'

import { WORKBUDDY_APP_EXECUTABLE_ENV } from './at-rest.ts'

import { type WorkBuddyRefreshOutcome, type WorkBuddyRegion } from './upstream.ts'

/** Normalized WorkBuddy credential, timestamps in epoch milliseconds. */
export interface WorkBuddyCredential {
  accessToken: string
  refreshToken: string
  expiresAtMs: number
  refreshExpiresAtMs?: number
  domain: string
  uid: string
  enterpriseId?: string
  nickname?: string
  /**
   * The account's DISPLAY name, when the app publishes one (issue #124).
   *
   * For an enterprise member `nickname` is the LOGIN ALIAS, not a person's
   * name — a card showing it looks like it is managing somebody else's
   * account. The official client prefers this field, then the enterprise user
   * name, and only then the alias.
   *
   * Read from the desktop auth document when present. It is NOT always there
   * (the app writes only what it has), which is why the read order has three
   * steps rather than two.
   */
  displayName?: string
  /** The enterprise-side user name (`enterpriseUserName`), when published. */
  enterpriseUserName?: string
  uin?: string
  /** Which auth file this came from; refreshes are always `dsh`. */
  source: 'desktop' | 'dsh'
  /** Absolute path of the auth file this credential was read from. */
  filePath: string
  /**
   * Epoch ms the upstream last issued this token (`auth.lastRefreshTime`).
   *
   * This is the ONLY trustworthy freshness signal. `expiresAtMs` cannot be
   * used for ranking: when the upstream revokes a token it leaves the stored
   * `expiresAt` untouched, so a long-dead backup can claim a LATER expiry than
   * the live sign-in (observed on a real machine — a 2026-07-08 backup claimed
   * 2027-07-06 while the live file expired 2026-11-14, and only the live file
   * was accepted). Undefined when the document omits the field.
   */
  lastRefreshAtMs?: number
}

/**
 * Why one probed path did not yield an account.
 *
 * These are safe to surface: they carry paths and cause only, never token
 * material. `encrypted` is the WorkBuddy-specific one — a build whose token
 * fields are encrypted cannot be read at all unless the desktop app itself is
 * present to hand over its at-rest key, so "sign in again" is the wrong advice
 * for it (the user may be perfectly signed in).
 *
 * `wrong-region` is the second WorkBuddy-specific one, and it exists because of
 * a real bug: a region-scoped store filters out every credential that belongs to
 * the other region, so a candidate file holding a perfectly valid sign-in for
 * the other tab was dropped by exactly the same `continue` that drops malformed
 * files. The file then appeared in NO list at all — not an account (filtered by
 * region) and not a failure (it parsed) — so a card could name two paths while
 * its report listed one, and the user's actual, working sign-in was the one
 * made invisible. Reporting it is also the most useful answer we can give: the
 * user is signed in, and merely on the wrong tab.
 */
export interface WorkBuddyCandidateFailure {
  path: string
  source: 'desktop' | 'dsh'
  reason: 'missing' | 'unreadable' | 'invalid' | 'encrypted' | 'wrong-region'
  message?: string
}

/** Read-only sign-in summary for status and doctor output. */
export interface WorkBuddyAuthStatus {
  state: 'signed-in' | 'signed-out'
  expiresAtMs?: number
  refreshExpiresAtMs?: number
  nickname?: string
  domain?: string
  source?: 'desktop' | 'dsh'
}

/**
 * Marker for a credential that EXISTS but could not be decrypted.
 *
 * Identified by {@link ENCRYPTED_CREDENTIAL_CODE} rather than `instanceof`, so
 * the check keeps working when the thrower and the caller end up in different
 * module instances (bundled host half vs. a test's source import) — the same
 * convention `WorkBuddyCredentialRejectedError` uses.
 */
export const ENCRYPTED_CREDENTIAL_CODE = 'WORKBUDDY_ENCRYPTED_CREDENTIAL'

/**
 * The user IS signed in, but the credential file cannot be read.
 *
 * This exists because "signed out" and "signed in with an unreadable credential"
 * resolve to the same observable state — zero accounts — and were therefore
 * reported with the same message. That message told a correctly signed-in user
 * to sign in again, which cannot possibly help: from WorkBuddy 5.6.x the desktop
 * app encrypts its token fields, and reading them requires asking the installed
 * app for its key. If that app cannot be located, the fix is to point the plugin
 * at it (`WORKBUDDY_APP_EXECUTABLE`), never to sign in again.
 *
 * No token material is carried: only the paths and the environment variable.
 */
export class WorkBuddyEncryptedCredentialError extends Error {
  readonly code = ENCRYPTED_CREDENTIAL_CODE
  /** Files that hold an encrypted credential, for the user to recognize. */
  readonly paths: readonly string[]

  constructor(paths: readonly string[]) {
    const where = paths.length > 0 ? paths.join(', ') : 'the credential file'
    super(
      `workbuddy: your WorkBuddy sign-in is present but encrypted, so it cannot be read`
      + ` (${where}). The WorkBuddy desktop app must be present to hand over its key;`
      + ` install it, or set ${WORKBUDDY_APP_EXECUTABLE_ENV} to its executable if it lives elsewhere.`
      + ` Signing in again will not change this.`,
    )
    this.name = 'WorkBuddyEncryptedCredentialError'
    this.paths = paths
  }
}

/** Whether an error reports an unreadable (encrypted) credential. */
export function isEncryptedCredentialError(value: unknown): value is WorkBuddyEncryptedCredentialError {
  return typeof value === 'object'
    && value !== null
    && (value as { code?: unknown }).code === ENCRYPTED_CREDENTIAL_CODE
}

/** Constructor options; only {@link refresh} is required. */
export interface WorkBuddyStoreOptions {
  /** Explicit desktop auth-file path, overriding env and platform defaults. */
  desktopPath?: string
  /**
   * Explicit plugin-owned copy path, overriding the per-region default.
   * Injectable so the copy/refresh cycle is testable without a real machine.
   */
  ownPath?: string
  /**
   * Region this store serves. When set, only credentials whose login domain
   * maps to this region are discovered, selected, or refreshed — the two
   * regions' stores run side by side without seeing each other's accounts.
   */
  region?: WorkBuddyRegion
  /**
   * Legacy single-copy path read as a migration source; defaults to the
   * pre-dual-provider location. Injectable for tests.
   */
  legacyOwnPath?: string
  /**
   * The unified credential vault directory for this store. Defaults to the
   * per-region directory under the Harness home; injectable so the vault's
   * merge/scan behaviour is testable without touching a real machine.
   */
  vaultDir?: string
  /**
   * Auth directories to scan, overriding the platform defaults. Injectable so
   * the multi-account scan is testable without touching a real machine.
   */
  authDirs?: readonly string[]
  /** Performs the upstream token refresh. */
  refresh: (credential: WorkBuddyCredential) => Promise<WorkBuddyRefreshOutcome>
  /** Refresh this long before actual expiry; default five minutes. */
  refreshMarginMs?: number
  /**
   * Resolves the desktop app's at-rest field key, used to open documents whose
   * token fields are encrypted (Windows builds). Defaults to asking the
   * installed app; injectable so the encrypted path is testable.
   */
  resolveAtRestKey?: () => Promise<Buffer | undefined>
}

export interface WorkBuddyAccountChoice {
  /** Stable id derived from `uin` (or `uid` when uin is absent). */
  id: string
  /**
   * The account's human name, or `''` when the desktop app recorded none.
   *
   * Never an identifier: `uin`/`uid` are opaque numbers and UUIDs, and using one
   * as a display name reads as "the plugin does not know who this is". Callers
   * that render a name choose their own placeholder for the empty case.
   */
  accountName: string
  domain: string
  source: 'desktop' | 'dsh'
  tokenExpiresAtMs: number
  /** The auth file this account was read from; newest is preferred. */
  filePath: string
  selected: boolean
  /**
   * This account belongs to an enterprise (issue #124).
   *
   * Present only when `enterpriseId` is set. The credits come from the
   * enterprise table and the consumer daily check-in does not exist for it, so
   * callers branch on this FACT rather than on `status.active` (which reads
   * `false` for every enterprise member).
   */
  enterprise?: boolean
}
