# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in this action, please report it **privately** so we can fix it before public disclosure.

**Preferred channel:** GitHub's [private vulnerability reporting](https://github.com/badideasforsale/cla-github-action/security/advisories/new) for this repository. This routes your report directly to the maintainers without it becoming public.

**Do not** open a public GitHub issue for a security problem.

We aim to acknowledge reports within 5 business days and to publish a fix or a coordinated disclosure within 90 days, depending on severity and complexity.

## Scope

This policy covers:

- The action runtime — `dist/index.js` and the `src/` it is built from.
- The bundled npm dependencies as resolved by `package-lock.json` at the time of release.
- The GitHub Actions workflows in `.github/workflows/` that build, test, and release this project.

Out of scope:

- Vulnerabilities in GitHub's own platform — report those to [GitHub directly](https://docs.github.com/en/site-policy/security-policies/github-bug-bounty-program-legal-safe-harbor).
- Vulnerabilities in your own consumer workflow YAML. See the README's "Security hardening" guidance for the canonical `pull_request_target` / `actions/checkout` pitfall.

## Supply chain hygiene

This project takes the following hygiene steps; if you find them lacking, that's also a valid report:

- Every third-party action in `.github/workflows/` is pinned to a 40-character commit SHA with a trailing version-tag comment.
- Dependabot opens weekly PRs for npm and GitHub Actions updates (`.github/dependabot.yml`).
- CodeQL JavaScript/TypeScript analysis runs on every push and PR to `main`, plus weekly on schedule.
- `actions/dependency-review-action` runs on PRs and fails on additions with known vulnerabilities or disallowed licenses.
- [OpenSSF Scorecard](https://securityscorecards.dev) runs weekly via `.github/workflows/scorecard.yml`, publishes results, and uploads SARIF to the repo's code-scanning view.
- Releases publish build provenance attestations via `actions/attest-build-provenance` (starting v3.0.0) so consumers can verify `dist/index.js` was built from this source tree at the tagged commit:
  ```sh
  gh attestation verify dist/index.js --owner badideasforsale
  ```
- v3.0.0 shipped with a pre-release security audit (5 findings, all fixed) — see [`CHANGELOG.md`](./CHANGELOG.md) § Security for the findings, attack scenarios, and remediations.

## Acknowledgements

Reports that lead to a fix will be credited in the relevant GitHub Security Advisory and in `CHANGELOG.md`, unless the reporter requests anonymity.
