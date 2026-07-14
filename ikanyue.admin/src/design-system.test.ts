/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const sourceRoot = path.resolve(process.cwd(), 'src')

async function collectComponentFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectComponentFiles(target)
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [target]
  }))
  return files.flat()
}

describe('brand design system', () => {
  it('defines the shared brand, typography, paragraph, shape and motion contracts', async () => {
    const entryCss = await readFile(path.join(sourceRoot, 'index.css'), 'utf8')
    const css = await readFile(path.join(sourceRoot, 'styles/brand.generated.css'), 'utf8')

    expect(entryCss).toContain('@import "./styles/brand.generated.css";')
    expect(css).toContain('--primary: #00754a;')
    expect(css).toContain('--primary-hover: #006241;')
    expect(css).toContain('--foreground: #31443e;')
    expect(css).toContain('--ky-font-size-body: 0.875rem;')
    expect(css).toContain('--ky-paragraph-line-height: var(--ky-line-height-body);')
    expect(css).toContain('--ky-prose-measure: 68ch;')
    expect(css).toContain('--ky-space-unit: 0.25rem;')
    expect(css).toContain('--ky-radius-md: 0.375rem;')
    expect(css).toContain('--ky-shadow-sm:')
    expect(css).toContain('--ky-motion-fast: 160ms;')
    expect(css).toContain('@theme inline')
    expect(css).not.toMatch(/oklch\(/)
  })

  it('prevents component code from bypassing theme colors and typography', async () => {
    const files = await collectComponentFiles(sourceRoot)

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i)
      expect(source, file).not.toMatch(/(?:bg|text|border|shadow)-(?:black|white|red|green|blue|amber|gray|slate|zinc|neutral|stone)\b/)
      expect(source, file).not.toMatch(/text-\[[0-9]+px\]|tracking-(?:tight|tighter|wide|wider|widest)/)
    }
  })
})
