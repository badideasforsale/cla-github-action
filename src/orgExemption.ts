import { context } from '@actions/github'
import * as core from '@actions/core'

import { CommittersDetails } from './interfaces'
import { getOctokit } from './octokit'
import * as input from './shared/getInputs'

/**
 * FEAT-EXEMPT-ORG (upstream PR #157, issue #100): when the
 * `exempt-repo-org-members` input is `'true'`, treat members of the
 * repository's owning organization as already-allowlisted and drop them from
 * the CLA check.
 *
 * Public-org membership is visible to the default `GITHUB_TOKEN`; private
 * membership requires a token with `read:org` scope (PAT or App). If the
 * lookup fails for any reason we emit a warning and return committers
 * unchanged — this should never block the primary CLA flow.
 */
export async function applyOrgExemption(
  committers: CommittersDetails[]
): Promise<CommittersDetails[]> {
  if (input.getExemptRepoOrgMembers() !== 'true') {
    return committers
  }
  const members = await getRepoOrgMembers()
  if (members.length === 0) return committers
  const memberSet = new Set(members.map(m => m.toLowerCase()))
  const exempt = committers.filter(c => memberSet.has(c.name.toLowerCase()))
  if (exempt.length > 0) {
    core.info(
      `Exempting ${exempt.length} org member${exempt.length === 1 ? '' : 's'} from CLA check: ${exempt.map(c => c.name).join(', ')}`
    )
  }
  return committers.filter(c => !memberSet.has(c.name.toLowerCase()))
}

/**
 * Fetch GitHub logins of every member of the repository's owning org via
 * GraphQL. Returns `[]` when:
 *  - the owner is a user account (not an org) — `organization()` returns null
 *  - the lookup throws (auth/permissions/network) — we log a warning and
 *    fall through; org exemption is auxiliary and must never break the
 *    CLA flow.
 *
 * Paginated 100 at a time. No bound on org size; this is the responsibility
 * of consumers who enable the feature on a 10k-member org.
 */
async function getRepoOrgMembers(): Promise<string[]> {
  const owner = context.repo.owner
  const members: string[] = []
  let cursor: string | null = null
  try {
    const octokit = await getOctokit()
    /* eslint-disable no-constant-condition */
    while (true) {
      const response: any = await octokit.graphql(
        `
          query($org: String!, $cursor: String) {
            organization(login: $org) {
              membersWithRole(first: 100, after: $cursor) {
                nodes { login }
                pageInfo { endCursor hasNextPage }
              }
            }
          }
        `,
        { org: owner, cursor }
      )
      if (!response?.organization) {
        core.debug(
          `Owner "${owner}" is not an organization — no members to exempt.`
        )
        return []
      }
      const page = response.organization.membersWithRole
      for (const node of page.nodes ?? []) {
        if (node?.login) members.push(node.login)
      }
      if (!page.pageInfo?.hasNextPage) break
      cursor = page.pageInfo.endCursor
    }
  } catch (err: any) {
    core.warning(
      `Could not fetch org members for exemption — continuing without org-exemption. ` +
        `If the org is private you'll need a PAT or App token with read:org scope. ` +
        `(${err?.message || err})`
    )
    return []
  }
  return members
}
