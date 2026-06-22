import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v14ActionIds,
  v14Actions,
  v14Canvas,
  v14Paths,
  v14Stabilization,
  v14Strategy,
} from './goldie-actions-v14-config.mjs'

export async function writeReviewStrip(actionId, framePaths, resolveProjectPath) {
  const cellWidth = 150
  const frameSize = 136
  const width = cellWidth * framePaths.length
  const height = 176
  const composites = [
    { input: reviewBackground(width, height, framePaths.length), left: 0, top: 0 },
  ]

  for (const [index, framePath] of framePaths.entries()) {
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
    .webp({ effort: 4, quality: 92 })
    .toFile(resolveProjectPath(path.join(v14Paths.reviewDir, `goldie-${actionId}-v14-strip.webp`)))
}

export async function writeReviewIndex(resolveProjectPath) {
  const cards = v14ActionIds
    .map(
      (actionId) => `<article>
        <h2>goldie / ${actionId}</h2>
        <img src="./goldie-${actionId}-v14-strip.webp" alt="Goldie ${actionId} V14 animation strip">
      </article>`,
    )
    .join('\n')
  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V14 Action Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #fffaf7; color: #30231d; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    article { margin: 0 0 24px; overflow-x: auto; }
    h1 { margin: 0 0 18px; }
    h2 { margin: 0 0 8px; font-size: 13px; color: #806252; text-transform: capitalize; }
    img { display: block; height: 176px; max-width: none; border: 1px solid rgba(159,104,74,.18); }
  </style>
</head>
<body>
  <h1>Goldie V14 Action Review</h1>
  <p>Goldie runtime actions use idle-aligned 64-frame clips from stabilized Forge sheets.</p>
  ${cards}
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v14Paths.reviewDir, 'index.html')), contents)
}

export async function writeManifest(generated, resolveProjectPath) {
  const manifest = {
    actions: Object.fromEntries(
      v14ActionIds.map((actionId) => [
        actionId,
        {
          ...v14Actions[actionId],
          forgeMeta: generated.get(actionId).forgeMeta ?? null,
          runtimePaths: generated.get(actionId).runtimePaths,
          metrics: generated.get(actionId).metrics,
          source: generated.get(actionId).source,
          stablePaths: generated.get(actionId).stablePaths,
        },
      ]),
    ),
    canvas: v14Canvas,
    schemaVersion: 1,
    stabilization: v14Stabilization,
    strategy: v14Strategy,
  }
  await fs.mkdir(path.dirname(resolveProjectPath(v14Paths.manifestPath)), {
    recursive: true,
  })
  await fs.writeFile(resolveProjectPath(v14Paths.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
}

function reviewBackground(width, height, frameCount) {
  const cellWidth = width / frameCount
  const cells = Array.from({ length: frameCount }, (_, index) => {
    const x = Math.round(index * cellWidth)
    const fill = index % 2 === 0 ? '#fffaf7' : '#fdf8f4'
    return `<rect x="${x}" y="0" width="${cellWidth}" height="${height}" fill="${fill}"/>`
  }).join('')

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#fffaf7"/>
    ${cells}
  </svg>`)
}
