/**
 * 每账号的虚拟设备覆盖值与设备模式设置。
 * 未覆盖的字段由 device-id.ts 根据本机盐与 uid 派生；覆盖值不改变盐。
 * 本模块持久化 mode、SDK 目录及回退偏好，请求层读取这些设置后选择设备头。
 * 真实模式由 SDK 提供 token，获取失败时按 sdkFallbackToVirtual 处理；
 * 因此切换 mode 会影响后续请求，并非仅保存一个界面状态。
 * @module dsh-connect-workbuddy/device-profile
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveDeviceId, isDeviceId } from './device-id.ts'
import { readDeviceSalt } from './device-salt.ts'
import { resolveDshHome, withFileLock, writeFileAtomic } from './host-peers.ts'

/** 设备头档位：虚拟值使用派生标识，真实值使用本机 SDK 的设备凭据；请求层按回退设置处理获取失败。 */
export type WorkBuddyDeviceMode = 'virtual' | 'real'

/** 本 build 能读的文件版本；读到别的版本按"没有设置"处理。 */
export const DEVICE_PROFILE_VERSION = 1

/** 文件名，带前导点，与 `.workbuddy-device.json` 同一约定。 */
export const DEVICE_PROFILE_FILE_NAME = '.workbuddy-device-profiles.json'

/** 一个账号的覆盖值；空字段表示"这一项仍然派生"。 */
export interface WorkBuddyDeviceProfile {
  machineId?: string
  sessionId?: string
}

/**
 * 一个账号**留空时真正会发出去**的那一对 id。
 *
 * 它由 `sha256(命名空间 + 本机盐 + 用途 + uid)` 算出（见 `device-id.ts`），
 * 在盐、uid 和算法不变时，同一账号跨重启得到相同结果；不同 uid 通常得到不同结果。
 * UI 显示派生值，便于核对留空字段在虚拟模式下采用的值。
 */
export interface WorkBuddyDeviceDerived {
  machineId: string
  sessionId: string
}

/** What the card and the resolver both read. */
export interface WorkBuddyDeviceSettings {
  mode: WorkBuddyDeviceMode
  /** accountId（sha256 前 24 位）→ 覆盖值。**不含 uid**：这份文档会发给浏览器。 */
  accounts: Readonly<Record<string, WorkBuddyDeviceProfile>>
  /**
   * accountId → 该账号当前自动派生的值。
   *
   * 字段缺失表示未计算派生值，原因可能是盐不可用或调用方未传账号列表。
   * 空对象则表示"算过，但这个池子里没有一个能算"。两者在界面上要说不同的话：
   * 前者是"本机没有设备盐"，后者是"这些账号没有 uid"。
   */
  derived?: Readonly<Record<string, WorkBuddyDeviceDerived>>
  /**
   * 「真实值」档在这台机器上到底能不能用（由 Host 判定，界面不猜平台）。
   *
   * 见 `index.ts` 的 `REAL_TIER_AVAILABILITY`：macOS 上 SDK 能被发现、`probe` 也答
   * `ready`，但取 token 那一环会 `dispatch_sync` 死锁，所以该档位始终无法取得设备凭据。
   * 界面据此禁用无法使用的档位，并说明原因，避免用户选择后仍无法获取设备凭据。
   */
  realTier?: {
    state: 'available' | 'broken' | 'unavailable'
    platform: string
  }
  /**
   * 用户在「SDK」分区手填的 SDK 目录；空串 = 走自动发现链。
   *
   * 优先级：`WORKBUDDY_TURING_SDK_DIR` > 这一项 > 自动发现。环境变量压过它，因为
   * 那个变量是「配置项够不着的场景」的补充设置方法（`doctor` 与插件读同一个值），反过来
   * 会让一个排障时设的变量在下一次点「保存」后静默失效，而那正是排障的人最不希望
   * 发生的事。
   */
  sdkDir: string
  /**
   * 真实值档取不到 token 时是否退回虚拟值。**默认开**（作者意见 #2）。
   *
   * 这个默认值与 P3 原先的取舍相反，而原先那个取舍有理由：静默退回会让界面写着
   * 「真实值」、请求却使用虚拟值。发生回退时，wireIdentity 将
   * 档位降成 `virtual`，卡片与 `doctor` 因此都照实显示"现在发的是虚拟值"。
   * 用户要的是「有总比没有好」，不是「别告诉我」。
   */
  sdkFallbackToVirtual: boolean
}

