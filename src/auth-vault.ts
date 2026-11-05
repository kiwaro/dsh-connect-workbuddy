/** 从 auth.ts 按职责提取；来源与许可证说明见原文件头及 THIRD_PARTY_NOTICES.md。 */
import { readFile, readdir } from 'node:fs/promises'

import { dirname, join, resolve } from 'node:path'
import { resolveDshHome, withFileLock, writeFileAtomic } from './host-peers.ts'

import { protectCredentialDirectory } from './windows-acl.ts'

import type { WorkBuddyCredential } from './auth-types.ts'
import { authFileName, isLiveDesktopAuthFileName } from './auth-paths.ts'
import { parseWorkBuddyAuth, VAULT_ACCOUNT_ID_RE, expiryToMs, workbuddyAccountId } from './auth-parse.ts'
import { isENOENT } from './auth-files.ts'

/** Current on-disk format of the plugin-owned copy; readers reject others. */
export const OWN_FORMAT_VERSION = 1

/**
 * Serialize a credential to the vault's on-disk document.
 *
 * The on-disk field names are the DESKTOP document's snake-free shapes
 * (`expiresAt`, `lastRefreshTime`), which is what `parseWorkBuddyAuth`
 * reads back. Serializing the runtime camelCase fields verbatim parsed as
 * `expiresAtMs: 0` on the next read — every restart re-refreshed every
 * account, and a refresh outage could then take down sign-ins that were
 * perfectly healthy on disk.
 */
export function vaultDocument(credential: WorkBuddyCredential, accountId: string, refreshedFrom?: string): VaultDocument {
  return {
    version: VAULT_FORMAT_VERSION,
    accountId,
    refreshedAtMs: Date.now(),
    ...refreshedFrom === undefined ? {} : { refreshedFrom: authFileName(refreshedFrom) },
    auth: {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      // 0 means "unknown": a zero expiry must not overwrite a known future
      // one, and `expiryToMs` maps 0 back to 0 on the read side.
      expiresAt: credential.expiresAtMs > 0 ? Math.floor(credential.expiresAtMs / 1000) : 0,
      ...credential.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAt: Math.floor(credential.refreshExpiresAtMs / 1000) },
      ...credential.lastRefreshAtMs === undefined ? {} : { lastRefreshTime: Math.floor(credential.lastRefreshAtMs / 1000) },
      domain: credential.domain,
    },
    account: {
      uid: credential.uid,
      ...credential.enterpriseId === undefined ? {} : { enterpriseId: credential.enterpriseId },
      ...credential.nickname === undefined ? {} : { nickname: credential.nickname },
      ...credential.displayName === undefined ? {} : { displayName: credential.displayName },
      ...credential.enterpriseUserName === undefined ? {} : { enterpriseUserName: credential.enterpriseUserName },
      ...credential.uin === undefined ? {} : { uin: credential.uin },
    },
  }
}

/** Parse the vault document; other versions and shapes are rejected. */
export function parseVaultDocument(text: string, filePath: string): WorkBuddyCredential | undefined {
  const parsed = parseVaultDocumentWithWriteTime(text, filePath)
  return parsed === undefined ? undefined : parsed.credential
}

/**
 * Parse a vault document into its credential plus the LOCAL write time.
 *
 * Internal merge plumbing: `refreshedAtMs` is the freshness signal
 * {@link isFresherVaultEntry} needs, but it is not part of
 * {@link WorkBuddyCredential} (the runtime export type is shared with OAuth and
 * desktop reads, none of which carry it).
 */
function parseVaultDocumentWithWriteTime(
  text: string,
  filePath: string,
): { credential: WorkBuddyCredential, refreshedAtMs?: number, refreshedFrom?: string } | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  if (document['version'] !== VAULT_FORMAT_VERSION) return undefined
  if (typeof document['auth'] !== 'object' || document['auth'] === null) return undefined
  const credential = parseWorkBuddyAuth(JSON.stringify({ auth: document['auth'], account: document['account'] }), filePath)
  if (credential === undefined) return undefined
  const refreshedAtMs = typeof document['refreshedAtMs'] === 'number' && document['refreshedAtMs'] > 0
    ? document['refreshedAtMs']
    : undefined
  const refreshedFrom = typeof document['refreshedFrom'] === 'string' && document['refreshedFrom'] !== ''
    ? document['refreshedFrom']
    : undefined
  return {
    credential: { ...credential, source: 'dsh' },
    ...(refreshedAtMs === undefined ? {} : { refreshedAtMs }),
    ...(refreshedFrom === undefined ? {} : { refreshedFrom }),
  }
}

