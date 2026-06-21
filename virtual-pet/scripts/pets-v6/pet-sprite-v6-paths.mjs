import path from 'node:path'
import { v6Pipeline } from './pet-sprite-v6-config.mjs'

export const root = process.cwd()

export function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

export function frameBaseName(action, index, extension) {
  const padded = String(index).padStart(2, '0')
  return `${action.speciesId}-${action.stageId}-${action.actionId}-${padded}.${extension}`
}

export function rawFrameRelativePath(action, index) {
  return path.join(
    v6Pipeline.rawDir,
    action.speciesId,
    action.stageId,
    action.actionId,
    frameBaseName(action, index, 'png'),
  )
}

export function runtimeFrameRelativePath(action, index) {
  return path.join(v6Pipeline.runtimeDir, frameBaseName(action, index, 'webp'))
}

export function reviewStripName(action) {
  return `${action.speciesId}-${action.stageId}-${action.actionId}-v6-pixel-strip.webp`
}

export function generatedImportPath(relativePath) {
  return `../../${relativePath.replace(/^src\//, '').replaceAll(path.sep, '/')}`
}
