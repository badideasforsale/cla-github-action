/**
 * Tests for src/setupClaCheck.ts — specifically the auto-create-file path
 * that was broken for years by a string-vs-number compare on error.status.
 *
 * BUG-404-STRING (#155): when the signatures file doesn't exist, octokit
 * raises an error with status: 404 (number). The old code compared
 * `error.status === "404"` (string), which was always false, so the
 * createClaFileAndPRComment fallback never fired. Every fresh-install user
 * hit the generic "Could not retrieve repository contents" error instead.
 */

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: {
    issue: { number: 7, owner: 'acme', repo: 'demo' },
    repo: { owner: 'acme', repo: 'demo' },
    payload: {},
    eventName: 'pull_request_target',
    actor: 'tester'
  }
}))
jest.mock('../src/graphql', () => jest.fn(async () => []))
jest.mock('../src/checkAllowList', () => ({
  checkAllowList: (committers: any[]) => committers
}))
jest.mock('../src/orgExemption', () => ({
  applyOrgExemption: jest.fn(async (committers: any[]) => committers)
}))
jest.mock('../src/persistence/persistence', () => ({
  getFileContent: jest.fn(),
  createFile: jest.fn(async () => ({})),
  updateFile: jest.fn()
}))
jest.mock('../src/pullrequest/pullRequestComment', () => jest.fn(async () => ({ newSigned: [], onlyCommitters: [], allSignedFlag: false })))
jest.mock('../src/pullRerunRunner', () => ({
  reRunLastWorkFlowIfRequired: jest.fn()
}))

import { setupClaCheck } from '../src/setupClaCheck'
import * as persistence from '../src/persistence/persistence'
import * as core from '@actions/core'

const mockedGet = jest.mocked(persistence.getFileContent)
const mockedCreate = jest.mocked(persistence.createFile)
const mockedSetFailed = jest.mocked(core.setFailed)

describe('BUG-404-STRING (#155): auto-create signatures file on first run', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls createFile when getFileContent rejects with status 404 (number)', async () => {
    mockedGet.mockRejectedValueOnce({ status: 404 })

    // setupClaCheck re-throws after the create flow runs, by design — the
    // caller (main.ts) treats that as "CLA not yet signed". The throw is
    // expected; the assertion is that createFile was called instead of
    // falling through to the cryptic "Could not retrieve repository
    // contents" error.
    await expect(setupClaCheck()).rejects.toThrow(/have to sign the CLA/)

    expect(mockedCreate).toHaveBeenCalledTimes(1)
  })

  it('rejects without calling createFile on non-404 status', async () => {
    mockedGet.mockRejectedValueOnce({ status: 500 })

    await expect(setupClaCheck()).rejects.toThrow(
      /Could not retrieve repository contents.*500/
    )

    expect(mockedCreate).not.toHaveBeenCalled()
  })
})
