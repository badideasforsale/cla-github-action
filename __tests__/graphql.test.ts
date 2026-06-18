/**
 * Tests for src/graphql.ts — getCommitters() pagination behavior.
 *
 * SEC-PAGINATE-COMMITS: pre-v3.0.0 the GraphQL query asked for `first: 100,
 * after: $cursor` and requested pageInfo, but the function only called the
 * API once with `cursor: ''` and never looped on hasNextPage. PRs with >100
 * commits silently dropped later commits from the check — an integrity gap
 * on legitimate large PRs AND a deliberate-bypass channel for an attacker
 * willing to pad commits past position 100.
 */

const mockGraphql = jest.fn()
const mockWarning = jest.fn()

jest.mock('@actions/core', () => ({
  warning: mockWarning,
  info: jest.fn(),
  debug: jest.fn()
}))
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'acme', repo: 'demo' },
    issue: { number: 7 }
  }
}))
jest.mock('../src/octokit', () => ({
  getOctokit: jest.fn(async () => ({ graphql: mockGraphql }))
}))
jest.mock('../src/shared/getPullRequestNumber', () => ({
  getPullRequestNumber: () => 7
}))

import getCommitters from '../src/graphql'

const commitNode = (login: string, id: number) => ({
  node: {
    commit: {
      author: {
        email: `${login}@example.com`,
        name: login,
        user: { id: `MDQ6VXNl${id}`, databaseId: id, login }
      },
      committer: { name: login, user: { id: `MDQ6VXNl${id}`, databaseId: id, login } }
    }
  },
  cursor: `c-${login}`
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getCommitters — SEC-PAGINATE-COMMITS', () => {
  it('walks every page until hasNextPage=false', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('alice', 1), commitNode('bob', 2)],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-page1' }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('carol', 3)],
              pageInfo: { hasNextPage: false, endCursor: 'cursor-page2' }
            }
          }
        }
      })

    const committers = await getCommitters()

    expect(mockGraphql).toHaveBeenCalledTimes(2)
    // first call has null cursor
    expect(mockGraphql.mock.calls[0][1].cursor).toBeNull()
    // second call carries the cursor from the first response
    expect(mockGraphql.mock.calls[1][1].cursor).toBe('cursor-page1')
    expect(committers.map(c => c.name)).toEqual(['alice', 'bob', 'carol'])
  })

  it('does not stop at the first page when hasNextPage is true', async () => {
    // The pre-v3 bug. Belt-and-suspenders: if a later refactor re-introduces
    // the single-call behavior, this test fails by finding only `alice`.
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('alice', 1)],
              pageInfo: { hasNextPage: true, endCursor: 'c1' }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('bypass-author', 99)],
              pageInfo: { hasNextPage: false, endCursor: null }
            }
          }
        }
      })

    const committers = await getCommitters()

    expect(committers.map(c => c.name)).toContain('bypass-author')
  })

  it('dedups by name across pages', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('alice', 1), commitNode('alice', 1)],
              pageInfo: { hasNextPage: true, endCursor: 'c1' }
            }
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              edges: [commitNode('alice', 1), commitNode('bob', 2)],
              pageInfo: { hasNextPage: false, endCursor: null }
            }
          }
        }
      })

    const committers = await getCommitters()

    expect(committers.map(c => c.name)).toEqual(['alice', 'bob'])
  })

  it('still strips the github-actions[bot] (id 41898282)', async () => {
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [
              commitNode('alice', 1),
              {
                node: {
                  commit: {
                    author: {
                      email: 'github-actions@github.com',
                      name: 'github-actions[bot]',
                      user: {
                        id: 'bot',
                        databaseId: 41898282,
                        login: 'github-actions[bot]'
                      }
                    },
                    committer: {
                      name: 'github-actions[bot]',
                      user: {
                        id: 'bot',
                        databaseId: 41898282,
                        login: 'github-actions[bot]'
                      }
                    }
                  }
                },
                cursor: 'c'
              }
            ],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()

    expect(committers.map(c => c.name)).toEqual(['alice'])
  })

  it('caps at 50 pages and warns when the cap is hit', async () => {
    // Simulate a PR with > 5000 commits. Every page returns hasNextPage: true.
    mockGraphql.mockImplementation(async () => ({
      repository: {
        pullRequest: {
          commits: {
            edges: [commitNode('spam', Math.floor(Math.random() * 1e6))],
            pageInfo: { hasNextPage: true, endCursor: 'c' }
          }
        }
      }
    }))

    await getCommitters()

    // 50 pages fetched then loop breaks before the 51st call.
    expect(mockGraphql).toHaveBeenCalledTimes(50)
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('more than 5000 commits')
    )
  })
})
