/**
 * 真实设备参数：本机已安装的 WorkBuddy 桌面端自带 Turing Shield SDK 的获取流程（P3）。
 *
 * ## SDK 从哪来
 *
 * 插件**不携带任何 SDK 副本**。原生模块与厂商 DLL 是桌面端自己的构建产物
 * （`turing_sdk.node` 内的 pdb 路径指向桌面端仓库），随插件再分发既无 provenance
 * 也无许可证，因此这个模块找的是**用户机器上已安装的那份**：环境变量
 * `WORKBUDDY_TURING_SDK_DIR` 显式指定优先，否则按桌面端的安装形状（Windows 卸载
 * 注册表 + 常见目录，macOS `/Applications` 与 `~/Applications` 的 bundle）现推
 * SDK 目录。未找到时返回 missing，用户可安装桌面端或手动指定目录。
 * 此时请求是否改用虚拟设备标识，由 sdkFallbackToVirtual 控制。
 *
 * ## 它补的是哪一格
 *
 * 虚拟设备模式根据账号和本机盐派生 X-Machine-ID 与 X-Session-ID。
 * 本机设备模式则通过已安装的 SDK 获取 X-Device-Token。
 * SDK token 已包含设备信息，成功获取后省略派生标识，避免同时发送来源不同的设备身份。
 *
 * ## 为什么要子进程
 *
 * SDK 是原生插件（N-API），加载它会绑定所在进程：一次 ABI/缺 DLL/被替换的失败
 * 就是插件进程的失败，而不是"设备头不可用"；它的 Promise 没有 cancel，一次超时
 * 会把句柄留在进程里。子进程把这两件事都改为"这一条命令失败"，父进程杀掉它
 * 就是干净的收场。代价是每次冷启动多一次进程创建（本机实测 ~6 ms）。
 *
 * ## 缓存策略
 *
 * token 是分钟级的东西、进程是小时级的，所以**绝不能只取一次**。内存 TTL 10 分钟，
 * 失败时回落到 24 小时内的旧值并标记 `stale`（设备 token 的有效期远长于它的
 * 刷新周期）。**只保存在内存中**：多一份 secret 文件换来的只是省掉一次 100 ms 的取数，
 * 收益有限。P2 文件源读取外部程序写入的文件，本模块则不创建凭据缓存文件。
 *
 * ## 谁来决定"什么时候取"
 *
 * 请求路径只在**要发请求**时调 {@link TuringTokenSource.current}，所以一个空闲
 * 进程不会主动刷新 token，面板可能一直显示「已加载、没取过」，使用户难以
 * 判断 SDK 是否正常。插件 apply 时调 {@link TuringSdk.startAutoRefresh}：立刻
 * 取一次，此后在 TTL 到期前自动换新；失败按 {@link TuringKeepAliveTiming.retryMs}
 * 重试，本机没有 SDK 则按 {@link TuringKeepAliveTiming.unavailableMs} 慢查。
 *
 * ## 从不打印 token
 *
 * 这个模块的任何日志、任何返回给浏览器的状态里都只有掩码与长度。完整值只经
 * {@link TuringTokenSource.reveal} 在用户显式点击时给一次。
 *
 * @module dsh-connect-workbuddy/turing-sdk
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  windowsRegistryAppExecutable,
  workbuddyAppExecutableCandidates,
} from './at-rest.ts'
import type { WorkBuddyDeviceMode } from './device-profile.ts'

/** 允许指向别的 SDK 副本（自建、或桌面端安装目录）。 */
export const TURING_SDK_DIR_ENV = 'WORKBUDDY_TURING_SDK_DIR'

/** 风控 channelId；与桌面端 `product.json` 的 `turingSdk.channelId` 一致。 */
export const TURING_CHANNEL_ID_ENV = 'WORKBUDDY_TURING_CHANNEL_ID'

/** 产品名。 */
export const TURING_PRODUCT_NAME_ENV = 'WORKBUDDY_TURING_PRODUCT_NAME'

/** 产品版本；默认跟 {@link import('./upstream.ts').APP_VERSION} 同源，见 `createTuringSdk` 的 `version`。 */
export const TURING_PRODUCT_VERSION_ENV = 'WORKBUDDY_TURING_PRODUCT_VERSION'

/**
 * 传给桌面端 SDK `configure` 第 4 参 `keychainStorageEnabled` 的开关（`1`/`true`
 * 开启）。macOS 原生绑定要求 boolean，因此插件始终传布尔值，此变量仅
 * 决定传 `true` 还是 `false`；默认关。
 */
export const TURING_KEYCHAIN_STORAGE_ENV = 'WORKBUDDY_TURING_KEYCHAIN_STORAGE'

/**
 * 总开关的环境变量设置（`deviceSdkEnabled`）。
 *
 * 插件里这个开关是**配置项**（`cordis.patch.yml`），但 `doctor` 是一个独立的 CLI
 * 进程，读不到插件配置。因此诊断命令需通过环境变量单独设置总开关，
 * 便于与插件实际配置保持一致。
 *
 * 仅 `1` 或 `true` 表示开启；其他值及未设置均为关闭。插件内仍以配置项为准，独立 doctor 进程需要单独设置环境变量。
 */
export const TURING_SDK_ENABLED_ENV = 'WORKBUDDY_DEVICE_SDK_ENABLED'

/** 默认 token 有效期（重取周期）。与 SDK 侧风险消息的缓存窗口同一量级。 */
export const TURING_TOKEN_TTL_MS = 10 * 60 * 1000

