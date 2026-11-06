/**
 * 从 adapter.ts 按职责提取；参考来源与许可证说明见原文件头和 THIRD_PARTY_NOTICES.md。
 */
import { WORKBUDDY_FALLBACK_SYSTEM_PROMPT } from './upstream.ts'
import type { Context, Message, ProviderStreams } from '@earendil-works/pi-ai'
import type { PiAiGeneration } from './pi-ai-runtime.ts'
import { WORKBUDDY_MODEL_IDENTITY, WORKBUDDY_PROVIDER, WORKBUDDY_GLOBAL_PROVIDER, HOST_FOREIGN_API } from './adapter-identity.ts'

/**
 * Rewrite a pi-ai normalized transcript into the flat shape consumed by legacy
 * pi-ai — prompt AND tools.
 *
 * WHY THIS EXISTS (issue #24). pi-ai 0.87's `normalizeContext` moves the system
 * prompt INTO `messages` as `{ role: 'system', content: '<string>' }`. pi-ai
 * 0.85's own `Message` union has no `system` variant
 * (`UserMessage | AssistantMessage | ToolResultMessage`), so its
 * `estimateMessageTokens` has no branch for one: `for (const block of
 * message.content)` iterates the CONTENT STRING character by character, `block`
 * is a single character, and `block.name.length` throws
 * `Cannot read properties of undefined (reading 'length')`.
 *
 * That crash happens inside the library, in `buildBaseOptions ->
 * clampMaxTokensToContext -> estimateContextTokens`, i.e. BEFORE any request is
 * built — so every model fails instantly and no upstream traffic is sent. A
 * host running 0.87 hands us the normalized transcript while our own provider
 * is 0.85, and the plugin cannot patch the library. What it CAN do is not hand
 * a 0.87 transcript to a 0.85 API object.
 *
 * The 0.87 transcript carries MORE than the prompt on that leading system
 * message: `toolsAdded` (and `toolsRemoved`) are the ONLY place the tool
 * declarations live — `normalizeContext` deleted the top-level `tools` field,
 * and 0.85's api reads tools ONLY from `context.tools`. So folding the text
 * without promoting the tool state would trade issue #24's loud crash for
 * issue #26's silent one: models that can never emit a `toolCall` because the
 * request never declared any tools. The fold here promotes both, replaying
 * every system message's `toolsRemoved`/`toolsAdded` in order — exactly the
 * merge pi-ai 0.87's own `getCurrentTools` performs — and leaves an existing
 * top-level `tools` array untouched.
 *
 * Deliberately SHAPE-based within the legacy branch, not version-based: it
 * asks "does this context carry a system message inside `messages`?" rather
 * than "which pi-ai version is loaded?". A version check would be wrong the
 * moment either side moves. Which BRANCH runs at all IS generation-gated —
 * see {@link withLegacyContext}: a modern (0.87+) api consumes this very
 * transcript natively, and folding for it would destroy its only carrier of
 * prompt and tools (issues #25/#26).
 *
 * Returns the SAME object when there is nothing to adapt — in particular when
 * `systemPrompt` is already set (the native 0.85 shape), so the ordinary path
 * is byte-for-byte untouched.
 *
 * Two guards beyond the 0.87 fold, both about a request reaching the upstream
 * with NO system message — which the international gateway refuses outright
 * (business code 11128) while the domestic one tolerates:
 *
 * - an EMPTY `systemPrompt` is treated as absent rather than "already set".
 *   pi-ai emits the prompt under `if (context.systemPrompt)`, so an empty one
 *   produces no system message at all and pi-ai demotes any `system` entry still
 *   in `messages` to `user`. Falling through here lets a real system message
 *   that IS present in `messages` be folded up and preserved.
 * - when nothing supplies a prompt, {@link WORKBUDDY_FALLBACK_SYSTEM_PROMPT} is
 *   used, because a placeholder beats a guaranteed 400. A system message whose
 *   text is empty but which carries `toolsAdded` still folds its TOOLS up; the
 *   placeholder for the missing prompt then comes from `ensureSystemHead` at
 *   the wire (the last of the three layers).
 *
 * LEGACY-ONLY. This is the inverse direction from {@link foldModernContext}:
 * it produces the FLAT `{systemPrompt, tools, messages}` shape that ONLY
 * pi-ai 0.85 reads. Never hand its result to a 1.x api — 1.x reads tools from
 * `messages[].toolsAdded` and would see none (issues #25/#26). Type note: the
 * parameter is the 0.85 `Context`; pi-ai 1.1.0 types the api's second parameter
 * as `TranscriptContext`, so this function cannot be called with 1.x typings —
 * that is intentional, and it is why the modern branch below does not touch it.
 */
