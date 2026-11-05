import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { recordExactCredit } from '../src/local-credit-journal.ts'

describe('local status-bar credit journal', () => {
  it('retains account rotation and zero credits without prompt content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wb-credit-'))
    recordExactCredit({ id: 'first', usage: { credit: 1.25 }, choices: [{ secret: 'private prompt' }] }, 'account-A', { directory, now: 100 })
    recordExactCredit({ id: 'second', usage: { credit: 0 } }, 'account-B', { directory, now: 101 })
    const text = readFileSync(join(directory, 'response-credits.jsonl'), 'utf8')
    expect(text).not.toContain('private prompt')
    expect(text.trim().split('\n').map(line => JSON.parse(line))).toEqual([
      { v: 1, r: 'first', c: 1.25, a: 'account-A', t: 100 },
      { v: 1, r: 'second', c: 0, a: 'account-B', t: 101 },
    ])
  })
  it('ignores invalid frames and keeps stream handling alive on write failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wb-credit-'))
    for (const chunk of [{id:'x',usage:{credit:-1}}, {id:'x',usage:{credit:'1'}}, {usage:{credit:1}}, {id:'x'}]) {
      expect(() => recordExactCredit(chunk, 'A', {directory})).not.toThrow()
    }
    const file = join(directory, 'file'); writeFileSync(file, '')
    const errors: unknown[] = []
    expect(() => recordExactCredit({id:'x',usage:{credit:1}}, 'A', {directory:file,onError:error=>errors.push(error)})).not.toThrow()
    expect(errors).toHaveLength(1)
  })
})
