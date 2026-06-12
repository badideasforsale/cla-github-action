import { matchesAllowlist, checkAllowList } from '../src/checkAllowList'
import * as input from '../src/shared/getInputs'

jest.mock('../src/shared/getInputs', () => ({
  getAllowListItem: jest.fn(() => '')
}))

const mockedGetAllowList = jest.mocked(input.getAllowListItem)

describe('matchesAllowlist', () => {
  describe('exact match', () => {
    it('matches an exact name', () => {
      expect(matchesAllowlist('alice', 'alice,bob')).toBe(true)
    })

    it('does not match a non-listed name', () => {
      expect(matchesAllowlist('carol', 'alice,bob')).toBe(false)
    })

    it('trims whitespace around patterns', () => {
      expect(matchesAllowlist('alice', '  alice  , bob ')).toBe(true)
    })

    it('returns false for empty allowlist input', () => {
      expect(matchesAllowlist('alice', '')).toBe(false)
    })
  })

  describe('BUG-ALLOWLIST-CASE (#169): case-insensitive matching', () => {
    it('matches Copilot pattern against the actual GitHub login casing', () => {
      // GitHub Copilot's commits come through as `Copilot` (capital C) but
      // users specify `copilot` in the allowlist. Pre-fix this missed.
      expect(matchesAllowlist('Copilot', 'copilot')).toBe(true)
      expect(matchesAllowlist('copilot', 'Copilot')).toBe(true)
    })

    it('also matches against upper-case patterns', () => {
      expect(matchesAllowlist('alice', 'ALICE')).toBe(true)
    })
  })

  describe('wildcard match', () => {
    it('matches a `bot*` prefix pattern', () => {
      expect(matchesAllowlist('bot1', 'bot*')).toBe(true)
      expect(matchesAllowlist('botanic', 'bot*')).toBe(true)
    })

    it('matches a `*bot` suffix pattern', () => {
      expect(matchesAllowlist('dependabot', '*bot')).toBe(true)
      expect(matchesAllowlist('renovate-bot', '*bot')).toBe(true)
    })

    it('does NOT match a substring when the pattern uses only a prefix wildcard', () => {
      // Anchored — `foo*` should not match `xfoox`. Prior unanchored regex
      // would have matched this.
      expect(matchesAllowlist('xfoo', 'foo*')).toBe(false)
      expect(matchesAllowlist('xfoo', '*foo')).toBe(true)
    })

    it('combines case-insensitivity with wildcards', () => {
      expect(matchesAllowlist('GitHub-Actions[bot]', '*[bot]')).toBe(true)
    })

    it('handles a wildcard-only pattern as a wildcard match-all', () => {
      expect(matchesAllowlist('anyone', '*')).toBe(true)
    })
  })

  describe('regex metachars in patterns are treated literally', () => {
    it('does not interpret `.` as regex any-char', () => {
      expect(matchesAllowlist('aXc', 'a.c')).toBe(false)
      expect(matchesAllowlist('a.c', 'a.c')).toBe(true)
    })
  })
})

describe('checkAllowList', () => {
  beforeEach(() => {
    mockedGetAllowList.mockReturnValue('')
  })

  it('returns committers unchanged when the allowlist is empty', () => {
    mockedGetAllowList.mockReturnValue('')
    const committers = [
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 }
    ]
    expect(checkAllowList(committers)).toEqual(committers)
  })

  it('filters out committers matching an exact-name pattern', () => {
    mockedGetAllowList.mockReturnValue('bob')
    const result = checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 }
    ])
    expect(result.map(c => c.name)).toEqual(['alice'])
  })

  it('filters out bots via wildcard', () => {
    mockedGetAllowList.mockReturnValue('alice,*[bot]')
    const result = checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 },
      { name: 'dependabot[bot]', id: 3 }
    ])
    expect(result.map(c => c.name)).toEqual(['bob'])
  })

  it('skips falsy entries defensively', () => {
    mockedGetAllowList.mockReturnValue('')
    const committers = [
      { name: 'alice', id: 1 },
      null as any,
      { name: 'bob', id: 2 }
    ]
    expect(checkAllowList(committers).map(c => c.name)).toEqual(['alice', 'bob'])
  })
})
