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

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await fs.mkdir(path.dirname(resolveProjectPath(v13Paths.manifestPath)), {
    recursive: true,
  })
  await emptyDir(v13Paths.runtimeDir)
  await emptyDir(v13Paths.reviewDir)
  await emptyDir(v13Paths.stabilizedDir)
}

function sourceFramePath(sourceIndex) {
  return path.join(
    v13Paths.sourceDir,
    `goldie-idle-source-${String(sourceIndex).padStart(2, '0')}.png`,
  )
}

function stabilizedFramePath(index) {
  return path.join(
    v13Paths.stabilizedDir,
    `goldie-idle-source-${String(index).padStart(2, '0')}.png`,
  )
}

function runtimeFramePath(index) {
  return path.join(
    v13Paths.runtimeDir,
    `goldie-idle-${String(index).padStart(2, '0')}.webp`,
  )
}

async function readSourceFrame(sourceIndex) {
  const relativePath = sourceFramePath(sourceIndex)
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.width !== v13Canvas.width || info.height !== v13Canvas.height) {
    throw new Error(`Unexpected V13 source frame size: ${relativePath}`)
  }

  return { data, relativePath }
}

function blendFrames(a, b, amount) {
  const output = Buffer.alloc(a.data.length)
  const inverse = 1 - amount
  for (let offset = 0; offset < output.length; offset += 1) {
    output[offset] = Math.round(a.data[offset] * inverse + b.data[offset] * amount)
  }
  return output
}

function blinkAmountForFrame(index) {
  return v13Blink.runtimeAmounts.get(index) ?? 0
}

function applyBlinkOverlay(baseData, blinkData, amount) {
  if (amount <= 0) {
    return baseData
  }

  const output = Buffer.from(baseData)
  for (const mask of v13Blink.masks) {
    const minX = Math.max(0, Math.floor(mask.centerX - mask.radiusX))
    const maxX = Math.min(v13Canvas.width - 1, Math.ceil(mask.centerX + mask.radiusX))
    const minY = Math.max(0, Math.floor(mask.centerY - mask.radiusY))
    const maxY = Math.min(v13Canvas.height - 1, Math.ceil(mask.centerY + mask.radiusY))
    const solidRadius = 1 - mask.featherRatio

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - mask.centerX) / mask.radiusX
        const dy = (y - mask.centerY) / mask.radiusY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > 1) {
          continue
        }

        const feather = distance <= solidRadius
          ? 1
          : Math.max(0, (1 - distance) / mask.featherRatio)
        const blend = amount * feather
        const offset = (y * v13Canvas.width + x) * 4
        output[offset] = Math.round(output[offset] * (1 - blend) + blinkData[offset] * blend)
        output[offset + 1] = Math.round(output[offset + 1] * (1 - blend) + blinkData[offset + 1] * blend)
        output[offset + 2] = Math.round(output[offset + 2] * (1 - blend) + blinkData[offset + 2] * blend)
        output[offset + 3] = Math.round(output[offset + 3] * (1 - blend) + blinkData[offset + 3] * blend)
      }
    }
  }

  return output
}

function sampleSource(runtimeIndex, sourceFrames) {
  const segmentCount = v13Loop.sourceSequence.length - 1
  const t = ((runtimeIndex - 1) / v13IdleAction.runtimeFrames) * segmentCount
  const segment = Math.min(Math.floor(t), segmentCount - 1)
  const amount = t - segment
  const sourceA = v13Loop.sourceSequence[segment]
  const sourceB = v13Loop.sourceSequence[segment + 1]
  return {
    amount,
    data: blendFrames(sourceFrames.get(sourceA), sourceFrames.get(sourceB), amount),
    sourceA,
    sourceB,
  }
}

