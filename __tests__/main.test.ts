/**
 * Tests for src/main.ts dispatch logic.
 *
 * BUG-CLOSED-PR-COMMENT (closed #72): the action used to run the full CLA
 * check on issue_comment events even when the parent PR was already closed,
 * producing noisy failures. Now it short-circuits.
 */

jest.mock('@actions/core')

const mockLockPullRequest = jest.fn(async () => {})
const mockSetupClaCheck = jest.fn(async () => {})
const mockLockInputFlag = jest.fn(() => 'true')

jest.mock('../src/pullrequest/pullRequestLock', () => ({
  lockPullRequest: mockLockPullRequest
}))
jest.mock('../src/setupClaCheck', () => ({
  setupClaCheck: mockSetupClaCheck
}))
jest.mock('../src/shared/getInputs', () => ({
  lockPullRequestAfterMerge: mockLockInputFlag
}))

// We mock @actions/github with a mutable context object so each test can
// reassign payload / eventName before importing main.
const mockContext: any = {}
jest.mock('@actions/github', () => ({
  get context() {
    return mockContext
  }
}))

import * as core from '@actions/core'
const mockedInfo = jest.mocked(core.info)

beforeEach(() => {
  jest.clearAllMocks()
  Object.keys(mockContext).forEach(k => delete mockContext[k])
})

// We must re-require ./main inside each test because importing main runs
// its `run()` self-invocation; reset the module registry between calls.
async function runMain() {
  jest.isolateModules(() => {
    require('../src/main')
  })
  // give run()'s promise chain a tick to settle
  await new Promise(setImmediate)
}

describe('main.ts dispatch', () => {
  it('locks the PR on the closed event when lock-after-merge is true', async () => {
    Object.assign(mockContext, {
      eventName: 'pull_request_target',
      payload: { action: 'closed' }
    })
    mockLockInputFlag.mockReturnValue('true')

    await runMain()

    expect(mockLockPullRequest).toHaveBeenCalled()
    expect(mockSetupClaCheck).not.toHaveBeenCalled()
  })

  describe('BUG-CLOSED-PR-COMMENT (closed #72)', () => {
    it('skips setupClaCheck for issue_comment against a closed PR', async () => {
      Object.assign(mockContext, {
        eventName: 'issue_comment',
        payload: {
          action: 'created',
          issue: { state: 'closed' }
        }
      })
      mockLockInputFlag.mockReturnValue('false')

      await runMain()

      expect(mockSetupClaCheck).not.toHaveBeenCalled()
      expect(mockLockPullRequest).not.toHaveBeenCalled()
      expect(mockedInfo).toHaveBeenCalledWith(
        expect.stringContaining('Skipping')
      )
    })

    it('still runs setupClaCheck for issue_comment against an OPEN PR', async () => {
      Object.assign(mockContext, {
        eventName: 'issue_comment',
        payload: {
          action: 'created',
          issue: { state: 'open' }
        }
      })
      mockLockInputFlag.mockReturnValue('false')

      await runMain()

      expect(mockSetupClaCheck).toHaveBeenCalled()
    })
  })
})
