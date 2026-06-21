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

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await fs.mkdir(path.dirname(resolveProjectPath(v12Paths.manifestPath)), {
    recursive: true,
  })
  await emptyDir(v12Paths.runtimeDir)
  await emptyDir(v12Paths.reviewDir)
  await emptyDir(v12Paths.stabilizedDir)
}

function sourceFramePath(index) {
  return path.join(
    v12Paths.forgeProcessedDir,
    `goldie-idle-source-${index}.png`,
  )
}

function stabilizedFramePath(index) {
  return path.join(
    v12Paths.stabilizedDir,
    `goldie-idle-source-${String(index).padStart(2, '0')}.png`,
  )
}

function runtimeFramePath(index) {
  return path.join(
    v12Paths.runtimeDir,
    `goldie-idle-${String(index).padStart(2, '0')}.webp`,
  )
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[mid]
  }
  return (sorted[mid - 1] + sorted[mid]) / 2
}

async function readFrame(index) {
  const relativePath = sourceFramePath(index)
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.width !== v12Canvas.width || info.height !== v12Canvas.height) {
    throw new Error(`Unexpected V11 processed frame size: ${relativePath}`)
  }

  return { data, height: info.height, index, relativePath, width: info.width }
}

function analyzeFrame(frame) {
  const { data, height, width } = frame
  const threshold = v12Alignment.alphaThreshold
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let total = 0
  let sumX = 0
  let sumY = 0

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
      total += alpha
      sumX += x * alpha
      sumY += y * alpha
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error(`No visible pixels in ${frame.relativePath}`)
  }

  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  const bodyMaxX = minX + boxWidth * v12Alignment.bodyCutRatio
  const bodyMinY = minY + boxHeight * v12Alignment.bodyTopTrimRatio
  const bodyMaxY = maxY - boxHeight * v12Alignment.bodyBottomTrimRatio
  let bodyTotal = 0
  let bodySumX = 0
  let bodySumY = 0

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
      bodyTotal += alpha
      bodySumX += x * alpha
      bodySumY += y * alpha
    }
  }

  const bodyAnchor = bodyTotal > 0
    ? { x: bodySumX / bodyTotal, y: bodySumY / bodyTotal }
    : { x: sumX / total, y: sumY / total }

  return {
    bodyAnchor,
    bounds: { maxX, maxY, minX, minY },
    centroid: { x: sumX / total, y: sumY / total },
  }
}

function targetForFrame(index, medianAnchor) {
  const phase = ((index - 1) / v12IdleAction.runtimeFrames) * Math.PI * 2
  return {
    x: medianAnchor.x + Math.sin(phase) * v12Alignment.smoothBobAmplitudeX,
    y: medianAnchor.y + Math.sin(phase) * v12Alignment.smoothBobAmplitudeY,
  }
}

function shiftFrame(frame, dx, dy) {
  const shifted = Buffer.alloc(frame.width * frame.height * 4)
  for (let y = 0; y < frame.height; y += 1) {
    const targetY = y + dy
    if (targetY < 0 || targetY >= frame.height) {
      continue
    }
    for (let x = 0; x < frame.width; x += 1) {
      const targetX = x + dx
      if (targetX < 0 || targetX >= frame.width) {
        continue
      }
      const sourceOffset = (y * frame.width + x) * 4
      const targetOffset = (targetY * frame.width + targetX) * 4
      shifted[targetOffset] = frame.data[sourceOffset]
      shifted[targetOffset + 1] = frame.data[sourceOffset + 1]
      shifted[targetOffset + 2] = frame.data[sourceOffset + 2]
      shifted[targetOffset + 3] = frame.data[sourceOffset + 3]
    }
  }
  return shifted
}

function shiftedBounds(bounds, dx, dy) {
  return {
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
  }
}

function visibleMargin(bounds) {
  return Math.min(
    bounds.minX,
    bounds.minY,
    v12Canvas.width - bounds.maxX,
    v12Canvas.height - bounds.maxY,
  )
}

function stepStats(points) {
  const steps = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  return {
    max: Math.max(...steps),
    mean: steps.reduce((sum, step) => sum + step, 0) / steps.length,
    steps,
  }
}

async function writeImage(raw, relativePath, format) {
  const writer = sharp(raw, {
    raw: {
      channels: 4,
      height: v12Canvas.height,
      width: v12Canvas.width,
    },
  })

  if (format === 'webp') {
    await writer.webp({ effort: 4, quality: 92 }).toFile(resolveProjectPath(relativePath))
    return
  }
  await writer.png().toFile(resolveProjectPath(relativePath))
}

async function writeStabilizedSheet(stabilizedFrames) {
  const cols = 8
  const rows = 4
  const composites = stabilizedFrames.map((relativePath, index) => ({
    input: resolveProjectPath(relativePath),
    left: (index % cols) * v12Canvas.width,
    top: Math.floor(index / cols) * v12Canvas.height,
  }))

  await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: v12Canvas.height * rows,
      width: v12Canvas.width * cols,
    },
  })
    .composite(composites)
    .png()
    .toFile(resolveProjectPath(path.join(v12Paths.stabilizedDir, 'sheet-transparent.png')))
}

async function writeReviewStrip(runtimePaths) {
  const cellWidth = 150
  const frameSize = 136
  const width = cellWidth * runtimePaths.length
  const height = 176
  const composites = [
    { input: reviewBackground(width, height, runtimePaths.length), left: 0, top: 0 },
  ]

  for (const [index, framePath] of runtimePaths.entries()) {
    const preview = await sharp(resolveProjectPath(framePath))
      .resize(frameSize, frameSize, {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: 'contain',
      })
      .png()
      .toBuffer()
    composites.push({
      input: preview,
      left: index * cellWidth + 7,
      top: 8,
    })
  }

  await sharp({
    create: {
      background: { alpha: 1, b: 247, g: 250, r: 255 },
      channels: 4,
      height,
      width,
    },
  })
    .composite(composites)
    .webp({ effort: 4, quality: 90 })
    .toFile(resolveProjectPath(path.join(v12Paths.reviewDir, 'goldie-idle-v12-strip.webp')))
}

