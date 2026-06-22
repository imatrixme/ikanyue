import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v13Blink,
  v13Canvas,
  v13IdleAction,
  v13Loop,
  v13Paths,
  v13Tolerances,
} from './goldie-idle-config.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function framePath(index) {
  return path.join(v13Paths.runtimeDir, `goldie-idle-${String(index).padStart(2, '0')}.webp`)
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
      if (alpha <= v13Loop.alphaThreshold) {
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
    v13Canvas.width - bounds.maxX,
    v13Canvas.height - bounds.maxY,
  )
}

function visualDifference(a, b) {
  let total = 0
  let count = 0
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const alphaA = a.data[offset + 3]
    const alphaB = b.data[offset + 3]
    if (alphaA <= v13Loop.alphaThreshold && alphaB <= v13Loop.alphaThreshold) {
      continue
    }
    total +=
      Math.abs(a.data[offset] - b.data[offset]) +
      Math.abs(a.data[offset + 1] - b.data[offset + 1]) +
      Math.abs(a.data[offset + 2] - b.data[offset + 2]) +
      Math.abs(alphaA - alphaB) * 0.8
    count += 1
  }
  return count > 0 ? total / count : 0
}

async function validateFrames() {
  const frames = []
  for (let index = 1; index <= v13IdleAction.runtimeFrames; index += 1) {
    const relativePath = framePath(index)
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V13 idle frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (metadata.width !== v13Canvas.width || metadata.height !== v13Canvas.height) {
      errors.push(`Wrong V13 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
    }

    const raw = await readRaw(relativePath)
    const bounds = visibleBounds(raw)
    if (!bounds) {
      errors.push(`V13 frame has no visible pixels: ${relativePath}`)
      continue
    }
    if (visibleMargin(bounds) < v13Tolerances.minVisibleMarginPx) {
      errors.push(`V13 visible pixels are too close to canvas edge: ${relativePath}`)
    }
    frames.push({ raw, relativePath })
  }

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    const next = frames[(index + 1) % frames.length]
    const visualStep = visualDifference(frame.raw, next.raw)
    if (visualStep > v13Tolerances.maxVisualStep) {
      errors.push(`V13 visual step ${visualStep.toFixed(1)} exceeds tolerance for ${frame.relativePath}`)
    }
  }
}

async function validateAssetManifest() {
  const assetManifest = JSON.parse(await fs.readFile(resolveProjectPath(v13Paths.manifestPath), 'utf8'))
  if (assetManifest.runtimePaths?.length !== v13IdleAction.runtimeFrames) {
    errors.push('V13 asset manifest has wrong runtime frame count')
  }
  if (assetManifest.stabilizedFrames?.length !== v13IdleAction.runtimeFrames) {
    errors.push('V13 asset manifest has wrong stabilized frame count')
  }
  if (assetManifest.stabilization?.strategy !== v13Loop.strategy) {
    errors.push('V13 asset manifest has wrong stabilization strategy')
  }
  if (assetManifest.stabilization?.blink?.strategy !== v13Blink.strategy) {
    errors.push('V13 asset manifest has wrong blink strategy')
  }
  if (Number(assetManifest.stabilization?.blink?.runtimeAmounts?.[16] ?? 0) !== 1) {
    errors.push('V13 asset manifest is missing a full blink frame')
  }
  if (assetManifest.stabilization?.maxVisualStep > v13Tolerances.maxVisualStep) {
    errors.push('V13 manifest reports excessive visual step')
  }
  if (assetManifest.sourceSequence?.join(',') !== v13Loop.sourceSequence.join(',')) {
    errors.push('V13 asset manifest has wrong source sequence')
  }

  await fs.access(resolveProjectPath(v13Paths.sourceManifestPath))
}

async function validateReview() {
  for (const relativePath of [
    path.join(v13Paths.reviewDir, 'goldie-idle-v13-strip.webp'),
    path.join(v13Paths.reviewDir, 'goldie-idle-v13-eye-strip.webp'),
    path.join(v13Paths.reviewDir, 'index.html'),
  ]) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V13 review asset: ${relativePath}`)
    }
  }
}

async function main() {
  await validateFrames()
  await validateAssetManifest()
  await validateReview()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V13 continuous idle loop assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
