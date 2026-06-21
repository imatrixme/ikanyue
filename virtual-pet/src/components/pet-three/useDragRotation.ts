import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

export interface DragRotation {
  pitch: number
  yaw: number
}

const maxPitch = 0.48
const maxYaw = 0.82

export function useDragRotation() {
  const rotationRef = useRef<DragRotation>({ pitch: -0.04, yaw: -0.18 })

  useEffect(() => {
    const handlePointerUp = () => {
      document.body.style.removeProperty('user-select')
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.userSelect = 'none'
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    const nextYaw = rotationRef.current.yaw + event.movementX * 0.008
    const nextPitch = rotationRef.current.pitch + event.movementY * 0.006
    rotationRef.current = {
      pitch: clamp(nextPitch, -maxPitch, maxPitch),
      yaw: clamp(nextYaw, -maxYaw, maxYaw),
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    document.body.style.removeProperty('user-select')
  }

  function resetRotation() {
    rotationRef.current = { pitch: -0.04, yaw: -0.18 }
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    resetRotation,
    rotationRef,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