/**
 * 文件不存在、不可读、版本不认识时的答案：虚拟档、无覆盖、回退开、无手填目录。
 *
 * 回退默认**开**，所以一个 5.16.0 时代写下的文件（没有这个字段）升级后立刻拿到
 * 作者希望的默认行为，不需要用户去点一次。
 */
function emptyDocument(): StoredDocument {
  return {
    version: DEVICE_PROFILE_VERSION,
    mode: 'virtual',
    accounts: {},
    sdkDir: '',
    sdkFallbackToVirtual: true,
  }
}

/** 写入文件形状。`uid` 只在磁盘上存在，用于把浏览器发来的 accountId 关联回请求。 */
interface StoredAccount {
  uid?: string
  machineId?: string
  sessionId?: string
  updatedAt?: string
}

interface StoredDocument {
  version: number
  mode: WorkBuddyDeviceMode
  accounts: Record<string, StoredAccount>
  /** 手填的 SDK 目录；空串 = 自动发现。 */
  sdkDir: string
  /** 真实值档取不到 token 时退回虚拟值。 */
  sdkFallbackToVirtual: boolean
}

/**
 * 读盘缓存：同一进程内的请求路径不该每条都去读 200 字节。
 *
 * **按路径索引**，不是一个全局槽：这个模块同时服务"真实 DSH home"与测试里
 * 那些临时目录，一个全局槽会让第二台机器（或第二个测试）读到第一份内容。
 */
const CACHE_MS = 5_000
const cache = new Map<string, { at: number, document: StoredDocument }>()

/** Drop the cache — every write calls this, so a save is visible immediately. */
function invalidate(): void {
  cache.clear()
}

/** `$DSH_HOME/.workbuddy-device-profiles.json`, or `dir` when one is pinned (tests). */
export function deviceProfilePath(dir?: string): string {
  const base = typeof dir === 'string' && dir !== '' ? dir : resolveDshHome()
  return join(base, DEVICE_PROFILE_FILE_NAME)
}

/** Whether an unknown value is a mode this build understands. */
export function isDeviceMode(value: unknown): value is WorkBuddyDeviceMode {
  return value === 'virtual' || value === 'real'
}

/** Keep only the fields that are well-formed; a hand-edited file must not break a request. */
function sanitizeAccount(raw: unknown): StoredAccount | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const account: StoredAccount = {}
  if (typeof record['uid'] === 'string' && record['uid'] !== '') account.uid = record['uid']
  if (typeof record['machineId'] === 'string' && isDeviceId(record['machineId'])) account.machineId = record['machineId']
  if (typeof record['sessionId'] === 'string' && isDeviceId(record['sessionId'])) account.sessionId = record['sessionId']
  if (typeof record['updatedAt'] === 'string') account.updatedAt = record['updatedAt']
  return account.uid === undefined && account.machineId === undefined && account.sessionId === undefined ? undefined : account
}

