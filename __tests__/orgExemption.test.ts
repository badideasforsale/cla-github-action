/**
 * Tests for src/orgExemption.ts — FEAT-EXEMPT-ORG (upstream PR #157, issue #100).
 *
 * When `exempt-repo-org-members` is 'true', members of the repo's owning org
 * are dropped from the committers list before the CLA check.
 *
 * The lookup is auxiliary: any failure (user-owned repo, missing scope, network
 * error) must NOT block the CLA flow — we warn and fall through.
 */

const mockGraphql = jest.fn()
const mockGetExempt = jest.fn(() => 'false')

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'acme-org', repo: 'demo' } }
}))
jest.mock('../src/octokit', () => ({
  octokit: { graphql: mockGraphql }
}))
jest.mock('../src/shared/getInputs', () => ({
  getExemptRepoOrgMembers: mockGetExempt
}))

import { applyOrgExemption } from '../src/orgExemption'
import * as core from '@actions/core'

const mockedWarning = jest.mocked(core.warning)
const mockedInfo = jest.mocked(core.info)

beforeEach(() => {
  jest.clearAllMocks()
})

const committers = [
  { name: 'alice', id: 1 },
  { name: 'bob', id: 2 },
  { name: 'external-contrib', id: 3 }
]

describe('applyOrgExemption', () => {
  it('returns committers unchanged when the input flag is not "true"', async () => {
    mockGetExempt.mockReturnValue('false')

    const result = await applyOrgExemption(committers)

    expect(result).toBe(committers) // same reference — short-circuit
    expect(mockGraphql).not.toHaveBeenCalled()
  })

  it('filters out committers who are org members (case-insensitive)', async () => {
    mockGetExempt.mockReturnValue('true')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        membersWithRole: {
          nodes: [{ login: 'Alice' }, { login: 'BOB' }],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    })

    const result = await applyOrgExemption(committers)

    expect(result.map(c => c.name)).toEqual(['external-contrib'])
    expect(mockedInfo).toHaveBeenCalledWith(
      expect.stringContaining('Exempting 2 org members')
    )
  })

  it('returns committers unchanged when owner is a user account (organization is null)', async () => {
    mockGetExempt.mockReturnValue('true')
    mockGraphql.mockResolvedValueOnce({ organization: null })

    const result = await applyOrgExemption(committers)

    expect(result.map(c => c.name)).toEqual(['alice', 'bob', 'external-contrib'])
    expect(mockedWarning).not.toHaveBeenCalled()
  })

  it('paginates through multiple pages of org members', async () => {
    mockGetExempt.mockReturnValue('true')
    mockGraphql
      .mockResolvedValueOnce({
        organization: {
          membersWithRole: {
            nodes: [{ login: 'alice' }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor1' }
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

    const result = await applyOrgExemption(committers)

    expect(result.map(c => c.name)).toEqual(['external-contrib'])
    expect(mockGraphql).toHaveBeenCalledTimes(2)
    // Second call passes the cursor from the first.
    expect(mockGraphql.mock.calls[1][1]).toEqual({
      org: 'acme-org',
      cursor: 'cursor1'
    })
  })

  it('warns and returns committers unchanged when the GraphQL call fails', async () => {
    mockGetExempt.mockReturnValue('true')
    mockGraphql.mockRejectedValueOnce(new Error('permission denied: read:org required'))

    const result = await applyOrgExemption(committers)

    expect(result.map(c => c.name)).toEqual(['alice', 'bob', 'external-contrib'])
    expect(mockedWarning).toHaveBeenCalledWith(
      expect.stringContaining('Could not fetch org members')
    )
  })

  it('handles an empty member list without throwing', async () => {
    mockGetExempt.mockReturnValue('true')
    mockGraphql.mockResolvedValueOnce({
      organization: {
        membersWithRole: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    })

    const result = await applyOrgExemption(committers)
    expect(result).toEqual(committers)
  })
})
