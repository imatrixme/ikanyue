const colors = {
  base: [208, 225, 91, 255],
  blush: [241, 139, 123, 235],
  cheek: [245, 199, 104, 245],
  dark: [37, 45, 30, 255],
  deepLeaf: [45, 67, 35, 255],
  deepShade: [91, 122, 40, 255],
  leafLine: [75, 101, 42, 255],
  leafLight: [231, 241, 147, 255],
  light: [249, 248, 190, 255],
  mid: [185, 207, 72, 255],
  shade: [113, 145, 48, 255],
  snack: [245, 199, 104, 255],
  snackDark: [241, 159, 77, 255],
  white: [255, 255, 246, 255],
}

export function applySproutPixelPolish(data, solidMask, info, options) {
  const bounds = maskBounds(solidMask, info)
  if (!bounds) {
    return data
  }

  const output = Buffer.from(data)
  const regions = sproutRegions(bounds)
  const phase = (options.frameIndex ?? 0) / Math.max(options.frameCount ?? 1, 1)
  paintSelectiveInnerOutline(output, solidMask, info, bounds)
  paintLeafPlanes(output, solidMask, info, regions.leaf, phase)
  paintBodyClusters(output, solidMask, info, regions.body)
  paintCommercialFace(output, solidMask, info, regions.body, options.actionId)
  paintFeetAndTufts(output, solidMask, info, regions.body)
  paintActionAccents(output, solidMask, info, regions.body, options.actionId)
  return output
}

function paintSelectiveInnerOutline(data, mask, info, bounds) {
  for (let y = bounds.minY + 1; y < bounds.maxY; y += 1) {
    for (let x = bounds.minX + 1; x < bounds.maxX; x += 1) {
      if (!isSolid(mask, info, x, y)) {
        continue
      }

      const rightEdge = !isSolid(mask, info, x + 1, y)
      const bottomEdge = !isSolid(mask, info, x, y + 1)
      const leftEdge = !isSolid(mask, info, x - 1, y)
      const topEdge = !isSolid(mask, info, x, y - 1)

      if (rightEdge || bottomEdge) {
        setPixel(data, info, x, y, colors.deepLeaf)
      } else if ((leftEdge || topEdge) && (x + y) % 3 !== 0) {
        setPixel(data, info, x, y, colors.leafLight)
      }
    }
  }
}

function paintLeafPlanes(data, mask, info, bounds, phase) {
  const leafRoot = point(bounds, 0.5, 0.1)
  const leftTip = point(bounds, 0.2, 0.18)
  const rightTip = point(bounds, 0.8, 0.18)
  const sway = Math.round(Math.sin(phase * Math.PI * 2) * 1)

  line(data, mask, info, leafRoot, { x: leftTip.x, y: leftTip.y + sway }, colors.leafLine)
  line(data, mask, info, leafRoot, { x: rightTip.x, y: rightTip.y - sway }, colors.leafLine)
  line(data, mask, info, point(bounds, 0.5, 0.17), point(bounds, 0.5, 0.31), colors.deepLeaf)

  stamp(data, mask, info, point(bounds, 0.28, 0.12), [
    ' .###  ',
    '###..  ',
    '  ..   ',
  ], colors.leafLight)
  stamp(data, mask, info, point(bounds, 0.62, 0.12), [
    '  ###. ',
    '  ..###',
    '   ..  ',
  ], colors.leafLight)
  stamp(data, mask, info, point(bounds, 0.23, 0.22), [
    '### ',
    ' ..#',
  ], colors.shade)
  stamp(data, mask, info, point(bounds, 0.72, 0.22), [
    ' ###',
    '#.. ',
  ], colors.shade)
}

function paintBodyClusters(data, mask, info, bounds) {
  stamp(data, mask, info, point(bounds, 0.27, 0.36), [
    '  ####   ',
    ' ####.## ',
    '##..  .#',
    ' .      ',
  ], colors.leafLight)
  stamp(data, mask, info, point(bounds, 0.39, 0.42), [
    ' #### ',
    '##..#',
    ' .   ',
  ], colors.light)
  stamp(data, mask, info, point(bounds, 0.55, 0.4), [
    ' ### ',
    '##.##',
    '  .. ',
  ], colors.leafLight)
  stamp(data, mask, info, point(bounds, 0.73, 0.58), [
    ' ## ',
    '####',
    ' .##',
    '  . ',
  ], colors.shade)
  stamp(data, mask, info, point(bounds, 0.76, 0.72), [
    '###',
    ' ##',
    '  #',
  ], colors.deepShade)
  stamp(data, mask, info, point(bounds, 0.36, 0.83), [
    '#####',
    ' .#. ',
  ], colors.mid)
}

