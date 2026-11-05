import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSettings } from '../src/settings.ts'

function setup(options: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>()
  const storage = {
    async get(key: string) { return data.get(key) },
    async set(key: string, value: unknown) { data.set(key, structuredClone(value)) },
    async remove(key: string) { data.delete(key) },
  }
  return { storage, settings: createSettings({ options, storage } as never) }
}

test('safe defaults leave approval disabled and failures for a human', async () => {
  const { settings } = setup()
  const current = await settings.get()
  assert.equal(current.enabled, false)
  assert.equal(current.fallback, 'ask')
  assert.equal(current.timeoutMs, 60_000)
})

test('TUI changes persist across instances and override configuration until reset', async () => {
  const options = { enabled: false, agent: 'config-agent', allow: false, ask: true, fallback: 'ask', timeoutMs: 120_000 }
  const { settings, storage } = setup(options)
  await settings.save({ enabled: true, agent: 'reviewer', fallback: 'deny', timeoutMs: 180_000 })
  const reloaded = createSettings({ options, storage } as never)
  assert.deepEqual(await reloaded.get(), { ...options, enabled: true, agent: 'reviewer', fallback: 'deny', timeoutMs: 180_000 })
  await reloaded.reset()
  assert.deepEqual(await settings.get(), options)
})

test('partial changes preserve previously saved settings and independent flags', async () => {
  const { settings } = setup({ allow: false, ask: false })
  await settings.save({ allow: true })
  await settings.save({ ask: true })
  const current = await settings.get()
  assert.equal(current.allow, true)
  assert.equal(current.ask, true)
  await settings.save({ allow: false })
  assert.equal((await settings.get()).ask, true)
})

test('concurrent changes do not discard each other', async () => {
  const { settings } = setup()
  await Promise.all([settings.save({ allow: true }), settings.save({ fallback: 'deny' })])
  const current = await settings.get()
  assert.equal(current.allow, true)
  assert.equal(current.fallback, 'deny')
})

test('invalid persisted settings and invalid options are rejected', async () => {
  assert.throws(() => setup({ fallback: 'allow' }))
  const { settings, storage } = setup()
  await storage.set('settings', { enabled: 'true' })
  await assert.rejects(settings.get())
  await settings.reset()
  assert.equal((await settings.get()).enabled, false)
})

test('timeout must be a positive integer within the timer range', () => {
  for (const timeoutMs of [0, -1, 1.5, 2_147_483_648, '60000']) {
    assert.throws(() => setup({ timeoutMs }))
  }
})
