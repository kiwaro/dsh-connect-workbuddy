/**
 * Apply and inspect Windows ACLs for the plugin credential vault.
 * Directory grants name the current user, SYSTEM and Administrators explicitly.
 * The implementation removes inherited ACEs and replaces grants for those
 * principals. It does not remove every other explicit ACE or audit every child.
 * Existing child inheritance settings can prevent propagation.
 *
 * Successful directory attempts are cached for the process and concurrent
 * attempts share one operation. A later external ACL edit is not detected by
 * that cache. DSH home and its ancestors are refused to avoid changing unrelated
 * profile/session permissions. Failures are returned for diagnostics rather
 * than blocking credential writes. ACLs restrict access; they do not encrypt data.
 */

import { execFile } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { resolveDshHome } from './host-peers.ts'

/**
 * Well-known SID for "the owner of this object".
 *
 * Deliberately a SID rather than an account name: it needs no lookup, it works
 * on every UI language, and `icacls` accepts it in the `*S-…` form.
 *
 * Since issue #199 it is READ-ONLY here: 5.x granted it, which locks a user out
 * of a directory owned by somebody else, so {@link directoryGrants} and
 * {@link fileGrants} no longer use it — but {@link ALLOWED_SIDS} still accepts
 * it, so a vault hardened by 5.x (where the user normally IS the owner) still
 * inspects as `protected`.
 */
const OWNER_RIGHTS_SID = 'S-1-3-4'

/** Well-known SID for `NT AUTHORITY\SYSTEM`. */
const SYSTEM_SID = 'S-1-5-18'

/** Well-known SID for `BUILTIN\Administrators`. */
const ADMINISTRATORS_SID = 'S-1-5-32-544'

/**
 * Principals allowed to keep access, as SIDs.
 *
 * Used by {@link inspectCredentialDirectory} to tell "hardened" from "somebody
 * widened it again"; keeping the list beside the grant specs is what stops the
 * two from drifting.
 */
const ALLOWED_SIDS: ReadonlySet<string> = new Set([OWNER_RIGHTS_SID, SYSTEM_SID, ADMINISTRATORS_SID])

/**
 * Grant specs for a DIRECTORY: `(OI)` object-inherit and `(CI)` container-inherit
 * make the ACE apply to files and subdirectories created later, which is the
 * whole mechanism this module relies on.
 *
 * `userSid` is deliberately a PARAMETER rather than a constant: it is the only
 * principal whose identity is not a well-known SID, and making it explicit at
 * the call site is what keeps a future edit from quietly falling back to
 * `OWNER RIGHTS` (the issue #199 lockout).
 */
function directoryGrants(userSid: string): readonly string[] {
  return [
    `*${userSid}:(OI)(CI)(F)`,
    `*${SYSTEM_SID}:(OI)(CI)(F)`,
    `*${ADMINISTRATORS_SID}:(OI)(CI)(F)`,
  ]
}

/**
 * Grant specs for a FILE.
 *
 * No `(OI)(CI)`: inheritance flags on a file are meaningless, and passing them
 * is what produced the blanked DACLs measured with `/T`.
 */
function fileGrants(userSid: string): readonly string[] {
  return [
    `*${userSid}:(F)`,
    `*${SYSTEM_SID}:(F)`,
    `*${ADMINISTRATORS_SID}:(F)`,
  ]
}

/** How long one `icacls` (or PowerShell) child may take before it is abandoned. */
const ACL_COMMAND_TIMEOUT_MS = 10_000

/**
 * Result of one hardening attempt.
 *
 * `not-windows` is a normal POSIX answer, not a failure: the `mode` argument
 * already conveys the same intent there. Keeping the two apart is what lets
 * `doctor` avoid warning every macOS user about a Windows-only measure.
 */
export type CredentialAclOutcome =
  | { state: 'protected' }
  | { state: 'not-windows' }
  /**
   * Refused on purpose (issue #208): the target is the Harness home itself, or
   * an ancestor of it. This is NOT a failure — nothing was attempted and nothing
   * is wrong with the machine, so `doctor` must not print a recovery hint.
   */
  | { state: 'skipped', reason: string }
  | { state: 'failed', reason: string }

