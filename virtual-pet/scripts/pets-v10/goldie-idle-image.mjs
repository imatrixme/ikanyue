import path from 'node:path'
import sharp from 'sharp'
import { v10Anchor, v10Canvas, v10Paths, v10Sheet } from './goldie-idle-config.mjs'

const alphaThreshold = 20

export async function extractSourceFrames(sourcePath, resolveProjectPath) {
  const sheet = sharp(resolveProjectPath(sourcePath))
  const metadata = await sheet.metadata()
  const cellWidth = Math.floor((metadata.width ?? 0) / v10Sheet.columns)
  const cellHeight = Math.floor((metadata.height ?? 0) / v10Sheet.rows)
  const cellInset = Math.max(3, Math.round(Math.min(cellWidth, cellHeight) * 0.012))
  const frames = []

  for (let index = 0; index < v10Sheet.columns * v10Sheet.rows; index += 1) {
    const left = (index % v10Sheet.columns) * cellWidth + cellInset
    const top = Math.floor(index / v10Sheet.columns) * cellHeight + cellInset
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
      v10Paths.extractedDir,
      `goldie-idle-source-${String(index + 1).padStart(2, '0')}.png`,
    )
    await sharp(cleaned).png().toFile(resolveProjectPath(relativePath))
    frames.push(relativePath)
  }

  return frames
}

export async function composeRuntimeFrame(sourceFramePath, index, total, resolveProjectPath) {
  const phase = index / total
  const bob = Math.sin(phase * Math.PI * 2)
  const source = sharp(resolveProjectPath(sourceFramePath))
  const meta = await source.metadata()
  const baseScale = 2.38
  const targetWidth = Math.round((meta.width ?? 1) * baseScale)
  const targetHeight = Math.round((meta.height ?? 1) * baseScale)
  const sprite = await source
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()
  const spriteMeta = await sharp(sprite).metadata()
  const left = Math.round(v10Anchor.x - (spriteMeta.width ?? 0) / 2 + bob * 2)
  const top = Math.round(v10Anchor.y - (spriteMeta.height ?? 0) + bob * 4)

  return sharp({
    create: {
      width: v10Canvas.width,
      height: v10Canvas.height,
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
      data[offset + 1] = Math.min(data[offset + 1], Math.round((data[offset] + data[offset + 2]) / 2))
      data[offset + 3] = Math.min(data[offset + 3], 55)
    }
  }

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
  return green > 135 && green > red * 1.28 && green > blue * 1.16
}

function isGreenFringePixel(data, offset) {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return green > 92 && green > red * 1.08 && green > blue * 1.04
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
