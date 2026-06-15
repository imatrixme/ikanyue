import { useEffect, useState } from 'react'
import { getStage } from '../game/petEngine'
import type { Condition, PetSpecies, PetState } from '../game/types'

interface PetSpriteProps {
  condition: Condition
  pet: PetState
  species: PetSpecies
}

export function PetSprite({ condition, pet, species }: PetSpriteProps) {
  const stage = getStage(pet.stageId, species)
  const frames = stage.animations[condition]
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length)
    }, frameDuration(condition))

    return () => window.clearInterval(timer)
  }, [condition, frames.length, pet.stageId, pet.speciesId])

  return (
    <div className={`pet-sprite is-${condition}`} data-condition={condition}>
      <span
        aria-label={`${species.name} ${stage.name} ${condition}`}
        className="sprite-frame"
        role="img"
      >
        <img alt="" src={frames[frameIndex]} />
      </span>
    </div>
  )
}

function frameDuration(condition: Condition): number {
  if (condition === 'eating' || condition === 'play' || condition === 'clean') {
    return 160
  }
  if (condition === 'sleep' || condition === 'weak') {
    return 320
  }
  return 220
}
