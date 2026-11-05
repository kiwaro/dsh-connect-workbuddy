/** 从 auth.ts 按职责提取；来源与许可证说明见原文件头及 THIRD_PARTY_NOTICES.md。 */

import { createHash } from 'node:crypto'

import { isEncryptedFieldWrapper, openEncryptedField } from './at-rest.ts'

import type { WorkBuddyCredential } from './auth-types.ts'

/** One selectable local account, token-free. */
/**
 * The name to SHOW for a credential (issue #124).
 *
 * The order matters and is not arbitrary: on an enterprise credential
 * `nickname` is the LOGIN ALIAS, so putting it first made the card look like it
 * was managing a stranger's account. The official client prefers the display
 * name, then the enterprise-side user name, and only then the alias.
 *
 * Blank spellings are skipped rather than preferred: the app writes `"   "` in
 * places, and rendering whitespace where a name belongs is worse than falling
 * through to the alias.
 *
 * Exported because the same order has to hold in the store's account list, the
 * pool rows and the composer panel — three sites that must not drift.
 */
export function preferredAccountName(fields: {
  displayName?: string
  enterpriseUserName?: string
  nickname?: string
}): string {
  for (const candidate of [fields.displayName, fields.enterpriseUserName, fields.nickname]) {
    if (candidate !== undefined && candidate.trim() !== '') return candidate
  }
  return ''
}

/**
 * Carry display names forward across a re-read of the same account.
 *
 * The desktop auth document is the only source for these fields and it does
 * not always publish them: a refresh that rewrites the document can drop
 * `displayName` while keeping the same sign-in. Replacing the whole record
 * would then silently fall back to the alias — the exact symptom #124 reports,
 * coming back on its own. So an absent field yields to the previous value and a
 * PRESENT one wins (it is the newer reading).
 */
export function mergeCredentialDisplayNames<T extends {
  displayName?: string
  enterpriseUserName?: string
  nickname?: string
}>(previous: T | undefined, next: T): T {
  if (previous === undefined) return next
  return {
    ...next,
    ...next.displayName === undefined && previous.displayName !== undefined
      ? { displayName: previous.displayName }
      : {},
    ...next.enterpriseUserName === undefined && previous.enterpriseUserName !== undefined
      ? { enterpriseUserName: previous.enterpriseUserName }
      : {},
    ...next.nickname === undefined && previous.nickname !== undefined
      ? { nickname: previous.nickname }
      : {},
  }
}

/** Normalize an expiry that may arrive in seconds or milliseconds. */
export function expiryToMs(value: number): number {
  if (value <= 0) return 0
  return value > 1e12 ? value : value * 1000
}

/**
 * Resolve one string field, transparently opening the desktop app's
 * encrypted-field wrapper when present.
 *
 * Windows builds of the WorkBuddy desktop app store `accessToken` and
 * `refreshToken` as `{$wbEncrypted:1,envelope}` instead of plain strings; a
 * reader that only accepts strings sees no credential at all and reports the
 * account as signed out. The SAME treatment applies to `nickname`: it is
 * encrypted in those builds too, so a strings-only reader silently degrades the
 * account's display name to its uin (a bare number) even after tokens start
 * working — which reads as "the plugin does not know who this is".
 *
 * `key` is undefined when the at-rest key could not be obtained, in which case
 * an encrypted field resolves to undefined rather than to a fabricated value.
 */
export function credentialField(
  value: unknown,
  key: Buffer | undefined,
): string | undefined {
  if (typeof value === 'string') return value
  if (!isEncryptedFieldWrapper(value)) return undefined
  if (key === undefined) return undefined
  return openEncryptedField(value, key)
}

/**
 * An optional field that may legitimately be absent: an absent value, a
 * non-string that is not a wrapper, and an unopenable wrapper all mean
 * "unknown", which must not fail the whole document. Only the REQUIRED token
 * fields treat an unopenable wrapper as fatal (see {@link parseWorkBuddyAuth}).
 *
 * `account.phoneNumber` is deliberately never read: it is encrypted in these
 * builds, and the card's privacy contract admits nickname, masked uin, expiry
 * and credits only — a phone number is none of the plugin's business.
 */
export function optionalCredentialField(value: unknown, key: Buffer | undefined): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value
  if (!isEncryptedFieldWrapper(value)) return undefined
  if (key === undefined) return undefined
  try {
    return openEncryptedField(value, key)
  } catch {
    return undefined
  }
}

/**
 * Parse a WorkBuddy auth document in either on-disk shape: the plugin OAuth
 * nested form `{"auth":{...},"account":{...}}` and the flat panel form.
 * Returns undefined when the document carries no access token.
 *
 * `atRestKey` is required to read documents whose fields are encrypted
 * (see {@link credentialField}); pass the key obtained from
 * `readAtRestKey()` when the plain read reports no token.
 */
