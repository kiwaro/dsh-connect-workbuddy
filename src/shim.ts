import { isJsonContentType, hostErrorCode, writeJson, writeOpenAIError, readBody, KIND_STATUS, NO_RETRY_HEADERS, RequestBodyTooLargeError } from './shim-http.ts'
export { RequestBodyTooLargeError } from './shim-http.ts'
import { RecoveryStream } from './shim-recovery-stream.ts'
import { clientRefusesPort, listenOnClientReachablePort } from './shim-listener.ts'
export { PORT_ROLL_LIMIT, clientRefusesPort, isBadPortRefusal, listenOnClientReachablePort } from './shim-listener.ts'
/**
 * Loopback OpenAI-compatible endpoint. The pi-ai provider points here; the
 * shim applies the WorkBuddy wire quirks (forced streaming, string
 * `tool_choice`, CLI-shaped headers) and forwards to the real upstream.
 * It binds 127.0.0.1 only and never serves another interface.
 *
 * 参考：corrinehu/dsh-workbuddy-connect（MIT，Copyright (c) 2026 Corrine Hu）
 *   — 接收请求时增加校验的四重校验（Host 必须回环、Origin 必须回环、chat POST 必须
 *     JSON、bearer 必须匹配进程内随机 secret）、常量时间比对、
 *     随机端口绑定、body 上限、上游错误分类对应的 HTTP 状态码，
 *     均由该项目设计并验证。
 * 改动：随机端口绑定加了「先确认客户端能用」一步（`listenOnClientReachablePort`）。
 *   绑定方式仍是 `listen(0)` + 仅回环，随机性不变；改的只是抽到 HTTP 客户端
 *   禁用端口（fetch 规范的 block-bad-port 清单）时重抽，而不是带着一个自己
 *   客户端连不上的端口启动。四重校验、常量时间比对、body 上限、
 *   错误分类均未改动。
 *
 * @module dsh-connect-workbuddy/shim
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { WorkBuddyCredential, WorkBuddyCredentialStore } from './auth.ts'
import { workbuddyAccountId, preferredAccountName } from './auth.ts'
import type { WorkBuddyCatalog } from './catalog.ts'
import type { WorkBuddyRefusalReport } from './off-thinking.ts'
import { hostIsLoopback, originIsLoopback } from './loopback.ts'
import type { RecoveryGate } from './dsml-recovery.ts'
import { parseQueueAnswer, queueNoticeText } from './queue.ts'
import {
  declaredTools,
  prepareChatBody,
  modelIdOfBody,
  forceNeutralHead,
  channelGateMemberOf,
  isConversationIdGateBody,
  isContextTooLongBody,
  CONTEXT_OVERFLOW_MARKER,
  isFirstMessageGateBody,
  openingEvidenceOfBody,
  perturbChannelFingerprints,
  requestEvidenceOf,
  rewriteSessionTitleModel,
  WorkBuddyUpstreamClient,
  type UpstreamErrorKind,
  type WorkBuddyChatResult,
} from './upstream.ts'

/** Minimal logger surface the plugin context already provides. */
export interface ShimLogger {
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** What the plugin needs from a running shim. */
export interface WorkBuddyShim {
  /** Resolves once the listener is up; rejects if listening failed. */
  ready: Promise<void>
  /** The shim origin, e.g. `http://127.0.0.1:39271`; valid after ready. */
  baseUrl(): string
  /**
   * The per-process shared secret the plugin's own client must carry as
   * `Authorization: Bearer <token>`. Lives only in memory; the adapter
   * resolves this instead of the upstream access token, because the shim
   * resolves the real credential itself via the store.
   */
  token(): string
  /** Stop serving and destroy open connections. */
  close(): Promise<void>
}

/**
 * Supplies the credential to retry a failed chat request with.
 *
 * Called with every account id already tried for THIS request, the one that just
 * failed LAST, and resolves to the next candidate — or `undefined` when the pool
 * is off, empty, or exhausted, in which case the original failure is reported
 * unchanged.
 *
 * The plugin owns the policy (which pool members count as usable, in what
 * order); the shim owns only the retry loop and the wire-level rule that a
 * retry may happen before anything has been written to the client.
 */
export type WorkBuddyFailoverAccount = (
  triedAccountIds: readonly string[],
) => Promise<WorkBuddyCredential | undefined>

/**
 * Why the pool had no candidate, asked only after failover came up empty.
 *
 * A separate callback rather than a richer return type on
 * {@link WorkBuddyFailoverAccount}: the loop calls that one on the HOT PATH of
 * every retry, and a policy that had to explain its refusal on every call would
 * make the common case pay for the rare one. This runs at most once per failed
 * request, and only when the answer is already going to be an error.
 *
 * Returns a short Chinese clause naming the reason (e.g. "池中其余账号都在冷却"),
 * or undefined when the host has nothing to add — in which case the reply says
 * only that no other account was available.
 */
export type WorkBuddyFailoverShortfall = () => Promise<string | undefined>

/** Constructor dependencies. */
export interface WorkBuddyShimOptions {
  store: WorkBuddyCredentialStore
  client: Pick<WorkBuddyUpstreamClient, 'chatStream'>
  catalog: WorkBuddyCatalog
  logger?: ShimLogger
  /**
   * When to perturb scanned messages with invisible characters.
   *
   * `off` keeps the ordinary fail-then-rescue ladder; `failure` (the default)
   * remembers a successful rescue and starts later requests with it; `always`
   * starts every request with the dense rescue. `always` is for users whose
   * gateway has already made the plain attempt a guaranteed 11128 — it trades a
   * little prompt byte-level purity for avoiding that doomed round trip.
   */
  channelPerturbation?: 'off' | 'failure' | 'always'
  /**
   * Move the harness's injected `user` blocks above the real prompt (issue #132).
   *
   * The WorkBuddy usage page records the LAST `user` message as the request
   * text, and the harness appends its runtime context after the user's real
   * prompt — so the usage column shows injected noise instead of what was typed.
   * The reorder is order-only (every message and its text survive), and it only
   * ever moves messages that MATCH the harness's own injected prefixes; the single
   * textual edit is stripping the recorded prompt's own leading marker.
   *
   * Default false: it changes bytes the upstream counts, so it is opt-in.
   */
  keepPromptLast?: boolean
  /**
   * Extra literal prefixes (issue #133) treated like the harness's injected
   * markers under `keepPromptLast`, for context blocks a companion plugin
   * injects that the built-in list does not know about. Only read when
   * `keepPromptLast` is on.
   */
  extraInjectedPrefixes?: readonly string[]
  /**
   * Move the host's session-title request onto the hidden lightweight model
   * (issues #132/#133). Disabled by default; when enabled, a body recognized
   * as the one-message title prompt is re-pointed at `model` (default
   * `wb-lite`, measured 0 credits) instead of billing the main paid model.
   * See `rewriteSessionTitleModel` for the fail-closed detection rules.
   */
  sessionTitle?: {
    enabled?: boolean
    model?: string
  }
  /**
   * Pool failover for chat requests. Absent means no failover at all — the
   * pre-pool behaviour, where the selected account serves and its failure is
   * reported as-is.
   */
  failoverAccount?: WorkBuddyFailoverAccount
  /**
   * Why the pool had no usable candidate, asked after failover found none.
   *
   * The failure path uses this to answer the question the user is actually left
   * with — "why did nothing else work?" — instead of only reporting that every
   * attempt failed. Without it the pool's own reasoning is invisible at exactly
   * the moment it matters, and "换个模型" reads as a guess rather than as the
   * conclusion of a search the plugin already performed.
   *
   * Optional, and its absence is a supported state: a host that does not supply
   * it produces the same reply as before this option existed.
   */
  failoverShortfall?: WorkBuddyFailoverShortfall
  /**
   * Told about every refused request the plugin can attribute to a MODEL, right
   * before the failure is rendered (issue #83).
   *
   * Separate from the rendered reply because the caller that hit the refusal is
   * not always the user: compaction reads the failure as a boolean and shows
   * "could not produce a useful summary", so the one fact that explains it (this
   * model refuses `off`) never reaches any surface. This callback is how the
   * card learns it happened. Must not throw: a bookkeeping failure must never
   * replace the upstream's own failure.
   */
  reportRefusal?: (refusal: WorkBuddyRefusalReport) => void
  /**
   * Called before the FIRST attempt of every chat request, so the plugin can
   * point the store at the account the pool's ranking says should serve.
   *
   * It exists because "who serves" and "who to retry with" are the same decision
   * made at two moments: the ranking picks the first account, and after a failure
   * picks the next one. The shim resolves the credential itself right after this
   * returns, so the ranking never has to produce a credential — which keeps
   * token REFRESH in one place (`store.resolve()`) instead of duplicating it on
   * a path that would silently send expired tokens.
   *
   * Absent means the store's own selection always serves.
   */
  prepareAccount?: () => Promise<void>
  /**
   * Called for every attempt that failed upstream, before the next one is tried.
   *
   * Exists so the plugin can RECORD the failure as a measurement. The ranking
   * that picks the serving account reads the pool's STORED measurements, so
   * without this an account that just answered 429 still reads as untested — and
   * the next request picks it again and pays the same failed round trip before
   * failing over.
   *
   * Fired without awaiting: a slow write must never delay the retry the user is
   * waiting on, and the measurement only matters for LATER requests.
   */
  onAccountFailure?: (accountId: string, failure: {
    status: number
    kind: UpstreamErrorKind
    message: string
    /**
     * The model that request asked for (issue #61).
     *
     * Carried because the failure is remembered against the ACCOUNT, and `6004`
     * is an account × model condition: without this the record cannot say which
     * model the measurement belongs to, so the card has to present a
     * single-model result as account-level availability.
     */
    modelId?: string
  }) => void
  /**
   * Called with the FINAL serialized body of every chat request, just before it
   * goes upstream (issue #59).
   *
   * It exists so the plugin can record what was actually sent without the shim
   * having to know where that record goes: the region belongs to whoever wires
   * this up, and the report is a plugin concern. The body handed over is the
   * post-`prepareChatBody` one, because THAT is what the upstream counts.
   *
   * Fired without awaiting: a request must never wait on a diagnostic. The
   * callee must treat the string as read-only.
   */
  onRequestBody?: (bodyJson: string) => void
  /**
   * Called with the token counts the UPSTREAM reported for the request whose
   * body was just handed to {@link onRequestBody} (issue #59).
   *
   * `onRequestBody` records what we SENT; this records what the gateway
   * CHARGED. The issue cannot be settled with only one of them: a difference
   * between two captures is ambiguous until both sides are known, because
   * "the gateway counted the same bytes differently" and "the two bodies were
   * not the same" look identical from the sent side alone.
   *
   * May fire zero times (the upstream reported no `usage`, or the stream was
   * cut before its final frame) or more than once per body (a failover retry
   * reaches a second upstream). The callee is expected to keep the FIRST
   * real measurement, since that is the one the report's line belongs to.
   *
   * Fired without awaiting, and never allowed to fail the request.
   */
  onUpstreamUsage?: (usage: {
    promptTokens?: number
    completionTokens?: number
    cachedTokens?: number
  }) => void
}


/**
 * Pause between failover attempts, after one account's request failed.
 *
 * The upstream's rate limit (6004) fires on request volume — firing retries at
 * zero gap makes every candidate hit the same wall, and 4 accounts can all fail
 * in under a second. The batch test already waits `POOL_BATCH_GAP_MS` (400ms)
 * between accounts for exactly this reason; the failover loop used to wait
 * nothing. 2 seconds is longer than the batch's 400 because a failover retry is
 * a real request the user is waiting on, not a probe — it needs enough room for
 * the upstream's window to breathe, not just enough to avoid self-inflicted
 * rate-limiting.
 */
const FAILOVER_ACCOUNT_GAP_MS = 2_000

/** 换号提醒使用与账号列表相同的名称顺序，缺少名称时显示未命名账号。 */
function describeAccount(credential: WorkBuddyCredential): string {
  return preferredAccountName(credential) || '未命名账号'
}

/**
 * One short phrase for why an account was abandoned, for the in-reply notice.
 *
 * Kept to the distinction the user can act on rather than the internal kind
 * name: "账号被限流" says wait or add an account, "登录已失效" says the sign-in
 * is the problem. The numeric kind would only send them to the log.
 *
 * The wording is what `failoverNoticeText` interpolates into a Chinese sentence,
 * so these are Chinese phrases rather than English ones — the reader of a failed
 * turn in this product reads Chinese, and an English clause inside Chinese prose
 * was the previous build's most visible rough edge.
 */
/**
 * Name the rejected PARAMETER when the upstream refused a reasoning tier, or
 * `undefined` when it is any other failure (issue #83).
 *
 * The compaction path used to surface "Compaction could not produce a useful
 * summary" and nothing else, so a 11133 caused by `reasoning_effort: "off"` was
 * indistinguishable from a model that was simply unavailable — the reporter had
 * to read the raw body to learn that one parameter was at fault. When the body
 * names the offending parameter (`extError.param`) the reply says so; this is a
 * refusal the plugin can explain without guessing, because it is the union of
 * two facts the upstream stated in the response.
 */
/**
 * Turn a failure into a refusal report for {@link WorkBuddyShimOptions.reportRefusal},
 * or `undefined` when it is not a tier refusal worth recording.
 *
 * Only refusals the upstream attributed to a PARAMETER are reported: a plain
 * 500 or a quota error says nothing about `off`, and recording it would pin a
 * "refuses off" badge on a model that never refused anything.
 */
function refusedTierReport(
  failure: WorkBuddyChatResult,
  modelId: string | undefined,
): WorkBuddyRefusalReport | undefined {
  if (failure.ok || failure.kind !== 'client') return undefined
  const param = failure.detail?.rejectedParam
  if (param === undefined || !param.includes('reasoning')) return undefined
  const tier = failure.detail?.rejectedTier
  return {
    param,
    ...tier === undefined ? {} : { tier },
    ...failure.detail?.upstreamCode === undefined ? {} : { code: failure.detail.upstreamCode },
    ...modelId === undefined ? {} : { modelId },
    at: Date.now(),
  }
}

function reasoningTierRefusal(failure: WorkBuddyChatResult): string | undefined {
  if (failure.ok || failure.kind !== 'client') return undefined
  const param = failure.detail?.rejectedParam
  if (param === undefined || !param.includes('reasoning')) return undefined
  const tier = failure.detail?.rejectedTier
  return tier === undefined
    ? `上游拒绝了推理档位参数（${param}）`
    : `上游拒绝了推理档位「${tier}」（${param}）`
}

function failoverReasonText(failure: WorkBuddyChatResult): string {
  // The union is discriminated by `ok`; only a failure carries a kind, and this
  // is only ever called on the failed attempt that triggered a switch.
  if (failure.ok) return '不可用'
  switch (failure.kind) {
    // The 6004 volume limit: the account serves this request again once the
    // stated reset passes.
    case 'soft_rate':
      return '被限流'
    // NOT the same sentence as `soft_rate`, though both leave the pool. The
    // remedy differs in kind: an exhausted account cannot pay for this model AT
    // ALL until it is topped up or its quota cycle rolls over, so "被限流"
    // sends the user to wait for something that will not arrive. Kept
    // failover-worthy — another ACCOUNT may well have credits, which is exactly
    // why the notice has to name the real reason.
    case 'hard_credit':
      return '积分已耗尽'
    case 'model_busy':
      // NOT "被限流": that phrasing is what sent issue #56's reporter to the
      // account pool. The failure belongs to the model, and the notice this
      // text feeds only ever appears when the plugin DID switch accounts — which
      // it no longer does for this kind.
      return '该模型当前繁忙'
    case 'session_dead':
      return '登录已失效'
    case 'policy_reject':
      return '被服务端策略拒绝'
    // An upstream restriction against THIS credential, not the request. It is
    // kept out of `policy_reject`'s copy and its 403 remains failover-worthy:
    // another account can serve, and this one must be benched (issue #127).
    case 'account_restricted':
      return '账号被上游限制使用'
    // The gateway's channel gate: it refuses the PROMPT, not the account or the
    // model. Its own `displayTips` blames "channel verification / an unofficial
    // client", which is what sent issues #87–#90's reporters through account
    // swaps; none of them could help, and saying so is the point of this line.
    case 'channel_reject':
      return '网关渠道校验拦截'
    case 'not_found':
      return '模型不可用'
    case 'server':
      return '上游异常'
    // A request the upstream rejected on its PARAMETERS (issue #78). Deliberately
    // NOT "不可用": the plugin never fails over for this kind, so saying only
    // "unavailable" leaves the reader to guess whether an account or the network
    // is at fault. Neither is — the same body will be refused by every account.
    case 'client':
      return '请求被上游拒绝'
    default:
      // No status code here. The caller already renders `（http N）` for every
      // failure, so embedding it again produced "（http 400）（http 400）" — the
      // duplicate made the one piece of information the reader could search for
      // look like a glitch (issue #78).
      return '不可用'
  }
}

/**
 * One upstream sentence, made safe to paste into a single-line error message.
 *
 * `result.message` carries the WHOLE upstream body — for a classified failure
 * that is a JSON envelope 637–777 characters long whose first 400 characters are
 * the `code`/`requestId`/`extError` skeleton (`param: ""`, `Request: null`). A
 * plain `slice(0, 400)` therefore cut the one actionable sentence in half: the
 * reply ended mid-word at `Pleas` and the reader lost `displayTips` entirely
 * (issue #78).
 *
 * Two rules keep that from happening again:
 * - whitespace collapses to single spaces, because the body is JSON/HTML and its
 *   newlines would otherwise render as a ragged block inside one paragraph;
 * - the cut prefers a sentence boundary once one exists past the halfway point,
 *   so a clipped sentence reads as "truncated" instead of as broken prose, and
 *   the `…` always says the text continues.
 *
 * This is the LAST resort: a body that parsed into a `detail` with `displayMsg`
 * or `tips` never reaches it, and those are short by construction.
 */
function clippedUpstreamText(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  if (collapsed.length <= limit) return collapsed
  const cut = collapsed.slice(0, limit)
  const stop = Math.max(
    cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'),
    cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '),
  )
  if (stop >= Math.floor(limit / 2)) return `${cut.slice(0, stop + 1).trimEnd()}…`
  return `${cut.trimEnd()}…`
}

/**
 * The channel-gate reply's evidence sentence: what the gateway actually read.
 *
 * Read from the HOST's body, not from the prepared one, because the prepared
 * body has the plugin's neutral head in front of every opening it recognises —
 * so the first line it could report is the plugin's own placeholder, which is
 * exactly the false lead issue #98's reporters were given. They were told the
 * gateway had refused `You are a helpful assistant.`, a line that returns 200
 * when sent alone.
 *
 * Each entry is labelled with its ROLE (`system` / `assistant`) because both are
 * scanned and the difference is what tells the reader where to look: an
 * `assistant` entry is a history message, i.e. the session is poisoned and every
 * later turn will fail the same way until that line is changed.
 *
 * Each entry also says whether the plugin's own neutralisation already covers
 * it. An entry marked "not in the plugin's list" is the actionable one: that
 * opening goes on the wire verbatim, so either the host wrote it or the
 * gateway's list grew.
 *
 * Capped at {@link CHANNEL_EVIDENCE_LIMIT} entries: a session can carry dozens
 * of system/assistant messages, and a wall of them would bury the one that
 * matters. The remainder is counted instead of listed.
 */
function channelEvidenceText(bodyJson: string): string {
  const entries = openingEvidenceOfBody(bodyJson)
  if (entries.length === 0) return '请求中未找到可读取的 system 或 assistant 消息。'
  const shown = entries.slice(0, CHANNEL_EVIDENCE_LIMIT)
  const rendered = shown
    .map(entry => {
      const label = entry.neutralized
        ? '（已添加中性提示）'
        : '（首行未匹配已知客户端标识）'
      const span = entry.closing === undefined
        ? `，共 ${entry.textLength} 字`
        : `，结尾为「${entry.closing}」，共 ${entry.textLength} 字`
      return `「${entry.role}：${entry.opening}${span}」${label}`
    })
    .join('、')
  const hidden = entries.length - shown.length
  return `待检查的消息开头：${rendered}${hidden > 0 ? `……另有 ${hidden} 条未列出。` : '。'}`
}

/** How many message openings the channel-gate reply lists. */
const CHANNEL_EVIDENCE_LIMIT = 4

/**
 * The line prepended to an answer that came from a failover account.
 *
 * Block-quoted and bracketed so it reads as machinery rather than as the model's
 * own words, and so a user skimming for the answer can skip it. It states the
 * reason AND the account left behind, because those are the two facts that make
 * an unexpected reply explicable.
 *
 * The wording avoids "switched TO <account>" on purpose: the account that took
 * over is the one the user is about to keep talking to, and naming it invites
 * the reading that they must now manage it. What they need is to know the one
 * they chose did not answer, and why.
 *
 * Chinese, matching the rest of a failed turn's copy: the host renders its own
 * quota sentence in Chinese, the pool rows are Chinese, and an English clause
 * here was the one line of the reply a Chinese reader had to decode.
 */
function failoverNoticeText(from: string, reason: string, to: string): string {
  return `\n\n> [dsh-connect-workbuddy] 「${from}」${reason}，已切换账号[${to}]继续请求\n\n`
}

/** One frame carrying replacement text for a frame whose content was consumed. */
/**
 * Start the loopback endpoint. Requests must carry the shim's shared secret;
 * the loopback bind alone is not a trust boundary.
 */
export function createWorkBuddyShim(options: WorkBuddyShimOptions): WorkBuddyShim {
  const { store, client, catalog } = options
  const logger = options.logger
  const failoverAccount = options.failoverAccount
  const failoverShortfall = options.failoverShortfall
  const reportRefusedTier = options.reportRefusal ?? (() => {})
  const prepareAccount = options.prepareAccount
  const onAccountFailure = options.onAccountFailure
  const onRequestBody = options.onRequestBody
  const onUpstreamUsage = options.onUpstreamUsage
  const channelPerturbation = options.channelPerturbation ?? 'failure'
  /**
   * Whether the harness's injected `user` blocks are moved above the real prompt.
   *
   * OFF by default (issue #132): the reorder changes the message ORDER the
   * upstream counts, so it must be the user's deliberate choice rather than a
   * silent difference after an upgrade.
   */
  const keepPromptLastEnabled = options.keepPromptLast === true
  const extraInjectedPrefixes = Array.isArray(options.extraInjectedPrefixes)
    ? options.extraInjectedPrefixes.filter(entry => typeof entry === 'string' && entry !== '')
    : []
  const sessionTitleOptions = options.sessionTitle ?? {}

  // Per-process shared secret. Lives only in memory; the adapter resolves it
  // as the OpenAI apiKey, which pi-ai sends as `Authorization: Bearer ...`.
  // The shim never forwards it upstream — the real credential comes from the
  // store. A local attacker who can hit the port still cannot forge this.
  const SHARED_SECRET = randomBytes(32).toString('base64url')

  /**
   * Whether this process's prompts have been PROVEN to need the invisible
   * perturbation before the gateway will accept them.
   *
   * WHY THIS EXISTS (measured 2026-10-22). The retry ladder below is
   * discover-by-failing: a request goes out unmodified, is refused with `11128`,
   * and the ladder re-sends a perturbed copy. That is correct the first time and
   * wasteful every time after — the prompt SHAPE that carries a fingerprinted
   * substring does not change between turns of a session, so the plugin was
   * paying one refused request (~209ms measured) on EVERY request, forever.
   *
   * So once the perturbation is what made a request succeed, the next request
   * starts from the perturbed form and skips the doomed first attempt. The
   * saving is one round trip plus one refused request per turn.
   *
   * WHY A PROCESS-LOCAL FLAG AND NOT A CONFIG. The gateway's fingerprint list is
   * a snapshot the upstream can change at any time, in either direction: a rule
   * can be withdrawn as easily as added. A persisted flag would therefore
   * outlive the condition that justified it and could keep perturbing prompts a
   * gateway no longer objects to. In memory it is forgotten at restart, which is
   * the natural expiry for "what this gateway refused recently".
   *
   * AND IT SELF-CORRECTS. If a perturbed body is EVER refused with the channel
   * gate, the flag is cleared and the request falls back to the plain ladder —
   * so a withdrawn rule, or a different model behind the same gateway, cannot
   * leave the plugin stuck sending a shape that no longer helps.
   */
  let channelNeedsPerturbation = false

  /** Constant-time bearer check; absent or mismatched bearers are rejected. */
  function bearerOk(req: IncomingMessage): boolean {
    const header = req.headers.authorization
    if (typeof header !== 'string') return false
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match === null) return false
    const presented = match[1] as string
    const expected = SHARED_SECRET
    const a = Buffer.from(presented)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  const server: Server = createServer((req, res) => {
    void handle(req, res)
  })

  let disposed = false

  // Attached for the LIFE of the shim, not just the first bind. After the port
  // is settled there is no promise left to reject into, and an 'error' event
  // with no listener is an uncaught exception — so this keeps a late failure
  // visible in the log instead of taking the process down.
  //
  // Guarded on `listening` so startup failures are not reported twice: while
  // binding, `ready` already carries the error out through the rejection below,
  // and logging here as well would print the same stack for one failure.
  server.on('error', (error: Error) => {
    if (server.listening) logger?.error('dsh-connect-workbuddy: loopback listener error', error)
  })

  /**
   * Resolves once the listener is up on a port the client can actually reach.
   *
   * The port is settled HERE — `listenOnClientReachablePort` re-rolls while the
   * client refuses the assigned one — so every consumer can keep resolving
   * `baseUrl()` exactly as before, with no invalidation or rebuild step. A
   * genuine bind failure still rejects, the one behaviour the caller relies on.
   */
  const ready = listenOnClientReachablePort({
    server,
    clientRefuses: clientRefusesPort,
    logger,
    cancelled: () => disposed,
  }).catch((error: unknown) => {
    // Re-rolled into the same contract the old `once('error', reject)` had, but
    // logged first: `index.ts` awaits these in a `Promise.all` with no catch of
    // its own, so a bare rejection would be easy to miss in the console.
    logger?.error('dsh-connect-workbuddy: loopback listener failed to start', error)
    throw error
  })

  const baseUrl = (): string => {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('workbuddy shim has no listening address')
    }
    return `http://127.0.0.1:${address.port}`
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!hostIsLoopback(req.headers.host)) {
        writeOpenAIError(res, 403, 'host_not_allowed', 'Host header must name the loopback interface')
        return
      }
      if (!originIsLoopback(req.headers.origin)) {
        writeOpenAIError(res, 403, 'origin_not_allowed', 'Origin must be a loopback origin')
        return
      }
      if (!bearerOk(req)) {
        writeOpenAIError(res, 401, 'unauthorized', 'missing or invalid Authorization bearer')
        return
      }
      const url = req.url ?? '/'
      if (req.method === 'GET' && (url === '/healthz' || url === '/healthz/')) {
        writeJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'GET' && (url === '/v1/models' || url === '/v1/models/')) {
        writeJson(res, 200, {
          object: 'list',
          data: catalog.current().map(model => ({
            id: model.id,
            object: 'model',
            created: 0,
            owned_by: 'workbuddy',
          })),
        })
        return
      }
      if (req.method === 'POST' && (url === '/v1/chat/completions' || url === '/v1/chat/completions/')) {
        await chatCompletions(req, res)
        return
      }
      writeOpenAIError(res, 404, 'not_found', `no such route: ${req.method} ${url}`)
    } catch (error: unknown) {
      if (!res.headersSent) {
        // An over-limit body is the CLIENT's error, not ours (issue #174): 413 is
        // what the protocol says, and a 500 sends the reader looking for a
        // server-side fault that does not exist. `client` is the same kind every
        // other "this request is malformed" answer uses, so nothing upstream of
        // this reads a new class.
        if (error instanceof RequestBodyTooLargeError) {
          writeOpenAIError(res, 413, 'client', error.message, 'request_too_large')
        } else {
          writeOpenAIError(res, 500, 'internal', String(error))
        }
      } else {
        res.end()
      }
    }
  }

  /**
   * Failure classes worth retrying against another account.
   *
   * `client` is deliberately NOT one of them: the upstream rejected the
   * REQUEST (malformed body, unsupported field), so every account answers the
   * same 400 and walking the rest of the pool only multiplies the wait before
   * the user sees an error they must act on anyway.
   *
   * `model_busy` is NOT one of them either, and the distinction is the whole of
   * issue #56. The 14003 throttle belongs to the MODEL — the upstream's own
   * message says so ("switch to a less busy model") and the reporter's
   * measurement confirms it: same credential, same second, other models answer.
   * So a second account does not answer better than the first; it answers the
   * same 14003, one round trip later, and each attempt writes a rate-limited
   * measurement onto an account that was never the problem. The measured outcome
   * was a pool in which every member had been taught a false fact, and a user
   * who could not talk to the model for half an hour.
   *
   * Everything else describes a PER-ACCOUNT condition — a volume limit,
   * exhausted credits, a dead session, a gateway that failed this one call —
   * which another account may well survive.
   */
  function isFailoverWorthy(kind: UpstreamErrorKind): boolean {
    // `channel_reject` joins the two non-failover kinds. The gate matches the
    // OPENING of a system message, and every account sends that same opening, so
    // the next account answers the same 11128 one round trip later — while each
    // attempt burns real quota and records a false statistic against a credential
    // that was never at fault (issues #87–#90 were reported as account problems
    // for exactly this reason).
    //
    // `model_queue` joins them for a different reason: the queue is a fact about
    // the MODEL and the platform-wide line in front of it, not about this
    // credential. The next account is put in the SAME queue with the SAME
    // position, so rotating spends one real request per account to learn nothing.
    // Before it was its own kind a queue fell through to `server`/`soft_rate`
    // (the status it rides on), both of which fail over — so one queued request
    // walked the whole pool before the user was told their position.
    return kind !== 'client' && kind !== 'model_busy' && kind !== 'channel_reject'
      && kind !== 'model_queue'
  }

  async function chatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isJsonContentType(req)) {
      writeOpenAIError(res, 415, 'unsupported_media_type', 'Content-Type must be application/json')
      return
    }
    // Let the plugin point the store at whoever the pool's ranking picks for
    // this request BEFORE resolving. Failure is not fatal: the request then goes
    // to whatever the store already had, which is the user's own account — the
    // same behaviour as a plugin with no pool at all.
    await prepareAccount?.().catch(error => {
      logger?.warn('dsh-connect-workbuddy: pool account selection failed', error)
    })

    let credential
    try {
      credential = await store.resolve()
    } catch (error: unknown) {
      writeOpenAIError(res, 401, 'not_signed_in', String(error))
      return
    }

    const raw = (await readBody(req)).toString('utf8')
    const prepared = rewriteSessionTitleModel(prepareChatBody(raw, {
      keepPromptLast: keepPromptLastEnabled,
      extraInjectedPrefixes,
    }), sessionTitleOptions)
    // The model this request is about, read from the body that goes upstream
    // (issue #61). Read ONCE, so every attempt — the first and each failover
    // retry — is remembered against the same model.
    const requestModelId = modelIdOfBody(prepared)
    // Record WHAT goes upstream (issue #59). Handed the prepared body on purpose:
    // it is the one the upstream counts, and reading it must not change it.
    if (onRequestBody !== undefined) {
      try {
        onRequestBody(prepared)
      } catch (error: unknown) {
        // A diagnostic must never fail a chat request.
        logger?.warn('dsh-connect-workbuddy: body report failed', error)
      }
    }

    const controller = new AbortController()
    // Watch the RESPONSE, not the request.
    //
    // `req.on('close')` cannot express "the client hung up" here: Node emits it
    // as soon as the request STREAM ends — which `readBody` has already done —
    // so a listener attached after the read never fires at all (measured: the
    // signal stayed un-aborted through a real disconnect), and one attached
    // BEFORE the read fires immediately and would abort every request. The
    // response's `close` fires on actual socket teardown instead, which is the
    // event that means the reader is gone: mid-flight it aborts the upstream
    // call, and on a normal completion it arrives after `res.end` and changes
    // nothing.
    res.on('close', () => controller.abort())

    // Retry the SAME prepared body against the pool's other usable accounts,
    // in the plugin's order, until one serves it or none is left.
    //
    // Only failures raised BEFORE the stream starts reach this loop: `!ok`
    // means the upstream answered non-2xx, so not one byte has been written to
    // the client and a retry cannot splice two responses together. A stream
    // that dies MID-flight (the `body.on('error')` path below) is deliberately
    // not retried — the client already received a partial answer, and
    // replaying it would duplicate output the model may already have acted on.
    // The first attempt always uses the store's own resolution, so a token
    // refresh still happens exactly once, before any retry.
    /**
     * The body to send FIRST, which is the perturbed form once this process has
     * proven the gateway demands it, or when the user selected `always`.
     *
     * `perturbChannelFingerprints` is consulted only when the flag is set, so a
     * fresh process still pays the plain attempt — that is what discovers
     * whether the gate is on at all (see `channelNeedsPerturbation`).
     *
     * The perturbed form is a purely additive transform: it inserts zero-width
     * spaces and changes no word the model reads, so starting from it is not a
     * behaviour change, only a saved round trip.
     */
    const startPerturbed = channelPerturbation === 'always' || channelNeedsPerturbation
    const preferred = startPerturbed
      ? perturbChannelFingerprints(prepared, channelPerturbation === 'always') ?? prepared
      : prepared
    let result = await client.chatStream(credential, preferred, controller.signal)
    // A refused PERTURBED body means the rule changed under us: fall back to the
    // plain ladder and let it rediscover what works. Without this the plugin
    // could keep sending a shape that no longer helps, forever. `always` is the
    // user's explicit choice, so it is not cleared by one refusal.
    if (channelNeedsPerturbation && !result.ok && result.kind === 'channel_reject') {
      channelNeedsPerturbation = false
      logger?.warn('dsh-connect-workbuddy: a perturbed body was refused too; clearing the learned preference and retrying from the plain form')
      result = await client.chatStream(credential, prepared, controller.signal)
    }

    /**
     * The retry ladder that does not depend on knowing the fingerprint
     * (issue #98, both halves).
     *
     * The gateway refuses the request for data the plugin cannot see: a list of
     * refused `system`/`assistant` OPENINGS (the plugin holds a measured
     * SNAPSHOT, `UNAPPROVED_CHANNEL_OPENINGS`) and, since 2026-10-21, at least
     * one long substring INSIDE the prompt. Every account and every region
     * sends the same bytes, so without a rescue the only outcome is a dead end
     * the reader cannot get out of.
     *
     * Two rungs, both on the SAME credential (the gate reads the request, not
     * the account, which is why `channel_reject` is not failover-worthy):
     *
     *   1. `forceNeutralHead` — move every scanned opening behind the neutral
     *      head. Measured: whatever the banned opening is, moving it off the
     *      start of the content answers 200.
     *   2. `perturbChannelFingerprints` — insert zero-width spaces at the
     *      sentence boundaries of the scanned messages, which breaks an
     *      exact-substring fingerprint without changing a word the model reads.
     *      This is the rung that rescues the inside-the-prompt fingerprints,
     *      where rung 1 is a no-op.
     *
     * Both return `undefined` when they would change nothing; that is the
     * signal not to spend a request on a body that would be refused identically.
     *
     * Nothing has been written to the client at this point (`!ok` means the
     * upstream answered non-2xx before any stream started), so a retry cannot
     * splice two responses together. The first attempt's failure is NOT booked
     * as an account failure: it was the request that was refused, not the
     * credential.
     */
    let retriedWithForcedHead = false
    let retriedWithPerturbation = false
    let retriedWithDensePerturbation = false
    if (!result.ok && result.kind === 'channel_reject' && !controller.signal.aborted) {
      const forced = forceNeutralHead(prepared)
      if (forced !== undefined) {
        logger?.warn('dsh-connect-workbuddy: the channel gate refused the body; retrying once with the neutral head forced in front of every opening')
        result = await client.chatStream(credential, forced, controller.signal)
        retriedWithForcedHead = true
      }
      if (!result.ok && result.kind === 'channel_reject' && !controller.signal.aborted) {
        const rescued = perturbChannelFingerprints(forced ?? prepared)
        if (rescued !== undefined) {
          logger?.warn('dsh-connect-workbuddy: the channel gate refused the body again; retrying once with an invisible perturbation of the scanned text')
          result = await client.chatStream(credential, rescued, controller.signal)
          retriedWithPerturbation = true
          // THE PERTURBATION IS WHAT WORKED, so remember it: the next request
          // in this process starts perturbed and skips both doomed attempts.
          // Only set on SUCCESS — a perturbation that is also refused teaches
          // nothing about what the gateway wants.
          if (result.ok) channelNeedsPerturbation = true
        }
      }
      // The dense rescue is deliberately last: it is the least byte-conservative
      // form, and the gateway's own wording gives no hint that it would be needed.
      // It exists because both measured rungs are punctuation-dependent and a
      // fingerprinted prose span can contain no punctuation at all.
      if (!result.ok && result.kind === 'channel_reject' && !controller.signal.aborted) {
        const dense = perturbChannelFingerprints(forced ?? prepared, true)
        if (dense !== undefined) {
          logger?.warn('dsh-connect-workbuddy: the channel gate refused the sparse perturbation too; retrying once with a dense word-boundary perturbation')
          result = await client.chatStream(credential, dense, controller.signal)
          retriedWithDensePerturbation = true
          // Dense is the strongest form; remembering it is safe only for the
          // `failure` policy, which exists to learn from a successful rescue.
          if (result.ok && channelPerturbation === 'failure') channelNeedsPerturbation = true
        }
      }
    }

    const triedAccountIds: string[] = []
    /**
     * The account the request STARTED on, and the reason it was abandoned.
     *
     * `??=` on the first switch only: if three accounts fail in a row the user
     * cares that the answer did not come from the one they picked, not with a
     * blow-by-blow list of every candidate that was also rate limited.
     */
    let switchedFrom: string | undefined
    let switchedBecause: string | undefined

    /**
     * Tell the plugin about a failed attempt so it can store the measurement.
     *
     * Every failed attempt is reported exactly once, INCLUDING the last one — an
     * account that failed with nobody left to try it is precisely the one the
     * next request must avoid, so reporting only the attempts that had a
     * successor would miss the case that matters most.
     *
     * Reported after the loop rather than inside it, so the account that broke
     * out of the loop is not also reported by the post-loop call. Not awaited: the
     * user is waiting on the retry, and the write only affects later requests.
     */
    const failures: Array<{ accountId: string, failure: WorkBuddyChatResult }> = []
    const recordAttempt = (credential: WorkBuddyCredential, failure: WorkBuddyChatResult): void => {
      if (failure.ok) return
      failures.push({ accountId: workbuddyAccountId(credential), failure })
    }
    const reportFailures = (): void => {
      // Drain FIRST, unconditionally. A second call (the markup-only retry path
      // reports its own attempts) must never re-report a measurement that was
      // already stored, and every early return below has to consume what it
      // discards — an earlier version cleared this and then iterated the cleared
      // array, which silently reported nothing at all.
      const batch = failures.splice(0, failures.length)
      if (onAccountFailure === undefined) return
      // A client that hung up leaves NO measurement worth keeping.
      //
      // Our own abort surfaces as a transport failure (`status: 0`, `kind:
      // 'server'`), so it is indistinguishable from a dead network where the
      // plugin reads it — and it used to be recorded as `unavailable`, which the
      // pool then treated as a statement about the ACCOUNT. One closed panel
      // could therefore idle a healthy account, and with every member idled the
      // pool had no candidate and failover had nowhere to go.
      //
      // The retry loop already refuses to fail over for an aborted request (see
      // the `controller.signal.aborted` guard below); this is the same rule
      // applied one step later, to the bookkeeping.
      if (controller.signal.aborted) return
      for (const entry of batch) {
        if (entry.failure.ok) continue
        try {
          onAccountFailure(entry.accountId, {
            status: entry.failure.status,
            kind: entry.failure.kind,
            message: entry.failure.message,
            ...requestModelId === undefined ? {} : { modelId: requestModelId },
          })
        } catch (error: unknown) {
          // Reporting is bookkeeping; it must never take down a request.
          logger?.warn('dsh-connect-workbuddy: recording an account failure failed', error)
        }
      }
    }

    while (!result.ok && isFailoverWorthy(result.kind) && failoverAccount !== undefined) {
      // A client that hung up is not waiting for a better account.
      if (controller.signal.aborted) break
      recordAttempt(credential, result)
      triedAccountIds.push(workbuddyAccountId(credential))
      const next = await failoverAccount(triedAccountIds).catch(() => undefined)
      if (next === undefined) break
      // The policy is expected to skip what was already tried, and the shim does
      // not rely on it: a candidate that repeats one of them would re-send the
      // same request to the same account forever, spending real quota in a loop
      // with no upper bound. `triedAccountIds` is the only brake there is, so
      // the identity check lives here as well as in the policy.
      if (triedAccountIds.includes(workbuddyAccountId(next))) break
      // Wait before hitting another account: the upstream's rate limit (6004)
      // fires on request volume, so hammering it with zero-gap retries makes
      // every candidate hit the same wall — 4 accounts can fail in under a
      // second. The batch test already waits 400ms between accounts for exactly
      // this reason; the failover loop used to wait nothing. The wait is
      // abortable: if the client hung up we stop instead of sleeping on, and the
      // check AFTER it ends the loop rather than spending the remaining accounts
      // on requests whose signal is already dead.
      if (controller.signal.aborted) break
      await new Promise<void>(resolve => {
        if (controller.signal.aborted) return resolve()
        const timer = setTimeout(resolve, FAILOVER_ACCOUNT_GAP_MS)
        controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
      })
      if (controller.signal.aborted) break
      logger?.warn(
        `dsh-connect-workbuddy: retrying chat on another pool account after ${result.kind} (http ${result.status})`,
      )
      // Remember WHY the switch happened and FROM which account, so the answer
      // can carry one line saying so. Recorded here rather than only logged: the
      // log is invisible to the person reading the reply, and a silent failover
      // is indistinguishable from the account they chose having answered.
      switchedFrom ??= describeAccount(credential)
      switchedBecause ??= failoverReasonText(result)
      credential = next
      result = await client.chatStream(credential, prepared, controller.signal)
    }
    // The final attempt's failure — recorded only if the loop did not already
    // record it (it does not: the loop records each attempt as it starts the
    // next one, and the last attempt has no next).
    if (failures.length === 0 || failures[failures.length - 1]?.accountId !== workbuddyAccountId(credential)) {
      recordAttempt(credential, result)
    }
    reportFailures()

    if (!result.ok) {
      // Say how many accounts were tried when more than one was: without it, a
      // pool that failed over and still lost reads exactly like the single
      // account the user selected failing, and the user cannot tell whether the
      // fallbacks were even attempted.
      //
      // `triedAccountIds` already holds every account that SERVED an attempt —
      // the loop pushes each one before asking for the next — so its length IS
      // the attempt count. Adding one here reported a phantom extra account.
      const attempts = triedAccountIds.length
      const note = attempts > 1 ? `（已尝试 ${attempts} 个账号）` : ''
      // WHY THERE WAS NOWHERE ELSE TO GO. Asked only when the request actually
      // failed, so the success path never pays for it, and only when a POOL
      // SEARCH really ran — which is a different question from whether the host
      // wired the callback (issue #78).
      //
      // The old test was the callback's mere presence, so every host got "池中
      // 没有其他可用账号" on every generic failure, including a plain 400 that
      // `isFailoverWorthy` excludes: the shim had not asked the pool anything,
      // yet the reply described the pool's answer as "nowhere left". Asking also
      // costs the pool a ranking pass, so a search that cannot have happened must
      // not trigger one.
      //
      // A rejected callback must not replace the real upstream failure with a
      // bookkeeping one, so a throw degrades to "no explanation" — the reply the
      // user gets is then exactly the one this option was added to improve, not
      // a worse one.
      const poolSearched =
        failoverShortfall !== undefined && failoverAccount !== undefined && isFailoverWorthy(result.kind)
      const shortfall = poolSearched ? await failoverShortfall().catch(() => undefined) : undefined
      const why = shortfall === undefined ? '' : `：${shortfall}`
      // Emit what the reply is about to say BEFORE the branches, so the model
      // card can show "this model was refused on `off`" even when the caller
      // (compaction, for one) swallows the reply text (issue #83).
      const refusedReport = refusedTierReport(result, requestModelId)
      if (refusedReport !== undefined) reportRefusedTier(refusedReport)
      // A QUEUE CONDITION IS NOT A FAILURE OF THE REQUEST. The upstream accepted
      // the call and stated where it stands in line — `6020` (waiting),
      // `6021` (queue full), `6022` (this user already holds the maximum). The
      // app answers that with a banner and a poll, never with "请求失败"; so does
      // this path, using the app's own vocabulary ("排队中 / 第 N 位") rather than
      // the raw envelope. See `src/queue.ts`.
      //
      // The KIND is what selects this branch, not a second body parse: a queue is
      // now classified as its own kind in `classifyUpstreamError`, which is also
      // what keeps it OUT of the failover loop (see `isFailoverWorthy`). Reading
      // the body again here is only to get the position and the size.
      //
      // 429 keeps the host's bounded in-place retry available: for `6020` a
      // retry is exactly the right next move (the queue is moving), and for
      // `6021`/`6022` the sentence says what to do instead of queueing.
      const queue = result.kind === 'model_queue' ? parseQueueAnswer(result.message) : undefined
      if (queue !== undefined) {
        writeOpenAIError(
          res,
          429,
          'model_queue',
          `${queueNoticeText(queue)}（上游 code ${queue.code}）${note}`,
          undefined,
          NO_RETRY_HEADERS,
        )
        return
      }
      if (result.kind === 'account_restricted') {
        // The upstream names the CREDENTIAL, not the request: 11140 + 「账号存在
        // 异常行为，已被限制使用」. Another account can serve, so this class is
        // failover-worthy and the pool records it as a measurement (issue #127).
        //
        // TWO CLAIMS THIS SENTENCE USED TO MAKE, BOTH FALSE (review #127):
        //  · 「重新登录」lifts it — it does not. The pool's account id is the
        //    sha256 of `uin`/`uid` (`auth.ts`), so a re-login produces the SAME id
        //    and the stored measurement still applies; nothing clears it. The
        //    restriction is the upstream's verdict about the account, which a new
        //    token on this machine cannot answer.
        //  · the upstream's `displayTips` is advice for THIS failure — it is not
        //    necessarily. The `11128` family is measured sharing ONE misleading
        //    `displayTips` across three different gates, so a tips string on a
        //    `11140` body is the same genre of boilerplate, and relaying it under
        //    「上游提示：」 would tell a benched account to go edit its prompt.
        const detail = result.detail
        const meta: string[] = ['账号被上游限制使用']
        if (detail?.upstreamCode !== undefined) meta.push(`code ${detail.upstreamCode}`)
        if (detail?.requestId !== undefined) meta.push(`requestId ${detail.requestId}`)
        const lead = detail?.displayMsg ?? clippedUpstreamText(result.message, 200)
        const message =
          `${lead}（${meta.join('，')}）${note}${why}。该账号已被 WorkBuddy 限制使用。`
          + '插件已记录限制状态，并尝试使用其他可用账号。'
          + '请联系 WorkBuddy 官方处理账号限制。'
          + '解除后，在设置中点击该账号的「测试」按钮，恢复账号池使用资格。'
        writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, message, hostErrorCode(result.kind))
        return
      }
      if (result.kind === 'policy_reject') {
        // A content-policy refusal is the one upstream failure whose own words
        // the user needs: the server tells them WHAT to change ("内容未通过安全
        // 审核，请调整后重试"), and the requestId is the handle support asks for.
        // The generic line below would bury both inside a truncated raw JSON
        // body, leaving the user to guess — and, because the status reads as a
        // client error, to try signing in again, which cannot help.
        //
        // `code` stays `policy_reject` rather than the upstream's numeric 11140:
        // the host routes on a stable machine-readable class, and `11140` is not
        // one it knows. Under 403 it already falls outside the retry set, so the
        // request is neither retried in place nor reported as an auth failure.
        const detail = result.detail
        // Same LAST-resort clipping as the generic path: a body that parsed
        // never reaches it, and one that did not must not end mid-word.
        const lead = detail?.displayMsg ?? clippedUpstreamText(result.message, 200)
        const meta = ['服务端策略拒绝']
        if (detail?.upstreamCode !== undefined) meta.push(`code ${detail.upstreamCode}`)
        if (detail?.requestId !== undefined) meta.push(`requestId ${detail.requestId}`)
        const message =
          // 「重新登录不会解决」was stated flatly, but `11140` is now known to hold
          // TWO meanings and the restriction half IS answered by re-authenticating
          // upstream. The matcher for that half is a sentence in the localized
          // fields, so when it misses, this reply would push the user away from the
          // one remedy that works — hence the hedge.
          `${lead}（${meta.join('，')}）${note}。请求被 WorkBuddy 服务端策略拒绝。` +
          '请按服务端提示调整内容，或在 WorkBuddy 桌面端使用同一账号核查。' +
          '涉及账号限制时，请联系 WorkBuddy 官方处理。'
        writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, message, hostErrorCode(result.kind))
        return
      }
      if (result.kind === 'model_busy') {
        // The upstream's own advice, made actionable.
        //
        // A 14003 is not the user's account being limited, and saying so would
        // send them to fix something that is not broken (add accounts, wait half
        // an hour, re-sign-in). The upstream already says what is wrong and what
        // to do — "建议等待约 1 分钟后重试，或切换到负载较低的模型" — so the reply
        // says it too, and the plugin deliberately does NOT switch accounts on
        // this failure: every account shares the model, so a retry elsewhere
        // would spend a request to be told the same thing (issue #56).
        //
        // The reply reaches the user only after the HOST's bounded in-place
        // retry is spent, because `code: model_busy` now classifies as
        // `RATE_LIMIT` (issue #84 — see KIND_HOST_CODE). The sentence says so,
        // otherwise the user reads "wait a minute" about a request that was
        // already retried five times and concludes the plugin did nothing.
        const detail = result.detail
        // Same LAST-resort clipping as the generic path: a body that parsed
        // never reaches it, and one that did not must not end mid-word.
        const lead = detail?.displayMsg ?? clippedUpstreamText(result.message, 200)
        const meta = ['模型当前负载较高']
        if (detail?.upstreamCode !== undefined) meta.push(`code ${detail.upstreamCode}`)
        if (detail?.requestId !== undefined) meta.push(`requestId ${detail.requestId}`)
        const message =
          `${lead}（${meta.join('，')}）${note}。模型当前繁忙。` +
          '请等待约 1 分钟，或切换到负载较低的模型。' +
          'DSH 会按重试设置自动重试此类请求。'
        writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, message, hostErrorCode(result.kind))
        return
      }
      if (result.kind === 'channel_reject') {
        // The one failure where the evidence lives in the REQUEST we just sent,
        // not in the upstream's reply. `displayTips` blames "channel verification
        // / a non-official client", which is what sent issues #87–#98's
        // reporters to try other accounts, other regions and even the official
        // client — none of which can change a byte of the request.
        //
        // TWO corrections to what this branch used to do, both measured on the
        // live CN gateway on 2026-10-21:
        //
        //   1. The gate scans `system` AND `assistant` messages, at the START
        //      of each content (or of every text part). A history message that
        //      opens with a refused identity poisons the WHOLE session: every
        //      later request is refused, and "another session on the same
        //      account works" is exactly what that looks like from outside.
        //   2. The old excerpt was read from `prepared` — the bytes after the
        //      plugin's own neutralising prepend — so the first line it could
        //      report was the plugin's placeholder `You are a helpful
        //      assistant.`, and issue #98's reporters were told that the
        //      gateway had refused the plugin's own head.
        //
        // So the excerpt is read from `raw`, the body the HOST sent, and every
        // opening is labelled with its role and with whether the plugin already
        // covers it. Nothing is claimed about WHICH line the gateway matched:
        // the upstream never says, and pretending to know is what misdirected
        // the readers of issues #87–#98.
        const detail = result.detail
        const meta: string[] = []
        if (detail?.upstreamCode !== undefined) meta.push(`code ${detail.upstreamCode}`)
        if (detail?.requestId !== undefined) meta.push(`requestId ${detail.requestId}`)
        const stamp = meta.length === 0 ? '' : `（${meta.join('，')}）`
        const evidence = channelEvidenceText(raw)
        const retries: string[] = []
        if (retriedWithForcedHead) retries.push('添加中性提示')
        if (retriedWithPerturbation) retries.push('一次不可见字符处理')
        if (retriedWithDensePerturbation) retries.push('一次密集不可见字符处理')
        const retryNote = retries.length === 0 ? '' : `；重试处理：${retries.join('、')}`
        // ISSUE #113: WHICH MEMBER of the `11128` family this is, decided by the
        // plugin's OWN evidence rather than by the upstream's `msg` — which
        // issue #113 measured to misreport a content refusal as
        // `conversation id missing`. The member decides the ADVICE: a header
        // problem is the user's to check, a prompt problem is the plugin's to
        // keep working on, and an unrecognised one is honestly named as such
        // rather than guessed at.
        const member = channelGateMemberOf(result.message, requestEvidenceOf(prepared))
        // `detail.msg` is the upstream's own sentence, quoted verbatim so a
        // reporter and support read the same words. It is echoed for the
        // members the plugin can DISPROVE as well, because "what arrived" and
        // "why it cannot be true" are two different facts and the reader needs
        // both: without the echo they cannot tell what they are up against.
        const said = detail?.rawMsg ?? detail?.displayMsg
        const echo = said === undefined ? '' : `服务端提示：「${said}」，`
        // A `prompt` member whose body NAMES another gate is the misreport
        // issue #113 measured: the wording points at a header or a shape
        // problem, but the plugin's own request disproves it, so the refusal
        // is about the content. Saying that explicitly is the difference
        // between "the gateway wants your headers fixed" (wrong, unfixable)
        // and "the gateway is fingerprinting what you sent" (right, and the
        // plugin has just retried for it).
        const memberNote = member === 'headers'
          ? `${echo}请求已包含 X-Conversation-ID、X-Request-ID 和 X-Message-ID，请核查网关校验要求。`
          : member === 'first_message'
            ? `${echo}请求首条消息为 system，请核查网关校验要求。`
            : member === 'prompt'
              ? (isConversationIdGateBody(result.message)
                  ? `${echo}请求已包含 X-Conversation-ID、X-Request-ID 和 X-Message-ID，当前按请求内容拦截处理。`
                  : isFirstMessageGateBody(result.message)
                    ? `${echo}请求首条消息为 system，当前按请求内容拦截处理。`
                    : '')
              : `${echo}请求未通过渠道校验，请凭请求标识联系 WorkBuddy 客服。`
        // Same `workbuddy 上游失败：…（http N）` frame as every other failure, on
        // purpose: reporters paste this sentence into issues verbatim, so the
        // shape they search for must not change just because the diagnosis did.
        const message =
          `workbuddy 上游失败：${failoverReasonText(result)}（http ${result.status}）${note}${stamp}。${memberNote}${evidence}` +
          'WorkBuddy 网关会检查 system 和 assistant 消息的开头及正文。' +
          '插件已处理已知客户端标识' + retryNote +
          (retriedWithForcedHead ? '；本次重试已为所有被检查的消息添加中性提示，请求再次被拒绝' : '') +
          '。首行标记用于说明首次请求的匹配情况；检查原因时还需核对消息正文。反馈时请附上完整报错和请求标识。'
        writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, message, hostErrorCode(result.kind))
        return
      }
      // The generic path, and the one a quota failure takes. It now names WHY
      // every account was refused (the pool's own verdict, from
      // `failoverShortfall`) and points at the model as the remaining move.
      //
      // "换一个模型" is the honest advice rather than a suggestion to add
      // accounts: the pool has just searched every member, so the user's next
      // action should be the one the search could not take for them. Saying only
      // "the request failed" left them to guess between four remedies, three of
      // which the plugin had already ruled out.
      //
      // The BODY of the sentence is now the upstream's own advice, in this order
      // of preference (issue #78):
      //   1. `detail.tips` — what to do about it ("请新建任务、换个模型或稍后重试");
      //   2. `detail.displayMsg` — what was rejected, when no tips came;
      //   3. the raw body, clipped — only for a body that did not parse.
      // The old code spliced `message.slice(0, 400)` unconditionally, which for a
      // JSON envelope is the code/requestId/extError skeleton: the actionable
      // sentence always fell past the cut and the reply stopped mid-word.
      //
      // `code`/`requestId` survive as a compact parenthetical: they are exactly
      // what support asks for, and they used to be reachable only by reading the
      // chopped-up JSON.
      const detail = result.detail
      const meta: string[] = []
      if (detail?.upstreamCode !== undefined) meta.push(`code ${detail.upstreamCode}`)
      if (detail?.requestId !== undefined) meta.push(`requestId ${detail.requestId}`)
      const stamp = meta.length === 0 ? '' : `（${meta.join('，')}）`
      // An `off`-tier refusal is the one parameter rejection this plugin can name
      // itself (issue #83), and the reader cannot act on the generic sentence:
      // the remedy is unticking one checkbox, not "adjust the request".
      const refusedTier = reasoningTierRefusal(result)
      const receipt = refusedTier
        ?? detail?.tips
        ?? detail?.displayMsg
        ?? clippedUpstreamText(result.message, 400)
      // A `client` failure is the one class the pool never searched (issue #78),
      // so the advice must not imply an account problem at all: the same request
      // is refused by every account, and the fix is in the request or the model.
      // The pool sentence is emitted only when a search really produced a verdict.
      const advice = refusedTier !== undefined
        ? '该模型拒绝 off 推理档位。请在模型设置中取消「可关闭思考」后重试'
        : result.kind === 'client'
          ? '请求参数被拒绝，请按服务端提示调整后重试'
          : shortfall === undefined
            ? ''
            : '请切换模型，或等待账号额度恢复'
      // `displayTips` and most `msg` bodies already end in a full stop, so gluing
      // an advice sentence on would read "。。" — the upstream's sentence is left
      // exactly as it arrived, minus that final stop, and the join supplies one.
      //
      // The receipt is `displayTips`, and that paragraph is the same
      // "possibly not an official client" sentence for every member of the
      // `11128` family — quoting it as the actionable part is what made these
      // reports cycle through account and region swaps. The channel_reject
      // branch above therefore owns the whole reply for this family, and by the
      // time control reaches here the body is not that family at all.
      // ISSUE #101: the host recognises a context overflow by matching the error
      // text against ~25 ENGLISH patterns, and the gateway's own sentence for
      // `11115` is Chinese with no numbers — so it matched nothing, the host's
      // compaction rescue never ran, and the user got a bare 400 whose advice
      // ("请精简内容") the host could not act on. The English clause goes FIRST so
      // a detector reading the head of the message sees it, and the upstream's
      // own sentence stays right after it so the human still gets the real advice.
      const overflow = isContextTooLongBody(result.message)
        ? `${CONTEXT_OVERFLOW_MARKER}。`
        : ''
      const body = `${overflow}${advice === '' ? receipt : `${receipt.replace(/[。.]$/u, '')}。${advice}`}`
      writeOpenAIError(
        res,
        KIND_STATUS[result.kind],
        result.kind,
        `workbuddy 上游失败：${failoverReasonText(result)}（http ${result.status}）${note}${why}${stamp}。${body}`,
        hostErrorCode(result.kind),
      )
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // Gate 3 reads the request's own declarations. `prepareChatBody` already
    // deleted `tools` for a `tool_choice: "none"` request, so "nothing was
    // declared" arrives here as `undefined` rather than as a rule to remember.
    const declared = declaredTools(prepared)
    const gate: RecoveryGate | undefined = declared === undefined ? undefined : {
      declaredNames: declared.names,
      requiredParameters: declared.requiredParameters,
      acceptedParameters: declared.acceptedParameters,
      // The name-less invoke (session-333b5f2d) is recovered from the model's
      // own parameter tags against these schemas — see `inferFromSchema`.
      inferFromSchema: true,
      // Issue #152: a DECLARED name one edit away from exactly one offered tool
      // (`pwdsh` for `pwsh`) is read as that tool instead of falling back to
      // plain text. Same rule as above — only ever a name already on offer.
      repairNearMissName: true,
      ...declared.pinnedToolName === undefined ? {} : { pinnedToolName: declared.pinnedToolName },
    }

    // The notice travels with the STREAM, not with this function: only the
    // stream knows whether any content actually reaches the client, and a
    // retry that ended in an error response leaves nothing to prefix.
    const notice = switchedFrom === undefined || switchedBecause === undefined
      ? undefined
      : failoverNoticeText(switchedFrom, switchedBecause, describeAccount(credential))
    const writer = new RecoveryStream(res, gate, logger, notice, onUpstreamUsage)
    writer.creditAccount = workbuddyAccountId(credential)
    await writer.consume(result.response.body)

    // The one outcome that can only be recognised AFTER the stream: the turn
    // wrote markup and nothing else, so there was never any answer to show.
    // Retrying is safe here for exactly one reason — nothing has been written,
    // because a turn that is still only markup is still being held. That is why
    // the hold exists, and why an ordinary answer never pays for it.
    if (gate !== undefined && !writer.delivered && writer.residueSeen && !controller.signal.aborted) {
      logger?.warn('dsh-connect-workbuddy: the turn produced DSML markup only; retrying it once')
      const retryTried = [...triedAccountIds, workbuddyAccountId(credential)]
      let retryCredential = credential
      for (;;) {
        const attempt = await client.chatStream(retryCredential, prepared, controller.signal)
        if (attempt.ok) {
          // The first attempt's held bytes are dropped, not shown: showing them
          // and then the retry would be the two-answers-spliced-together failure
          // the failover loop refuses to risk.
          writer.discard()
          const retried = new RecoveryStream(res, gate, logger)
          retried.creditAccount = workbuddyAccountId(retryCredential)
          await retried.consume(attempt.response.body)
          retried.finish()
          reportFailures()
          return
        }
        recordAttempt(retryCredential, attempt)
        if (!isFailoverWorthy(attempt.kind) || failoverAccount === undefined) break
        if (controller.signal.aborted) break
        const next = await failoverAccount(retryTried).catch(() => undefined)
        if (next === undefined) break
        if (retryTried.includes(workbuddyAccountId(next))) break
        retryTried.push(workbuddyAccountId(next))
        retryCredential = next
      }
      // Nobody could be made to answer: fall back to showing what actually
      // arrived, which is the honest outcome and loses no text.
      logger?.warn('dsh-connect-workbuddy: markup-only retry did not start; showing the original text')
    }

    writer.finish()
    reportFailures()
  }

  return {
    ready,
    baseUrl,
    token: () => SHARED_SECRET,
    close: () => new Promise<void>(resolve => {
      disposed = true
      // `disposed` above is what actually stops a re-roll in flight; this call
      // is for the ordinary case of a listener that is up.
      //
      // The callback is not assumed to fire only when listening: measured on
      // Node 24, it fires in every state, reporting `ERR_SERVER_NOT_RUNNING`
      // when the listener is down — which is exactly the state a dispose can
      // land in, between a `close()` and the next `listen()` of a re-roll. So
      // the callback alone settles this, and the error argument is ignored on
      // purpose: "already down" is a satisfied precondition, not a failure.
      server.close(() => resolve())
      server.closeAllConnections()
    }),
  }
}
