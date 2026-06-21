import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { actions, paths, poses } from './goldie-sheet-config.mjs'
import { composeFrame, extractPose } from './goldie-sheet-image.mjs'
import {
  writeManifest,
  writeReviewIndex,
  writeReviewStrip,
} from './goldie-sheet-output.mjs'

const root = process.cwd()
const clipboardSource =
  '/var/folders/k1/bgbnqx9j7bvd297ypfnp30s00000gn/T/codex-clipboard-29aQ45.png'

function resolveProjectPath(relativePath) {
  return path.join(root, relativePath)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveSourceInput() {
  if (process.env.GOLDIE_SHEET_SOURCE) {
    return process.env.GOLDIE_SHEET_SOURCE
  }
  const repoSource = resolveProjectPath(path.join(paths.sourceDir, 'goldie-sheet.png'))
  if (await fileExists(repoSource)) {
    return repoSource
  }
  return clipboardSource
}

async function emptyDir(relativePath) {
  await fs.rm(resolveProjectPath(relativePath), { force: true, recursive: true })
  await fs.mkdir(resolveProjectPath(relativePath), { recursive: true })
}

async function prepareDirs(sourceInput) {
  await fs.mkdir(resolveProjectPath(paths.sourceDir), { recursive: true })
  await fs.mkdir(path.dirname(resolveProjectPath(paths.manifestPath)), {
    recursive: true,
  })
  await emptyDir(paths.runtimeDir)
  await emptyDir(paths.extractedDir)
  await emptyDir(paths.reviewDir)
  const targetSource = resolveProjectPath(path.join(paths.sourceDir, 'goldie-sheet.png'))
  if (path.resolve(sourceInput) !== path.resolve(targetSource)) {
    await fs.copyFile(sourceInput, targetSource)
  }
}

function framePose(action, frameIndex) {
  const phase = frameIndex / Math.max(action.frames - 1, 1)
  const posePosition = phase * (action.poses.length - 1)
  const index = Math.min(Math.round(posePosition), action.poses.length - 1)
  return action.poses[index]
}

async function writeActionFrames(extracted) {
  const generated = new Map()
  for (const [actionId, action] of Object.entries(actions)) {
    const pathsForAction = []
    for (let frameIndex = 0; frameIndex < action.frames; frameIndex += 1) {
      const poseId = framePose(action, frameIndex)
      const frame = await composeFrame(
        extracted.get(poseId).path,
        actionId,
        frameIndex,
        action.frames,
        resolveProjectPath,
      )
      const relativePath = path.join(
        paths.runtimeDir,
        `goldie-${actionId}-${String(frameIndex + 1).padStart(2, '0')}.webp`,
      )
      await fs.writeFile(resolveProjectPath(relativePath), frame)
      pathsForAction.push(relativePath)
    }
    generated.set(actionId, pathsForAction)
  }
  return generated
}

async function main() {
  const sourceInput = await resolveSourceInput()
  await prepareDirs(sourceInput)
  const source = sharp(sourceInput)
  const extracted = new Map()
  for (const [poseId, pose] of Object.entries(poses)) {
    extracted.set(poseId, await extractPose(source, poseId, pose, resolveProjectPath))
  }
  const generated = await writeActionFrames(extracted)
  for (const [actionId, framePaths] of generated) {
    await writeReviewStrip(actionId, framePaths, resolveProjectPath)
  }
  await writeReviewIndex(resolveProjectPath)
  await writeManifest(generated, extracted, resolveProjectPath)
  console.log(`Generated Goldie V8 sheet sprites from ${sourceInput}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
