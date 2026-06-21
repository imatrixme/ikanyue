import path from 'node:path'
import sharp from 'sharp'
import { v9Anchor, v9Canvas, v9Paths, v9Sheet } from './goldie-idle-config.mjs'

const alphaThreshold = 20

export async function extractKeyframes(sourcePath, resolveProjectPath) {
  const source = sharp(resolveProjectPath(sourcePath))
  const sheetBuffer = await source
    .clone()
    .extract(await sheetContentBounds(source))
    .png()
    .toBuffer()
  const sheet = sharp(sheetBuffer)
  const metadata = await sheet.metadata()
  const cellWidth = Math.floor((metadata.width ?? 0) / v9Sheet.columns)
  const cellHeight = Math.floor((metadata.height ?? 0) / v9Sheet.rows)
  const cellInset = Math.max(3, Math.round(Math.min(cellWidth, cellHeight) * 0.012))
  const frames = []

  for (let index = 0; index < v9Sheet.columns * v9Sheet.rows; index += 1) {
    const left = (index % v9Sheet.columns) * cellWidth + cellInset
    const top = Math.floor(index / v9Sheet.columns) * cellHeight + cellInset
    const raw = await sheet
      .clone()
      .extract({
        height: cellHeight - cellInset * 2,
        left,
        top,
        width: cellWidth - cellInset * 2,
      })
      .png()
      .toBuffer()
    const cleaned = await trimAlpha(await removeChromaKey(raw))
    const relativePath = path.join(
      v9Paths.extractedDir,
      `goldie-idle-key-${String(index + 1).padStart(2, '0')}.png`,
    )
    await sharp(cleaned).png().toFile(resolveProjectPath(relativePath))
    frames.push(relativePath)
  }

  return frames
}

async function sheetContentBounds(source) {
  const { data, info } = await source
    .clone()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isGreenKeyPixel(data, (y * info.width + x) * 4)) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    return { height: info.height, left: 0, top: 0, width: info.width }
  }

  return {
    height: maxY - minY + 1,
    left: minX,
    top: minY,
    width: maxX - minX + 1,
  }
}

export async function composeRuntimeFrame(keyframePath, index, total, resolveProjectPath) {
  const phase = index / total
  const wave = Math.sin(phase * Math.PI * 2)
  const wave2 = Math.sin(phase * Math.PI * 4)
  const motion = {
    rotate: wave * 1.5,
    scale: 1 + wave2 * 0.01,
    x: wave * 5,
    y: wave2 * 5,
  }
  const source = sharp(resolveProjectPath(keyframePath))
  const meta = await source.metadata()
  const baseScale = 1.55
  const targetWidth = Math.round((meta.width ?? 1) * baseScale * motion.scale)
  const targetHeight = Math.round((meta.height ?? 1) * baseScale * motion.scale)
  const sprite = await source
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
  const left = Math.round(v9Anchor.x - (spriteMeta.width ?? 0) / 2 + motion.x)
  const top = Math.round(v9Anchor.y - (spriteMeta.height ?? 0) + motion.y)

  return sharp({
    create: {
      width: v9Canvas.width,
      height: v9Canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: sprite, left, top }])
    .webp({ effort: 4, quality: 92 })
    .toBuffer()
}

async function removeChromaKey(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let offset = 0; offset < data.length; offset += 4) {
    if (isGreenKeyPixel(data, offset)) {
      data[offset + 3] = 0
      continue
    }
    if (isGreenFringePixel(data, offset)) {
      data[offset + 1] = Math.round(data[offset + 1] * 0.55)
      data[offset + 3] = Math.min(data[offset + 3], 180)
    }
  }

  clearDarkBoundaryPixels(data, info)
  clearDarkLongRuns(data, info)
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

function isGreenKeyPixel(data, offset) {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return green > 170 && green > red * 1.6 && green > blue * 1.35
}

function isGreenFringePixel(data, offset) {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return green > 110 && green > red * 1.25 && green > blue * 1.12
}

function clearDarkBoundaryPixels(data, info) {
  const edgeWidth = 8
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (
        x >= edgeWidth &&
        y >= edgeWidth &&
        x < info.width - edgeWidth &&
        y < info.height - edgeWidth
      ) {
        continue
      }
      const offset = (y * info.width + x) * 4
      if (isDarkArtifactPixel(data, offset)) {
        data[offset + 3] = 0
      }
    }
  }
}

function clearDarkLongRuns(data, info) {
  clearDarkHorizontalRuns(data, info)
  clearDarkVerticalRuns(data, info)
}

function clearDarkHorizontalRuns(data, info) {
  for (let y = 0; y < info.height; y += 1) {
    let runStart = -1
    for (let x = 0; x <= info.width; x += 1) {
      const offset = x < info.width ? (y * info.width + x) * 4 : -1
      const isRunPixel = offset >= 0 && isDarkArtifactPixel(data, offset)
      if (isRunPixel && runStart < 0) {
        runStart = x
      }
      if ((!isRunPixel || x === info.width) && runStart >= 0) {
        if (x - runStart >= 18) {
          for (let clearX = runStart; clearX < x; clearX += 1) {
            data[(y * info.width + clearX) * 4 + 3] = 0
          }
        }
        runStart = -1
      }
    }
  }
}

function clearDarkVerticalRuns(data, info) {
  for (let x = 0; x < info.width; x += 1) {
    let runStart = -1
    for (let y = 0; y <= info.height; y += 1) {
      const offset = y < info.height ? (y * info.width + x) * 4 : -1
      const isRunPixel = offset >= 0 && isDarkArtifactPixel(data, offset)
      if (isRunPixel && runStart < 0) {
        runStart = y
      }
      if ((!isRunPixel || y === info.height) && runStart >= 0) {
        if (y - runStart >= 18) {
          for (let clearY = runStart; clearY < y; clearY += 1) {
            data[(clearY * info.width + x) * 4 + 3] = 0
          }
        }
        runStart = -1
      }
    }
  }
}

function isDarkArtifactPixel(data, offset) {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  const alpha = data[offset + 3]
  const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue)
  return alpha > alphaThreshold && red < 95 && green < 95 && blue < 95 && channelSpread < 45
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
      if (island.area >= 32) {
        islands.push(island)
      }
    }
  }

  islands.sort((a, b) => b.area - a.area)
  const mainArea = islands[0]?.area ?? 0
  for (const island of islands) {
    if (island.area < Math.max(32, mainArea * 0.02)) {
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
      if (data[(y * info.width + x) * 4 + 3] <= alphaThreshold) {
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
