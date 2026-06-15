import { describe, expect, it } from 'vitest'
import { foods } from '../data/foods'
import { petFrameManifest } from '../data/petFrameManifest'
import { speciesList } from '../data/pets'
import {
  adoptPet,
  applyTimeDecay,
  deriveCondition,
  feedPet,
  getSpecies,
} from './petEngine'

const now = new Date('2026-06-14T12:00:00Z').getTime()

describe('pet engine', () => {
  it('provides six multi-frame actions for every species', () => {
    for (const species of speciesList) {
      const animations = petFrameManifest[species.id]
      expect(Object.keys(animations).sort()).toEqual([
        'clean',
        'eating',
        'idle',
        'play',
        'sleep',
        'weak',
      ])
      for (const frames of Object.values(animations)) {
        expect(frames).toHaveLength(4)
      }
    }
  })

  it('creates a configured adopted pet', () => {
    const pet = adoptPet('sprout', now, speciesList)

    expect(pet.speciesId).toBe('sprout')
    expect(pet.stageId).toBe('baby')
    expect(pet.hunger).toBeGreaterThan(0)
    expect(pet.lastTickAt).toBe(now)
  })

  it('feeding improves stats and growth', () => {
    const pet = adoptPet('sprout', now, speciesList)
    const hungryPet = { ...pet, hunger: 40, mood: 50, growth: 0 }
    const fed = feedPet(
      hungryPet,
      'berry',
      now + 1_000,
      speciesList,
      foods,
    )

    expect(fed.hunger).toBeGreaterThan(hungryPet.hunger)
    expect(fed.mood).toBeGreaterThan(hungryPet.mood)
    expect(fed.growth).toBeGreaterThan(hungryPet.growth)
    expect(fed.lastFedAt).toBe(now + 1_000)
  })

  it('advances stages from accumulated growth', () => {
    const pet = adoptPet('pebble', now, speciesList)
    const almostTeen = { ...pet, growth: 92 }
    const fedTeen = feedPet(
      almostTeen,
      'spark',
      now + 1_000,
      speciesList,
      foods,
    )

    expect(fedTeen.stageId).toBe('teen')

    const almostAdult = { ...fedTeen, growth: 232 }
    const fedAdult = feedPet(
      almostAdult,
      'spark',
      now + 2_000,
      speciesList,
      foods,
    )

    expect(fedAdult.stageId).toBe('adult')
  })

  it('keeps mature pets playable after the final stage', () => {
    const pet = {
      ...adoptPet('mochi', now, speciesList),
      stageId: 'adult' as const,
      growth: 260,
      hunger: 50,
    }
    const fed = feedPet(pet, 'noodle', now + 1_000, speciesList, foods)

    expect(fed.stageId).toBe('adult')
    expect(fed.hunger).toBeGreaterThan(pet.hunger)
    expect(fed.growth).toBeGreaterThan(pet.growth)
  })

  it('applies elapsed-time weakening after neglect', () => {
    const pet = adoptPet('sprout', now, speciesList)
    const neglected = applyTimeDecay(
      { ...pet, hunger: 24, health: 80, mood: 80 },
      now + 1000 * 60 * 60 * 3,
      speciesList,
    )

    expect(neglected.hunger).toBeLessThan(24)
    expect(neglected.health).toBeLessThan(80)
    expect(neglected.mood).toBeLessThan(80)
  })

  it('derives weak state from low hunger or health', () => {
    const species = getSpecies('sprout', speciesList)
    const pet = adoptPet('sprout', now, speciesList)

    expect(deriveCondition({ ...pet, hunger: 20 }, species)).toBe('weak')
    expect(deriveCondition({ ...pet, health: 20 }, species)).toBe('weak')
    expect(deriveCondition({ ...pet, hunger: 80, health: 80 }, species)).toBe(
      'idle',
    )
  })
})
