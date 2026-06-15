export type SpeciesId = 'sprout' | 'mochi' | 'pebble'
export type StageId = 'baby' | 'teen' | 'adult'
export type AnimationAction =
  | 'idle'
  | 'eating'
  | 'play'
  | 'clean'
  | 'sleep'
  | 'weak'
export type Condition = AnimationAction
export type FoodId = 'berry' | 'noodle' | 'spark'

export interface PetAnimationSet {
  idle: string[]
  eating: string[]
  play: string[]
  clean: string[]
  sleep: string[]
  weak: string[]
}

export interface PetStage {
  id: StageId
  name: string
  threshold: number
  animations: PetAnimationSet
}

export interface PetSpecies {
  id: SpeciesId
  name: string
  trait: string
  favoriteFoods: FoodId[]
  stages: PetStage[]
}

export interface PetState {
  id: string
  speciesId: SpeciesId
  stageId: StageId
  growth: number
  hunger: number
  health: number
  mood: number
  adoptedAt: number
  lastFedAt: number
  lastTickAt: number
}

export interface Food {
  id: FoodId
  name: string
  icon: string
  hunger: number
  mood: number
  growth: number
}
