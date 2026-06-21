import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { actions, anchor, canvas, paths } from './goldie-sheet-config.mjs'

export async function writeReviewStrip(actionId, framePaths, resolveProjectPath) {
  const cellWidth = 180
  const frameSize = 160
  const width = cellWidth * framePaths.length
  const height = 386
  const composites = [{ input: reviewBackground(width, height, framePaths.length), left: 0, top: 0 }]

  for (const [frameIndex, framePath] of framePaths.entries()) {
    const preview = await sharp(resolveProjectPath(framePath))
      .resize(frameSize, frameSize, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        fit: 'contain',
      })
      .png()
      .toBuffer()
    composites.push({
      input: preview,
      left: frameIndex * cellWidth + 10,
      top: 14,
    })
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 250, b: 247, alpha: 1 },
    },
  })
    .composite(composites)
    .webp({ effort: 4, quality: 90 })
    .toFile(resolveProjectPath(path.join(paths.reviewDir, `goldie-${actionId}-v8-strip.webp`)))
}

export async function writeReviewIndex(resolveProjectPath) {
  const cards = Object.keys(actions)
    .map(
      (actionId) => `<article>
        <h2>goldie / ${actionId}</h2>
        <img src="./goldie-${actionId}-v8-strip.webp" alt="Goldie ${actionId} V8 animation strip">
      </article>`,
    )
    .join('\n')
  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V8 Sheet Animation Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #fffaf7; color: #30231d; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    article { margin: 0 0 24px; overflow-x: auto; }
    h1 { margin: 0 0 18px; }
    h2 { margin: 0 0 8px; font-size: 13px; color: #806252; text-transform: capitalize; }
    img { display: block; height: 386px; max-width: none; border: 1px solid rgba(159,104,74,.18); }
  </style>
</head>
<body>
  <h1>Goldie V8 Sheet Animation Review</h1>
  ${cards}
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(paths.reviewDir, 'index.html')), contents)
}

export async function writeManifest(generated, extracted, resolveProjectPath) {
  const manifest = {
    anchor,
    canvas,
    schemaVersion: 1,
    source: path.join(paths.sourceDir, 'goldie-sheet.png'),
    extracted: Object.fromEntries(extracted),
    actions: Object.fromEntries(
      Object.entries(actions).map(([actionId, action]) => [
        actionId,
        {
          durationMs: action.durationMs,
          fps: action.fps,
          frames: generated.get(actionId),
          loop: action.loop,
          poses: action.poses,
        },
      ]),
    ),
  }
  await fs.writeFile(resolveProjectPath(paths.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
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
    <path d="M0 334h${width}" stroke="rgba(159,104,74,.18)" stroke-width="1"/>
  </svg>`)
}
