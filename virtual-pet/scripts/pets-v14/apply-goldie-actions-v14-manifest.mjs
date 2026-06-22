import fs from 'node:fs/promises'
import path from 'node:path'
import { generatedImportPath, resolveProjectPath } from '../pets-v6/pet-sprite-v6-paths.mjs'
import {
  v14ActionIds,
  v14Actions,
  v14Anchor,
  v14Canvas,
  v14Paths,
  v14RuntimeFrames,
} from './goldie-actions-v14-config.mjs'

function importName(actionId, index) {
  const pascal = `goldie-v14-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function framePath(actionId, index) {
  return path.join(
    v14Paths.runtimeDir,
    `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

async function assertFrames() {
  for (const actionId of v14ActionIds) {
    for (let index = 1; index <= v14RuntimeFrames; index += 1) {
      await fs.access(resolveProjectPath(framePath(actionId, index)))
    }
  }
}

function imports() {
  return v14ActionIds
    .flatMap((actionId) =>
      Array.from({ length: v14RuntimeFrames }, (_, index) => {
        const frameIndex = index + 1
        return `import ${importName(actionId, frameIndex)} from '${generatedImportPath(framePath(actionId, frameIndex))}'`
      }),
    )
    .join('\n')
}

function actionBlock(actionId) {
  const action = v14Actions[actionId]
  const frameRefs = Array.from(
    { length: v14RuntimeFrames },
    (_, index) => importName(actionId, index + 1),
  )
  return `    ${actionId}: {
      frames: [${frameRefs.join(', ')}],
      fps: ${action.fps},
      loop: ${action.loop},
      durationMs: ${action.durationMs},
      canvas: { width: ${v14Canvas.width}, height: ${v14Canvas.height} },
      anchor: { x: ${v14Anchor.x}, y: ${v14Anchor.y} },
      renderStyle: 'sheet-hd',
    }`
}

async function main() {
  await assertFrames()
  const contents = `${imports()}
import type { PetAnimationSet } from '../../game/types'

export const goldieAnimationManifest = {
${v14ActionIds.map(actionBlock).join(',\n')}
} satisfies PetAnimationSet
`
  await fs.writeFile(resolveProjectPath(v14Paths.runtimeGoldieManifestPath), contents)
  console.log('Applied Goldie V14 action frames to runtime manifest.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
