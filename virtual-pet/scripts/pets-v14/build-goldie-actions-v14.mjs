import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v14ActionIds,
  v14Actions,
  v14Canvas,
  v14ForgeProcessor,
  v14Paths,
  v14RuntimeFrames,
  v14SourceFrames,
  v14Stabilization,
} from './goldie-actions-v14-config.mjs'
import {
  writeManifest,
  writeReviewIndex,
  writeReviewStrip,
} from './goldie-actions-v14-output.mjs'
import {
  analyzeFrame,
  bodyStepStats,
  interpolateFrames,
  readRawFrame,
  stabilizeFrame,
  summarizeFrames,
  writeRawFrame,
} from './goldie-actions-v14-stabilizer.mjs'

const root = process.cwd()

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await emptyDir(v14Paths.runtimeDir)
  await emptyDir(v14Paths.reviewDir)
  await emptyDir(v14Paths.stabilizedDir)
}

function v13SourceFramePath(action, index) {
  return path.join(
    action.sourceRuntimeDir,
    `${action.sourcePrefix}-${String(index).padStart(2, '0')}.webp`,
  )
}

function runtimeFramePath(actionId, index) {
  return path.join(
    v14Paths.runtimeDir,
    `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

function stableFramePath(actionId, index) {
  return path.join(
    v14Paths.stabilizedDir,
    actionId,
    `goldie-${actionId}-${String(index).padStart(2, '0')}.png`,
  )
}

function forgeFramePath(action, index) {
  return path.join(action.processedDir, `${action.sourcePrefix}-${index}.png`)
}

async function readForgeMeta(action) {
  const metaPath = path.join(action.processedDir, 'pipeline-meta.json')
  const meta = JSON.parse(await fs.readFile(resolveProjectPath(metaPath), 'utf8'))
  return {
    align: meta.align,
    cellSize: meta.cell_size,
    cols: meta.cols,
    componentMode: meta.component_mode,
    componentPadding: meta.component_padding,
    duration: meta.duration,
    edgeCleanDepth: meta.edge_clean_depth,
    edgeThreshold: meta.edge_threshold,
    edgeTouchFrames: meta.edge_touch_frames,
    edgeTouchMargin: meta.edge_touch_margin,
    fitScale: meta.fit_scale,
    frameLabels: meta.frame_labels,
    minComponentArea: meta.min_component_area,
    processor: v14ForgeProcessor,
    rows: meta.rows,
    sharedScale: meta.shared_scale,
    threshold: meta.threshold,
    trimBorder: meta.trim_border,
  }
}

function sourceFramePath(action, index) {
  if (action.sourceType === 'runtime-v13') {
    return v13SourceFramePath(action, index)
  }
  return forgeFramePath(action, index)
}

async function loadSourceFrames(action) {
  const frames = []
  for (let index = 1; index <= v14SourceFrames; index += 1) {
    const relativePath = sourceFramePath(action, index)
    const frame = await readRawFrame(relativePath, resolveProjectPath)
    frames.push({ ...frame, index, metrics: analyzeFrame(frame) })
  }
  return frames
}

async function buildStabilizedAction(actionId, idleBaseline) {
  const action = v14Actions[actionId]
  const sourceFrames = await loadSourceFrames(action)
  const actionBaseline = summarizeFrames(sourceFrames)
  const stableFrames = []
  const stablePaths = []

  await fs.mkdir(resolveProjectPath(path.join(v14Paths.stabilizedDir, actionId)), {
    recursive: true,
  })

  for (const frame of sourceFrames) {
    const stable = await stabilizeFrame(frame, actionId, actionBaseline, idleBaseline)
    const stablePath = stableFramePath(actionId, frame.index)
    await writeRawFrame(stable.data, stablePath, resolveProjectPath, 'png')
    stableFrames.push(stable)
    stablePaths.push(stablePath)
  }

  const runtimeFrames = interpolateFrames(stableFrames, action.loop)
  const runtimePaths = []

  for (let index = 1; index <= v14RuntimeFrames; index += 1) {
    const runtimePath = runtimeFramePath(actionId, index)
    await writeRawFrame(runtimeFrames[index - 1].data, runtimePath, resolveProjectPath, 'webp')
    runtimePaths.push(runtimePath)
  }

  await writeReviewStrip(actionId, runtimePaths, resolveProjectPath)
  return {
    forgeMeta: action.sourceType === 'forge' ? await readForgeMeta(action) : null,
    metrics: {
      actionBaseline,
      idleBaseline,
      runtimeBodySteps: bodyStepStats(runtimeFrames, action.loop),
      runtimeFrames: runtimeFrames.map((frame, index) => ({
        ...frame.metrics,
        frame: index + 1,
      })),
      sourceBodySteps: bodyStepStats(sourceFrames, action.loop),
      stabilizedBodySteps: bodyStepStats(stableFrames, action.loop),
      stabilizedFrames: stableFrames.map((frame, index) => ({
        ...frame.metrics,
        frame: index + 1,
      })),
    },
    runtimePaths,
    source: action.sourceType === 'forge'
      ? { sheet: action.sourceSheet, type: action.sourceType }
      : { inheritedFrom: 'frames-v13', type: action.sourceType },
    stablePaths,
  }
}

async function main() {
  await prepareDirs()
  const generated = new Map()
  const idleSourceFrames = await loadSourceFrames(v14Actions.idle)
  const idleBaseline = summarizeFrames(idleSourceFrames)

  for (const actionId of v14ActionIds) {
    generated.set(actionId, await buildStabilizedAction(actionId, idleBaseline))
  }

  await writeReviewIndex(resolveProjectPath)
  await writeManifest(generated, resolveProjectPath)
  console.log(`Generated Goldie V14 ${v14Stabilization.strategy} action frames.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
