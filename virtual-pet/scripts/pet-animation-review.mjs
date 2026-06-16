import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  actionIds,
  animationPipeline,
  speciesIds,
} from './pet-animation-config.mjs'

export function reviewStripName(speciesId, actionId) {
  return `${speciesId}-${actionId}-strip.webp`
}

function reviewBackground(width, height) {
  const cellWidth = width / animationPipeline.runtimeFramesPerAction
  const baselineY = Math.round(
    (animationPipeline.anchor.y / animationPipeline.canvas.height) * 144 + 12,
  )
  const cells = Array.from(
    { length: animationPipeline.runtimeFramesPerAction },
    (_, index) => {
      const x = Math.round(index * cellWidth)
      const fill = index % 2 === 0 ? '#f6fbf8' : '#eef6f3'
      return `<rect x="${x}" y="0" width="${cellWidth}" height="${height}" fill="${fill}"/>
        <path d="M${x} 0v${height}" stroke="rgba(57,75,72,.12)" stroke-width="1"/>`
    },
  ).join('')

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f6fbf8"/>
    ${cells}
    <path d="M0 ${baselineY}h${width}" stroke="rgba(44,77,70,.18)" stroke-width="1"/>
  </svg>`)
}

function reviewLabel(index) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="24" viewBox="0 0 150 24">
    <text x="75" y="16" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" fill="#4c5d58">f${String(
      index,
    ).padStart(2, '0')}</text>
  </svg>`)
}

async function reviewFrame(resolveProjectPath, relativePath) {
  return sharp(resolveProjectPath(relativePath))
    .resize(140, 140, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: 'contain',
    })
    .png()
    .toBuffer()
}

export async function writeReviewStrip({
  actionId,
  generatedPaths,
  resolveProjectPath,
  speciesId,
}) {
  const cellWidth = 150
  const width = cellWidth * animationPipeline.runtimeFramesPerAction
  const height = 174
  const composites = [
    {
      input: reviewBackground(width, height),
      left: 0,
      top: 0,
    },
  ]

  for (const [frameIndex, relativePath] of generatedPaths.entries()) {
    const left = frameIndex * cellWidth + 5
    composites.push({
      input: await reviewFrame(resolveProjectPath, relativePath),
      left,
      top: 10,
    })
    composites.push({
      input: reviewLabel(frameIndex + 1),
      left: frameIndex * cellWidth,
      top: 148,
    })
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 246, g: 251, b: 248, alpha: 1 },
    },
  })
    .composite(composites)
    .webp({ quality: 88, effort: 4 })
    .toFile(
      resolveProjectPath(
        path.join(animationPipeline.reviewDir, reviewStripName(speciesId, actionId)),
      ),
    )
}

export async function writeReviewIndex(resolveProjectPath) {
  const sections = speciesIds
    .map((speciesId) => {
      const cards = actionIds
        .map((actionId) => {
          const strip = reviewStripName(speciesId, actionId)
          return `<article>
            <h2>${speciesId} / ${actionId}</h2>
            <img src="./${strip}" alt="${speciesId} ${actionId} animation strip">
          </article>`
        })
        .join('\n')
      return `<section><h1>${speciesId}</h1>${cards}</section>`
    })
    .join('\n')

  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pet Animation Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #f7faf8; color: #1f2c28; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    section { margin: 0 0 36px; }
    h1 { margin: 0 0 16px; font-size: 20px; text-transform: capitalize; }
    h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #54645f; text-transform: capitalize; }
    article { margin: 0 0 18px; overflow-x: auto; }
    img { display: block; width: 1800px; max-width: none; height: 174px; border: 1px solid rgba(31,44,40,.16); background: #f6fbf8; }
  </style>
</head>
<body>
  ${sections}
</body>
</html>
`

  await fs.writeFile(
    resolveProjectPath(path.join(animationPipeline.reviewDir, 'index.html')),
    contents,
  )
}
