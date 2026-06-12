/**
 * Tests for src/shared/getPullRequestNumber.ts — FEAT-PR-NUMBER-INPUT (M5.1).
 *
 * Resolution order: `pull-request-number` input → context.issue.number.
 * Bad input falls through with a warning, not silently to PR #0.
 */

const mockContext: any = { issue: { number: 0 } }

jest.mock('@actions/github', () => ({
  get context() {
    return mockContext
  }
}))

// __mocks__/@actions/core.ts provides core.getInput as jest.fn() returning ''.
import * as core from '@actions/core'
import { getPullRequestNumber } from '../src/shared/getPullRequestNumber'

const mockedGetInput = jest.mocked(core.getInput)
const mockedWarning = jest.mocked(core.warning)

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetInput.mockReturnValue('')
  mockContext.issue = { number: 0 }
})

describe('getPullRequestNumber', () => {
  it('returns context.issue.number when input is empty', () => {
    mockContext.issue.number = 42
    expect(getPullRequestNumber()).toBe(42)
    expect(mockedWarning).not.toHaveBeenCalled()
  })

  it('returns the input value when set to a positive integer', () => {
    mockedGetInput.mockImplementation(name =>
      name === 'pull-request-number' ? '777' : ''
    )
    mockContext.issue.number = 42
    expect(getPullRequestNumber()).toBe(777)
    expect(mockedWarning).not.toHaveBeenCalled()
  })

  it('trims-and-parses numeric strings (leading/trailing whitespace)', () => {
    // parseInt handles leading whitespace; the input getter already trims
    // GitHub-Actions style. Either way the result should still parse.
    mockedGetInput.mockImplementation(name =>
      name === 'pull-request-number' ? '  123 ' : ''
    )
    expect(getPullRequestNumber()).toBe(123)
  })

  it('warns and falls back when input is non-numeric', () => {
    mockedGetInput.mockImplementation(name =>
      name === 'pull-request-number' ? 'not-a-number' : ''
    )
    mockContext.issue.number = 42
    expect(getPullRequestNumber()).toBe(42)
    expect(mockedWarning).toHaveBeenCalledWith(
      expect.stringContaining('Invalid pull-request-number input')
    )
  })

  it('warns and falls back when input is zero', () => {
    mockedGetInput.mockImplementation(name =>
      name === 'pull-request-number' ? '0' : ''
    )
    mockContext.issue.number = 42
    expect(getPullRequestNumber()).toBe(42)
    expect(mockedWarning).toHaveBeenCalled()
  })

  it('warns and falls back when input is negative', () => {
    mockedGetInput.mockImplementation(name =>
      name === 'pull-request-number' ? '-5' : ''
    )
    mockContext.issue.number = 42
    expect(getPullRequestNumber()).toBe(42)
    expect(mockedWarning).toHaveBeenCalled()
  })
})
