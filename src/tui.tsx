import { Plugin } from '@opencode/plugin/tui'
import { ApproverRpc } from './rpc.js'
import type { Settings } from './settings.js'
import { describeError } from './errors.ts'
import type { ReviewOutcome } from './review.js'

export default Plugin.define({
  id: 'auto-approver.tui',
  setup(context) {
    const unsubscribe = context.client.rpc(ApproverRpc).events.on('reviewed', event => {
      const outcome = event.data as ReviewOutcome
      const title = outcome.status === 'approved' ? 'Command approved' : outcome.status === 'declined' ? 'Command not approved' : 'Review failed'
      const action = outcome.effect === 'ask' ? 'Manual approval required' : outcome.effect === 'deny' ? 'Command denied' : 'Command allowed'
      const commands = outcome.commands.join(' ; ').replace(/\s+/g, ' ').slice(0, 200)
      context.ui.toast.show({ title: `Auto approver: ${title}`, message: `${commands}\n${action}: ${outcome.reason}`, variant: outcome.status === 'approved' ? 'success' : outcome.status === 'declined' ? 'warning' : 'error' })
    })
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [{
        id: 'auto-approver.settings',
        title: 'Configure auto approver',
        group: 'Auto approver',
        palette: true,
        run: async () => {
          try {
            const rpc = context.client.rpc(ApproverRpc)
            while (true) {
              const settings = await rpc.get({}) as Settings
              const selected = await context.ui.dialog.select({
                title: 'Auto approver',
                options: [
                  { title: `Enabled: ${settings.enabled ? 'on' : 'off'}`, value: 'enabled' },
                  { title: `Reviewer: ${settings.agent ?? 'not selected'}`, value: 'agent' },
                  { title: `Review allow: ${settings.allow ? 'on' : 'off'}`, value: 'allow' },
                  { title: `Review ask: ${settings.ask ? 'on' : 'off'}`, value: 'ask' },
                  { title: `On rejection or error: ${settings.fallback}`, value: 'fallback' },
                  { title: 'Reset to configuration', value: 'reset' },
                ],
              })
              if (!selected) return
              if (selected === 'agent') {
                const agents = await rpc.agents({}) as { id: string }[]
                const agent = await context.ui.dialog.select({ title: 'Select reviewer', options: agents.map(({ id }) => ({ title: id, value: id })) })
                if (agent) await rpc.save({ agent })
              } else if (selected === 'reset') {
                const confirmed = await context.ui.dialog.confirm({ title: 'Reset settings', message: 'Restore the values from the OpenCode configuration?' })
                if (confirmed) await rpc.reset({})
              } else if (selected === 'fallback') {
                const fallback = await context.ui.dialog.select({ title: 'On rejection or error', options: [{ title: 'Ask a person', value: 'ask' }, { title: 'Deny', value: 'deny' }] })
                if (fallback) await rpc.save({ fallback })
              } else if (selected === 'enabled' || selected === 'allow' || selected === 'ask') {
                await rpc.save({ [selected]: !settings[selected] })
              }
            }
          } catch (error) {
            context.ui.toast.show({ title: 'Auto approver', message: describeError(error), variant: 'error' })
          }
        },
      }],
    }))
    return unsubscribe
  },
})
