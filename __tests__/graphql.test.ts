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

describe('getCommitters — SEC-DEDUP-NAME-COLLISION', () => {
  // An unresolved commit author with `name === <existing-signed-login>` would,
  // under the prior name-only dedup, collapse with the signed contributor and
  // never make it into the committers list. CLA check would then pass even
  // though the attacker's commits land unsigned. Dedup key must distinguish
  // `id:<n>` (resolved) from `raw:<name>:<email>` (unresolved).

  it('treats a resolved login and an unresolved raw author with the same `name` as distinct committers', async () => {
    // commitNode helper builds a fully-resolved node. For the unresolved
    // attacker commit we hand-build a node with no `user` subobject.
    const unresolvedAlice = {
      node: {
        commit: {
          author: {
            email: 'attacker@example.invalid',
            name: 'alice',
            user: null  // no GitHub user resolves this commit
          },
          committer: {
            name: 'alice',
            user: null
          }
        }
      },
      cursor: 'c-attacker'
    }

    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [
              commitNode('alice', 12345), // legitimate signed alice
              unresolvedAlice               // attacker's forged-author commit
            ],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()

    // Two distinct committers expected; pre-fix dedup-by-name produced one.
    expect(committers).toHaveLength(2)
    const resolved = committers.find(c => c.id === 12345)
    const unresolved = committers.find(c => c.id === '')
    expect(resolved).toBeDefined()
    expect(unresolved).toBeDefined()
    expect(unresolved!.name).toBe('alice')
    expect(unresolved!.email).toBe('attacker@example.invalid')
  })

  it('still dedups two RESOLVED commits with the same GitHub id', async () => {
    // Two commits by the same GitHub user → one committer.
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [commitNode('alice', 12345), commitNode('alice', 12345)],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()
    expect(committers).toHaveLength(1)
    expect(committers[0].id).toBe(12345)
  })

  it('still dedups two UNRESOLVED commits with the same (name, email)', async () => {
    // Two commits by the same unresolved git author identity → one committer.
    const node = (email: string) => ({
      node: {
        commit: {
          author: { email, name: 'unknown', user: null },
          committer: { name: 'unknown', user: null }
        }
      },
      cursor: 'c'
    })
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [node('a@x.com'), node('a@x.com')],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()
    expect(committers).toHaveLength(1)
  })

  it('orphan commit gets a stable name sentinel so downstream toLowerCase does not crash', async () => {
    // Bug-#1 from final review: extractUserFromCommit returns {} for a
    // fully-orphan commit, so user.name would be undefined. Downstream
    // call sites (checkAllowList.matchesAllowlist, orgExemption.has)
    // call `.toLowerCase()` unconditionally. A stable sentinel routes
    // the committer into the "unknown" bucket without crashing.
    const orphan = {
      node: { commit: { author: null, committer: null } },
      cursor: 'c'
    }
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [orphan],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()
    expect(committers).toHaveLength(1)
    expect(committers[0].name).toBe('<unknown-author>')
    expect(committers[0].id).toBe('')
  })

  it('SF-11: does not crash on an orphan commit with null author', async () => {
    // A rewritten / orphan commit can return null for `commit.author`.
    // Pre-fix `extractUserFromCommit` dereferenced `commit.author.user`
    // directly and threw a TypeError.
    const orphan = {
      node: {
        commit: {
          author: null,
          committer: null
        }
      },
      cursor: 'c'
    }
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [commitNode('alice', 1), orphan],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    // Should not throw. The orphan commit becomes a degenerate committer
    // with undefined name/id; it ends up in the "unknown" bucket downstream.
    const committers = await getCommitters()
    expect(committers.find(c => c.name === 'alice')).toBeDefined()
  })

  it('treats two UNRESOLVED authors with the same name but different emails as distinct', async () => {
    const node = (email: string) => ({
      node: {
        commit: {
          author: { email, name: 'jsmith', user: null },
          committer: { name: 'jsmith', user: null }
        }
      },
      cursor: 'c'
    })
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          commits: {
            edges: [node('one@x.com'), node('two@x.com')],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    })

    const committers = await getCommitters()
    expect(committers).toHaveLength(2)
  })
})
