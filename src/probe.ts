/**
 * The real-volume model probe: what it sends, what an answer means, and
 * what (if anything) can honestly be said about a cooldown.
 *
 * 参考：本仓库 `src/upstream.ts` 的错误分类（`classifyUpstreamError` 的中英文额度
 *   标记、`soft_rate` / `hard_credit` 两态）被直接复用，不另起一套判定。
 * 改动：把「一次探测请求」的构造与解读单独成模块，因为卡片和 DSH 路由两边
 *   共用这些规则，并通过单元测试验证以下三项实测结论：
 *
 *   1. **首条消息必须是 system。** 国际网关（`www.workbuddy.ai`）对
 *      `[{role:'user'}]` 一律返回 HTTP 400 / 业务码 11128
 *      (`first message is not system prompt`)。按国内版那样只发一条 user 消息
 *      去探测，会把**整个国际版误报成全部不可用**。所以探测请求总是带一条
 *      system 消息，两个网关都接受。
 *   2. **上游把限流恢复时间写在响应体里，不在响应头里。** 实测 200 响应头里没有
 *      `Retry-After`，也没有 `X-RateLimit-*`；但**被限流的 429 响应体里明确写着**
 *      `{"code":6004,"msg":"您的使用量已超出频率限制，将在 2026-09-30 02:30:30
 *      UTC+8 重置，…"}`。只看响应头就会得出「上游不给数据」的错误结论，卡片于是
 *      显示「上游未给出何时恢复」，而时间其实就在眼前。因此
 *      {@link parseUpstreamResetAt} 从响应体解析，{@link cooldownOf} 只在三处都
 *      没有时间信息时返回「上游未给出」，不生成倒计时。
 *   3. **限流按请求体积触发。** 实测中小请求可用时，长会话请求仍可能因体积较大
 *      被拒绝，从而出现测试通过但实际请求受限的情况。因此探测请求的体积接近实际使用，
 *      见 {@link DEFAULT_PROBE_INPUT_TOKENS} 的实测表。
 *
 * @module dsh-connect-workbuddy/probe
 */

import type { WorkBuddyCredential } from './auth.ts'
import { classifyUpstreamError } from './upstream.ts'

/**
 * 模型返回 14003 且没有给出恢复时间时，采用两分钟的本地等待。
 * 上游提示约一分钟后重试；此处多留一分钟，减少再次遇到短时拥堵的机会。
 * 该值仅决定何时允许重试，不能保证模型到时恢复。
 */
export const MODEL_BUSY_COOLDOWN_MS = 2 * 60_000

/**
 * The system message every probe carries.
 *
 * Not decoration: the international gateway rejects a conversation that does not
 * start with a system message (see the module note). A probe that omitted it
 * would report every global model as broken.
 */
export const PROBE_SYSTEM_PROMPT = 'You are a connectivity check. Reply with a single word.'

/**
 * Output cap for a probe. One token is enough to prove the model answers.
 *
 * This caps requested output while the filler determines input size. Actual
 * usage and billing remain subject to the upstream response and pricing.
 */
export const PROBE_MAX_TOKENS = 1

/**
 * How much input a probe sends, in tokens.
 *
 * This is the whole point of the probe, and it is NOT a free choice. The
 * upstream's rate limit (business code 6004) fires on request SIZE, measured on
 * 2026-09-29 by varying only the input against one account and one model:
 *
 *   | input     | prompt_tokens the upstream counted | result |
 *   | ---       | ---                                | ---    |
 *   | ~10       | 38                                 | ok     |
 *   | ~1,000    | 1,138                              | ok     |
 *   | ~10,000   | 11,138                             | ok     |
 *   | ~18,000   | 20,018                             | ok     |
 *   | ~25,000   | 25,023                             | ok     |
 *   | ~30,000   | ~32k                               | **429 / 6004** |
 *
 * In this sample, a larger request failed after smaller requests succeeded.
 * The observation does not isolate cumulative use or establish a universal
 * threshold. Two sampled accounts reported different reset times.
 *
 * A probe that sent a handful of tokens answered "usable" while every real
 * request in a long conversation was refused — the probe was asking too small a
 * question. 25k is sized to be a realistic long-conversation payload.
 *
 * Renamed from `PROBE_INPUT_TOKENS` to say what it now IS: the DEFAULT, not the
 * only possible size. The size is a property of the user's own traffic (see
 * {@link probeRequestBody}), so it became a setting; this constant is what an
 * unset setting, an older profile, and every existing test mean by "a probe".
 */
