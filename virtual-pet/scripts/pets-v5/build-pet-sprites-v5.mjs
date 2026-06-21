import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import sharp from 'sharp'
import {
  actionConfigs,
  actionIds,
  animationPipeline,
  speciesIds,
} from '../pet-animation-config.mjs'
import { v5Actions, v5Pipeline } from './pet-sprite-v5-config.mjs'

const root = process.cwd()
const host = '127.0.0.1'
const port = 4177

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function frameBaseName(action, index, extension) {
  const padded = String(index).padStart(2, '0')
  return `${action.speciesId}-${action.stageId}-${action.actionId}-${padded}.${extension}`
}

function runtimeFrameRelativePath(action, index) {
  return path.join(v5Pipeline.runtimeDir, frameBaseName(action, index, 'webp'))
}

function rawFrameRelativePath(action, index) {
  return path.join(
    v5Pipeline.rawDir,
    action.speciesId,
    action.stageId,
    action.actionId,
    frameBaseName(action, index, 'png'),
  )
}

function reviewStripName(action) {
  return `${action.speciesId}-${action.stageId}-${action.actionId}-v5-strip.webp`
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs() {
  await emptyDir(v5Pipeline.rawDir)
  await emptyDir(v5Pipeline.runtimeDir)
  await emptyDir(v5Pipeline.reviewDir)
  await fs.mkdir(path.dirname(resolveProjectPath(v5Pipeline.manifestPath)), {
    recursive: true,
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const request = http.get(
        { host, path: '/', port, timeout: 500 },
        (response) => {
          response.resume()
          resolve(response.statusCode && response.statusCode < 500)
        },
      )
      request.on('error', () => resolve(false))
      request.on('timeout', () => {
        request.destroy()
        resolve(false)
      })
    })
    if (ok) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Vite preview server')
}

function startViteServer() {
  const viteExecutable = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  )
  const server = spawn(
    viteExecutable,
    ['--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: root,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  server.stdout.on('data', (chunk) => {
    const text = String(chunk)
    if (text.includes('error') || text.includes('Error')) {
      process.stdout.write(text)
    }
  })
  server.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk))
  })

  return server
}

async function renderRawFrames(action) {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: v5Pipeline.canvas,
  })
  const rawPaths = []

  try {
    for (let index = 1; index <= action.frameCount; index += 1) {
      const rawRelativePath = rawFrameRelativePath(action, index)
      const rawPath = resolveProjectPath(rawRelativePath)
      await fs.mkdir(path.dirname(rawPath), { recursive: true })
      const url = new URL(`http://${host}:${port}/`)
      url.searchParams.set('tool', 'sprout-frame-export')
      url.searchParams.set('condition', action.actionId)
      url.searchParams.set('stage', action.stageId)
      url.searchParams.set('frame', String(index - 1))
      url.searchParams.set('frames', String(action.frameCount))
      url.searchParams.set('duration', String(action.sourceDurationSeconds))

      await page.goto(url.toString(), { waitUntil: 'networkidle' })
      const canvas = page.locator('canvas').first()
      await canvas.waitFor({ state: 'visible', timeout: 10_000 })
      await page.waitForFunction(() => window.__PET_FRAME_READY__ === true, {
        timeout: 10_000,
      })
      const dataUrl = await canvas.evaluate((element) =>
        element.toDataURL('image/png'),
      )
      const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
      await fs.writeFile(rawPath, png)
      rawPaths.push(rawRelativePath)
    }
  } finally {
    await browser.close()
  }
  return rawPaths
}

async function normalizeFrames(action, rawPaths) {
  const runtimePaths = []
  const referenceBounds = await alphaBounds(rawPaths[0])
  if (!referenceBounds) {
    throw new Error(`V5 reference frame has no visible pixels: ${rawPaths[0]}`)
  }
  const translateX = Math.round(action.anchor.x - referenceBounds.centerX)
  const translateY = Math.round(action.anchor.y - referenceBounds.baselineY)

  for (const [frameIndex, rawPath] of rawPaths.entries()) {
    const runtimeRelativePath = runtimeFrameRelativePath(action, frameIndex + 1)
    const input = await sharp(resolveProjectPath(rawPath)).ensureAlpha().png().toBuffer()

    await sharp({
      create: {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        channels: 4,
        height: v5Pipeline.canvas.height,
        width: v5Pipeline.canvas.width,
      },
    })
      .composite([
        {
          input,
          left: translateX,
          top: translateY,
        },
      ])
      .webp({ effort: 4, quality: 90 })
      .toFile(resolveProjectPath(runtimeRelativePath))
    runtimePaths.push(runtimeRelativePath)
  }
  return runtimePaths
}