/**
 * File name of the vault's DISMISSAL list, stored beside the vault entries.
 *
 * It exists because deleting a vault entry is not the same as deleting an
 * account. `syncVault` writes every desktop sign-in it scans back into the
 * vault — that is how a desktop account becomes selectable — so removing the
 * vault file alone was undone by the very next scan: the row came back and the
 * button read as broken (measured: `removeAccount` returns true, `accounts()`
 * still lists it).
 *
 * Dismissal means HIDDEN UNTIL THE USER SCANS AGAIN, not deleted forever. A
 * desktop sign-in is still there in the app, and the manual 「re-scan」 action is
 * the user asking to see what the machine currently has — so
 * {@link WorkBuddyCredentialStore.clearDismissals} empties this list on every
 * manual scan and the accounts return. Without that, a removed account could
 * never be recovered except by reinstalling or re-signing in.
 *
 * The list must survive the automatic refreshes in between: the card polls the
 * usage route every 60 seconds, and an in-memory-only dismissal would let the
 * account reappear a minute after the user removed it. Hence a file.
 *
 * Dismissal is per ACCOUNT, not per source: hiding only the vault copy would
 * leave the same account listed from the desktop file, which is the
 * half-measure that produced the report.
 */
export const VAULT_DISMISSED_FILENAME = '.dismissed.json'

/** Current on-disk format of the dismissal list; readers reject others. */
export const DISMISSED_FORMAT_VERSION = 1

/**
 * The dismissal list as persisted: account ids the user removed, newest last.
 *
 * An ARRAY, not a map with timestamps: nothing reads when a dismissal happened,
 * and a size cap is enough to keep the file from growing without bound across
 * years of adding and removing accounts.
 */
export interface DismissedDocument {
  version: typeof DISMISSED_FORMAT_VERSION
  accountIds: string[]
}

/**
 * Ceiling on remembered dismissals.
 *
 * Generous on purpose: an entry is 24 characters, so a thousand of them is a
 * ~28 KB file, while dropping a REAL dismissal early would resurrect the account
 * and reintroduce the exact bug this list exists to fix. Only the oldest are
 * dropped, and only far beyond any plausible number of removed accounts.
 */
export const DISMISSED_LIMIT = 1000

/** Read the dismissal list; an absent or unreadable file reads as empty. */
export async function readDismissed(dir: string): Promise<Set<string>> {
  const dismissed = new Set<string>()
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dir, VAULT_DISMISSED_FILENAME), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return dismissed
    const document = parsed as Record<string, unknown>
    if (document['version'] !== DISMISSED_FORMAT_VERSION) return dismissed
    const ids = document['accountIds']
    if (!Array.isArray(ids)) return dismissed
    for (const id of ids) {
      if (typeof id === 'string' && VAULT_ACCOUNT_ID_RE.test(id)) dismissed.add(id)
    }
  } catch {
    // Absent (the common case) or unreadable: nothing is dismissed. A broken
    // list must not take account discovery down — the accounts come back,
    // which is the honest failure direction for a file that only REMOVES things.
  }
  return dismissed
}

