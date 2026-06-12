import * as core from '@actions/core'
import { context } from '@actions/github'
import { checkAllowList } from './checkAllowList'
import getCommitters from './graphql'
import {
  ClafileContentAndSha,
  CommitterMap,
  CommittersDetails,
  ReactedCommitterMap
} from './interfaces'
import {
  createFile,
  getFileContent,
  updateFile
} from './persistence/persistence'
import prCommentSetup from './pullrequest/pullRequestComment'
import { reRunLastWorkFlowIfRequired } from './pullRerunRunner'
import { getPullRequestNumber } from './shared/getPullRequestNumber'

export async function setupClaCheck() {
  let committerMap = getInitialCommittersMap()

  let committers = await getCommitters()
  committers = checkAllowList(committers)

  const { claFileContent, sha } = (await getCLAFileContentandSHA(
    committers,
    committerMap
  )) as ClafileContentAndSha

  committerMap = prepareCommiterMap(committers, claFileContent) as CommitterMap

  try {
    const reactedCommitters = (await prCommentSetup(
      committerMap,
      committers
    )) as ReactedCommitterMap

    if (reactedCommitters?.newSigned.length) {
      /* pushing the recently signed  contributors to the CLA Json File */
      await updateFile(sha, claFileContent, reactedCommitters)
    }
    if (
      reactedCommitters?.allSignedFlag ||
      committerMap?.notSigned === undefined ||
      committerMap.notSigned.length === 0
    ) {
      core.info(`All contributors have signed the CLA 📝 ✅ `)
      return reRunLastWorkFlowIfRequired()
    } else {
      core.setFailed(
        `Committers of Pull Request number ${getPullRequestNumber()} have to sign the CLA 📝`
      )
    }
  } catch (err) {
    core.setFailed(
      `Could not update the JSON file: ${err.message}. Make sure the branch where signatures are stored is NOT protected.`
    )
  }
}

async function getCLAFileContentandSHA(
  committers: CommittersDetails[],
  committerMap: CommitterMap
): Promise<void | ClafileContentAndSha> {
  let result, claFileContentString, claFileContent, sha
  try {
    result = await getFileContent()
  } catch (error) {
    // Octokit returns status as a number. Historically this was compared to
    // the string "404" — a typo that made the auto-create path dead code,
    // forcing every first-time install to manually pre-create cla.json.
    if (error.status === 404) {
      return createClaFileAndPRComment(committers, committerMap)
    } else {
      throw new Error(
        `Could not retrieve repository contents. Status: ${
          error.status || 'unknown'
        }`
      )
    }
  }
  sha = result?.data?.sha
  claFileContentString = Buffer.from(result.data.content, 'base64').toString()
  claFileContent = JSON.parse(claFileContentString)
  return { claFileContent, sha }
}

async function createClaFileAndPRComment(
  committers: CommittersDetails[],
  committerMap: CommitterMap
): Promise<void> {
  committerMap.notSigned = committers
  committerMap.signed = []
  committers.map(committer => {
    if (!committer.id) {
      committerMap.unknown.push(committer)
    }
  })

  const initialContent = { signedContributors: [] }
  const initialContentString = JSON.stringify(initialContent, null, 3)
  const initialContentBinary =
    Buffer.from(initialContentString).toString('base64')

  await createFile(initialContentBinary).catch(error =>
    core.setFailed(
      `Error occurred when creating the signed contributors file: ${
        error.message || error
      }. Make sure the branch where signatures are stored is NOT protected.`
    )
  )
  await prCommentSetup(committerMap, committers)
  throw new Error(
    `Committers of pull request ${getPullRequestNumber()} have to sign the CLA`
  )
}

function prepareCommiterMap(
  committers: CommittersDetails[],
  claFileContent
): CommitterMap {
  let committerMap = getInitialCommittersMap()

  // Defensive default: a malformed signatures file (e.g. `{}` or a partial
  // write) used to throw here when signedContributors was undefined.
  const signedList: { id: number }[] = claFileContent?.signedContributors ?? []

  committerMap.notSigned = committers.filter(
    committer => !signedList.some(cla => committer.id === cla.id)
  )
  committerMap.signed = committers.filter(committer =>
    signedList.some(cla => committer.id === cla.id)
  )
  committers.forEach(committer => {
    if (!committer.id) {
      committerMap.unknown.push(committer)
    }
  })
  return committerMap
}

const getInitialCommittersMap = (): CommitterMap => ({
  signed: [],
  notSigned: [],
  unknown: []
})
