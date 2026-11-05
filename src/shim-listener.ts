/**
 * 端口监听、客户端可达性探测和关闭。从 shim.ts 按职责提取。
 * 原实现的参考来源及许可证说明见 shim.ts 文件头与 THIRD_PARTY_NOTICES.md。
 */
import type { Server } from 'node:http'
import type { ShimLogger } from './shim.ts'

/**
 * How many times the listener re-rolls its port before accepting one the client
 * refuses.
 *
 * Bounded on purpose: a machine whose whole dynamic range is refused would
 * otherwise re-roll forever, and a shim on a refused port still fails in ONE
 * region-scoped way — while no shim at all takes that region down outright.
 * Availability wins over tidiness.
 */
export const PORT_ROLL_LIMIT = 5

/**
 * Whether this runtime's `fetch` refuses `port` WITHOUT ever connecting.
 *
 * `server.listen(0)` lets the kernel pick the port, and the Fetch standard bans
 * a list of ports that `fetch` must reject before opening a socket
 * (`fetch.spec.whatwg.org#block-bad-port`, implemented as undici's `badPorts`).
 * Every client of this shim goes through that same `fetch`: pi-ai drives the
 * OpenAI SDK, whose `getDefaultFetch()` returns `globalThis.fetch`. So a shim
 * that lands on a banned port is unreachable to its own client while being
 * perfectly healthy on the wire — measured on port 6000: `fetch` refuses,
 * while `node:http`, a raw TCP socket and `curl` all connect and get 200.
 *
 * That combination is what makes it worth preventing rather than diagnosing: it
 * is silent (the SDK surfaces only `Connection error.`, with the `bad port`
 * cause dropped), total (every request in the region fails), and it does not
 * re-roll on its own.
 *
 * Whether it can happen at all depends on the machine's dynamic port range,
 * because that is the set `listen(0)` draws from:
 *
 *   Windows default 49152-65535, Linux default 32768-60999, macOS 49152-65535
 *     — every banned port is <= 10080 (the current list ends there), so the
 *       intersection is EMPTY and these machines cannot be affected.
 *   A range lowered to reach below 10080 — e.g. the legacy `MaxUserPort`
 *     registry value pinned to 15000, which yields 1024-15000 — draws from a
 *     set that CONTAINS banned ports. Measured there: 19 of 13977 ports are
 *     banned, i.e. ~0.14% per bind and ~0.27% per plugin load (two regions,
 *     one bind each).
 *
 * Probing with the client itself, rather than comparing against a copy of the
 * banned list, is deliberate: a hard-coded list drifts the moment the standard
 * gains a port, whereas the rule being satisfied here IS the client's own, so
 * asking the client cannot disagree with it. `tests/shim.spec.ts` pins the
 * error shape this relies on, so a Node change that renames it fails loudly
 * instead of silently disabling the guard.
 */
export async function clientRefusesPort(port: number): Promise<boolean> {
  try {
    // ANY HTTP answer proves the client accepted the port — including the 401
    // this route returns without a bearer. Only a throw is evidence of refusal.
    await fetch(`http://127.0.0.1:${port}/healthz`)
    return false
  } catch (error: unknown) {
    return isBadPortRefusal(error)
  }
}

/**
 * Whether `error` is the client's PORT REFUSAL rather than a real transport
 * failure.
 *
 * The two must never be conflated: a refused port is worth re-rolling, while
 * `ECONNREFUSED`/`ECONNRESET` are ordinary transport errors that re-rolling
 * would only paper over. Measured shapes on Node 24:
 *
 *   refused port : TypeError('fetch failed') -> cause Error('bad port')        (no `code`)
 *   closed  port : TypeError('fetch failed') -> cause Error('connect ECONNREFUSED …') (code `ECONNREFUSED`)
 *
 * The cause chain is walked, with a bound, rather than read one level deep:
 * the OpenAI SDK wraps this same refusal in its own `APIConnectionError`, and a
 * caller should not have to know how deep the active client happens to nest it.
 */
export function isBadPortRefusal(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4; depth++) {
    if (!(current instanceof Error)) return false
    if (current.message === 'bad port') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Listen on an ephemeral loopback port, rejecting on failure.
 *
 * Also settles on `close`, which is NOT redundant: measured on Node 24, a
 * `close()` that lands while `listen()` is still pending fires neither
 * `listening` nor `error` — only `close`. Without that third listener a dispose
 * during startup would leave this promise (and therefore the shim's `ready`)
 * pending forever, wedging plugin unload. Resolving there is deliberate:
 * disposal is a satisfied end state, not a startup failure.
 */
function listenOnce(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settle = (): void => {
      server.off('listening', onListening)
      server.off('error', onError)
      server.off('close', onClose)
    }
    const onListening = (): void => { settle(); resolve() }
    const onError = (error: Error): void => { settle(); reject(error) }
    const onClose = (): void => { settle(); resolve() }
    // `once` here and not in the caller: the handlers must be scoped to THIS
    // attempt, or a failure on a later re-roll would resolve an earlier attempt.
    server.once('listening', onListening)
    server.once('error', onError)
    server.once('close', onClose)
    server.listen(0, '127.0.0.1')
  })
}

/** Stop listening, resolving once the listener is down. */
function closeOnce(server: Server): Promise<void> {
  return new Promise<void>(resolve => server.close(() => resolve()))
}

/**
 * Bind an ephemeral loopback port that the CLIENT can actually reach.
 *
 * `listen(0)` stays the right way to get a port — the kernel picks a free one
 * instead of this plugin guessing a number — but the first pick is not always
 * usable, so the roll repeats while the client refuses it. See
 * {@link clientRefusesPort} for why the client's own answer is the criterion,
 * and {@link PORT_ROLL_LIMIT} for why the loop is bounded.
 *
 * The probe is injected rather than imported so the re-roll path can be driven
 * deterministically: no test can make `listen(0)` return a banned port on
 * demand, so this seam is the only way to pin the behaviour that actually
 * matters.
 *
 * `ready` (the returned promise) therefore resolves only once a port is
 * settled, which is what lets every consumer keep reading `baseUrl()` as it
 * always has.
 */
export async function listenOnClientReachablePort(options: {
  server: Server
  /** Answers whether the active HTTP client refuses this port. */
  clientRefuses: (port: number) => Promise<boolean>
  logger?: ShimLogger | undefined
  /** Whether the shim was disposed while the listener was still starting. */
  cancelled?: (() => boolean) | undefined
}): Promise<void> {
  const { server, clientRefuses, logger, cancelled } = options
  for (let attempt = 1; ; attempt++) {
    // Checked at the top of each pass: the probe below is the only long await,
    // so a dispose that lands during it is caught here, before the listener is
    // brought back up with nothing left to close it.
    if (cancelled?.() === true) return
    await listenOnce(server)
    const address = server.address()
    const port = address === null || typeof address === 'string' ? undefined : address.port
    // A unix socket cannot come out of a TCP listen, but if there is no port to
    // judge there is also nothing to re-roll — serve what we have.
    if (port === undefined || !(await clientRefuses(port))) return
    if (attempt >= PORT_ROLL_LIMIT) {
      logger?.warn(
        `dsh-connect-workbuddy: port ${port} is on the HTTP client's refused list and ${PORT_ROLL_LIMIT} rolls did not avoid one; serving on it anyway`,
      )
      return
    }
    logger?.warn(`dsh-connect-workbuddy: port ${port} is refused by the HTTP client; re-rolling (attempt ${attempt})`)
    await closeOnce(server)
  }
}

