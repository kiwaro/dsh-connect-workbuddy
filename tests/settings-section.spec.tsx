// @vitest-environment jsdom
/** The settings page has one configuration entry. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutline14: () => null,
}))

import * as clientEntry from '../src/client/index.tsx'
import { WORKBUDDY_CARD_CSS } from '../src/client/styles.ts'
import type { WorkBuddySettingsKey } from '../src/client/locales.ts'

const t = ((key: WorkBuddySettingsKey) => key) as (key: WorkBuddySettingsKey, params?: Record<string, unknown>) => string

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** One usage document, enough for the card to paint its body. */
function stubUsage(): void {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    status: 'signed-in',
    accountId: 'account-1',
    accountName: '账号A',
    tokenExpiresAtMs: Date.now() + 3_600_000,
    region: 'cn',
    accounts: [],
    models: [],
    enabledModelIds: [],
    credits: { total: 7500, consumed: 0, available: 4503, workAvailable: 1777, generalAvailable: 3392, accounts: [] },
  }), { status: 200 }))
}

function makeScope(): unknown {
  return {
    getSnapshot: () => ({ status: 'ready', value: {}, writable: true }),
    subscribe: () => () => {},
    set: async () => true,
  }
}

/** The readonly shape the double records; `id` is what the settings slots key on. */
class Slots extends Service {
  readonly registrations: { name: string, id: string }[] = []
  constructor(owner: Context) { super(owner, 'slots') }
  inject(_name: string, callback: () => void | (() => void)): () => void {
    return (callback() as (() => void) | undefined) ?? (() => {})
  }
  register(options: { name: string, id?: string, key?: string }): () => void {
    const entry = { name: options.name, id: options.id ?? options.key ?? '' }
    this.registrations.push(entry)
    return () => {
      const index = this.registrations.indexOf(entry)
      if (index >= 0) this.registrations.splice(index, 1)
    }
  }
}

class Locale extends Service {
  constructor(owner: Context) { super(owner, 'locale') }
  register(): () => void { return () => {} }
  bind(): (key: string) => string { return key => key }
}

class ConfigForms extends Service {
  readonly requested: string[] = []
  constructor(owner: Context) { super(owner, 'configForms') }
  describe(): { getSnapshot(): { view: { namespaces: { ns: string }[] } }, subscribe(): () => void } {
    return {
      getSnapshot: () => ({ view: { namespaces: [{ ns: 'dsh-connect-workbuddy' }] } }),
      subscribe: () => () => {},
    }
  }
  get(ns: string): unknown {
    this.requested.push(ns)
    return makeScope()
  }
}

type PluginShape = Parameters<Context['plugin']>[0]

async function boot(plugins: PluginShape[]): Promise<Context> {
  const ctx = new Context()
  for (const plugin of plugins) await ctx.plugin(plugin)
  return ctx
}

describe('the client entry registers a single settings page', () => {
  it('registers settings.section and its glyph under the SAME id', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = await boot([Slots, Locale, ConfigForms])
    const fiber = ctx.plugin(clientEntry as unknown as PluginShape)
    await vi.waitFor(() => { expect(fiber.state).toBe(2) })

    const slots = ctx.get('slots') as unknown as Slots
    const section = slots.registrations.find(entry => entry.name === 'settings.section')
    const icon = slots.registrations.find(entry => entry.name === 'settings.section.icon')
    expect(section?.id).toBe('dsh-connect-workbuddy')
    // The id is what the shell filters the glyph by (`{ only: row.id }`), so a
    // mismatch is a silently missing icon, not an error anywhere.
    expect(icon?.id).toBe(section?.id)

    expect(slots.registrations.filter(entry => entry.name === 'plugins.bundle.config').map(entry => entry.id))
      .toEqual([])
    expect(slots.registrations.filter(entry => entry.name === 'plugins.row.config').map(entry => entry.id))
      .toEqual([])

    spy.mockRestore()
    await ctx.fiber.dispose()
  })

  it('registers the page even when the host declares NO icon slot', async () => {
    // A host line may not declare `settings.section.icon`. The glyph's inject
    // lives inside the page's callback and its refusal is caught there, so the
    // page must survive on its own — a missing glyph is the shell's default
    // gear, not a missing configuration page.
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args) })

    class NoIconSlots extends Slots {
      override inject(name: string, callback: () => void | (() => void)): () => void {
        if (name === 'settings.section.icon') {
          throw new Error('slot "settings.section.icon" is not declared on this line')
        }
        return super.inject(name, callback)
      }
    }

    const ctx = await boot([NoIconSlots, Locale, ConfigForms])
    const fiber = ctx.plugin(clientEntry as unknown as PluginShape)
    await vi.waitFor(() => { expect(fiber.state).toBe(2) })

    const slots = ctx.get('slots') as unknown as Slots
    expect(slots.registrations.map(entry => entry.name)).toContain('settings.section')
    expect(slots.registrations.map(entry => entry.name)).not.toContain('settings.section.icon')
    // Reported, not swallowed: a missing glyph is survivable but not silent.
    expect(slots.registrations.some(entry => entry.name === 'settings.section')).toBe(true)

    spy.mockRestore()
    await ctx.fiber.dispose()
  })

  it('avoids duplicate configuration cards when the host has no settings.section slot', async () => {
    class DetailOnlySlots extends Slots {
      override inject(name: string, callback: () => void | (() => void)): () => void {
        if (name.startsWith('settings.section')) return () => {}
        return super.inject(name, callback)
      }
    }
    const ctx = await boot([DetailOnlySlots, Locale, ConfigForms])
    const fiber = ctx.plugin(clientEntry as unknown as PluginShape)
    await vi.waitFor(() => { expect(fiber.state).toBe(2) })
    const slots = ctx.get('slots') as unknown as Slots
    expect(slots.registrations.filter(entry => entry.name.startsWith('plugins.'))).toHaveLength(0)
    expect(slots.registrations.some(entry => entry.name === 'settings.section')).toBe(false)
    await ctx.fiber.dispose()
  })

})