/** Read the on-disk document, tolerating anything a hand edit can produce. */
async function readStored(dir?: string, nowMs: number = Date.now(), fresh = false): Promise<StoredDocument> {
  const path = deviceProfilePath(dir)
  const hit = cache.get(path)
  if (!fresh && hit !== undefined && nowMs - hit.at < CACHE_MS) return hit.document
  const remember = (document: StoredDocument): StoredDocument => {
    cache.set(path, { at: nowMs, document })
    return document
  }
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return remember(emptyDocument())
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    // 无法解析时使用默认设置，不重写坏文件。覆盖值无法读取后将回到派生值，
    // 因此请求使用的设备身份可能与原先的手填值不同。
    return remember(emptyDocument())
  }
  const record = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
  if (record['version'] !== DEVICE_PROFILE_VERSION) return remember(emptyDocument())
  const accounts: Record<string, StoredAccount> = {}
  const rawAccounts = record['accounts']
  if (typeof rawAccounts === 'object' && rawAccounts !== null && !Array.isArray(rawAccounts)) {
    for (const [id, value] of Object.entries(rawAccounts as Record<string, unknown>)) {
      const account = sanitizeAccount(value)
      if (account !== undefined) accounts[id] = account
    }
  }
  const document: StoredDocument = {
    version: DEVICE_PROFILE_VERSION,
    mode: isDeviceMode(record['mode']) ? record['mode'] : 'virtual',
    accounts,
    // 手填目录原样保留（只去首尾空白）：它是一条路径，不是身份，坏路径的代价是
    // 「探不到 SDK」，而 `probe` 本来就要为"探不到"给出 `missing`/`error` 两种答案。
    // 在这里把非法路径丢掉，会让用户填错之后看到"自动发现的结果"，从而以为保存失败了。
    sdkDir: typeof record['sdkDir'] === 'string' ? record['sdkDir'].trim() : '',
    // 只有显式 `false` 才关：缺字段意味着「这个文件是回退功能上线前写的」，那时
    // 的行为是无回退。按作者要求，新选项默认开启，因此缺失字段按 true 读取。
    sdkFallbackToVirtual: record['sdkFallbackToVirtual'] !== false,
  }
  return remember(document)
}

/** The browser-facing shape: no uids, no timestamps it cannot use. */
function toSettings(document: StoredDocument): WorkBuddyDeviceSettings {
  const accounts: Record<string, WorkBuddyDeviceProfile> = {}
  for (const [id, account] of Object.entries(document.accounts)) {
    const profile: WorkBuddyDeviceProfile = {
      ...account.machineId === undefined ? {} : { machineId: account.machineId },
      ...account.sessionId === undefined ? {} : { sessionId: account.sessionId },
    }
    if (profile.machineId !== undefined || profile.sessionId !== undefined) accounts[id] = profile
  }
  return {
    mode: document.mode,
    accounts,
    sdkDir: document.sdkDir,
    sdkFallbackToVirtual: document.sdkFallbackToVirtual,
  }
}

/** Read the settings the card renders. Never throws. */
export async function readDeviceSettings(options: { dir?: string } = {}): Promise<WorkBuddyDeviceSettings> {
  return toSettings(await readStored(options.dir))
}

/**
 * 算出每个账号"留空时会发出"的那一对 id，供弹窗直接显示。
 *
 * 为什么需要它：弹窗里两个输入框为空时只写"留空 = 自动派生"，用户既看不到
 * 结果，也无法判断两个账号是否被算成了同一台设备。把派生值摆出来，"留空"就从
 * 一句承诺变成了一个可核对的事实。
 *
 * uid 由 DSH 凭据库提供，浏览器只持有 accountId。派生必须
 * 用 uid，因为构头时 `deviceHeaders()` 手上只有 credential.uid。两边用同一种
 * 输入，界面显示的值才等于真正发出去的值。
 *
 * 盐不可用时返回 `undefined`（而不是空对象）：那一档一个设备头都不发，显示一个
 * "派生值"会是在说谎；而空对象表示"盐是好的，但这些账号没有一个算得出来"
 * （没有 uid），两者在界面上要说不同的话。
 */
export async function describeDerivedDevices(
  entries: readonly { accountId: string, uid: string }[],
  options: { dir?: string, salt?: string } = {},
): Promise<Record<string, WorkBuddyDeviceDerived> | undefined> {
  let salt = options.salt
  if (salt === undefined) {
    const readout = options.dir === undefined ? await readDeviceSalt() : await readDeviceSalt({ dir: options.dir })
    if (readout.state !== 'ok') return undefined
    salt = readout.salt
  }
  if (salt === '') return undefined
  const derived: Record<string, WorkBuddyDeviceDerived> = {}
  for (const entry of entries) {
    if (entry.accountId === '' || entry.uid === '') continue
    derived[entry.accountId] = {
      machineId: deriveDeviceId(entry.uid, 'machine', salt),
      sessionId: deriveDeviceId(entry.uid, 'session', salt),
    }
  }
  return derived
}

