import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'
import { rawFrameRelativePath, resolveProjectPath, root } from './pet-sprite-v6-paths.mjs'
import { v6Pipeline } from './pet-sprite-v6-config.mjs'

const host = '127.0.0.1'
const port = 4178

export function startViteServer() {
  const viteExecutable = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  )
  const server = spawn(
    viteExecutable,
    ['--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: root,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  server.stdout.on('data', (chunk) => {
    const text = String(chunk)
    if (text.includes('error') || text.includes('Error')) {
      process.stdout.write(text)
    }
  })
  server.stderr.on('data', (chunk) => process.stderr.write(String(chunk)))

  return server
}

export async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const request = http.get(
        { host, path: '/', port, timeout: 500 },
        (response) => {
          response.resume()
          resolve(response.statusCode && response.statusCode < 500)
        },
      )
      request.on('error', () => resolve(false))
      request.on('timeout', () => {
        request.destroy()
        resolve(false)
      })
    })
    if (ok) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Vite dev server')
}

export async function renderRawFrames(action) {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: v6Pipeline.renderCanvas,
  })
  const rawPaths = []

  try {
    for (let index = 1; index <= action.frameCount; index += 1) {
      const rawRelativePath = rawFrameRelativePath(action, index)
      const rawPath = resolveProjectPath(rawRelativePath)
      await fs.mkdir(path.dirname(rawPath), { recursive: true })

      const url = new URL(`http://${host}:${port}/`)
      url.searchParams.set('tool', 'sprout-frame-export')
      url.searchParams.set('condition', action.actionId)
      url.searchParams.set('stage', action.stageId)
      url.searchParams.set('frame', String(index - 1))
      url.searchParams.set('frames', String(action.frameCount))
      url.searchParams.set('duration', String(action.sourceDurationSeconds))

      await page.goto(url.toString(), { waitUntil: 'networkidle' })
      const canvas = page.locator('canvas').first()
      await canvas.waitFor({ state: 'visible', timeout: 10_000 })
      await page.waitForFunction(() => window.__PET_FRAME_READY__ === true, {
        timeout: 10_000,
      })
      const dataUrl = await canvas.evaluate((element) =>
        element.toDataURL('image/png'),
      )
      const png = Buffer.from(
        dataUrl.replace(/^data:image\/png;base64,/, ''),
        'base64',
      )
      await fs.writeFile(rawPath, png)
      rawPaths.push(rawRelativePath)
    }
  } finally {
    await browser.close()
  }

  return rawPaths
}
