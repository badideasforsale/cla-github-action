import {context} from '@actions/github'
import {setupClaCheck} from './setupClaCheck'
import {lockPullRequest} from './pullrequest/pullRequestLock'

import * as core from '@actions/core'
import * as input from './shared/getInputs'

export async function run() {
  try {
    core.info(`CLA Assistant GitHub Action bot has started the process`)

    /*
     * using a `string` true or false purposely as github action input cannot have a boolean value
     */
    if (
      context.payload.action === 'closed' &&
      input.lockPullRequestAfterMerge() == 'true'
    ) {
      return lockPullRequest()
    }

    // Comments on a closed PR previously ran the full sign-check flow and
    // surfaced confusing failures. Short-circuit instead — once the PR is
    // closed, no new signatures matter and any lock-after-merge handling
    // already happened above.
    if (
      context.eventName === 'issue_comment' &&
      context.payload?.issue?.state === 'closed'
    ) {
      core.info('Skipping: issue_comment against a closed pull request.')
      return
    }

    await setupClaCheck()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
