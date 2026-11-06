/**
 * 流式工具调用恢复、通知和积分记录。从 shim.ts 按职责提取。
 * 原实现的参考来源及许可证说明见 shim.ts 文件头与 THIRD_PARTY_NOTICES.md。
 */
import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { recordExactCredit } from './local-credit-journal.ts'
import { usageOfChunk } from './body-report.ts'
import { DsmlStreamBuffer } from './dsml-recovery.ts'
import type { RecoveredToolCall, RecoveryGate } from './dsml-recovery.ts'
import type { ShimLogger } from './shim.ts'

/**
 * Inspect SSE content using DsmlStreamBuffer and emit supported recovered calls.
 * With a recovery gate, content frames may be held until prose or a call can be
 * emitted. If only refused markup remains, the caller can discard the held
 * attempt before retrying. Buffering and parsing can add latency.
 *
 * Native calls disable further call recovery while supported protocol blocks
 * continue through scrub mode. Notices, recovered calls and tail content can
 * create frames; tail content is inserted before held finish frames. SSE
 * terminators are completed by emitFrame. Malformed payloads are not repaired.
 */
export class RecoveryStream {
  creditAccount: string | undefined
  private carry = ''
  private readonly decoder = new TextDecoder('utf-8')
  /** Frames received after the hold began, in arrival order. */
  private held: Array<{ frame: string; final: boolean }> = []
  /**
   * The hold window, as two separate facts.
   *
   * `windowOpened` becomes true at the FIRST content-bearing frame and stays
   * true: before it, frames carry no answer (a role delta, a keep-alive) and go
   * straight out; from it on, they are held until the answer is known to be
   * real. `windowClosed` means "an answer was delivered", after which every
   * frame passes through again — for the rest of the response, because a turn
   * that has already produced prose can no longer be replaced by a retry.
   */
  private windowOpened = false
  private windowClosed = false
  private wroteContent = false
  private sawResidue = false
  private sawDone = false
  /**
   * Set once the upstream speaks structured calls.
   *
   * Sticky for the whole response on purpose: recovering markup into a second
   * call channel after the upstream already produced a real one would hand the
   * client two answers to the same question.
   */
  private nativeCallsSeen = false

  private readonly buffer: DsmlStreamBuffer | undefined

  /**
   * A notice to place at the head of the answer, once, before any prose.
   *
   * Set when the request reached this stream only after the pool failed over, so
   * the user learns WHY the answer came from a different account. Without it a
   * failover is invisible: the reply looks like it came from the account they
   * picked, and the only trace is a `logger.warn` they never see. The notice is
   * emitted ahead of the model's own text so it cannot be mistaken for part of
   * the answer, and only once — a retry that never delivers text must not leave
   * a stray line behind.
   */
  private notice: string | undefined

  constructor(
    private readonly res: ServerResponse,
    gate: RecoveryGate | undefined,
    private readonly logger: ShimLogger | undefined,
    notice?: string,
    /** Called once, with the upstream's token counts, when the stream reports them. */
    private readonly onUsage?: (usage: {
      promptTokens?: number
      completionTokens?: number
      cachedTokens?: number
    }) => void,
  ) {
    this.buffer = gate === undefined ? undefined : new DsmlStreamBuffer(gate)
    this.notice = notice
  }

  /**
   * Emit the pending failover notice, if any, and forget it.
   *
   * Called immediately before the first content reaches the client. Placed
   * here rather than in the constructor because a stream whose write fails, or
   * whose attempt is discarded in favour of a retry, must not have already told
   * the user about a switch it never completed.
   */
  private flushNotice(): void {
    const notice = this.notice
    if (notice === undefined) return
    this.notice = undefined
    if (!this.res.writable) return
    const chunk: Record<string, unknown> = { choices: [{ index: 0, delta: {}, finish_reason: '' }] }
    const choiceRecord: Record<string, unknown> = { index: 0, delta: {}, finish_reason: '' }
    // Written straight to the socket, deliberately bypassing the hold window:
    // the notice is ours, not the upstream's, so it is not something a retry
    // could need to replace — and putting it through the window would let a
    // discarded attempt take it away again after the user had seen it.
    this.windowOpened = true
    this.emitFrame(contentFrame(chunk, choiceRecord, notice))
  }

  /** True when a call or real prose has reached the client. */
  get delivered(): boolean {
    return this.wroteContent
  }

  /** True when the held bytes contain markup the gates refused. */
  get residueSeen(): boolean {
    return this.sawResidue
  }

