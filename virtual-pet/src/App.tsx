import { useEffect, useMemo, useState } from 'react'
import { CareScreen } from './components/CareScreen'
import { SpeciesPicker } from './components/SpeciesPicker'
import { foods } from './data/foods'
import { speciesList } from './data/pets'
import {
  adoptPet,
  applyTimeDecay,
  deriveCondition,
  feedPet,
  getSpecies,
} from './game/petEngine'
import { loadSavedPet, savePet } from './game/persistence'
import type { AnimationAction, FoodId, PetState, SpeciesId } from './game/types'
import './styles/app.css'
import './styles/motion.css'
import './styles/pet-actions.css'

const TICK_MS = 10_000

function App() {
  const [pet, setPet] = useState<PetState | null>(() =>
    loadSavedPet(Date.now(), speciesList),
  )
  const [reactionUntil, setReactionUntil] = useState(0)
  const [reactionAction, setReactionAction] = useState<AnimationAction>('idle')
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (pet) {
      savePet(pet)
    }
  }, [pet])

  useEffect(() => {
    if (!pet) {
      return undefined
    }

    const timer = window.setInterval(() => {
      const now = Date.now()
      setClock(now)
      setPet((current) =>
        current ? applyTimeDecay(current, now, speciesList) : current,
      )
    }, TICK_MS)

    return () => window.clearInterval(timer)
  }, [pet])

  const species = useMemo(
    () => (pet ? getSpecies(pet.speciesId, speciesList) : null),
    [pet],
  )

  const activeCondition =
    pet && species
      ? reactionUntil > clock
        ? reactionAction
        : deriveCondition(pet, species)
      : 'idle'

  function handleAdopt(speciesId: SpeciesId) {
    const now = Date.now()
    setClock(now)
    setPet(adoptPet(speciesId, now, speciesList))
    setReactionUntil(0)
    setReactionAction('idle')
  }

  function handleFeed(foodId: FoodId) {
    const now = Date.now()
    setClock(now)
    setPet((current) => {
      if (!current) {
        return current
      }
      const updated = feedPet(current, foodId, now, speciesList, foods)
      return updated
    })
    setReactionAction('eating')
    setReactionUntil(now + 1_500)
  }

  function handleAction(action: AnimationAction) {
    const now = Date.now()
    setClock(now)
    setReactionAction(action)
    setReactionUntil(now + (action === 'sleep' ? 2_300 : 1_800))
  }

  function handleReset() {
    setPet(null)
    setReactionUntil(0)
    setReactionAction('idle')
  }

  return (
    <main className="app-shell">
      {pet && species ? (
        <CareScreen
          condition={activeCondition}
          foods={foods}
          onAdopt={handleAdopt}
          onAction={handleAction}
          onFeed={handleFeed}
          onReset={handleReset}
          pet={pet}
          species={species}
          speciesList={speciesList}
        />
      ) : (
        <SpeciesPicker onAdopt={handleAdopt} speciesList={speciesList} />
      )}
    </main>
  )
}

export default App
