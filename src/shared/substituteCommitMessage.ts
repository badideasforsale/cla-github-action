export interface CommitMessageVars {
  contributorName: string
  pullRequestNo: number | string
  owner: string
  repo: string
}

/**
 * Build the commit message stamped onto signed-contributor pushes.
 *
 * When `template` is empty/undefined, return the default
 * `@<contributor> has signed the CLA in <owner>/<repo>#<n>` form.
 *
 * Otherwise substitute the known tokens. Uses a global regex so a template
 * that references the same token twice (legitimate use case) replaces both
 * sites — the prior code used `.replace('$contributorName', ...)` which
 * only touched the first occurrence.
 */
export function buildCommitMessage(
  template: string | undefined,
  vars: CommitMessageVars
): string {
  if (!template) {
    return `@${vars.contributorName} has signed the CLA in ${vars.owner}/${vars.repo}#${vars.pullRequestNo}`
  }
  return template
    .replace(/\$contributorName/g, vars.contributorName)
    .replace(/\$pullRequestNo/g, String(vars.pullRequestNo))
    .replace(/\$owner/g, vars.owner)
    .replace(/\$repo/g, vars.repo)
}