async function alphaBounds(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3]
      if (alpha > 8) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
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

function reviewBackground(action) {
  const cellWidth = 150
  const width = cellWidth * action.frameCount
  const height = 174
  const baselineY = Math.round((action.anchor.y / v5Pipeline.canvas.height) * 144 + 12)
  const cells = Array.from({ length: action.frameCount }, (_, index) => {
    const x = index * cellWidth
    const fill = index % 2 === 0 ? '#f5fbf9' : '#edf6f3'
    return `<rect x="${x}" y="0" width="${cellWidth}" height="${height}" fill="${fill}"/>
      <path d="M${x} 0v${height}" stroke="rgba(57,75,72,.12)" stroke-width="1"/>`
  }).join('')

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f5fbf9"/>
    ${cells}
    <path d="M0 ${baselineY}h${width}" stroke="rgba(44,77,70,.22)" stroke-width="1"/>
  </svg>`)
}

function reviewLabel(index) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="24" viewBox="0 0 150 24">
    <text x="75" y="16" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" fill="#4c5d58">v5 f${String(index).padStart(2, '0')}</text>
  </svg>`)
}

async function writeReviewStrip(action, runtimePaths) {
  const cellWidth = 150
  const width = cellWidth * action.frameCount
  const height = 174
  const composites = [{ input: reviewBackground(action), left: 0, top: 0 }]

  for (const [index, relativePath] of runtimePaths.entries()) {
    const input = await sharp(resolveProjectPath(relativePath))
      .resize(140, 140, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        fit: 'contain',
      })
      .png()
      .toBuffer()
    composites.push({ input, left: index * cellWidth + 5, top: 10 })
    composites.push({ input: reviewLabel(index + 1), left: index * cellWidth, top: 148 })
  }

  const reviewRelativePath = path.join(v5Pipeline.reviewDir, reviewStripName(action))
  await sharp({
    create: {
      background: { r: 245, g: 251, b: 249, alpha: 1 },
      channels: 4,
      height,
      width,
    },
  })
    .composite(composites)
    .webp({ effort: 4, quality: 88 })
    .toFile(resolveProjectPath(reviewRelativePath))

  return reviewRelativePath
}

