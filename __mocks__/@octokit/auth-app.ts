/**
 * Manual jest mock for @octokit/auth-app.
 *
 * @octokit/auth-app@8 is ESM-only and jest can't `require()` it. We never
 * actually invoke the auth strategy in tests — it's just passed by reference
 * to a mocked `getOctokit`, which inspects the `auth` object directly. This
 * stub satisfies the import resolver and provides an identifiable placeholder.
 */

export const createAppAuth: any = Object.assign(
  jest.fn(() => async () => ({
    type: 'token',
    token: 'mock-installation-token',
    tokenType: 'installation'
  })),
  { displayName: 'mock-createAppAuth' }
)
