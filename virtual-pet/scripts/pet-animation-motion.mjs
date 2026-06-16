import sharp from 'sharp'
import { animationPipeline } from './pet-animation-config.mjs'

export async function readSeed(filePath) {
  const image = sharp(filePath).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const bounds = alphaBounds(data, info.width, info.height)

  if (!bounds) {
    throw new Error(`Seed has no visible pixels: ${filePath}`)
  }

  const cropBuffer = await sharp(filePath)
    .ensureAlpha()
    .extract({
      left: bounds.minX,
      top: bounds.minY,
      width: bounds.width,
      height: bounds.height,
    })
    .png()
    .toBuffer()

  return {
    bounds,
    cropBuffer,
    path: filePath,
  }
}

function alphaBounds(data, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
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
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

function wave(phase, frequency = 1, offset = 0) {
  return Math.sin((phase * frequency + offset) * Math.PI * 2)
}

function loopRise(phase) {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

function motionFor(actionId, frameIndex) {
  const phase = frameIndex / animationPipeline.runtimeFramesPerAction
  const soft = wave(phase)
  const quick = wave(phase, 2)
  const hop = loopRise(phase)

  switch (actionId) {
    case 'eating':
      return {
        offsetX: 2 * quick,
        offsetY: -5 * Math.max(0, quick),
        rotate: 1.8 * quick,
        scaleX: 1.02 + 0.035 * Math.abs(quick),
        scaleY: 1.01 - 0.03 * Math.abs(quick),
      }
    case 'play':
      return {
        offsetX: 12 * soft,
        offsetY: -6 * hop,
        rotate: 3 * soft,
        scaleX: 1.02 - 0.025 * hop,
        scaleY: 1.02,
      }
    case 'clean':
      return {
        offsetX: 5 * quick,
        offsetY: 0,
        rotate: 2.1 * quick,
        scaleX: 1.005,
        scaleY: 1.005,
      }
    case 'sleep':
      return {
        offsetX: 0,
        offsetY: 3 * loopRise(phase),
        rotate: 0.8 * soft,
        scaleX: 1.01 + 0.008 * soft,
        scaleY: 0.99 - 0.012 * soft,
      }
    case 'weak':
      return {
        offsetX: 5 * soft,
        offsetY: 5 + 2 * loopRise(phase),
        rotate: 2.2 * soft,
        scaleX: 0.98,
        scaleY: 0.98,
        saturation: 0.72,
        brightness: 0.96,
      }
    case 'idle':
    default:
      return {
        offsetX: 2.5 * soft,
        offsetY: -8 * loopRise(phase),
        rotate: 1.2 * soft,
        scaleX: 1.01 + 0.01 * soft,
        scaleY: 1.01 - 0.012 * soft,
      }
  }
}

async function transformSeed(seed, motion) {
  const width = Math.max(1, Math.round(seed.bounds.width * motion.scaleX))
  const height = Math.max(1, Math.round(seed.bounds.height * motion.scaleY))
  let image = sharp(seed.cropBuffer)
    .resize(width, height, { fit: 'fill' })
    .rotate(motion.rotate, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })

  if (motion.saturation || motion.brightness) {
    image = image.modulate({
      brightness: motion.brightness ?? 1,
      saturation: motion.saturation ?? 1,
    })
  }

  const { data, info } = await image
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    height: info.height,
    width: info.width,
  }
}

function actionOverlays(actionId, frameIndex) {
  const phase = frameIndex / animationPipeline.runtimeFramesPerAction

  if (actionId === 'clean') {
    const float = loopRise(phase)
    return [
      svgOverlay(
        `<circle cx="64" cy="64" r="10" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="4"/>
        <circle cx="102" cy="38" r="7" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="3"/>`,
        180,
        115 - float * 24,
      ),
    ]
  }

  if (actionId === 'sleep') {
    const float = loopRise(phase)
    return [
      svgOverlay(
        `<path d="M52 30h46L58 75h44" fill="none" stroke="rgba(52,93,112,.62)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M106 16h30l-26 30h32" fill="none" stroke="rgba(52,93,112,.44)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
        410,
        125 - float * 18,
      ),
    ]
  }

  if (actionId === 'eating') {
    const bite = Math.max(0, wave(phase, 2))
    return [
      svgOverlay(
        `<circle cx="32" cy="32" r="13" fill="rgba(245,125,97,.74)"/>
        <circle cx="74" cy="48" r="8" fill="rgba(248,184,79,.70)"/>`,
        168 + bite * 4,
        392 - bite * 10,
      ),
    ]
  }

  if (actionId === 'play') {
    const sparkle = Math.max(0, wave(phase, 2, 0.12))
    return [
      svgOverlay(
        `<path d="M35 5l8 22 22 8-22 8-8 22-8-22-22-8 22-8z" fill="rgba(255,223,92,.72)"/>
        <circle cx="86" cy="24" r="7" fill="rgba(255,255,255,.65)"/>`,
        418,
        146 - sparkle * 18,
      ),
    ]
  }

  return []
}

function svgOverlay(svgBody, left, top) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="110" viewBox="0 0 150 110">${svgBody}</svg>`
  return {
    input: Buffer.from(svg),
    left: Math.round(left),
    top: Math.round(top),
  }
}

export async function renderMotionFrame(seed, actionId, frameIndex, outputPath) {
  const motion = motionFor(actionId, frameIndex)
  const transformed = await transformSeed(seed, motion)
  const left = Math.round(
    animationPipeline.anchor.x - transformed.width / 2 + motion.offsetX,
  )
  const top = Math.round(
    animationPipeline.anchor.y - transformed.height + motion.offsetY,
  )

  await sharp({
    create: {
      width: animationPipeline.canvas.width,
      height: animationPipeline.canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: transformed.buffer, left, top },
      ...actionOverlays(actionId, frameIndex),
    ])
    .webp({ quality: 86, effort: 5, alphaQuality: 92 })
    .toFile(outputPath)
}
