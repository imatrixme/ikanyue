import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v11Canvas,
  v11IdleAction,
  v11Paths,
  v11Tolerances,
} from './goldie-idle-config.mjs'

const root = process.cwd()
const errors = []
const alphaThreshold = 20

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function framePath(index) {
  return path.join(v11Paths.runtimeDir, `goldie-idle-${String(index).padStart(2, '0')}.webp`)
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
      if (alpha <= alphaThreshold) {
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
  return { centerX: (minX + maxX) / 2, maxX, maxY, minX, minY }
}

async function validateFrames() {
  const bounds = []
  for (let index = 1; index <= v11IdleAction.runtimeFrames; index += 1) {
    const relativePath = framePath(index)
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V11 idle frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (metadata.width !== v11Canvas.width || metadata.height !== v11Canvas.height) {
      errors.push(`Wrong V11 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
    }

    const frameBounds = await alphaBounds(relativePath)
    if (!frameBounds) {
      errors.push(`V11 frame has no visible pixels: ${relativePath}`)
      continue
    }

    const margin = Math.min(
      frameBounds.minX,
      frameBounds.minY,
      v11Canvas.width - frameBounds.maxX,
      v11Canvas.height - frameBounds.maxY,
    )
    if (margin < v11Tolerances.minVisibleMarginPx) {
      errors.push(`V11 visible pixels are too close to canvas edge: ${relativePath}`)
    }
    bounds.push({ relativePath, ...frameBounds })
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const frame = bounds[index]
    const next = bounds[(index + 1) % bounds.length]
    const centerStep = Math.abs(next.centerX - frame.centerX)
    if (centerStep > v11Tolerances.maxCenterStepPx) {
      errors.push(`V11 center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`)
    }
  }
}

async function validateForgeMeta() {
  const forgeMeta = JSON.parse(
    await fs.readFile(resolveProjectPath(path.join(v11Paths.forgeProcessedDir, 'pipeline-meta.json')), 'utf8'),
  )
  if (forgeMeta.rows !== 4 || forgeMeta.cols !== 8) {
    errors.push('V11 forge metadata has wrong grid shape')
  }
  if (forgeMeta.sharedScale !== undefined && forgeMeta.sharedScale !== true) {
    errors.push('V11 forge metadata did not use shared scale')
  }
  if (forgeMeta.shared_scale !== true) {
    errors.push('V11 forge metadata did not use shared_scale')
  }
  if (forgeMeta.edge_touch_frames?.length) {
    errors.push('V11 forge metadata reports edge-touch frames')
  }
}

async function validateManifests() {
  const assetManifest = JSON.parse(await fs.readFile(resolveProjectPath(v11Paths.manifestPath), 'utf8'))
  if (assetManifest.runtimePaths?.length !== v11IdleAction.runtimeFrames) {
    errors.push('V11 asset manifest has wrong runtime frame count')
  }
  if (assetManifest.sourceFrames?.length !== v11IdleAction.sourceFrames) {
    errors.push('V11 asset manifest has wrong source frame count')
  }

  await fs.access(resolveProjectPath(v11Paths.sourcePath))
}

async function validateReview() {
  for (const relativePath of [
    path.join(v11Paths.reviewDir, 'goldie-idle-v11-strip.webp'),
    path.join(v11Paths.reviewDir, 'index.html'),
  ]) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V11 review asset: ${relativePath}`)
    }
  }
}

async function main() {
  await validateFrames()
  await validateForgeMeta()
  await validateManifests()
  await validateReview()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V11 Agent Sprite Forge assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
