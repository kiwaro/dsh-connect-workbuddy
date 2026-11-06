/**
 * 请求体读取、HTTP 错误映射和重试响应头。从 shim.ts 按职责提取。
 * 原实现的参考来源及许可证说明见 shim.ts 文件头与 THIRD_PARTY_NOTICES.md。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UpstreamErrorKind } from './upstream.ts'

const REQUEST_BODY_LIMIT = 64 * 1024 * 1024

/** Chat-completion POSTs must carry a JSON body type (simple-request CSRF drops here). */
export function isJsonContentType(req: IncomingMessage): boolean {
  const type = req.headers['content-type']
  return typeof type === 'string' && type.trim().toLowerCase().startsWith('application/json')
}

/** HTTP status each upstream failure class surfaces as. */
export const KIND_STATUS: Readonly<Record<UpstreamErrorKind, number>> = {
  hard_credit: 402,
  soft_rate: 429,
  // Same status as `soft_rate`, because that is what the upstream returned — the
  // distinction lives in `code`/`type`, not in a relabelled status. See
  // KIND_HOST_CODE for why the host must not read this as an account limit.
  model_busy: 429,
  session_dead: 401,
  policy_reject: 403,
  account_restricted: 403,
  // A 400, because that is what the gateway answered and the request really is
  // malformed from its point of view. See KIND_HOST_CODE for why the host must
  // not read this as a retryable transport failure.
  channel_reject: 400,
  // A queue is a 429 in the sense the host understands: "not now, try again".
  // Queue responses also carry NO_RETRY_HEADERS to request no automatic retry.
  model_queue: 429,
  not_found: 502,
  server: 502,
  client: 400,
}

/**
 * The `code` spelling the HOST is expected to classify each upstream failure by.
 *
 * The host decides whether a failed request may be retried IN PLACE (5 attempts
 * with backoff) or must be handed to cross-provider failover by reading English
 * phrases out of `type + " " + code + " " + message` — see
 * `isQuotaExceededError` in `@deepseek-ai/dsh-llm`. Only `RATE_LIMIT`, `SERVER`,
 * `TIMEOUT`, `TRANSPORT` and `EMPTY_RESPONSE` are in its retry set, so the
 * spelling decides which of two very different things happens next.
 *
 * `soft_rate` is the one kind that spelling got wrong. The upstream's 429 says
 * "usage exceeds the frequency limit, and it resets at 13:37" — hours away, not
 * two seconds. Sent as `soft_rate` it reads as an ordinary rate limit, enters
 * the in-place retry set, and spends the whole retry budget on an endpoint that
 * cannot recover within it; by the time cross-provider failover is offered, the
 * turn has already failed. The upstream's own words are Chinese, so the
 * phrase-based classifier cannot see the distinction either — the label is the
 * only channel left to carry it.
 *
 * `quota_exceeded` is the minimal honest translation: it is the WORDS the host
 * recognises, and it matches what the upstream is actually saying. The HTTP
 * status stays 429 (that is what the upstream returned — relabelling it 402
 * would misreport the upstream), and the upstream's own message is still passed
 * through verbatim for a human to read.
 *
 * Every other kind already lands outside the retry set by its status alone
 * (`hard_credit` 402 → quota, `session_dead` 401 → auth, 502/400 → other), so
 * none of them is listed: a translation nobody needs is a lie waiting to drift.
 *
 * `policy_reject` is deliberately NOT listed either, for a sharper reason than
 * the others: the obvious candidate translation would be the upstream's own
 * numeric code (11140), but that is not a class the host knows, so it would take
 * the host's generic path and add nothing over `policy_reject`. It needs no
 * translation to stay outside the retry set (403), and it must NOT be translated
 * INTO the set — a content-policy refusal is deterministic, so retrying it in
 * place would spend the retry budget on a request the server will refuse again,
 * and cross-provider failover cannot help a policy decision either. The code the
 * host receives therefore names the class honestly.
 *
 * `model_busy` used to get the same `quota_exceeded` translation, for what
 * looked like the same reason, and that was WRONG in a way users reported
 * (issue #84). The reasoning above assumed `quota_exceeded` only influenced
 * retryability. It does more than that: `isQuotaExceededError` is matched
 * against `type + " " + code + " " + message`, the match yields host code
 * `QUOTA`, and the chat client hard-codes its copy for `QUOTA`/`ACCOUNT_QUOTA`
 * — substituting 「当前请求的额度已用尽」 and DISCARDING this plugin's message.
 * So a loaded model was shown to the user as an exhausted balance: an
 * actionable, transient condition rendered as a terminal, account-level one.
 *
 * Leaving `model_busy` untranslated is the correct spelling, and it was
 * verified end to end rather than reasoned about: driving pi-ai against a
 * server replaying this shim's real bodies, `code: 'model_busy'` classifies as
 * `RATE_LIMIT` — which (a) is outside the substitution list, so the plugin's
 * own honest sentence is what the user reads, and (b) IS in the host's
 * in-place retry set, so `dsh-llm-retry` performs a bounded retry with the
 * default 500 ms→10 s backoff instead of failing the turn on one 14003. That
 * retry is what makes "the model is momentarily busy" recoverable, which is
 * exactly what a 14003 is: measured against the same credential and second,
 * five consecutive sends gave 200/200/200/200/429.
 *
 * `soft_rate` keeps the translation, and the contrast is the whole point: its
 * reset is hours away, so the retry budget cannot produce an answer and must
 * not be spent. One word, two opposite temporal claims — so the spelling
 * follows the clock, not the status code both share.
 *
 * `channel_reject` is not listed, and the reason is the same rule applied to a
 * third clock: the gate's verdict is DETERMINISTIC for a given prompt, so an
 * in-place retry would spend the budget re-sending bytes it already refused, and
 * cross-provider failover cannot help either (every account sends that same
 * prompt). Its 400 already places it outside the host's retry set, so `type`
 * alone, untranslated, is the honest spelling.
 */
