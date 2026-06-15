import type {
  Condition,
  Food,
  FoodId,
  PetSpecies,
  PetStage,
  PetState,
  SpeciesId,
  StageId,
} from './types'

const MAX_STAT = 100
const MIN_STAT = 0
const WEAK_THRESHOLD = 28
const DECAY_CAP_HOURS = 12
const HUNGER_DECAY_PER_HOUR = 9
const MOOD_DECAY_PER_HOUR_WHEN_HUNGRY = 7
const HEALTH_DECAY_PER_HOUR_WHEN_HUNGRY = 5

export function adoptPet(
  speciesId: SpeciesId,
  now: number,
  speciesList: PetSpecies[],
): PetState {
  const species = getSpecies(speciesId, speciesList)
  const stage = species.stages[0]

  return {
    id: `${speciesId}-${now}`,
    speciesId,
    stageId: stage.id,
    growth: 0,
    hunger: 74,
    health: 92,
    mood: 78,
    adoptedAt: now,
    lastFedAt: now,
    lastTickAt: now,
  }
}

export function feedPet(
  pet: PetState,
  foodId: FoodId,
  now: number,
  speciesList: PetSpecies[],
  foods: Food[],
): PetState {
  const species = getSpecies(pet.speciesId, speciesList)
  const food = getFood(foodId, foods)
  const favoriteBoost = species.favoriteFoods.includes(food.id) ? 1.3 : 1
  const base = applyTimeDecay(pet, now, speciesList)
  const growth = base.growth + Math.round(food.growth * favoriteBoost)
  const nextStage = deriveStage(growth, species)

  return {
    ...base,
    stageId: nextStage.id,
    growth,
    hunger: clamp(base.hunger + food.hunger),
    health: clamp(base.health + 3 + (food.id === 'noodle' ? 3 : 0)),
    mood: clamp(base.mood + Math.round(food.mood * favoriteBoost)),
    lastFedAt: now,
    lastTickAt: now,
  }
}

export function applyTimeDecay(
  pet: PetState,
  now: number,
  speciesList: PetSpecies[],
): PetState {
  if (now <= pet.lastTickAt) {
    return pet
  }

  const elapsedHours = Math.min(
    (now - pet.lastTickAt) / (1000 * 60 * 60),
    DECAY_CAP_HOURS,
  )
  if (elapsedHours <= 0) {
    return pet
  }

  const hunger = clamp(pet.hunger - elapsedHours * HUNGER_DECAY_PER_HOUR)
  const hungryPressure = hunger < WEAK_THRESHOLD ? elapsedHours : 0
  const health = clamp(
    pet.health - hungryPressure * HEALTH_DECAY_PER_HOUR_WHEN_HUNGRY,
  )
  const mood = clamp(
    pet.mood - hungryPressure * MOOD_DECAY_PER_HOUR_WHEN_HUNGRY,
  )
  const species = getSpecies(pet.speciesId, speciesList)

  return {
    ...pet,
    hunger,
    health,
    mood,
    stageId: deriveStage(pet.growth, species).id,
    lastTickAt: now,
  }
}

export function deriveCondition(pet: PetState, species: PetSpecies): Condition {
  getStage(pet.stageId, species)
  if (pet.hunger < WEAK_THRESHOLD || pet.health < WEAK_THRESHOLD) {
    return 'weak'
  }
  return 'idle'
}

export function deriveStage(growth: number, species: PetSpecies): PetStage {
  const ordered = [...species.stages].sort((a, b) => a.threshold - b.threshold)
  return ordered.reduce((selected, stage) => {
    return growth >= stage.threshold ? stage : selected
  }, ordered[0])
}

export function getSpecies(
  speciesId: SpeciesId,
  speciesList: PetSpecies[],
): PetSpecies {
  const species = speciesList.find((item) => item.id === speciesId)
  if (!species) {
    throw new Error(`Unknown species: ${speciesId}`)
  }
  return species
}

export function getStage(stageId: StageId, species: PetSpecies): PetStage {
  const stage = species.stages.find((item) => item.id === stageId)
  if (!stage) {
    throw new Error(`Unknown stage: ${stageId}`)
  }
  return stage
}

function getFood(foodId: FoodId, foods: Food[]): Food {
  const food = foods.find((item) => item.id === foodId)
  if (!food) {
    throw new Error(`Unknown food: ${foodId}`)
  }
  return food
}

export function clamp(value: number): number {
  return Math.max(MIN_STAT, Math.min(MAX_STAT, Math.round(value)))
}
