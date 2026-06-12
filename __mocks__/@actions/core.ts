/**
 * Manual jest mock for @actions/core.
 *
 * @actions/core@3 is ESM-only — jest's auto-mock resolution fails because
 * the package's exports map has no `require` condition. This stub provides
 * the surface our source uses, as plain Jest mock functions. All test
 * files that call `jest.mock('@actions/core')` (no factory) get this.
 *
 * Source-of-truth: src/ only reads info, warning, error, debug, setFailed,
 * getInput. New uses should be added here.
 */

export const info = jest.fn()
export const warning = jest.fn()
export const error = jest.fn()
export const debug = jest.fn()
export const setFailed = jest.fn()
export const getInput = jest.fn(() => '')
export const setOutput = jest.fn()
export const exportVariable = jest.fn()
export const setSecret = jest.fn()
export const addPath = jest.fn()
export const getBooleanInput = jest.fn(() => false)
export const startGroup = jest.fn()
export const endGroup = jest.fn()
export const isDebug = jest.fn(() => false)
