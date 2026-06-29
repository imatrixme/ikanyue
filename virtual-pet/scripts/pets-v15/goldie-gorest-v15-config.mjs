import fs from 'node:fs/promises'
import path from 'node:path'
import {
  v14ActionIds,
  v14Actions,
  v14Canvas,
} from '../pets-v14/goldie-actions-v14-config.mjs'

export const root = process.cwd()
export const outputRoot = 'assets-src/pets/v15'
export const reviewDir = path.join(outputRoot, 'review')
export const normalizedDir = path.join(outputRoot, 'normalized')
export const frameRows = 4
export const frameCols = 8
export const alphaThreshold = 24
export const safePadding = 28
export const maxRawScale = 3.3
export const strategy = 'gorest-style-auto-grid-fixed-fish-body-anchor-v1'

export function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

export async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

export function rawActionIds() {
  return v14ActionIds.filter((actionId) => v14Actions[actionId].sourceType === 'forge')
}

export function emptyFrame() {
  return Buffer.alloc(v14Canvas.width * v14Canvas.height * 4)
}
