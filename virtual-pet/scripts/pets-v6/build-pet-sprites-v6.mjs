import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { pixelizeRgbaData } from './pixel-art.mjs'
import {
  resolveProjectPath,
  runtimeFrameRelativePath,
} from './pet-sprite-v6-paths.mjs'
import {
  writeRuntimeManifest,
  writeV6Manifest,
} from './pet-sprite-v6-manifest.mjs'
import {
  writeReviewIndex,
  writeReviewStrip,
} from './pet-sprite-v6-review.mjs'
import { v6Actions, v6Palette, v6Pipeline } from './pet-sprite-v6-config.mjs'
import {
  renderRawFrames,
  startViteServer,
  waitForServer,
} from './sprout-frame-renderer.mjs'

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await emptyDir(v6Pipeline.rawDir)
  await emptyDir(v6Pipeline.runtimeDir)
  await emptyDir(v6Pipeline.reviewDir)
  await fs.mkdir(path.dirname(resolveProjectPath(v6Pipeline.manifestPath)), {
    recursive: true,
  })
}

async function alphaBounds(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha > v6Pipeline.alphaThreshold) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }

  return {
    baselineY: maxY,
    centerX: (minX + maxX) / 2,
  }
}

async function normalizeAndPixelizeFrames(action, rawPaths) {
  const runtimePaths = []
  const referenceBounds = await alphaBounds(rawPaths[0])
  if (!referenceBounds) {
    throw new Error(`V6 reference frame has no visible pixels: ${rawPaths[0]}`)
  }

  const translateX = Math.round(v6Pipeline.sourceAnchor.x - referenceBounds.centerX)
  const translateY = Math.round(v6Pipeline.sourceAnchor.y - referenceBounds.baselineY)

  for (const [frameIndex, rawPath] of rawPaths.entries()) {
    const runtimeRelativePath = runtimeFrameRelativePath(action, frameIndex + 1)
    const input = await sharp(resolveProjectPath(rawPath)).ensureAlpha().png().toBuffer()
    const normalized = await sharp({
      create: {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        channels: 4,
        height: v6Pipeline.renderCanvas.height,
        width: v6Pipeline.renderCanvas.width,
      },
    })
      .composite([{ input, left: translateX, top: translateY }])
      .png()
      .toBuffer()

    const pixelFrame = await pixelizeFrame(normalized, action, frameIndex)
    await sharp(pixelFrame.data, {
      raw: {
        channels: 4,
        height: v6Pipeline.pixelCanvas.height,
        width: v6Pipeline.pixelCanvas.width,
      },
    })
      .webp({ effort: 4, lossless: true })
      .toFile(resolveProjectPath(runtimeRelativePath))
    runtimePaths.push(runtimeRelativePath)
  }

  return runtimePaths
}

async function pixelizeFrame(input, action, frameIndex) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(v6Pipeline.pixelCanvas.width, v6Pipeline.pixelCanvas.height, {
      fit: 'fill',
      kernel: 'nearest',
    })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: pixelizeRgbaData(data, info, {
      alphaThreshold: v6Pipeline.alphaThreshold,
      actionId: action.actionId,
      ditherStrength: 2,
      frameCount: action.frameCount,
      frameIndex: frameIndex,
      outlineColor: [37, 45, 30, 236],
      palette: v6Palette,
    }),
  }
}

async function main() {
  await prepareDirs()
  const server = startViteServer()

  try {
    await waitForServer()

    const generatedActions = []
    const generatedByKey = new Map()
    for (const action of v6Actions) {
      const rawPaths = await renderRawFrames(action)
      const runtimePaths = await normalizeAndPixelizeFrames(action, rawPaths)
      const reviewPath = await writeReviewStrip(action, runtimePaths)
      const generated = { action, rawPaths, reviewPath, runtimePaths }
      generatedActions.push(generated)
      generatedByKey.set(`${action.speciesId}/${action.actionId}`, generated)
    }

    await writeReviewIndex(generatedActions)
    await writeV6Manifest(generatedActions)
    await writeRuntimeManifest(generatedByKey)
    console.log(`Generated ${generatedActions.length} V6 pixel pet sprite action(s).`)
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
