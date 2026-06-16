import fs from 'node:fs/promises'
import path from 'node:path'
import {
  actionConfigs,
  actionIds,
  animationPipeline,
  speciesIds,
} from './pet-animation-config.mjs'
import { readSeed, renderMotionFrame } from './pet-animation-motion.mjs'
import {
  writeReviewIndex,
  writeReviewStrip,
} from './pet-animation-review.mjs'

const root = process.cwd()

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

function frameName(speciesId, actionId, index, extension) {
  const padded = String(index).padStart(2, '0')
  return `${speciesId}-${actionId}-${padded}.${extension}`
}

function seedName(speciesId, actionId) {
  return `${speciesId}-${actionId}.png`
}

async function seedFor(speciesId, actionId) {
  const filePath = resolveProjectPath(
    path.join(animationPipeline.sourceDir, seedName(speciesId, actionId)),
  )
  return readSeed(filePath)
}

async function buildAction(speciesId, actionId) {
  const seed = await seedFor(speciesId, actionId)
  const generatedPaths = []

  for (
    let index = 1;
    index <= animationPipeline.runtimeFramesPerAction;
    index += 1
  ) {
    const outputRelativePath = path.join(
      animationPipeline.outputDir,
      frameName(speciesId, actionId, index, 'webp'),
    )
    const outputPath = resolveProjectPath(outputRelativePath)
    await renderMotionFrame(seed, actionId, index - 1, outputPath)
    generatedPaths.push(outputRelativePath)
  }

  await writeReviewStrip({
    actionId,
    generatedPaths,
    resolveProjectPath,
    speciesId,
  })

  return generatedPaths
}

function importName(speciesId, actionId, index) {
  const pascal = `${speciesId}-${actionId}-${index}`
    .replace(/(^|-)([a-z0-9])/g, (_, _dash, letter) => letter.toUpperCase())
  return `${pascal}Frame`
}

function generatedImportPath(relativePath) {
  return `../../${relativePath
    .replace(/^src\//, '')
    .replaceAll(path.sep, '/')}`
}

function manifestEntry(speciesId, actionId, generatedPaths) {
  const frameRefs = generatedPaths
    .map((_, index) => importName(speciesId, actionId, index + 1))
    .join(', ')
  const config = actionConfigs[actionId]

  return `    ${actionId}: {
      frames: [${frameRefs}],
      fps: ${config.fps},
      loop: ${config.loop},
      durationMs: ${config.durationMs},
      canvas: { width: ${animationPipeline.canvas.width}, height: ${animationPipeline.canvas.height} },
      anchor: { x: ${animationPipeline.anchor.x}, y: ${animationPipeline.anchor.y} },
    }`
}

async function writeManifest(generated) {
  const imports = []
  const speciesBlocks = []

  for (const speciesId of speciesIds) {
    const actionBlocks = []

    for (const actionId of actionIds) {
      const generatedPaths = generated[speciesId][actionId]
      for (const [index, relativePath] of generatedPaths.entries()) {
        imports.push(
          `import ${importName(speciesId, actionId, index + 1)} from '${generatedImportPath(
            relativePath,
          )}'`,
        )
      }
      actionBlocks.push(manifestEntry(speciesId, actionId, generatedPaths))
    }

    speciesBlocks.push(`  ${speciesId}: {\n${actionBlocks.join(',\n')},\n  }`)
  }

  const contents = `${imports.join('\n')}
import type { PetAnimationManifest } from '../../game/types'

export const petAnimationManifest = {
${speciesBlocks.join(',\n')}
} satisfies PetAnimationManifest
`

  await fs.writeFile(resolveProjectPath(animationPipeline.manifestPath), contents)
}

async function prepareOutputDirs() {
  await fs.rm(resolveProjectPath(animationPipeline.outputDir), {
    force: true,
    recursive: true,
  })
  await fs.rm(resolveProjectPath(animationPipeline.reviewDir), {
    force: true,
    recursive: true,
  })
  await fs.mkdir(resolveProjectPath(animationPipeline.outputDir), {
    recursive: true,
  })
  await fs.mkdir(resolveProjectPath(animationPipeline.reviewDir), {
    recursive: true,
  })
  await fs.mkdir(path.dirname(resolveProjectPath(animationPipeline.manifestPath)), {
    recursive: true,
  })
}

async function main() {
  await prepareOutputDirs()

  const generated = {}
  for (const speciesId of speciesIds) {
    generated[speciesId] = {}
    for (const actionId of actionIds) {
      generated[speciesId][actionId] = await buildAction(speciesId, actionId)
    }
  }

  await writeManifest(generated)
  await writeReviewIndex(resolveProjectPath)
  const totalFrames =
    speciesIds.length * actionIds.length * animationPipeline.runtimeFramesPerAction
  console.log(`Generated ${totalFrames} seed-strip pet animation frames and review strips.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
