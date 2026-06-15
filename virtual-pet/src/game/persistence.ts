import { applyTimeDecay, getSpecies } from './petEngine'
import type { PetSpecies, PetState } from './types'

const STORAGE_KEY = 'virtual-pet-state'
const STORAGE_VERSION = 1

interface StoredPetState {
  version: number
  pet: PetState
}

export function loadSavedPet(
  now: number,
  speciesList: PetSpecies[],
  storage: Storage = window.localStorage,
): PetState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<StoredPetState>
    if (parsed.version !== STORAGE_VERSION || !isValidPet(parsed.pet)) {
      storage.removeItem(STORAGE_KEY)
      return null
    }

    getSpecies(parsed.pet.speciesId, speciesList)
    return applyTimeDecay(parsed.pet, now, speciesList)
  } catch {
    storage.removeItem(STORAGE_KEY)
    return null
  }
}

export function savePet(
  pet: PetState,
  storage: Storage = window.localStorage,
): void {
  const payload: StoredPetState = {
    version: STORAGE_VERSION,
    pet,
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function clearSavedPet(storage: Storage = window.localStorage): void {
  storage.removeItem(STORAGE_KEY)
}

function isValidPet(value: unknown): value is PetState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.speciesId === 'string' &&
    typeof candidate.stageId === 'string' &&
    isFiniteNumber(candidate.growth) &&
    isFiniteNumber(candidate.hunger) &&
    isFiniteNumber(candidate.health) &&
    isFiniteNumber(candidate.mood) &&
    isFiniteNumber(candidate.adoptedAt) &&
    isFiniteNumber(candidate.lastFedAt) &&
    isFiniteNumber(candidate.lastTickAt)
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
