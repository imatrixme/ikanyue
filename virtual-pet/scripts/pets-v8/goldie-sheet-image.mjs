import path from 'node:path'
import sharp from 'sharp'
import {
  alphaThreshold,
  anchor,
  canvas,
  paths,
  sheetGrid,
} from './goldie-sheet-config.mjs'

export function poseBounds(pose) {
  if (pose.manual) {
    return pose.manual
  }

  const rowTop = sheetGrid.rowTops[pose.row]
  const sectionLeft = pose.col < 3 ? 0 : sheetGrid.splitX
  const sectionWidth = pose.col < 3 ? sheetGrid.splitX : sheetGrid.width - sheetGrid.splitX
  const colWidth = sectionWidth / 3
  const localCol = pose.col % 3
  const left = Math.round(sectionLeft + localCol * colWidth + (colWidth - pose.width) / 2)
  const top = Math.round(rowTop + (sheetGrid.rowHeight - pose.height) / 2)
  return { left, top, width: pose.width, height: pose.height }
}

export async function extractPose(source, poseId, pose, resolveProjectPath) {
  const bounds = poseBounds(pose)
  const extracted = await source.clone().extract(bounds).png().toBuffer()
  const transparent = await removeWhiteBackground(extracted)
  const trimmed = await trimAlpha(transparent)
  const outPath = path.join(paths.extractedDir, `goldie-${poseId}.png`)
  await sharp(trimmed).png().toFile(resolveProjectPath(outPath))
  return { bounds, path: outPath }
}

export async function composeFrame(posePath, actionId, frameIndex, frameCount, resolveProjectPath) {
  const motion = motionFor(actionId, frameIndex, frameCount)
  const poseImage = sharp(resolveProjectPath(posePath))
  const metadata = await poseImage.metadata()
  const maxPoseSide = Math.max(metadata.width ?? 1, metadata.height ?? 1)
  const baseScale = actionId === 'play' || actionId === 'clean' ? 2.22 : 2.36
  const targetWidth = Math.round((metadata.width ?? maxPoseSide) * baseScale * motion.scale)
  const targetHeight = Math.round((metadata.height ?? maxPoseSide) * baseScale * motion.scale)
  const sprite = await poseImage
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
    })
    .rotate(motion.rotate, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  const spriteMeta = await sharp(sprite).metadata()
  const left = Math.round(anchor.x - (spriteMeta.width ?? 0) / 2 + motion.x)
  const top = Math.round(anchor.y - (spriteMeta.height ?? 0) + motion.y)

  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: sprite, left, top }])
    .webp({ effort: 4, quality: 92 })
    .toBuffer()
}

async function removeWhiteBackground(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  clearBackgroundFromEdges(data, info)
  removeSheetRuleLines(data, info)
  clearCropEdges(data, info)
  clearBottomRuleRemnants(data, info)
  keepMainAlphaIslands(data, info)

  return sharp(data, {
    raw: {
      channels: 4,
      height: info.height,
      width: info.width,
    },
  })
    .png()
    .toBuffer()
}

function removeSheetRuleLines(data, info) {
  removeRuleRuns(data, info, 'horizontal')
  removeRuleRuns(data, info, 'vertical')

  for (let y = 0; y < info.height; y += 1) {
    let rulePixels = 0
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4
      if (isRuleLinePixel(data, index)) {
        rulePixels += 1
      }
    }
    if (rulePixels > info.width * 0.45) {
      clearRow(data, info, y)
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    let rulePixels = 0
    for (let y = 0; y < info.height; y += 1) {
      const index = (y * info.width + x) * 4
      if (isRuleLinePixel(data, index)) {
        rulePixels += 1
      }
    }
    if (rulePixels > info.height * 0.45) {
      clearColumn(data, info, x)
    }
  }
}