export const DEFAULT_PROBE_INPUT_TOKENS = 25_000

/**
 * The probe sizes the card offers, in tokens.
 *
 * A closed set, each step a meaningful position relative to the measured 20k~30k
 * threshold: below it (10k/20k) samples shorter requests and
 * is the cheap choice; at it (30k) is the size that finally covers the whole
 * measured window; above it (50k/100k) is for conversations that routinely run
 * long, where a smaller probe would report "usable" for an account that refuses
 * the very next message.
 *
 * Exported so the schema's description, the card's dropdown, and the coercion
 * below cannot drift apart into three different menus.
 */
export const PROBE_INPUT_TOKEN_CHOICES: readonly number[] = [10_000, 20_000, 30_000, 50_000, 100_000]

/**
 * A requested probe size reduced to a size this build will actually send.
 *
 * Anything outside {@link PROBE_INPUT_TOKEN_CHOICES} — `undefined` from an older
 * profile, `0` from an unset field, a hand-edited odd number — becomes the
 * measured default. Coercing rather than rejecting keeps a hand-edited profile
 * working instead of turning one odd value into a failed test batch.
 */
export function resolveProbeInputTokens(requested: number | undefined): number {
  return requested !== undefined && PROBE_INPUT_TOKEN_CHOICES.includes(requested)
    ? requested
    : DEFAULT_PROBE_INPUT_TOKENS
}

/**
 * Characters per token for the filler text, measured.
 *
 * Filling with a fixed English sentence, the upstream counted about 4.5
 * characters per token. An estimate rather than a bundled tokenizer: the body
 * approximates a size class. Tokenizer differences can affect whether the
 * request reaches a size-sensitive limit.
 */
const CHARS_PER_TOKEN = 4.5

/** Neutral filler; carries no user content, only volume. */
const FILLER_LINE = 'The quick brown fox jumps over the lazy dog. '

/**
 * Build the request body for one probe.
 *
 * `stream` is forced because the upstream rejects non-streaming chat requests;
 * `prepareChatBody` enforces that too, but sending it explicitly keeps this
 * function's output valid on its own.
 *
 * Measured on the built artifact at the DEFAULT size: 112,713 bytes of body, and
 * the upstream counted `prompt_tokens: 25023` at a cost of `credit: 0.72`. The
 * filler bytes scale with the chosen size. Reported credit depends on the
 * selected model and upstream pricing; this sample does not establish linear
 * billing or guarantee that a later conversation will succeed.
 */
export function probeRequestBody(modelId: string, inputTokens: number = DEFAULT_PROBE_INPUT_TOKENS): string {
  const targetChars = Math.ceil(resolveProbeInputTokens(inputTokens) * CHARS_PER_TOKEN)
  const filler = FILLER_LINE.repeat(Math.ceil(targetChars / FILLER_LINE.length))
  return JSON.stringify({
    model: modelId,
    messages: [
      { role: 'system', content: PROBE_SYSTEM_PROMPT },
      { role: 'user', content: `${filler}Reply with a single word.` },
    ],
    max_tokens: PROBE_MAX_TOKENS,
    stream: true,
  })
}

/**
 * How one probe ended.
 *
 * `rate-limited` is split out from a generic failure because it is the one
 * outcome the feature exists for: it means "this model works, but not right
 * now". Everything else is a real, actionable failure or a success.
 *
 * `model-busy` is a second such split, and it is NOT cosmetic — see
 * {@link MODEL_BUSY_COOLDOWN_MS} and `exclusionOf`. A 14003 is treated as
 * model congestion; it does not establish that every account or region is
 * affected. A 6004 is treated as an account rate limit. Reporting both as `rate-limited` made the pool bench every account for
 * the cooldown of one, which is the outage issue #56 describes.
 *
 * `channel-rejected` is a third split, and it is the one that answers the
 * question the probe itself raises: the probe's own system prompt is a neutral
 * one-liner, so it can return `ok` on a model whose real chat requests are all
 * refused with `11128`. Filing that as `failed` (the generic bucket) made the
 * pair "test passes, chat fails, every account" look like a flaky upstream
 * instead of what it is — the gateway objecting to the PROMPT, not the account
 * (issues #87–#90).
 */
