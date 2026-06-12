/**
 * Tests for src/octokit.ts — the async factory pattern (M5.2a).
 *
 * Verifies caching, token selection, and the cross-repo PAT vs GITHUB_TOKEN
 * decision. App-auth selection logic lands in M5.2b and gets its own tests.
 */

const mockCreateOctokitClient = jest.fn((token: string) => ({
  _token: token,
  rest: {},
  graphql: jest.fn()
}))

jest.mock('@actions/github', () => ({
  getOctokit: mockCreateOctokitClient
}))

import {
  getOctokit,
  getStorageOctokit,
  isPersonalAccessTokenPresent,
  _resetOctokitCacheForTests
} from '../src/octokit'

const origGithubToken = process.env.GITHUB_TOKEN
const origPat = process.env.PERSONAL_ACCESS_TOKEN

beforeEach(() => {
  jest.clearAllMocks()
  _resetOctokitCacheForTests()
  process.env.GITHUB_TOKEN = 'fake-github-token'
  delete process.env.PERSONAL_ACCESS_TOKEN
})

afterAll(() => {
  if (origGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = origGithubToken
  if (origPat === undefined) delete process.env.PERSONAL_ACCESS_TOKEN
  else process.env.PERSONAL_ACCESS_TOKEN = origPat
})

describe('getOctokit (primary)', () => {
  it('returns a GITHUB_TOKEN-backed client', async () => {
    const oc = (await getOctokit()) as any
    expect(oc._token).toBe('fake-github-token')
  })

  it('caches: two calls return the same instance', async () => {
    const a = await getOctokit()
    const b = await getOctokit()
    expect(a).toBe(b)
    expect(mockCreateOctokitClient).toHaveBeenCalledTimes(1)
  })

  it('throws when GITHUB_TOKEN is unset', async () => {
    delete process.env.GITHUB_TOKEN
    await expect(getOctokit()).rejects.toThrow(/GITHUB_TOKEN env var is required/)
  })
})

describe('getStorageOctokit', () => {
  it('uses GITHUB_TOKEN when isCrossRepo is false', async () => {
    const oc = (await getStorageOctokit({ isCrossRepo: false })) as any
    expect(oc._token).toBe('fake-github-token')
  })

  it('uses GITHUB_TOKEN when isCrossRepo is true but no PAT is set', async () => {
    const oc = (await getStorageOctokit({ isCrossRepo: true })) as any
    expect(oc._token).toBe('fake-github-token')
  })

  it('uses PAT when isCrossRepo is true AND PAT is set', async () => {
    process.env.PERSONAL_ACCESS_TOKEN = 'fake-pat'
    const oc = (await getStorageOctokit({ isCrossRepo: true })) as any
    expect(oc._token).toBe('fake-pat')
  })

  it('caches separately from the primary client', async () => {
    const primary = await getOctokit()
    const storage = await getStorageOctokit({ isCrossRepo: false })
    // Both happen to use GITHUB_TOKEN, but they're distinct cache slots.
    expect(mockCreateOctokitClient).toHaveBeenCalledTimes(2)
    expect((primary as any)._token).toBe((storage as any)._token)
  })
})

describe('isPersonalAccessTokenPresent', () => {
  it('returns false when PAT env var is unset', () => {
    expect(isPersonalAccessTokenPresent()).toBe(false)
  })

  it('returns false when PAT env var is empty string', () => {
    process.env.PERSONAL_ACCESS_TOKEN = ''
    expect(isPersonalAccessTokenPresent()).toBe(false)
  })

  it('returns true when PAT env var is non-empty', () => {
    process.env.PERSONAL_ACCESS_TOKEN = 'tok'
    expect(isPersonalAccessTokenPresent()).toBe(true)
  })
})
