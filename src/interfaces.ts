/**
 * Shared data shapes used across the committer-resolution → signature-detection
 * → persistence pipeline. The flow in brief:
 *
 *   getCommitters()              → CommittersDetails[]      (graphql.ts)
 *   prepareCommitterMap(...)     → CommitterMap            (setupClaCheck.ts)
 *   signatureWithPRComment(...)  → ReactedCommitterMap     (signatureComment.ts)
 *   updateFile(..., claFile)     → writes ClaFile to GitHub (persistence.ts)
 *
 * Keep this file additive: removing a field changes shape across half the
 * codebase, so prefer extending interfaces over redefining them.
 */

export interface CommitterMap {
    signed: CommittersDetails[],
    notSigned: CommittersDetails[],
    unknown: CommittersDetails[]
}
export interface ReactedCommitterMap {
    newSigned: CommittersDetails[],
    onlyCommitters?: CommittersDetails[],
    allSignedFlag: boolean
}
export interface CommittersDetails {
    name: string,
    /**
     * GitHub user `databaseId` for resolved committers, or `''` for
     * unresolved authors (no GitHub user could be matched to the commit).
     * The string-vs-number polymorphism is historical; don't tighten the type
     * without auditing every comparison site (some use `===` against numbers
     * in the signatures file, which fail vacuously for `''` — that's the
     * intended behavior, but easy to break accidentally).
     */
    id: number | string,
    email?: string,
    pullRequestNo?: number,
    created_at?: string,
    updated_at?: string
    comment_id?: number,
    body?: string,
    repoId?: string
}

/**
 * Shape of the persisted signatures JSON file. The file lives at
 * `path-to-signatures` on the configured `branch:`; `signedContributors` is
 * an append-only list of GitHub user ids that have signed.
 */
export interface ClaFile {
    signedContributors: { id: number, name?: string, pullRequestNo?: number, comment_id?: number, created_at?: string }[]
}

export interface ClafileContentAndSha {
    claFileContent: ClaFile,
    sha: string
}
