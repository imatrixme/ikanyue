import fs from 'node:fs/promises'
import path from 'node:path'
import {
  actionConfigs,
  actionIds,
  animationPipeline,
  speciesIds,
} from '../pet-animation-config.mjs'
import { generatedImportPath, resolveProjectPath } from './pet-sprite-v6-paths.mjs'
import { v6Actions, v6Palette, v6Pipeline } from './pet-sprite-v6-config.mjs'

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

function manifestEntry(actionId, frameRefs, actionConfig, canvas, renderStyle) {
  const renderStyleLine = renderStyle ? `\n      renderStyle: '${renderStyle}',` : ''
  return `    ${actionId}: {
      frames: [${frameRefs.join(', ')}],
      fps: ${actionConfig.fps},
      loop: ${actionConfig.loop},
      durationMs: ${actionConfig.durationMs},
      canvas: { width: ${canvas.width}, height: ${canvas.height} },
      anchor: { x: ${actionConfig.anchor?.x ?? animationPipeline.anchor.x}, y: ${
    actionConfig.anchor?.y ?? animationPipeline.anchor.y
  } },${renderStyleLine}
    }`
}

export async function writeRuntimeManifest(generatedByKey) {
  const imports = []
  const speciesBlocks = []

  for (const speciesId of speciesIds) {
    const actionBlocks = []
    for (const actionId of actionIds) {
      const v6Action = findV6Action(speciesId, actionId)
      if (v6Action) {
        const runtimePaths = generatedByKey.get(`${speciesId}/${actionId}`)?.runtimePaths
        if (!runtimePaths) {
          throw new Error(`Missing generated V6 paths for ${speciesId}/${actionId}`)
        }
        const frameRefs = runtimePaths.map((relativePath, index) => {
          const ref = v6ImportName(speciesId, actionId, index + 1)
          imports.push(`import ${ref} from '${generatedImportPath(relativePath)}'`)
          return ref
        })
        actionBlocks.push(
          manifestEntry(
            actionId,
            frameRefs,
            v6Action,
            v6Pipeline.pixelCanvas,
            v6Pipeline.renderStyle,
          ),
        )
        continue
      }

      const frameRefs = []
      for (let index = 1; index <= animationPipeline.runtimeFramesPerAction; index += 1) {
        const relativePath = v4FramePath(speciesId, actionId, index)
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
        ),
      )
    }
    speciesBlocks.push(`  ${speciesId}: {\n${actionBlocks.join(',\n')},\n  }`)
  }

  const contents = `${imports.join('\n')}
import type { PetAnimationManifest } from '../../game/types'

export const petAnimationManifest = {
${speciesBlocks.join(',\n')}
} satisfies PetAnimationManifest
`
  await fs.writeFile(resolveProjectPath(v6Pipeline.runtimeManifestPath), contents)
}

export async function writeV6Manifest(generatedActions) {
  const manifest = {
    pixelCanvas: v6Pipeline.pixelCanvas,
    renderCanvas: v6Pipeline.renderCanvas,
    renderStyle: v6Pipeline.renderStyle,
    schemaVersion: 1,
    sourceAnchor: v6Pipeline.sourceAnchor,
    actions: generatedActions.map(({ action, rawPaths, reviewPath, runtimePaths }) => ({
      actionId: action.actionId,
      anchor: action.anchor,
      frameCount: action.frameCount,
      fps: action.fps,
      loop: action.loop,
      paletteSize: v6Palette.length,
      rawPaths,
      renderer: action.renderer,
      reviewPath,
      runtimePaths,
      speciesId: action.speciesId,
      stageId: action.stageId,
      tolerances: {
        maxBaselineStepPx: action.maxBaselineStepPx,
        maxCenterStepPx: action.maxCenterStepPx,
        maxLoopCenterStepPx: action.maxLoopCenterStepPx,
        visibleMarginPx: action.visibleMarginPx,
      },
    })),
  }
  await fs.writeFile(resolveProjectPath(v6Pipeline.manifestPath), `${JSON.stringify(manifest, null, 2)}\n`)
}
