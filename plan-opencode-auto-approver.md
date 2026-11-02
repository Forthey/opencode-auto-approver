---
title: 'OpenCode auto approver'
type: 'feature'
ticket: ''
created: '2026-11-02'
status: 'draft'
route: 'full'
route_source: 'auto'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** OpenCode needs configurable AI review of shell commands before execution.

**Approach:** Build an OpenCode 2 plugin with server-side review and persistent configuration accessible through the config and TUI.

## Boundaries & Constraints

**Always:** Use an agent selected from available OpenCode agents, with command and session context. Independently select `allow` and `ask` decisions for review. Make rejection and failure behavior configurable as manual confirmation or denial. Persist TUI settings with priority over plugin options and provide reset. Default to disabled and manual confirmation.

**Never:** Override explicit `deny`, which the documented API does not expose to the hook. Review non-shell tools. Couple the design unnecessarily to shell commands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Selected | Enabled and effect flag selected | Reviewer approves one command or applies configured fallback | Failure and malformed response use fallback |
| Unselected | Disabled, non-shell, or effect not selected | Preserve original effect | No reviewer call |
| Denied | Explicit configured deny | OpenCode denies without invoking hook | Never override |
| Settings | TUI saves or resets | Saved settings override options, reset restores options | Invalid agent uses configured fallback |
| Fallback | Reviewer rejects or cannot decide | Ask human or deny according to settings | Never implicitly approve |

</frozen-after-approval>

## Code Map

- Repository has no application code or existing package configuration. `_bmad/` belongs to the user's BMad setup and must remain untouched.
- OpenCode 2 server API: `ctx.permission.hook("evaluate")`, `ctx.agent.list/get`, `ctx.session.context`, `ctx.storage`, and plugin RPC. Explicit deny bypasses hook. See https://opencode.ai/v2/docs/build/plugins/server.
- TUI uses `@opencode/plugin/tui` and command palette dialogs. Typed RPC connects TUI to server. See https://opencode.ai/v2/docs/build/plugins/cli and https://opencode.ai/v2/docs/build/plugins/rpc.
- `ctx.session.generate` and transient generation require further type-level investigation to verify selected agent instructions and model are honored without deadlocking the active session. Investigate a temporary session with `switchAgent` and `generate`, passing the original context and removing the temporary session afterward. Do not silently substitute a bare model for the selected agent.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` and TypeScript configuration - create plugin package targeting installed OpenCode 2.1.0 and compatible SDK.
- [ ] `src/server.ts` and `src/review.ts` - implement permission review, resolve the selected agent through supported API, enforce structured verdict, isolate reviewer execution and prevent recursion. Verify the review invocation cannot deadlock the originating session.
- [ ] `src/settings.ts` and `src/rpc.ts` - validate options and persistent overrides, expose settings and agent list to TUI, implement reset and configured fallback.
- [ ] `src/tui.tsx` - add palette command for agent selection, mode toggles, failure behavior and reset through RPC.
- [ ] `tests/` - test matrix, independently selected flags, multi-resource requests, invalid responses, persistence, reset, concurrency and recursion.
- [ ] `README.md` - document installation, options, TUI, limitations and verification, following code-docs.

**Acceptance Criteria:**
- Given the plugin is installed, when a selected shell permission is evaluated, then the configured agent reviews the command in its session context before execution.
- Given TUI settings are saved, when OpenCode restarts, then those values remain active until reset.
- Given the agent cannot decide, when fallback is configured, then the resulting effect is ask or deny as configured.
- Given an explicit deny or an unrelated tool, when it is evaluated, then existing OpenCode behavior remains intact.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- Run the package's unit tests and type check - all pass.
- Load the installed plugin in OpenCode 2.1.0 and exercise review, TUI persistence and both fallback modes - behavior matches the matrix.
