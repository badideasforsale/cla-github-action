/**
 * Tests for src/pullRerunRunner.ts — specifically the BUG-RERUN-WORKFLOW-LOOKUP
 * (#135) soft-fail behavior: getSelfWorkflowId should return null + emit a
 * warning instead of throwing when context.workflow doesn't match a workflow
 * by name. Throwing here used to fail the otherwise-green sign flow.
 */

const mockGetPull = jest.fn()
const mockListRepoWorkflows = jest.fn()
const mockListWorkflowRuns = jest.fn()
const mockGetWorkflowRun = jest.fn()
const mockReRunWorkflow = jest.fn(async () => ({}))

jest.mock('@actions/core')
jest.mock('@actions/github', () => ({
  context: {
    eventName: 'issue_comment', // anything other than 'pull_request' so the function actually runs
    workflow: 'CLA Assistant',
    repo: { owner: 'acme', repo: 'demo' },
    issue: { number: 42, owner: 'acme', repo: 'demo' }
  }
}))
jest.mock('../src/octokit', () => ({
  getOctokit: jest.fn(async () => ({
    rest: {
      pulls: { get: mockGetPull },
      actions: {
        listRepoWorkflows: mockListRepoWorkflows,
        listWorkflowRuns: mockListWorkflowRuns,
        getWorkflowRun: mockGetWorkflowRun,
        reRunWorkflow: mockReRunWorkflow
      }
    }
  }))
}))

import { reRunLastWorkFlowIfRequired } from '../src/pullRerunRunner'
import * as core from '@actions/core'

const mockedWarning = jest.mocked(core.warning)

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPull.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } })
})

describe('reRunLastWorkFlowIfRequired — BUG-RERUN-WORKFLOW-LOOKUP (#135)', () => {
  it('does NOT throw when the workflow cannot be matched by name', async () => {
    // No workflow in the listing matches context.workflow → soft-fail.
    mockListRepoWorkflows.mockResolvedValueOnce({
      data: { total_count: 1, workflows: [{ id: 1, name: 'unrelated-workflow' }] }
    })

    await expect(reRunLastWorkFlowIfRequired()).resolves.toBeUndefined()

    // The sign flow stays green; we warn and bail.
    expect(mockedWarning).toHaveBeenCalledWith(
      expect.stringContaining('Could not locate workflow')
    )
    // And critically, we did NOT try to list runs or re-run anything.
    expect(mockListWorkflowRuns).not.toHaveBeenCalled()
    expect(mockReRunWorkflow).not.toHaveBeenCalled()
  })

  it('reruns the last workflow run when matched and the previous run failed', async () => {
    mockListRepoWorkflows.mockResolvedValueOnce({
      data: { total_count: 1, workflows: [{ id: 9, name: 'CLA Assistant' }] }
    })
    mockListWorkflowRuns.mockResolvedValueOnce({
      data: { total_count: 1, workflow_runs: [{ id: 555 }] }
    })
    mockGetWorkflowRun.mockResolvedValueOnce({
      data: { conclusion: 'failure' }
    })

    await expect(reRunLastWorkFlowIfRequired()).resolves.toBeUndefined()

    expect(mockReRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 555 })
    )
  })

  it('does NOT rerun when the previous run was not a failure', async () => {
    mockListRepoWorkflows.mockResolvedValueOnce({
      data: { total_count: 1, workflows: [{ id: 9, name: 'CLA Assistant' }] }
    })
    mockListWorkflowRuns.mockResolvedValueOnce({
      data: { total_count: 1, workflow_runs: [{ id: 555 }] }
    })
    mockGetWorkflowRun.mockResolvedValueOnce({
      data: { conclusion: 'success' }
    })

    await expect(reRunLastWorkFlowIfRequired()).resolves.toBeUndefined()

    expect(mockReRunWorkflow).not.toHaveBeenCalled()
  })
})
