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
  v14Strategy,
  v14Validation,
} from './goldie-actions-v14-config.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function framePath(actionId, index) {
  return path.join(
    v14Paths.runtimeDir,
    `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

async function readRaw(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, height: info.height, width: info.width }
}

function visibleBounds(img) {
  let minX = img.width
  let minY = img.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const alpha = img.data[(y * img.width + x) * 4 + 3]
      if (alpha <= v14Validation.alphaThreshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }
  return { maxX, maxY, minX, minY }
}

function visibleMargin(bounds) {
  return Math.min(
    bounds.minX,
    bounds.minY,
    v14Canvas.width - bounds.maxX,
    v14Canvas.height - bounds.maxY,
  )
}

async function validateFrames() {
  for (const actionId of v14ActionIds) {
    for (let index = 1; index <= v14RuntimeFrames; index += 1) {
      const relativePath = framePath(actionId, index)
      try {
        await fs.access(resolveProjectPath(relativePath))
      } catch {
        errors.push(`Missing V14 frame: ${relativePath}`)
        continue
      }

      const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
      if (metadata.width !== v14Canvas.width || metadata.height !== v14Canvas.height) {
        errors.push(`Wrong V14 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
      }

      const raw = await readRaw(relativePath)
      const bounds = visibleBounds(raw)
      if (!bounds) {
        errors.push(`V14 frame has no visible pixels: ${relativePath}`)
        continue
      }
      if (visibleMargin(bounds) < v14Validation.minVisibleMarginPx) {
        errors.push(`V14 visible pixels are too close to canvas edge: ${relativePath}`)
      }
    }
  }
}

function approxEqual(actual, expected) {
  return Object.is(actual, expected)
}

function validateForgeMeta(actionId, action, manifestAction) {
  if (action.sourceType !== 'forge') {
    if (manifestAction.forgeMeta !== null) {
      errors.push(`V14 ${actionId} should not include Forge metadata`)
    }
    return
  }

  const meta = manifestAction.forgeMeta
  if (!meta) {
    errors.push(`V14 ${actionId} is missing Forge metadata`)
    return
  }

  const expected = {
    align: v14ForgeProcessor.align,
    cellSize: v14ForgeProcessor.cellSize,
    cols: v14ForgeProcessor.cols,
    componentMode: v14ForgeProcessor.componentMode,
    componentPadding: v14ForgeProcessor.componentPadding,
    duration: v14ForgeProcessor.duration,
    edgeCleanDepth: v14ForgeProcessor.edgeCleanDepth,
    edgeThreshold: v14ForgeProcessor.edgeThreshold,
    edgeTouchMargin: v14ForgeProcessor.edgeTouchMargin,
    fitScale: v14ForgeProcessor.fitScale,
    minComponentArea: v14ForgeProcessor.minComponentArea,
    rows: v14ForgeProcessor.rows,
    sharedScale: v14ForgeProcessor.sharedScale,
    threshold: v14ForgeProcessor.threshold,
    trimBorder: v14ForgeProcessor.trimBorder,
  }

  for (const [key, value] of Object.entries(expected)) {
    if (!approxEqual(meta[key], value)) {
      errors.push(`V14 ${actionId} Forge metadata mismatch for ${key}`)
    }
  }
  if (meta.edgeTouchFrames?.length !== 0) {
    errors.push(`V14 ${actionId} Forge source has edge-touch frames`)
  }
  if (meta.frameLabels?.length !== v14SourceFrames) {
    errors.push(`V14 ${actionId} Forge metadata has wrong frame label count`)
  }
}

