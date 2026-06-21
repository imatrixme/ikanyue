import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { resolveProjectPath, reviewStripName } from './pet-sprite-v6-paths.mjs'
import { v6Pipeline } from './pet-sprite-v6-config.mjs'

function reviewMetrics() {
  const frameSize = v6Pipeline.pixelCanvas.width * v6Pipeline.reviewScale
  const cellWidth = frameSize + 20
  const labelHeight = 28
  return {
    cellWidth,
    frameSize,
    height: frameSize + labelHeight + 20,
    labelHeight,
  }
}

function reviewBackground(action) {
  const metrics = reviewMetrics()
  const width = metrics.cellWidth * action.frameCount
  const baselineY = action.anchor.y * v6Pipeline.reviewScale + 10
  const cells = Array.from({ length: action.frameCount }, (_, index) => {
    const x = index * metrics.cellWidth
    const fill = index % 2 === 0 ? '#eef4e7' : '#e3eddc'
    return `<rect x="${x}" y="0" width="${metrics.cellWidth}" height="${metrics.height}" fill="${fill}"/>
      <path d="M${x} 0v${metrics.height}" stroke="rgba(45,58,42,.18)" stroke-width="1"/>`
  }).join('')

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${metrics.height}" viewBox="0 0 ${width} ${metrics.height}">
    <rect width="${width}" height="${metrics.height}" fill="#eef4e7"/>
    ${cells}
    <path d="M0 ${baselineY}h${width}" stroke="rgba(37,45,30,.34)" stroke-width="1"/>
  </svg>`)
}

function reviewLabel(action, index) {
  const metrics = reviewMetrics()
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.cellWidth}" height="${metrics.labelHeight}" viewBox="0 0 ${metrics.cellWidth} ${metrics.labelHeight}">
    <text x="${metrics.cellWidth / 2}" y="18" text-anchor="middle" font-family="Menlo, Consolas, monospace" font-size="11" fill="#34402e">v6 ${action.actionId} f${String(index).padStart(2, '0')}</text>
  </svg>`)
}

export async function writeReviewStrip(action, runtimePaths) {
  const metrics = reviewMetrics()
  const width = metrics.cellWidth * action.frameCount
  const composites = [{ input: reviewBackground(action), left: 0, top: 0 }]

  for (const [index, relativePath] of runtimePaths.entries()) {
    const input = await sharp(resolveProjectPath(relativePath))
      .resize(metrics.frameSize, metrics.frameSize, {
        fit: 'contain',
        kernel: 'nearest',
      })
      .png()
      .toBuffer()
    composites.push({
      input,
      left: index * metrics.cellWidth + 10,
      top: 10,
    })
    composites.push({
      input: reviewLabel(action, index + 1),
      left: index * metrics.cellWidth,
      top: metrics.frameSize + 12,
    })
  }

  const reviewRelativePath = path.join(v6Pipeline.reviewDir, reviewStripName(action))
  await sharp({
    create: {
      background: { r: 238, g: 244, b: 231, alpha: 1 },
      channels: 4,
      height: metrics.height,
      width,
    },
  })
    .composite(composites)
    .webp({ effort: 4, quality: 92 })
    .toFile(resolveProjectPath(reviewRelativePath))

  return reviewRelativePath
}

export async function writeReviewIndex(generatedActions) {
  const metrics = reviewMetrics()
  const cards = generatedActions
    .map(
      ({ action, reviewPath }) => `<article>
        <h2>${action.speciesId} / ${action.stageId} / ${action.actionId}</h2>
        <img src="./${path.basename(reviewPath)}" alt="${action.speciesId} ${action.actionId} V6 pixel animation strip">
      </article>`,
    )
    .join('\n')

  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pet Sprite V6 Pixel Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #eef4e7; color: #253021; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    h2 { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #405039; text-transform: capitalize; }
    article { margin: 0 0 22px; overflow-x: auto; }
    img { display: block; height: ${metrics.height}px; max-width: none; image-rendering: pixelated; border: 1px solid rgba(37,48,33,.2); background: #eef4e7; }
  </style>
</head>
<body>
  <h1>Pet Sprite V6 Pixel Review</h1>
  ${cards}
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v6Pipeline.reviewDir, 'index.html')), contents)
}
