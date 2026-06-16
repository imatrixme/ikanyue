import { getStage } from '../game/petEngine'
import type { PetSpecies, SpeciesId } from '../game/types'

interface SpeciesRailProps {
  activeSpeciesId: SpeciesId
  onAdopt: (speciesId: SpeciesId) => void
  speciesList: PetSpecies[]
}

export function SpeciesRail({
  activeSpeciesId,
  onAdopt,
  speciesList,
}: SpeciesRailProps) {
  return (
    <aside className="species-rail panel" aria-label="Pet species">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <h1>Pocket Habitat</h1>
      </div>

      <p className="rail-title">Adopt</p>
      <div className="species-list">
        {speciesList.map((species) => {
          const babyStage = getStage('baby', species)
          const isActive = species.id === activeSpeciesId

          return (
            <button
              className={`species-button ${isActive ? 'is-active' : ''}`}
              key={species.id}
              onClick={() => onAdopt(species.id)}
              type="button"
            >
              <span className="species-thumb">
                <img
                  alt=""
                  className="thumb-sprite"
                  src={babyStage.animations.idle.frames[0]}
                />
              </span>
              <span>
                <span className="species-name">{species.name}</span>
                <span className="species-trait">{species.trait}</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
