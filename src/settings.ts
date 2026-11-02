export interface Settings {
  enabled: boolean
  agent: string | null
  allow: boolean
  ask: boolean
  fallback: 'ask' | 'deny'
}

type Overrides = Partial<Settings>
type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }
interface Storage {
  get(key: string): Promise<Json | undefined>
  set(key: string, value: Json): Promise<void>
  remove(key: string): Promise<void>
}

const key = 'settings'
const defaults: Settings = { enabled: false, agent: null, allow: false, ask: true, fallback: 'ask' }

function validate(value: unknown): Overrides {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid auto-approver settings')
  const input = value as Record<string, unknown>
  const result: Overrides = {}
  for (const field of ['enabled', 'allow', 'ask'] as const) {
    if (field in input) {
      if (typeof input[field] !== 'boolean') throw new Error(`Invalid setting: ${field}`)
      result[field] = input[field]
    }
  }
  if ('agent' in input) {
    if (input.agent !== null && (typeof input.agent !== 'string' || !input.agent.trim())) throw new Error('Invalid setting: agent')
    result.agent = input.agent as string | null
  }
  if ('fallback' in input) {
    if (input.fallback !== 'ask' && input.fallback !== 'deny') throw new Error('Invalid setting: fallback')
    result.fallback = input.fallback
  }
  for (const name of Object.keys(input)) if (!['enabled', 'agent', 'allow', 'ask', 'fallback'].includes(name)) throw new Error(`Unknown setting: ${name}`)
  return result
}

export function createSettings(ctx: { options: unknown; storage: Storage }) {
  const options = validate(ctx.options)
  let queue: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }
  const get = async (): Promise<Settings> => ({ ...defaults, ...options, ...validate(await ctx.storage.get(key)) })
  return {
    get,
    save: (update: Overrides) => exclusive(async () => {
      const previous = validate(await ctx.storage.get(key))
      await ctx.storage.set(key, { ...previous, ...validate(update) })
      return get()
    }),
    reset: () => exclusive(async () => {
      await ctx.storage.remove(key)
      return get()
    }),
  }
}

export type SettingsStore = ReturnType<typeof createSettings>