export function adaptLegacyPiAiContext(context: Context): Context {
  if (context === null || typeof context !== 'object') return context
  // Truthiness, not `!== undefined`: see the empty-prompt guard above.
  if (context.systemPrompt) return context
  const messages = Array.isArray(context.messages) ? context.messages : undefined
  if (messages === undefined) return context

  const systemTexts: string[] = []
  const rest: Message[] = []
  const toolState = new Map<string, NonNullable<Context['tools']>[number]>()
  let sawSystemMessage = false
  for (const message of messages) {
    const role = (message as { role?: unknown } | null)?.role
    if (role !== 'system') {
      rest.push(message)
      continue
    }
    sawSystemMessage = true
    const text = systemTextOf(message)
    if (text !== '') systemTexts.push(text)
    replayToolState(message, toolState)
  }

  const head = rest[0] as { role?: unknown } | undefined
  const needsFallback = !sawSystemMessage
    && head !== undefined
    && head.role !== 'system'
  if (!sawSystemMessage && !needsFallback) return context

  // Dropped from `messages` even when no text could be extracted: leaving it
  // there is precisely what crashes 0.85, and a system entry with no text has
  // nothing to lose. `systemPrompt` stays ABSENT rather than '' so a provider
  // never receives an empty system message.
  const systemPrompt = systemTexts.length > 0
    ? systemTexts.join('\n\n')
    : sawSystemMessage ? undefined : WORKBUDDY_FALLBACK_SYSTEM_PROMPT

  // Only a context with NO top-level tools gets the promoted set: when the
  // caller supplied one, it is authoritative for their shape.
  const tools = Array.isArray(context.tools)
    ? undefined
    : [...toolState.values()]

  return {
    ...context,
    ...systemPrompt === undefined ? {} : { systemPrompt },
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    messages: rest,
  }
}

/**
 * Replay one 0.87 system message's tool deltas into `state`, the same merge
 * pi-ai 0.87's `getCurrentTools` performs: removals first, then additions,
 * keyed by name so a mid-conversation redeclaration replaces the original.
 */
function replayToolState(message: Message, state: Map<string, NonNullable<Context['tools']>[number]>): void {
  const removed = (message as { toolsRemoved?: unknown }).toolsRemoved
  if (Array.isArray(removed)) {
    for (const tool of removed) {
      const name = (tool as { name?: unknown } | null)?.name
      if (typeof name === 'string') state.delete(name)
    }
  }
  const added = (message as { toolsAdded?: unknown }).toolsAdded
  if (Array.isArray(added)) {
    for (const tool of added) {
      const name = (tool as { name?: unknown } | null)?.name
      if (typeof name === 'string') state.set(name, tool as NonNullable<Context['tools']>[number])
    }
  }
}

/** The text of one system message, whether it is a string or text blocks. */
function systemTextOf(message: Message): string {
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const texts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown, text?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') texts.push(candidate.text)
  }
  return texts.join('\n\n')
}

/**
 * Fold a RAW context into the normalized transcript the modern generation
 * consumes: a leading `system` message carrying the prompt AND the tool
 * declarations in its `toolsAdded` field.
 *
 * WHY THIS IS NEEDED AT ALL (the 0.2.1-rc.1 regression). This used to be
 * unnecessary: the modern branch returned pi-ai's api UNWRAPPED, on the belief
 * that the modern generation normalized for itself. It does not.
 * `dsh-llm-pi-ai` — both the 0.1.7 and the 0.2.1 lines — hands every provider a
 * RAW envelope (`piContext()` builds `{systemPrompt, messages, tools}` and
 * never calls `normalizeContext`), while:
 *
 *   - pi-ai 0.85.x READS that raw shape (its request builder consults
 *     `context.systemPrompt` / `context.tools` directly), and
 *   - pi-ai 1.x READS ONLY `context.messages` (it resolves the transcript and
 *     collapses system messages; the top-level fields are consulted nowhere).
 *
 * On pi-ai 1.x a pass-through request therefore went upstream with NO system
 * prompt and NO tool declarations, silently: the model stopped calling tools,
 * and the domestic gateway tolerated the prompt-less body. Same failure class
 * as issues #24/#25/#26, reached from the opposite side — 4.4.2 fixed "1.x
 * misjudged as legacy and folded"; this fixes "1.x judged modern and NOT
 * folded, though nothing had normalized".
 *
 * Built inline rather than by importing pi-ai's `normalizeContext`, which does
 * not exist in 0.85.x: a static import would be `undefined` there, and this
 * module deliberately never imports pi-ai statically (see `pi-ai-runtime.ts` —
 * that doctrine is what lets the standalone `bin` run in a profile where the
 * peer is never installed). The folded shape matches what `normalizeContext`
 * produces for the same input: `{role:'system', content, toolsAdded, timestamp:0}`.
 *
 * The top-level `systemPrompt`/`tools` fields are DROPPED, exactly as
 * `normalizeContext` drops them, so a raw transcript and an already-normalized
 * one converge on the same object.
 */
