import sharp from 'sharp'
import {
  v14Canvas,
  v14RuntimeFrames,
  v14SourceFrames,
  v14Stabilization,
} from './goldie-actions-v14-config.mjs'

export async function readRawFrame(relativePath, resolveProjectPath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.width !== v14Canvas.width || info.height !== v14Canvas.height) {
    throw new Error(`Unexpected Goldie V14 frame size for ${relativePath}: ${info.width}x${info.height}`)
  }

  return {
    data,
    height: info.height,
    relativePath,
    width: info.width,
  }
}

export function analyzeFrame(frame) {
  const { data, height, width } = frame
  const threshold = v14Stabilization.alphaThreshold
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let total = 0
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha <= threshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      total += alpha
      sumX += x * alpha
      sumY += y * alpha
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error(`No visible pixels in ${frame.relativePath}`)
  }

  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  const bodyMaxX = minX + boxWidth * v14Stabilization.bodyCutRatio
  const bodyMinY = minY + boxHeight * v14Stabilization.bodyTopTrimRatio
  const bodyMaxY = maxY - boxHeight * v14Stabilization.bodyBottomTrimRatio
  let bodyTotal = 0
  let bodySumX = 0
  let bodySumY = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (
        alpha <= threshold ||
        x > bodyMaxX ||
        y < bodyMinY ||
        y > bodyMaxY
      ) {
        continue
      }
      bodyTotal += alpha
      bodySumX += x * alpha
      bodySumY += y * alpha
    }
  }

  const centroid = { x: sumX / total, y: sumY / total }
  const bodyAnchor = bodyTotal > 0
    ? { x: bodySumX / bodyTotal, y: bodySumY / bodyTotal }
    : centroid

  return {
    bodyAnchor,
    bounds: { maxX, maxY, minX, minY },
    centroid,
    height: boxHeight,
    visibleMargin: visibleMargin({ maxX, maxY, minX, minY }),
    width: boxWidth,
  }
}

export function summarizeFrames(frames) {
  const metrics = frames.map((frame) => frame.metrics ?? analyzeFrame(frame))
  return {
    bodyAnchor: {
      x: median(metrics.map((metric) => metric.bodyAnchor.x)),
      y: median(metrics.map((metric) => metric.bodyAnchor.y)),
    },
    height: median(metrics.map((metric) => metric.height)),
    metrics,
    width: median(metrics.map((metric) => metric.width)),
  }
}

export async function stabilizeFrame(frame, actionId, actionBaseline, idleBaseline) {
  const metrics = frame.metrics ?? analyzeFrame(frame)
  const ratios = v14Stabilization.targetBounds[actionId] ??
    v14Stabilization.targetBounds.default
  const targetWidth = idleBaseline.width * ratios.widthRatio
  const targetHeight = idleBaseline.height * ratios.heightRatio
  const scale = clamp(
    Math.min(targetWidth / metrics.width, targetHeight / metrics.height),
    v14Stabilization.minScale,
    v14Stabilization.maxScale,
  )
  const motionClamp = v14Stabilization.motionClamp[actionId] ??
    v14Stabilization.motionClamp.default
  const offset = v14Stabilization.anchorOffsets[actionId] ?? { x: 0, y: 0 }
  const sourceDeviation = {
    x: clamp(metrics.bodyAnchor.x - actionBaseline.bodyAnchor.x, -motionClamp.x, motionClamp.x),
    y: clamp(metrics.bodyAnchor.y - actionBaseline.bodyAnchor.y, -motionClamp.y, motionClamp.y),
  }
  const targetAnchor = {
    x: idleBaseline.bodyAnchor.x + offset.x + sourceDeviation.x,
    y: idleBaseline.bodyAnchor.y + offset.y + sourceDeviation.y,
  }

  const crop = paddedBounds(metrics.bounds, 8, frame.width, frame.height)
  const resized = await resizeCrop(frame, crop, scale)
  const bodyAnchorInCrop = {
    x: (metrics.bodyAnchor.x - crop.left) * scale,
    y: (metrics.bodyAnchor.y - crop.top) * scale,
  }
  const paste = {
    x: Math.round(targetAnchor.x - bodyAnchorInCrop.x),
    y: Math.round(targetAnchor.y - bodyAnchorInCrop.y),
  }
  const data = pasteRaw(resized, paste)
  const after = analyzeFrame({ data, height: frame.height, relativePath: frame.relativePath, width: frame.width })

  return {
    data,
    height: frame.height,
    metrics: {
      afterBodyAnchor: after.bodyAnchor,
      afterBounds: after.bounds,
      beforeBodyAnchor: metrics.bodyAnchor,
      beforeBounds: metrics.bounds,
      sourceDeviation,
      targetAnchor,
      visibleMargin: after.visibleMargin,
      scale,
      paste,
    },
    relativePath: frame.relativePath,
    width: frame.width,
  }
}