/** Write the dismissal list atomically under its own lock. */
export async function writeDismissed(dir: string, dismissed: ReadonlySet<string>): Promise<void> {
  const path = join(dir, VAULT_DISMISSED_FILENAME)
  // Oldest-first trim: insertion order is preserved by the Set, so the first
  // entries are the oldest dismissals.
  const ids = [...dismissed].slice(-DISMISSED_LIMIT)
  const document: DismissedDocument = { version: DISMISSED_FORMAT_VERSION, accountIds: ids }
  await withFileLock(path, async () => {
    await writeFileAtomic(path, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  })
}

/**
 * Whether a directory entry is ONE ACCOUNT's vault credential file.
 *
 * The vault directory holds more than credentials: `writeDismissed` puts
 * `.dismissed.json` here, and atomic writes transiently leave
 * `<id>.json.<hex>.tmp` siblings behind. Both used to be swept up by a bare
 * `endsWith('.json')` check, and the DISMISSAL file in particular is
 * well-formed JSON that is not a credential — so `diagnose` reported it at the
 * user as 「not a readable vault credential」 on any machine where an account
 * had been removed, turning a healthy sign-in into an unreadable-looking one.
 *
 * The rule is the account id shape the store itself writes
 * ({@link VAULT_ACCOUNT_ID_RE}), not a naming convention: a file qualifies only
 * when its stem is a real id, which no bookkeeping or temp file can be. A
 * `.tmp` sibling therefore fails on the dot of its extension, and a hidden file
 * fails on its leading dot even before that.
 */
export function isVaultCredentialFileName(name: string): boolean {
  if (!name.endsWith('.json')) return false
  return VAULT_ACCOUNT_ID_RE.test(name.slice(0, -'.json'.length))
}

/** Current on-disk format of the vault; readers reject others. */
export const VAULT_FORMAT_VERSION = 1

/** The vault document, as persisted. */
export interface VaultDocument {
  version: typeof VAULT_FORMAT_VERSION
  accountId: string
  /**
   * Local epoch ms of the write that last produced this entry — the FRESHNESS
   * signal the merge rule compares against a desktop document's
   * `lastRefreshTime`. Not part of the credential: the upstream never stated
   * it, and stuffing it there would make `parseWorkBuddyAuth` read the field
   * as one of its own.
   */
  refreshedAtMs?: number
  /**
   * The file NAME of the desktop candidate this entry was refreshed FROM, when
   * the entry was produced by {@link WorkBuddyCredentialStore.refreshNow} on
   * that very file.
   *
   * This is the third state the two-clock comparison could not express. The
   * serve rule gives the live desktop file absolute priority (see
   * {@link fileRank}), which is correct while the app keeps writing a healthy
   * token — but a token the plugin itself refreshed is strictly newer than the
   * one the app last wrote, and re-reading the live file on every restart
   * resurrects the stale copy, so each restart refreshes again (a loop the
   * merged vault was meant to break). Name equality is exact and cheap: it
   * says "this entry IS a refresh of that file", which no timestamp can.
   *
   * Absent for entries written by a scan (the plugin did not refresh them) and
   * for entries written by OAuth sign-in or an import (nothing was refreshed),
   * so those keep the old precedence untouched.
   */
  refreshedFrom?: string
  /**
   * The credential in the nested desktop document's TWO-key shape: tokens and
   * session fields under `auth`, identity fields under `account`.
   * `parseWorkBuddyAuth` reads identity from the `account` key only, so a
   * document that folds everything into one key parses back with EMPTY
   * identity — the account id then stops matching the file name and the
   * entry is rejected on read.
   */
  auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    refreshExpiresAt?: number
    lastRefreshTime?: number
    domain: string
  }
  account: {
    uid: string
    enterpriseId?: string
    nickname?: string
    uin?: string
  }
}

/**
 * Rank two candidate files for the same account.
 *
 * The live `workbuddy-desktop.info` always wins: it is the app's current
 * sign-in, and the upstream revokes the tokens in the timestamped backups
 * even though their stored `expiresAt` is still in the future (observed on a
 * real machine — every backup claimed a 2027 expiry while only the live
 * file's token was accepted). Expiry is therefore only a tie-breaker among
 * backups, never the primary ordering.
 */
export function fileRank(path: string): number {
  return isLiveDesktopAuthFileName(authFileName(path)) ? 0 : 1
}

/**
 * Whether `candidate` is a better pick than `incumbent` for the same account.
 *
 * Ordering, strongest signal first:
 *
 * 1. the live `workbuddy-desktop.info` (the app's current sign-in);
 * 2. the most recent `lastRefreshAtMs` — the upstream's own issuance time;
 * 3. `expiresAtMs`, only as a fallback for documents that omit the field.
 *
 * Step 2 is what makes this correct. `expiresAt` describes how long the token
 * was VALID FOR at issue time, not whether it is still accepted: a revoked
 * backup keeps a far-future `expiresAt` (2027 in the observed case) and would
 * otherwise outrank the working live credential, which is exactly how a
 * signed-in account turned into an upstream HTML 401.
 */