export type WorkBuddyProbeOutcome =
  | 'ok'
  | 'rate-limited'
  | 'model-busy'
  | 'out-of-credit'
  | 'credential-rejected'
  | 'policy-rejected'
  /**
   * The upstream restricted this credential for unusual activity (issue #127).
   *
   * Split from `policy-rejected` because the pool's response differs: this is
   * an account-level exclusion, while a content-policy refusal is about the
   * request and must not teach the pool that the credential is unusable.
   */
  | 'account-restricted'
  | 'channel-rejected'
  | 'unavailable'
  | 'not-found'
  | 'failed'

/**
 * One probe result, as the card renders it.
 *
 * `retryAtMs` can come from an upstream header or message, a known quota reset,
 * or the local model-busy waiting period. `retrySource` distinguishes these
 * cases. A retry time allows another attempt; it does not promise recovery.
 */
export interface WorkBuddyProbeResult {
  modelId: string
  outcome: WorkBuddyProbeOutcome
  /** Round-trip time in ms, for a successful probe. */
  elapsedMs?: number
  /** Observed HTTP status; 0 means no HTTP response was observed. */
  status?: number
  /** Upstream's own words, redacted. Present on failures. */
  message?: string
  /** A time the upstream named, in ms. Absent when it named none. */
  retryAtMs?: number
  /**
   * Where a supplied `retryAtMs` came from, so the card can say so.
   *
   * `upstream-tips` is the odd one and it says exactly what it is: the upstream
   * stated a MAGNITUDE in prose ("wait about a minute") rather than a timestamp,
   * and this build turned it into {@link MODEL_BUSY_COOLDOWN_MS}. Naming it
   * separately keeps the card honest — the other three sources are the upstream
   * giving a time, this one is the upstream giving an order of magnitude.
   */
  retrySource?: 'retry-after' | 'upstream-message' | 'quota-refresh' | 'upstream-tips'
}

/**
 * Parse a `Retry-After` header value into an absolute time.
 *
 * Both RFC 9110 forms are accepted: delay-seconds (`120`) and an HTTP-date
 * (`Wed, 21 Oct 2026 07:28:00 GMT`). Returns undefined for anything else,
 * including the negative/zero delays some gateways emit — a "retry now" is not
 * a cooldown and reporting it as one would be worse than saying nothing.
 *
 * `nowMs` is injected so the delay-seconds branch is testable without a clock.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (/^\d+$/u.test(trimmed)) {
    const seconds = Number(trimmed)
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined
    return nowMs + seconds * 1_000
  }
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return undefined
  // An HTTP-date already in the past is not a cooldown either.
  if (parsed <= nowMs) return undefined
  return parsed
}

/**
 * The `<timestamp> UTC±N` core of the upstream's reset sentence.
 *
 * Shared by both spellings below so the two can never drift into accepting
 * different timestamps: the offset handling and the calendar round-trip check in
 * {@link parseUpstreamResetAt} are what make a parsed value trustworthy, and two
 * copies of this shape would be two chances to loosen one of them.
 */
const RESET_STAMP
  = String.raw`(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*UTC\s*([+-])(\d{1,2})(?::?(\d{2}))?`

/**
 * The upstream's reset sentence, in BOTH spellings this service uses.
 *
 * Chinese gateway, measured on a live 429 (code 6004), verbatim:
 *
 *   `您的使用量已超出频率限制，将在 2026-09-30 02:30:30 UTC+8 重置，您也可以切换其他模型继续使用。`
 *
 * International gateway, measured on the same code over the same account pool,
 * verbatim:
 *
 *   `usage exceeds frequency limit, but don't worry, your usage will reset at
 *    2026-10-16 11:34:04 UTC+8, alternatively, you can switch to the other
 *    models to continue using it.`
 *
 * WHY THERE ARE TWO. Each gateway states the time in its own language, and the
 * marker sits on a DIFFERENT SIDE of the timestamp: 重置 follows it in Chinese,
 * while `reset at` precedes it in English — so one pattern cannot cover both by
 * loosening the surrounding prose alone. The original pattern demanded the
 * Chinese keyword, so an English body parsed to nothing and the card said
 * 「上游未给出何时恢复」 about a message that had just named the exact minute.
 *
 * That is the honest-absence contract broken in the OTHER direction — not a
 * made-up time, but a real time discarded — and it is the worse of the two
 * failures, because the account stays excluded on the 30-minute fallback instead
 * of the ~18 hours upstream asked for. The pool then returns the account to
 * candidacy early and spends a request rediscovering the same 6004.
 *
 * Both patterns stay deliberately loose about the surrounding prose and strict
 * about the parts that must not be guessed: a keyword, the timestamp shape, and
 * an explicit UTC offset. A message that merely mentions a reset without a
 * parsable offset still yields no time, which remains the honest answer.
 */