function foldModernContext(context: Context): Context {
  const prompt = context.systemPrompt
  const tools = context.tools
  const hasPrompt = prompt !== undefined && prompt !== ''
  const hasTools = Array.isArray(tools) && tools.length > 0
  // Nothing to fold: an already-normalized transcript (its system message is in
  // `messages` already). Folding again would prepend a SECOND, empty one.
  if (!hasPrompt && !hasTools) return context
  const system = {
    role: 'system',
    content: prompt ?? '',
    ...(hasTools ? { toolsAdded: tools } : {}),
    timestamp: 0,
  } as unknown as Message
  const { systemPrompt: _prompt, tools: _tools, ...rest } = context as Context & {
    systemPrompt?: string
    tools?: Context['tools']
  }
  return { ...rest, messages: [system, ...context.messages] } as Context
}

/**
 * Wrap one pi-ai API module so both stream entry points receive a context this
 * generation can actually consume.
 *
 * The gate is the plugin's own module, resolved via {@link piAiRuntimeInfo}
 * (manifest version of the copy this plugin resolves — no pi-ai import):
 *
 * - `legacy` (0.85) wants the flat `{systemPrompt, tools, messages}` shape, so
 *   a normalized transcript is UN-folded by {@link adaptLegacyPiAiContext}.
 * - `modern` (0.87+, incl. 1.x) wants the normalized transcript, so a raw
 *   envelope is FOLDED by {@link foldModernContext}. Passing it through
 *   unnormalized is what silently deleted the prompt and the tools on pi-ai
 *   1.x — the regression this branch now prevents.
 *
 * Both branches are idempotent, so a future seam that starts normalizing on its
 * own side changes nothing here.
 *
 * The deferred-fetch entry points take no context and are passed through as-is
 * in both branches.
 */
/**
 * Present an adapted context as the type the api's parameter currently expects.
 *
 * pi-ai 1.x BRANDS its provider-facing context (`TranscriptContext`, a
 * `unique symbol` field) precisely so a raw `Context` cannot reach provider
 * code by accident; the brand's stated sole producer is `normalizeContext()`.
 * On a 1.x typings surface BOTH branches below receive that branded type, so
 * merely returning a plain `Context` fails `tsc` with TS2345 — an error that
 * only appears when the peer TYPES are 1.x, which is why the 0.85 checkout
 * never saw it.
 *
 * The cast is a deliberate, documented assertion of exactly what the brand
 * protects, and it is true after the call site has done the work:
 *
 * - modern: {@link foldModernContext} has already performed
 *   `normalizeContext`'s job — prompt and tools live on the leading system
 *   message, top-level fields gone;
 * - legacy: {@link adaptLegacyPiAiContext} produced the FLAT 0.85 shape, which
 *   is only ever observed on a 0.85 checkout, where this type is a plain
 *   `Context` and the cast is an upcast.
 *
 * Do NOT "fix" this by importing `normalizeContext`: it does not exist in
 * 0.85, so that import would be `undefined` at runtime on the very hosts this
 * code must keep working — the same reason `pi-ai-runtime.ts` documents why
 * this module never imports pi-ai statically.
 */
function transcript<T>(context: Context): T {
  return context as unknown as T
}