/**
 * Persist one document atomically.
 *
 * **The caller holds the lock.** Every write path takes `withFileLock` itself
 * (read-merge-write must be one step against another process), so this function
 * must not take it again — a second acquisition on the same path is how a save
 * turns into a hang.
 */
async function writeStored(document: StoredDocument, dir?: string): Promise<void> {
  await writeFileAtomic(deviceProfilePath(dir), `${JSON.stringify(document, null, 2)}\n`, {
    mode: 0o600,
    dirMode: 0o700,
  })
  invalidate()
}

/**
 * 保存设备模式。后续请求由 upstream.ts 读取模式并选择 SDK token 或虚拟设备头；
 * 真实模式获取失败时按已保存的回退设置处理。
 */
export async function setDeviceMode(
  mode: WorkBuddyDeviceMode,
  options: { dir?: string } = {},
): Promise<WorkBuddyDeviceSettings> {
  return withFileLock(deviceProfilePath(options.dir), async () => {
    // fresh 要求锁内重新读盘。使用 5 秒缓存会导致另一进程刚写入的值被旧
    // 缓存盖掉，而 read-merge-write 一旦基于旧文档就会把对方的改动抹平。
    const document = await readStored(options.dir, Date.now(), true)
    const next: StoredDocument = { ...document, mode }
    await writeStored(next, options.dir)
    return toSettings(next)
  })
}

/**
 * Save the two SDK settings the card edits (作者意见 #1 与 #2).
 *
 * 两项均为可选参数，undefined 表示保留该项，与
 * {@link saveDeviceProfile} 同一条约定：卡片上有两个独立控件，其中一个的保存
 * 必须保留另一次操作刚保存的字段值。
 *
 * `sdkDir` 只做去空白，不做存在性校验：一个路径填错的正确反馈是「探不到 SDK」
 * （probe 会返回 missing 或 error，并带上路径）。保存时保留用户输入，
 * 随后通过检测结果说明路径是否可用。
 */
export async function saveDeviceSdkSettings(
  values: { sdkDir?: string, sdkFallbackToVirtual?: boolean },
  options: { dir?: string } = {},
): Promise<WorkBuddyDeviceSettings> {
  return withFileLock(deviceProfilePath(options.dir), async () => {
    const document = await readStored(options.dir, Date.now(), true)
    const next: StoredDocument = {
      ...document,
      ...typeof values.sdkDir === 'string' ? { sdkDir: values.sdkDir.trim() } : {},
      ...typeof values.sdkFallbackToVirtual === 'boolean'
        ? { sdkFallbackToVirtual: values.sdkFallbackToVirtual }
        : {},
    }
    await writeStored(next, options.dir)
    return toSettings(next)
  })
}

/**
 * Save (or clear) one account's overrides.
 *
 * `machineId` / `sessionId` 为 `''` 表示"清掉这一项、回到派生值"；为 `undefined`
 * 表示"不要动这一项"。两种省略必须能分开：弹窗里只改机器 id 时，不能把用户之前
 * 设的 session id 顺手抹掉。
 *
 * @throws when a supplied value is not a 36-character lowercase hex id — the
 *   route turns that into a 400 rather than writing a value the upstream will reject.
 */
export async function saveDeviceProfile(
  accountId: string,
  values: { uid?: string, machineId?: string, sessionId?: string },
  options: { dir?: string } = {},
): Promise<WorkBuddyDeviceSettings> {
  for (const value of [values.machineId, values.sessionId]) {
    if (value !== undefined && value !== '' && !isDeviceId(value)) {
      throw new Error('device id must be 36 lowercase hex characters')
    }
  }
  return withFileLock(deviceProfilePath(options.dir), async () => {
    const document = await readStored(options.dir, Date.now(), true)
    const previous = document.accounts[accountId] ?? {}
    const next: StoredAccount = { ...previous }
    if (values.uid !== undefined && values.uid !== '') next.uid = values.uid
    for (const key of ['machineId', 'sessionId'] as const) {
      const value = values[key]
      if (value === undefined) continue
      if (value === '') delete next[key]
      else next[key] = value
    }
    next.updatedAt = new Date().toISOString()
    const accounts = { ...document.accounts, [accountId]: next }
    // 一个覆盖值都没剩下就整条删掉，别在文件里留空壳。
    if (next.machineId === undefined && next.sessionId === undefined) delete accounts[accountId]
    const merged: StoredDocument = { ...document, accounts }
    await writeStored(merged, options.dir)
    return toSettings(merged)
  })
}