function paintCommercialFace(data, mask, info, bounds, actionId) {
  const leftEye = point(bounds, 0.37, 0.36)
  const rightEye = point(bounds, 0.59, 0.36)

  cleanFaceBase(data, mask, info, bounds)
  sculptLowerFaceLight(data, mask, info, bounds)

  if (actionId === 'sleep') {
    line(
      data,
      mask,
      info,
      point(bounds, 0.36, 0.36),
      point(bounds, 0.45, 0.35),
      colors.dark,
    )
    line(
      data,
      mask,
      info,
      point(bounds, 0.58, 0.35),
      point(bounds, 0.67, 0.36),
      colors.dark,
    )
  } else if (actionId === 'weak') {
    paintEye(data, mask, info, leftEye, true)
    paintEye(data, mask, info, rightEye, true)
    line(
      data,
      mask,
      info,
      point(bounds, 0.36, 0.31),
      point(bounds, 0.44, 0.3),
      colors.deepLeaf,
    )
    line(
      data,
      mask,
      info,
      point(bounds, 0.59, 0.3),
      point(bounds, 0.67, 0.31),
      colors.deepLeaf,
    )
  } else {
    paintEye(data, mask, info, leftEye, false)
    paintEye(data, mask, info, rightEye, false)
  }

  paintMouth(data, mask, info, bounds, actionId)
  paintCheek(data, mask, info, point(bounds, 0.3, 0.5))
  paintCheek(data, mask, info, point(bounds, 0.65, 0.5))
}

function cleanFaceBase(data, mask, info, bounds) {
  const center = point(bounds, 0.5, 0.43)
  const radiusX = Math.round(bounds.width * 0.35)
  const radiusY = Math.round(bounds.height * 0.23)
  const min = { x: center.x - radiusX, y: center.y - radiusY }
  const max = { x: center.x + radiusX, y: center.y + radiusY }

  for (let y = min.y; y <= max.y; y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      if (
        !isSolid(mask, info, x, y) ||
        !isInsideEllipse(x, y, center, radiusX, radiusY)
      ) {
        continue
      }

      const current = readPixel(data, info, x, y)
      if (isFaceArtifact(current)) {
        setPixel(data, info, x, y, colors.leafLight)
      }
    }
  }
}

function sculptLowerFaceLight(data, mask, info, bounds) {
  const center = point(bounds, 0.47, 0.42)
  const radiusX = Math.round(bounds.width * 0.34)
  const radiusY = Math.round(bounds.height * 0.22)
  const min = point(bounds, 0.2, 0.39)
  const max = point(bounds, 0.77, 0.68)

  for (let y = min.y; y <= max.y; y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      if (!isSolid(mask, info, x, y)) {
        continue
      }

      const current = readPixel(data, info, x, y)
      if (!isBrightBodyColor(current)) {
        continue
      }

      const lowerFace = y > center.y + Math.round(radiusY * 0.36)
      const outsideHighlight = !isInsideEllipse(x, y, center, radiusX, radiusY)
      if (lowerFace || outsideHighlight) {
        setPixel(data, info, x, y, colors.base)
      }
    }
  }

  stamp(data, mask, info, point(bounds, 0.38, 0.41), [
    ' #### ',
    '##..#',
    ' .   ',
  ], colors.leafLight)
}

function isFaceArtifact(color) {
  const [red, green, blue, alpha] = color
  if (alpha < 150) {
    return false
  }
  return red < 120 && green < 130 && blue < 90
}

function isBrightBodyColor(color) {
  const [red, green, blue, alpha] = color
  if (alpha < 150) {
    return false
  }
  return red >= 228 && green >= 232 && blue >= 120
}

function paintEye(data, mask, info, origin, tired) {
  const eyePattern = tired
    ? [
        '####',
        '#..#',
        '####',
      ]
    : [
        ' ## ',
        '####',
        '####',
        ' ## ',
      ]
  stamp(data, mask, info, origin, eyePattern, colors.dark)
  if (!tired) {
    stamp(data, mask, info, { x: origin.x + 1, y: origin.y }, ['#'], colors.white)
    stamp(data, mask, info, { x: origin.x + 2, y: origin.y + 1 }, ['#'], colors.leafLight)
  }
}

