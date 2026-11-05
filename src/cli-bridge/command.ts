/**
 * `/codebuddy` — one CodeBuddy turn started from the composer.
 *
 * WHY A COMMAND AND NOT JUST THE TOOL. `codebuddy_ask` only runs when the model
 * decides to call it, which costs a DSH turn and a decision. A slash command is
 * the one host channel that executes against the receiving agent WITHOUT sending
 * the line to the model, so the WORK costs no DSH turns.
 *
 * THE ONE THING IT DOES SPEND BY DEFAULT. On success the result is handed back to
 * the session's model so the conversation knows what happened, and that wake-up
 * is a real DSH turn with real tokens. The first draft's description claimed the
 * command "does not consume DSH quota", which is false under the default
 * `injectResult: true`; the description now says so. With `injectResult: false`
 * the promise holds: nothing but the human sees the result.
 *
 * WHAT AN EMPTY LINE MEANS. `/codebuddy` alone is a review: the built-in brief
 * asks CodeBuddy to read the uncommitted changes and report problems. Anything
 * the human types is sent verbatim instead.
 *
 * @module dsh-connect-workbuddy/cli-bridge/command
 */
import { formatInjection, injectOutcome } from './inject.ts'
import type { InjectionOutcome } from './inject.ts'
import type { BridgeCommandInvocation, BridgeCommandsService, BridgeLog } from './services.ts'
import { runAsk, sessionDirOf as sessionDirOfForCommand } from './tool.ts'
import type { AskDeps, AskResult, DirectoryOf } from './tool.ts'

/** The command name as registered (no leading slash). */
export const COMMAND_NAME = 'codebuddy'

/**
 * The mode a review runs in.
 *
 * NOT `plan`. `plan` under `-p` answers a write attempt by asking the driver to
 * approve an `ExitPlanMode` hand-off, and the only answer an unattended bridge
 * can give is a denial — so a "review" in plan mode tends to end as a failed
 * turn with no findings, which is the least useful possible outcome. `dontAsk`
 * gets the read half (Read/Glob/Grep/Bash) auto-approved and refuses the write
 * half, which is exactly what a review needs. Measured both ways; see the module
 * comment in `./runner.ts`.
 */
const REVIEW_PERMISSION_MODE = 'dontAsk'

/**
 * The brief an empty `/codebuddy` line expands to.
 *
 * It names the scope AND the failure mode it wants avoided ("只报你确实看见的
 * 问题"): a review that guesses is worse than one that says less, because the
 * human cannot tell the two apart in the output.
 */
const REVIEW_BRIEF =
  '审查当前工作区未提交的修改；工作区干净时审查最近一次提交。' +
  '运行 git 命令确定审查范围，读取相关文件后说明：' +
  '实际发现的问题、代码依据、影响和修改建议。'

/**
 * The opt-in prefix that lets ONE invocation write.
 *
 * WHY THIS EXISTS. The default permission mode refuses writes, which is the
 * right default for a bridge that a model can drive. But the command's own hint
 * used to invite `修一下这个空指针` while offering no way to grant the write
 * half of that request, so the documented example could only ever end in
 * "这些工具被拒绝". The tool entrance had `permission_mode` for this; the
 * command entrance had nothing. `--edit` is that missing knob, and it is
 * deliberately per-invocation rather than a config flip: a human typing it is
 * the consent, and it does not loosen the default for every later turn.
 */
export const EDIT_FLAG = '--edit'

/** The mode `--edit` selects for the one turn it appears on. */
const EDIT_PERMISSION_MODE = 'acceptEdits'

/** One parsed composer line. */
export interface CommandInput {
  /** What is actually sent to CodeBuddy. */
  prompt: string
  /** How the human's words were used, for the result label. */
  label: string
  /** True when this is the built-in review (empty line, or `--edit` alone). */
  review: boolean
  /** Permission mode to pass for this turn; '' means "use the configured one". */
  permissionMode: string
}

/**
 * Read the composer line.
 *
 * Empty → the review brief. Non-empty → the text verbatim, because a human who
 * typed something meant it, and silently prepending a review brief to "改一下
 * 这个 bug" is how a command does something other than what it was asked.
 *
 * `--edit` is stripped and remembered rather than forwarded: CodeBuddy must not
 * see a flag that only means something to this bridge.
 */
