import { buildCommitMessage } from '../src/shared/substituteCommitMessage'

const vars = {
  contributorName: 'alice',
  pullRequestNo: 42,
  owner: 'acme',
  repo: 'demo'
}

describe('buildCommitMessage', () => {
  it('returns the default message when template is empty', () => {
    expect(buildCommitMessage('', vars)).toBe(
      '@alice has signed the CLA in acme/demo#42'
    )
  })

  it('returns the default message when template is undefined', () => {
    expect(buildCommitMessage(undefined, vars)).toBe(
      '@alice has signed the CLA in acme/demo#42'
    )
  })

  it('substitutes all four tokens', () => {
    expect(
      buildCommitMessage(
        'sig: $contributorName / pr $pullRequestNo / $owner/$repo',
        vars
      )
    ).toBe('sig: alice / pr 42 / acme/demo')
  })

  it('replaces every occurrence of a token, not just the first', () => {
    // The prior in-place .replace('$contributorName', ...) only touched the
    // first occurrence — a legitimate-use template referencing a token twice
    // would render the placeholder verbatim on the second site.
    expect(
      buildCommitMessage('$contributorName signed $contributorName again', vars)
    ).toBe('alice signed alice again')
  })

  it('leaves unrelated dollar-prefixed strings alone', () => {
    expect(buildCommitMessage('cost: $5 USD', vars)).toBe('cost: $5 USD')
  })
})
