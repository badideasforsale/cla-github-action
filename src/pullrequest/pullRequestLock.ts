import { getOctokit } from '../octokit'
import * as core from '@actions/core'
import { context } from '@actions/github'
import { getPullRequestNumber } from '../shared/getPullRequestNumber'

/**
 * SF-10: locking is best-effort by design. On failure we `core.error` (which
 * produces a workflow annotation) but do NOT `setFailed` — the lock-after-
 * merge guarantee is a post-merge hardening step, not a blocker for the
 * upstream sign-check flow. If your token lacks `issues: write` permission
 * the lock will fail silently and the merged signatures remain mutable;
 * audit the workflow run logs for the annotation.
 *
 * Future improvement (tracked, not blocking v3.0.0): consider promoting to
 * `setFailed` so misconfigurations surface in the PR UI rather than only in
 * logs. The trade-off is failing the post-merge workflow run red for what
 * amounts to a defense-in-depth step — needs maintainer judgment.
 */
export async function lockPullRequest() {
    core.info('Locking the Pull Request to safe guard the Pull Request CLA Signatures')
    const pullRequestNo: number = getPullRequestNumber()
    try {
        const octokit = await getOctokit()
        await octokit.rest.issues.lock(
            {
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: pullRequestNo
            }
        )
        core.info(`successfully locked the pull request ${pullRequestNo}`)
    } catch (e: any) {
        core.error(`failed when locking the pull request: ${e?.message || e}`)
    }
}
