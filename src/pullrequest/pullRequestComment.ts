import { getOctokit } from '../octokit'
import { context } from '@actions/github'
import signatureWithPRComment from './signatureComment'
import { commentContent, commentMarker } from './pullRequestCommentContent'
import {
  CommitterMap,
  CommittersDetails
} from '../interfaces'
import { getUseDcoFlag } from '../shared/getInputs'
import { getPullRequestNumber } from '../shared/getPullRequestNumber'



export default async function prCommentSetup(committerMap: CommitterMap, committers: CommittersDetails[]) {
  const signed = committerMap?.notSigned && committerMap?.notSigned.length === 0

  try {
    const claBotComment = await getComment()
    if (!claBotComment && !signed) {
      return createComment(signed, committerMap)
    } else if (claBotComment?.id) {
      if (signed) {
        await updateComment(signed, committerMap, claBotComment)
      }

      // reacted committers are contributors who have newly signed by posting the Pull Request comment
      const reactedCommitters = await signatureWithPRComment(committerMap, committers)
      if (reactedCommitters?.onlyCommitters) {
          reactedCommitters.allSignedFlag = prepareAllSignedCommitters(committerMap, reactedCommitters.onlyCommitters, committers)
      }
      committerMap = prepareCommiterMap(committerMap, reactedCommitters)
      await updateComment(reactedCommitters.allSignedFlag, committerMap, claBotComment)
      return reactedCommitters
    }
  } catch (error) {
    throw new Error(
      `Error occured when creating or editing the comments of the pull request: ${error.message}`)
  }
}

async function createComment(signed: boolean, committerMap: CommitterMap): Promise<void> {
  const octokit = await getOctokit()
  await octokit.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: getPullRequestNumber(),
    body: commentContent(signed, committerMap)
  }).catch(error => { throw new Error(`Error occured when creating a pull request comment: ${error.message}`) })
}

async function updateComment(signed: boolean, committerMap: CommitterMap, claBotComment: any): Promise<void> {
  const octokit = await getOctokit()
  await octokit.rest.issues.updateComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    comment_id: claBotComment.id,
    body: commentContent(signed, committerMap)
  }).catch(error => { throw new Error(`Error occured when updating the pull request comment: ${error.message}`) })
}

async function getComment() {
  try {
    const octokit = await getOctokit()
    const response = await octokit.rest.issues.listComments({ owner: context.repo.owner, repo: context.repo.repo, issue_number: getPullRequestNumber() })

    // Prefer comments with this job's hidden HTML-comment marker — keeps
    // multiple CLA/DCO jobs in one workflow from stomping each other
    // (BUG-COMMENT-MARKER / upstream #153). Falls back to the legacy
    // substring match for comments posted before markers existed; on the
    // next update those comments will be stamped with a marker.
    const marker = commentMarker()
    const markerMatch = response.data.find(comment =>
      comment.body?.includes(marker)
    )
    if (markerMatch) return markerMatch

    // Match BOTH the v3 brand ("Self-Hosted CLA/DCO Assistant bot") and the
    // upstream/v2 brand ("CLA/DCO Assistant Lite bot"). Existing PR comments
    // from v2.x consumers must still be findable on the first v3 run; once
    // updated they carry the new marker and don't rely on this fallback.
    const isDco = getUseDcoFlag() === 'true'
    const legacy = isDco
      ? /.*(?:Self-Hosted DCO Assistant|DCO Assistant Lite) bot.*/m
      : /.*(?:Self-Hosted CLA Assistant|CLA Assistant Lite) bot.*/m
    return response.data.find(comment => comment.body?.match(legacy))
  } catch (error) {
    throw new Error(`Error occured when getting  all the comments of the pull request: ${error.message}`)
  }
}

function prepareCommiterMap(committerMap: CommitterMap, reactedCommitters) {
  committerMap.signed?.push(...reactedCommitters.newSigned)
  committerMap.notSigned = committerMap.notSigned!.filter(
    committer =>
      !reactedCommitters.newSigned.some(
        reactedCommitter => committer.id === reactedCommitter.id
      )
  )
  return committerMap

}

function prepareAllSignedCommitters(committerMap: CommitterMap, signedInPrCommitters: CommittersDetails[], committers: CommittersDetails[]): boolean {
  let allSignedCommitters = [] as CommittersDetails[]
  /*
   * 1) already signed committers in the file 2) signed committers in the PR comment
  */
  const ids = new Set(signedInPrCommitters.map(committer => committer.id))
  allSignedCommitters = [...signedInPrCommitters, ...committerMap.signed!.filter(signedCommitter => !ids.has(signedCommitter.id))]
  /*
  * checking if all the unsigned committers have reacted to the PR comment (this is needed for changing the content of the PR comment to "All committers have signed the CLA")
  */
  let allSignedFlag: boolean = committers.every(committer => allSignedCommitters.some(reactedCommitter => committer.id === reactedCommitter.id))
  return allSignedFlag
}

