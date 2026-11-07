/**
 * 设备身份的**只读取证视图**（审计报告 P0，P1 起同时是"派生档会发什么"的唯一答案）。
 *
 * 这一层不添加头、不写盘、不发请求，只回答两个问题：
 *
 *   1. 当前输入会生成哪些设备头？本模块调用请求路径上的构造器，
 *      再筛选返回的头名集合（{@link describeRequestHeaderNames}）。
 *      于是它随代码自动变化：P1 之前是空数组，P1 之后是 `X-Machine-ID` /
 *      `X-Session-ID`，而没有任何地方需要改两次。
 *   2. 派生档为各账号发送什么标识？本模块使用同一个盐计算 machine/session
 *      一对 id，并统计"N 个账号 → 几个不同设备"。第二个数字是审计 §5.4 的核心
 *      问题：池子里的号是共用一台设备（易被聚成一群），还是得到不同的派生标识；这不证明物理设备隔离。
 *
 * ## 为什么盐由调用方传进来
 *
 * P0 时这个模块自己 `ensureDeviceSalt()`，因为那时它是唯一的调用者。P1 之后
 * `doctor` 还要把同一个盐交给 {@link describeRequestHeaderNames} 去渲染完整的
 * 头名清单。如果两处分别读取盐，可能得到不同状态（一次读到 absent、
 * 一次读到 ok），于是报告会在同一屏里自相矛盾。盐是调用方的事实，这里只做算术。
 *
 * 两者都不含凭据、不含盐本身。
 *
 * @module dsh-connect-workbuddy/device-state
 */

import { deriveDeviceId } from './device-id.ts'
import type { DeviceSaltReadout } from './device-salt.ts'
import type { DeviceTokenReadout } from './device-token.ts'
import type { TuringSdkInfo, TuringTokenReadout } from './turing-sdk.ts'
import { describeRequestHeaderNames } from './upstream.ts'
import type { WorkBuddyWireIdentity } from './upstream.ts'
import type { WorkBuddyCredential } from './auth.ts'

/**
 * 本常量列出全部设备身份头名。P2/P3 增加 X-Device-Token 读取时无需修改。
 * 实际发送的头名由当前请求构造结果决定。
 */
export const WORKBUDDY_DEVICE_HEADER_NAMES: readonly string[] = [
  'X-Device-Token',
  'X-Machine-ID',
  'X-Session-ID',
]

/** 一次派生的结果：一台"虚拟设备"的两个 id。 */
export interface WorkBuddyDerivedDevice {
  machineId: string
  sessionId: string
}

