import { matchesAllowlist, checkAllowList } from '../src/checkAllowList'
import * as input from '../src/shared/getInputs'

const mockGraphql = jest.fn()

jest.mock('../src/shared/getInputs', () => ({
  getAllowListItem: jest.fn(() => '')
}))
jest.mock('../src/octokit', () => ({
  getOctokit: jest.fn(async () => ({ graphql: mockGraphql }))
}))
jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}))

const mockedGetAllowList = jest.mocked(input.getAllowListItem)

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetAllowList.mockReturnValue('')
})

describe('matchesAllowlist (pure)', () => {
  // matchesAllowlist now takes a pre-split string[] of plain user/wildcard
  // patterns. @org and @org/team entries are parsed elsewhere.

  describe('exact match', () => {
    it('matches an exact name', () => {
      expect(matchesAllowlist('alice', ['alice', 'bob'])).toBe(true)
    })

    it('does not match a non-listed name', () => {
      expect(matchesAllowlist('carol', ['alice', 'bob'])).toBe(false)
    })

    it('trims whitespace around patterns', () => {
      expect(matchesAllowlist('alice', ['  alice  ', ' bob '])).toBe(true)
    })

    it('returns false for empty patterns array', () => {
      expect(matchesAllowlist('alice', [])).toBe(false)
    })
  })

  describe('BUG-ALLOWLIST-CASE (#169): case-insensitive matching', () => {
    it('matches Copilot pattern against the actual GitHub login casing', () => {
      expect(matchesAllowlist('Copilot', ['copilot'])).toBe(true)
      expect(matchesAllowlist('copilot', ['Copilot'])).toBe(true)
    })

    it('also matches against upper-case patterns', () => {
      expect(matchesAllowlist('alice', ['ALICE'])).toBe(true)
    })
  })

  describe('wildcard match', () => {
    it('matches a `bot*` prefix pattern', () => {
      expect(matchesAllowlist('bot1', ['bot*'])).toBe(true)
      expect(matchesAllowlist('botanic', ['bot*'])).toBe(true)
    })

    it('matches a `*bot` suffix pattern', () => {
      expect(matchesAllowlist('dependabot', ['*bot'])).toBe(true)
      expect(matchesAllowlist('renovate-bot', ['*bot'])).toBe(true)
    })

    it('does NOT match a substring when the pattern uses only a prefix wildcard', () => {
      expect(matchesAllowlist('xfoo', ['foo*'])).toBe(false)
      expect(matchesAllowlist('xfoo', ['*foo'])).toBe(true)
    })

    it('combines case-insensitivity with wildcards', () => {
      expect(matchesAllowlist('GitHub-Actions[bot]', ['*[bot]'])).toBe(true)
    })

    it('handles a wildcard-only pattern as a wildcard match-all', () => {
      expect(matchesAllowlist('anyone', ['*'])).toBe(true)
    })
  })

  describe('regex metachars in patterns are treated literally', () => {
    it('does not interpret `.` as regex any-char', () => {
      expect(matchesAllowlist('aXc', ['a.c'])).toBe(false)
      expect(matchesAllowlist('a.c', ['a.c'])).toBe(true)
    })
  })
})

describe('checkAllowList', () => {
  it('returns committers unchanged when the allowlist is empty', async () => {
    mockedGetAllowList.mockReturnValue('')
    const committers = [
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 }
    ]
    await expect(checkAllowList(committers)).resolves.toEqual(committers)
    expect(mockGraphql).not.toHaveBeenCalled()
  })

  it('filters out committers matching an exact-name pattern', async () => {
    mockedGetAllowList.mockReturnValue('bob')
    const result = await checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 }
    ])
    expect(result.map(c => c.name)).toEqual(['alice'])
  })

  it('filters out bots via wildcard', async () => {
    mockedGetAllowList.mockReturnValue('alice,*[bot]')
    const result = await checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 },
      { name: 'dependabot[bot]', id: 3 }
    ])
    expect(result.map(c => c.name)).toEqual(['bob'])
  })

  it('skips falsy entries defensively', async () => {
    mockedGetAllowList.mockReturnValue('')
    const committers = [
      { name: 'alice', id: 1 },
      null as any,
      { name: 'bob', id: 2 }
    ]
    const result = await checkAllowList(committers)
    expect(result.map(c => c.name)).toEqual(['alice', 'bob'])
  })
})