export function parseWorkBuddyAuth(
  text: string,
  filePath: string,
  atRestKey?: Buffer,
): WorkBuddyCredential | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const document = parsed as Record<string, unknown>
  let auth: Record<string, unknown>
  let identity: Record<string, unknown>
  if (typeof document['auth'] === 'object' && document['auth'] !== null) {
    auth = document['auth'] as Record<string, unknown>
    identity = typeof document['account'] === 'object' && document['account'] !== null
      ? document['account'] as Record<string, unknown>
      : {}
  } else {
    auth = document
    identity = document
  }
  let accessToken: string | undefined
  let refreshToken: string | undefined
  try {
    accessToken = credentialField(auth['accessToken'], atRestKey)
    refreshToken = credentialField(auth['refreshToken'], atRestKey)
  } catch {
    // A malformed envelope, a key mismatch, or a failed authentication tag is
    // "this document is not readable", exactly like an absent token — it must
    // never surface as a half-decrypted credential.
    return undefined
  }
  if (accessToken === undefined || accessToken === '') return undefined
  const expiresAtMs = typeof auth['expiresAt'] === 'number' ? expiryToMs(auth['expiresAt']) : 0
  const refreshExpiresAtMs = typeof auth['refreshExpiresAt'] === 'number' ? expiryToMs(auth['refreshExpiresAt']) : undefined
  const lastRefreshAtMs = typeof auth['lastRefreshTime'] === 'number' ? expiryToMs(auth['lastRefreshTime']) : undefined
  const enterpriseId = optionalCredentialField(identity['enterpriseId'], atRestKey)
  const nickname = optionalCredentialField(identity['nickname'], atRestKey)
  const displayName = optionalCredentialField(identity['displayName'], atRestKey)
  const enterpriseUserName = optionalCredentialField(identity['enterpriseUserName'], atRestKey)
  const uin = optionalCredentialField(identity['uin'], atRestKey)
  const credential: WorkBuddyCredential = {
    accessToken,
    refreshToken: refreshToken ?? '',
    expiresAtMs,
    ...refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs },
    domain: optionalCredentialField(auth['domain'], atRestKey) ?? '',
    uid: optionalCredentialField(identity['uid'], atRestKey) ?? '',
    ...enterpriseId === undefined ? {} : { enterpriseId },
    ...nickname === undefined ? {} : { nickname },
    ...displayName === undefined ? {} : { displayName },
    ...enterpriseUserName === undefined ? {} : { enterpriseUserName },
    ...uin === undefined ? {} : { uin },
    ...lastRefreshAtMs === undefined ? {} : { lastRefreshAtMs },
    source: 'desktop',
    filePath,
  }
  return credential
}

/**
 * Whether a document carries any field the reader must decrypt — the token
 * fields or the identity fields — i.e. whether reading it needs the at-rest key
 * at all.
 *
 * Deciding this BEFORE asking the app for its key keeps the plain case (macOS
 * and older Windows builds, and every plugin-owned copy) from paying for a
 * child process on every credential read. Identity fields are included because
 * a future build could encrypt the display name while leaving tokens plain;
 * gating on tokens alone would then silently drop the name again.
 */
export function hasEncryptedCredentialFields(text: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
  const document = parsed as Record<string, unknown>
  const auth = typeof document['auth'] === 'object' && document['auth'] !== null
    ? document['auth'] as Record<string, unknown>
    : document
  const identity = typeof document['account'] === 'object' && document['account'] !== null
    ? document['account'] as Record<string, unknown>
    : document
  return isEncryptedFieldWrapper(auth['accessToken'])
    || isEncryptedFieldWrapper(auth['refreshToken'])
    || isEncryptedFieldWrapper(identity['nickname'])
    || isEncryptedFieldWrapper(identity['uin'])
    || isEncryptedFieldWrapper(identity['uid'])
    || isEncryptedFieldWrapper(identity['enterpriseId'])
    || isEncryptedFieldWrapper(auth['domain'])
}

/**
 * The exact shape of an account id — sha256 hex sliced to 24 characters, which
 * is what {@link workbuddyAccountId} emits and therefore the only string a
 * vault file name can legitimately have.
 *
 * An id becomes a path segment, so this is also the traversal guard: an
 * attacker-supplied `../..` is rejected before it can address anything outside
 * the vault directory. Exported so the HTTP route can reject a bad id with a
 * 400 instead of a thrown error.
 */
export const VAULT_ACCOUNT_ID_RE = /^[0-9a-f]{24}$/

/** Whether a string is a well-formed account id. */
export function isVaultAccountId(value: unknown): value is string {
  return typeof value === 'string' && VAULT_ACCOUNT_ID_RE.test(value)
}

/**
 * Stable account id. `uin` is the billing identity the upstream keys on and
 * survives across re-login; `uid` is the fallback for documents without one.
 */
export function workbuddyAccountId(
  credential: Pick<WorkBuddyCredential, 'uin' | 'uid' | 'nickname'>,
): string {
  const stable = credential.uin ?? credential.uid ?? credential.nickname ?? 'unknown'
  return createHash('sha256').update(`workbuddy\0${stable}`).digest('hex').slice(0, 24)
}