/**
 * Rewrite every historical assistant message to the identity this adapter stamps.
 *
 * ISSUE #102. pi-ai replays a thinking block as `thinking` only when the message
 * that produced it names the same `provider` / `api` / `model` as the request in
 * flight (`utils/transform-messages.js`, the `isSameModel` branch); everything
 * else is flattened to `{type:'text', text: thinking}`.
 *
 * The durable transcript the HOST hands back does not carry the identity. The
 * agent loop writes `source.provider = request.provider`, and `request.provider`
 * is the ROUTE id (`workbuddy` / `workbuddy-global`), while this adapter stamps
 * `provider: WORKBUDDY_MODEL_IDENTITY` on the model. So:
 *
 *   - CN sessions survive by COINCIDENCE: its route id happens to equal the
 *     identity (`workbuddy` === `workbuddy`).
 *   - GLOBAL sessions never match (`workbuddy-global` !== `workbuddy`), so every
 *     historical thinking block is downgraded on EVERY turn — not only when the
 *     user switches regions, which is what #59's write-up assumed.
 *
 * The model then sees a context in which all of its own past reasoning was
 * plain assistant text, and writes its new reasoning into `text` to match. That
 * is the reported symptom: reasoning collapses to a character or two while the
 * answer channel fills with working notes.
 *
 * The transcript can contain turns from other providers. Rewriting is scoped
 * to the ownedRoutes and identity checks below. The identity is
 * already the field this adapter stamps on the models it serves, and it resolves
 * as a registry key in both regions (issue #75). Nothing about routing, billing
 * or the destination changes: `baseUrl` comes from the model, not from the
 * message.
 *
 * `provider` alone is NOT enough, because the HOST drops the message to
 * `api: 'dsh-foreign'` first. `dsh-llm-pi-ai`'s `replayedAssistant` rejects a
 * replay whose recorded provider differs from `source.provider` and falls back
 * to `foreignAssistant()`, which stamps `api: 'dsh-foreign'` and takes
 * `provider` from `source.provider` — the ROUTE id. That is why the provider
 * mismatch is not merely cosmetic: it also costs the message its native api, and
 * `isSameModel` then fails on the SECOND comparison even after `provider` is
 * repaired. Measured on a real 0.2.1-rc.2 global session, aligning `provider`
 * only still flattened a 1514-character thinking block into 1514 characters of
 * text; aligning both restored `thinking`.
 *
 * So `api` is repaired too, but ONLY from the one value that proves it is a
 * host fallback and not this plugin's own wire format: `dsh-foreign`. Any other
 * api is left exactly as it is.
 *
 * WHY THAT IS NOT FORGING A SIGNATURE. A `foreignAssistant()` message carries
 * thinking blocks with NO `thinkingSignature` (`dsh-llm-pi-ai` builds them as
 * `{type:'thinking', thinking}`), and pi-ai's request builder only emits
 * `reasoning_content` when a signature exists
 * (`api/openai-completions.js`, the `if (signature && isOpenAICompletionsReasoningField(...))`
 * branch). The block is therefore OMITTED from the request, never replayed as
 * signed reasoning — the same thing that happens today, minus the visible text.
 * The message's own `api` field is not read by the request builder at all
 * (grep: only `model.api` is), so this changes no wire shape.
 *
 * A genuinely different model still degrades, because `isSameModel` requires the
 * model id to match and this function deliberately does not rewrite it: the
 * message really was produced by another model. {@link dropForeignThinking}
 * covers that leg separately, through its `requestModelId` argument.
 *
 * Returns the same object when nothing changed, so the common case (an
 * already-normalized transcript) allocates nothing.
 */
