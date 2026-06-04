import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => document.body
}

if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => {
    const rects = [] as unknown as DOMRectList
    Object.defineProperties(rects, {
      item: {
        value: () => null,
      },
      length: {
        value: 0,
      },
    })
    return rects
  }
}

if (typeof Range !== 'undefined' && typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    toJSON: () => ({}),
    top: 0,
    width: 0,
    x: 0,
    y: 0,
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})