async function writeReviewIndex() {
  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V12 Idle Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #fffaf7; color: #30231d; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    img { display: block; height: 176px; max-width: none; border: 1px solid rgba(159,104,74,.18); }
  </style>
</head>
<body>
  <h1>Goldie V12 Idle Review</h1>
  <p>Body-anchor stabilization over V11 Agent Sprite Forge frames.</p>
  <img src="./goldie-idle-v12-strip.webp" alt="Goldie V12 idle animation strip">
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v12Paths.reviewDir, 'index.html')), contents)
}

async function writeManifest(payload) {
  const forgeMeta = JSON.parse(
    await fs.readFile(
      resolveProjectPath(path.join(v12Paths.forgeProcessedDir, 'pipeline-meta.json')),
      'utf8',
    ),
  )
  const manifest = {
    action: v12IdleAction,
    forgeMeta,
    runtimePaths: payload.runtimePaths,
    schemaVersion: 1,
    source: v12Paths.sourcePath,
    sourceFrames: payload.sourceFrames,
    sourceVersion: 'v11-agent-sprite-forge',
    stabilization: payload.stabilization,
    stabilizedFrames: payload.stabilizedFrames,
  }
  await fs.writeFile(resolveProjectPath(v12Paths.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
}

function reviewBackground(width, height, frameCount) {
  const cellWidth = width / frameCount
  const cells = Array.from({ length: frameCount }, (_, index) => {
    const x = Math.round(index * cellWidth)
    const fill = index % 2 === 0 ? '#fffaf7' : '#f9f4f1'
    return `<rect x="${x}" y="0" width="${cellWidth}" height="${height}" fill="${fill}"/>
      <path d="M${x} 0v${height}" stroke="rgba(159,104,74,.13)" stroke-width="1"/>`
  }).join('')

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#fffaf7"/>
    ${cells}
    <path d="M0 145h${width}" stroke="rgba(159,104,74,.18)" stroke-width="1"/>
  </svg>`)
}

async function buildStabilizedFrames() {
  const frames = []
  for (let index = 1; index <= v12IdleAction.runtimeFrames; index += 1) {
    const frame = await readFrame(index)
    frames.push({ ...frame, metrics: analyzeFrame(frame) })
  }

  const medianAnchor = {
    x: median(frames.map((frame) => frame.metrics.bodyAnchor.x)),
    y: median(frames.map((frame) => frame.metrics.bodyAnchor.y)),
  }
  const sourceBodySteps = stepStats(frames.map((frame) => frame.metrics.bodyAnchor))
  const runtimePaths = []
  const sourceFrames = []
  const stabilizedFrames = []
  const frameMetrics = []

  for (const frame of frames) {
    const target = targetForFrame(frame.index, medianAnchor)
    const dx = Math.round(target.x - frame.metrics.bodyAnchor.x)
    const dy = Math.round(target.y - frame.metrics.bodyAnchor.y)
    const shifted = shiftFrame(frame, dx, dy)
    const afterBodyAnchor = {
      x: frame.metrics.bodyAnchor.x + dx,
      y: frame.metrics.bodyAnchor.y + dy,
    }
    const afterBounds = shiftedBounds(frame.metrics.bounds, dx, dy)
    const residual = Math.hypot(
      target.x - afterBodyAnchor.x,
      target.y - afterBodyAnchor.y,
    )
    const margin = visibleMargin(afterBounds)

    if (residual > v12Tolerances.maxResidualAnchorOffsetPx) {
      throw new Error(`V12 residual anchor offset too high on frame ${frame.index}`)
    }
    if (margin < v12Tolerances.minVisibleMarginPx) {
      throw new Error(`V12 visible margin too small on frame ${frame.index}`)
    }

    const stableFramePath = stabilizedFramePath(frame.index)
    const runtimePath = runtimeFramePath(frame.index)
    await writeImage(shifted, stableFramePath, 'png')
    await writeImage(shifted, runtimePath, 'webp')

    sourceFrames.push(frame.relativePath)
    stabilizedFrames.push(stableFramePath)
    runtimePaths.push(runtimePath)
    frameMetrics.push({
      afterBodyAnchor,
      beforeBodyAnchor: frame.metrics.bodyAnchor,
      dx,
      dy,
      frame: frame.index,
      residual,
      target,
      visibleMargin: margin,
    })
  }

  const stabilizedBodySteps = stepStats(
    frameMetrics.map((metric) => metric.afterBodyAnchor),
  )
  return {
    runtimePaths,
    sourceFrames,
    stabilization: {
      frameMetrics,
      maxSourceBodyStepPx: sourceBodySteps.max,
      maxStabilizedBodyStepPx: stabilizedBodySteps.max,
      medianAnchor,
      sourceMeanBodyStepPx: sourceBodySteps.mean,
      stabilizedMeanBodyStepPx: stabilizedBodySteps.mean,
      strategy: v12Alignment.strategy,
      targetTrack: frameMetrics.map((metric) => metric.target),
    },
    stabilizedFrames,
  }
}

async function main() {
  await prepareDirs()
  const payload = await buildStabilizedFrames()
  await writeStabilizedSheet(payload.stabilizedFrames)
  await writeReviewStrip(payload.runtimePaths)
  await writeReviewIndex()
  await writeManifest(payload)
  console.log('Generated Goldie V12 body-anchor-stabilized idle frames.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