const KIND_HOST_CODE: Partial<Readonly<Record<UpstreamErrorKind, string>>> = {
  soft_rate: 'quota_exceeded',
}

/**
 * The `code` to write for an upstream failure, given its classified kind.
 *
 * `type` deliberately stays the plugin's own kind: it is what a human reads in
 * a log or a bug report, and it keeps the two fields individually meaningful.
 * Only `code` carries the host-facing translation.
 */
export function hostErrorCode(kind: UpstreamErrorKind): string {
  return KIND_HOST_CODE[kind] ?? kind
}

export function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Readonly<Record<string, string>>,
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  res.end(payload)
}

/**
 * Write a JSON error the way an OpenAI-compatible client expects.
 *
 * `code` defaults to `type`, which is right for every error THIS shim raises on
 * its own (`unauthorized`, `not_found`, …): those are not upstream failures and
 * must not be disguised as one. The upstream failure path passes an explicit
 * `code` so the host classifies it correctly — see {@link KIND_HOST_CODE}.
 */
export function writeOpenAIError(
  res: ServerResponse,
  status: number,
  kind: string,
  message: string,
  code?: string,
  headers?: Readonly<Record<string, string>>,
): void {
  writeJson(res, status, { error: { message, type: kind, code: code ?? kind } }, headers)
}

/**
 * Request that clients honoring x-should-retry stop automatic retries.
 * Queue responses use this header so the user can decide whether to resend or
 * switch models. Other clients may ignore it. Retry-After: 0 specifies no
 * waiting period; that header alone does not prohibit another attempt.
 */
export const NO_RETRY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'x-should-retry': 'false',
  // No waiting interval; x-should-retry carries the stop-retry instruction.
  'retry-after': '0',
})

/**
 * An over-limit request body (issue #174).
 *
 * A named class rather than an `Error` with a magic message, because the two
 * callers must answer it with a DIFFERENT status: the protocol answer is 413,
 * and classifying it as an ordinary internal failure made it a 500. A class
 * survives renaming the message, which is the only reason this is not a
 * string comparison.
 */
export class RequestBodyTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`request body too large (limit ${limitBytes} bytes)`)
    this.name = 'RequestBodyTooLargeError'
  }
}

/**
 * Read a request body with a size cap; over-limit bodies fail the request.
 *
 * AN OVER-LIMIT BODY IS STOPPED, NOT DESTROYED (issue #174). Calling
 * `req.destroy()` here tears down the SOCKET, so the 413 the caller is about to
 * write can never reach the client — it saw a reset connection instead of an
 * answer, which is strictly worse than the 500 this replaced. So the stream is
 * paused and its listeners are dropped: the request is no longer read, the
 * response still goes out, and Node closes the connection once the response
 * ends. Bytes already arriving are discarded with the socket, which is the
 * whole point of a cap (`content-length` is not trusted, so the cap has to be
 * enforced on arrival).
 */
export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > REQUEST_BODY_LIMIT) {
        // Drop what was buffered before answering: holding a partial 64 MB body
        // while writing a one-line error is pure waste.
        chunks.length = 0
        req.removeAllListeners('data')
        req.removeAllListeners('end')
        req.pause()
        reject(new RequestBodyTooLargeError(REQUEST_BODY_LIMIT))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

