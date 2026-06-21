import { useEffect, useRef } from 'react'
import type { Condition, StageId } from '../game/types'
import { createSproutThreeScene } from './pet-three/sproutScene'
import { useDragRotation } from './pet-three/useDragRotation'

interface PetThreeSceneProps {
  ariaLabel: string
  condition: Condition
  stageId: StageId
}

export function PetThreeScene({
  ariaLabel,
  condition,
  stageId,
}: PetThreeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const conditionRef = useRef(condition)
  const stageRef = useRef(stageId)
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetRotation,
    rotationRef,
  } = useDragRotation()

  useEffect(() => {
    conditionRef.current = condition
  }, [condition])

  useEffect(() => {
    stageRef.current = stageId
  }, [stageId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }
    const activeCanvas = canvas

    const sproutScene = createSproutThreeScene(activeCanvas)

    let frameId = 0
    const startedAt = performance.now()

    function resize() {
      const { clientHeight, clientWidth } = activeCanvas
      if (
        activeCanvas.width !== clientWidth ||
        activeCanvas.height !== clientHeight
      ) {
        sproutScene.resize(clientWidth, clientHeight)
      }
    }

    function renderFrame() {
      resize()
      const elapsed = (performance.now() - startedAt) / 1000
      sproutScene.renderAt({
        condition: conditionRef.current,
        elapsed,
        pitch: rotationRef.current.pitch,
        stageId: stageRef.current,
        yaw: rotationRef.current.yaw,
      })
      frameId = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()

    return () => {
      window.cancelAnimationFrame(frameId)
      sproutScene.teardown()
    }
  }, [rotationRef])

  return (
    <canvas
      aria-label={ariaLabel}
      className="three-pet-canvas"
      data-renderer="three"
      onDoubleClick={resetRotation}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={canvasRef}
      role="img"
    />
  )
}