export function isFresher(
  candidate: WorkBuddyCredential,
  incumbent: WorkBuddyCredential,
): boolean {
  const rankDiff = fileRank(candidate.filePath) - fileRank(incumbent.filePath)
  if (rankDiff !== 0) return rankDiff < 0
  const candidateRefresh = candidate.lastRefreshAtMs
  const incumbentRefresh = incumbent.lastRefreshAtMs
  if (candidateRefresh !== undefined && incumbentRefresh !== undefined) {
    if (candidateRefresh !== incumbentRefresh) return candidateRefresh > incumbentRefresh
  } else if (candidateRefresh !== undefined) {
    // A file that records its issuance time outranks one that does not; the
    // field is always present in desktop documents, so this only decides
    // against synthetic or truncated input.
    return true
  } else if (incumbentRefresh !== undefined) {
    return false
  }
  return candidate.expiresAtMs > incumbent.expiresAtMs
}

/**
 * Parse the plugin-owned copy; other versions and shapes are rejected.
 *
 * Pre-vault copies serialized the RUNTIME credential verbatim, whose expiry
 * field is `expiresAtMs` (ms) rather than the desktop document's
 * `expiresAt` (s) that `parseWorkBuddyAuth` reads — the round trip used to
 * lose the expiry and force a refresh after every restart. The runtime field
 * is read back here as the fallback.
 */
export function parseOwnDocument(text: string, filePath: string): WorkBuddyCredential | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  if (document['version'] !== OWN_FORMAT_VERSION) return undefined
  if (typeof document['credential'] !== 'object' || document['credential'] === null) return undefined
  const credential = parseWorkBuddyAuth(JSON.stringify({ auth: document['credential'] }), filePath)
  if (credential === undefined) return undefined
  const runtime = document['credential'] as Record<string, unknown>
  const legacyExpiry = typeof runtime['expiresAtMs'] === 'number' ? expiryToMs(runtime['expiresAtMs']) : 0
  return {
    ...credential,
    ...credential.expiresAtMs === 0 && legacyExpiry > 0 ? { expiresAtMs: legacyExpiry } : {},
    source: 'dsh',
  }
}

/**
 * Whether a freshly scanned credential should REPLACE a vault entry of the
 * same account.
 *
 * The vault is a CACHE of credentials the machine already holds, not a
 * competing source. Two clocks decide, compared like against like:
 *
 * - The scan's clock is the DESKTOP document's `lastRefreshTime` (the
 *   upstream's own issuance time) — and the live file ranks above every
 *   backup regardless of time, per {@link fileRank}.
 * - The vault entry's clock is `refreshedAtMs`, the local write time of the
 *   plugin refresh (or OAuth login) that produced it. A wall clock is not
 *   comparable to an issuance time, so the two are NOT mixed: the entry is
 *   replaced only when the scan's read is the live sign-in AND either the
 *   entry predates the scan read's issuance, or the entry was written before
 *   the plugin refreshed into it — approximated by requiring the live file's
 *   issuance to be NEWER than the entry's write time.
 *
 * The rule's purpose is breaking the refresh loop: without it, a scan keeps
 * reinstating the (older, soon-to-expire) desktop token over the refreshed
 * vault copy, so every restart re-refreshes every account. With it, the
 * desktop token wins only while it is genuinely newer than what the plugin
 * last wrote — after that the refreshed copy is the operative credential,
 * exactly like the pre-vault per-region copies behaved.
 */
export function shouldReplaceVaultEntry(
  candidate: WorkBuddyCredential,
  incumbent: VaultEntry,
): boolean {
  if (fileRank(candidate.filePath) !== 0) return false
  const writeMs = incumbent.refreshedAtMs
  if (writeMs === undefined) return true
  const issuanceMs = candidate.lastRefreshAtMs
  if (issuanceMs === undefined) return candidate.expiresAtMs > incumbent.credential.expiresAtMs
  return issuanceMs > writeMs
}

/**
 * Read every vault entry for one region directory.
 *
 * The map is keyed by account id, which the FILE NAME already carries: the
 * id inside the document is checked against it and a mismatched file is
 * skipped — a file copied between accounts (or a half-written rename) must
 * not silently answer for the wrong account.
 */
