import { getOctokit } from './octokit'
import { context } from '@actions/github'
import { CommittersDetails } from './interfaces'
import { getPullRequestNumber } from './shared/getPullRequestNumber'



export default async function getCommitters(): Promise<CommittersDetails[]> {
    try {
        const octokit = await getOctokit()
        let committers: CommittersDetails[] = []
        let filteredCommitters: CommittersDetails[] = []
        let response: any = await octokit.graphql(`
        query($owner:String! $name:String! $number:Int! $cursor:String!){
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
    }`.replace(/ /g, ''), {
            owner: context.repo.owner,
            name: context.repo.repo,
            number: getPullRequestNumber(),
            cursor: ''
        })
        response.repository.pullRequest.commits.edges.forEach(edge => {
            const commit = edge.node.commit
            const committer = extractUserFromCommit(commit)
            // Email lives on commit.author (or commit.committer); the user
            // subobject doesn't carry it. Preserve it so logs and the
            // "not a GitHub user" UX have something to identify the person by.
            const email = commit.author?.email || commit.committer?.email
            let user = {
                name: committer.login || committer.name,
                id: committer.databaseId || '',
                email,
                pullRequestNo: getPullRequestNumber()
            }
            if (committers.length === 0 || committers.map((c) => {
                return c.name
            }).indexOf(user.name) < 0) {
                committers.push(user)
            }
        })
        filteredCommitters = committers.filter((committer) => {
            return committer.id !== 41898282
        })
        return filteredCommitters

    } catch (e) {
        throw new Error(`graphql call to get the committers details failed: ${e}`)
    }

}
const extractUserFromCommit = (commit) => commit.author.user || commit.committer.user || commit.author || commit.committer