function visibleBounds(data) {
  let minX = v13Canvas.width
  let minY = v13Canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < v13Canvas.height; y += 1) {
    for (let x = 0; x < v13Canvas.width; x += 1) {
      const alpha = data[(y * v13Canvas.width + x) * 4 + 3]
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
    throw new Error('V13 blended frame has no visible pixels.')
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
  for (let offset = 0; offset < a.length; offset += 4) {
    const alphaA = a[offset + 3]
    const alphaB = b[offset + 3]
    if (alphaA <= v13Loop.alphaThreshold && alphaB <= v13Loop.alphaThreshold) {
      continue
    }
    total +=
      Math.abs(a[offset] - b[offset]) +
      Math.abs(a[offset + 1] - b[offset + 1]) +
      Math.abs(a[offset + 2] - b[offset + 2]) +
      Math.abs(alphaA - alphaB) * 0.8
    count += 1
  }
  return count > 0 ? total / count : 0
}

async function writeImage(raw, relativePath, format) {
  const writer = sharp(raw, {
    raw: {
      channels: 4,
      height: v13Canvas.height,
      width: v13Canvas.width,
    },
  })

  if (format === 'webp') {
    await writer.webp({ effort: 4, quality: 92 }).toFile(resolveProjectPath(relativePath))
    return
  }
  await writer.png().toFile(resolveProjectPath(relativePath))
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
    .toFile(resolveProjectPath(path.join(v13Paths.reviewDir, 'goldie-idle-v13-strip.webp')))
}

async function writeEyeReviewStrip(runtimePaths) {
  const crop = { height: 135, left: 105, top: 255, width: 230 }
  const cellWidth = 140
  const frameHeight = 82
  const width = cellWidth * runtimePaths.length
  const height = 116
  const composites = [
    { input: reviewBackground(width, height, runtimePaths.length), left: 0, top: 0 },
  ]

  for (const [index, framePath] of runtimePaths.entries()) {
    const preview = await sharp(resolveProjectPath(framePath))
      .extract(crop)
      .resize(cellWidth - 10, frameHeight, {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: 'contain',
      })
      .png()
      .toBuffer()
    composites.push({
      input: preview,
      left: index * cellWidth + 5,
      top: 26,
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
    .webp({ effort: 4, quality: 92 })
    .toFile(resolveProjectPath(path.join(v13Paths.reviewDir, 'goldie-idle-v13-eye-strip.webp')))
}

async function writeReviewIndex() {
  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V13 Idle Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #fffaf7; color: #30231d; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    img { display: block; height: 176px; max-width: none; border: 1px solid rgba(159,104,74,.18); }
  </style>
</head>
<body>
  <h1>Goldie V13 Idle Review</h1>
  <p>Continuous segment crossfade over V12 stabilized frames with localized blink overlay.</p>
  <img src="./goldie-idle-v13-strip.webp" alt="Goldie V13 idle animation strip">
  <img src="./goldie-idle-v13-eye-strip.webp" alt="Goldie V13 eye animation strip">
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v13Paths.reviewDir, 'index.html')), contents)
}

async function writeManifest(payload) {
  const sourceManifest = JSON.parse(
    await fs.readFile(resolveProjectPath(v13Paths.sourceManifestPath), 'utf8'),
  )
  const manifest = {
    action: v13IdleAction,
    runtimePaths: payload.runtimePaths,
    schemaVersion: 1,
    sourceManifest: v13Paths.sourceManifestPath,
    sourceSequence: v13Loop.sourceSequence,
    sourceVersion: 'v12-body-anchor-stabilized',
    stabilization: {
      blink: {
        masks: v13Blink.masks,
        runtimeAmounts: Object.fromEntries(v13Blink.runtimeAmounts),
        sourceFrame: v13Blink.sourceFrame,
        strategy: v13Blink.strategy,
      },
      frameMetrics: payload.frameMetrics,
      maxVisualStep: payload.maxVisualStep,
      meanVisualStep: payload.meanVisualStep,
      strategy: v13Loop.strategy,
    },
    stabilizedFrames: payload.stabilizedFrames,
    v12SourceStrategy: sourceManifest.stabilization?.strategy ?? null,
  }
  await fs.writeFile(resolveProjectPath(v13Paths.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
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

async function buildContinuousLoop() {
  const sourceFrames = new Map()
  for (const sourceIndex of new Set([...v13Loop.sourceSequence, v13Blink.sourceFrame])) {
    sourceFrames.set(sourceIndex, await readSourceFrame(sourceIndex))
  }
  const blinkSource = sourceFrames.get(v13Blink.sourceFrame)

  const rawFrames = []
  const runtimePaths = []
  const stabilizedFrames = []
  const frameMetrics = []

  for (let index = 1; index <= v13IdleAction.runtimeFrames; index += 1) {
    const sample = sampleSource(index, sourceFrames)
    const blinkAmount = blinkAmountForFrame(index)
    const frameData = applyBlinkOverlay(sample.data, blinkSource.data, blinkAmount)
    const bounds = visibleBounds(frameData)
    const margin = visibleMargin(bounds)
    if (margin < v13Tolerances.minVisibleMarginPx) {
      throw new Error(`V13 visible margin too small on frame ${index}`)
    }

    const stableFramePath = stabilizedFramePath(index)
    const runtimePath = runtimeFramePath(index)
    await writeImage(frameData, stableFramePath, 'png')
    await writeImage(frameData, runtimePath, 'webp')
    rawFrames.push(frameData)
    runtimePaths.push(runtimePath)
    stabilizedFrames.push(stableFramePath)
    frameMetrics.push({
      blend: Number(sample.amount.toFixed(4)),
      blinkAmount,
      frame: index,
      sourceA: sample.sourceA,
      sourceB: sample.sourceB,
      visibleMargin: margin,
    })
  }

  const visualSteps = rawFrames.map((frame, index) =>
    visualDifference(frame, rawFrames[(index + 1) % rawFrames.length]),
  )
  const maxVisualStep = Math.max(...visualSteps)
  if (maxVisualStep > v13Tolerances.maxVisualStep) {
    throw new Error(`V13 max visual step ${maxVisualStep.toFixed(1)} exceeds tolerance`)
  }

  return {
    frameMetrics: frameMetrics.map((metric, index) => ({
      ...metric,
      visualStepToNext: Number(visualSteps[index].toFixed(3)),
    })),
    maxVisualStep,
    meanVisualStep: visualSteps.reduce((sum, step) => sum + step, 0) / visualSteps.length,
    runtimePaths,
    stabilizedFrames,
  }
}

async function main() {
  await prepareDirs()
  const payload = await buildContinuousLoop()
  await writeReviewStrip(payload.runtimePaths)
  await writeEyeReviewStrip(payload.runtimePaths)
  await writeReviewIndex()
  await writeManifest(payload)
  console.log('Generated Goldie V13 continuous idle loop frames.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
