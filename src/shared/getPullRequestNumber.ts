import { context } from '@actions/github'
import * as core from '@actions/core'

/**
 * Centralized lookup for the PR number this action is operating on.
 *
 * Resolution order:
 *   1. The `pull-request-number` action input, if set to a valid positive integer.
 *      This is the M5.1 override that lets the action be driven from
 *      `workflow_run` (or any other event whose payload doesn't carry a PR
 *      number directly).
 *   2. `context.issue.number` — the value GitHub populates from a `pull_request`
 *      or `pull_request_target` trigger.
 *
 * If the input is set but malformed, we warn and fall through to the context.
 * Bad input never silently routes the action to PR #0 or NaN.
 */
export function getPullRequestNumber(): number {
  const fromInput = core.getInput('pull-request-number')
  if (fromInput) {
    const parsed = parseInt(fromInput, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
    core.warning(
      `Invalid pull-request-number input "${fromInput}"; falling back to context.issue.number.`
    )
  }
  return context.issue.number
}
