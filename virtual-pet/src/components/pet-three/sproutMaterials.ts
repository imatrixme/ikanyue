import type * as THREE from 'three'
import { basicMaterial, standardMaterial } from './threePrimitives'

export interface SproutMaterials {
  belly: THREE.MeshStandardMaterial
  blush: THREE.MeshBasicMaterial
  body: THREE.MeshStandardMaterial
  bodyFacetLight: THREE.MeshBasicMaterial
  bodyFacetShade: THREE.MeshBasicMaterial
  brow: THREE.MeshBasicMaterial
  crown: THREE.MeshStandardMaterial
  crumb: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  dew: THREE.MeshBasicMaterial
  leaf: THREE.MeshStandardMaterial
  leafLine: THREE.MeshBasicMaterial
  mouth: THREE.MeshBasicMaterial
  puff: THREE.MeshBasicMaterial
  shadow: THREE.MeshBasicMaterial
  snack: THREE.MeshStandardMaterial
  sparkle: THREE.MeshBasicMaterial
  stem: THREE.MeshStandardMaterial
  white: THREE.MeshBasicMaterial
}

export function createSproutMaterials(): SproutMaterials {
  return {
    belly: standardMaterial(0xe7f193, 0.74),
    blush: basicMaterial(0xf18b7b, 0.52),
    body: standardMaterial(0xc8dc58, 0.7),
    bodyFacetLight: basicMaterial(0xf3f7a4, 0.28),
    bodyFacetShade: basicMaterial(0x8eac42, 0.2),
    brow: basicMaterial(0x4d3c24, 1),
    crown: standardMaterial(0xb9cf48, 0.72),
    crumb: standardMaterial(0xf5c768, 0.62),
    dark: standardMaterial(0x2a2218, 0.42),
    dew: basicMaterial(0x9ee9dc, 0.72),
    leaf: standardMaterial(0xa2c940, 0.64),
    leafLine: basicMaterial(0x6f9440, 0.72),
    mouth: basicMaterial(0x4b231d, 1),
    puff: basicMaterial(0xdff8eb, 0.72),
    shadow: basicMaterial(0x28594c, 0.13),
    snack: standardMaterial(0xf19f4d, 0.58),
    sparkle: basicMaterial(0xfff0a6, 0.86),
    stem: standardMaterial(0x93aa50, 0.7),
    white: basicMaterial(0xffffff, 1),
  }
}
