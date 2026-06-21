import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { v6Actions, v6Pipeline } from './pet-sprite-v6-config.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function actionKey(action) {
  return `${action.speciesId}/${action.stageId}/${action.actionId}`
}

async function readManifest() {
  try {
    const contents = await fs.readFile(resolveProjectPath(v6Pipeline.manifestPath), 'utf8')
    return JSON.parse(contents)
  } catch {
    errors.push(`Missing or invalid V6 manifest: ${v6Pipeline.manifestPath}`)
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
      if (alpha > v6Pipeline.alphaThreshold) {
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

async function validateAction(action, manifest) {
  const entry = manifest?.actions?.find(
    (item) =>
      item.speciesId === action.speciesId &&
      item.stageId === action.stageId &&
      item.actionId === action.actionId,
  )
  if (!entry) {
    errors.push(`V6 manifest is missing action: ${actionKey(action)}`)
    return
  }

  if (entry.frameCount !== action.frameCount) {
    errors.push(
      `Wrong V6 frame count in manifest for ${actionKey(action)}: ${entry.frameCount}`,
    )
  }
  if (entry.renderer !== action.renderer) {
    errors.push(`Wrong V6 renderer in manifest for ${actionKey(action)}: ${entry.renderer}`)
  }

  const runtimePaths = entry.runtimePaths ?? []
  const rawPaths = entry.rawPaths ?? []
  if (runtimePaths.length !== action.frameCount) {
    errors.push(
      `V6 runtime path count for ${actionKey(action)} is ${runtimePaths.length}; expected ${action.frameCount}`,
    )
  }
  if (rawPaths.length !== action.frameCount) {
    errors.push(
      `V6 raw path count for ${actionKey(action)} is ${rawPaths.length}; expected ${action.frameCount}`,
    )
  }

  await validateReview(entry.reviewPath, action)
  const bounds = []
  for (const relativePath of runtimePaths) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V6 runtime frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (
      metadata.width !== v6Pipeline.pixelCanvas.width ||
      metadata.height !== v6Pipeline.pixelCanvas.height
    ) {
      errors.push(
        `Wrong V6 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`,
      )
    }

    const frameBounds = await alphaBounds(relativePath)
    if (!frameBounds) {
      errors.push(`V6 runtime frame has no visible pixels: ${relativePath}`)
      continue
    }

    if (
      frameBounds.minX < action.visibleMarginPx ||
      frameBounds.minY < action.visibleMarginPx ||
      frameBounds.maxX > v6Pipeline.pixelCanvas.width - action.visibleMarginPx ||
      frameBounds.maxY > v6Pipeline.pixelCanvas.height - action.visibleMarginPx
    ) {
      errors.push(`V6 visible pixels are too close to canvas edge: ${relativePath}`)
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
        `V6 center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
    if (baselineStep > action.maxBaselineStepPx) {
      errors.push(
        `V6 baseline step ${baselineStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
  }
}

async function validateReview(reviewPath, action) {
  if (!reviewPath) {
    errors.push(`V6 manifest is missing review path for ${actionKey(action)}`)
    return
  }
  try {
    await fs.access(resolveProjectPath(reviewPath))
  } catch {
    errors.push(`Missing V6 review strip: ${reviewPath}`)
    return
  }
  const metadata = await sharp(resolveProjectPath(reviewPath)).metadata()
  const frameSize = v6Pipeline.pixelCanvas.width * v6Pipeline.reviewScale
  const expectedWidth = action.frameCount * (frameSize + 20)
  const expectedHeight = frameSize + 48
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    errors.push(`Wrong V6 review strip size for ${reviewPath}: ${metadata.width}x${metadata.height}`)
  }
}

async function validateRuntimeManifest() {
  const contents = await fs.readFile(resolveProjectPath(v6Pipeline.runtimeManifestPath), 'utf8')
  if (!contents.includes(`renderStyle: '${v6Pipeline.renderStyle}'`)) {
    errors.push(`Runtime manifest is missing V6 render style: ${v6Pipeline.renderStyle}`)
  }

  for (const action of v6Actions) {
    const expectedRefs = Array.from({ length: action.frameCount }, (_, index) =>
      `${action.speciesId}-${action.stageId}-${action.actionId}-${String(index + 1).padStart(2, '0')}.webp`,
    )
    for (const ref of expectedRefs) {
      if (!contents.includes(ref)) {
        errors.push(`Runtime manifest is missing V6 frame reference: ${ref}`)
      }
    }
  }
}

async function main() {
  const manifest = await readManifest()
  if (
    manifest?.pixelCanvas?.width !== v6Pipeline.pixelCanvas.width ||
    manifest?.pixelCanvas?.height !== v6Pipeline.pixelCanvas.height ||
    manifest?.renderStyle !== v6Pipeline.renderStyle
  ) {
    errors.push('V6 manifest has wrong pixel canvas or render style metadata')
  }

  for (const action of v6Actions) {
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

  console.log('Pet sprite V6 pixel assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
