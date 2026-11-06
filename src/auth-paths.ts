/** 从 auth.ts 按职责提取；来源与许可证说明见原文件头及 THIRD_PARTY_NOTICES.md。 */

import { homedir } from 'node:os'
import { join, posix } from 'node:path'
import { resolveDshHome } from './host-peers.ts'

import { type WorkBuddyRegion } from './upstream.ts'

/** Legacy single-copy basename (pre-dual-provider); kept as migration source. */
export const WORKBUDDY_AUTH_FILENAME = '.workbuddy-auth.json'

/** Env variable that overrides the desktop auth-file location. */
export const WORKBUDDY_AUTH_FILE_ENV = 'WORKBUDDY_AUTH_FILE'

/**
 * Basenames the live WorkBuddy desktop auth file is known to use.
 *
 * ISSUE #174: the constant used to be ONE name, `workbuddy-desktop.info`, and
 * the 5.7.x Windows app writes `workbuddy-desktop-ai.info` instead — the same
 * directory, the same payload, a different filename (measured by the reporter:
 * `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\` held
 * `workbuddy-desktop-ai.info` plus timestamped backups of that same name, and no
 * file carrying the constant's name at all). The consequences were both silent:
 * the "live file always wins" rule in {@link fileRank} never matched, so
 * ordering fell back to `lastRefreshAtMs` (correct by luck, not by rule), and
 * `doctor` reported `desktopAuthFile.present: false` with a hint to set
 * `WORKBUDDY_AUTH_FILE` — on a machine whose credential had just been read
 * successfully from the default directory.
 *
 * Ordered, not a set: {@link WORKBUDDY_LIVE_FILENAME} stays the one this build
 * treats as canonical for writing, and the alternatives are probed after it. The
 * FIRST entry is what {@link defaultDesktopAuthCandidates} reports as the
 * expected path, so keep it there.
 */
export const WORKBUDDY_LIVE_FILENAMES: readonly string[] = [
  'workbuddy-desktop.info',
  'workbuddy-desktop-ai.info',
]

/** Basename of the live WorkBuddy desktop auth file (the canonical one). */
export const WORKBUDDY_LIVE_FILENAME = WORKBUDDY_LIVE_FILENAMES[0] as string

/**
 * Whether one basename is a LIVE desktop auth file (any of the known names).
 *
 * Every place that asked "is this the live file?" now asks this, so a new
 * spelling is added in one list instead of being chased through the reader, the
 * ranker and `doctor` separately — which is exactly how the three drifted apart.
 */
export function isLiveDesktopAuthFileName(name: string): boolean {
  return WORKBUDDY_LIVE_FILENAMES.includes(name)
}

/** Prefix of the plugin-owned per-region credential copies (legacy, read-only). */
export const WORKBUDDY_OWN_PREFIX = '.workbuddy-auth'

/**
 * Directory name (inside the Harness home) of the plugin's unified credential
 * vault: every account the plugin knows — scanned from the desktop app AND
 * added through OAuth sign-in — is persisted there, one file per account.
 */
export const WORKBUDDY_VAULT_DIRNAME = 'workbuddy-vault'

/**
 * Legacy per-region copy path inside the Harness home. Read for migration;
 * new credential writes go to the unified vault.
 */
export function workbuddyOwnAuthPath(region: WorkBuddyRegion): string {
  return join(resolveDshHome(), `${WORKBUDDY_OWN_PREFIX}.${region}.json`)
}

/**
 * Pre-dual-provider single-copy path. Still read as a migration source (a
 * legacy credential is filtered by its region; new refreshes write the vault), and removed by `logout`.
 */
export function legacyWorkbuddyOwnAuthPath(): string {
  return join(resolveDshHome(), WORKBUDDY_AUTH_FILENAME)
}

/**
 * The vault's directory for one region inside the Harness home.
 *
 * The vault is the plugin's UNIFIED credential store: every account the
 * plugin knows lives here, whether it was scanned from the desktop app's
 * auth directory or added through OAuth sign-in. One file per account,
 * named by the account's stable id — so two sources yielding the same
 * account converge on the same file instead of duplicating it.
 */
export function workbuddyVaultDir(region: WorkBuddyRegion): string {
  return join(resolveDshHome(), WORKBUDDY_VAULT_DIRNAME, region)
}

/**
 * 平台名，**比 `NodeJS.Platform` 宽**。
 *
 * DSHM（端侧形态）内嵌的 Node 在鸿蒙上把 `process.platform` 报成
 * `'openharmony'`，而 @types/node 的 `NodeJS.Platform` 里没有这个字面量
 * （issue #190）。用 `| (string & {})` 而不是 `| string`：前者保留联合类型的
 * 自动补全，同时允许这些运行时才出现的值。
 */
export type DesktopAuthPlatform = NodeJS.Platform | (string & {})

/**
 * 鸿蒙上用户可见的家目录。
 *
 * `os.homedir()` 在鸿蒙上返回的是**应用沙箱**
 * (`/data/storage/el2/base/haps/entry/files`)，不是用户目录，所以不能像
 * linux 那样由 `home` 派生。真实凭据落在 `/storage/Users/currentUser` 下，
 * 这个挂载点由系统规定，不随应用变化。
 */
export const OPENHARMONY_USER_HOME = '/storage/Users/currentUser'

