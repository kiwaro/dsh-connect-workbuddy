import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workbuddyAccountId, type WorkBuddyCredential, type WorkBuddyCredentialStore } from '../src/auth.ts'
import { WorkBuddyCatalog } from '../src/catalog.ts'
import { createWorkBuddyShim, type WorkBuddyShim } from '../src/shim.ts'
import type { WorkBuddyChatResult, WorkBuddyUpstreamClient } from '../src/upstream.ts'
import { resolveDshHome } from '../src/host-peers.ts'
import { FULLWIDTH_BAR, MARKUP_TOKEN } from '../src/dsml-recovery.ts'

let shim: WorkBuddyShim | undefined
afterEach(async () => { await shim?.close(); shim = undefined })
const account = (uid: string): WorkBuddyCredential => ({
  uid, accessToken: 'test', refreshToken: 'test', expiresAtMs: Date.now() + 86400000,
  domain: 'www.codebuddy.cn', source: 'desktop', filePath: '/tmp/test-auth.info',
})
const a = account('journal-A'), b = account('journal-B')
const limited: WorkBuddyChatResult = { ok: false, status: 429, kind: 'soft_rate', message: 'limited' }
function response(id: string, credit: number, content = 'answer'): WorkBuddyChatResult {
  const frame = { id, choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }], usage: { credit } }
  return { ok: true, response: new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`) }
}
function mount(chatStream: (credential: WorkBuddyCredential) => Promise<WorkBuddyChatResult>): WorkBuddyShim {
  return createWorkBuddyShim({
    store: { resolve: async () => a } as unknown as WorkBuddyCredentialStore,
    client: { chatStream } as unknown as WorkBuddyUpstreamClient,
    catalog: new WorkBuddyCatalog(), failoverAccount: async () => b,
  })
}
async function chat(body: Record<string, unknown> = {}): Promise<void> {
  await shim!.ready
  const result = await fetch(`${shim!.baseUrl()}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${shim!.token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'glm-5.3', messages: [{ role: 'user', content: 'hi' }], ...body }),
  })
  expect(result.status).toBe(200)
  await result.text()
}
async function rows(prefix: string) {
  const text = await readFile(join(resolveDshHome(), 'storages', 'dsh-connect-workbuddy', 'response-credits.jsonl'), 'utf8')
  return text.trim().split('\n').map(line => JSON.parse(line)).filter(row => row.r.startsWith(prefix))
}
describe('local credit capture on the real shim stream', () => {
  it('attributes a failed-over response to the account that served it', async () => {
    shim = mount(async credential => credential.uid === a.uid ? limited : response('journal-failover', 1.23))
    await chat()
    expect(await rows('journal-failover')).toEqual([
      expect.objectContaining({ v: 1, r: 'journal-failover', c: 1.23, a: workbuddyAccountId(b) }),
    ])
  })
  it('retains billed markup and its retry after account rotation', async () => {
    let calls = 0
    const mark = `${FULLWIDTH_BAR}DSML${FULLWIDTH_BAR}`
    const residue = `<${mark} validate>\n<${mark} parameter name="spec">{"title":"x"}</${mark} parameter>\n</${mark} invoke>\n</${MARKUP_TOKEN} calls>`
    shim = mount(async () => {
      calls++
      return calls === 1 ? response('journal-retry-first', 0.11, residue)
        : calls === 2 ? limited : response('journal-retry-second', 0.22)
    })
    await chat({ tools: [{ type: 'function', function: { name: 'bash', parameters: { type: 'object', required: ['command'] } } }] })
    expect(calls).toBe(3)
    expect(await rows('journal-retry-')).toEqual([
      expect.objectContaining({ r: 'journal-retry-first', c: 0.11, a: workbuddyAccountId(a) }),
      expect.objectContaining({ r: 'journal-retry-second', c: 0.22, a: workbuddyAccountId(b) }),
    ])
  })
})