/**
 * What {@link inspectCredentialDirectory} found.
 *
 * `unverified` is distinct from `failed`: it means the ACL could not be READ
 * back (PowerShell missing, command timed out), which says nothing about whether
 * the hardening holds.
 */
export interface CredentialAclReport {
  /** The directory inspected. */
  directory: string
  /** `failed` arrived with issue #199: the doctor-side report now carries it. */
  state: 'protected' | 'exposed' | 'not-windows' | 'unverified' | 'failed'
  /** Principals holding access, as SIDs, when the read succeeded. */
  entries?: string[]
  /** The subset of {@link entries} that is neither the owner nor an administrator. */
  weak?: string[]
  /** Why the state is `unverified`, or the first unexpected arg worth recording. */
  reason?: string
}

/** Paths already hardened by THIS process, so repeat writes cost nothing. */
const protectedDirectories = new Set<string>()

/** Hardening attempts in flight, keyed by path: a burst joins one child. */
const inflightProtection = new Map<string, Promise<CredentialAclOutcome>>()

/** Whether this process is running on Windows; a seam for tests. */
function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * Run one child process, resolving to its stdout.
 *
 * `windowsHide` is mandatory for the same reason recorded in `at-rest.ts` and
 * `docs/WINDOWS.md` §1-5: the DSH Desktop host is an Electron GUI process with
 * no console, so spawning a console program without it flashes a visible black
 * window. `icacls` here runs on the credential-write path, which a user can
 * trigger repeatedly from the card — an un-hidden spawn would blink at them on
 * every account switch.
 *
 * Sets `windowsVerbatimArguments: false` implicitly (the default) so each argv
 * element is quoted by Node rather than concatenated: the grant specs contain
 * parentheses, which a raw command-line join would hand to `cmd` for parsing.
 * This is why the arguments go through `execFile` as an ARRAY and never as a
 * single shell string.
 */
function runCommand(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { encoding: 'utf8', windowsHide: true, timeout: ACL_COMMAND_TIMEOUT_MS },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`${file} exited ${String((error as NodeJS.ErrnoException).code ?? error.message)}`))
          return
        }
        resolve(stdout)
      },
    )
  })
}

/**
 * Remove inherited ACEs and replace grants for the supplied principals.
 * This does not change object ownership or remove unrelated explicit ACEs.
 * Repeating the same grants is intended to avoid duplicate entries.
 */
async function applyAcl(path: string, grants: readonly string[]): Promise<void> {
  const args = [path, '/inheritance:r']
  for (const grant of grants) {
    args.push('/grant:r', grant)
  }
  await runCommand('icacls', args)
}

/**
 * Apply inheritable grants to one credential directory with one icacls call.
 * Children can inherit those grants; protected child ACLs and explicit child
 * entries are not comprehensively repaired by this operation. Successful paths
 * are cached and concurrent attempts share a promise. Later external ACL changes
 * require separate inspection; failed attempts can be retried on a later write.
 */
export async function protectCredentialDirectory(directory: string): Promise<CredentialAclOutcome> {
  if (!isWindows()) return { state: 'not-windows' }
  const refusal = harnessHomeRefusal(directory)
  if (refusal !== undefined) return { state: 'skipped', reason: refusal }
  if (protectedDirectories.has(directory)) return { state: 'protected' }
  const pending = inflightProtection.get(directory)
  if (pending !== undefined) return pending
  const attempt = hardenDirectory(directory)
  inflightProtection.set(directory, attempt)
  try {
    return await attempt
  } finally {
    inflightProtection.delete(directory)
  }
}

