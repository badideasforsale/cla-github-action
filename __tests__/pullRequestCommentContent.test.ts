/**
 * Tests for src/pullrequest/pullRequestCommentContent.ts
 *
 * Cover three M2 bugs that all live in the rendered comment text:
 *  - BUG-MARKDOWN-LINK: signed-committer link was `(name)[url]` instead of `[name](url)`
 *  - BUG-AT-MENTION-GHOST: unsigned committer with no GitHub user id should not be @-mentioned
 *  - sanity: signed/all-signed branches still produce the expected bot signature
 */
import { commentContent } from '../src/pullrequest/pullRequestCommentContent'
import { CommitterMap } from '../src/interfaces'
import * as input from '../src/shared/getInputs'

jest.mock('@actions/core')

jest.mock('../src/shared/getInputs', () => ({
  getUseDcoFlag: jest.fn(() => 'false'),
  getCustomNotSignedPrComment: jest.fn(() => ''),
  getCustomAllSignedPrComment: jest.fn(() => ''),
  getCustomPrSignComment: jest.fn(() => ''),
  getPathToDocument: jest.fn(() => 'https://example.com/CLA.md'),
  suggestRecheck: jest.fn(() => 'false')
}))

jest.mock('../src/shared/pr-sign-comment', () => ({
  getPrSignComment: jest.fn(() => 'I have read the CLA Document and I hereby sign the CLA')
}))

const mockedInput = jest.mocked(input)

function makeMap(over: Partial<CommitterMap> = {}): CommitterMap {
  return { signed: [], notSigned: [], unknown: [], ...over }
}

describe('commentContent — CLA branch', () => {
  beforeEach(() => {
    mockedInput.getUseDcoFlag.mockReturnValue('false')
  })

  describe('BUG-MARKDOWN-LINK (#67 / PR #171)', () => {
    it('renders signed committers as proper Markdown links, not the inverted (text)[url] form', () => {
      const map = makeMap({
        signed: [{ name: 'alice', id: 1 }],
        notSigned: [{ name: 'bob', id: 2 }]
      })

      const out = commentContent(false, map)

      // The committer-list line only renders when count > 1.
      expect(out).toContain(':white_check_mark: [alice](https://github.com/alice)')
      // The inverted form must not appear.
      expect(out).not.toContain('(alice)[https://github.com/alice]')
    })
  })

  describe('BUG-AT-MENTION-GHOST (#177, #91)', () => {
    it('@-mentions unsigned committers who have a resolved GitHub user id', () => {
      const map = makeMap({
        signed: [{ name: 'alice', id: 1 }],
        notSigned: [{ name: 'bob', id: 42 }]
      })

      const out = commentContent(false, map)

      expect(out).toContain(':x: @bob')
    })

    it('does NOT @-mention unsigned committers when id is missing (raw git author name)', () => {
      // graphql.ts assigns id `''` when no GitHub user could be matched to the
      // commit author — the name then comes from the raw git author name and
      // @-prefixing it can ping an unrelated GitHub login that happens to
      // match. The fix: render the name without `@` in that case.
      const map = makeMap({
        signed: [{ name: 'alice', id: 1 }],
        notSigned: [{ name: 'random-name', id: 0 as any }] // id absent
      })

      const out = commentContent(false, map)

      expect(out).toContain(':x: random-name')
      expect(out).not.toContain('@random-name')
    })
  })

  describe('signed branches', () => {
    it('renders the CLA all-signed footer', () => {
      const out = commentContent(true, makeMap())
      expect(out).toContain('All contributors have signed the CLA')
      expect(out).toContain('CLA Assistant Lite bot')
    })
  })
})

describe('commentContent — DCO branch', () => {
  beforeEach(() => {
    mockedInput.getUseDcoFlag.mockReturnValue('true')
  })

  it('also fixes the Markdown link in the DCO branch (parity with CLA)', () => {
    const map = makeMap({
      signed: [{ name: 'carol', id: 3 }],
      notSigned: [{ name: 'dan', id: 4 }]
    })
    const out = commentContent(false, map)
    expect(out).toContain(':white_check_mark: [carol](https://github.com/carol)')
    expect(out).not.toContain('(carol)[https://github.com/carol]')
  })

  it('also gates the @-mention in the DCO branch (parity with CLA)', () => {
    const map = makeMap({
      signed: [{ name: 'carol', id: 3 }],
      notSigned: [{ name: 'ghost', id: 0 as any }]
    })
    const out = commentContent(false, map)
    expect(out).toContain(':x: ghost')
    expect(out).not.toContain('@ghost')
  })

  it('renders the DCO all-signed footer', () => {
    const out = commentContent(true, makeMap())
    expect(out).toContain('All contributors have signed the DCO')
    expect(out).toContain('DCO Assistant Lite bot')
  })
})