/** 取不到新 token 时，旧值最多还能用多久。设备 token 本身长期有效。 */
const TURING_TOKEN_STALE_MS = 24 * 60 * 60 * 1000

/** 子进程的总预算。SDK 在本机实测 ~110 ms；给到 20 s 是为了覆盖冷启动与 DNS 慢。 */
const RUN_TIMEOUT_MS = 20_000

/** `probe` 的缓存时长：检测结果短暂缓存；安装文件、目录设置或 DLL 仍可能在运行期间变化。 */
const PROBE_CACHE_MS = 60_000

/**
 * 取数失败后再次尝试前的等待时间。
 *
 * 这不是性能优化，是正确性：一次对话会并发打出十几条请求，如果每次失败都重试，
 * 一个 SDK 故障会变成"每轮十几个子进程 + 十几个 20 秒超时"。等待下一次重试期间直接返回上一枚
 * 可用值，没有旧值时返回 undefined。用户手动点击「重新获取」时绕过等待，
 * 就是要求现在再试一次。
 */
const RETRY_BACKOFF_MS = 30_000

/**
 * 后台预热提前多久换新。
 *
 * 不在"刚好过期"那一刻换：定时器可能被系统挂起、被打断，晚个几百毫秒就够让一条
 * 请求带着刚过期的值出去。提前 15 秒，代价是每 10 分钟多一次 100 ms 的取数。
 */
const KEEP_ALIVE_LEAD_MS = 15_000

/** 预热失败后的重试间隔。比请求失败后等待 30 秒再试松一点：这里没有人在等。 */
const KEEP_ALIVE_RETRY_MS = 60_000

/** SDK 根本不可用（没内置副本、平台不支持、加载失败）时的复查间隔。 */
const KEEP_ALIVE_UNAVAILABLE_MS = 5 * 60_000

/** 下一次预热的延迟下限，防止把定时器排成 0 ms 的自旋。 */
const KEEP_ALIVE_MIN_DELAY_MS = 5_000

/** 一次预热的四个时间参数。合并成一个对象，纯粹是为了让测试能把十分钟压成几百毫秒。 */
export interface TuringKeepAliveTiming {
  /** 提前多久换新。 */
  leadMs: number
  /** 取数失败后的重试间隔。 */
  retryMs: number
  /** SDK 不在这台机器上时的复查间隔。 */
  unavailableMs: number
  /** 任何情况下的延迟下限。 */
  minDelayMs: number
}

/** 生产用法；测试可以整体或部分覆盖（见 `createTuringSdk` 的 `keepAliveTiming`）。 */
export const TURING_KEEP_ALIVE_TIMING: TuringKeepAliveTiming = {
  leadMs: KEEP_ALIVE_LEAD_MS,
  retryMs: KEEP_ALIVE_RETRY_MS,
  unavailableMs: KEEP_ALIVE_UNAVAILABLE_MS,
  minDelayMs: KEEP_ALIVE_MIN_DELAY_MS,
}

/** 决定下一次自动预热的延迟（毫秒）。导出来是为了能直接测调度，而不必真等十分钟。 */
export function nextAutoRefreshDelayMs(input: {
  nowMs: number
  ttlMs: number
  /** 当前这枚 token 的取数时间；没有 token 时省略。 */
  fetchedAtMs?: number
  /** 最近一次**失败**的时刻。 */
  lastFailureAtMs?: number
  /** 最近一次 probe 的结论，用来区分"暂时取不到"和"这台机器没有 SDK"。 */
  sdkState?: TuringSdkInfo['state']
}, timing: TuringKeepAliveTiming = TURING_KEEP_ALIVE_TIMING): number {
  const { nowMs, ttlMs, fetchedAtMs, lastFailureAtMs, sdkState } = input
  if (fetchedAtMs !== undefined) {
    // 取到了但随后又失败过（例如手动刷新失败）：一分钟后再试一次，别等到下次到期。
    if (lastFailureAtMs !== undefined && lastFailureAtMs >= fetchedAtMs) return timing.retryMs
    const remainMs = ttlMs - timing.leadMs - (nowMs - fetchedAtMs)
    return Math.max(remainMs, timing.minDelayMs)
  }
  // 尚无 token 时降低探测频率，后续仍定期复查，以发现用户新安装或修复的 SDK。
  return sdkState !== undefined && sdkState !== 'ready' ? timing.unavailableMs : timing.retryMs
}

/** 供展示的平台架构标识，例如 win32-x64。SDK 目录由下方发现逻辑确定。 */
export function bundledSdkBundleId(platform: string = process.platform, arch: string = process.arch): string {
  return `${platform}-${arch}`
}

/**
 * 插件自带的 `native/turing-sdk` 根目录，包含 `worker.cjs` 和说明文档，不再有 SDK 副本（原生模块与厂商 DLL 是桌面端的构建产物，不随插件分发）。
 *
 * `import.meta.url` 指向 `lib/index.js`（构建产物）或 `src/turing-sdk.ts`（开发与
 * 测试），两者均位于包根下一层，因此 ../native/... 对两种运行形态都有效。这是
 * 不用 `process.cwd()` 的原因：cwd 是调用者的，不是插件的。
 */
export function bundledSdkRoot(): string {
  return fileURLToPath(new URL('../native/turing-sdk', import.meta.url))
}

/** 子进程脚本的路径；随插件分发，加载的是**用户机器上**的 SDK。 */
function workerPath(): string {
  return join(bundledSdkRoot(), 'worker.cjs')
}

