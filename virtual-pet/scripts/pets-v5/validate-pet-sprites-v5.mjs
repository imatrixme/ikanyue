import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { v5Actions, v5Pipeline } from './pet-sprite-v5-config.mjs'

const root = process.cwd()
const errors = []
const alphaThreshold = 8

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function readManifest() {
  try {
    const contents = await fs.readFile(resolveProjectPath(v5Pipeline.manifestPath), 'utf8')
    return JSON.parse(contents)
  } catch (error) {
    errors.push(`Missing or invalid V5 manifest: ${v5Pipeline.manifestPath}`)
    return null
  }
}

async function alphaBounds(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }

  return {
    baselineY: maxY,
    centerX: (minX + maxX) / 2,
    maxX,
    maxY,
    minX,
    minY,
  }
}

function actionKey(action) {
  return `${action.speciesId}/${action.stageId}/${action.actionId}`
}

async function validateAction(action, manifest) {
  const entry = manifest?.actions?.find(
    (item) =>
      item.speciesId === action.speciesId &&
      item.stageId === action.stageId &&
      item.actionId === action.actionId,
  )
  if (!entry) {
    errors.push(`V5 manifest is missing action: ${actionKey(action)}`)
    return
  }

  if (entry.frameCount !== action.frameCount) {
    errors.push(
      `Wrong V5 frame count in manifest for ${actionKey(action)}: ${entry.frameCount}`,
    )
  }
  if (entry.renderer !== action.renderer) {
    errors.push(`Wrong V5 renderer in manifest for ${actionKey(action)}: ${entry.renderer}`)
  }

  const runtimePaths = entry.runtimePaths ?? []
  const rawPaths = entry.rawPaths ?? []
  if (runtimePaths.length !== action.frameCount) {
    errors.push(
      `V5 runtime path count for ${actionKey(action)} is ${runtimePaths.length}; expected ${action.frameCount}`,
    )
  }
  if (rawPaths.length !== action.frameCount) {
    errors.push(
      `V5 raw path count for ${actionKey(action)} is ${rawPaths.length}; expected ${action.frameCount}`,
    )
  }

  await validateReview(entry.reviewPath, action)
  const bounds = []
  for (const relativePath of runtimePaths) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V5 runtime frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (
      metadata.width !== v5Pipeline.canvas.width ||
      metadata.height !== v5Pipeline.canvas.height
    ) {
      errors.push(
        `Wrong V5 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`,
      )
    }

    const frameBounds = await alphaBounds(relativePath)
    if (!frameBounds) {
      errors.push(`V5 runtime frame has no visible pixels: ${relativePath}`)
      continue
    }

    if (
      frameBounds.minX < action.visibleMarginPx ||
      frameBounds.minY < action.visibleMarginPx ||
      frameBounds.maxX > v5Pipeline.canvas.width - action.visibleMarginPx ||
      frameBounds.maxY > v5Pipeline.canvas.height - action.visibleMarginPx
    ) {
      errors.push(`V5 visible pixels are too close to canvas edge: ${relativePath}`)
    }

    bounds.push({ relativePath, ...frameBounds })
  }

  if (bounds.length !== action.frameCount) {
    return
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const frame = bounds[index]
    const nextFrame = bounds[(index + 1) % bounds.length]
    const centerStep = Math.abs(nextFrame.centerX - frame.centerX)
    const baselineStep = Math.abs(nextFrame.baselineY - frame.baselineY)
    const maxCenter =
      index === bounds.length - 1 ? action.maxLoopCenterStepPx : action.maxCenterStepPx

    if (centerStep > maxCenter) {
      errors.push(
        `V5 center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
    if (baselineStep > action.maxBaselineStepPx) {
      errors.push(
        `V5 baseline step ${baselineStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
  }
}

async function validateReview(reviewPath, action) {
  if (!reviewPath) {
    errors.push(`V5 manifest is missing review path for ${actionKey(action)}`)
    return
  }
  try {
    await fs.access(resolveProjectPath(reviewPath))
  } catch {
    errors.push(`Missing V5 review strip: ${reviewPath}`)
    return
  }
  const metadata = await sharp(resolveProjectPath(reviewPath)).metadata()
  const expectedWidth = action.frameCount * 150
  if (metadata.width !== expectedWidth || metadata.height !== 174) {
    errors.push(`Wrong V5 review strip size for ${reviewPath}: ${metadata.width}x${metadata.height}`)
  }
}

async function validateRuntimeManifest() {
  const contents = await fs.readFile(resolveProjectPath(v5Pipeline.runtimeManifestPath), 'utf8')
  for (const action of v5Actions) {
    const expectedRefs = Array.from({ length: action.frameCount }, (_, index) =>
      `${action.speciesId}-${action.stageId}-${action.actionId}-${String(index + 1).padStart(2, '0')}.webp`,
    )
    for (const ref of expectedRefs) {
      if (!contents.includes(ref)) {
        errors.push(`Runtime manifest is missing V5 frame reference: ${ref}`)
      }
    }
  }
}

async function main() {
  const manifest = await readManifest()
  for (const action of v5Actions) {
    await validateAction(action, manifest)
  }
  await validateRuntimeManifest()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Pet sprite V5 assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