/**
 * Platform-default directories holding the WorkBuddy desktop app's auth file.
 *
 * Windows and Linux prefer the OS-issued env location and fall back to the
 * home-derived convention when it is unset, so a redirected profile (OneDrive
 * folder backup, enterprise policy) still resolves. macOS has no equivalent
 * env variable; the single Application Support path is used as-is.
 *
 * 鸿蒙（issue #190）没有 `homedir()` 可用——它返回应用沙箱，所以那条分支用
 * 系统固定挂载点。Linux 会同时看 XDG 的 data 与 config 两套目录。
 *
 * `platform`, `home`, and `env` are injectable so the platform branches are
 * testable on any host without touching a real machine.
 */
export function defaultDesktopAuthDirs(
  platform: DesktopAuthPlatform = process.platform,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'darwin') {
    return [join(home, 'Library', 'Application Support', 'CodeBuddyExtension', 'Data', 'Public', 'auth')]
  }
  if (platform === 'win32') {
    const local = nonEmptyEnv(env['LOCALAPPDATA']) ?? join(home, 'AppData', 'Local')
    const roaming = nonEmptyEnv(env['APPDATA']) ?? join(home, 'AppData', 'Roaming')
    return [
      join(local, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
      join(roaming, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
    ]
  }
  /**
   * 鸿蒙（issue #190）。
   *
   * 走 XDG 的 `~/.local/share` 形状，但 `~` **不能**用 `homedir()`——那是
   * 沙箱路径。用系统固定挂载点，并允许 `WORKBUDDY_USER_HOME` 覆盖（未来的
   * 多用户或不同发行版挂法）。
   *
   * 没有这个分支时落到 `return []`，卡片连一个候选路径都扫不到，账号池恒为 0，
   * 而 `doctor` 只会说"no platform default; set WORKBUDDY_AUTH_FILE"——
   * 把一个本该自动完成的事推给用户。
   */
  if (platform === 'openharmony') {
    const root = nonEmptyEnv(env['WORKBUDDY_USER_HOME']) ?? OPENHARMONY_USER_HOME
    // `posix.join`，不是运行平台的 `join`：这些是**数据**规定的分隔符（鸿蒙是
    // POSIX 路径），用运行平台 join 会在 Windows 上产出
    // `/storage/Users/currentUser.localshare...` 这种永不存在的混分隔符，
    // 而单元测试也会变成"只在 POSIX 上绿"。同 `turing-sdk.ts` 与 `at-rest.ts`
    // 里踩过的那个坑（docs/WINDOWS.md）。
    return [posix.join(root, '.local', 'share', 'CodeBuddyExtension', 'Data', 'Public', 'auth')]
  }
  if (platform === 'linux') {
    /**
     * Linux 同时看 XDG 的**两套**目录（issue #190 附带发现）。
     *
     * `Data/Public/auth` 是**数据**，按 XDG 惯例该在 `$XDG_DATA_HOME`
     * （缺省 `~/.local/share`）下；而这里原先只读 `$XDG_CONFIG_HOME`
     * （缺省 `~/.config`）。issue #190 的报告机器与鸿蒙实测都指向
     * `.local/share`，所以两套都给。
     *
     * ⚠️ **`.config` 仍然排在前面**，也就是探测顺序与改动前完全一致。
     * 理由：README §平台支持写明"其余候选仍未经真机逐项验证"，Linux 从来没有
     * 真机证据；把 data 提到前面会改变"没设 WORKBUDDY_AUTH_FILE 时用哪一个"
     * 这个已经上线的行为，而换来的收益尚无证据。这里只做**加法**：多一个候选，
     * 保留已有优先顺序；原先未找到文件时，新增候选可能改变读取结果。
     *
     * 两个目录都不存在时无法从这些默认位置发现凭据；显式 WORKBUDDY_AUTH_FILE 按指定文件处理。
     */
    const config = nonEmptyEnv(env['XDG_CONFIG_HOME']) ?? join(home, '.config')
    const data = nonEmptyEnv(env['XDG_DATA_HOME']) ?? join(home, '.local', 'share')
    return [
      join(config, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
      join(data, 'CodeBuddyExtension', 'Data', 'Public', 'auth'),
    ]
  }
  return []
}

/** A non-empty, trimmed env value, or undefined when unset/blank. */
export function nonEmptyEnv(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * The live auth file's platform candidates, in probe order.
 *
 * Every known basename for every platform directory: a machine can hold the old
 * and the new spelling side by side during an app upgrade, and probing only the
 * canonical one is the defect issue #174 reports.
 */
export function defaultDesktopAuthCandidates(): string[] {
  const candidates: string[] = []
  for (const dir of defaultDesktopAuthDirs()) {
    for (const name of WORKBUDDY_LIVE_FILENAMES) candidates.push(join(dir, name))
  }
  return candidates
}

/** First platform-default candidate; see {@link defaultDesktopAuthCandidates}. */
export function defaultDesktopAuthPath(): string | undefined {
  return defaultDesktopAuthCandidates()[0]
}

/**
 * Filename of a path regardless of the host separator: Windows paths use `\`
 * and this helper must keep working when a Windows path is compared on a
 * POSIX host (e.g. tests injecting a Windows-style auth dir).
 */
export function authFileName(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separator === -1 ? path : path.slice(separator + 1)
}
