/**
 * Tests for src/pullrequest/pullRequestComment.ts — specifically getComment(),
 * which decides which existing bot comment (if any) to update.
 *
 * BUG-COMMENT-MARKER (#153): two CLA/DCO jobs in one repo would stomp each
 * other because the lookup matched the literal `CLA Assistant Lite bot`
 * substring — not unique per job. The new lookup:
 *
 *   1. Prefer comments whose body contains the per-job hidden HTML marker
 *      `<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`.
 *   2. Fall back to the legacy substring match for comments posted before
 *      markers existed (so single-job consumers see no migration).
 */

const mockListComments = jest.fn()
const mockCreateComment = jest.fn(async () => ({}))
const mockUpdateComment = jest.fn(async () => ({}))
const mockGetUseDcoFlag = jest.fn(() => 'false')

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'acme', repo: 'demo' },
    issue: { number: 42, owner: 'acme', repo: 'demo' },
    payload: { repository: { id: 999 } }
  }
}))
jest.mock('../src/octokit', () => ({
  getOctokit: jest.fn(async () => ({
    rest: {
      issues: {
        listComments: mockListComments,
        createComment: mockCreateComment,
        updateComment: mockUpdateComment
      }
    }
  }))
}))
jest.mock('../src/shared/getInputs', () => ({
  getUseDcoFlag: mockGetUseDcoFlag,
  getCustomNotSignedPrComment: jest.fn(() => ''),
  getCustomAllSignedPrComment: jest.fn(() => ''),
  getCustomPrSignComment: jest.fn(() => ''),
  getPathToDocument: jest.fn(() => 'https://example.com/CLA.md'),
  suggestRecheck: jest.fn(() => 'false')
}))
jest.mock('../src/pullrequest/signatureComment', () =>
  jest.fn(async () => ({ newSigned: [], onlyCommitters: [], allSignedFlag: false }))
)

import prCommentSetup from '../src/pullrequest/pullRequestComment'

const origWorkflow = process.env.GITHUB_WORKFLOW
const origJob = process.env.GITHUB_JOB

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GITHUB_WORKFLOW = 'CLA-frontend'
  process.env.GITHUB_JOB = 'sign-check'
  mockGetUseDcoFlag.mockReturnValue('false')
})

afterAll(() => {
  process.env.GITHUB_WORKFLOW = origWorkflow
  process.env.GITHUB_JOB = origJob
})

const map = (over: any = {}) => ({ signed: [], notSigned: [], unknown: [], ...over })

describe('getComment (via prCommentSetup) — BUG-COMMENT-MARKER (#153)', () => {
  it('prefers the comment carrying THIS job\'s hidden marker', () => {
    const otherJobComment = {
      id: 1,
      body: '<sub>Posted by the **CLA Assistant Lite bot**.</sub>\n<!-- cla-lite-bot:cla:CLA-frontend:other-job -->'
    }
    const thisJobComment = {
      id: 2,
      body: '<sub>Posted by the **CLA Assistant Lite bot**.</sub>\n<!-- cla-lite-bot:cla:CLA-frontend:sign-check -->'
    }
    mockListComments.mockResolvedValueOnce({ data: [otherJobComment, thisJobComment] })

    // notSigned non-empty → update path. Returns once we identify the comment.
    return prCommentSetup(map({ notSigned: [{ name: 'a', id: 1 }] }), [{ name: 'a', id: 1 }])
      .then(() => {
        expect(mockUpdateComment).toHaveBeenCalledWith(
          expect.objectContaining({ comment_id: 2 })
        )
        // and NOT the other-job comment
        expect(mockUpdateComment).not.toHaveBeenCalledWith(
          expect.objectContaining({ comment_id: 1 })
        )
      })
  })

  it('falls back to legacy substring match for v2-era comments without a marker', () => {
    // simulates a comment posted by upstream contributor-assistant/github-action
    // before this fork's marker existed — single-job consumers must still
    // pick it up so the v2→v3 migration is seamless.
    const legacyComment = {
      id: 99,
      body: '<sub>Posted by the **CLA Assistant Lite bot**.</sub>'
    }
    mockListComments.mockResolvedValueOnce({ data: [legacyComment] })

    return prCommentSetup(map({ notSigned: [{ name: 'a', id: 1 }] }), [{ name: 'a', id: 1 }])
      .then(() => {
        expect(mockUpdateComment).toHaveBeenCalledWith(
          expect.objectContaining({ comment_id: 99 })
        )
      })
  })

  it('also matches v3-brand comments without a marker (defensive)', () => {
    // A v3 comment without a marker shouldn't normally occur — every v3
    // render appends one. But if the marker block were ever stripped (manual
    // edit, deserialization round-trip), the legacy regex should still find
    // the comment by brand string.
    const v3CommentNoMarker = {
      id: 100,
      body: '<sub>Posted by the **Self-Hosted CLA Assistant bot**.</sub>'
    }
    mockListComments.mockResolvedValueOnce({ data: [v3CommentNoMarker] })

    return prCommentSetup(map({ notSigned: [{ name: 'a', id: 1 }] }), [{ name: 'a', id: 1 }])
      .then(() => {
        expect(mockUpdateComment).toHaveBeenCalledWith(
          expect.objectContaining({ comment_id: 100 })
        )
      })
  })

  it('creates a new comment when nothing matches (neither marker nor legacy)', () => {
    mockListComments.mockResolvedValueOnce({
      data: [
        // unrelated user comment
        { id: 7, body: 'I have a question about this PR' },
        // a different repo's bot — wrong workflow name in marker
        {
          id: 8,
          body: 'something\n<!-- cla-lite-bot:cla:other-workflow:other-job -->'
        }
      ]
    })

    return prCommentSetup(map({ notSigned: [{ name: 'a', id: 1 }] }), [{ name: 'a', id: 1 }])
      .then(() => {
        expect(mockCreateComment).toHaveBeenCalled()
        expect(mockUpdateComment).not.toHaveBeenCalled()
      })
  })

  it('discriminates CLA vs DCO mode when matching legacy comments', () => {
    mockGetUseDcoFlag.mockReturnValue('true')
    const claComment = {
      id: 1,
      body: '<sub>Posted by the **CLA Assistant Lite bot**.</sub>'
    }
    const dcoComment = {
      id: 2,
      body: '<sub>Posted by the ****DCO Assistant Lite bot****.</sub>'
    }
    mockListComments.mockResolvedValueOnce({ data: [claComment, dcoComment] })

    return prCommentSetup(map({ notSigned: [{ name: 'a', id: 1 }] }), [{ name: 'a', id: 1 }])
      .then(() => {
        // DCO mode should ignore the CLA-bot comment and pick the DCO one.
        expect(mockUpdateComment).toHaveBeenCalledWith(
          expect.objectContaining({ comment_id: 2 })
        )
      })
  })
})