/**
 * Why `directory` must NOT be hardened, or `undefined` when it may be
 * (issue #208).
 *
 * THE DEFECT THIS CLOSES. Hardening drops inherited ACEs (`/inheritance:r`).
 * Applied to `<DSH home>` itself that also drops what every OTHER directory
 * under it inherits — `<DSH home>/attachments`, sessions, profile config —
 * and a child whose DACL came purely from that inheritance becomes
 * unreadable even to its owner. The reporter measured exactly that: after
 * installing the plugin, sending an image failed with `EPERM: operation not
 * permitted, scandir '<DSH home>/attachments'` while text messages were
 * unaffected, and `icacls <DSH home>` itself printed "Access is denied". The
 * UI showed the host's generic `prompt rejected (session/agent-busy)`, so the
 * symptom pointed at sessions rather than at the DACL.
 *
 * HOW THIS PLUGIN COULD REACH IT. `writeVaultEntry` hardens `dirname(dir)`.
 * For a region-scoped store that is `<DSH home>/workbuddy-vault` (correct), but
 * the UNREGIONED store — which `doctor` builds via `makeAnyStore()` — keeps its
 * vault AT `<DSH home>/workbuddy-vault` itself, so `dirname` resolves to
 * `<DSH home>`. Reproduced here with a stubbed `icacls`: the argv target was
 * the Harness home, and the three SIDs the reporter found on `<DSH home>` are
 * exactly `directoryGrants()`'s.
 *
 * WHY REFUSE RATHER THAN SPECIAL-CASE THE CALLER. A guard at THIS layer also
 * covers `<DSH home>/.dsh`-style ancestors, a future call site computing the
 * root one level too high (the reporter's own third question), and a
 * `WORKBUDDY_*` variable pointing the vault at `$HOME`. The blast radius of
 * getting it wrong is the whole harness home, so the check belongs where the
 * destructive operation is, not where its arguments are assembled.
 *
 * Ancestors are refused too, not just equality: hardening the PARENT of the
 * harness home strips the inheritance the home itself relies on, which breaks
 * it just as thoroughly and is even harder to recognise afterwards.
 */
function harnessHomeRefusal(directory: string): string | undefined {
  let home: string
  try {
    home = resolve(resolveDshHome())
  } catch {
    // An unresolvable home cannot be compared, and guessing would risk the
    // very defect this guard exists for: refuse rather than proceed blind.
    return 'the Harness home could not be resolved, so this directory cannot be proven safe to harden'
  }
  // Equality is compared case-insensitively for the same reason as the
  // containment check below: on Windows `C:\\Users\\x` IS `C:\\users\\x`, and
  // missing that would let the exact defect through.
  const target = resolve(directory)
  if (target.toLowerCase() === home.toLowerCase()) {
    return `refusing to harden the Harness home itself (${home}); /inheritance:r there would strip the ACEs every other directory under it inherits`
  }
  // Case-insensitive is the safe direction here: Windows paths are
  // case-insensitive, so `C:\\USERS\\x` and `C:\\Users\\x` are the same directory,
  // and a false POSITIVE only skips a hardening while a false NEGATIVE destroys
  // the home. `toLowerCase` rather than a platform branch keeps one code path.
  const foldedHome = `${home}${sep}`.toLowerCase()
  if (foldedHome.startsWith(`${target}${sep}`.toLowerCase())) {
    return `refusing to harden ${target}, which contains the Harness home (${home}); dropping inherited ACEs on an ancestor breaks the whole home tree`
  }
  return undefined
}

/**
 * The current user's SID, resolved once per process.
 *
 * Node's `os.userInfo()` does NOT expose a SID on Windows (its typings have no
 * `sid`, and the runtime object carries none — measured), so the SID has to
 * come from outside the process.
 *
 * `whoami.exe` rather than PowerShell: measured on the machine that reported
 * issue #199, `whoami /user /fo csv /nh` takes 22–26 ms while a
 * `powershell -Command` round trip takes 133 ms — and since this shape pays the
 * cost on the credential-write path, which the startup roster refresh is
 * racing, that 5× difference is the difference between fitting the poll budget
 * and blowing it.
 *
 * The absolute path is deliberate: a bare `whoami` resolves through `PATH`,
 * where Git for Windows ships an MSYS `whoami` that does not understand
 * `/user` at all. `/fo csv /nh` gives one quoted line
 * (`"desktop\user","S-1-5-21-…"`), which is parsed rather than the default
 * formatted block, again for locale independence.
 *
 * Memoized for the process on SUCCESS only: an unresolvable SID is a real
 * failure and must be retried by the next write, not cached as broken forever.
 */
let cachedUserSid: string | undefined
async function resolveUserSid(): Promise<string> {
  if (cachedUserSid === undefined) {
    const whoami = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe')
    const stdout = await runCommand(whoami, ['/user', '/fo', 'csv', '/nh'])
    const line = stdout.split(/\r?\n/u).map(entry => entry.trim()).find(entry => /S-1-5-[\d-]+/u.test(entry))
    if (line === undefined) throw new Error('whoami returned no resolvable user SID')
    const match = /"(S-1-5-[\d-]+)"/u.exec(line) ?? /S-1-5-[\d-]+/u.exec(line)
    if (match === null) throw new Error('whoami output has no parseable SID field')
    cachedUserSid = match[1] ?? match[0]
  }
  return cachedUserSid
}

