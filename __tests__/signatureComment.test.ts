/**
 * Tests for src/pullrequest/signatureComment.ts — specifically:
 *
 *  - The M1.6 null-safety fix for comments whose author has been deleted
 *    (prComment.user is null). The pre-fix code crashed reading .login on
 *    null; the fix skips those comments entirely.
 *  - The regex-based signature detection for CLA + DCO modes.
 *  - The github-actions[bot] author exclusion.
 *  - newSigned dedup against committerMap.notSigned.
 */

const mockListComments = jest.fn()
const mockGetUseDcoFlag = jest.fn(() => 'false')
const mockGetCustomPrSignComment = jest.fn(() => '')

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'acme', repo: 'demo' },
    issue: { number: 42, owner: 'acme', repo: 'demo' },
    payload: { repository: { id: 999 } }
  }
}))
jest.mock('../src/octokit', () => ({
  octokit: { rest: { issues: { listComments: mockListComments } } }
}))
jest.mock('../src/shared/getInputs', () => ({
  getUseDcoFlag: mockGetUseDcoFlag,
  getCustomPrSignComment: mockGetCustomPrSignComment
}))

import signatureWithPRComment from '../src/pullrequest/signatureComment'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUseDcoFlag.mockReturnValue('false')
  mockGetCustomPrSignComment.mockReturnValue('')
})

const committers = [
  { name: 'alice', id: 1 },
  { name: 'bob', id: 2 }
]
const committerMap = {
  signed: [],
  notSigned: committers.slice(),
  unknown: []
}

describe('signatureWithPRComment', () => {
  it('detects a CLA sign comment from an unsigned committer', async () => {
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 100,
          user: { login: 'alice', id: 1 },
          body: 'I have read the CLA Document and I hereby sign the CLA',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)

    expect(result.newSigned.map((c: any) => c.name)).toEqual(['alice'])
    expect(result.onlyCommitters?.map((c: any) => c.name)).toEqual(['alice'])
  })

  it('detects a DCO sign comment when use-dco-flag is true', async () => {
    mockGetUseDcoFlag.mockReturnValue('true')
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 101,
          user: { login: 'bob', id: 2 },
          body: 'I have read the DCO Document and I hereby sign the DCO',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned.map((c: any) => c.name)).toEqual(['bob'])
  })

  it('ignores comments whose author has been deleted (M1.6 null safety)', async () => {
    // Pre-fix the code crashed accessing user.login on null. Now those
    // comments are skipped entirely.
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 102,
          user: null,
          body: 'I have read the CLA Document and I hereby sign the CLA',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned).toEqual([])
  })

  it('ignores comments authored by github-actions[bot]', async () => {
    // The bot itself echoes the sign phrase in its own comment template;
    // we must not treat that as a signature.
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 103,
          user: { login: 'github-actions[bot]', id: 41898282 },
          body: 'I have read the CLA Document and I hereby sign the CLA — example text',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned).toEqual([])
  })

  it('handles a comment with null body without crashing', async () => {
    // listComments occasionally returns entries with empty/null body
    // (image-only embeds, etc.). The defensive `?? ''` keeps trim()
    // from blowing up.
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 104,
          user: { login: 'alice', id: 1 },
          body: null,
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    await expect(
      signatureWithPRComment(committerMap as any, committers)
    ).resolves.toBeDefined()
  })

  it('only counts a signature from a CURRENT committer (id appears in notSigned)', async () => {
    // Someone unrelated to the PR can't sign the CLA on behalf of the
    // committers — their comment is ignored even with the right phrase.
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 105,
          user: { login: 'random-user', id: 999 },
          body: 'I have read the CLA Document and I hereby sign the CLA',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned).toEqual([])
  })

  it('BUG-EMAIL-REPLY-REGEX (#19): matches sign phrase even when comment has a quoted email reply after it', async () => {
    // Email replies to GitHub PR notifications produce a comment body where
    // the first line is the user's message (the sign phrase) and the rest is
    // the quoted previous email. Without the `m` flag the regex was
    // anchored to the entire body and never matched.
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 200,
          user: { login: 'alice', id: 1 },
          body:
            'I have read the CLA Document and I hereby sign the CLA\n' +
            '\n' +
            'On Wed, Mar 15, 2023, GitHub <noreply@github.com> wrote:\n' +
            '> Please sign the CLA by replying with the phrase above.\n' +
            '> [...](https://github.com/...)',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned.map((c: any) => c.name)).toEqual(['alice'])
  })

  it('matches a custom sign phrase exactly when getCustomPrSignComment is set', async () => {
    mockGetCustomPrSignComment.mockReturnValue('I agree to the terms')
    mockListComments.mockResolvedValueOnce({
      data: [
        {
          id: 106,
          user: { login: 'alice', id: 1 },
          body: 'I agree to the terms',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 107,
          user: { login: 'bob', id: 2 },
          // The default CLA phrase should NOT match when a custom one is set.
          body: 'I have read the CLA Document and I hereby sign the CLA',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]
    })

    const result = await signatureWithPRComment(committerMap as any, committers)
    expect(result.newSigned.map((c: any) => c.name)).toEqual(['alice'])
  })
})
