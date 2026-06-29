import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  v14Actions,
  v14Canvas,
  v14RuntimeFrames,
  v14SourceFrames,
  v14Stabilization,
} from '../pets-v14/goldie-actions-v14-config.mjs'
import {
  analyzeFrame,
  bodyStepStats,
  interpolateFrames,
  readRawFrame,
  summarizeFrames,
  writeRawFrame,
} from '../pets-v14/goldie-actions-v14-stabilizer.mjs'
import {
  alphaThreshold,
  emptyDir,
  emptyFrame,
  frameCols,
  frameRows,
  maxRawScale,
  normalizedDir,
  reviewDir,
  resolveProjectPath,
  safePadding,
  strategy,
} from './goldie-gorest-v15-config.mjs'
import { writeReviewStrip, writeSheet } from './goldie-gorest-v15-output.mjs'

export async function readIdleBaseline() {
  const action = v14Actions.idle
  const frames = []
  for (let index = 1; index <= v14SourceFrames; index += 1) {
    const relativePath = path.join(
      action.sourceRuntimeDir,
      `${action.sourcePrefix}-${String(index).padStart(2, '0')}.webp`,
    )
    const frame = await readRawFrame(relativePath, resolveProjectPath)
    frames.push({ ...frame, metrics: analyzeFrame(frame) })
  }
  return summarizeFrames(frames)
}

export async function normalizeAction(actionId, idleBaseline) {
  const action = v14Actions[actionId]
  const sheet = await readCleanSheet(action.sourceSheet)
  const grid = detectGrid(sheet)
  const sourceCells = frameSourceCells(grid)
  const cells = sourceCells.map((sourceCell, index) => {
    const cell = extractCell(sheet, sourceCell)
    return {
      ...cell,
      index: index + 1,
      metrics: analyzeCell(cell, `${actionId}-${index + 1}`),
      sourceCell,
    }
  })
  const scale = actionScale(actionId, cells, idleBaseline)
  const offset = v14Stabilization.anchorOffsets[actionId] ?? { x: 0, y: 0 }
  const targetAnchor = {
    x: idleBaseline.bodyAnchor.x + offset.x,
    y: idleBaseline.bodyAnchor.y + offset.y,
  }
  const actionDir = path.join(normalizedDir, actionId)
  await emptyDir(actionDir)
  const stableFrames = []
  const framePaths = []

  for (const cell of cells) {
    const frame = await normalizeCell(actionId, cell, scale, targetAnchor)
    const framePath = path.join(actionDir, `goldie-${actionId}-${String(cell.index).padStart(2, '0')}.png`)
    await writeRawFrame(frame.data, framePath, resolveProjectPath, 'png')
    stableFrames.push(frame)
    framePaths.push(framePath)
  }

  const runtimeFrames = interpolateFrames(stableFrames, action.loop)
  const runtimePaths = await writeRuntimePreview(actionId, actionDir, runtimeFrames)
  const normalizedSheetPath = path.join(actionDir, `goldie-${actionId}-v15-normalized-sheet.png`)
  await writeSheet(stableFrames, normalizedSheetPath)
  const reviewStripPath = path.join(reviewDir, `goldie-${actionId}-v15-strip.webp`)
  await writeReviewStrip(runtimePaths, reviewStripPath)

  const meta = actionMeta({
    action,
    actionId,
    framePaths,
    grid,
    normalizedSheetPath,
    reviewStripPath,
    runtimeFrames,
    runtimePaths,
    scale,
    sheet,
    sourceCells,
    stableFrames,
    targetAnchor,
  })
  await fs.writeFile(
    resolveProjectPath(path.join(actionDir, 'pipeline-meta.json')),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf8',
  )
  return meta
}

