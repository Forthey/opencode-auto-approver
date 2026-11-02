import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReviewHook, type PermissionEvent, type ReviewSettings } from '../src/review.ts'

const defaults: ReviewSettings = { enabled: true, agent: 'reviewer', allow: true, ask: true, fallback: 'ask' }
function event(overrides: Partial<PermissionEvent> = {}): PermissionEvent {
  return { sessionID: 'original', action: 'shell', resources: ['git status'], effect: 'ask', ...overrides }
}
function harness(settings: Partial<ReviewSettings> = {}) {
  const calls: string[] = []
  const prompts: string[] = []
  let response = '{"approved":true,"reason":"safe"}'
  let fail = false
  let sequence = 0
  const ctx = {
    agent: { async get({ agentID }: { agentID: string }) { calls.push(`agent:${agentID}`); return agentID === 'reviewer' ? { id: agentID } : undefined } },
    session: {
      async context({ sessionID }: { sessionID: string }) { calls.push(`context:${sessionID}`); return [{ role: 'user', text: 'inspect the repository' }] },
      async create() { const id = `review-${++sequence}`; calls.push(`create:${id}`); return { id } },
      async switchAgent({ sessionID, agent }: { sessionID: string; agent: string }) { calls.push(`switch:${sessionID}:${agent}`) },
      async generate({ sessionID, prompt }: { sessionID: string; prompt: string }) { calls.push(`generate:${sessionID}`); prompts.push(prompt); if (fail) throw new Error('offline'); return { text: response } },
      async remove({ sessionID }: { sessionID: string }) { calls.push(`remove:${sessionID}`) },
    },
  }
  const hook = createReviewHook(ctx, async () => ({ ...defaults, ...settings }))
  return { hook, calls, prompts, setResponse(value: string) { response = value }, setFail() { fail = true } }
}

test('selected requests use configured agent and pass every resource and session context', async () => {
  const h = harness()
  const request = event({ resources: ['git status', 'git diff'] })
  await h.hook(request)
  assert.equal(request.effect, 'allow')
  assert.ok(h.calls.includes('switch:review-1:reviewer'))
  assert.ok(h.calls.includes('remove:review-1'))
  assert.match(h.prompts[0], /git status/)
  assert.match(h.prompts[0], /git diff/)
  assert.match(h.prompts[0], /inspect the repository/)
})

test('disabled, unselected, denied and non-shell requests retain their original decision', async () => {
  for (const [settings, overrides] of [
    [{ enabled: false }, {}], [{ allow: false }, { effect: 'allow' }],
    [{ ask: false }, { effect: 'ask' }], [{}, { effect: 'deny' }], [{}, { action: 'edit' }],
  ] as Array<[Partial<ReviewSettings>, Partial<PermissionEvent>]>) {
    const h = harness(settings)
    const request = event(overrides)
    const before = request.effect
    await h.hook(request)
    assert.equal(request.effect, before)
    assert.equal(h.calls.length, 0)
  }
})

test('rejection, malformed response, missing agent and errors apply configured fallback', async () => {
  for (const fallback of ['ask', 'deny'] as const) {
    for (const mode of ['reject', 'malformed', 'missing', 'error'] as const) {
      const h = harness({ fallback, ...(mode === 'missing' ? { agent: 'missing' } : {}) })
      if (mode === 'reject') h.setResponse('{"approved":false,"reason":"unsafe"}')
      if (mode === 'malformed') h.setResponse('yes')
      if (mode === 'error') h.setFail()
      const request = event({ effect: 'allow' })
      await h.hook(request)
      assert.equal(request.effect, fallback, `${mode} -> ${fallback}`)
      if (mode !== 'missing') assert.ok(h.calls.includes('remove:review-1'))
    }
  }
})

test('concurrent requests get independent reviewer sessions', async () => {
  const h = harness()
  const first = event(), second = event({ sessionID: 'other' })
  await Promise.all([h.hook(first), h.hook(second)])
  assert.equal(first.effect, 'allow')
  assert.equal(second.effect, 'allow')
  assert.ok(h.calls.includes('remove:review-1'))
  assert.ok(h.calls.includes('remove:review-2'))
})

test('reviewer session requests cannot recursively invoke the reviewer', async () => {
  let hook: ReturnType<typeof createReviewHook>
  let generates = 0
  const ctx = {
    agent: { async get() { return {} } },
    session: {
      async context() { return [] },
      async create() { return { id: 'review' } },
      async switchAgent() {},
      async generate() {
        generates++
        const nested = event({ sessionID: 'review' })
        await hook(nested)
        assert.equal(nested.effect, 'ask')
        return { text: '{"approved":true,"reason":"safe"}' }
      },
      async remove() {},
    },
  }
  hook = createReviewHook(ctx, async () => defaults)
  await hook(event())
  assert.equal(generates, 1)
})

test('timeout applies fallback and cleans up reviewer session', async () => {
  let removed = false
  const ctx = {
    agent: { async get() { return {} } },
    session: {
      async context() { return [] },
      async create() { return { id: 'review' } },
      async switchAgent() {},
      async generate() { return new Promise<{text: string}>(() => {}) },
      async remove() { removed = true },
    },
  }
  const request = event()
  await createReviewHook(ctx, async () => ({ ...defaults, fallback: 'deny' }), 10)(request)
  assert.equal(request.effect, 'deny')
  assert.equal(removed, true)
})