export function parseCommandInput(raw: string): CommandInput {
  const note = raw.trim()
  if (note === '') {
    return { prompt: REVIEW_BRIEF, label: '（未提交改动）', review: true, permissionMode: REVIEW_PERMISSION_MODE }
  }

  const edit = /^--edit(?:\s|$)/u.test(note)
  const body = edit ? note.replace(/^--edit\s*/u, '').trim() : note

  if (body === '') {
    // `--edit` on its own: find the problems and fix them in the same turn.
    return { prompt: REVIEW_BRIEF, label: '（未提交改动，可写）', review: true, permissionMode: EDIT_PERMISSION_MODE }
  }

  return {
    prompt: body,
    label: edit ? `（可写：${body}）` : `（指令：${body}）`,
    review: false,
    permissionMode: edit ? EDIT_PERMISSION_MODE : '',
  }
}

/** What the composer line becomes. */
export function composeCommandPrompt(raw: string): string {
  return parseCommandInput(raw).prompt
}

/** A one-line label saying how the human's words were used. */
export function commandScopeLabel(raw: string): string {
  return parseCommandInput(raw).label
}

/** Whether this invocation is the built-in review (empty line, or `--edit` alone). */
export function isReviewInvocation(raw: string): boolean {
  return parseCommandInput(raw).review
}

/** The permission mode this invocation runs in; '' means "use the configured one". */
export function permissionModeForInvocation(raw: string): string {
  return parseCommandInput(raw).permissionMode
}

/**
 * Render one turn outcome as the plain text a command result carries.
 *
 * The footer is the same shape the tool renders, because a human reading a
 * command result wants the same facts: which session, how many turns, what it
 * cost, and where it ran. The one thing added here is the working directory —
 * a command result is the only place the human learns WHICH tree was reviewed.
 *
 * `injection` is the delivery outcome of handing the result to the session's
 * model. It is rendered on its own line because "the command ran" and "the model
 * was told" are different facts and the human is entitled to both; omitting it
 * means no delivery was attempted (failed turn, or disabled).
 */
export function formatCommandOutcome(
  value: AskResult,
  extra: { raw?: string; injection?: InjectionOutcome } = {},
): string {
  const scope = commandScopeLabel(extra.raw ?? '')
  if (!value.ok) {
    return `CodeBuddy 失败${scope}：${value.error === '' ? '未知错误' : value.error}`
  }
  const body = value.reply.trim()
  const head = body === '' ? `CodeBuddy 完成${scope}：任务已结束，输出为空。` : `CodeBuddy 完成${scope}：\n\n${body}`
  const toolList =
    value.tools.length > 0
      ? value.tools.map(tool => (tool.count > 1 ? `${tool.name}×${String(tool.count)}` : tool.name)).join(', ')
      : '无'
  const denied =
    value.denied_tools.length > 0
      ? `\n\n[注意：CodeBuddy 请求过这些工具但被拒绝：${value.denied_tools.join(', ')}。` +
        '需要修改文件时，在指令前添加 --edit，仅本次生效；' +
        '也可设置 cliBridge.permissionMode=acceptEdits，作为后续调用的默认权限]'
      : ''
  const footer =
    `\n\n[session_id=${value.session_id === '' ? '?' : value.session_id} turns=${String(value.num_turns)} ` +
    `tool_calls=${String(value.tool_calls)} tools=${toolList} ` +
    `tokens=${String(value.tokens_in)}in/${String(value.tokens_out)}out ` +
    `(cache_read=${String(value.cache_read_tokens)}) elapsed_ms=${String(value.elapsed_ms)} cred=${value.credential_region}` +
    (value.working_dir !== '' ? ` dir=${value.working_dir}` : '') +
    ']'
  const truncated = value.truncated
    ? '\n\n[注意：输出已截断。请让 CodeBuddy 将完整结果保存到文件后读取]'
    : ''
  const delivery = extra.injection === undefined ? '' : `\n\n${formatInjection(extra.injection)}`
  return head + denied + footer + truncated + delivery
}

/** What `mountCodebuddyCommand` needs from the host half. */
export type CommandDeps = AskDeps

/**
 * The command's slice of the invocation the tool's resolver needs.
 *
 * The command's agent IS a live agent (the Host's command service passes the
 * whole thing, not a narrowed subset), so it satisfies `BridgeToolExecution`
 * structurally. The `signal` field is carried so the shared resolver sees the
 * same object shape it sees from a tool call.
 */
function sessionDirOfCommand(
  invocation: BridgeCommandInvocation,
  directoryOf: DirectoryOf | undefined,
): string {
  return sessionDirOfForCommand(
    {
      ...(invocation.agent !== undefined ? { agent: invocation.agent } : {}),
      ...(invocation.signal !== undefined ? { signal: invocation.signal } : {}),
    },
    directoryOf,
  )
}

