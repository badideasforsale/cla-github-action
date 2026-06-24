import * as core from '@actions/core'
import { getOctokit } from './octokit'

/**
 * FEAT-ALLOWLIST-ORGS-AND-TEAMS: parse `@org` and `@org/team` entries out of
 * the comma-separated `allowlist` input, resolve them to GitHub logins via
 * paginated GraphQL, and return the deduped union of logins.
 *
 * Auth requirements (same as orgExemption.ts):
 *   - Public org/team membership is visible to the default `GITHUB_TOKEN`.
 *   - Private orgs/teams require a PAT or App installation with `read:org`
 *     scope in the target org.
 *
 * Failure semantics: per-entry. Each org/team lookup that fails (404 from a
 * non-existent or private org we can't read, auth failure, network) emits a
 * `core.warning` and is skipped. The CLA check continues with whatever
 * successfully resolved — org exemption must never block the primary flow.
 *
 * Cap: 50 pages × 100 members = 5000 members per entry. If exceeded, warn
 * and truncate; that's a degenerate org for an allowlist use case.
 */

const MAX_PAGES = 50

export interface ParsedAllowlist {
  /** Plain user logins and wildcard patterns (existing semantics). */
  patterns: string[]
  /** `org` slugs from `@org` entries (no leading @). */
  orgs: string[]
  /** `{ org, team }` pairs from `@org/team` entries. */
  teams: { org: string; team: string }[]
}

/**
 * Split the raw `allowlist` input into the three entry buckets. Validates
 * shape but not existence: invalid entries (e.g. `@`, `@org/`, `@/team`)
 * emit a warning and are dropped.
 */
export function parseAllowlistEntries(raw: string): ParsedAllowlist {
  const patterns: string[] = []
  const orgs: string[] = []
  const teams: { org: string; team: string }[] = []
  if (!raw) return { patterns, orgs, teams }

  // GitHub org/user slugs: letters, digits, hyphens; cannot start with `-`;
  // ≤ 39 chars. Team slugs are more permissive (also allow `_` and `.`).
  const orgSlug = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
  const teamSlug = /^[A-Za-z0-9._-]{1,}$/

  for (const rawEntry of raw.split(',')) {
    const entry = rawEntry.trim()
    if (!entry) continue
    if (!entry.startsWith('@')) {
      patterns.push(entry)
      continue
    }
    const body = entry.slice(1)
    const slash = body.indexOf('/')
    if (slash === -1) {
      // @org
      if (!orgSlug.test(body)) {
        core.warning(
          `Allowlist entry "${entry}" is not a valid GitHub org slug; skipping.`
        )
        continue
      }
      orgs.push(body)
    } else {
      // @org/team
      const org = body.slice(0, slash)
      const team = body.slice(slash + 1)
      if (!orgSlug.test(org) || !teamSlug.test(team)) {
        core.warning(
          `Allowlist entry "${entry}" is not a valid @org/team reference; skipping.`
        )
        continue
      }
      teams.push({ org, team })
    }
  }

  // Dedup orgs case-insensitively (GitHub slugs are case-insensitive).
  const seenOrgs = new Set<string>()
  const dedupedOrgs = orgs.filter(o => {
    const key = o.toLowerCase()
    if (seenOrgs.has(key)) return false
    seenOrgs.add(key)
    return true
  })
  // Dedup teams by (org, team) case-insensitively.
  const seenTeams = new Set<string>()
  const dedupedTeams = teams.filter(t => {
    const key = `${t.org.toLowerCase()}/${t.team.toLowerCase()}`
    if (seenTeams.has(key)) return false
    seenTeams.add(key)
    return true
  })

  return { patterns, orgs: dedupedOrgs, teams: dedupedTeams }
}

/**
 * Resolve every parsed @org and @org/team entry to a set of GitHub logins
 * (lowercased). Per-entry failures warn and are skipped.
 */