export function alignAssistantIdentities(
  context: Context,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
  ownedRoutes: readonly string[] = [WORKBUDDY_PROVIDER, WORKBUDDY_GLOBAL_PROVIDER],
): Context {
  const messages = context.messages
  if (!Array.isArray(messages) || messages.length === 0) return context
  // ISSUE #111: THE MESSAGE MUST BELONG TO THIS PLUGIN FIRST. The docblock
  // above used to claim `dsh-llm` splits history by provider, so a transcript
  // reaching this adapter could only contain this plugin's own turns. That is
  // NOT what the host does: `forAdapter()` (dsh-llm/lib/index.js:2151) only
  // STRIPS `replayState` from a message whose `source.provider` belongs to
  // another adapter — it keeps the message in the list. So a session that
  // switched providers (the user goes from DeepSeek official to WorkBuddy, or
  // back) hands this adapter assistant turns that this plugin never produced,
  // and the old code rewrote THEIR `provider` to `workbuddy` and their `api`
  // to `openai-completions`.
  //
  // That is worse than cosmetic. It relabels a foreign turn as this plugin's
  // own model output, so pi-ai's `isSameModel` compares it against the request
  // and can replay its reasoning as if this model had produced it. It also
  // makes the transcript claim a provenance that is false — the host's own
  // `forAdapter` went out of its way to clear `replayState` precisely so a
  // foreign turn would NOT be replayed, and rewriting the identity handed that
  // turn back through the door `forAdapter` had just closed.
  //
  // So the rewrite is scoped to the routes this bundle owns. A message from any
  // other provider is left EXACTLY as the host built it: its `api` stays
  // `dsh-foreign`, which is the host's honest marker for "not this adapter's
  // wire format", and its `provider` stays whatever that adapter registered.
  const owned = new Set(ownedRoutes)
  let changed = false
  const next = messages.map(message => {
    if (typeof message !== 'object' || message === null) return message
    const record = message as unknown as Record<string, unknown>
    if (record['role'] !== 'assistant') return message
    const provider = record['provider']
    // A foreign turn keeps its own identity. `identity` is accepted here too
    // because the identity IS this plugin's stamp: a message already carrying
    // it is ours by definition (that is the CN case, where route and identity
    // are the same string).
    if (typeof provider !== 'string' || !owned.has(provider) && provider !== identity) return message
    const providerAligned = provider === identity
    // Only the host's own fallback marker is repaired; every other api is the
    // shape this plugin really sends and must be preserved verbatim.
    const apiAligned = record['api'] !== HOST_FOREIGN_API
    if (providerAligned && apiAligned) return message
    changed = true
    const aligned = { ...record }
    if (!providerAligned) aligned['provider'] = identity
    if (!apiAligned) aligned['api'] = 'openai-completions'
    return aligned as unknown as typeof message
  })
  return changed ? { ...context, messages: next } : context
}

/**
 * One foreign thinking block that pi-ai would publish as PROSE, and the reason it
 * would (issue #147).
 *
 * `variant` is not cosmetic: the two are handled by the same repair but they
 * mean different things, and the card explains them differently.
 *
 * - `flattened`: `stopReason` is a normal completion, so `transform-messages`
 *   turns the block into `{type:'text', text: thinking}` — the whole reasoning
 *   body lands in the visible answer.
 * - `dropped`: `stopReason` is `error`/`aborted`, so the entire message is
 *   skipped; nothing reaches the wire and nothing reaches the user. It is
 *   reported anyway, because it still costs context: the model's answer to
 *   "why did my last turn say nothing" is this line, and a caller cannot see it
 *   from the transcript.
 */
export interface ForeignThinkingBlock {
  /** Index of the message in the context's `messages`. */
  messageIndex: number
  /** Index of the block within that message's `content`. */
  blockIndex: number
  /** How many characters of reasoning the block carried. */
  characters: number
  /** Whether pi-ai would flatten it into prose or drop the whole message. */
  variant: 'flattened' | 'dropped'
}

/** Read `content` as a block array without assuming the shape. */
function blocksOf(message: unknown): unknown[] {
  if (typeof message !== 'object' || message === null) return []
  const content = (message as Record<string, unknown>)['content']
  return Array.isArray(content) ? content : []
}

/**
 * Whether this assistant message's identity proves a DIFFERENT model produced it.
 *
 * `requestModelId` closes the THIRD leg of pi-ai's own predicate. `isSameModel`
 * is `provider === … && api === … && model === model.id`
 * (`transform-messages.js:68–70`); this function used to compare only the first
 * two. The consequence was a blind spot the size of one whole route: a session
 * that switches MODELS inside one region — `hy3` → `deepseek-v4.1-flash`, both
 * served by this bundle, both stamped `provider: workbuddy` — keeps the provider
 * and api legs equal, so nothing here noticed, while pi-ai flattened every
 * historical thinking block into the answer channel exactly as in issue #147.
 * The user-visible symptom is #147's, with none of its diagnostics.
 *
 * Passing `undefined` keeps the provider/api-only behaviour, which is what the
 * read-only surfaces and the older call sites expect. Production passes the id
 * of the model the request is actually addressed to.
 */
function isForeignAssistant(
  message: unknown,
  identity: string,
  requestModelId?: string,
): boolean {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  if (record['role'] !== 'assistant') return false
  // The host's own fallback marker beats everything: `foreignAssistant()` sets
  // it precisely to say "this is not the wire format the current request uses".
  if (record['api'] === HOST_FOREIGN_API) return true
  const provider = record['provider']
  if (typeof provider !== 'string' || provider !== identity
    && provider !== WORKBUDDY_PROVIDER && provider !== WORKBUDDY_GLOBAL_PROVIDER) return true
  // Model leg. A message this bundle produced still degrades when the request
  // names a different model id, because that is what `isSameModel` compares.
  // `undefined` on either side means "cannot compare": stay silent rather than
  // report a block pi-ai would have kept.
  if (requestModelId === undefined) return false
  const model = record['model']
  return typeof model === 'string' && model !== requestModelId
}

