import { applySproutPixelPolish } from './sprout-pixel-polish.mjs'

const bayer4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export function pixelizeRgbaData(data, info, options) {
  const { alphaThreshold, ditherStrength, outlineColor, palette } = options
  const output = Buffer.alloc(data.length)
  const solidMask = new Uint8Array(info.width * info.height)

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = y * info.width + x
      const dataIndex = pixelIndex * 4
      const alpha = data[dataIndex + 3]
      if (alpha < alphaThreshold) {
        output[dataIndex + 3] = 0
        continue
      }

      const dither =
        ((bayer4[y % 4][x % 4] / 15) - 0.5) * ditherStrength
      const color = nearestPaletteColor(
        data[dataIndex] + dither,
        data[dataIndex + 1] + dither,
        data[dataIndex + 2] + dither,
        palette,
      )
      output[dataIndex] = color[0]
      output[dataIndex + 1] = color[1]
      output[dataIndex + 2] = color[2]
      output[dataIndex + 3] = alpha < 180 ? 210 : 255

      if (alpha >= 150) {
        solidMask[pixelIndex] = 1
      }
    }
  }

  const outlined = addPixelOutline(output, solidMask, info, outlineColor)
  return applySproutPixelPolish(outlined, solidMask, info, options)
}

function nearestPaletteColor(red, green, blue, palette) {
  let bestColor = palette[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const color of palette) {
    const distance =
      (red - color[0]) ** 2 +
      (green - color[1]) ** 2 +
      (blue - color[2]) ** 2
    if (distance < bestDistance) {
      bestColor = color
      bestDistance = distance
    }
  }

  return bestColor
}

function addPixelOutline(data, solidMask, info, outlineColor) {
  const output = Buffer.from(data)

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixelIndex = y * info.width + x
      const dataIndex = pixelIndex * 4
      if (
        data[dataIndex + 3] !== 0 ||
        !touchesSolidPixel(x, y, solidMask, info)
      ) {
        continue
      }

      output[dataIndex] = outlineColor[0]
      output[dataIndex + 1] = outlineColor[1]
      output[dataIndex + 2] = outlineColor[2]
      output[dataIndex + 3] = outlineColor[3]
    }
  }

  return output
}

function touchesSolidPixel(x, y, solidMask, info) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue
      }

      const neighborX = x + offsetX
      const neighborY = y + offsetY
      if (
        neighborX < 0 ||
        neighborY < 0 ||
        neighborX >= info.width ||
        neighborY >= info.height
      ) {
        continue
      }

      if (solidMask[neighborY * info.width + neighborX] === 1) {
        return true
      }
    }
  }

  return false
}
