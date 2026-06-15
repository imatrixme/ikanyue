import { getStage } from '../game/petEngine'
import type { PetSpecies, SpeciesId } from '../game/types'

interface SpeciesPickerProps {
  onAdopt: (speciesId: SpeciesId) => void
  speciesList: PetSpecies[]
}

export function SpeciesPicker({ onAdopt, speciesList }: SpeciesPickerProps) {
  return (
    <section className="adoption-screen" aria-labelledby="adoption-title">
      <div className="adoption-panel panel">
        <header className="adoption-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <h1 id="adoption-title">Pocket Habitat</h1>
          </div>
          <p>Choose a companion, feed it well, and watch it grow.</p>
        </header>

        <div className="adoption-grid">
          {speciesList.map((species) => {
            const stage = getStage('baby', species)
            return (
              <article className="adoption-card" key={species.id}>
                <img
                  alt={`${species.name} preview`}
                  className="preview-sprite"
                  src={stage.animations.idle[0]}
                />
                <h2>{species.name}</h2>
                <p>{species.trait}</p>
                <button
                  className="primary-button"
                  onClick={() => onAdopt(species.id)}
                  type="button"
                >
                  Adopt {species.name}
                </button>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
