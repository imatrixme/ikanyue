import fs from 'node:fs/promises'
import path from 'node:path'
import {
  actionConfigs,
  actionIds,
  animationPipeline,
  speciesIds,
} from '../pet-animation-config.mjs'
import { generatedImportPath, resolveProjectPath } from '../pets-v6/pet-sprite-v6-paths.mjs'
import { v6Actions, v6Pipeline } from '../pets-v6/pet-sprite-v6-config.mjs'
import { actions as v8Actions, anchor, canvas, paths } from './goldie-sheet-config.mjs'

function importName(speciesId, actionId, index) {
  const pascal = `${speciesId}-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function v6ImportName(speciesId, actionId, index) {
  const pascal = `${speciesId}-v6-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function v8ImportName(actionId, index) {
  const pascal = `goldie-v8-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function v4FramePath(speciesId, actionId, index) {
  return path.join(
    animationPipeline.outputDir,
    `${speciesId}-${actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

function findV6Action(speciesId, actionId) {
  return v6Actions.find(
    (action) => action.speciesId === speciesId && action.actionId === actionId,
  )
}

function v6FramePath(action, index) {
  return path.join(
    v6Pipeline.runtimeDir,
    `${action.speciesId}-${action.stageId}-${action.actionId}-${String(index).padStart(2, '0')}.webp`,
  )
}

function goldieFramePath(actionId, index) {
  return path.join(paths.runtimeDir, `goldie-${actionId}-${String(index).padStart(2, '0')}.webp`)
}

function manifestEntry(actionId, frameRefs, actionConfig, entryCanvas, entryAnchor, renderStyle) {
  const renderStyleLine = renderStyle ? `\n      renderStyle: '${renderStyle}',` : ''
  return `    ${actionId}: {
      frames: [${frameRefs.join(', ')}],
      fps: ${actionConfig.fps},
      loop: ${actionConfig.loop},
      durationMs: ${actionConfig.durationMs},
      canvas: { width: ${entryCanvas.width}, height: ${entryCanvas.height} },
      anchor: { x: ${entryAnchor.x}, y: ${entryAnchor.y} },${renderStyleLine}
    }`
}

async function assertFrameExists(relativePath) {
  await fs.access(resolveProjectPath(relativePath))
}

async function buildGoldieManifest() {
  const imports = []
  const actionBlocks = []

  for (const actionId of actionIds) {
    const action = v8Actions[actionId]
    const frameRefs = []
    for (let index = 1; index <= action.frames; index += 1) {
      const relativePath = goldieFramePath(actionId, index)
      await assertFrameExists(relativePath)
      const ref = v8ImportName(actionId, index)
      imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
      frameRefs.push(ref)
    }
    actionBlocks.push(
      manifestEntry(actionId, frameRefs, action, canvas, anchor, 'sheet-hd'),
    )
  }

  const contents = `${imports.join('\n')}
import type { PetAnimationSet } from '../../game/types'

export const goldieAnimationManifest = {
${actionBlocks.join(',\n')}
} satisfies PetAnimationSet
`
  await fs.writeFile(resolveProjectPath(paths.runtimeGoldieManifestPath), contents)
}

async function buildMainManifest() {
  const imports = [`import { goldieAnimationManifest } from './goldieAnimationManifest'`]
  const speciesBlocks = []

  for (const speciesId of speciesIds) {
    const actionBlocks = []
    for (const actionId of actionIds) {
      const v6Action = findV6Action(speciesId, actionId)
      if (v6Action) {
        const frameRefs = []
        for (let index = 1; index <= v6Action.frameCount; index += 1) {
          const relativePath = v6FramePath(v6Action, index)
          await assertFrameExists(relativePath)
          const ref = v6ImportName(speciesId, actionId, index)
          imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
          frameRefs.push(ref)
        }
        actionBlocks.push(
          manifestEntry(
            actionId,
            frameRefs,
            v6Action,
            v6Pipeline.pixelCanvas,
            v6Action.anchor,
            v6Pipeline.renderStyle,
          ),
        )
        continue
      }

      const frameRefs = []
      for (let index = 1; index <= animationPipeline.runtimeFramesPerAction; index += 1) {
        const relativePath = v4FramePath(speciesId, actionId, index)
        await assertFrameExists(relativePath)
        const ref = importName(speciesId, actionId, index)
        imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
        frameRefs.push(ref)
      }
      actionBlocks.push(
        manifestEntry(
          actionId,
          frameRefs,
          actionConfigs[actionId],
          animationPipeline.canvas,
          animationPipeline.anchor,
        ),
      )
    }
    speciesBlocks.push(`  ${speciesId}: {\n${actionBlocks.join(',\n')},\n  }`)
  }
  speciesBlocks.push('  goldie: goldieAnimationManifest')

  const contents = `${imports.join('\n')}
import type { PetAnimationManifest } from '../../game/types'

export const petAnimationManifest = {
${speciesBlocks.join(',\n')}
} satisfies PetAnimationManifest
`
  await fs.writeFile(resolveProjectPath(paths.runtimeManifestPath), contents)
}

async function main() {
  await buildGoldieManifest()
  await buildMainManifest()
  console.log('Wrote runtime pet animation manifest with Goldie V8 frames.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
