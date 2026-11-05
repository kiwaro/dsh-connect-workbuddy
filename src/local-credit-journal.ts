/** Local integration: retain upstream per-response credits for the status bar. */
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from './host-peers.ts'

export function recordExactCredit(
  chunk: Record<string, unknown>,
  accountId: string | undefined,
  options: { directory?: string, now?: number, onError?: (error: unknown) => void } = {},
): void {
  const usage = chunk['usage']
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return
  const id = chunk['id']
  const credit = (usage as Record<string, unknown>)['credit']
  if (typeof id !== 'string' || id === '' || typeof credit !== 'number' || !Number.isFinite(credit) || credit < 0) return
  try {
    const directory = options.directory ?? join(resolveDshHome(), 'storages', 'dsh-connect-workbuddy')
    mkdirSync(directory, { recursive: true })
    appendFileSync(join(directory, 'response-credits.jsonl'), JSON.stringify({
      v: 1, r: id, c: credit, a: accountId ?? '', t: options.now ?? Date.now(),
    }) + '\n', { encoding: 'utf8', mode: 0o600 })
  } catch (error) {
    options.onError?.(error)
  }
}
