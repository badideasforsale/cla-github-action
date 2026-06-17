# Contributing

This is a maintained fork of [contributor-assistant/github-action](https://github.com/contributor-assistant/github-action) (archived upstream). Patches, issues, and reviews are welcome.

- [Developing this action](#developing-this-action)
- [Reporting issues](#report-an-issue)
- [Contributing code](#contribute-code)

## Developing this action

This is a TypeScript GitHub Action bundled with `esbuild` into a single `dist/index.js` that the action runtime executes. Two things follow from that:

1. **`dist/index.js` is part of the source you commit.** It must be regenerated whenever `src/` changes. There is no longer a husky pre-commit hook — you must run `npm run build` manually before pushing.
2. **CI enforces freshness.** The `verify-dist` job in `.github/workflows/nodejs.yml` rebuilds `dist/` and fails the PR if the result differs from what's committed. If you forget the rebuild, CI will tell you.

### Setup

```sh
npm ci                       # install deps from package-lock.json
npm run build                # tsc + esbuild → dist/index.js
npm test                     # jest — 99 tests across __tests__/
npm run validate-actions     # action-validator on action.yml + workflows
```

Node 24 is required (see `engines.node` in `package.json`). The action runtime is also Node 24 (`action.yml`: `using: node24`).

### `action-validator`

Validates `action.yml` and `.github/workflows/*.yml` against the schemas GitHub Actions actually accepts — catches typos, deprecated keys, and unsupported `using:` values that would only surface at runtime.

Install: `cargo install action-validator` or `brew install action-validator`. **Minimum version: 0.9.0** — earlier releases don't know about `node24` and will reject `action.yml`.

CI runs the same validator at v0.9.0 (SHA-pinned in `nodejs.yml`).

### Pre-PR checklist

- [ ] `npm run build` succeeded and you committed any `dist/` changes
- [ ] `npm test` passes
- [ ] `npm run validate-actions` passes
- [ ] Commit message describes the *why* (the *what* is in the diff)

### Architecture

See [`CLAUDE.md`](./CLAUDE.md) at the repo root for the architecture overview, the foot-guns (TS strictness exceptions, boolean-as-string convention, the hardcoded github-actions[bot] filter), and where each major concern lives.

## Report an Issue

Use [GitHub Issues](https://github.com/badideasforsale/cla-github-action/issues) on this fork. Before opening one:

- Check whether it's a known limitation (`README.md` Troubleshooting, `MIGRATION.md`, `CHANGELOG.md`).
- Include the action version (commit SHA or tag), the workflow yaml that reproduces it, and the relevant chunk of the workflow run log.
- Reduce to the smallest reproducer you can — issues filed against this small fork get triaged faster when they're easy to replicate.

## Reporting Security Issues

**Do not** file security issues on the public tracker. See [`SECURITY.md`](./SECURITY.md) — GitHub Private Vulnerability Reporting is the channel.

## Contribute Code

PRs are welcome. The fork is small and unbureaucratic — no CLA/DCO requirement to contribute *to this fork* (the action itself implements CLA/DCO checks for *consumers'* projects).

Before opening a PR:

- For non-trivial changes, open an issue first to discuss the approach. Saves you rewriting and saves us reviewing twice.
- Match the surrounding style. Prettier config (`.prettierrc.json`) is enforced by convention, not (yet) by CI: 2-space indent, single quotes, no semicolons, no trailing commas, `arrowParens: avoid`.
- New behavior gets a paired test under `__tests__/`. The existing suite mocks `@actions/core` and `@actions/github`; follow that shape rather than reaching for real network calls.
- Run the pre-PR checklist above (`npm run build && npm test && npm run validate-actions`).
- Commit messages should describe the *why*. The *what* is in the diff.

If your change closes a GitHub issue, add `Fixes #N` (no colon) to the commit message body so GitHub auto-closes it on merge.