async function normalizeCell(actionId, cell, scale, targetAnchor) {
  const sprite = await resizeCell(cell, cell.metrics.bounds, scale)
  const scaledAnchor = {
    x: (cell.metrics.bodyAnchor.x - cell.metrics.bounds.minX) * scale,
    y: (cell.metrics.bodyAnchor.y - cell.metrics.bounds.minY) * scale,
  }
  const paste = {
    x: Math.round(targetAnchor.x - scaledAnchor.x),
    y: Math.round(targetAnchor.y - scaledAnchor.y),
  }
  const data = pasteSprite(sprite, paste)
  const analysis = analyzeFrame({
    data,
    height: v14Canvas.height,
    relativePath: `${actionId}-${cell.index}`,
    width: v14Canvas.width,
  })
  return {
    data,
    height: v14Canvas.height,
    metrics: {
      afterBodyAnchor: analysis.bodyAnchor,
      afterBounds: analysis.bounds,
      beforeBodyAnchor: cell.metrics.bodyAnchor,
      beforeBounds: cell.metrics.bounds,
      paste,
      scale,
      sourceCell: cell.sourceCell,
      targetAnchor,
      visibleMargin: analysis.visibleMargin,
    },
    relativePath: `${actionId}-${cell.index}`,
    width: v14Canvas.width,
  }
}

async function writeRuntimePreview(actionId, actionDir, runtimeFrames) {
  const runtimePaths = []
  const runtimeDir = path.join(actionDir, 'runtime-preview')
  await fs.mkdir(resolveProjectPath(runtimeDir), { recursive: true })
  for (let index = 1; index <= v14RuntimeFrames; index += 1) {
    const runtimePath = path.join(runtimeDir, `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`)
    await writeRawFrame(runtimeFrames[index - 1].data, runtimePath, resolveProjectPath, 'webp')
    runtimePaths.push(runtimePath)
  }
  return runtimePaths
}

function actionMeta(params) {
  return {
    actionId: params.actionId,
    frameCount: v14SourceFrames,
    frameSize: [v14Canvas.width, v14Canvas.height],
    generationMode: 'existing-v14-forge-sheet-postprocess-only',
    gridDetection: params.grid,
    normalizedSheetPath: params.normalizedSheetPath,
    proportionPolicy: 'one_global_uniform_scale_no_per_frame_scale',
    reviewStripPath: params.reviewStripPath,
    rootAnchorPolicy: 'fixed_goldfish_body_anchor_tail_excluded',
    runtimeFrameCount: v14RuntimeFrames,
    runtimeFramePaths: params.runtimePaths,
    scale: params.scale,
    sourceCells: params.sourceCells,
    sourceSheet: params.action.sourceSheet,
    sourceSheetSize: [params.sheet.width, params.sheet.height],
    stableFramePaths: params.framePaths,
    strategy,
    targetAnchor: params.targetAnchor,
    metrics: {
      runtimeBodySteps: bodyStepStats(params.runtimeFrames, params.action.loop),
      stabilizedBodySteps: bodyStepStats(params.stableFrames, params.action.loop),
      stableFrames: params.stableFrames.map((frame, index) => ({
        ...frame.metrics,
        frame: index + 1,
      })),
    },
  }
}