const UPSTREAM_RESET_PATTERN_ZH
  = new RegExp(`将在?\\s*${RESET_STAMP}[\\s\\S]*?重置`, 'u')
/**
 * The English spelling, anchored on `reset at` / `refresh on` IMMEDIATELY before
 * the timestamp — the same strictness as the Chinese pattern, which requires its
 * marker immediately after it. A message that mentions a reset somewhere else
 * entirely therefore still yields no time.
 */
const UPSTREAM_RESET_PATTERN_EN
  = new RegExp(`(?:reset|resets|refresh|refreshes)\\s+(?:at|on)\\s+${RESET_STAMP}`, 'iu')

/**
 * Parse the reset time out of an upstream failure message.
 *
 * Returns epoch ms, or undefined when the message names no parsable time — the
 * caller must then say "the upstream gave no time", never invent one.
 *
 * THE OFFSET IS HONOURED, NOT ASSUMED. `2026-09-30 02:30:30 UTC+8` is 18:30:30
 * UTC the previous day, and `Date.parse` on the bare string would read it as
 * LOCAL time — on a machine set to UTC+8 that happens to be right, and on any
 * other machine it is silently wrong by the offset. So the components are
 * assembled with `Date.UTC` and the stated offset subtracted, which is correct
 * on every host regardless of its own zone.
 *
 * A whole-second resolution is what the upstream prints; sub-second precision
 * would be fiction in the other direction.
 */
export function parseUpstreamResetAt(message: string): number | undefined {
  const match = UPSTREAM_RESET_PATTERN_ZH.exec(message)
    ?? UPSTREAM_RESET_PATTERN_EN.exec(message)
  if (match === null) return undefined
  const [, year, month, day, hour, minute, second, sign, offsetHours, offsetMinutes] = match
  const offsetTotalMinutes
    = (sign === '-' ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes ?? '0'))
  const utcMs = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second),
  )
  // `Date.UTC` normalizes overflow (month 13, day 32) instead of failing, so a
  // nonsense timestamp would silently become a real-but-wrong moment. Reject it.
  const parsed = new Date(utcMs)
  if (parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
    || parsed.getUTCHours() !== Number(hour)
    || parsed.getUTCMinutes() !== Number(minute)
    || parsed.getUTCSeconds() !== Number(second)) {
    return undefined
  }
  if (Math.abs(offsetTotalMinutes) > 14 * 60) return undefined
  return utcMs - offsetTotalMinutes * 60_000
}

/**
 * Resolve upstream reset metadata. Successful probes have no cooldown.
 *
 * Failed probes use Retry-After first, then a reset time parsed from the body.
 * Out-of-credit results may retain the region's quota refresh time as metadata,
 * never as a minimum wait or recovery evidence: check-in or purchases may
 * replenish credits sooner. Credit-exhaustion views show replenishment actions.
 * For model-busy results without either upstream time, the plugin applies
 * MODEL_BUSY_COOLDOWN_MS as a local waiting period. It is longer than the
 * upstream's approximate one-minute suggestion and does not promise recovery.
 * Other failures without a known time return an empty object.
 */