/**
 * SDK 目录相对桌面端安装根目录的形状（Electron 把原生模块从 asar 里解包出来）。
 *
 * macOS 实测（A 级，2026-11-01，`/Applications/WorkBuddy.app` 与
 * `"/Applications/WorkBuddy AI.app"` 两份都在）：
 * `<bundle>/Contents/Resources/app.asar.unpacked/native/turing-sdk`，里面有
 * `index.cjs` / `package.json` / `build/Release/turing_sdk.node`。
 * Windows 实测（A 级，2026-11-01，`F:\智能体安装路径\WorkBuddy`）：
 * 同样采用 <install>\resources\app.asar.unpacked\native\turing-sdk 路径结构。
 * `WorkBuddy.exe` → 该目录 → `hasTuringSdkBinding` 命中，doctor 报
 * `ready (win32-x64 — <install>\resources\app.asar.unpacked\native\turing-sdk)`
 * 并经桌面端自己的 SDK 副本取到 1174 字符真 token。另经 app.asar 解包核对：
 * `native/turing-sdk` 在 asar 头里标 `unpacked`，实际文件只在 `app.asar.unpacked`
 * 一侧，两条路径就是全部分布。注意 DSH Desktop / DSH NEXT 本身是另一种应用、
 * 不包含该 SDK。因此应搜索 WorkBuddy 桌面端的安装目录。
 */
function installedSdkDirFromExecutable(platform: string, executable: string): string | undefined {
  if (platform === 'win32') {
    const install = win32.dirname(executable)
    return win32.join(install, 'resources', 'app.asar.unpacked', 'native', 'turing-sdk')
  }
  if (platform === 'darwin') {
    // exe 是 `<bundle>/Contents/MacOS/<bin>`；CFBundleExecutable 可能叫
    // `Electron`（两份真实 bundle 都是），所以只能向 bundle 问名字，不能倒推。
    const contents = posix.dirname(posix.dirname(executable))
    const bundle = posix.dirname(contents)
    return posix.join(bundle, 'Contents', 'Resources', 'app.asar.unpacked', 'native', 'turing-sdk')
  }
  return undefined
}

/** 一份 turing-sdk 目录是不是能用：原生模块在不在它声明的位置。 */
export function hasTuringSdkBinding(
  dir: string,
  exists: (path: string) => boolean = existsSync,
  platform: string = process.platform,
): boolean {
  // 分隔符按**数据**的平台选，失败后再试**另一种**拼法：Windows API 本来就接受
  // `/`，测试传入的目录可能采用运行平台的路径格式（docs/WINDOWS.md 的路径规则，
  // `at-rest.ts` 曾因混用路径分隔符而无法定位文件）。
  //
  // 首次失败后尝试另一种路径分隔符，以覆盖两种路径来源在 Windows 上的
  // 全部区别：`process.platform === 'win32'` 时运行平台的 join 就是 `win32.join`，于是
  // 那句 `hostPath !== dataPath` 恒为假，失败后的处理分支被整个短路掉。结果是这个函数的
  // 行为随**跑它的机器**变化：同样的 `(dir, exists, 'win32')` 在 macOS 上会试
  // 两种拼法、在 Windows 上只试一种。改成显式取另一种拼法后，答案只由参数决定，
  // 与执行测试的操作系统无关（RELEASING.md §2.5）。
  const parts = ['build', 'Release', 'turing_sdk.node'] as const
  const dataJoin = platform === 'win32' ? win32.join : posix.join
  const alternateJoin = platform === 'win32' ? posix.join : win32.join
  const dataPath = dataJoin(dir, ...parts)
  if (exists(dataPath)) return true
  const alternatePath = alternateJoin(dir, ...parts)
  return alternatePath !== dataPath && exists(alternatePath)
}

/**
 * 按桌面端的安装形状找本机已安装的 SDK 目录，返回**第一个可用的**。
 *
 * 候选来自 `at-rest.ts` 的同一套安装形状（env 覆盖 → 默认布局；win32 再加
 * 卸载注册表这一路，覆盖装在非默认盘的情况）。所有 win32 路径都用
 * `path.win32`、darwin 用 `path.posix` 拼：这些是**数据**规定的分隔符，
 * 路径格式由被探测的安装平台决定，不能使用测试运行平台的默认 join。
 * 否则在 macOS 上测试 Windows 安装路径时会混用分隔符，详见 docs/WINDOWS.md。
 *
 * 各依赖可由调用方注入，测试无需依赖运行机器的真实安装（见 RELEASING.md §2.5）：
 * `exists` 决定"这份安装里有没有 SDK"，`readRegistryAppPath` 决定注册表答案；
 * 仅当 platform 为 win32 时读取注册表，避免 macOS 测试尝试启动
 * 一个本机根本不存在的 `reg.exe`。
 */
export function discoverInstalledSdkDir(options: {
  platform?: string | undefined
  home?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  exists?: ((path: string) => boolean) | undefined
  readRegistryAppPath?: (() => string | undefined) | undefined
} = {}): string | undefined {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const executables = workbuddyAppExecutableCandidates(
    platform as NodeJS.Platform,
    home,
    env,
  )
  if (platform === 'win32') {
    // 默认布局全空时问卸载注册表（装在 E: 盘之类的非默认位置，issue #68 同款
    // 教训：漏了这一步，装着也等于没装）。
    const fromRegistry = (options.readRegistryAppPath ?? windowsRegistryAppExecutable)()
    if (fromRegistry !== undefined) executables.push(fromRegistry)
  }
  const seen = new Set<string>()
  for (const executable of executables) {
    const dir = installedSdkDirFromExecutable(platform, executable)
    if (dir === undefined || seen.has(dir)) continue
    seen.add(dir)
    // exe 本身存在才算一次真实安装：一个不存在的安装目录里的 binding 检查
    // 只是碰运气，而运气不该进发现链。
    if (!exists(executable)) continue
    if (hasTuringSdkBinding(dir, exists, platform)) return dir
  }
  return undefined
}