/** The read-only answer `doctor` renders. */
export interface WorkBuddyDeviceReport {
  /**
   * 当前档位（设置里的「虚拟值 / 真实值」）。
   *
   * 它必须排在 `onWire` 旁边：真实值档取得 token 且未回退时，`onWire` 包含 `X-Device-Token`，
   * 而虚拟值档下是另一个组合。没有这一行，"为什么这次只有一条"要靠读者自己猜。
   */
  tier: 'virtual' | 'real'
  /**
   * 线上**实际**用的那一档；只在它与 {@link tier} 不同时出现。
   *
   * 目前唯一的分岔是「真实值档取不到真 token 且开了回退」（作者意见 #2）：此时
   * `tier` 仍是用户选的 `real`，而 `tierSent` 是 `virtual`。只报 `tier` 会让
   * 报告说"发的是真实设备"、`onWire` 却说"发的是派生对"，两个字段互相打脸。
   */
  tierSent?: 'virtual' | 'real'
  /** 回退是否生效。只在生效时出现，与 {@link tierSent} 同时出现。 */
  fallbackToVirtual?: boolean
  /**
   * 设备头名，**按当前代码实际会发的那一组算出来**。空数组 = 一个都不发。
   * 这是按当前配置和构造函数推导的结果，不是抓包证据。
   */
  onWire: readonly string[]
  /** 盐文件的状态；`salt` 本身永不出现在报告里。 */
  salt: {
    path: string
    state: DeviceSaltReadout['state']
    reason?: string
  }
  /**
   * 外部设备 token（P2）。
   *
   * 缺席 = 本次诊断没有看到 token 源（`doctor` 读不到插件配置，只能读环境变量，
   * 见 `WORKBUDDY_DEVICE_TOKEN_FILE_ENV`）。这与 `state: 'absent'`（配了路径但
   * 文件不在）必须分开：一个是"没查"，一个是"查了没有"。
   */
  token?: {
    path: string
    state: DeviceTokenReadout['state']
    /** 文件 mtime 至今的毫秒数，只有 `ok` 时有意义。 */
    ageMs?: number
    reason?: string
  }
  /**
   * 派生档会给什么，以及池子会不会塌成一台设备。
   *
   * 缺席的两种情形要能区分：没有账号（无从派生）、盐不可用（不能派生）。"能派生
   * 但就是没派生"不该发生，因此不设这一态。
   */
  derived?: {
    /** 参与派生的账号数（= 输入里非空 uid 的个数）。 */
    accounts: number
    /** 其中算出的**不同** machineId 个数。相等只说明本次派生值未重复，不能证明上游无法关联账号。 */
    distinct: number
    /** 一个样例，供人工比对两次 `doctor` 是否稳定；不代表"唯一"。 */
    sample: WorkBuddyDerivedDevice
  }
  /**
   * 真实值档的 SDK 状态（P3）。`token.masked` 是掩码，完整值永远不进报告。
   */
  sdk?: {
    state: TuringSdkInfo['state']
    bundle: string
    path: string
    reason?: string
    token: {
      state: TuringTokenReadout['state']
      length: number
      ageMs?: number
      reason?: string
    }
  }
}

/**
 * 把已经读到的盐与本地账号，组合成 `doctor` 要的那份报告。
 *
 * `credentials` 只用来取 `uid`：报告里不出现账号名、账号 id 或任何令牌。重复的
 * uid 会被折叠（同一个号的两个历史凭据文件不该被算成两台设备）。
 *
 * 纯函数（无 IO、无时钟），所以测试不需要临时目录，也不会因为读写顺序不同而
 * 得到两种答案。
 */
