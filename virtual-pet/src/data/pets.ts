import { petFrameManifest } from './petFrameManifest'
import type { PetSpecies, SpeciesId } from '../game/types'

function animations(speciesId: SpeciesId) {
  return petFrameManifest[speciesId]
}

export const speciesList: PetSpecies[] = [
  {
    id: 'sprout',
    name: 'Sprout',
    trait: 'A leaf-eared climber that grows fastest on sweet snacks.',
    favoriteFoods: ['berry', 'spark'],
    stages: [
      {
        id: 'baby',
        name: 'Seedling',
        threshold: 0,
        animations: animations('sprout'),
      },
      {
        id: 'teen',
        name: 'Budding',
        threshold: 100,
        animations: animations('sprout'),
      },
      {
        id: 'adult',
        name: 'Bloomtail',
        threshold: 240,
        animations: animations('sprout'),
      },
    ],
  },
  {
    id: 'mochi',
    name: 'Mochi',
    trait: 'A round cloud pet that perks up when comfort food appears.',
    favoriteFoods: ['noodle', 'berry'],
    stages: [
      {
        id: 'baby',
        name: 'Puff',
        threshold: 0,
        animations: animations('mochi'),
      },
      {
        id: 'teen',
        name: 'Dumpling',
        threshold: 100,
        animations: animations('mochi'),
      },
      {
        id: 'adult',
        name: 'Moonbun',
        threshold: 240,
        animations: animations('mochi'),
      },
    ],
  },
  {
    id: 'pebble',
    name: 'Pebble',
    trait: 'A tiny mineral friend with steady growth and bright moods.',
    favoriteFoods: ['spark', 'noodle'],
    stages: [
      {
        id: 'baby',
        name: 'Chip',
        threshold: 0,
        animations: animations('pebble'),
      },
      {
        id: 'teen',
        name: 'Geode',
        threshold: 100,
        animations: animations('pebble'),
      },
      {
        id: 'adult',
        name: 'Gemcore',
        threshold: 240,
        animations: animations('pebble'),
      },
    ],
  },
]