export async function expandOrgsAndTeams(
  parsed: ParsedAllowlist
): Promise<Set<string>> {
  const logins = new Set<string>()
  if (parsed.orgs.length === 0 && parsed.teams.length === 0) {
    return logins
  }
  const octokit = await getOctokit()

  for (const org of parsed.orgs) {
    try {
      const members = await fetchOrgMembers(octokit, org)
      for (const m of members) logins.add(m.toLowerCase())
    } catch (err: any) {
      core.warning(
        `Could not expand allowlist entry "@${org}" — falling back to CLA check for its members. ` +
          `If "${org}" is a private org, your token needs read:org scope. (${err?.message || err})`
      )
    }
  }

  for (const { org, team } of parsed.teams) {
    try {
      const members = await fetchTeamMembers(octokit, org, team)
      for (const m of members) logins.add(m.toLowerCase())
    } catch (err: any) {
      core.warning(
        `Could not expand allowlist entry "@${org}/${team}" — falling back to CLA check for its members. ` +
          `Team lookups always require read:org. (${err?.message || err})`
      )
    }
  }

  return logins
}

async function fetchOrgMembers(octokit: any, org: string): Promise<string[]> {
  // P-7: `membersWithRole` includes admins + members of the org. It does NOT
  // include outside collaborators — repos can grant individual access without
  // org membership, and those users are invisible here. A consumer who
  // allowlists `@acme-corp` to exempt "everyone at acme" may be surprised
  // when a long-running outside-collaborator contributor still hits the CLA
  // gate. Document but don't change: outside collaborators don't have a
  // claim to the corporate CLA the consumer is presumably relying on, so
  // requiring them to sign individually is the safer default.
  const out: string[] = []
  let cursor: string | null = null
  let pages = 0
  /* eslint-disable no-constant-condition */
  while (true) {
    const response: any = await octokit.graphql(
      `query($org: String!, $cursor: String) {
        organization(login: $org) {
          membersWithRole(first: 100, after: $cursor) {
            nodes { login }
            pageInfo { endCursor hasNextPage }
          }
        }
      }`,
      { org, cursor }
    )
    if (!response?.organization) {
      // org doesn't exist or isn't visible — treat as a soft failure.
      throw new Error(`organization "${org}" not found or not visible to this token`)
    }
    const page = response.organization.membersWithRole
    for (const node of page.nodes ?? []) {
      if (node?.login) out.push(node.login)
    }
    if (!page.pageInfo?.hasNextPage) break
    pages++
    if (pages >= MAX_PAGES) {
      core.warning(
        `Org "@${org}" has more than ${MAX_PAGES * 100} members; truncating allowlist expansion.`
      )
      break
    }
    cursor = page.pageInfo.endCursor
  }
  return out
}

async function fetchTeamMembers(
  octokit: any,
  org: string,
  team: string
): Promise<string[]> {
  const out: string[] = []
  let cursor: string | null = null
  let pages = 0
  // `membership: ALL` includes immediate members AND child-team members.
  // Default would be IMMEDIATE which is usually surprising for an allowlist.
  /* eslint-disable no-constant-condition */
  while (true) {
    const response: any = await octokit.graphql(
      `query($org: String!, $team: String!, $cursor: String) {
        organization(login: $org) {
          team(slug: $team) {
            members(first: 100, after: $cursor, membership: ALL) {
              nodes { login }
              pageInfo { endCursor hasNextPage }
            }
          }
        }
      }`,
      { org, team, cursor }
    )
    const teamNode = response?.organization?.team
    if (!teamNode) {
      throw new Error(
        `team "${org}/${team}" not found or not visible to this token`
      )
    }
    const page = teamNode.members
    for (const node of page.nodes ?? []) {
      if (node?.login) out.push(node.login)
    }
    if (!page.pageInfo?.hasNextPage) break
    pages++
    if (pages >= MAX_PAGES) {
      core.warning(
        `Team "@${org}/${team}" has more than ${MAX_PAGES * 100} members; truncating allowlist expansion.`
      )
      break
    }
    cursor = page.pageInfo.endCursor
  }
  return out
}
