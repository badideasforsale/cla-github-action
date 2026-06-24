import { context } from '@actions/github'
import { getOctokit } from './octokit'
import { getPullRequestNumber } from './shared/getPullRequestNumber'

import * as core from '@actions/core'

// Note: why this  re-run of the last failed CLA workflow status check is explained this issue https://github.com/cla-assistant/github-action/issues/39
export async function reRunLastWorkFlowIfRequired() {
  if (context.eventName === 'pull_request') {
    core.debug(`rerun not required for event - pull_request`)
    return
  }

  const branch = await getBranchOfPullRequest()
  const workflowId = await getSelfWorkflowId()
  if (workflowId === null) {
    return
  }
  const runs = await listWorkflowRunsInBranch(branch, workflowId)

  if (runs.data.total_count > 0) {
    const run = runs.data.workflow_runs[0].id

    const isLastWorkFlowFailed: boolean = await checkIfLastWorkFlowFailed(run)
    if (isLastWorkFlowFailed) {
      core.debug(`Rerunning build run ${run}`)
      await reRunWorkflow(run).catch(error =>
        core.error(`Error occurred when re-running the workflow: ${error}`)
      )
    }
  }
}

async function getBranchOfPullRequest(): Promise<string> {
  const octokit = await getOctokit()
  const pullRequest = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: getPullRequestNumber()
  })

  return pullRequest.data.head.ref
}

// Returns null if the workflow cannot be located by name. Throwing here used
// to fail the otherwise-green sign flow when context.workflow didn't match a
// workflow's name field (e.g. unnamed workflows, name collisions, transient
// list pagination edge cases).
async function getSelfWorkflowId(): Promise<number | null> {
  const octokit = await getOctokit()
  const perPage = 100

  // P-14: previous loop used `total_count < page * perPage` as the stop
  // condition, which wasted one empty API call whenever the total was an
  // exact multiple of perPage (page 1 returns 30 of 30, then page 2 fires
  // and returns empty before stopping). Stop on `workflows.length < perPage`
  // instead — the last page is by definition the one that's not full.
  for (let page = 1; ; page++) {
    const workflowList = await octokit.rest.actions.listRepoWorkflows({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: perPage,
      page
    })

    const workflow = workflowList.data.workflows.find(
      w => w.name == context.workflow
    )
    if (workflow) return workflow.id

    if (workflowList.data.workflows.length < perPage) break
  }

  core.warning(
    `Could not locate workflow "${context.workflow}" by name; skipping post-sign re-run of any failed check.`
  )
  return null
}

async function listWorkflowRunsInBranch(
  branch: string,
  workflowId: number
): Promise<any> {
  core.debug(`listing workflow runs on branch ${branch}`)
  const octokit = await getOctokit()
  const runs = await octokit.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    branch,
    workflow_id: workflowId,
    event: 'pull_request_target'
  })
  return runs
}

async function reRunWorkflow(run: number): Promise<any> {
  // P-4 (was: 2020-era "PAT required" comment). Post-M5.2 this call uses
  // whichever octokit `getOctokit()` returns — App > PAT > GITHUB_TOKEN. The
  // default GITHUB_TOKEN works under `pull_request_target` for re-running
  // a workflow on the PR's branch; no extra scope needed.
  const octokit = await getOctokit()
  await octokit.rest.actions.reRunWorkflow({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })
}

async function checkIfLastWorkFlowFailed(run: number): Promise<boolean> {
  const octokit = await getOctokit()
  const response: any = await octokit.rest.actions.getWorkflowRun({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: run
  })

  return response.data.conclusion == 'failure'
}