/**
 * Whether this assistant turn came from a DIFFERENT PROVIDER/route, rather than
 * from a different model on one of this bundle's own routes.
 *
 * WHY THIS DISTINCTION EXISTS (issue #163's live scene). A session switched
 * from `dsh-opencode-go` to a WorkBuddy route mid-turn. The host rebuilt the
 * other provider's assistant turns as `dsh-foreign`, and pi-ai rewrote their
 * unsigned `thinking` blocks into visible `text` — 14,410 / 4,225 / 5,138
 * characters in the measured scene. WorkBuddy's gateway scans every assistant
 * message and refused the turn with business code 11128; all three in-place
 * rescue rungs and three auto-`继续` attempts failed because the bytes never
 * changed.
 *
 * A cross-provider thinking block is different from a same-route model switch:
 * it carries no `thinkingSignature` (the host builds `foreignAssistant()`
 * without one), so it could never be replayed as reasoning. Its only possible
 * contribution to the wire is the prose pi-ai manufactures from it. Dropping it
 * is therefore a correctness repair, not a preference — and it must happen
 * even when the user never opted into {@link dropForeignThinking}.
 *
 * Same-route model switches (`hy3` → `deepseek-v4.1-flash`) stay behind the
 * explicit switch, because those turns WERE produced by this bundle and their
 * reasoning may be worth keeping in the transcript for the user to read.
 */
function isCrossProviderAssistant(
  message: unknown,
  identity: string,
  ownedRoutes: readonly string[],
): boolean {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  if (record['role'] !== 'assistant') return false
  // The host's fallback marker is the strongest signal: `foreignAssistant()`
  // sets it for a turn this adapter did not produce. After
  // `alignAssistantIdentities`, a turn this bundle owns has had the marker
  // repaired away, so a remaining marker means genuinely foreign.
  if (record['api'] === HOST_FOREIGN_API) return true
  const provider = record['provider']
  if (typeof provider !== 'string') return true
  return provider !== identity && !ownedRoutes.includes(provider)
}

/**
 * Every foreign thinking block pi-ai would turn into visible prose (issue #147).
 *
 * THE DEFECT. pi-ai keeps a historical `thinking` block only while
 * `isSameModel` holds — provider AND api AND model id all equal to the request
 * (`transform-messages.js:68`). For everything else it does NOT drop the block:
 * `:87–90` rewrites it to `{type:'text', text: thinking}`, which is the answer
 * channel. A session that moved between providers therefore arrives with its
 * other provider's working notes already spelled as prose, and the model reads
 * that shape and copies it.
 *
 * Issue #147 measured the consequence on a real 80-step turn: 56 assistant
 * messages carried an answer while their own `reasoning` was ≤ 1 character,
 * 20 of them held English working notes totalling 58,960 characters, and CJK
 * fell to 1.37% of the visible text where the preceding six turns had been
 * entirely Chinese. That is not a formatting complaint — it also pushed the
 * session from 696,966 to 758,005 total tokens against an 800,000 compression
 * threshold.
 *
 * WHY THIS IS READ-ONLY. Nothing here rewrites the transcript:
 * {@link dropForeignThinking} does, and the split keeps the DIAGNOSIS available
 * to surfaces that must not change bytes (the card, the reply notice).
 *
 * @param context - a pi-ai context, before or after `alignAssistantIdentities`.
 * @param identity - the identity this adapter stamps on its own models.
 * @param requestModelId - model id the request is addressed to, so the model
 *   leg of pi-ai's predicate is covered too (see {@link isForeignAssistant}).
 *   Omitted, only the provider/api legs are judged.
 * @returns one entry per affected block, in transcript order.
 */
