import { clearSavedPet } from '../game/persistence'
import { getStage } from '../game/petEngine'
import type {
  AnimationAction,
  Condition,
  Food,
  FoodId,
  PetSpecies,
  PetState,
  SpeciesId,
} from '../game/types'
import { PetSprite } from './PetSprite'
import { SpeciesRail } from './SpeciesRail'
import { StatusPanel } from './StatusPanel'

interface CareScreenProps {
  condition: Condition
  foods: Food[]
  onAdopt: (speciesId: SpeciesId) => void
  onAction: (action: AnimationAction) => void
  onFeed: (foodId: FoodId) => void
  onReset: () => void
  pet: PetState
  species: PetSpecies
  speciesList: PetSpecies[]
}

export function CareScreen({
  condition,
  foods,
  onAdopt,
  onAction,
  onFeed,
  onReset,
  pet,
  species,
  speciesList,
}: CareScreenProps) {
  const stage = getStage(pet.stageId, species)

  function resetPet() {
    clearSavedPet()
    onReset()
  }

  return (
    <div className="app-frame">
      <SpeciesRail
        activeSpeciesId={pet.speciesId}
        onAdopt={onAdopt}
        speciesList={speciesList}
      />

      <section className="habitat panel" aria-labelledby="pet-name">
        <header className="habitat-header">
          <div>
            <h2 className="pet-name" id="pet-name">
              {species.name}
            </h2>
            <p className="stage-label">{stage.name}</p>
          </div>
          <button
            aria-label="Reset saved pet"
            className="reset-button"
            onClick={resetPet}
            title="Reset saved pet"
            type="button"
          >
            ↺
          </button>
        </header>

        <div className="stage" aria-label={`${species.name} habitat`}>
          <PetSprite condition={condition} pet={pet} species={species} />
        </div>

        <div className="food-bar" aria-label="Food controls">
          {foods.map((food) => (
            <button
              className="food-button"
              key={food.id}
              onClick={() => onFeed(food.id)}
              type="button"
            >
              <span className="food-icon" aria-hidden="true">
                {food.icon}
              </span>
              <span>
                <span className="food-name">Feed {food.name}</span>
                <span className="food-effect">
                  +{food.hunger} hunger · +{food.growth} growth
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="action-bar" aria-label="Pet action controls">
          <button
            className="action-button"
            onClick={() => onAction('play')}
            type="button"
          >
            Play
          </button>
          <button
            className="action-button"
            onClick={() => onAction('clean')}
            type="button"
          >
            Clean
          </button>
          <button
            className="action-button"
            onClick={() => onAction('sleep')}
            type="button"
          >
            Rest
          </button>
        </div>
      </section>

      <StatusPanel pet={pet} />
    </div>
  )
}