export function cooldownOf(input: {
  outcome: WorkBuddyProbeOutcome
  retryAfter: string | null
  nowMs: number
  /** The upstream's own failure text, where a reset sentence may live. */
  body?: string
  /** The region's next monthly quota refresh, when the upstream declares one. */
  quotaRefreshAtMs?: number
}): Pick<WorkBuddyProbeResult, 'retryAtMs' | 'retrySource'> {
  // A SUCCESS never has a cooldown. Guarded HERE rather than only at the call
  // site because a `Retry-After` on a 200 is a real thing this gateway sends,
  // and its value is the account's MONTHLY QUOTA RESET (observed: `2026-11-01
  // 00:00 +08:00`), not a wait. Reading it as one produced “✓ 可用 · 11/01 00:00
  // 之后可再用 · 约 8 天后” on a free model that answered normally — the report
  // that started this fix. Keeping the rule in one place means no future caller
  // can hand a success a cooldown by passing a header through.
  if (input.outcome === 'ok') return {}
  const fromHeader = parseRetryAfter(input.retryAfter, input.nowMs)
  if (fromHeader !== undefined) return { retryAtMs: fromHeader, retrySource: 'retry-after' }
  const fromBody = input.body === undefined ? undefined : parseUpstreamResetAt(input.body)
  if (fromBody !== undefined) return { retryAtMs: fromBody, retrySource: 'upstream-message' }
  if (input.outcome === 'out-of-credit' && input.quotaRefreshAtMs !== undefined) {
    return { retryAtMs: input.quotaRefreshAtMs, retrySource: 'quota-refresh' }
  }
  if (input.outcome === 'model-busy') {
    return { retryAtMs: input.nowMs + MODEL_BUSY_COOLDOWN_MS, retrySource: 'upstream-tips' }
  }
  return {}
}

/**
 * Classify one failed probe into the card's outcome vocabulary.
 *
 * Built on `classifyUpstreamError` rather than re-testing status codes, so a
 * probe and chat classification share the base rules. The probe adds the
 * outcome mapping below, including its special handling of HTTP 401/403. The extra splits here are `credential-rejected`, which the
 * upstream signals with a non-JSON 401/403 edge page and which needs completely
 * different advice (re-auth, not "wait"), `policy-rejected`, a JSON 403
 * content-policy refusal where re-auth advice would be actively misleading,
 * `model-busy`, the model-scoped 14003 throttle that must NOT be benched as an
 * account failure (issue #56), and `channel-rejected`, the gateway's 11128 gate
 * on the request channel or prompt. One refusal does not prove that every
 * account will receive the same response.
 */
export function outcomeOfFailure(status: number, body: string): WorkBuddyProbeOutcome {
  if (status === 401 || status === 403) {
    const kind = classifyUpstreamError(status, body)
    if (kind === 'policy_reject') return 'policy-rejected'
    if (kind === 'account_restricted') return 'account-restricted'
    return 'credential-rejected'
  }
  switch (classifyUpstreamError(status, body)) {
    case 'soft_rate': return 'rate-limited'
    case 'model_busy': return 'model-busy'
    case 'hard_credit': return 'out-of-credit'
    case 'session_dead': return 'credential-rejected'
    case 'account_restricted': return 'account-restricted'
    case 'channel_reject': return 'channel-rejected'
    case 'not_found': return 'not-found'
    default: return status === 0 || status >= 500 ? 'unavailable' : 'failed'
  }
}

/**
 * Read the credit this probe consumed out of an SSE stream, when the upstream
 * reports it.
 *
 * Returns the first numeric `credit` match in the text. It is a reported
 * figure, not a reconciled bill; the parser does not require a usage block.
 * Returns undefined when no finite matching value is found.
 */
export function creditOfStream(text: string): number | undefined {
  const match = /"credit"\s*:\s*(-?[0-9]*\.?[0-9]+)/u.exec(text)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/** Whether a probe outcome means the model answered. */
export function probeSucceeded(outcome: WorkBuddyProbeOutcome): boolean {
  return outcome === 'ok'
}

/** What one probe needs from the upstream client. */
export interface WorkBuddyProbeClient {
  probeChat(
    credential: WorkBuddyCredential,
    bodyJson: string,
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean
    status: number
    retryAfter: string | null
    body?: string
    response?: Response
  }>
}

/** Max characters of upstream text kept for display, after redaction. */
const PROBE_MESSAGE_LIMIT = 300

/**
 * Redact token-shaped content out of upstream text before it is stored or sent.
 *
 * Lives here rather than in the route layer because this module is the one that
 * reads raw failure bodies, so the redaction belongs at the point of capture. A
 * probe failure body is the one place a raw upstream string from an arbitrary
 * endpoint enters the plugin's data flow.
 *
 * EXPORTED because a failed CHAT request now persists its reason into the pool
 * store too (`recordAccountFailure` in `src/index.ts`), and that text is a raw
 * upstream body as well. One implementation, so the two writers cannot drift
 * into redacting differently — the same "one definition" rule this codebase
 * applies to `effectiveMembersOf`.
 */
export function redactUpstreamText(text: string): string {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, PROBE_MESSAGE_LIMIT)
}

