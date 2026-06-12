import { context } from '@actions/github'

/**
 * Centralized lookup for the PR number this action is operating on.
 *
 * Today this is always `context.issue.number` — the value GitHub sets when
 * the workflow is triggered from a PR event. M5.1 of the v3 plan adds a
 * `pull-request-number` action input so the action can be driven from
 * `workflow_run` and other non-PR triggers; that future override will land
 * here without needing to revisit every call site.
 *
 * Every call site that was previously reading `context.issue.number`
 * directly now routes through this helper.
 */
export function getPullRequestNumber(): number {
  return context.issue.number
}
