import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoots = ['app', 'server']
const sourcePattern = /\.(?:css|ts|vue)$/
const generatedPattern = /brand\.generated\.(?:css|ts)$/
const bannedDomainPattern = /钢琴系统课程|吉他与弹唱|古典钢琴|民谣吉他|course-piano|course-guitar|hero-studio|piano-detail|instrument(?:al)? school|instrument(?:al)? course/i
const bannedPreviewPattern = /当前预览|设计预览|不会发送|不会保存|正式接入|上线前补充|coming soon|lorem ipsum/i
const imageReferencePattern = /['"](\/images\/[^'"]+)['"]/g

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(target)
    if (!sourcePattern.test(entry.name) || generatedPattern.test(entry.name)) return []
    return [target]
  }))
  return files.flat()
}

const sourceFiles = (await Promise.all(sourceRoots.map(root => collectFiles(path.join(ROOT, root))))).flat()
const violations = []
const imageReferences = new Set()
let combinedSource = ''

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  combinedSource += `\n${source}`
  if (bannedDomainPattern.test(source)) violations.push(`${path.relative(ROOT, file)} contains instrument-domain content`)
  if (bannedPreviewPattern.test(source)) violations.push(`${path.relative(ROOT, file)} contains preview or placeholder copy`)
  for (const match of source.matchAll(imageReferencePattern)) imageReferences.add(match[1])
}

for (const required of ['4-6 岁', '7-11 岁', '12-17 岁', '18-44 岁', '45 岁以上']) {
  if (!combinedSource.includes(required)) violations.push(`missing vocal life-stage coverage: ${required}`)
}

const imageDirectory = path.join(ROOT, 'public/images')
const imageFiles = (await readdir(imageDirectory)).filter(name => !name.startsWith('.'))
for (const imageFile of imageFiles) {
  if (!/^vocal-[a-z-]+\.webp$/.test(imageFile)) violations.push(`obsolete or non-vocal image asset: public/images/${imageFile}`)
  if (!imageReferences.has(`/images/${imageFile}`)) violations.push(`unreferenced image asset: public/images/${imageFile}`)
  const header = await readFile(path.join(imageDirectory, imageFile)).then(buffer => buffer.subarray(0, 12).toString('ascii'))
  if (!header.startsWith('RIFF') || !header.endsWith('WEBP')) violations.push(`image is not WebP: public/images/${imageFile}`)
}

for (const imageReference of imageReferences) {
  if (!imageFiles.includes(path.basename(imageReference))) violations.push(`missing referenced image: ${imageReference}`)
}

if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`)
  process.exitCode = 1
}
else {
  process.stdout.write(`Vocal content and image contracts passed for ${sourceFiles.length} source files and ${imageFiles.length} images.\n`)
}
