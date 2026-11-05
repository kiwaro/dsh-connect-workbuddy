/** 从 auth.ts 按职责提取；来源与许可证说明见原文件头及 THIRD_PARTY_NOTICES.md。 */
import { readFile } from 'node:fs/promises'

import { WORKBUDDY_APP_EXECUTABLE_ENV } from './at-rest.ts'

import type { WorkBuddyCredential, WorkBuddyCandidateFailure } from './auth-types.ts'
import { parseWorkBuddyAuth, hasEncryptedCredentialFields } from './auth-parse.ts'

/** Whether a filesystem error reports an absent path. */
export function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/**
 * One candidate file's probe result: the credential it yielded, or the reason
 * it yielded none.
 *
 * `encrypted` is deliberately its own reason rather than folding into
 * `invalid`. A document whose token fields are encrypted is *unreadable without
 * the desktop app*, not malformed — reporting it as invalid would send a
 * correctly signed-in user off to sign in again, which cannot possibly help.
 */
export type AuthFileProbe =
  | { credential: WorkBuddyCredential }
  | { failure: Omit<WorkBuddyCandidateFailure, 'path' | 'source'> }

/**
 * Probe one auth file, reporting WHY it yielded no credential.
 *
 * The desktop app encrypts its token fields on Windows builds. The plain read
 * is tried first and the app is only asked for its at-rest key when the
 * document actually carries encrypted wrappers, so the common case costs no
 * child process. `resolveAtRestKey` is injectable so the encrypted path is
 * testable without a real desktop install.
 */
export async function probeAuthFile(
  path: string,
  resolveAtRestKey: () => Promise<Buffer | undefined>,
): Promise<AuthFileProbe> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error: unknown) {
    const missing = isENOENT(error)
    return {
      failure: {
        reason: missing ? 'missing' : 'unreadable',
        // An ENOENT message is the path spelled out again ("ENOENT: no such
        // file or directory, open '<path>'"), and the card already prints that
        // path on its own line — carrying it here rendered the same string
        // twice in a row. A genuine read error (EACCES, EISDIR) says something
        // the reason alone does not, so only that one is kept.
        ...missing ? {} : { message: error instanceof Error ? error.message.replaceAll(path, '[credential]') : String(error).replaceAll(path, '[credential]') },
      },
    }
  }
  const plain = parseWorkBuddyAuth(text, path)
  if (plain !== undefined) return { credential: plain }
  // Not plain-readable. Distinguish "the app encrypted this and we could not
  // open it" from "this document is simply not a credential": only the former
  // deserves the encrypted-specific advice.
  const encrypted = hasEncryptedCredentialFields(text)
  if (!encrypted) {
    return isParseableJson(text)
      ? { failure: { reason: 'invalid', message: 'no access token in the document' } }
      : { failure: { reason: 'invalid', message: 'the file is not valid JSON' } }
  }
  let key: Buffer | undefined
  try {
    key = await resolveAtRestKey()
  } catch (error: unknown) {
    // The app did not hand over its key (not installed, older or newer build).
    return {
      failure: {
        reason: 'encrypted',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
  if (key === undefined) {
    return {
      failure: {
        reason: 'encrypted',
        message: `the credential fields are encrypted and no key was available; the WorkBuddy desktop app must be present (or set ${WORKBUDDY_APP_EXECUTABLE_ENV})`,
      },
    }
  }
  const decrypted = parseWorkBuddyAuth(text, path, key)
  // A key WAS obtained and the document still did not yield a token: the
  // envelope is malformed, the key belongs to another build, or the auth tag
  // failed. That is a genuine format problem, not a missing app.
  return decrypted === undefined
    ? { failure: { reason: 'invalid', message: 'the encrypted credential fields could not be opened with the desktop app\'s key' } }
    : { credential: decrypted }
}

/** Whether text parses as JSON at all; distinguishes "wrong shape" from "not JSON". */
export function isParseableJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Read one auth file, tolerating absence and unparsable content. Kept as the
 * credential-only view for callers that do not need the failure reason.
 */
export async function readAuthFile(
  path: string,
  resolveAtRestKey: () => Promise<Buffer | undefined>,
): Promise<WorkBuddyCredential | undefined> {
  const probe = await probeAuthFile(path, resolveAtRestKey)
  return 'credential' in probe ? probe.credential : undefined
}