export function interpolateFrames(frames, loop) {
  return Array.from({ length: v14RuntimeFrames }, (_, index) => {
    const runtimeIndex = index + 1
    const position = loop
      ? (index / v14RuntimeFrames) * v14SourceFrames
      : (index / (v14RuntimeFrames - 1)) * (v14SourceFrames - 1)
    const sourceA = Math.floor(position)
    const amount = position - sourceA
    const sourceB = loop
      ? (sourceA + 1) % v14SourceFrames
      : Math.min(sourceA + 1, v14SourceFrames - 1)
    const bodyStep = Math.hypot(
      frames[sourceB].metrics.afterBodyAnchor.x - frames[sourceA].metrics.afterBodyAnchor.x,
      frames[sourceB].metrics.afterBodyAnchor.y - frames[sourceA].metrics.afterBodyAnchor.y,
    )
    const canBlend = amount > 0 && bodyStep <= v14Stabilization.blendMaxBodyStepPx
    const pickedSource = amount < 0.5 ? sourceA : sourceB
    const data = canBlend
      ? blendRaw(frames[sourceA].data, frames[sourceB].data, amount)
      : Buffer.from(frames[pickedSource].data)
    const analysis = analyzeFrame({
      data,
      height: v14Canvas.height,
      relativePath: `runtime-${runtimeIndex}`,
      width: v14Canvas.width,
    })

    return {
      data,
      height: v14Canvas.height,
      metrics: {
        bodyAnchor: analysis.bodyAnchor,
        bounds: analysis.bounds,
        blend: Number(amount.toFixed(4)),
        blended: canBlend,
        sourceStep: Number(bodyStep.toFixed(4)),
        pickedSource: pickedSource + 1,
        sourceA: sourceA + 1,
        sourceB: sourceB + 1,
        visibleMargin: analysis.visibleMargin,
      },
      width: v14Canvas.width,
    }
  })
}

export function bodyStepStats(frames, loop = true) {
  const lastIndex = frames.length - 1
  const steps = frames.flatMap((frame, index) => {
    const nextFrame = frames[index + 1] ?? (loop ? frames[0] : null)
    if (!nextFrame) {
      return []
    }
    const current = metricAnchor(frame.metrics)
    const next = metricAnchor(nextFrame.metrics)
    return [Math.hypot(next.x - current.x, next.y - current.y)]
  })

  return {
    max: Math.max(...steps),
    mean: steps.reduce((sum, step) => sum + step, 0) / steps.length,
    steps,
    terminalStep: Math.hypot(
      metricAnchor(frames[lastIndex].metrics).x - metricAnchor(frames[0].metrics).x,
      metricAnchor(frames[lastIndex].metrics).y - metricAnchor(frames[0].metrics).y,
    ),
  }
}

function metricAnchor(metrics) {
  return metrics.bodyAnchor ?? metrics.afterBodyAnchor
}

export async function writeRawFrame(raw, relativePath, resolveProjectPath, format) {
  const writer = sharp(raw, {
    raw: {
      channels: 4,
      height: v14Canvas.height,
      width: v14Canvas.width,
    },
  })

  if (format === 'webp') {
    await writer.webp({ alphaQuality: 100, effort: 5, quality: 94 }).toFile(resolveProjectPath(relativePath))
    return
  }
  await writer.png().toFile(resolveProjectPath(relativePath))
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[mid]
  }
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function visibleMargin(bounds) {
  return Math.min(
    bounds.minX,
    bounds.minY,
    v14Canvas.width - bounds.maxX,
    v14Canvas.height - bounds.maxY,
  )
}

function paddedBounds(bounds, padding, width, height) {
  return {
    height: Math.min(height, bounds.maxY + 1 + padding) - Math.max(0, bounds.minY - padding),
    left: Math.max(0, bounds.minX - padding),
    top: Math.max(0, bounds.minY - padding),
    width: Math.min(width, bounds.maxX + 1 + padding) - Math.max(0, bounds.minX - padding),
  }
}

async function resizeCrop(frame, crop, scale) {
  const width = Math.max(1, Math.round(crop.width * scale))
  const height = Math.max(1, Math.round(crop.height * scale))
  const { data, info } = await sharp(frame.data, {
    raw: {
      channels: 4,
      height: frame.height,
      width: frame.width,
    },
  })
    .extract(crop)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data,
    height: info.height,
    width: info.width,
  }
}

function pasteRaw(source, paste) {
  const target = Buffer.alloc(v14Canvas.width * v14Canvas.height * 4)
  for (let y = 0; y < source.height; y += 1) {
    const targetY = y + paste.y
    if (targetY < 0 || targetY >= v14Canvas.height) {
      continue
    }
    for (let x = 0; x < source.width; x += 1) {
      const targetX = x + paste.x
      if (targetX < 0 || targetX >= v14Canvas.width) {
        continue
      }
      const sourceOffset = (y * source.width + x) * 4
      const targetOffset = (targetY * v14Canvas.width + targetX) * 4
      target[targetOffset] = source.data[sourceOffset]
      target[targetOffset + 1] = source.data[sourceOffset + 1]
      target[targetOffset + 2] = source.data[sourceOffset + 2]
      target[targetOffset + 3] = source.data[sourceOffset + 3]
    }
  }
  return target
}

function blendRaw(a, b, amount) {
  const output = Buffer.alloc(a.length)
  const inverse = 1 - amount
  for (let offset = 0; offset < a.length; offset += 1) {
    output[offset] = Math.round(a[offset] * inverse + b[offset] * amount)
  }
  return output
}
