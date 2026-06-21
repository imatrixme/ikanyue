import fs from 'node:fs/promises'
import path from 'node:path'
import { generatedImportPath, resolveProjectPath } from '../pets-v6/pet-sprite-v6-paths.mjs'
import {
  v10Anchor,
  v10Canvas,
  v10IdleAction,
  v10Paths,
} from './goldie-idle-config.mjs'

const manifestPath = 'src/data/generated/goldieAnimationManifest.ts'

function importName(index) {
  return `GoldieV10Idle${index}Frame`
}

function framePath(index) {
  return path.join(v10Paths.runtimeDir, `goldie-idle-${String(index).padStart(2, '0')}.webp`)
}

async function assertFrames() {
  for (let index = 1; index <= v10IdleAction.runtimeFrames; index += 1) {
    await fs.access(resolveProjectPath(framePath(index)))
  }
}

function idleImports() {
  return Array.from({ length: v10IdleAction.runtimeFrames }, (_, index) => {
    const frameIndex = index + 1
    return `import ${importName(frameIndex)} from '${generatedImportPath(framePath(frameIndex))}'`
  }).join('\n')
}

function idleBlock() {
  const frameRefs = Array.from(
    { length: v10IdleAction.runtimeFrames },
    (_, index) => importName(index + 1),
  )
  return `    idle: {
      frames: [${frameRefs.join(', ')}],
      fps: ${v10IdleAction.fps},
      loop: ${v10IdleAction.loop},
      durationMs: ${v10IdleAction.durationMs},
      canvas: { width: ${v10Canvas.width}, height: ${v10Canvas.height} },
      anchor: { x: ${v10Anchor.x}, y: ${v10Anchor.y} },
      renderStyle: 'sheet-hd',
    }`
}

function replaceIdleBlock(contents) {
  const match = contents.match(/    idle: \{[\s\S]*?\n    \},\n    eating: \{/)
  if (!match) {
    throw new Error('Could not locate Goldie idle block.')
  }
  return contents.replace(match[0], `${idleBlock()},\n    eating: {`)
}

function removeOldIdleImports(contents) {
  return contents
    .split('\n')
    .filter((line) => !/^import GoldieV(?:8|9|10|11|12|13)Idle\d+Frame /.test(line))
    .join('\n')
}

async function main() {
  await assertFrames()
  const targetPath = resolveProjectPath(manifestPath)
  const current = await fs.readFile(targetPath, 'utf8')
  const withoutOldImports = removeOldIdleImports(current)
  const withIdleBlock = replaceIdleBlock(withoutOldImports)
  const next = `${idleImports()}\n${withIdleBlock}`
  await fs.writeFile(targetPath, next)
  console.log('Applied Goldie V10 idle frames to runtime manifest.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
