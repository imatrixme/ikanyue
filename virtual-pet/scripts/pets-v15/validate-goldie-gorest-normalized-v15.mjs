import fs from 'node:fs/promises'
import sharp from 'sharp'
import {
  frameCols,
  frameRows,
  outputRoot,
  rawActionIds,
  resolveProjectPath,
} from './goldie-gorest-v15-config.mjs'
import { v14Canvas, v14RuntimeFrames, v14SourceFrames } from '../pets-v14/goldie-actions-v14-config.mjs'

const maxRuntimeBodyStepPx = 12
const maxTerminalStepPx = 2
const minVisibleMarginPx = 16

async function main() {
  const summary = await readJson(`${outputRoot}/goldie-v15-gorest-summary.json`)
  const expectedActions = rawActionIds()

  assert(summary.results.length === expectedActions.length, `Expected ${expectedActions.length} V15 actions`)

  for (const actionId of expectedActions) {
    const result = summary.results.find((candidate) => candidate.actionId === actionId)
    assert(result, `Missing V15 result for ${actionId}`)
    await validateAction(result)
  }

  await assertFile(`${outputRoot}/review/index.html`)
  console.log('Goldie V15 Gorest-style review assets are valid.')
}

async function validateAction(result) {
  assert(result.frameCount === v14SourceFrames, `${result.actionId} should keep ${v14SourceFrames} source frames`)
  assert(result.runtimeFrameCount === v14RuntimeFrames, `${result.actionId} should create ${v14RuntimeFrames} preview frames`)
  assert(result.gridDetection.mode === 'auto_detected', `${result.actionId} should use detected grid cells`)
  assert(result.sourceCells.length === v14SourceFrames, `${result.actionId} should record every source cell`)
  assert(result.stableFramePaths.length === v14SourceFrames, `${result.actionId} should write stable frames`)
  assert(result.runtimeFramePaths.length === v14RuntimeFrames, `${result.actionId} should write preview frames`)
  assert(result.metrics.runtimeBodySteps.max <= maxRuntimeBodyStepPx, `${result.actionId} max body step is too high`)
  assert(result.metrics.runtimeBodySteps.terminalStep <= maxTerminalStepPx, `${result.actionId} loop terminal step is too high`)

  await assertImageSize(
    result.normalizedSheetPath,
    v14Canvas.width * frameCols,
    v14Canvas.height * frameRows,
  )
  await assertFile(result.reviewStripPath)

  for (const framePath of result.stableFramePaths) {
    await assertImageSize(framePath, v14Canvas.width, v14Canvas.height)
  }

  for (const frame of result.metrics.stableFrames) {
    assert(frame.visibleMargin >= minVisibleMarginPx, `${result.actionId} frame ${frame.frame} has unsafe edge margin`)
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(resolveProjectPath(relativePath), 'utf8'))
}

async function assertFile(relativePath) {
  await fs.access(resolveProjectPath(relativePath))
}

async function assertImageSize(relativePath, width, height) {
  const meta = await sharp(resolveProjectPath(relativePath)).metadata()
  assert(meta.width === width && meta.height === height, `${relativePath} should be ${width}x${height}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
