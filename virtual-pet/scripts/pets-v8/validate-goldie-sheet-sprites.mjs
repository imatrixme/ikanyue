import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { actions, alphaThreshold, canvas, paths } from './goldie-sheet-config.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
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
      if (alpha <= alphaThreshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }
  return { centerX: (minX + maxX) / 2, maxX, maxY, minX, minY }
}

async function validateFrame(relativePath) {
  try {
    await fs.access(resolveProjectPath(relativePath))
  } catch {
    errors.push(`Missing V8 runtime frame: ${relativePath}`)
    return null
  }

  const metadata = await sharp(resolveProjectPath(relativePath)).metadata()
  if (metadata.width !== canvas.width || metadata.height !== canvas.height) {
    errors.push(`Wrong V8 frame size for ${relativePath}: ${metadata.width}x${metadata.height}`)
  }

  const bounds = await alphaBounds(relativePath)
  if (!bounds) {
    errors.push(`V8 runtime frame has no visible pixels: ${relativePath}`)
    return null
  }

  const margin = Math.min(bounds.minX, bounds.minY, canvas.width - bounds.maxX, canvas.height - bounds.maxY)
  if (margin < 24) {
    errors.push(`V8 visible pixels are too close to canvas edge: ${relativePath}`)
  }
  return { relativePath, ...bounds }
}

async function validateAction(actionId, action, manifest) {
  const entry = manifest.actions?.[actionId]
  if (!entry) {
    errors.push(`V8 manifest is missing action: ${actionId}`)
    return
  }
  if (entry.frames?.length !== action.frames) {
    errors.push(`V8 manifest frame count for ${actionId} is ${entry.frames?.length}; expected ${action.frames}`)
  }
  if (entry.fps !== action.fps || entry.loop !== action.loop || entry.durationMs !== action.durationMs) {
    errors.push(`V8 manifest metadata mismatch for ${actionId}`)
  }

  const bounds = []
  for (let index = 1; index <= action.frames; index += 1) {
    const relativePath = path.join(paths.runtimeDir, `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`)
    const frameBounds = await validateFrame(relativePath)
    if (frameBounds) {
      bounds.push(frameBounds)
    }
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const frame = bounds[index]
    const next = bounds[(index + 1) % bounds.length]
    const centerStep = Math.abs(next.centerX - frame.centerX)
    if (centerStep > 30) {
      errors.push(`V8 center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`)
    }
  }
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(resolveProjectPath(paths.manifestPath), 'utf8'))
  } catch {
    errors.push(`Missing or invalid V8 manifest: ${paths.manifestPath}`)
    return {}
  }
}

async function validateReview() {
  try {
    await fs.access(resolveProjectPath(path.join(paths.reviewDir, 'index.html')))
  } catch {
    errors.push('Missing V8 review index')
  }

  for (const actionId of Object.keys(actions)) {
    const relativePath = path.join(paths.reviewDir, `goldie-${actionId}-v8-strip.webp`)
    try {
      await fs.access(resolveProjectPath(relativePath))
    } catch {
      errors.push(`Missing V8 review strip: ${relativePath}`)
    }
  }
}

async function validateRuntimeManifest() {
  const runtimeManifest = await fs.readFile(resolveProjectPath(paths.runtimeManifestPath), 'utf8')
  if (
    !runtimeManifest.includes('goldie: goldieAnimationManifest') ||
    !runtimeManifest.includes(`./goldieAnimationManifest`)
  ) {
    errors.push('Runtime manifest is missing the Goldie V8 manifest link')
  }

  const goldieManifest = await fs.readFile(resolveProjectPath(paths.runtimeGoldieManifestPath), 'utf8')
  if (!goldieManifest.includes(`renderStyle: 'sheet-hd'`)) {
    errors.push('Goldie runtime manifest is missing V8 sheet-hd metadata')
  }
}

async function main() {
  const manifest = await readManifest()
  for (const [actionId, action] of Object.entries(actions)) {
    await validateAction(actionId, action, manifest)
  }
  await validateReview()
  await validateRuntimeManifest()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Goldie V8 sheet sprite assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