/**
 * Register `/codebuddy`, returning the disposer.
 *
 * `commands` is passed in rather than looked up so a Host without the service
 * degrades to "no command" instead of failing the mount — the command is an
 * addition, not a load-bearing part of the plugin.
 *
 * CONCURRENCY IS NOT TRACKED HERE ANY MORE. The first draft kept its own
 * `inFlight` set, which covered `/codebuddy` calls against each other and nothing
 * else: a tool call and a command could run two agents in the same workspace at
 * once, and neither counted against any budget. Both entrances now go through
 * `runAsk`, so the shared `TurnGate` in `./gate.ts` is the single place that
 * decides "one at a time per session" and "N per hour".
 */
export function mountCodebuddyCommand(commands: BridgeCommandsService | undefined, deps: CommandDeps): () => void {
  if (commands === undefined || typeof commands.register !== 'function') return () => {}
  const { options, log } = deps

  try {
    return commands.register({
      name: COMMAND_NAME,
      description:
        '在当前工作区调用 CodeBuddy。留空时审查未提交的修改；添加 --edit 时允许本次修改文件。' +
        `默认将结果发送给当前会话模型，此步骤会增加模型请求及 token 消耗；` +
        '设置 injectResult=false 可关闭结果发送。每次调用均消耗 CodeBuddy 账号额度。',
      input: {
        hint: '留空时审查未提交的修改；填写任务要求时只读执行；以 --edit 开头时允许修改文件。',
      },
      handler: async (invocation: BridgeCommandInvocation) => {
        // The command has no tool-call context, so the workspace comes from the
        // session. This is the whole reason the command can promise a working
        // directory when the tool has to be told one.
        //
        // SAME RESOLVER AS THE TOOL, deliberately. Both entrances used to read
        // `agent.session.header.cwd` — the session's creation-time directory — and
        // the tool then layered a ladder on top of it while the command had
        // nothing, so the two disagreed about what "this session's workspace"
        // meant. The tool's resolver now prefers the Host's live working-directory
        // projection and keeps the header only as its fallback, and the command
        // uses it too so the two entrances can never drift apart again.
        const cwd = sessionDirOfCommand(invocation, deps.directoryOf)
        if (cwd === '') {
          return {
            kind: 'error',
            text:
              '当前会话缺少工作区路径，' +
              '请在已打开工作目录的会话中调用 CodeBuddy。',
          }
        }

        const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput : ''
        const parsed = parseCommandInput(raw)

        const startedAt = Date.now()
        try {
          const value = await runAsk(
            {
              message: parsed.prompt,
              working_dir: cwd,
              ...(parsed.permissionMode !== '' ? { permission_mode: parsed.permissionMode } : {}),
            },
            {
              ...(invocation.agent !== undefined ? { agent: invocation.agent } : {}),
              ...(invocation.signal !== undefined ? { signal: invocation.signal } : {}),
            },
            deps,
            'command',
          )
          log(`command /${COMMAND_NAME} finished in ${String(Date.now() - startedAt)}ms (ok=${String(value.ok)})`)

          // Hand a SUCCESSFUL result to the session's model. This is the one
          // place the command touches the model, and it does so with a single
          // attributed message — the command's own zero-DSH-turn property is
          // about the WORK, not about never telling the model what happened.
          // A failed turn is not injected: the human reads the error, and waking
          // a model to say "it failed" spends a turn on nothing.
          const injection =
            value.ok && options.injectResult
              ? injectOutcome(invocation.agent, {
                  reply: value.reply,
                  dir: cwd,
                  scope: commandScopeLabel(raw),
                  toolCalls: value.tool_calls,
                  tools: value.tools,
                })
              : undefined

          return {
            kind: value.ok ? ('success' as const) : ('error' as const),
            text: formatCommandOutcome(value, {
              raw,
              ...(injection !== undefined ? { injection } : {}),
            }),
          }
        } catch (error) {
          // `runAsk` reports failures as `ok: false` rather than throwing, but a
          // plugin must not rest its no-crash guarantee on that contract.
          const text = error instanceof Error ? error.message : String(error)
          log(`command /${COMMAND_NAME} threw: ${text}`)
          return { kind: 'error' as const, text: `CodeBuddy 异常终止：${text}` }
        }
      },
    })
  } catch (error) {
    log(`command registration failed: ${error instanceof Error ? error.message : String(error)}`)
    return () => {}
  }
}

/** Re-exported so the mount half does not need a second import site. */
export type { BridgeLog }
