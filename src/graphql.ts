import { getOctokit } from './octokit'
import { context } from '@actions/github'
import * as core from '@actions/core'
import { CommittersDetails } from './interfaces'
import { getPullRequestNumber } from './shared/getPullRequestNumber'

// Hard cap on pages we'll fetch (100 commits/page × 50 pages = 5000 commits).
// Defends against runaway loops on degenerate PRs; if hit, we warn loudly and
// proceed with whatever we collected so far — better to fail closed (CLA
// check still runs on what we saw) than to silently swallow.
const MAX_PAGES = 50

export default async function getCommitters(): Promise<CommittersDetails[]> {
    try {
        const octokit = await getOctokit()
        const committers: CommittersDetails[] = []
        // SEC-DEDUP-NAME-COLLISION: dedup key MUST distinguish resolved-by-id
        // from unresolved-by-(name,email). Keying on `name` alone collapses
        // both namespaces and lets an attacker forge a `git --author "<signed-
        // login> <unclaimed-email>"` line that collides with a real signed
        // contributor's login, causing their unsigned commit to be silently
        // dropped from the CLA check.
        const seenKeys = new Set<string>()

        const query = `
        query($owner:String! $name:String! $number:Int! $cursor:String){
            repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
                commits(first: 100, after: $cursor) {
                    totalCount
                    edges {
                        node {
                            commit {
                                author {
                                    email
                                    name
                                    user {
                                        id
                                        databaseId
                                        login
                                    }
                                }
                                committer {
                                    name
                                    user {
                                        id
                                        databaseId
                                        login
                                    }
                                }
                            }
                        }
                        cursor
                    }
                    pageInfo {
                        endCursor
                        hasNextPage
                    }
                }
            }
        }
    }`.replace(/ /g, '')

        let cursor: string | null = null
        let pages = 0
        // SEC-PAGINATE-COMMITS: pre-v3 stopped after the first 100 commits on
        // every PR, which both broke the CLA check on large legitimate PRs AND
        // let a contributor bypass it by padding with 100 trivial commits
        // authored as a signed identity before slipping unsigned commits past
        // position 100. Loop until pageInfo.hasNextPage is false.
        /* eslint-disable no-constant-condition */
        while (true) {
            const response: any = await octokit.graphql(query, {
                owner: context.repo.owner,
                name: context.repo.repo,
                number: getPullRequestNumber(),
                cursor
            })
            const page = response.repository.pullRequest.commits
            for (const edge of page.edges ?? []) {
                const commit = edge.node.commit
                const committer = extractUserFromCommit(commit)
                // Email lives on commit.author (or commit.committer); the user
                // subobject doesn't carry it. Preserve it so logs and the
                // "not a GitHub user" UX have something to identify the person by.
                const email = commit.author?.email || commit.committer?.email
                const user = {
                    name: committer.login || committer.name,
                    id: committer.databaseId || '',
                    email,
                    pullRequestNo: getPullRequestNumber()
                }
                const dedupKey = user.id
                    ? `id:${user.id}`
                    : `raw:${user.name}:${user.email ?? ''}`
                if (!seenKeys.has(dedupKey)) {
                    seenKeys.add(dedupKey)
                    committers.push(user)
                }
            }
            if (!page.pageInfo?.hasNextPage) break
            pages++
            if (pages >= MAX_PAGES) {
                core.warning(
                    `PR has more than ${MAX_PAGES * 100} commits; the CLA check will only verify ` +
                    `the first ${MAX_PAGES * 100}. Split the PR or contact a maintainer.`
                )
                break
            }
            cursor = page.pageInfo.endCursor
        }

        return committers.filter(committer => committer.id !== 41898282)
    } catch (e) {
        throw new Error(`graphql call to get the committers details failed: ${e}`)
    }
}

const extractUserFromCommit = (commit) => commit.author.user || commit.committer.user || commit.author || commit.committer
