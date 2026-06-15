import { describe, expect, it } from 'vitest'
import { speciesList } from '../data/pets'
import { adoptPet } from './petEngine'
import { loadSavedPet, savePet } from './persistence'

const now = new Date('2026-06-14T12:00:00Z').getTime()

function storageWith(initial?: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

describe('pet persistence', () => {
  it('saves and restores a valid pet with catch-up decay', () => {
    const storage = storageWith()
    const pet = adoptPet('mochi', now, speciesList)

    savePet(pet, storage)
    const restored = loadSavedPet(
      now + 1000 * 60 * 60,
      speciesList,
      storage,
    )

    expect(restored?.speciesId).toBe('mochi')
    expect(restored?.lastTickAt).toBe(now + 1000 * 60 * 60)
    expect(restored?.hunger).toBeLessThan(pet.hunger)
  })

  it('falls back safely when saved JSON is corrupt', () => {
    const storage = storageWith({
      'virtual-pet-state': '{bad json',
    })

    expect(loadSavedPet(now, speciesList, storage)).toBeNull()
    expect(storage.getItem('virtual-pet-state')).toBeNull()
  })

  it('falls back safely for unsupported schema versions', () => {
    const storage = storageWith({
      'virtual-pet-state': JSON.stringify({ version: 99, pet: {} }),
    })

    expect(loadSavedPet(now, speciesList, storage)).toBeNull()
    expect(storage.getItem('virtual-pet-state')).toBeNull()
  })
})