function paintMouth(data, mask, info, bounds, actionId) {
  if (actionId === 'eating') {
    stamp(data, mask, info, point(bounds, 0.48, 0.48), [
      ' #### ',
      '######',
      ' .##. ',
    ], colors.dark)
    return
  }

  if (actionId === 'weak') {
    line(data, mask, info, point(bounds, 0.47, 0.49), point(bounds, 0.56, 0.49), colors.dark)
    return
  }

  stamp(data, mask, info, point(bounds, 0.47, 0.49), [
    '####',
    ' .# ',
  ], colors.dark)
}

function paintCheek(data, mask, info, origin) {
  stamp(data, mask, info, origin, [
    ' ###',
    '####',
    ' ## ',
  ], colors.cheek)
  stamp(data, mask, info, { x: origin.x + 1, y: origin.y + 2 }, ['#'], colors.blush)
}


function paintFeetAndTufts(data, mask, info, bounds) {
  stamp(data, mask, info, point(bounds, 0.31, 0.93), [
    '####',
    ' ## ',
  ], colors.deepLeaf)
  stamp(data, mask, info, point(bounds, 0.62, 0.93), [
    '####',
    ' ## ',
  ], colors.deepLeaf)
  line(data, mask, info, point(bounds, 0.44, 0.88), point(bounds, 0.57, 0.88), colors.deepShade)
}

function paintActionAccents(data, mask, info, bounds, actionId) {
  if (actionId === 'eating') {
    stamp(data, mask, info, point(bounds, 0.66, 0.68), [
      ' #### ',
      '######',
      ' .##. ',
    ], colors.snack)
    stamp(data, mask, info, point(bounds, 0.7, 0.71), [
      '###',
      ' # ',
    ], colors.snackDark)
  }

  if (actionId === 'clean') {
    stamp(data, mask, info, point(bounds, 0.73, 0.45), [
      ' # ',
      '###',
      ' # ',
    ], [188, 237, 220, 245])
  }

  if (actionId === 'weak') {
    line(data, mask, info, point(bounds, 0.48, 0.56), point(bounds, 0.57, 0.56), colors.deepShade)
  }
}

function sproutRegions(bounds) {
  const leafBottom = Math.round(bounds.minY + bounds.height * 0.34)
  const bodyTop = Math.round(bounds.minY + bounds.height * 0.31)

  return {
    body: {
      height: bounds.maxY - bodyTop + 1,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      minX: bounds.minX,
      minY: bodyTop,
      width: bounds.width,
    },
    leaf: {
      height: leafBottom - bounds.minY + 1,
      maxX: bounds.maxX,
      maxY: leafBottom,
      minX: bounds.minX,
      minY: bounds.minY,
      width: bounds.width,
    },
  }
}

function maskBounds(mask, info) {
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!isSolid(mask, info, x, y)) {
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

  return {
    height: maxY - minY + 1,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX + 1,
  }
}

function point(bounds, rx, ry) {
  return {
    x: Math.round(bounds.minX + bounds.width * rx),
    y: Math.round(bounds.minY + bounds.height * ry),
  }
}

function line(data, mask, info, from, to, color) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1)
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    setIfSolid(
      data,
      mask,
      info,
      Math.round(from.x + (to.x - from.x) * t),
      Math.round(from.y + (to.y - from.y) * t),
      color,
    )
  }
}

function stamp(data, mask, info, origin, rows, color) {
  for (const [rowIndex, row] of rows.entries()) {
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const marker = row[columnIndex]
      if (marker !== '#' && marker !== '.') {
        continue
      }
      const paint = marker === '.' ? colors.mid : color
      setIfSolid(data, mask, info, origin.x + columnIndex, origin.y + rowIndex, paint)
    }
  }
}

function isInsideEllipse(x, y, center, radiusX, radiusY) {
  const nx = (x - center.x) / Math.max(radiusX, 1)
  const ny = (y - center.y) / Math.max(radiusY, 1)
  return nx * nx + ny * ny <= 1
}

function setIfSolid(data, mask, info, x, y, color) {
  if (!isSolid(mask, info, x, y)) {
    return
  }
  setPixel(data, info, x, y, color)
}

function setPixel(data, info, x, y, color) {
  const index = (y * info.width + x) * 4
  data[index] = color[0]
  data[index + 1] = color[1]
  data[index + 2] = color[2]
  data[index + 3] = color[3]
}

function readPixel(data, info, x, y) {
  const index = (y * info.width + x) * 4
  return [
    data[index],
    data[index + 1],
    data[index + 2],
    data[index + 3],
  ]
}

function isSolid(mask, info, x, y) {
  if (x < 0 || y < 0 || x >= info.width || y >= info.height) {
    return false
  }
  return mask[y * info.width + x] === 1
}
