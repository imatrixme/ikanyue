import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v9Canvas,
  v9IdleAction,
  v9Paths,
  v9Tolerances,
} from './goldie-idle-config.mjs'

const root = process.cwd()
const errors = []
const alphaThreshold = 20

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function framePath(index) {
  return path.join(v9Paths.runtimeDir, `goldie-idle-${String(index).padStart(2, '0')}.webp`)
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
  for (let index = 1; index <= v9IdleAction.runtimeFrames; index += 1) {
    const relativePath = framePath(index)
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V9 idle frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (metadata.width !== v9Canvas.width || metadata.height !== v9Canvas.height) {
      errors.push(`Wrong V9 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
    }

    const frameBounds = await alphaBounds(relativePath)
    if (!frameBounds) {
      errors.push(`V9 frame has no visible pixels: ${relativePath}`)
      continue
    }

    const margin = Math.min(
      frameBounds.minX,
      frameBounds.minY,
      v9Canvas.width - frameBounds.maxX,
      v9Canvas.height - frameBounds.maxY,
    )
    if (margin < v9Tolerances.minVisibleMarginPx) {
      errors.push(`V9 visible pixels are too close to canvas edge: ${relativePath}`)
    }
    bounds.push({ relativePath, ...frameBounds })
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const frame = bounds[index]
    const next = bounds[(index + 1) % bounds.length]
    const centerStep = Math.abs(next.centerX - frame.centerX)
    if (centerStep > v9Tolerances.maxCenterStepPx) {
      errors.push(`V9 center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`)
    }
  }
}

async function validateManifests() {
  const assetManifest = JSON.parse(await fs.readFile(resolveProjectPath(v9Paths.manifestPath), 'utf8'))
  if (assetManifest.runtimePaths?.length !== v9IdleAction.runtimeFrames) {
    errors.push('V9 asset manifest has wrong runtime frame count')
  }
  if (assetManifest.keyframes?.length !== v9IdleAction.keyframes) {
    errors.push('V9 asset manifest has wrong keyframe count')
  }

  await fs.access(resolveProjectPath(v9Paths.sourcePath))
}

async function validateReview() {
  for (const relativePath of [
    path.join(v9Paths.reviewDir, 'goldie-idle-v9-strip.webp'),
    path.join(v9Paths.reviewDir, 'index.html'),
  ]) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V9 review asset: ${relativePath}`)
    }
  }
}

async function main() {
  await validateFrames()
  await validateManifests()
  await validateReview()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V9 idle assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