export function foreignThinkingOf(
  context: Context,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
  requestModelId?: string,
): ForeignThinkingBlock[] {
  const messages = (context as { messages?: unknown }).messages
  if (!Array.isArray(messages)) return []
  const found: ForeignThinkingBlock[] = []
  for (const [messageIndex, message] of messages.entries()) {
    if (!isForeignAssistant(message, identity, requestModelId)) continue
    const record = message as Record<string, unknown>
    const stopReason = record['stopReason']
    // Mirrors `transform-messages.js`: an errored or aborted turn is skipped
    // wholesale, so its blocks would not have surfaced either way.
    const variant = stopReason === 'error' || stopReason === 'aborted' ? 'dropped' : 'flattened'
    for (const [blockIndex, block] of blocksOf(message).entries()) {
      if (typeof block !== 'object' || block === null) continue
      const fields = block as Record<string, unknown>
      if (fields['type'] !== 'thinking') continue
      // A REDACTED block is never shown as prose: pi-ai returns `[]` for it
      // (`:75–77`), so it is neither a leak nor a context cost worth naming.
      if (fields['redacted'] === true) continue
      const thinking = fields['thinking']
      const characters = typeof thinking === 'string' ? thinking.length : 0
      // Empty reasoning is dropped before any of the branches that matter
      // (`:83–84`), so reporting it would be a false positive.
      if (characters === 0) continue
      found.push({ messageIndex, blockIndex, characters, variant })
    }
  }
  return found
}

/**
 * The subset of {@link foreignThinkingOf} that is safe to repair without asking.
 *
 * This is the predicate the adapter uses when `dropForeignThinking` is OFF: a
 * turn from another provider/route is dropped unconditionally, because its
 * unsigned thinking block can never be replayed and its flattened prose is what
 * the WorkBuddy gateway refuses (issue #163's provider-switch scene). A turn
 * from this bundle under a different model id is NOT included — that one is
 * still the explicit switch's business.
 *
 * Runs after `alignAssistantIdentities`, so a global-region turn this bundle
 * owns has already had its `dsh-foreign` marker repaired away and is not
 * misclassified.
 */
export function crossProviderThinkingOf(
  context: Context,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
  ownedRoutes: readonly string[] = [WORKBUDDY_PROVIDER, WORKBUDDY_GLOBAL_PROVIDER],
): ForeignThinkingBlock[] {
  const messages = (context as { messages?: unknown }).messages
  if (!Array.isArray(messages)) return []
  return foreignThinkingOf(context, identity).filter(block =>
    isCrossProviderAssistant(messages[block.messageIndex], identity, ownedRoutes))
}

/**
 * Remove the foreign thinking blocks {@link foreignThinkingOf} finds.
 *
 * WHY REMOVAL IS THE HONEST REPAIR. The alternatives are both worse:
 *
 *   - LEAVE IT: pi-ai publishes the other provider's private working notes as
 *     this turn's answer (the #147 defect), so the user reads reasoning instead
 *     of a reply and the model imitates that shape forever after.
 *   - KEEP IT AS THINKING: impossible from here. `isSameModel` is pi-ai's own
 *     predicate over fields this plugin does not control (`model.provider` /
 *     `model.api` / `model.id` are compared against the MESSAGE's), and the
 *     only way to satisfy it is to claim the foreign turn as this model's own
 *     output — which is exactly the provenance lie issue #111 removed. These
 *     blocks carry no `thinkingSignature` (the host builds them that way), so
 *     they could not be replayed as signed reasoning even if claimed.
 *
 * Dropping is what the request builder already does with them in every other
 * branch: an unsigned foreign thinking block is never sent as
 * `reasoning_content`, so its only possible contribution to the wire was the
 * flattened prose this function removes. Every other block — text, tool calls —
 * is left exactly where it is, and so is every message's identity.
 *
 * Idempotent: a second pass finds nothing to remove. Returns the SAME context
 * object when nothing changed, so the common case allocates nothing.
 *
 * @param context - a pi-ai context.
 * @param identity - the identity this adapter stamps on its own models.
 * @param requestModelId - model id the request is addressed to (see
 *   {@link isForeignAssistant}); omitted, only the provider/api legs are judged.
 * @returns the repaired context, or the input when no block qualified.
 */
export function dropForeignThinking(
  context: Context,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
  requestModelId?: string,
): Context {
  return dropThinkingBlocks(context, foreignThinkingOf(context, identity, requestModelId))
}

