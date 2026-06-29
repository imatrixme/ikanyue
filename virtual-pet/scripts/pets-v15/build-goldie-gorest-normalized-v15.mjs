import fs from 'node:fs/promises'
import path from 'node:path'
import {
  rawActionIds,
  outputRoot,
  normalizedDir,
  reviewDir,
  resolveProjectPath,
  emptyDir,
  strategy,
} from './goldie-gorest-v15-config.mjs'
import { readIdleBaseline, normalizeAction } from './goldie-gorest-v15-normalizer.mjs'
import { writeReviewIndex } from './goldie-gorest-v15-output.mjs'

async function main() {
  await emptyDir(normalizedDir)
  await emptyDir(reviewDir)
  const idleBaseline = await readIdleBaseline()
  const results = []

  for (const actionId of rawActionIds()) {
    results.push(await normalizeAction(actionId, idleBaseline))
  }

  await writeReviewIndex(results)
  await fs.writeFile(
    resolveProjectPath(path.join(outputRoot, 'goldie-v15-gorest-summary.json')),
    `${JSON.stringify({ results, strategy }, null, 2)}\n`,
    'utf8',
  )
  console.log(`Generated Goldie V15 ${strategy} review assets.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