async function readCleanSheet(relativePath) {
  const { data, info } = await sharp(resolveProjectPath(relativePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data: removeChroma(data),
    height: info.height,
    width: info.width,
  }
}

function removeChroma(input) {
  const output = Buffer.from(input)
  for (let offset = 0; offset < output.length; offset += 4) {
    const r = output[offset]
    const g = output[offset + 1]
    const b = output[offset + 2]
    const a = output[offset + 3]
    const magentaScore = Math.min(r, b) - g
    const hardMagenta = r > 145 && b > 145 && g < 125 && magentaScore > 34
    const softMagenta = r > 125 && b > 125 && g < 150 && magentaScore > 20

    if (hardMagenta) {
      output[offset + 3] = 0
      continue
    }

    if (softMagenta) {
      const alphaScale = Math.max(0, Math.min(1, (magentaScore - 20) / 14))
      output[offset + 3] = Math.round(a * (1 - alphaScale))
      output[offset] = Math.max(0, Math.min(255, r - Math.round(26 * alphaScale)))
      output[offset + 2] = Math.max(0, Math.min(255, b - Math.round(26 * alphaScale)))
    }
  }
  return output
}

function detectGrid(sheet) {
  const xCounts = Array.from({ length: sheet.width }, () => 0)
  const yCounts = Array.from({ length: sheet.height }, () => 0)

  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      if (sheet.data[(y * sheet.width + x) * 4 + 3] <= alphaThreshold) {
        continue
      }
      xCounts[x] += 1
      yCounts[y] += 1
    }
  }

  const xRuns = projectionRuns(xCounts, Math.max(3, Math.round(sheet.height * 0.006)), Math.max(6, Math.round(sheet.width / 160)), Math.max(12, Math.round(sheet.width / 90)))
  const yRuns = projectionRuns(yCounts, Math.max(3, Math.round(sheet.width * 0.006)), Math.max(6, Math.round(sheet.height / 160)), Math.max(12, Math.round(sheet.height / 90)))
  const xBounds = boundariesFromRuns(xRuns, frameCols, sheet.width)
  const yBounds = boundariesFromRuns(yRuns, frameRows, sheet.height)

  if (xBounds && yBounds) {
    return { mode: 'auto_detected', xBounds, xRuns, yBounds, yRuns }
  }
  return {
    mode: 'proportional_fallback',
    xBounds: proportionalBounds(sheet.width, frameCols),
    xRuns,
    yBounds: proportionalBounds(sheet.height, frameRows),
    yRuns,
  }
}

function projectionRuns(counts, threshold, mergeGap, minSize) {
  const runs = []
  let start = null
  for (let index = 0; index < counts.length; index += 1) {
    const value = counts[index]
    if (value > threshold && start === null) {
      start = index
    } else if (value <= threshold && start !== null) {
      runs.push([start, index])
      start = null
    }
  }
  if (start !== null) {
    runs.push([start, counts.length])
  }

  const merged = []
  for (const run of runs) {
    const previous = merged.at(-1)
    if (previous && run[0] - previous[1] <= mergeGap) {
      previous[1] = run[1]
    } else {
      merged.push(run)
    }
  }
  return merged.filter(([startValue, endValue]) => endValue - startValue >= minSize)
}

function boundariesFromRuns(runs, expected, size) {
  if (runs.length !== expected) {
    return null
  }
  const centers = runs.map(([startValue, endValue]) => (startValue + endValue) / 2)
  const distances = centers.slice(1).map((center, index) => center - centers[index])
  const medianDistance = median(distances)
  if (medianDistance <= 0) {
    return null
  }
  const bounds = [Math.round(centers[0] - medianDistance / 2)]
  for (let index = 0; index < centers.length - 1; index += 1) {
    bounds.push(Math.round((centers[index] + centers[index + 1]) / 2))
  }
  bounds.push(Math.round(centers.at(-1) + medianDistance / 2))
  bounds[0] = Math.max(0, bounds[0])
  bounds[bounds.length - 1] = Math.min(size, bounds.at(-1))
  return bounds.some((bound, index) => index > 0 && bound <= bounds[index - 1])
    ? null
    : bounds
}

function proportionalBounds(size, count) {
  return Array.from({ length: count + 1 }, (_, index) => Math.round((index * size) / count))
}

function frameSourceCells(grid) {
  const cells = []
  for (let row = 0; row < frameRows; row += 1) {
    for (let col = 0; col < frameCols; col += 1) {
      const x0 = grid.xBounds[col]
      const x1 = grid.xBounds[col + 1]
      const y0 = grid.yBounds[row]
      const y1 = grid.yBounds[row + 1]
      const inset = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) * 0.01))
      cells.push([x0 + inset, y0 + inset, Math.max(x0 + inset + 1, x1 - inset), Math.max(y0 + inset + 1, y1 - inset)])
    }
  }
  return cells
}

