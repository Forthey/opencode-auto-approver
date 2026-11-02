import { Rpc } from '@opencode/plugin/rpc'
import type { Settings, SettingsStore } from './settings.js'

const properties = {
  enabled: { type: 'boolean' },
  agent: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  allow: { type: 'boolean' },
  ask: { type: 'boolean' },
  fallback: { enum: ['ask', 'deny'] },
} as const
const settingsSchema = { type: 'object', properties, required: ['enabled', 'agent', 'allow', 'ask', 'fallback'], additionalProperties: false } as const
const emptySchema = { type: 'object', properties: {}, additionalProperties: false } as const

export const ApproverRpc = Rpc.define({
  id: 'auto-approver',
  methods: {
    get: { input: emptySchema, output: settingsSchema },
    save: { input: { type: 'object', properties, additionalProperties: false }, output: settingsSchema },
    reset: { input: emptySchema, output: settingsSchema },
    agents: { input: emptySchema, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } } },
  },
  events: {},
})

export function registerRpc(ctx: any, settings: SettingsStore) {
  return ctx.rpc.register(ApproverRpc, {
    get: () => settings.get(),
    save: (input: unknown) => settings.save(input as Partial<Settings>),
    reset: () => settings.reset(),
    agents: async () => {
      const response = await ctx.agent.list()
      const agents = Array.isArray(response) ? response : response.data
      if (!Array.isArray(agents)) throw new Error('Could not load OpenCode agents')
      return agents.map((agent: { id: string }) => ({ id: agent.id }))
    },
  })
}
