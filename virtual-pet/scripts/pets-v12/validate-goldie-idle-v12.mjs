import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v12Alignment,
  v12Canvas,
  v12IdleAction,
  v12Paths,
  v12Tolerances,
} from './goldie-idle-config.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function framePath(index) {
  return path.join(v12Paths.runtimeDir, `goldie-idle-${String(index).padStart(2, '0')}.webp`)
}

function bodyStats(data, width, height) {
  const threshold = v12Alignment.alphaThreshold
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha <= threshold) {
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

  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  const bodyMaxX = minX + boxWidth * v12Alignment.bodyCutRatio
  const bodyMinY = minY + boxHeight * v12Alignment.bodyTopTrimRatio
  const bodyMaxY = maxY - boxHeight * v12Alignment.bodyBottomTrimRatio
  let total = 0
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (
        alpha <= threshold ||
        x > bodyMaxX ||
        y < bodyMinY ||
        y > bodyMaxY
      ) {
        continue
      }
      total += alpha
      sumX += x * alpha
      sumY += y * alpha
    }
  }

  if (total === 0) {
    return null
  }

  return {
    bodyAnchor: { x: sumX / total, y: sumY / total },
    bounds: { maxX, maxY, minX, minY },
  }
}

async function alphaStats(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return bodyStats(data, info.width, info.height)
}

function visibleMargin(bounds) {
  return Math.min(
    bounds.minX,
    bounds.minY,
    v12Canvas.width - bounds.maxX,
    v12Canvas.height - bounds.maxY,
  )
}

function stepDistance(a, b) {
  return Math.hypot(b.bodyAnchor.x - a.bodyAnchor.x, b.bodyAnchor.y - a.bodyAnchor.y)
}

async function validateFrames() {
  const stats = []
  for (let index = 1; index <= v12IdleAction.runtimeFrames; index += 1) {
    const relativePath = framePath(index)
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V12 idle frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
    if (metadata.width !== v12Canvas.width || metadata.height !== v12Canvas.height) {
      errors.push(`Wrong V12 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
    }

    const frameStats = await alphaStats(relativePath)
    if (!frameStats) {
      errors.push(`V12 frame has no stable body pixels: ${relativePath}`)
      continue
    }

    const margin = visibleMargin(frameStats.bounds)
    if (margin < v12Tolerances.minVisibleMarginPx) {
      errors.push(`V12 visible pixels are too close to canvas edge: ${relativePath}`)
    }
    stats.push({ relativePath, ...frameStats })
  }

  for (let index = 0; index < stats.length; index += 1) {
    const frame = stats[index]
    const next = stats[(index + 1) % stats.length]
    const bodyStep = stepDistance(frame, next)
    if (bodyStep > v12Tolerances.maxBodyAnchorStepPx) {
      errors.push(`V12 body-anchor step ${bodyStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`)
    }
  }
}

async function validateForgeMeta() {
  const forgeMeta = JSON.parse(
    await fs.readFile(resolveProjectPath(path.join(v12Paths.forgeProcessedDir, 'pipeline-meta.json')), 'utf8'),
  )
  if (forgeMeta.rows !== 4 || forgeMeta.cols !== 8) {
    errors.push('V12 source forge metadata has wrong grid shape')
  }
  if (forgeMeta.shared_scale !== true) {
    errors.push('V12 source forge metadata did not use shared_scale')
  }
  if (forgeMeta.component_mode !== 'largest') {
    errors.push('V12 source forge metadata did not use largest component mode')
  }
  if (forgeMeta.edge_touch_frames?.length) {
    errors.push('V12 source forge metadata reports edge-touch frames')
  }
}

async function validateAssetManifest() {
  const assetManifest = JSON.parse(await fs.readFile(resolveProjectPath(v12Paths.manifestPath), 'utf8'))
  if (assetManifest.runtimePaths?.length !== v12IdleAction.runtimeFrames) {
    errors.push('V12 asset manifest has wrong runtime frame count')
  }
  if (assetManifest.stabilizedFrames?.length !== v12IdleAction.sourceFrames) {
    errors.push('V12 asset manifest has wrong stabilized frame count')
  }
  if (assetManifest.stabilization?.strategy !== v12Alignment.strategy) {
    errors.push('V12 asset manifest has wrong stabilization strategy')
  }
  if (assetManifest.stabilization?.frameMetrics?.length !== v12IdleAction.runtimeFrames) {
    errors.push('V12 asset manifest has wrong stabilization metric count')
  }

  const sourceStep = assetManifest.stabilization?.maxSourceBodyStepPx
  const stabilizedStep = assetManifest.stabilization?.maxStabilizedBodyStepPx
  if (!(stabilizedStep < sourceStep)) {
    errors.push('V12 stabilization did not reduce max body-anchor step')
  }
  if (stabilizedStep > v12Tolerances.maxBodyAnchorStepPx) {
    errors.push('V12 manifest reports excessive stabilized body-anchor step')
  }
}

async function validateReview() {
  for (const relativePath of [
    path.join(v12Paths.reviewDir, 'goldie-idle-v12-strip.webp'),
    path.join(v12Paths.reviewDir, 'index.html'),
    path.join(v12Paths.stabilizedDir, 'sheet-transparent.png'),
  ]) {
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V12 review/stabilized asset: ${relativePath}`)
    }
  }
}

async function main() {
  await validateFrames()
  await validateForgeMeta()
  await validateAssetManifest()
  await validateReview()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V12 body-anchor-stabilized assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
