/**
 * Manual jest mock for @actions/github.
 *
 * @actions/github@9 is ESM-only. Even tests that pass an explicit factory
 * to `jest.mock('@actions/github', () => ({...}))` need jest to resolve
 * the module name first — and that resolution fails for an ESM-only
 * package in jest's CJS context. This manual mock satisfies the resolver
 * (and any test that doesn't pass a factory of its own gets these
 * harmless defaults).
 */

export const context = {
  repo: { owner: '', repo: '' },
  issue: { number: 0, owner: '', repo: '' },
  payload: {},
  eventName: '',
  workflow: '',
  actor: ''
}

export const getOctokit = jest.fn(() => ({
  rest: {
    repos: {},
    issues: {},
    pulls: {},
    actions: {}
  },
  graphql: jest.fn()
}))
