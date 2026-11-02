import { Plugin } from '@opencode/plugin'
import { createReviewHook, type ReviewContext } from './review.js'
import { registerRpc } from './rpc.js'
import { createSettings } from './settings.js'

export default Plugin.define({
  id: 'auto-approver',
  async setup(ctx) {
    const settings = createSettings(ctx)
    const rpc = await registerRpc(ctx, settings)
    try {
      const permission = await ctx.permission.hook('evaluate', createReviewHook(ctx as unknown as ReviewContext, settings.get))
      return async () => {
        try { await permission.dispose() } finally { await rpc.dispose() }
      }
    } catch (error) {
      await rpc.dispose()
      throw error
    }
  },
})