  /**
   * The single exit every byte of a FRAME passes through.
   *
   * SSE dispatches one event per blank-line-terminated run of `data:` lines.
   * A frame written WITHOUT its terminator leaves the client's decoder
   * waiting for a blank line that never arrives, so the NEXT write is
   * appended to the SAME event — and a client that joins the several `data:`
   * lines of one event with `\n` and parses the result as one JSON document
   * (openai's `SSEDecoder` does exactly that) then reads two payloads as one
   * and fails. Issue #53 is that failure: the upstream died between a `data:`
   * line and its blank line, `consume()` forwarded the half-frame verbatim,
   * and `finish()` glued its synthetic `[DONE]` onto it, producing
   * `data: {...}\ndata: [DONE]\n\n` — parsed as one event whose data is
   * `"{...}\n[DONE]"`, which throws "Unexpected non-whitespace character
   * after JSON at position N". The whole turn is then classified as a
   * non-retryable error, so the user simply sees the answer stop.
   *
   * Completing the terminator here fixes both halves at once: the truncated
   * frame becomes a self-contained event, and the `[DONE]` that follows can no
   * longer be joined to it. It is idempotent for the frames `push()` cuts —
   * those always carry the terminator already, so they pass through
   * byte-for-byte, which keeps guarantee 1 (frame order is never changed)
   * intact.
   *
   * Note that a missing NEWLINE is also completed: `data: {…}` cut mid-line
   * needs the full `\n\n`, not a single `\n`, to close the event. Such a frame
   * is upstream-corrupted JSON that cannot be repaired here; closing it at
   * least keeps the corruption confined to its own event instead of taking
   * the terminator down with it.
   */
  private emitFrame(frame: string): void {
    if (frame.endsWith('\n\n')) {
      this.res.write(frame)
      return
    }
    this.res.write(frame.endsWith('\n') ? `${frame}\n` : `${frame}\n\n`)
  }

  /** Record that text the gates refused was seen (markup residue, not prose). */
  private noteResidue(seen: boolean): void {
    this.sawResidue ||= seen
  }

  /** Drain one upstream body into the client. */
  async consume(body: ReadableStream<Uint8Array> | null): Promise<void> {
    if (body === null) return
    const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
    try {
      for await (const chunk of source) {
        this.push(this.decoder.decode(chunk as Buffer, { stream: true }))
      }
    } catch (error: unknown) {
      // The old pass-through logged the same way and let the response end with
      // a synthesized terminator; that behaviour is preserved by `finish()`.
      this.logger?.warn('dsh-connect-workbuddy: upstream stream failed mid-flight', error)
    }
    const tail = this.carry
    this.carry = ''
    if (tail !== '') {
      // `push()` only cuts a frame at an EMPTY line, so whatever is left in
      // `carry` when the upstream ends is by definition a frame that never
      // received its terminator — the upstream died between a `data:` line and
      // the blank line that would have closed it. Forwarding it verbatim leaves
      // the client's SSE decoder inside that event, so the `[DONE]` written by
      // `finish()` becomes a SECOND `data:` line of the SAME event and the two
      // payloads are joined and parsed as one JSON document — issue #53's
      // "Unexpected non-whitespace character after JSON at position N".
      //
      // Closing the frame here keeps it a self-contained event: the last real
      // chunk of the answer is delivered instead of being lost (without a
      // terminator the client never dispatches the event at all and silently
      // drops that content), and the synthetic terminator that follows can no
      // longer be glued onto it. `emitFrame` completes the terminator for every
      // write, so this normalization is the tail's share of that guarantee.
      const lineTerminated = tail.endsWith('\n')
      this.handleFrame(lineTerminated ? `${tail}\n` : `${tail}\n\n`)
    }
  }

  /**
   * Close the response: emit the block still unfinished at end-of-stream, then
   * everything held, then the terminator.
   */
  finish(): void {
    const flushed = this.buffer?.flush()
    if (flushed !== undefined && flushed.text !== '') {
      this.noteResidue(!flushed.prose)
      this.emitContent(flushed.text)
    }
    this.closeWindow()
    if (!this.sawDone && this.res.writable) this.emitFrame('data: [DONE]\n\n')
    if (this.res.writable) this.res.end()
  }

  /** Drop held bytes without writing them (used when a retry replaced them). */
  discard(): void {
    this.held = []
    this.windowClosed = true
  }

  // -------------------------------------------------------------------------

  /** Split incoming bytes into whole SSE frames, handling chunk boundaries. */
  private push(text: string): void {
    this.carry += text
    let start = 0
    for (;;) {
      const newline = this.carry.indexOf('\n', start)
      if (newline === -1) break
      const line = this.carry.slice(start, newline)
      if (line.trim() === '') {
        const frame = this.carry.slice(0, newline + 1)
        this.carry = this.carry.slice(newline + 1)
        start = 0
        this.handleFrame(frame)
        continue
      }
      start = newline + 1
    }
  }