function extractCell(sheet, sourceCell) {
  const [left, top, right, bottom] = sourceCell
  const width = right - left
  const height = bottom - top
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((top + y) * sheet.width + left) * 4
    sheet.data.copy(data, y * width * 4, sourceOffset, sourceOffset + width * 4)
  }
  return { data, height, width }
}

function analyzeCell(cell, relativePath) {
  const bounds = alphaBounds(cell, relativePath)
  return {
    bodyAnchor: fishBodyAnchor(cell, bounds),
    bounds,
    height: bounds.maxY - bounds.minY + 1,
    width: bounds.maxX - bounds.minX + 1,
  }
}

function alphaBounds(cell, relativePath) {
  let minX = cell.width
  let minY = cell.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      const alpha = cell.data[(y * cell.width + x) * 4 + 3]
      if (alpha <= alphaThreshold) {
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) {
    throw new Error(`No visible pixels in ${relativePath}`)
  }
  return { maxX, maxY, minX, minY }
}

function fishBodyAnchor(cell, bounds) {
  const boxWidth = bounds.maxX - bounds.minX + 1
  const boxHeight = bounds.maxY - bounds.minY + 1
  const bodyMaxX = bounds.minX + boxWidth * v14Stabilization.bodyCutRatio
  const bodyMinY = bounds.minY + boxHeight * v14Stabilization.bodyTopTrimRatio
  const bodyMaxY = bounds.maxY - boxHeight * v14Stabilization.bodyBottomTrimRatio
  let total = 0
  let sumX = 0
  let sumY = 0

  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      const alpha = cell.data[(y * cell.width + x) * 4 + 3]
      if (alpha <= alphaThreshold || x > bodyMaxX || y < bodyMinY || y > bodyMaxY) {
        continue
      }
      total += alpha
      sumX += x * alpha
      sumY += y * alpha
    }
  }

  return total > 0
    ? { x: sumX / total, y: sumY / total }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
}

function actionScale(actionId, cells, idleBaseline) {
  const maxWidth = Math.max(...cells.map((cell) => cell.metrics.width))
  const maxHeight = Math.max(...cells.map((cell) => cell.metrics.height))
  const targetBounds = v14Stabilization.targetBounds[actionId] ?? v14Stabilization.targetBounds.default
  const targetWidth = idleBaseline.width * targetBounds.widthRatio
  const targetHeight = idleBaseline.height * targetBounds.heightRatio
  const fitScale = Math.min((v14Canvas.width - safePadding * 2) / maxWidth, (v14Canvas.height - safePadding * 2) / maxHeight)
  return Math.min(fitScale, targetWidth / maxWidth, targetHeight / maxHeight, maxRawScale)
}

async function resizeCell(cell, bounds, scale) {
  const crop = {
    height: bounds.maxY - bounds.minY + 1,
    left: bounds.minX,
    top: bounds.minY,
    width: bounds.maxX - bounds.minX + 1,
  }
  const width = Math.max(1, Math.round(crop.width * scale))
  const height = Math.max(1, Math.round(crop.height * scale))
  const { data, info } = await sharp(cell.data, {
    raw: { channels: 4, height: cell.height, width: cell.width },
  })
    .extract(crop)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, height: info.height, width: info.width }
}

function pasteSprite(sprite, paste) {
  const target = emptyFrame()
  for (let y = 0; y < sprite.height; y += 1) {
    const targetY = y + paste.y
    if (targetY < 0 || targetY >= v14Canvas.height) {
      continue
    }
    for (let x = 0; x < sprite.width; x += 1) {
      const targetX = x + paste.x
      if (targetX < 0 || targetX >= v14Canvas.width) {
        continue
      }
      const sourceOffset = (y * sprite.width + x) * 4
      const targetOffset = (targetY * v14Canvas.width + targetX) * 4
      target[targetOffset] = sprite.data[sourceOffset]
      target[targetOffset + 1] = sprite.data[sourceOffset + 1]
      target[targetOffset + 2] = sprite.data[sourceOffset + 2]
      target[targetOffset + 3] = sprite.data[sourceOffset + 3]
    }
  }
  return target
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