/** The work behind {@link protectCredentialDirectory}: one `icacls` call. */
async function hardenDirectory(directory: string): Promise<CredentialAclOutcome> {
  try {
    await mkdir(directory, { recursive: true })
    let grants: readonly string[]
    try {
      // The grant names the user EXPLICITLY, so the directory's owner is
      // irrelevant and never read. Only the user SID has to resolve, and it is
      // memoized after the first success.
      grants = directoryGrants(await resolveUserSid())
    } catch (error: unknown) {
      // An unresolvable user SID → do NOT guess. Falling back to
      // `OWNER RIGHTS` here would risk re-creating the issue #199 lockout;
      // failing loudly lets the next write retry and keeps the outcome
      // visible to `doctor` instead of silently locking the user out.
      return { state: 'failed', reason: `user SID lookup failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    await applyAcl(directory, grants)
    protectedDirectories.add(directory)
    return { state: 'protected' }
  } catch (error: unknown) {
    return { state: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Apply file grants for the current user, SYSTEM and Administrators.
 * Other explicit ACEs can remain. File paths are not memoized because atomic
 * replacement can create a new file. Return the outcome rather than throwing.
 */
export async function protectCredentialFile(path: string): Promise<CredentialAclOutcome> {
  if (!isWindows()) return { state: 'not-windows' }
  try {
    await applyAcl(path, fileGrants(await resolveUserSid()))
    return { state: 'protected' }
  } catch (error: unknown) {
    return { state: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read ACL principal SIDs for one directory using PowerShell.
 * The result compares principals with an allowlist. It does not evaluate rights,
 * allow/deny semantics, required grants or child-file ACLs. Thus protected means
 * no unexpected principal was returned by this check, not a full access audit.
 * Read failures return unverified. Credential file contents are not opened.
 */
export async function inspectCredentialDirectory(directory: string): Promise<CredentialAclReport> {
  if (!isWindows()) return { directory, state: 'not-windows' }
  /**
   * Deliberately a single quoted expression with no interpolation of `directory`
   * beyond the literal path: `-LiteralPath` keeps a path containing `[` or `$`
   * from being treated as a wildcard or a subexpression.
   */
  const script = [
    `$a = Get-Acl -LiteralPath '${directory.replace(/'/gu, "''")}'`,
    '$a.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }',
  ].join('; ')
  let stdout: string
  try {
    stdout = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
  } catch (error: unknown) {
    return { directory, state: 'unverified', reason: error instanceof Error ? error.message : String(error) }
  }
  const entries = stdout
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line !== '' && /^S-1-/u.test(line))
  if (entries.length === 0) {
    return { directory, state: 'unverified', reason: 'Get-Acl returned no principals' }
  }
  /**
   * The current user is an ALLOWED principal, not a widening.
   *
   * This is the read side of the issue #199 fix: 5.x granted `OWNER RIGHTS`,
   * whose SID (S-1-3-4) can be compared against {@link ALLOWED_SIDS} without
   * knowing who runs the process, but the fix grants the user's REAL SID — so
   * the allowlist has to learn it, or a correctly hardened directory reports as
   * `exposed` naming the user themselves. Measured on a real host before this
   * was wired up: `weak: ["S-1-5-21-…-1001"]` on a freshly hardened vault.
   *
   * An unresolvable user SID is reported as `unverified` rather than guessed:
   * without it the read cannot tell "the user" from "some other account", and
   * both wrong answers (allowing everyone / accusing the user) are worse than
   * saying the measurement did not happen.
   */
  let userSid: string
  try {
    userSid = await resolveUserSid()
  } catch (error: unknown) {
    return { directory, state: 'unverified', reason: `user SID lookup failed: ${error instanceof Error ? error.message : String(error)}` }
  }
  const weak = entries.filter(sid => sid !== userSid && !ALLOWED_SIDS.has(sid))
  return { directory, state: weak.length === 0 ? 'protected' : 'exposed', entries, weak }
}