/** What one `probe` established about the SDK on THIS machine. */
export interface TuringSdkInfo {
  /**
   * `ready` = 能加载且自称支持；`unsupported` = 平台不支持；`missing` = 没发现本机
   * 装有桌面端 SDK；`error` = 目录在但加载不了；
   * `disabled` = 用户把总开关关了（`deviceSdkEnabled: false`）。
   *
   * `disabled` 与 `missing` 必须分开：前者是"我不要"，后者是"这台机器上没有"。
   * 合并成一个会让关掉开关的用户每次打开面板都看到一条"装个桌面端就好"的建议，
   * 而那正是他明确拒绝去做的事。
   */
  state: 'ready' | 'unsupported' | 'missing' | 'error' | 'disabled'
  /** `win32-x64` 之类的主机三元组；只用于展示与排障，不再决定目录。 */
  bundle: string
  /** 本机桌面端里的 SDK 目录（或 `WORKBUDDY_TURING_SDK_DIR` 指向的目录）；空串 = 没找到。 */
  path: string
  platform: string
  arch: string
  /** 子进程用的运行时版本，例如 `22.22.2` 或 `electron 30.0.0`。 */
  runtime: string
  /** 仅在非 `ready` 时出现；面向排障，不含任何 secret。 */
  reason?: string
}

/** The token as the card sees it: never the value itself. */
export interface TuringTokenReadout {
  /** `ok` = 新鲜；`stale` = 取不到新的、还在宽限期内；`unavailable` = 没有可用的值。 */
  state: 'ok' | 'stale' | 'unavailable' | 'idle'
  /** 掩码，可以直接进 UI。 */
  masked: string
  /** token 的字符数（0 表示没有）。长度用于辅助核对返回格式，不能单独证明凭据有效。 */
  length: number
  /** 这一枚 token 是什么时候取到的。 */
  fetchedAtMs?: number
  /** 上次尝试时间，成功与失败均记录，用于区分尚未尝试和尝试失败。 */
  lastAttemptMs?: number
  /** `stale` / `unavailable` 的原因，结构化短语，不含 secret。 */
  reason?: string
}

/** 掩码：保住 scheme 前缀，其余一律星号。`v3:` 是 SDK 的格式标记，不是内容。 */
export function maskToken(token: string): string {
  if (token === '') return ''
  const colon = token.indexOf(':')
  const prefix = colon > 0 && colon <= 8 ? token.slice(0, colon + 1) : ''
  return `${prefix}${'*'.repeat(16)}`
}

/** One parsed worker answer. */
interface WorkerAnswer {
  ok?: boolean
  reason?: string
  message?: string
  token?: string
  supported?: boolean
  node?: string
  platform?: string
  arch?: string
  sdkDir?: string
  loadError?: string | null
  ms?: number
}

/**
 * Run the worker once.
 *
 * `env` 只带 SDK 需要的白名单，不整份继承：父进程环境里有插件的凭据与用户配置，
 * 一个只需要网络和系统 DLL 的子进程没有理由看到它们。
 */
function runWorker(mode: 'probe' | 'token', options: {
  dir: string
  worker: string
  channelId: string
  productName: string
  productVersion: string
  timeoutMs?: number
  keychainStorage?: boolean
}): Promise<WorkerAnswer> {
  return new Promise<WorkerAnswer>((resolve) => {
    const runtime = process.execPath
    const env: NodeJS.ProcessEnv = {
      TURING_SDK_DIR: options.dir,
      TURING_CHANNEL_ID: options.channelId,
      TURING_PRODUCT_NAME: options.productName,
      TURING_PRODUCT_VERSION: options.productVersion,
      TURING_TIMEOUT_MS: String(options.timeoutMs ?? RUN_TIMEOUT_MS - 2000),
      // 永远显式传布尔字面量：worker 再转成 boolean 给 configure 的第 4 参，
      // macOS 的 binding 对 undefined 直接报错。
      TURING_KEYCHAIN_STORAGE: options.keychainStorage === true ? '1' : '0',
    }
    for (const name of [
      'PATH', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE', 'HOME',
      'LOCALAPPDATA', 'APPDATA', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
      'LANG', 'LC_ALL',
    ]) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }
    // Electron 的 `process.execPath` 是 App 本体，直接跑会把参数当 URL 打开；
    // 这个开关让它退化成普通的 Node。普通 Node 下设置它无害。
    if (process.versions.electron !== undefined) env['ELECTRON_RUN_AS_NODE'] = '1'

    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (answer: WorkerAnswer): void => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      resolve(answer)
    }
    const child = spawn(runtime, [options.worker, mode], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const killer = setTimeout(() => {
      child.kill('SIGKILL')
      settle({ ok: false, reason: 'timeout', message: `worker did not answer within ${options.timeoutMs ?? RUN_TIMEOUT_MS}ms` })
    }, options.timeoutMs ?? RUN_TIMEOUT_MS)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      // 只留最后几行：SDK 可能刷初始化日志，而我们要的是错误摘要。
      stderr = `${stderr}${chunk}`.split('\n').slice(-4).join('\n')
    })
    child.on('error', error => {
      settle({ ok: false, reason: 'spawn-failed', message: error.message })
    })
    child.on('close', (code: number | null) => {
      const line = stdout.trim().split('\n').filter(Boolean).at(-1)
      if (line === undefined) {
        settle({ ok: false, reason: 'no-output', message: stderr.trim() || `worker exited with code ${String(code)}` })
        return
      }
      try {
        settle(JSON.parse(line) as WorkerAnswer)
      } catch {
        settle({ ok: false, reason: 'bad-output', message: stderr.trim() || 'worker printed no JSON' })
      }
    })
  })
}