async function validateForgeSources() {
  for (const actionId of v14ActionIds) {
    const action = v14Actions[actionId]
    if (action.sourceType !== 'forge') {
      continue
    }

    const sourceMetadata = await sharp(resolveProjectPath(action.sourceSheet)).metadata()
    const ratio = sourceMetadata.width / sourceMetadata.height
    if (ratio < v14Validation.sourceSheetMinRatio) {
      errors.push(`V14 ${actionId} Forge source sheet is not landscape enough for 8x4 slicing: ${sourceMetadata.width}x${sourceMetadata.height}`)
    }

    const metaPath = path.join(action.processedDir, 'pipeline-meta.json')
    let meta
    try {
      meta = JSON.parse(await fs.readFile(resolveProjectPath(metaPath), 'utf8'))
    } catch {
      errors.push(`Missing V14 ${actionId} Forge processor metadata: ${metaPath}`)
      continue
    }
    if (meta.rows !== v14ForgeProcessor.rows || meta.cols !== v14ForgeProcessor.cols) {
      errors.push(`V14 ${actionId} Forge processor grid is not 4x8`)
    }
    if (meta.frame_labels?.length !== v14SourceFrames) {
      errors.push(`V14 ${actionId} Forge processor did not emit 32 labels`)
    }
    if (meta.edge_touch_frames?.length !== 0) {
      errors.push(`V14 ${actionId} Forge processor reports edge-touch frames`)
    }

    for (let index = 1; index <= v14SourceFrames; index += 1) {
      const processedPath = path.join(action.processedDir, `${action.sourcePrefix}-${index}.png`)
      try {
        await fs.access(resolveProjectPath(processedPath))
      } catch {
        errors.push(`Missing V14 ${actionId} Forge processed frame: ${processedPath}`)
      }
    }
  }
}

async function validateAssetManifest() {
  const manifest = JSON.parse(await fs.readFile(resolveProjectPath(v14Paths.manifestPath), 'utf8'))
  if (manifest.strategy !== v14Strategy) {
    errors.push('V14 manifest has wrong strategy')
  }
  if (manifest.stabilization?.strategy !== v14Stabilization.strategy) {
    errors.push('V14 manifest has wrong stabilization strategy')
  }

  for (const actionId of v14ActionIds) {
    const action = manifest.actions?.[actionId]
    if (!action) {
      errors.push(`V14 manifest missing action: ${actionId}`)
      continue
    }
    if (action.runtimePaths?.length !== v14RuntimeFrames) {
      errors.push(`V14 manifest has wrong runtime count for ${actionId}`)
    }
    if (action.sourceFrames !== v14Actions[actionId].sourceFrames) {
      errors.push(`V14 manifest has wrong source count for ${actionId}`)
    }
    if (action.stablePaths?.length !== v14SourceFrames) {
      errors.push(`V14 manifest has wrong stabilized source count for ${actionId}`)
    }
    if (action.metrics?.runtimeBodySteps?.max > v14Validation.maxRuntimeBodyStepPx) {
      errors.push(`V14 ${actionId} runtime body step is too large`)
    }
    validateForgeMeta(actionId, v14Actions[actionId], action)
  }
}

async function validateRuntimeManifest() {
  const runtimeManifest = await fs.readFile(
    resolveProjectPath(v14Paths.runtimeGoldieManifestPath),
    'utf8',
  )
  if (!runtimeManifest.includes('/frames-v14/')) {
    errors.push('Goldie runtime manifest is missing V14 frames')
  }
  if (runtimeManifest.includes('/frames-v8/') || runtimeManifest.includes('/frames-v13/')) {
    errors.push('Goldie runtime manifest still mixes older Goldie frame versions')
  }
  for (const actionId of v14ActionIds) {
    if (!runtimeManifest.includes(`    ${actionId}: {`)) {
      errors.push(`Goldie runtime manifest missing action block: ${actionId}`)
    }
  }
}

async function validateReview() {
  const reviewPaths = [
    path.join(v14Paths.reviewDir, 'index.html'),
    ...v14ActionIds.map((actionId) =>
      path.join(v14Paths.reviewDir, `goldie-${actionId}-v14-strip.webp`),
    ),
  ]

  for (const relativePath of reviewPaths) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V14 review asset: ${relativePath}`)
    }
  }
}

async function main() {
  await validateForgeSources()
  await validateFrames()
  await validateAssetManifest()
  await validateRuntimeManifest()
  await validateReview()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V14 stabilized Forge action assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
