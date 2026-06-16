import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  actionConfigs,
  actionIds,
  animationPipeline,
  speciesIds,
} from './pet-animation-config.mjs'
import { reviewStripName } from './pet-animation-review.mjs'

const root = process.cwd()
const errors = []

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function frameName(speciesId, actionId, index) {
  return `${speciesId}-${actionId}-${String(index).padStart(2, '0')}.webp`
}

async function alphaBounds(filePath) {
  const { data, info } = await sharp(filePath)
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
      if (alpha > animationPipeline.alphaThreshold) {
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
    centerX: (minX + maxX) / 2,
    baselineY: maxY,
    maxX,
    maxY,
    minX,
    minY,
  }
}

async function validateAction(speciesId, actionId) {
  const bounds = []
  const actionConfig = actionConfigs[actionId]

  for (
    let index = 1;
    index <= animationPipeline.runtimeFramesPerAction;
    index += 1
  ) {
    const relativePath = path.join(
      animationPipeline.outputDir,
      frameName(speciesId, actionId, index),
    )
    const filePath = resolveProjectPath(relativePath)

    try {
      await fs.access(filePath)
    } catch {
      errors.push(`Missing generated frame: ${relativePath}`)
      continue
    }

    const metadata = await sharp(filePath).metadata()
    if (
      metadata.width !== animationPipeline.canvas.width ||
      metadata.height !== animationPipeline.canvas.height
    ) {
      errors.push(
        `Wrong frame size for ${relativePath}: ${metadata.width}x${metadata.height}`,
      )
    }

    const frameBounds = await alphaBounds(filePath)
    if (!frameBounds) {
      errors.push(`Generated frame has no visible pixels: ${relativePath}`)
      continue
    }

    bounds.push({ relativePath, ...frameBounds })

    const margin = animationPipeline.visibleMarginPx
    if (
      frameBounds.minX < margin ||
      frameBounds.minY < margin ||
      frameBounds.maxX > animationPipeline.canvas.width - margin ||
      frameBounds.maxY > animationPipeline.canvas.height - margin
    ) {
      errors.push(
        `Visible pixels are too close to canvas edge for ${relativePath}`,
      )
    }
  }

  if (bounds.length !== animationPipeline.runtimeFramesPerAction) {
    return
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const frame = bounds[index]
    const nextFrame = bounds[(index + 1) % bounds.length]
    const centerStep = Math.abs(nextFrame.centerX - frame.centerX)
    const baselineStep = Math.abs(nextFrame.baselineY - frame.baselineY)

    if (centerStep > actionConfig.maxCenterStepPx) {
      errors.push(
        `Center step ${centerStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
    if (baselineStep > actionConfig.maxBaselineStepPx) {
      errors.push(
        `Baseline step ${baselineStep.toFixed(1)}px exceeds tolerance for ${frame.relativePath}`,
      )
    }
  }
}

async function validateManifest() {
  const manifestPath = resolveProjectPath(animationPipeline.manifestPath)
  const contents = await fs.readFile(manifestPath, 'utf8')

  for (const speciesId of speciesIds) {
    for (const actionId of actionIds) {
      const frameRefs = contents.match(
        new RegExp(`${speciesId}-${actionId}-[0-9]{2}\\.webp`, 'g'),
      ) ?? []
      if (frameRefs.length !== animationPipeline.runtimeFramesPerAction) {
        errors.push(
          `Manifest has ${frameRefs.length} frames for ${speciesId}/${actionId}; expected ${animationPipeline.runtimeFramesPerAction}`,
        )
      }

      for (const token of ['fps', 'loop', 'durationMs', 'canvas', 'anchor']) {
        if (!contents.includes(token)) {
          errors.push(`Manifest is missing metadata token: ${token}`)
        }
      }
    }
  }
}

async function validateReviewStrips() {
  const indexPath = resolveProjectPath(path.join(animationPipeline.reviewDir, 'index.html'))
  try {
    await fs.access(indexPath)
  } catch {
    errors.push('Missing pet animation review index: assets-src/pets/review/index.html')
  }

  for (const speciesId of speciesIds) {
    for (const actionId of actionIds) {
      const relativePath = path.join(
        animationPipeline.reviewDir,
        reviewStripName(speciesId, actionId),
      )
      const filePath = resolveProjectPath(relativePath)

      try {
        await fs.access(filePath)
      } catch {
        errors.push(`Missing pet animation review strip: ${relativePath}`)
        continue
      }

      const metadata = await sharp(filePath).metadata()
      const expectedWidth = animationPipeline.runtimeFramesPerAction * 150
      if (metadata.width !== expectedWidth || metadata.height !== 174) {
        errors.push(
          `Wrong review strip size for ${relativePath}: ${metadata.width}x${metadata.height}`,
        )
      }
    }
  }
}

async function main() {
  for (const speciesId of speciesIds) {
    for (const actionId of actionIds) {
      await validateAction(speciesId, actionId)
    }
  }

  await validateManifest()
  await validateReviewStrips()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exitCode = 1
    return
  }

  console.log('Pet animation assets are valid.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