/** The token source the request path and the card share. */
export interface TuringTokenSource {
  /** 当前可用的 token；取不到就是 `undefined`（**不会**退回派生值，那是另一档）。 */
  current(): Promise<string | undefined>
  /** Force a refetch; returns the readout afterwards. */
  refresh(): Promise<TuringTokenReadout>
  /** The masked snapshot, safe to render and to log. */
  readout(): TuringTokenReadout
  /** 用户显式点击后才给的一次完整值。 */
  reveal(): Promise<string | undefined>
}

/** What `doctors`-style callers get without touching a token. */
export interface TuringSdk {
  info(): Promise<TuringSdkInfo>
  tokens: TuringTokenSource
  /**
   * 启动后台预热：立刻取一次，此后在 TTL 到期前自动换新。
   *
   * 重复调用时只启动一次。插件 apply 时调一次即可；不调也不会坏，只是回到"没人问就不取"的旧行为。
   */
  startAutoRefresh(): void
  /** 停掉预热（插件卸载 / 测试收尾）。之后仍可再 start。 */
  stopAutoRefresh(): void
}

/**
 * 卡片「SDK」分区显示的诊断结果。
 *
 * `tier` 与 `token` 必须在同一份对象里：分开取会让界面出现"档位已切换、状态还是
 * 上一档"的中间态，而这两个值恰好是用户用来判断"我现在到底发的是什么"的。
 */
export interface WorkBuddyDeviceSdkReport {
  tier: WorkBuddyDeviceMode
  sdk: TuringSdkInfo
  token: TuringTokenReadout
}

/** Host → 卡片路由的端口。 */
export interface WorkBuddyDeviceSdkPort {
  read(): Promise<WorkBuddyDeviceSdkReport>
  refresh(): Promise<WorkBuddyDeviceSdkReport>
  /** 完整 token；没有可用值时为 `undefined`。只在显式点击后调用。 */
  reveal(): Promise<string | undefined>
  /**
   * SDK 总开关（`Config.deviceSdkEnabled`）的读写。
   *
   * 与 `read` 分开两个方法，而不是并进上面那份读取结果：开关来自**用户配置**，诊断结果来自
   * **SDK 当前状态**。混在一起会让"读取诊断结果"变成一次可能失败的配置读，而这一页最该
   * 做到的事就是"打不开也能告诉你是谁坏了"。
   *
   * `write` 返回 `false` 表示这个 DSH 没有 settings 服务（老 DSH），卡片据此把
   * 开关置灰，而不是显示一个点了没反应的勾选框。
   */
  readEnabled(): Promise<boolean | undefined>
  writeEnabled(enabled: boolean): Promise<boolean>
}

/**
 * Wire a {@link TuringSdk} into the card.
 *
 * `mode` 从设备设置读，不缓存：用户刚切换的那一下必须立刻反映到面板上。
 */
export function createDeviceSdkPort(options: {
  sdk: TuringSdk
  mode: () => Promise<WorkBuddyDeviceMode>
  /**
   * 总开关的读写。`undefined` = 这个 DSH 没有 settings 服务，卡片把开关置灰。
   *
   * 用回调而不是布尔值：开关会热更新（`asVolatile`），句柄是挂载时建的。
   */
  enabled?: {
    read: () => Promise<boolean | undefined>
    write: (enabled: boolean) => Promise<boolean>
  }
}): WorkBuddyDeviceSdkPort {
  const snap = async (): Promise<WorkBuddyDeviceSdkReport> => ({
    tier: await options.mode(),
    sdk: await options.sdk.info(),
    token: options.sdk.tokens.readout(),
  })
  return {
    read: snap,
    async refresh(): Promise<WorkBuddyDeviceSdkReport> {
      await options.sdk.tokens.refresh()
      return snap()
    },
    reveal: () => options.sdk.tokens.reveal(),
    readEnabled: async () => options.enabled === undefined ? undefined : options.enabled.read(),
    writeEnabled: async enabled => options.enabled === undefined ? false : options.enabled.write(enabled),
  }
}

/**
 * Build the SDK handle.
 *
 * `version` 默认取插件自称的应用版本（与 `User-Agent` 同源），因为它就是这台机器
 * 上那个客户端报给上游的版本；`channelId` 与产品名跟桌面端 `product.json` 一致。
 */
