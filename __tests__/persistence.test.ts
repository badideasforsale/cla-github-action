/**
 * Tests for src/persistence/persistence.ts updateFile() dedup logic.
 *
 * BUG-DUP-SIG (#179): when a contributor's signature comment was processed
 * twice (e.g. re-run, recheck), their id was pushed to signedContributors[]
 * each time, producing duplicate entries in the JSON storage file.
 *
 * The fix is to dedup against existing ids before push.
 */

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: {
    issue: { number: 42, owner: 'acme', repo: 'demo' },
    repo: { owner: 'acme', repo: 'demo' },
    actor: 'tester'
  }
}))

const mockCreateOrUpdate = jest.fn(async () => ({}))
jest.mock('../src/octokit', () => ({
  getOctokit: jest.fn(async () => ({
    rest: { repos: { createOrUpdateFileContents: mockCreateOrUpdate } }
  })),
  getStorageOctokit: jest.fn(async () => ({
    rest: { repos: { createOrUpdateFileContents: mockCreateOrUpdate } }
  })),
  isPersonalAccessTokenPresent: () => false
}))

const mockGetBotName = jest.fn(() => '')
const mockGetBotEmail = jest.fn(() => '')

jest.mock('../src/shared/getInputs', () => ({
  getRemoteRepoName: () => '',
  getRemoteOrgName: () => '',
  getPathToSignatures: () => 'signatures/cla.json',
  getBranch: () => 'main',
  getCreateFileCommitMessage: () => '',
  getSignedCommitMessage: () => '',
  getBotName: () => mockGetBotName(),
  getBotEmail: () => mockGetBotEmail()
}))

import { updateFile } from '../src/persistence/persistence'

function lastWrittenContent(): any {
  const lastCall = mockCreateOrUpdate.mock.calls.at(-1)?.[0] as any
  expect(lastCall).toBeDefined()
  const b64 = lastCall.content
  return JSON.parse(Buffer.from(b64, 'base64').toString())
}

function lastWrittenCall(): any {
  return mockCreateOrUpdate.mock.calls.at(-1)?.[0] as any
}

describe('BUG-DUP-SIG (#179): updateFile dedups newSigned against existing ids', () => {
  beforeEach(() => {
    mockCreateOrUpdate.mockClear()
    mockGetBotName.mockReturnValue('')
    mockGetBotEmail.mockReturnValue('')
  })

  it('appends a brand-new signer', async () => {
    const claFileContent = { signedContributors: [{ name: 'alice', id: 1 }] }
    const reacted = {
      newSigned: [{ name: 'bob', id: 2 }],
      onlyCommitters: [],
      allSignedFlag: false
    }

    await updateFile('sha-1', claFileContent, reacted)

    const written = lastWrittenContent()
    expect(written.signedContributors.map((c: any) => c.id)).toEqual([1, 2])
  })

  it('does NOT add a duplicate when newSigned id already exists in the file', async () => {
    const claFileContent = { signedContributors: [{ name: 'alice', id: 1 }] }
    const reacted = {
      newSigned: [{ name: 'alice', id: 1 }],
      onlyCommitters: [],
      allSignedFlag: false
    }

    await updateFile('sha-1', claFileContent, reacted)

    const written = lastWrittenContent()
    expect(written.signedContributors.map((c: any) => c.id)).toEqual([1])
  })

  it('handles a malformed file missing signedContributors entirely (BUG-MALFORMED-CLA-FILE)', async () => {
    // Some users have hit this when an automated tool wrote an empty `{}`
    // file or a partial backup. The pre-fix code would throw NPE on the
    // push() call.
    const claFileContent: any = {}
    const reacted = {
      newSigned: [{ name: 'carol', id: 3 }],
      onlyCommitters: [],
      allSignedFlag: false
    }

    await expect(updateFile('sha-1', claFileContent, reacted)).resolves.toBeUndefined()

    const written = lastWrittenContent()
    expect(written.signedContributors.map((c: any) => c.id)).toEqual([3])
  })
})

describe('FEAT-BOT-IDENTITY (M5.3)', () => {
  const claFileContent = { signedContributors: [] }
  const reacted = {
    newSigned: [{ name: 'alice', id: 1 }],
    onlyCommitters: [],
    allSignedFlag: false
  }

  beforeEach(() => {
    mockCreateOrUpdate.mockClear()
    mockGetBotName.mockReturnValue('')
    mockGetBotEmail.mockReturnValue('')
  })

  it('omits author + committer when neither bot input is set (uses token default)', async () => {
    await updateFile('sha-1', { signedContributors: [] }, reacted)
    const call = lastWrittenCall()
    expect(call.author).toBeUndefined()
    expect(call.committer).toBeUndefined()
  })

  it('passes author + committer when both bot-name and bot-email are set', async () => {
    mockGetBotName.mockReturnValue('cla-bot')
    mockGetBotEmail.mockReturnValue('cla-bot@example.com')

    await updateFile('sha-1', { signedContributors: [] }, reacted)

    const call = lastWrittenCall()
    expect(call.author).toEqual({ name: 'cla-bot', email: 'cla-bot@example.com' })
    expect(call.committer).toEqual({ name: 'cla-bot', email: 'cla-bot@example.com' })
  })

  it('warns and omits both when only bot-name is set', async () => {
    mockGetBotName.mockReturnValue('cla-bot')
    mockGetBotEmail.mockReturnValue('')

    const core = require('@actions/core')
    const warnSpy = jest.mocked(core.warning)
    warnSpy.mockClear()

    await updateFile('sha-1', { signedContributors: [] }, reacted)

    const call = lastWrittenCall()
    expect(call.author).toBeUndefined()
    expect(call.committer).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bot-name and bot-email must both be set')
    )
  })

  it('warns and omits both when only bot-email is set', async () => {
    mockGetBotName.mockReturnValue('')
    mockGetBotEmail.mockReturnValue('cla-bot@example.com')

    const core = require('@actions/core')
    const warnSpy = jest.mocked(core.warning)
    warnSpy.mockClear()

    await updateFile('sha-1', { signedContributors: [] }, reacted)

    const call = lastWrittenCall()
    expect(call.author).toBeUndefined()
    expect(call.committer).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})