async function writeReviewIndex(generatedActions) {
  const cards = generatedActions
    .map(
      ({ action, reviewPath }) => `<article>
        <h2>${action.speciesId} / ${action.stageId} / ${action.actionId}</h2>
        <img src="./${path.basename(reviewPath)}" alt="${action.speciesId} ${action.actionId} V5 animation strip">
      </article>`,
    )
    .join('\n')

  const contents = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pet Sprite V5 Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #f7faf8; color: #1f2c28; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #54645f; text-transform: capitalize; }
    article { margin: 0 0 18px; overflow-x: auto; }
    img { display: block; height: 174px; max-width: none; border: 1px solid rgba(31,44,40,.16); background: #f6fbf8; }
  </style>
</head>
<body>
  <h1>Pet Sprite V5 Review</h1>
  ${cards}
</body>
</html>
`
  await fs.writeFile(resolveProjectPath(path.join(v5Pipeline.reviewDir, 'index.html')), contents)
}

function importName(speciesId, actionId, index) {
  const pascal = `${speciesId}-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function v5ImportName(speciesId, actionId, index) {
  const pascal = `${speciesId}-v5-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function generatedImportPath(relativePath) {
  return `../../${relativePath.replace(/^src\//, '').replaceAll(path.sep, '/')}`
}

function v4FramePath(speciesId, actionId, index) {
  return path.join(
    animationPipeline.outputDir,
    `${speciesId}-${actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

function findV5Action(speciesId, actionId) {
  return v5Actions.find(
    (action) => action.speciesId === speciesId && action.actionId === actionId,
  )
}

function manifestEntry(speciesId, actionId, frameRefs, actionConfig) {
  return `    ${actionId}: {
      frames: [${frameRefs.join(', ')}],
      fps: ${actionConfig.fps},
      loop: ${actionConfig.loop},
      durationMs: ${actionConfig.durationMs},
      canvas: { width: ${v5Pipeline.canvas.width}, height: ${v5Pipeline.canvas.height} },
      anchor: { x: ${actionConfig.anchor?.x ?? animationPipeline.anchor.x}, y: ${
    actionConfig.anchor?.y ?? animationPipeline.anchor.y
  } },
    }`
}

async function writeRuntimeManifest(generatedByKey) {
  const imports = []
  const speciesBlocks = []

  for (const speciesId of speciesIds) {
    const actionBlocks = []
    for (const actionId of actionIds) {
      const v5Action = findV5Action(speciesId, actionId)
      if (v5Action) {
        const runtimePaths = generatedByKey.get(`${speciesId}/${actionId}`)?.runtimePaths
        if (!runtimePaths) {
          throw new Error(`Missing generated V5 paths for ${speciesId}/${actionId}`)
        }
        const frameRefs = runtimePaths.map((relativePath, index) => {
          const ref = v5ImportName(speciesId, actionId, index + 1)
          imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
          return ref
        })
        actionBlocks.push(manifestEntry(speciesId, actionId, frameRefs, v5Action))
        continue
      }

      const frameRefs = []
      for (let index = 1; index <= animationPipeline.runtimeFramesPerAction; index += 1) {
        const relativePath = v4FramePath(speciesId, actionId, index)
        const ref = importName(speciesId, actionId, index)
        imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
        frameRefs.push(ref)
      }
      actionBlocks.push(manifestEntry(speciesId, actionId, frameRefs, actionConfigs[actionId]))
    }
    speciesBlocks.push(`  ${speciesId}: {\n${actionBlocks.join(',\n')},\n  }`)
  }

  const contents = `${imports.join('\n')}
import type { PetAnimationManifest } from '../../game/types'

export const petAnimationManifest = {
${speciesBlocks.join(',\n')}
} satisfies PetAnimationManifest
`
  await fs.writeFile(resolveProjectPath(v5Pipeline.runtimeManifestPath), contents)
}

async function writeV5Manifest(generatedActions) {
  const manifest = {
    canvas: v5Pipeline.canvas,
    schemaVersion: 1,
    actions: generatedActions.map(({ action, rawPaths, reviewPath, runtimePaths }) => ({
      actionId: action.actionId,
      anchor: action.anchor,
      frameCount: action.frameCount,
      fps: action.fps,
      rawPaths,
      renderer: action.renderer,
      reviewPath,
      runtimePaths,
      speciesId: action.speciesId,
      stageId: action.stageId,
      tolerances: {
        maxBaselineStepPx: action.maxBaselineStepPx,
        maxCenterStepPx: action.maxCenterStepPx,
        maxLoopCenterStepPx: action.maxLoopCenterStepPx,
        visibleMarginPx: action.visibleMarginPx,
      },
    })),
  }
  await fs.writeFile(resolveProjectPath(v5Pipeline.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function main() {
  await prepareDirs()
  const server = startViteServer()

  try {
    await waitForServer()

    const generatedActions = []
    const generatedByKey = new Map()
    for (const action of v5Actions) {
      const rawPaths = await renderRawFrames(action)
      const runtimePaths = await normalizeFrames(action, rawPaths)
      const reviewPath = await writeReviewStrip(action, runtimePaths)
      const generated = { action, rawPaths, reviewPath, runtimePaths }
      generatedActions.push(generated)
      generatedByKey.set(`${action.speciesId}/${action.actionId}`, generated)
    }

    await writeReviewIndex(generatedActions)
    await writeV5Manifest(generatedActions)
    await writeRuntimeManifest(generatedByKey)
    console.log(`Generated ${generatedActions.length} V5 pet sprite action(s).`)
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
