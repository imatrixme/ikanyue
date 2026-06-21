import { useEffect, useRef } from 'react'
import type { Condition, StageId } from '../game/types'
import { createSproutThreeScene } from '../components/pet-three/sproutScene'

const defaultFrameCount = 16
const defaultDuration = 2.4

export function SproutFrameExport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }

    const params = new URLSearchParams(window.location.search)
    const frame = parseNumber(params.get('frame'), 0)
    const frameCount = parseNumber(params.get('frames'), defaultFrameCount)
    const duration = parseNumber(params.get('duration'), defaultDuration)
    const condition = parseCondition(params.get('condition'))
    const stageId = parseStage(params.get('stage'))
    const elapsed = ((frame % frameCount) / frameCount) * duration
    const sproutScene = createSproutThreeScene(canvas, {
      preserveDrawingBuffer: true,
    })

    sproutScene.resize(canvas.width, canvas.height)
    sproutScene.renderAt({
      condition,
      elapsed,
      stageId,
    })
    window.__PET_FRAME_READY__ = true

    return () => sproutScene.teardown()
  }, [])

  return (
    <main className="frame-export-page">
      <canvas
        aria-label="Sprout frame export"
        height="640"
        ref={canvasRef}
        width="640"
      />
    </main>
  )
}

function parseNumber(value: string | null, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseCondition(value: string | null): Condition {
  if (
    value === 'clean' ||
    value === 'eating' ||
    value === 'idle' ||
    value === 'play' ||
    value === 'sleep' ||
    value === 'weak'
  ) {
    return value
  }
  return 'idle'
}

function parseStage(value: string | null): StageId {
  if (value === 'adult' || value === 'baby' || value === 'teen') {
    return value
  }
  return 'baby'
}

declare global {
  interface Window {
    __PET_FRAME_READY__?: boolean
  }
}