export function describeDeviceState(
  credentials: readonly WorkBuddyCredential[],
  saltReadout: DeviceSaltReadout,
  tokenReadout?: DeviceTokenReadout,
  /**
   * 真实值档的读数（P3）。`tier` 单独传，不能由 `real` 在不在推断：真实值档在
   * SDK 不可用且关闭回退时不发设备头；允许回退时按虚拟档处理。两种处理
   * 的原因不同，不传 tier 就只能猜。
   */
  real?: {
    tier: 'virtual' | 'real'
    sdk: TuringSdkInfo
    token: TuringTokenReadout
    /** 完整 token，只用来让头名清单算得出来；**绝不进报告**。 */
    value?: string
    /**
     * 真实值档取不到 token 时是否退回虚拟值（作者意见 #2）。
     *
     * 报告必须**按照请求中实际发送的参数**：退回时这一档实际发的是派生对，所以
     * `tierSent` 答 `virtual`、`onWire` 按虚拟值算。把 `tier`（用户的意愿）与
     * `tierSent`（线上实际）分成两个字段，是因为两者分岔时那正是唯一值得看的
     * 信息，便于用户核对本机设备模式是否实际生效。
     */
    fallbackToVirtual?: boolean
  },
): WorkBuddyDeviceReport {
  const tier: 'virtual' | 'real' = real?.tier ?? 'virtual'
  /**
   * 退回是否发生：真实值档 + 没有真 token + 开关开。
   *
   * 与 `upstream.ts` 的 `wireIdentity` 用**同一条判据**。两处各写一遍是这次改动
   * 里唯一无法消除的重复（那个函数在请求路径上，不能 import 这个纯函数模块的
   * 调用方；反过来会让 `device-state` 变成请求路径的依赖）。因此这条判据被写得
   * 尽量小，且两边各有一条用例钉住同一种组合。
   */
  const fellBack = tier === 'real' && real?.value === undefined && real?.fallbackToVirtual === true
  const tierSent: 'virtual' | 'real' = fellBack ? 'virtual' : tier
  const salt: WorkBuddyDeviceReport['salt'] = {
    path: saltReadout.path,
    state: saltReadout.state,
    ...'reason' in saltReadout ? { reason: saltReadout.reason } : {},
  }
  const token: WorkBuddyDeviceReport['token'] = tokenReadout === undefined
    ? undefined
    : {
        path: tokenReadout.path,
        state: tokenReadout.state,
        ...tokenReadout.ageMs === undefined ? {} : { ageMs: tokenReadout.ageMs },
        ...'reason' in tokenReadout ? { reason: tokenReadout.reason } : {},
      }
  // 头名需与实际请求一致，因此档位、盐和 token 共用同一批读数。
  // 缺少任一输入都可能使报告漏掉实际已发送的头名。
  //
  // 退回时按 `virtual` 算：那一档实际发的就是派生对（`upstream.ts` 的
  // `deviceTier: 'virtual'`），所以这里也必须走那条分支，否则报告会说"发的是真
  // token"而线上发的是派生 id。
  const identity: WorkBuddyWireIdentity = tierSent === 'real'
    ? {
        deviceTier: 'real',
        ...real?.value === undefined ? {} : { deviceReal: real.value },
      }
    : {
        ...saltReadout.state === 'ok' ? { deviceSalt: saltReadout.salt } : {},
        ...tokenReadout?.state === 'ok' ? { deviceToken: tokenReadout.token } : {},
      }
  const probe = credentials[0]
  const onWire = probe === undefined
    ? []
    : describeRequestHeaderNames('chat', probe, identity)
      .filter(name => WORKBUDDY_DEVICE_HEADER_NAMES.includes(name))

  const sdk: WorkBuddyDeviceReport['sdk'] = real === undefined
    ? undefined
    : {
        state: real.sdk.state,
        bundle: real.sdk.bundle,
        path: real.sdk.path,
        ...real.sdk.reason === undefined ? {} : { reason: real.sdk.reason },
        token: {
          state: real.token.state,
          length: real.token.length,
          ...real.token.fetchedAtMs === undefined ? {} : { ageMs: Date.now() - real.token.fetchedAtMs },
          ...real.token.reason === undefined ? {} : { reason: real.token.reason },
        },
      }

  const uids = [...new Set(credentials.map(credential => credential.uid).filter(uid => uid !== ''))]
  const base: WorkBuddyDeviceReport = {
    tier,
    // 只有分岔时才出现：`tierSent === tier` 是常态，多一个恒等的字段只会让读者
    // 以为两者永远可能不同。
    ...fellBack ? { tierSent } : {},
    ...fellBack ? { fallbackToVirtual: true } : {},
    onWire,
    salt,
    ...token === undefined ? {} : { token },
    ...sdk === undefined ? {} : { sdk },
  }
  // 真实值档不派生：所有账号共用这一台真机，算出来的一对 id 既不会发出去，
  // 也不应出现在报告中，以免被误认为实际请求字段。发生回退时例外：对应档位
  // 实际发的是派生对，所以派生块必须出现，否则报告与 `onWire` 自相矛盾。
  if (tierSent === 'real') return base
  if (uids.length === 0 || saltReadout.state !== 'ok') return base

  const machineIds = uids.map(uid => deriveDeviceId(uid, 'machine', saltReadout.salt))
  return {
    ...base,
    derived: {
      accounts: uids.length,
      distinct: new Set(machineIds).size,
      sample: {
        machineId: machineIds[0] as string,
        sessionId: deriveDeviceId(uids[0] as string, 'session', saltReadout.salt),
      },
    },
  }
}