/**
 * DSH 端给卡片路由用的接口。
 *
 * saveAccount 只接收 accountId，DSH 从凭据库解析 uid。
 * uid 用于标识网关账号，无需由浏览器提供。
 */
export interface WorkBuddyDeviceSettingsPort {
  read(): Promise<WorkBuddyDeviceSettings>
  setMode(mode: WorkBuddyDeviceMode): Promise<WorkBuddyDeviceSettings>
  saveAccount(
    accountId: string,
    values: { machineId?: string, sessionId?: string },
  ): Promise<WorkBuddyDeviceSettings>
  /** 保存 SDK 目录与回退开关（作者意见 #1 / #2）。`undefined` = 不动这一项。 */
  saveSdk(values: { sdkDir?: string, sdkFallbackToVirtual?: boolean }): Promise<WorkBuddyDeviceSettings>
}

/**
 * The request-path view: uid → overrides.
 *
 * 按 uid 索引而不是 accountId，是因为构头时手上只有 credential（`uid` 就在里面，
 * 而 accountId 要算哈希；`upstream.ts` 也不能反向 import `auth.ts` 的取值函数，
 * 那会成环）。文件里同时存 uid，正是为了让这一步不需要再查一次凭据库。
 */
export interface WorkBuddyDeviceProfileLookup {
  forUid(uid: string): Promise<WorkBuddyDeviceProfile | undefined>
  /**
   * 当前档位。真实值档成功取得 SDK token 时，`forUid` 的结果会被忽略（所有账号共用这台机器的真实
   * 设备）。构造请求头前仍需读取当前档位，才能决定是否采用逐账号覆盖值。
   */
  mode(): Promise<WorkBuddyDeviceMode>
  /**
   * 真实值档取不到 token 时是否退回虚拟值（作者意见 #2）。
   *
   * 与 {@link mode} 分开读而不是并进一个对象：请求路径上两者都要，而它们的失效
   * 时机相同（同一份 5 秒缓存）。分开的返回值让"档位"与"回退"在调用点各有一个
   * 名字，`wireIdentity` 里那条分叉才读得出来。
   */
  fallbackToVirtual(): Promise<boolean>
  /** 手填的 SDK 目录；空串 = 走自动发现链。 */
  sdkDir(): Promise<string>
}

/** Build the lookup; `ttlMs` exists so an externally edited file is still picked up. */
export function createDeviceProfileLookup(options: { dir?: string } = {}): WorkBuddyDeviceProfileLookup {
  const byUid = (document: StoredDocument): Map<string, WorkBuddyDeviceProfile> => {
    const map = new Map<string, WorkBuddyDeviceProfile>()
    for (const account of Object.values(document.accounts)) {
      if (account.uid === undefined) continue
      const profile: WorkBuddyDeviceProfile = {
        ...account.machineId === undefined ? {} : { machineId: account.machineId },
        ...account.sessionId === undefined ? {} : { sessionId: account.sessionId },
      }
      if (profile.machineId !== undefined || profile.sessionId !== undefined) map.set(account.uid, profile)
    }
    return map
  }
  return {
    async forUid(uid: string): Promise<WorkBuddyDeviceProfile | undefined> {
      if (uid === '') return undefined
      return byUid(await readStored(options.dir)).get(uid)
    },
    async mode(): Promise<WorkBuddyDeviceMode> {
      return (await readStored(options.dir)).mode
    },
    async fallbackToVirtual(): Promise<boolean> {
      return (await readStored(options.dir)).sdkFallbackToVirtual
    },
    async sdkDir(): Promise<string> {
      return (await readStored(options.dir)).sdkDir
    },
  }
}
