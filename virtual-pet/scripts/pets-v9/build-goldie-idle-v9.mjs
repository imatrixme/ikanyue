import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v9IdleAction,
  v9Paths,
} from './goldie-idle-config.mjs'
import {
  composeRuntimeFrame,
  extractKeyframes,
} from './goldie-idle-image.mjs'

const root = process.cwd()

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await fs.mkdir(resolveProjectPath(v9Paths.sourceDir), { recursive: true })
  await fs.mkdir(path.dirname(resolveProjectPath(v9Paths.manifestPath)), {
    recursive: true,
  })
  await emptyDir(v9Paths.extractedDir)
  await emptyDir(v9Paths.runtimeDir)
  await emptyDir(v9Paths.reviewDir)
}

function keyframeForRuntimeFrame(index, keyframes, total) {
  const position = (index / total) * keyframes.length
  return keyframes[Math.floor(position) % keyframes.length]
}

async function writeRuntimeFrames(keyframes) {
  const runtimePaths = []
  for (let index = 0; index < v9IdleAction.runtimeFrames; index += 1) {
    const keyframePath = keyframeForRuntimeFrame(
      index,
      keyframes,
      v9IdleAction.runtimeFrames,
    )
    const frame = await composeRuntimeFrame(
      keyframePath,
      index,
      v9IdleAction.runtimeFrames,
      resolveProjectPath,
    )
    const relativePath = path.join(
      v9Paths.runtimeDir,
      `goldie-idle-${String(index + 1).padStart(2, '0')}.webp`,
    )
    await fs.writeFile(resolveProjectPath(relativePath), frame)
    runtimePaths.push(relativePath)
  }
  return runtimePaths
}

async function writeReviewStrip(runtimePaths) {
  const cellWidth = 150
  const frameSize = 136
  const width = cellWidth * runtimePaths.length
  const height = 176
  const composites = [
    {
      input: reviewBackground(width, height, runtimePaths.length),
      left: 0,
      top: 0,
    },
  ]

  for (const [index, framePath] of runtimePaths.entries()) {
    const preview = await sharp(resolveProjectPath(framePath))
      .resize(frameSize, frameSize, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
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
      width,
      height,
      channels: 4,
      background: { r: 255, g: 250, b: 247, alpha: 1 },
    },
  })
    .composite(composites)
    .webp({ effort: 4, quality: 90 })
    .toFile(resolveProjectPath(path.join(v9Paths.reviewDir, 'goldie-idle-v9-strip.webp')))
}

async function writeReviewIndex() {
  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldie V9 Idle Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #fffaf7; color: #30231d; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    img { display: block; height: 176px; max-width: none; border: 1px solid rgba(159,104,74,.18); }
  </style>
</head>
<body>
  <h1>Goldie V9 Idle Review</h1>
  <img src="./goldie-idle-v9-strip.webp" alt="Goldie V9 idle animation strip">
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v9Paths.reviewDir, 'index.html')), contents)
}

async function writeManifest(keyframes, runtimePaths) {
  const manifest = {
    action: v9IdleAction,
    keyframes,
    runtimePaths,
    schemaVersion: 1,
    source: v9Paths.sourcePath,
  }
  await fs.writeFile(resolveProjectPath(v9Paths.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
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

async function main() {
  await prepareDirs()
  const keyframes = await extractKeyframes(v9Paths.sourcePath, resolveProjectPath)
  const runtimePaths = await writeRuntimeFrames(keyframes)
  await writeReviewStrip(runtimePaths)
  await writeReviewIndex()
  await writeManifest(keyframes, runtimePaths)
  console.log('Generated Goldie V9 idle frames from generated keyframe sheet.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