function removeRuleRuns(data, info, direction) {
  const outerLength = direction === 'horizontal' ? info.height : info.width
  const innerLength = direction === 'horizontal' ? info.width : info.height

  for (let outer = 0; outer < outerLength; outer += 1) {
    let runStart = -1
    for (let inner = 0; inner <= innerLength; inner += 1) {
      const offset =
        direction === 'horizontal'
          ? outer * info.width + inner
          : inner * info.width + outer
      const isRun =
        inner < innerLength && isRuleRunPixel(data, offset * 4)

      if (isRun && runStart < 0) {
        runStart = inner
      }
      if ((!isRun || inner === innerLength) && runStart >= 0) {
        const runEnd = inner - 1
        if (runEnd - runStart + 1 >= 16) {
          clearRuleRun(data, info, direction, outer, runStart, runEnd)
        }
        runStart = -1
      }
    }
  }
}

function clearRuleRun(data, info, direction, outer, runStart, runEnd) {
  for (let inner = runStart; inner <= runEnd; inner += 1) {
    const offset =
      direction === 'horizontal'
        ? outer * info.width + inner
        : inner * info.width + outer
    data[offset * 4 + 3] = 0
  }
}

function isRuleRunPixel(data, index) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const alpha = data[index + 3]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const average = (red + green + blue) / 3
  return alpha > 0 && max - min < 30 && average > 105 && average < 248
}

function isRuleLinePixel(data, index) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const alpha = data[index + 3]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const average = (red + green + blue) / 3
  return alpha > 0 && max - min < 16 && average > 120 && average < 235
}

function clearCropEdges(data, info) {
  const edge = 6
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const nearEdge =
        x < edge ||
        y < edge ||
        x >= info.width - edge ||
        y >= info.height - edge
      if (!nearEdge) {
        continue
      }

      const index = (y * info.width + x) * 4
      if (isBackgroundRemnant(data, index)) {
        data[index + 3] = 0
      }
    }
  }
}

function clearBottomRuleRemnants(data, info) {
  const startY = Math.max(0, info.height - 42)
  for (let y = startY; y < info.height; y += 1) {
    let runStart = -1
    for (let x = 0; x <= info.width; x += 1) {
      const isLine =
        x < info.width && isHorizontalBaselinePixel(data, (y * info.width + x) * 4)
      if (isLine && runStart < 0) {
        runStart = x
      }
      if ((!isLine || x === info.width) && runStart >= 0) {
        const runEnd = x - 1
        if (runEnd - runStart + 1 > 18) {
          for (let clearX = runStart; clearX <= runEnd; clearX += 1) {
            data[(y * info.width + clearX) * 4 + 3] = 0
          }
        }
        runStart = -1
      }
    }
  }
}

function isHorizontalBaselinePixel(data, index) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const alpha = data[index + 3]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return alpha > 12 && max - min < 52 && max > 70 && max < 248
}

function isBackgroundRemnant(data, index) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const alpha = data[index + 3]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return alpha > 0 && max > 220 && max - min < 36
}

function clearBackgroundFromEdges(data, info) {
  const visited = new Uint8Array(info.width * info.height)
  const stack = []

  for (let x = 0; x < info.width; x += 1) {
    stack.push(x)
    stack.push((info.height - 1) * info.width + x)
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    stack.push(y * info.width)
    stack.push(y * info.width + info.width - 1)
  }

  while (stack.length > 0) {
    const offset = stack.pop()
    if (offset === undefined || visited[offset]) {
      continue
    }
    visited[offset] = 1

    const index = offset * 4
    if (!canFloodBackground(data, index)) {
      continue
    }

    if (data[index + 3] > 0) {
      data[index + 3] = 0
    }

    const x = offset % info.width
    const y = Math.floor(offset / info.width)
    if (x > 0) stack.push(offset - 1)
    if (x < info.width - 1) stack.push(offset + 1)
    if (y > 0) stack.push(offset - info.width)
    if (y < info.height - 1) stack.push(offset + info.width)
  }
}

function canFloodBackground(data, index) {
  const alpha = data[index + 3]
  if (alpha <= alphaThreshold) {
    return true
  }
  return isOuterPaperPixel(data, index) || isRuleLinePixel(data, index)
}

