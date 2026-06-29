import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { v14Canvas } from '../pets-v14/goldie-actions-v14-config.mjs'
import {
  frameCols,
  frameRows,
  reviewDir,
  resolveProjectPath,
} from './goldie-gorest-v15-config.mjs'

export async function writeSheet(frames, relativePath) {
  const composites = await Promise.all(frames.map(async (frame, index) => ({
    input: await rawToPng(frame.data),
    left: (index % frameCols) * v14Canvas.width,
    top: Math.floor(index / frameCols) * v14Canvas.height,
  })))
  await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: frameRows * v14Canvas.height,
      width: frameCols * v14Canvas.width,
    },
  })
    .composite(composites)
    .png()
    .toFile(resolveProjectPath(relativePath))
}

export async function writeReviewStrip(framePaths, relativePath) {
  const size = 192
  const composites = await Promise.all(framePaths.map(async (framePath, index) => ({
    input: await sharp(resolveProjectPath(framePath)).resize(size, size, { fit: 'contain' }).png().toBuffer(),
    left: index * size,
    top: 0,
  })))
  await sharp({
    create: {
      background: '#202124',
      channels: 4,
      height: size,
      width: framePaths.length * size,
    },
  })
    .composite(composites)
    .webp({ effort: 5, quality: 92 })
    .toFile(resolveProjectPath(relativePath))
}

export async function writeReviewIndex(results) {
  const rows = results.map((result) => `
    <section>
      <h2>${result.actionId}</h2>
      <img src="${path.relative(reviewDir, result.reviewStripPath)}" alt="${result.actionId} V15 strip">
      <dl>
        <dt>grid</dt><dd>${result.gridDetection.mode}</dd>
        <dt>scale</dt><dd>${result.scale.toFixed(4)}</dd>
        <dt>max body step</dt><dd>${result.metrics.runtimeBodySteps.max.toFixed(3)} px</dd>
        <dt>terminal step</dt><dd>${result.metrics.runtimeBodySteps.terminalStep.toFixed(3)} px</dd>
      </dl>
    </section>
  `).join('\n')
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V15 Gorest-style review</title>
  <style>
    body { background: #111318; color: #eceff4; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
    section { border-top: 1px solid #30343c; margin-top: 24px; padding-top: 20px; }
    img { background: #202124; display: block; max-width: 100%; }
    dl { display: grid; grid-template-columns: max-content auto; gap: 6px 12px; margin: 12px 0 0; }
    dt { color: #98a2b3; }
    dd { margin: 0; }
  </style>
</head>
<body>
  <h1>Goldie V15 Gorest-style normalization</h1>
  ${rows}
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(reviewDir, 'index.html')), html, 'utf8')
}

async function rawToPng(data) {
  return sharp(data, {
    raw: {
      channels: 4,
      height: v14Canvas.height,
      width: v14Canvas.width,
    },
  })
    .png()
    .toBuffer()
}