/** Remove exactly the listed blocks; the one place that edits a transcript. */
function dropThinkingBlocks(context: Context, affected: readonly ForeignThinkingBlock[]): Context {
  if (affected.length === 0) return context
  const messages = (context as unknown as { messages: unknown[] }).messages
  // Group by message first: each message is copied at most once, and a message
  // whose content becomes empty is left in place (pi-ai drops it anyway; moving
  // it here would renumber tool-result pairing for no benefit).
  const byMessage = new Map<number, Set<number>>()
  for (const block of affected) {
    const set = byMessage.get(block.messageIndex) ?? new Set<number>()
    set.add(block.blockIndex)
    byMessage.set(block.messageIndex, set)
  }
  const next = messages.map((message, index) => {
    const remove = byMessage.get(index)
    if (remove === undefined) return message
    const record = message as Record<string, unknown>
    const content = blocksOf(message).filter((_, blockIndex) => !remove.has(blockIndex))
    return { ...record, content }
  })
  return { ...context, messages: next } as Context
}

/**
 * How deeply this wrapper repairs the transcript before it reaches pi-ai.
 *
 * The optional same-route repair defaults to off. Cross-provider repair still
 * runs regardless of that switch; the optional callback reports removed blocks.
 */
export interface TranscriptRepairOptions {
  /**
   * Drop SAME-ROUTE foreign thinking blocks pi-ai would publish as prose
   * (issue #147). `false` keeps the previous behaviour for a model switch
   * inside one route.
   *
   * Cross-provider turns are repaired regardless of this switch (issue #163's
   * provider-switch scene): their unsigned thinking blocks can never be
   * replayed, and their flattened prose is what the gateway refuses.
   */
  dropForeignThinking?: boolean
  /**
   * Told how many blocks that repair removed and where, so a surface can name
   * the condition the user is actually looking at. Called at most once per
   * request, and only when something was removed.
   */
  onForeignThinking?: (blocks: readonly ForeignThinkingBlock[]) => void
}

export function withLegacyContext(
  api: ProviderStreams,
  generation: PiAiGeneration,
  identity: string = WORKBUDDY_MODEL_IDENTITY,
  ownedRoutes: readonly string[] = [WORKBUDDY_PROVIDER, WORKBUDDY_GLOBAL_PROVIDER],
  repair?: TranscriptRepairOptions,
): ProviderStreams {
  /** One place so both branches and both entry points agree on the order. */
  const prepare = (context: Context, requestModelId?: string): Context => {
    const folded = generation === 'modern' ? foldModernContext(context) : adaptLegacyPiAiContext(context)
    const aligned = alignAssistantIdentities(folded, identity, ownedRoutes)
    // ISSUE #147, AFTER alignment on purpose. `foreignThinkingOf` reads the
    // identity to decide what is foreign, so running it first would classify a
    // turn this plugin OWNS (route id still unaligned) as foreign and delete its
    // reasoning — issue #102's regression, from the other direction.
    //
    // ISSUE #163: a CROSS-PROVIDER turn is repaired even when the switch is
    // off. Its thinking block has no signature and can never be replayed, and
    // pi-ai would otherwise flatten it into assistant prose — which is the
    // content the WorkBuddy gateway refused in the measured provider-switch
    // scene. The switch only widens this to a same-route model switch, whose
    // turn this bundle did produce.
    //
    // `requestModelId` is pi-ai's third predicate leg. Without it a switch
    // BETWEEN MODELS inside one region (`hy3` → `deepseek-v4.1-flash`, both on
    // this route) degraded exactly like a cross-provider switch, while this
    // repair saw nothing to do: provider and api both still matched.
    const affected = repair?.dropForeignThinking === true
      ? foreignThinkingOf(aligned, identity, requestModelId)
      : crossProviderThinkingOf(aligned, identity, ownedRoutes)
    if (affected.length === 0) return aligned
    try {
      repair?.onForeignThinking?.(affected)
    } catch {
      // A diagnostic must never fail a chat request.
    }
    return dropThinkingBlocks(aligned, affected)
  }
  if (generation === 'modern') {
    return {
      ...api,
      stream: (model, context, options) =>
        api.stream(model, transcript<Parameters<typeof api.stream>[1]>(prepare(context, model.id)), options),
      streamSimple: (model, context, options) =>
        api.streamSimple(
          model,
          transcript<Parameters<typeof api.streamSimple>[1]>(prepare(context, model.id)),
          options,
        ),
    }
  }
  return {
    ...api,
    stream: (model, context, options) =>
      api.stream(model, transcript<Parameters<typeof api.stream>[1]>(prepare(context, model.id)), options),
    streamSimple: (model, context, options) =>
      api.streamSimple(
        model,
        transcript<Parameters<typeof api.streamSimple>[1]>(prepare(context, model.id)),
        options,
      ),
  }
}