function isOuterPaperPixel(data, index) {
  const red = data[index]
  const green = data[index + 1]
  const blue = data[index + 2]
  const alpha = data[index + 3]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return alpha > 0 && max > 242 && min > 232 && max - min < 16
}

function keepMainAlphaIslands(data, info) {
  const visited = new Uint8Array(info.width * info.height)
  const keep = new Uint8Array(info.width * info.height)
  const islands = []

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = y * info.width + x
      if (visited[offset] || data[offset * 4 + 3] <= alphaThreshold) {
        continue
      }
      const island = collectIsland(data, info, visited, x, y)
      if (island.area >= 18) {
        islands.push(island)
      }
    }
  }

  islands.sort((a, b) => b.area - a.area)
  const mainArea = islands[0]?.area ?? 0
  for (const island of islands) {
    if (island.area < Math.max(18, mainArea * 0.035)) {
      continue
    }
    for (const offset of island.offsets) {
      keep[offset] = 1
    }
  }

  for (let offset = 0; offset < keep.length; offset += 1) {
    if (!keep[offset]) {
      data[offset * 4 + 3] = 0
    }
  }
}

function collectIsland(data, info, visited, startX, startY) {
  const stack = [startY * info.width + startX]
  const offsets = []
  let area = 0

  while (stack.length > 0) {
    const offset = stack.pop()
    if (offset === undefined || visited[offset]) {
      continue
    }
    visited[offset] = 1
    if (data[offset * 4 + 3] <= alphaThreshold) {
      continue
    }

    offsets.push(offset)
    area += 1
    const x = offset % info.width
    const y = Math.floor(offset / info.width)

    if (x > 0) stack.push(offset - 1)
    if (x < info.width - 1) stack.push(offset + 1)
    if (y > 0) stack.push(offset - info.width)
    if (y < info.height - 1) stack.push(offset + info.width)
  }

  return { area, offsets }
}

async function trimAlpha(buffer) {
  const { data, info } = await sharp(buffer)
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
    return buffer
  }

  return sharp(buffer)
    .extract({
      height: maxY - minY + 1,
      left: minX,
      top: minY,
      width: maxX - minX + 1,
    })
    .png()
    .toBuffer()
}

function motionFor(actionId, frameIndex, frameCount) {
  const phase = frameIndex / frameCount
  const wave = Math.sin(phase * Math.PI * 2)
  const wave2 = Math.sin(phase * Math.PI * 4)
  const common = {
    rotate: wave * 1.8,
    scale: 1 + wave2 * 0.012,
    x: wave * 5,
    y: wave2 * 5,
  }

  if (actionId === 'eating') {
    return { rotate: wave * 1.2, scale: 1 + Math.max(0, wave) * 0.025, x: wave * 3, y: -Math.abs(wave) * 6 }
  }
  if (actionId === 'play') {
    return { rotate: wave * 7, scale: 1 + wave2 * 0.02, x: wave * 22, y: wave2 * 14 }
  }
  if (actionId === 'clean') {
    return { rotate: wave * 5, scale: 1, x: wave * 12, y: 0 }
  }
  if (actionId === 'sleep') {
    return { rotate: -5 + wave * 1.4, scale: 0.95 + wave2 * 0.006, x: wave * 2, y: 7 + wave2 * 2 }
  }
  if (actionId === 'weak') {
    return { rotate: wave * 3.5, scale: 0.92 + wave2 * 0.006, x: wave * 3, y: 8 + Math.abs(wave) * 3 }
  }
  return common
}

function clearRow(data, info, y) {
  for (let x = 0; x < info.width; x += 1) {
    data[(y * info.width + x) * 4 + 3] = 0
  }
}

function clearColumn(data, info, x) {
  for (let y = 0; y < info.height; y += 1) {
    data[(y * info.width + x) * 4 + 3] = 0
  }
}
