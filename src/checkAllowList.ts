import { CommittersDetails } from './interfaces'
import * as input from './shared/getInputs'

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Returns true if `name` matches any pattern in `allowlistInput`.
 *
 * `allowlistInput` is the raw comma-separated string from the action's
 * `allowlist` input — patterns may include `*` as a wildcard.
 *
 * Matching is case-insensitive (BUG-ALLOWLIST-CASE / upstream #169 —
 * GitHub usernames don't preserve case, so `Copilot` and `copilot` must
 * compare equal here).
 *
 * Wildcards are anchored: a pattern of `foo*` matches `foobar` but not
 * `barfoo`. The prior implementation used an unanchored test which would
 * have considered `barfoo` a match — closer to "contains foo" than "starts
 * with foo".
 */
export function matchesAllowlist(name: string, allowlistInput: string): boolean {
  if (!allowlistInput) return false
  const lower = name.toLowerCase()
  return allowlistInput.split(',').some(rawPattern => {
    const pattern = rawPattern.trim().toLowerCase()
    if (!pattern) return false
    if (pattern.includes('*')) {
      const regex = '^' + escapeRegExp(pattern).split('\\*').join('.*') + '$'
      return new RegExp(regex).test(lower)
    }
    return pattern === lower
  })
}

export function checkAllowList(
  committers: CommittersDetails[]
): CommittersDetails[] {
  const patterns = input.getAllowListItem()
  return committers.filter(
    committer => committer && !matchesAllowlist(committer.name, patterns)
  )
}