export async function readVaultEntries(dir: string): Promise<Map<string, VaultEntry>> {
  const entries = new Map<string, VaultEntry>()
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error: unknown) {
    // Absent vault = empty vault, not an error; anything else propagates so
    // the caller can skip its write pass too.
    if (isENOENT(error)) return entries
    throw error
  }
  for (const name of names) {
    // Credential files only: `.dismissed.json` and `.tmp` siblings live in this
    // directory too, and parsing them here would either add a bogus entry or
    // (the real defect) surface as an unreadable credential to the user. See
    // {@link isVaultCredentialFileName}.
    if (!isVaultCredentialFileName(name)) continue
    const path = join(dir, name)
    try {
      const parsed = parseVaultDocumentWithWriteTime(await readFile(path, 'utf8'), path)
      if (parsed === undefined) continue
      const id = name.slice(0, -'.json'.length)
      if (workbuddyAccountId(parsed.credential) !== id) continue
      entries.set(id, parsed)
    } catch {
      // absent or unreadable between readdir and open — skip, don't fail
    }
  }
  return entries
}

/**
 * One vault entry as read from disk: the credential plus the two bookkeeping
 * fields the merge rules read alongside it.
 */
export interface VaultEntry {
  credential: WorkBuddyCredential
  /** Local write time of the file; compared against a desktop issuance time. */
  refreshedAtMs?: number
  /** Desktop file this entry was refreshed FROM; see {@link VaultDocument}. */
  refreshedFrom?: string
}

/**
 * Write one vault entry atomically under the file lock.
 *
 * The directory is hardened BEFORE the file is created (issue #183). Order
 * matters: `writeFileAtomic` commits by creating a temp inode and renaming it
 * over the target, so an ACL applied to the file afterwards would leave the
 * pre-rename window open, and a crash between the two would leave a plaintext
 * token in a file nobody hardened. Hardening the directory first means the
 * replacement inode inherits the restricted ACEs at creation.
 *
 * The hardening is best-effort on purpose: it is defence in depth, and refusing
 * to persist a credential because an ACL call failed would turn it into an
 * outage. `doctor` reports the outcome so a machine where it failed is visible.
 * On POSIX this call is a no-op, and `mode` below carries the same intent.
 *
 * WHICH directory gets hardened is decided by {@link vaultRootToHarden}, not by
 * a bare `dirname(dir)` — see the issue #208 note there.
 */
export async function writeVaultEntry(
  dir: string,
  accountId: string,
  credential: WorkBuddyCredential,
  refreshedFrom?: string,
): Promise<void> {
  const path = join(dir, `${accountId}.json`)
  await protectCredentialDirectory(vaultRootToHarden(dir))
  await withFileLock(path, async () => {
    await writeFileAtomic(path, `${JSON.stringify(vaultDocument(credential, accountId, refreshedFrom), null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
  })
}

/**
 * The directory {@link writeVaultEntry} hardens: the vault ROOT, not this
 * entry's own directory (issue #183), and never the Harness home (issue #208).
 *
 * WHY THE ROOT. `Everyone: FullControl` is inherited from `~/.dsh` onto
 * `…/workbuddy-vault`; hardening only `<vault>/<region>` would leave the root
 * writable, so any local process could replace the region directory itself and
 * defeat the restriction inside it. Hardening the root propagates down the
 * whole tree in one `icacls` call (measured on a real host: one call on the
 * root left the root, both region directories AND the files inside with exactly
 * the three intended ACEs).
 *
 * WHY NOT ALWAYS `dirname(dir)` — THE ISSUE #208 DEFECT. That shape assumes
 * `dir` is `<vault>/<region>`. It is not for the UNREGIONED store, whose vault
 * directory IS `<DSH home>/workbuddy-vault`; `dirname` then yields `<DSH home>`
 * itself, and `/inheritance:r` there strips the ACEs every other directory
 * under the home inherits. A reporter hit exactly that: `<DSH home>/attachments`
 * became unreadable (EPERM on `scandir`) and every image send failed with the
 * host's unrelated `prompt rejected (session/agent-busy)`. `doctor` reaches
 * this path because it builds an unregioned store.
 *
 * So the parent is used only when it is genuinely a vault root — i.e. NOT the
 * Harness home. When `dir` already IS the vault root, `dir` is the right
 * target. `src/windows-acl.ts` independently refuses the home and its
 * ancestors, which covers an injected `vaultDir` and any future call site that
 * computes this one level too high; this export function is what keeps the CORRECT
 * call from relying on that backstop.
 */
function vaultRootToHarden(dir: string): string {
  const parent = dirname(dir)
  // Compared with `resolve` on both sides so a trailing separator or a relative
  // `DSH_HOME` cannot slip past the equality check.
  return resolve(parent) === resolve(resolveDshHome()) ? dir : parent
}