export function createTuringSdk(options: {
  dir?: string
  channelId?: string
  productName?: string
  productVersion?: string
  ttlMs?: number
  now?: () => number
  /**
   * 子进程脚本的路径。**只为测试存在**：真实调用永远用插件自带的那个，而这个参数
   * 让"缓存 / 重取 / 宽限期"这三条逻辑可以在不连 SDK、不发网络请求的前提下被
   * 逐条验证，减少只能在实际运行中发现的问题。
   */
  worker?: string
  /**
   * 主机平台与架构，同样**只为测试存在**：`bundle` 只是展示用的主机三元组，
   * 添加此入口后，Linux/macOS 测试也可模拟并核对 ready 状态的 win32-x64 标识，
   * 那条断言会把"跑测试的机器是什么平台"钉进期望值（RELEASING.md §2.5）。
   * 发现链也读它：传入 `platform: 'win32'` 就是在测 Windows 的安装形状，而
   * 不需要一台 Windows。默认值保持真实主机，行为不变。
   */
  platform?: string
  /** 见 `platform`。 */
  arch?: string
  /** 发现过程可注入的测试依赖（只为测试存在）：家目录、环境、存在性检查、注册表读数。 */
  home?: string
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  readRegistryAppPath?: () => string | undefined
  /**
   * 桌面端 `configure` 的第 4 参 `keychainStorageEnabled`。macOS 的原生 binding
   * 会校验它必须是 boolean（缺了它直接报 `keychainStorageEnabled must be a
   * boolean`），Windows 旧版本可接受额外参数，因此此处统一传布尔值。
   * 默认 `false`：插件没有往钥匙串写设备缓存的设计意图，SDK 走自己的内存缓存。
   */
  keychainStorage?: boolean
  /**
   * 预热的时间参数。**只为测试存在**：把十分钟的 TTL 压成几百毫秒，才能验证
   * "到期会自动换新"这件事，而不是靠线上等一周。
   */
  keepAliveTiming?: Partial<TuringKeepAliveTiming>
  /**
   * 卡片上填的 SDK 目录来源（作者意见 #1）。
   *
   * 一个**函数**而不是一个字符串：设置会在用户点保存时改变，而 SDK 句柄是插件
   * 挂载时建的、活到卸载。传字符串就只能重启才生效，而那正是这条意见要消掉的
   * 麻烦。每次 `probe` 调一次，所以保存后的第一次观察就能看到新目录。
   *
   * 排不到 `dir` / 环境变量前面：那两者是调用方与排障的显式选择。
   */
  dirSource?: () => Promise<string>
  /**
   * 总开关（`deviceSdkEnabled`）。`false` 时这个句柄仍然可用，但 `probe` 直接答
   * `disabled`，`current()` 永远返回 `undefined`，且一个子进程都不会被创建。
   *
   * 放在句柄上而不是让调用方决定"要不要建这个对象"：SDK 端口要能回答"功能被关掉
   * 了"，否则面板只能给一块空白，而空白读起来像"我点坏了"。
   */
  enabled?: boolean
} = {}): TuringSdk {
  const now = options.now ?? (() => Date.now())
  const worker = options.worker ?? workerPath()
  const ttlMs = options.ttlMs ?? TURING_TOKEN_TTL_MS
  const keepAliveTiming: TuringKeepAliveTiming = { ...TURING_KEEP_ALIVE_TIMING, ...options.keepAliveTiming }
  /**
   * 显式 enabled 优先；未提供时读取环境变量。
   * enabled 是构造选项中的布尔值，并非配置订阅器。插件配置变更是否需要
   * 重建句柄由调用方负责。独立 doctor 只有在环境变量为 1 或 true 时才启用。
   */
  const isEnabled = (): boolean => options.enabled !== undefined
    ? options.enabled !== false
    : /^(?:1|true)$/u.test(String((options.env ?? process.env)[TURING_SDK_ENABLED_ENV] ?? '').trim())
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const bundle = bundledSdkBundleId(platform, arch)
  /**
   * SDK 目录的**解析器**，不是一个常量（作者意见 #1）。
   *
   * 用户保存目录后需立即重新检测，因此目录必须在每次
   * `probe` 时重新问一次，而不是在 `createTuringSdk` 时钉死。构造期钉死会让
   * "填了但没生效"成为唯一的可能结果，而用户没有任何办法判断是路径错了还是需要
   * 重启（后者在这条处理过程上根本不存在）。
   *
   * 优先级：显式 `dir`（测试）→ `WORKBUDDY_TURING_SDK_DIR`（用于排查问题的环境变量）→ 卡片上
   * 手填的值（{@link TuringSdkOptions.dirSource}）→ 自动发现 → 空串（`missing`）。
   * 环境变量压过设置的理由写在 `device-profile.ts` 的 `sdkDir` 上。
   */
  const resolveDir = async (): Promise<string> => {
    const configured = options.dir ?? env[TURING_SDK_DIR_ENV]
    if (configured !== undefined && configured.trim() !== '') return configured.trim()
    const fromCard = options.dirSource === undefined ? '' : (await options.dirSource()).trim()
    if (fromCard !== '') return fromCard
    return discoverInstalledSdkDir({
      platform,
      home: options.home,
      env,
      exists,
      readRegistryAppPath: options.readRegistryAppPath,
    }) ?? ''
  }
  const channelId = options.channelId ?? env[TURING_CHANNEL_ID_ENV] ?? '109144'
  const productName = options.productName ?? env[TURING_PRODUCT_NAME_ENV] ?? 'WorkBuddy'
  const productVersion = options.productVersion ?? env[TURING_PRODUCT_VERSION_ENV] ?? '5.8.3'
  const keychainStorage = options.keychainStorage
    ?? /^(?:1|true)$/u.test(String(env[TURING_KEYCHAIN_STORAGE_ENV] ?? '').trim())

  let probeCache: { at: number, path: string, info: TuringSdkInfo } | undefined
  let cached: { token: string, fetchedAtMs: number } | undefined
  let lastAttemptMs: number | undefined
  let lastFailure: string | undefined
  /** 最近一次失败的时刻；重试前的等待时间由它算。 */
  let lastFailureAtMs: number | undefined
  let inFlight: Promise<string | undefined> | undefined
  /** 后台预热的定时器；`undefined` 表示当前没有排下一轮。 */
  let keepAliveTimer: ReturnType<typeof setTimeout> | undefined
  let keepAliveActive = false
  /** 最近一次 probe 的结论，用来决定"没有 token"时多久再问一次。 */
  let lastSdkState: TuringSdkInfo['state'] | undefined

  const runtimeLabel = process.versions.electron === undefined
    ? process.version.replace(/^v/u, '')
    : `electron ${process.versions.electron}`

  const missingInfo = (path: string): TuringSdkInfo => {
    const present = path !== '' && exists(path)
    return {
      state: present ? 'error' : 'missing',
      bundle,
      path,
      platform,
      arch,
      runtime: runtimeLabel,
      reason: present
        ? 'SDK directory exists but the native binding was not found'
        : `no installed WorkBuddy desktop SDK detected on ${bundle}; install the desktop app or set ${TURING_SDK_DIR_ENV}`,
    }
  }

  async function probe(): Promise<TuringSdkInfo> {
    const at = now()
    /**
     * 总开关先于一切：关掉时**不解析目录、不碰文件系统、不起子进程**。
     *
     * 此检查先于 resolveDir() 执行，因为目录解析会读取环境，还可能读取 Windows 注册表，
     * 而关掉开关的人要的正是"这个插件别去碰桌面端"。
     */
    if (!isEnabled()) {
      return {
        state: 'disabled',
        bundle,
        path: '',
        platform,
        arch,
        runtime: runtimeLabel,
        reason: 'the real-device SDK is turned off in this plugin\'s settings',
      }
    }
    // 先解析当前目录，再按解析结果检查缓存，避免修改目录后仍显示旧目录的检测状态。
    const dir = await resolveDir()
    if (probeCache !== undefined && probeCache.path === dir && at - probeCache.at < PROBE_CACHE_MS) {
      return probeCache.info
    }
    let info: TuringSdkInfo
    // 使用与目录发现流程相同的 platform 拼接路径。测试可注入不同平台，
    // 此处若使用运行机器的平台，就可能找不到测试提供的 binding。
    if (dir === '' || !hasTuringSdkBinding(dir, exists, platform)) {
      // 找不到目录或 binding 时返回 missing，不启动探测子进程。
      // 找到 binding 后仍加载失败的情况，由下方 worker 结果报告为 error。
      info = missingInfo(dir)
    } else {
      const answer = await runWorker('probe', { dir, worker, channelId, productName, productVersion, timeoutMs: 15_000, keychainStorage })
      const supported = answer.ok === true && answer.supported === true
      info = {
        state: supported ? 'ready' : answer.ok === true ? 'unsupported' : 'error',
        bundle,
        path: dir,
        platform,
        arch,
        runtime: answer.node ?? runtimeLabel,
        ...supported ? {} : { reason: answer.loadError ?? answer.message ?? answer.reason ?? 'sdk reported unsupported' },
      }
    }
    probeCache = { at, path: dir, info }
    return info
  }

  function readout(): TuringTokenReadout {
    const at = now()
    if (cached === undefined) {
      return {
        state: 'idle',
        masked: '',
        length: 0,
        ...lastAttemptMs === undefined ? {} : { lastAttemptMs },
        ...lastFailure === undefined ? {} : { reason: lastFailure },
      }
    }
    const ageMs = at - cached.fetchedAtMs
    const expired = ageMs > ttlMs
    const tooOld = ageMs > TURING_TOKEN_STALE_MS
    // token 仍在有效期内，但较晚的一次刷新失败时，状态应显示 stale。
    // 这样可以区分成功获取新值和刷新失败后继续使用旧值。
    const failedSinceFetch = lastFailure !== undefined
      && lastAttemptMs !== undefined
      && lastAttemptMs >= cached.fetchedAtMs
    return {
      state: tooOld ? 'unavailable' : expired || failedSinceFetch ? 'stale' : 'ok',
      masked: maskToken(cached.token),
      length: cached.token.length,
      fetchedAtMs: cached.fetchedAtMs,
      ...lastAttemptMs === undefined ? {} : { lastAttemptMs },
      ...expired || failedSinceFetch ? { reason: lastFailure ?? `older than ${Math.round(ttlMs / 60_000)}m` } : {},
    }
  }

  async function fetchOnce(): Promise<string | undefined> {
    lastAttemptMs = now()
    const info = await probe()
    lastSdkState = info.state
    if (info.state !== 'ready') {
      lastFailure = info.reason ?? `sdk is ${info.state}`
      lastFailureAtMs = lastAttemptMs
      return undefined
    }
    // 目录取 probe 刚刚解析出的那一个，不重新解析：两次解析之间用户可能又改了一次
    // 设置，那样 token 会从 A 目录取、状态却按 B 目录报告。
    const answer = await runWorker('token', { dir: info.path, worker, channelId, productName, productVersion, keychainStorage })
    const token = typeof answer.token === 'string' ? answer.token.trim() : ''
    if (answer.ok !== true || token === '') {
      lastFailure = answer.message ?? answer.reason ?? 'sdk returned no token'
      lastFailureAtMs = lastAttemptMs
      return undefined
    }
    cached = { token, fetchedAtMs: now() }
    lastFailure = undefined
    lastFailureAtMs = undefined
    return token
  }

  async function current(): Promise<string | undefined> {
    const at = now()
    // 此实例未启用 SDK 时，不向请求提供缓存 token。
    if (!isEnabled()) return undefined
    if (cached !== undefined && at - cached.fetchedAtMs <= ttlMs) return cached.token
    // 等待后重试：刚失败过就先别再造一个子进程。一轮对话十几条请求同时到，没有这一步，
    // 一次 SDK 故障会变成十几个子进程 + 十几个超时。
    if (lastFailureAtMs !== undefined && at - lastFailureAtMs < RETRY_BACKOFF_MS) {
      return cached !== undefined && at - cached.fetchedAtMs <= TURING_TOKEN_STALE_MS ? cached.token : undefined
    }
    // 并发获取请求共用一个执行中的任务，避免重复启动子进程。
    if (inFlight !== undefined) return inFlight
    inFlight = fetchOnce().finally(() => { inFlight = undefined })
    const token = await inFlight
    if (token !== undefined) return token
    // 获取失败时仍可返回本地宽限期内的缓存，并在面板标为 stale。
    // 宽限期是插件的重用策略，不保证上游仍接受该 token。
    if (cached !== undefined && now() - cached.fetchedAtMs <= TURING_TOKEN_STALE_MS) return cached.token
    return undefined
  }

  /**
   * 预热一次：到期前换新，其余情况什么都不做。
   *
   * 与 {@link current} 的分工是这条需求的核心。`current()` 只在**请求要发出去**时
   * 被调用，空闲进程因此不会自动刷新 token，面板会停留在「已加载、
   * 没取过」，用户无法判断 SDK 是否正常。预热在启动时
   * 与每次到期前跑，让"现在这枚 token 是什么"随时可以回答。
   *
   * 重复调用时，缓存未过期或仍在失败等待期就直接返回；已有请求执行中则等待该请求。
   */
  async function warm(): Promise<void> {
    const at = now()
    // 未启用 SDK 的实例不执行预热。enabled 在实例创建时确定，
    // 修改配置后需由调用方重新创建实例，才能应用新开关值。
    if (!isEnabled()) return
    const failedSinceFetch = cached !== undefined
      && lastFailureAtMs !== undefined
      && lastFailureAtMs >= cached.fetchedAtMs
    const fresh = cached !== undefined && at - cached.fetchedAtMs < ttlMs - keepAliveTiming.leadMs
    if (fresh && !failedSinceFetch) return
    // 重试前的等待时间内不重复起子进程：预热每分钟来一次，没必要一遍遍撞同一堵墙。
    if (lastFailureAtMs !== undefined && at - lastFailureAtMs < RETRY_BACKOFF_MS) return
    if (inFlight !== undefined) {
      await inFlight
      return
    }
    inFlight = fetchOnce().finally(() => { inFlight = undefined })
    await inFlight
  }

  function nextDelayMs(): number {
    return nextAutoRefreshDelayMs({
      nowMs: now(),
      ttlMs,
      ...cached === undefined ? {} : { fetchedAtMs: cached.fetchedAtMs },
      ...lastFailureAtMs === undefined ? {} : { lastFailureAtMs },
      ...lastSdkState === undefined ? {} : { sdkState: lastSdkState },
    }, keepAliveTiming)
  }

  /**
   * 一轮预热：取一次，然后按 {@link nextDelayMs} 排下一轮。
   *
   * 单链而不是 `setInterval`：间隔不是常数（成功是"到 TTL 前 15 秒"，失败是 60 秒，
   * SDK 不在这台机器上是 5 分钟），而且每一轮都要按**当下**的时间重算，否则系统
   * 休眠回来后会把积压的 tick 一次放出来。
   */
  async function tick(): Promise<void> {
    if (!keepAliveActive) return
    try {
      await warm()
    } catch {
      // warm 自己不抛；这里只是不让一次意外把整条定时链断掉。
    }
    if (!keepAliveActive) return
    keepAliveTimer = setTimeout(() => { void tick() }, nextDelayMs())
    // 后台预热不该把 DSH 进程钉在运行状态（Node 对计时器与进程退出的处理；测试里的假定时器没有它）。
    keepAliveTimer.unref?.()
  }

  return {
    info: probe,
    startAutoRefresh(): void {
      // 关掉时连定时器都不建：一个永远 early-return 的链仍然会让 DSH 进程多一条
      // 待唤醒的句柄，而"关掉"最该省掉的正是这种残余。
      if (!isEnabled()) return
      if (keepAliveActive) return
      keepAliveActive = true
      // 立即一次，不等定时器：重启后打开面板不该是"已加载但没取过"。
      void tick()
    },
    stopAutoRefresh(): void {
      keepAliveActive = false
      if (keepAliveTimer !== undefined) {
        clearTimeout(keepAliveTimer)
        keepAliveTimer = undefined
      }
    },
    tokens: {
      current,
      readout,
      reveal: current,
      /**
       * Force a refetch — but **keep** whatever is cached until the new value
       * arrives. 清空再取会让"手动刷新失败"顺手抹掉一枚还在宽限期内可用的
       * token，那正好是用户点刷新想避免的结果。
       */
      async refresh(): Promise<TuringTokenReadout> {
        if (inFlight !== undefined) return inFlight.then(() => readout())
        inFlight = fetchOnce().finally(() => { inFlight = undefined })
        await inFlight
        return readout()
      },
    },
  }
}