  /** Whether a usage measurement has already been reported for this stream. */
  private usageReported = false

  /**
 * Read usage from a parsed chunk and report at most once per RecoveryStream.
 * The first usable measurement wins; later usage updates are ignored. A retry
 * can create another stream and report again, so callers must associate each
 * observation with the appropriate request. Missing usage is not reported as zero.
 */
  private noteUsage(chunk: Record<string, unknown>): void {
    if (this.usageReported || this.onUsage === undefined) return
    const usage = usageOfChunk(chunk)
    if (usage === undefined) return
    this.usageReported = true
    try {
      this.onUsage(usage)
    } catch (error: unknown) {
      // A diagnostic must never fail a chat request.
      this.logger?.warn('dsh-connect-workbuddy: usage report failed', error)
    }
  }

  /** Handle one complete frame, rewriting it only when recovery produced something. */
  private handleFrame(frame: string): void {    const payload = dataPayload(frame)
    if (payload === undefined) {
      this.send(frame, false)
      return
    }
    if (payload === '[DONE]') {
      this.sawDone = true
      this.send(frame, false)
      return
    }

    let chunk: Record<string, unknown>
    try {
      chunk = JSON.parse(payload) as Record<string, unknown>
    } catch {
      // Not ours to interpret: forward verbatim, exactly as the diagnostic
      // module's own frame parser treats an unparsable frame.
      this.send(frame, false)
      return
    }

    const choices = chunk['choices']
    // The `usage` block is normally carried by a frame that has NO `choices`
    // (the final chunk on a streamed answer), so it must be read BEFORE the
    // choices check below — otherwise every such frame is forwarded unread and
    // the measurement never leaves the stream.
    recordExactCredit(chunk, this.creditAccount, { onError: error => this.logger?.warn('local credit journal write failed', error) })
    this.noteUsage(chunk)
    const choice = Array.isArray(choices) ? choices[0] : undefined
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) {
      this.send(frame, false)
      return
    }
    const choiceRecord = choice as Record<string, unknown>
    const deltaValue = choiceRecord['delta']
    const delta = typeof deltaValue === 'object' && deltaValue !== null && !Array.isArray(deltaValue)
      ? deltaValue as Record<string, unknown>
      : undefined
    if (delta === undefined) {
      this.send(frame, false)
      return
    }

    // A native call means the upstream is already speaking the protocol: stop
    // recovering for this response so the two cannot both fire.
    const nativeCalls = delta['tool_calls']
    if (Array.isArray(nativeCalls) && nativeCalls.length > 0) {
      this.nativeCallsSeen = true
      // Stand the buffer DOWN rather than bypass it (issue #207). "Do not
      // recover a second call channel" and "forward whatever bytes follow" are
      // two different decisions, and the old code made them one: after this
      // point every content frame skipped the buffer, so marker text that
      // arrived after a native call went out as prose. Scrub mode keeps the
      // text half — blocks are still removed, no call is ever produced.
      this.buffer?.standDown()
      this.windowOpened = true
      this.flushNotice()
      this.send(frame, false)
      this.wroteContent = true
      this.closeWindow()
      return
    }

    const content = delta['content']
    if (typeof content !== 'string' || content === '') {
      const reason = finishReasonOf(choiceRecord)
      // A terminator is the last thing the answer says. Anything the buffer is
      // still holding is content that logically PRECEDES it, so it must be
      // emitted first — otherwise a client that stops accumulating at
      // `finish_reason` silently loses the tail of the answer.
      if (reason !== '') this.drainBuffer()
      this.send(frame, reason !== '')
      return
    }

    if (this.buffer === undefined) {
      // Gate 3 (nothing declared): nothing may be recovered, and the bytes go
      // through untouched. The window is opened so that a later frame cannot
      // start holding either — with no buffer there is nothing a hold could be
      // waiting for.
      //
      // `nativeCallsSeen` is deliberately NOT in this condition (issue #207):
      // that state still has a buffer, in scrub mode, and routing its content
      // through this branch is what let markup after a native call through as
      // prose. The buffer removes blocks and produces no calls there.
      this.windowOpened = true
      this.flushNotice()
      this.closeWindow()
      this.emitFrame(frame)
      this.wroteContent = true
      return
    }

    // The first content-bearing frame opens the hold window: from here until
    // the answer is proven real, frames are queued rather than forwarded.
    this.windowOpened = true

    const outcome = this.buffer.add(content)
    if (outcome.calls !== undefined && outcome.calls.length > 0) {
      // Queued through `send` first so it lands ahead of any `finish_reason`
      // frame already held, then the window closes and everything flushes in
      // arrival order.
      this.flushNotice()
      this.send(callsFrame(chunk, choiceRecord, outcome.calls), false)
      this.wroteContent = true
      this.closeWindow()
      // Any text the same chunk also carried still belongs to the client.
      if (outcome.text !== '') this.emitFrame(contentFrame(chunk, choiceRecord, outcome.text))
      return
    }

