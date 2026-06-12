/**
 * Tests for src/octokit.ts — the async factory pattern (M5.2a).
 *
 * Verifies caching, token selection, and the cross-repo PAT vs GITHUB_TOKEN
 * decision. App-auth selection logic lands in M5.2b and gets its own tests.
 */

const mockGetRepoInstallation = jest.fn()

// `getOctokit` is called multiple times per test: the App-only client used
// for installation discovery, then the installation-scoped client for real
// work. Differentiate by inspecting the auth strategy on the second arg.
const mockCreateOctokitClient = jest.fn((token: string, opts?: any) => {
  if (opts?.authStrategy) {
    // App-auth client. Two flavors:
    //   1. discovery (no auth.installationId) — exposes apps.getRepoInstallation
    //   2. installation-scoped (auth.installationId set)
    return {
      _token: 'app',
      _auth: opts.auth,
      rest: { apps: { getRepoInstallation: mockGetRepoInstallation } },
      graphql: jest.fn()
    }
  }
  return { _token: token, rest: {}, graphql: jest.fn() }
})

jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'acme', repo: 'demo' } },
  getOctokit: mockCreateOctokitClient
}))

// __mocks__/@actions/core.ts gives getInput as `jest.fn(() => '')`. Override
// per-test for App inputs.
import * as core from '@actions/core'
import {
  getOctokit,
  getStorageOctokit,
  isPersonalAccessTokenPresent,
  _resetOctokitCacheForTests
} from '../src/octokit'

const mockedGetInput = jest.mocked(core.getInput)

const origGithubToken = process.env.GITHUB_TOKEN
const origPat = process.env.PERSONAL_ACCESS_TOKEN
const origAppKey = process.env.GITHUB_APP_PRIVATE_KEY

beforeEach(() => {
  jest.clearAllMocks()
  _resetOctokitCacheForTests()
  process.env.GITHUB_TOKEN = 'fake-github-token'
  delete process.env.PERSONAL_ACCESS_TOKEN
  delete process.env.GITHUB_APP_PRIVATE_KEY
  mockedGetInput.mockReturnValue('')
})

afterAll(() => {
  if (origGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = origGithubToken
  if (origPat === undefined) delete process.env.PERSONAL_ACCESS_TOKEN
  else process.env.PERSONAL_ACCESS_TOKEN = origPat
  if (origAppKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY
  else process.env.GITHUB_APP_PRIVATE_KEY = origAppKey
})

function configureAppInputs(appId: string, installationId?: string) {
  mockedGetInput.mockImplementation((name: string) => {
    if (name === 'github-app-id') return appId
    if (name === 'github-app-installation-id') return installationId ?? ''
    return ''
  })
}

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

describe('App auth (M5.2b)', () => {
  const PEM = '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----'

  it('uses GITHUB_TOKEN when github-app-id is set but GITHUB_APP_PRIVATE_KEY is not', async () => {
    configureAppInputs('12345')
    // No env var set → App config incomplete → fall through.
    const oc = (await getOctokit()) as any
    expect(oc._token).toBe('fake-github-token')
  })

  it('uses GITHUB_TOKEN when GITHUB_APP_PRIVATE_KEY is set but github-app-id input is not', async () => {
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    const oc = (await getOctokit()) as any
    expect(oc._token).toBe('fake-github-token')
  })

  it('mints an App-installation Octokit when both inputs + env are set and installation id provided', async () => {
    configureAppInputs('12345', '67890')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM

    const oc = (await getOctokit()) as any

    expect(oc._token).toBe('app')
    expect(oc._auth).toEqual({
      appId: '12345',
      privateKey: PEM,
      installationId: 67890
    })
    // Did NOT call getRepoInstallation — id was provided.
    expect(mockGetRepoInstallation).not.toHaveBeenCalled()
  })

  it('auto-discovers installation id when only github-app-id is provided', async () => {
    configureAppInputs('12345')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    mockGetRepoInstallation.mockResolvedValueOnce({ data: { id: 555 } })

    const oc = (await getOctokit()) as any

    expect(mockGetRepoInstallation).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'demo'
    })
    expect(oc._auth).toEqual({
      appId: '12345',
      privateKey: PEM,
      installationId: 555
    })
  })

  it('falls back to GITHUB_TOKEN when the App is not installed on this repo (auto-discovery 404)', async () => {
    configureAppInputs('12345')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    mockGetRepoInstallation.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 })
    )

    const oc = (await getOctokit()) as any

    expect(oc._token).toBe('fake-github-token')
    const warnings = (jest.mocked(core.warning).mock.calls as any[][])
      .map(c => c[0])
      .join('\n')
    expect(warnings).toMatch(/not installed on acme\/demo/)
  })

  it('warns and auto-discovers when github-app-installation-id is non-numeric', async () => {
    configureAppInputs('12345', 'not-a-number')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    mockGetRepoInstallation.mockResolvedValueOnce({ data: { id: 777 } })

    const oc = (await getOctokit()) as any

    expect((oc as any)._auth.installationId).toBe(777)
    const warnings = (jest.mocked(core.warning).mock.calls as any[][])
      .map(c => c[0])
      .join('\n')
    expect(warnings).toMatch(/Invalid github-app-installation-id/)
  })

  it('App wins over PAT for storage when both configured', async () => {
    configureAppInputs('12345', '67890')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    process.env.PERSONAL_ACCESS_TOKEN = 'fake-pat'

    const oc = (await getStorageOctokit({ isCrossRepo: true })) as any

    // App, not PAT.
    expect(oc._token).toBe('app')
    expect(oc._auth.installationId).toBe(67890)
  })

  it('memoizes: discovery API is called at most once across primary + storage', async () => {
    configureAppInputs('12345')
    process.env.GITHUB_APP_PRIVATE_KEY = PEM
    mockGetRepoInstallation.mockResolvedValueOnce({ data: { id: 555 } })

    await getOctokit()
    await getStorageOctokit({ isCrossRepo: false })
    await getStorageOctokit({ isCrossRepo: true })

    expect(mockGetRepoInstallation).toHaveBeenCalledTimes(1)
  })
})