/**
 * Run one probe for one model and reduce it to the card's row.
 *
 * The successful path drains the SSE stream purely to read the `credit` figure
 * the upstream reports, then discards the rest: the question is whether this
 * model answers a real-sized request, and `max_tokens: 1` means there is nothing
 * else in the stream worth keeping.
 *
 * Never throws. A probe is a diagnostic the user asked for, so every failure is
 * a RESULT — one dead model must not abort the batch and hide the other rows.
 */
export async function probeModel(input: {
  client: WorkBuddyProbeClient
  credential: WorkBuddyCredential
  modelId: string
  nowMs: number
  /**
   * How much input this probe sends, in tokens.
   *
   * Omitted means {@link DEFAULT_PROBE_INPUT_TOKENS}, so every existing caller
   * keeps the measured 25k and only the pool's user-facing "test" passes a
   * chosen size through.
   */
  inputTokens?: number
  /** The region's next monthly quota refresh, when known. */
  quotaRefreshAtMs?: number
  signal?: AbortSignal
}): Promise<WorkBuddyProbeResult> {
  let answer
  const startedAt = Date.now()
  try {
    answer = await input.client.probeChat(
      input.credential,
      probeRequestBody(input.modelId, input.inputTokens),
      input.signal,
    )
  } catch (error: unknown) {
    return {
      modelId: input.modelId,
      outcome: 'unavailable',
      // Explicit status 0 lets isTransportFailure exclude this exception from
      // account-health measurements. Identity preparation and transport errors
      // can reach this path; it does not prove whether bytes reached the gateway.
      status: 0,
      message: redactUpstreamText(error instanceof Error ? error.message : String(error)),
    }
  }
  const elapsedMs = Date.now() - startedAt

  if (answer.ok) {
    let credit: number | undefined
    if (answer.response !== undefined) {
      try {
        credit = creditOfStream(await answer.response.text())
      } catch {
        // Preserve the client's success classification if reading the stream fails.
        // This does not prove that a complete model response was received.
      }
    }
    return {
      modelId: input.modelId,
      outcome: 'ok',
      elapsedMs: Date.now() - startedAt,
      status: answer.status,
      ...credit === undefined ? {} : { message: `credit ${credit}` },
      // NO cooldown on a success — not even when the response carries a
      // `Retry-After` header.
      //
      // This was the bug behind “测试的是免费模型，为什么要 8 天后才能用？”.
      // The gateway attaches `Retry-After` to a 200 whose value is the ACCOUNT's
      // monthly quota reset (observed on a real record: `2026-11-01 00:00 +08:00`),
      // and the success path read any present header as “you cannot use this
      // until then”. The card then printed “✓ 可用 · 11/01 00:00 之后可再用 · 约
      // 8 天后” — a usable zero-rate model that looked locked for eight days.
      //
      // A 200 answers “can I use this now?” with yes. A header on a success can
      // describe a throttle budget or a quota schedule; it never describes a
      // wait this account must observe before its next request. Cooldown state
      // belongs to failures only, which `cooldownOf` now enforces on its own.
    }
  }

  const body = answer.body ?? ''
  const outcome = outcomeOfFailure(answer.status, body)
  return {
    modelId: input.modelId,
    outcome,
    elapsedMs,
    status: answer.status,
    ...body === '' ? {} : { message: redactUpstreamText(body) },
    ...cooldownOf({
      outcome,
      retryAfter: answer.retryAfter,
      nowMs: input.nowMs,
      // The upstream writes its reset time into the failure body, so the body
      // has to reach the cooldown reader — without it the card says "no time
      // given" while the answer sits in the text (the defect this fixes).
      body,
      ...input.quotaRefreshAtMs === undefined ? {} : { quotaRefreshAtMs: input.quotaRefreshAtMs },
    }),
  }
}
