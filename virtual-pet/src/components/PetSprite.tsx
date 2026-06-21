import { useEffect, useState } from 'react'
import { getStage } from '../game/petEngine'
import { PetThreeScene } from './PetThreeScene'
import type {
  Condition,
  PetAnimationClip,
  PetSpecies,
  PetState,
} from '../game/types'
import type { CSSProperties } from 'react'

interface PetSpriteProps {
  condition: Condition
  pet: PetState
  species: PetSpecies
}

export function PetSprite({ condition, pet, species }: PetSpriteProps) {
  const stage = getStage(pet.stageId, species)
  const clip = stage.animations[condition]
  const usesThreePrototype =
    species.id === 'sprout' && pet.stageId !== 'baby' && !clip.renderStyle
  const renderer = usesThreePrototype ? 'three' : (clip.renderStyle ?? 'frames')
  const spriteStyle = {
    '--pet-anchor-x': `${clip.anchor.x}px`,
    '--pet-anchor-y': `${clip.anchor.y}px`,
    '--pet-canvas-height': `${clip.canvas.height}px`,
    '--pet-canvas-width': `${clip.canvas.width}px`,
  } as CSSProperties

  return (
    <div
      className={`pet-sprite is-${condition}`}
      data-condition={condition}
      data-renderer={renderer}
      style={spriteStyle}
    >
      {usesThreePrototype ? (
        <PetThreeScene
          ariaLabel={`${species.name} ${stage.name} ${condition}`}
          condition={condition}
          stageId={pet.stageId}
        />
      ) : (
        <PetSpritePlayer
          ariaLabel={`${species.name} ${stage.name} ${condition}`}
          clip={clip}
          key={`${pet.speciesId}-${pet.stageId}-${condition}`}
        />
      )}
    </div>
  )
}

interface PetSpritePlayerProps {
  ariaLabel: string
  clip: PetAnimationClip
}

function PetSpritePlayer({ ariaLabel, clip }: PetSpritePlayerProps) {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % clip.frames.length)
    }, frameDuration(clip.fps))

    return () => window.clearInterval(timer)
  }, [clip.fps, clip.frames.length])

  return (
    <span aria-label={ariaLabel} className="sprite-frame" role="img">
      <img alt="" src={clip.frames[frameIndex]} />
    </span>
  )
}

function frameDuration(fps: number): number {
  return Math.round(1000 / fps)
}