describe('checkAllowList — FEAT-ALLOWLIST-ORGS-AND-TEAMS', () => {
  it('expands @org to all members and filters them out', async () => {
    mockedGetAllowList.mockReturnValue('@temporal-io,direct-user')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        membersWithRole: {
          nodes: [{ login: 'alice' }, { login: 'BoB' }, { login: 'carol' }],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    })

    const result = await checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 },
      { name: 'dave', id: 3 },
      { name: 'direct-user', id: 4 }
    ])

    expect(result.map(c => c.name)).toEqual(['dave'])
  })

  it('expands @org/team to team members (including child teams) and filters them out', async () => {
    mockedGetAllowList.mockReturnValue('@acme/eng')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        team: {
          members: {
            nodes: [{ login: 'one' }, { login: 'two' }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const result = await checkAllowList([
      { name: 'one', id: 1 },
      { name: 'three', id: 2 }
    ])

    expect(result.map(c => c.name)).toEqual(['three'])
    // Verify the team query was called with membership: ALL (in query text).
    const queryArg = mockGraphql.mock.calls[0][0]
    expect(queryArg).toContain('membership: ALL')
  })

  it('paginates org members across multiple pages', async () => {
    mockedGetAllowList.mockReturnValue('@bigorg')
    mockGraphql
      .mockResolvedValueOnce({
        organization: {
          membersWithRole: {
            nodes: [{ login: 'alice' }],
            pageInfo: { hasNextPage: true, endCursor: 'cur1' }
          }
        }
      })
      .mockResolvedValueOnce({
        organization: {
          membersWithRole: {
            nodes: [{ login: 'bob' }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      })

    const result = await checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'bob', id: 2 },
      { name: 'carol', id: 3 }
    ])

    expect(mockGraphql).toHaveBeenCalledTimes(2)
    expect(mockGraphql.mock.calls[1][1].cursor).toBe('cur1')
    expect(result.map(c => c.name)).toEqual(['carol'])
  })

  it('warns and continues when a single @org expansion fails (rest of allowlist still applies)', async () => {
    mockedGetAllowList.mockReturnValue('@missing-org,@real-org,direct-user')
    mockGraphql
      // first call: missing org
      .mockResolvedValueOnce({ organization: null })
      // second call: real org with members
      .mockResolvedValueOnce({
        organization: {
          membersWithRole: {
            nodes: [{ login: 'alice' }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      })

    const result = await checkAllowList([
      { name: 'alice', id: 1 },
      { name: 'direct-user', id: 2 },
      { name: 'dave', id: 3 }
    ])

    // direct-user still allowlisted; alice still allowlisted (via real-org);
    // only dave remains in the CLA check.
    expect(result.map(c => c.name)).toEqual(['dave'])
    const core = require('@actions/core')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('@missing-org')
    )
  })

  it('matches expanded logins case-insensitively', async () => {
    mockedGetAllowList.mockReturnValue('@acme')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        membersWithRole: {
          nodes: [{ login: 'AliceCorp' }],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    })

    const result = await checkAllowList([
      { name: 'alicecorp', id: 1 },
      { name: 'other', id: 2 }
    ])

    expect(result.map(c => c.name)).toEqual(['other'])
  })

  it('rejects malformed entries with a warning', async () => {
    mockedGetAllowList.mockReturnValue('@,@-bad,@org/,real-user')

    const result = await checkAllowList([{ name: 'real-user', id: 1 }])

    expect(result.map(c => c.name)).toEqual([])
    const core = require('@actions/core')
    // 3 invalid entries → 3 warnings.
    expect(core.warning).toHaveBeenCalledTimes(3)
  })

  it('dedups identical @org entries (case-insensitive)', async () => {
    mockedGetAllowList.mockReturnValue('@Acme,@acme,@ACME')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        membersWithRole: {
          nodes: [{ login: 'alice' }],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    })

    await checkAllowList([{ name: 'alice', id: 1 }])

    expect(mockGraphql).toHaveBeenCalledTimes(1)
  })
})
