import { CommittersDetails } from './interfaces'
import * as input from './shared/getInputs'
import {
  parseAllowlistEntries,
  expandOrgsAndTeams
} from './allowlistOrgsAndTeams'

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Returns true if `name` matches any pattern in `patterns`.
 *
 * Patterns are plain user logins or wildcard patterns (`bot*`). Matching is
 * case-insensitive (BUG-ALLOWLIST-CASE / upstream #169 — GitHub usernames
 * don't preserve case, so `Copilot` and `copilot` must compare equal).
 * Wildcards are anchored: `foo*` matches `foobar` but not `barfoo`.
 *
 * Note: `@org` and `@org/team` entries are stripped out before this is
 * called — they get expanded to plain logins by allowlistOrgsAndTeams.ts.
 */
export function matchesAllowlist(name: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const lower = name.toLowerCase()
  return patterns.some(rawPattern => {
    const pattern = rawPattern.trim().toLowerCase()
    if (!pattern) return false
    if (pattern.includes('*')) {
      const regex = '^' + escapeRegExp(pattern).split('\\*').join('.*') + '$'
      return new RegExp(regex).test(lower)
    }
    return pattern === lower
  })
}

/**
 * Filter committers down to those who still need to sign the CLA.
 *
 * An allowlist entry can be a plain user login, a wildcard pattern, an
 * `@org` (every member of that org is allowlisted), or an `@org/team`
 * (every member of that team, including child teams). Org/team membership
 * is resolved via GraphQL at call time and cached for the run.
 *
 * Per-entry failures (private org with no read:org scope, non-existent
 * org/team, network) emit a warning and are skipped — never blocks the
 * primary CLA flow.
 */
export async function checkAllowList(
  committers: CommittersDetails[]
): Promise<CommittersDetails[]> {
  const raw = input.getAllowListItem()
  const parsed = parseAllowlistEntries(raw)
  const extraLogins = await expandOrgsAndTeams(parsed)

  return committers.filter(committer => {
    if (!committer) return false
    if (matchesAllowlist(committer.name, parsed.patterns)) return false
    if (extraLogins.has(committer.name.toLowerCase())) return false
    return true
  })
}