    this.noteResidue(!outcome.prose && outcome.text !== '')
    if (outcome.text === '') {
      // Nothing to show: either the buffer is still holding a half-arrived
      // block, or the upstream sent an empty delta.
      this.send(contentFrame(chunk, choiceRecord, ''), false)
      return
    }
    if (outcome.prose) {
      this.flushNotice()
      this.send(contentFrame(chunk, choiceRecord, outcome.text), false)
      this.wroteContent = true
      this.closeWindow()
      return
    }
    this.send(contentFrame(chunk, choiceRecord, outcome.text), false)
  }

  /**
   * Hand back whatever the buffer is still holding, right now.
   *
   * Called before a terminator frame is forwarded. `flush()` ends the buffer's
   * attempt — if content somehow keeps arriving afterwards it starts a fresh
   * one, which is the correct reading of a stream that declared itself finished.
   */
  private drainBuffer(): void {
    const flushed = this.buffer?.flush()
    if (flushed === undefined || flushed.text === '') return
    this.noteResidue(!flushed.prose)
    this.emitContent(flushed.text)
  }

  /**
   * Emit text the buffer was still holding when the stream ended.
   *
   * It goes through `send` + `closeWindow` rather than straight to the socket on
   * purpose: a `finish_reason` frame may already be queued, and this text is
   * content that logically precedes it. Writing directly would put the answer
   * after its own terminator — a client that stops accumulating at
   * `finish_reason` would silently lose the tail.
   */
  private emitContent(text: string): void {
    const chunk: Record<string, unknown> = { choices: [{ index: 0, delta: {}, finish_reason: '' }] }
    const choiceRecord: Record<string, unknown> = { index: 0, delta: {}, finish_reason: '' }
    this.windowOpened = true
    const frame = contentFrame(chunk, choiceRecord, text)
    if (text.trim() !== '') {
      this.flushNotice()
      this.send(frame, false)
      this.wroteContent = true
      this.closeWindow()
      return
    }
    this.send(frame, false)
  }

  /** Queue a frame while the window is open, or write it once it has closed. */
  private send(frame: string, final: boolean): void {
    if (this.windowClosed || !this.windowOpened) {
      this.emitFrame(frame)
      return
    }
    // A frame carrying `finish_reason` belongs AFTER content still in flight,
    // so a trailing content frame is inserted ahead of every such frame rather
    // than appended behind it.
    const entry = { frame, final }
    if (!final) {
      const at = this.held.findIndex(item => item.final)
      if (at !== -1) {
        this.held.splice(at, 0, entry)
        return
      }
    }
    this.held.push(entry)
  }

  /**
   * An answer has been delivered: flush everything held, in order, and never
   * hold again for this response.
   */
  private closeWindow(): void {
    this.windowClosed = true
    const pending = this.held
    this.held = []
    for (const entry of pending) this.emitFrame(entry.frame)
  }
}

/** The SSE `data:` payload of one frame, or nothing when it carries none. */
function dataPayload(frame: string): string | undefined {
  for (const line of frame.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed.startsWith('data:')) continue
    return trimmed.slice('data:'.length).trim()
  }
  return undefined
}

/** A frame's `finish_reason`, or '' when it carries none. */
function finishReasonOf(choice: Record<string, unknown>): string {
  const reason = choice['finish_reason']
  return typeof reason === 'string' ? reason : ''
}

/**
 * One frame carrying recovered calls.
 *
 * The shape is OpenAI's: `index` per call, `type: "function"`, arguments as a
 * JSON STRING. `finish_reason` becomes `tool_calls` — without it a client that
 * waits for the reason before executing an assembled call would never run it.
 */
function callsFrame(
  chunk: Record<string, unknown>,
  choice: Record<string, unknown>,
  calls: readonly RecoveredToolCall[],
): string {
  const toolCalls = calls.map((call, index) => ({
    index,
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: call.arguments },
  }))
  const next = { ...chunk, choices: [{ ...choice, delta: { tool_calls: toolCalls }, finish_reason: 'tool_calls' }] }
  return `data: ${JSON.stringify(next)}\n\n`
}

function contentFrame(
  chunk: Record<string, unknown>,
  choice: Record<string, unknown>,
  content: string,
): string {
  const delta = { ...(choice['delta'] as Record<string, unknown> | undefined), content }
  const next = { ...chunk, choices: [{ ...choice, delta }] }
  return `data: ${JSON.stringify(next)}\n\n`
}

