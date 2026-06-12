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
  octokit: { rest: { repos: { createOrUpdateFileContents: mockCreateOrUpdate } } },
  getDefaultOctokitClient: () => ({
    rest: { repos: { createOrUpdateFileContents: mockCreateOrUpdate } }
  }),
  getPATOctokit: () => ({
    rest: { repos: { createOrUpdateFileContents: mockCreateOrUpdate } }
  }),
  isPersonalAccessTokenPresent: () => false
}))

jest.mock('../src/shared/getInputs', () => ({
  getRemoteRepoName: () => '',
  getRemoteOrgName: () => '',
  getPathToSignatures: () => 'signatures/cla.json',
  getBranch: () => 'main',
  getCreateFileCommitMessage: () => '',
  getSignedCommitMessage: () => ''
}))

import { updateFile } from '../src/persistence/persistence'

function lastWrittenContent(): any {
  const lastCall = mockCreateOrUpdate.mock.calls.at(-1)?.[0] as any
  expect(lastCall).toBeDefined()
  const b64 = lastCall.content
  return JSON.parse(Buffer.from(b64, 'base64').toString())
}

describe('BUG-DUP-SIG (#179): updateFile dedups newSigned against existing ids', () => {
  beforeEach(() => {
    mockCreateOrUpdate.mockClear()
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
