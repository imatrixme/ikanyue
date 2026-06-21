import * as THREE from 'three'
import type { SproutMaterials } from './sproutMaterials'
import { createSproutMaterials } from './sproutMaterials'
import { faceted } from './threePrimitives'

export interface SproutRig {
  arms: {
    left: THREE.Mesh
    right: THREE.Mesh
  }
  belly: THREE.Mesh
  body: THREE.Mesh
  bodyFacets: THREE.Mesh[]
  brows: THREE.Mesh[]
  cheeks: THREE.Mesh[]
  crumbs: THREE.Mesh[]
  crown: THREE.Mesh
  crownPetals: THREE.Mesh[]
  dewDrops: THREE.Mesh[]
  eyeHighlights: THREE.Mesh[]
  eyelids: THREE.Mesh[]
  eyes: THREE.Mesh[]
  feet: THREE.Mesh[]
  hands: {
    left: THREE.Mesh
    right: THREE.Mesh
  }
  leaves: {
    left: THREE.Group
    right: THREE.Group
  }
  mouth: THREE.Mesh
  root: THREE.Group
  shadow: THREE.Mesh
  sleepPuffs: THREE.Mesh[]
  snack: THREE.Group
  sparkles: THREE.Mesh[]
  stem: THREE.Mesh
  tufts: THREE.Mesh[]
}

export function createSproutRig(): SproutRig {
  const materials = createSproutMaterials()
  const root = new THREE.Group()
  root.scale.setScalar(1.14)
  root.rotation.set(-0.06, -0.16, 0)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, 28),
    materials.shadow,
  )
  shadow.position.set(0, -1.21, -0.3)
  shadow.scale.set(1.34, 0.25, 1)
  root.add(shadow)

  const body = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(1.05, 16, 10)),
    materials.body,
  )
  body.position.set(0, -0.13, 0)
  body.scale.set(1.02, 0.96, 0.82)
  root.add(body)

  const crown = new THREE.Mesh(
    faceted(new THREE.DodecahedronGeometry(0.48, 1)),
    materials.crown,
  )
  crown.position.set(0, 0.67, 0.04)
  crown.scale.set(1.36, 0.5, 0.78)
  root.add(crown)
  const crownPetals = createCrownPetals(materials.crown, root)

  const belly = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.72, 14, 8)),
    materials.belly,
  )
  belly.position.set(0, -0.35, 0.55)
  belly.scale.set(1.04, 0.62, 0.11)
  root.add(belly)
  const bodyFacets = createBodyFacets(materials, root)

  const tufts = createLowerTufts(materials.leaf, root)
  const feet = createFeet(materials.stem, root)

  const stem = new THREE.Mesh(
    faceted(new THREE.CapsuleGeometry(0.06, 0.48, 3, 7)),
    materials.stem,
  )
  stem.position.set(0, 1.02, 0.02)
  stem.rotation.z = -0.07
  root.add(stem)

  const leftLeaf = createLeaf(materials)
  leftLeaf.position.set(-0.43, 1.32, 0.04)
  leftLeaf.rotation.set(0.03, -0.24, 0.52)
  root.add(leftLeaf)

  const rightLeaf = createLeaf(materials)
  rightLeaf.position.set(0.48, 1.34, 0.05)
  rightLeaf.rotation.set(-0.02, 0.2, -0.5)
  root.add(rightLeaf)

  const eyes = createEyes(materials, root)
  const eyeHighlights = createEyeHighlights(materials, root)
  const eyelids = createEyelids(materials, root)
  const brows = createBrows(materials, root)
  const cheeks = createCheeks(materials, root)
  const mouth = createMouth(materials, root)
  const arms = createArms(materials.stem, root)
  const hands = createHands(materials.stem, root)
  const snack = createSnack(materials)
  root.add(snack)
  const crumbs = createCrumbs(materials, root)
  const sparkles = createSparkles(materials, root)
  const dewDrops = createDewDrops(materials, root)
  const sleepPuffs = createSleepPuffs(materials, root)

  return {
    arms,
    belly,
    body,
    bodyFacets,
    brows,
    cheeks,
    crumbs,
    crown,
    crownPetals,
    dewDrops,
    eyeHighlights,
    eyelids,
    eyes,
    feet,
    hands,
    leaves: {
      left: leftLeaf,
      right: rightLeaf,
    },
    mouth,
    root,
    shadow,
    sleepPuffs,
    snack,
    sparkles,
    stem,
    tufts,
  }
}

function createLowerTufts(material: THREE.Material, root: THREE.Group) {
  const positions = [
    [-0.66, -0.78, 0.36, 0.48],
    [-0.28, -0.91, 0.48, 0.18],
    [0.28, -0.91, 0.48, -0.18],
    [0.66, -0.78, 0.36, -0.48],
  ] as const

  return positions.map(([x, y, z, angle]) => {
    const tuft = new THREE.Mesh(
      faceted(new THREE.ConeGeometry(0.14, 0.36, 5)),
      material,
    )
    tuft.position.set(x, y, z)
    tuft.rotation.set(0.1, 0, angle)
    root.add(tuft)
    return tuft
  })
}

function createCrownPetals(material: THREE.Material, root: THREE.Group) {
  const petals = [
    [-0.53, 0.55, 0.52, -0.38],
    [-0.24, 0.67, 0.58, -0.16],
    [0, 0.72, 0.6, 0],
    [0.24, 0.67, 0.58, 0.16],
    [0.53, 0.55, 0.52, 0.38],
  ] as const

  return petals.map(([x, y, z, angle]) => {
    const petal = new THREE.Mesh(
      faceted(new THREE.DodecahedronGeometry(0.13, 0)),
      material,
    )
    petal.position.set(x, y, z)
    petal.scale.set(1.2, 0.48, 0.42)
    petal.rotation.z = angle
    root.add(petal)
    return petal
  })
}

function createBodyFacets(materials: SproutMaterials, root: THREE.Group) {
  const facets = [
    [-0.48, 0.34, 0.79, 0.14, 0.6, materials.bodyFacetLight],
    [0.47, 0.28, 0.78, 0.12, -0.42, materials.bodyFacetShade],
    [-0.24, -0.57, 0.8, 0.11, 0.08, materials.bodyFacetShade],
    [0.28, -0.66, 0.78, 0.1, -0.2, materials.bodyFacetLight],
    [0.02, 0.53, 0.75, 0.09, 0.95, materials.bodyFacetLight],
  ] as const

  return facets.map(([x, y, z, radius, angle, material]) => {
    const facet = new THREE.Mesh(new THREE.CircleGeometry(radius, 3), material)
    facet.position.set(x, y, z)
    facet.rotation.z = angle
    facet.scale.set(1.15, 0.78, 1)
    root.add(facet)
    return facet
  })
}

function createFeet(material: THREE.Material, root: THREE.Group) {
  return [-0.36, 0.36].map((x) => {
    const foot = new THREE.Mesh(
      faceted(new THREE.DodecahedronGeometry(0.18, 0)),
      material,
    )
    foot.position.set(x, -1.04, 0.34)
    foot.scale.set(1.38, 0.56, 0.72)
    root.add(foot)
    return foot
  })
}

function createLeaf(materials: SproutMaterials) {
  const leaf = new THREE.Group()

  const blade = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.46, 12, 7)),
    materials.leaf,
  )
  blade.scale.set(1.18, 0.42, 0.15)
  leaf.add(blade)

  const vein = new THREE.Mesh(
    faceted(new THREE.CapsuleGeometry(0.014, 0.55, 2, 5)),
    materials.leafLine,
  )
  vein.position.z = 0.08
  vein.rotation.z = Math.PI / 2
  leaf.add(vein)

  ;[-0.24, 0.24].forEach((offset, index) => {
    const branch = new THREE.Mesh(
      faceted(new THREE.CapsuleGeometry(0.008, 0.18, 2, 4)),
      materials.leafLine,
    )
    branch.position.set(offset, index === 0 ? 0.05 : -0.05, 0.09)
    branch.rotation.z = index === 0 ? 0.68 : -0.68
    leaf.add(branch)
  })

  const tip = new THREE.Mesh(
    faceted(new THREE.ConeGeometry(0.08, 0.2, 5)),
    materials.leaf,
  )
  tip.position.set(0.55, 0, 0)
  tip.rotation.z = -Math.PI / 2
  tip.scale.set(1, 0.58, 0.58)
  leaf.add(tip)

  return leaf
}

function createEyes(materials: SproutMaterials, root: THREE.Group) {
  return [-0.35, 0.35].map((x) => {
    const eye = new THREE.Mesh(
      faceted(new THREE.SphereGeometry(0.13, 10, 7)),
      materials.dark,
    )
    eye.position.set(x, 0.14, 0.78)
    eye.scale.set(0.76, 1.2, 0.36)
    root.add(eye)
    return eye
  })
}

function createEyeHighlights(materials: SproutMaterials, root: THREE.Group) {
  return [-0.35, 0.35].map((x) => {
    const shine = new THREE.Mesh(
      faceted(new THREE.SphereGeometry(0.035, 8, 5)),
      materials.white,
    )
    shine.position.set(x - 0.035, 0.2, 0.85)
    shine.scale.set(1, 1, 0.28)
    root.add(shine)
    return shine
  })
}

function createEyelids(materials: SproutMaterials, root: THREE.Group) {
  return [-0.35, 0.35].map((x) => {
    const lid = new THREE.Mesh(
      faceted(new THREE.CapsuleGeometry(0.018, 0.18, 2, 5)),
      materials.brow,
    )
    lid.position.set(x, 0.15, 0.88)
    lid.rotation.z = Math.PI / 2
    lid.visible = false
    root.add(lid)
    return lid
  })
}

function createBrows(materials: SproutMaterials, root: THREE.Group) {
  return [-0.35, 0.35].map((x, index) => {
    const brow = new THREE.Mesh(
      faceted(new THREE.CapsuleGeometry(0.014, 0.18, 2, 5)),
      materials.brow,
    )
    brow.position.set(x, 0.34, 0.86)
    brow.rotation.z = index === 0 ? 0.42 : -0.42
    brow.visible = false
    root.add(brow)
    return brow
  })
}

function createCheeks(materials: SproutMaterials, root: THREE.Group) {
  return [-0.61, 0.61].map((x) => {
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 18),
      materials.blush,
    )
    cheek.position.set(x, -0.08, 0.84)
    cheek.scale.set(1.24, 0.7, 1)
    root.add(cheek)
    return cheek
  })
}

function createMouth(materials: SproutMaterials, root: THREE.Group) {
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(0.095, 18, 0, Math.PI),
    materials.mouth,
  )
  mouth.position.set(0, -0.11, 0.87)
  mouth.rotation.z = Math.PI
  mouth.scale.set(1.24, 0.78, 1)
  root.add(mouth)
  return mouth
}

function createArms(material: THREE.Material, root: THREE.Group) {
  const left = createArm(material)
  left.position.set(-0.91, -0.22, 0.26)
  left.rotation.z = -0.72
  root.add(left)

  const right = createArm(material)
  right.position.set(0.91, -0.22, 0.26)
  right.rotation.z = 0.72
  root.add(right)

  return { left, right }
}

function createHands(material: THREE.Material, root: THREE.Group) {
  const left = createHand(material)
  left.position.set(-1.02, -0.39, 0.39)
  root.add(left)

  const right = createHand(material)
  right.position.set(1.02, -0.39, 0.39)
  root.add(right)

  return { left, right }
}

function createHand(material: THREE.Material) {
  const hand = new THREE.Mesh(
    faceted(new THREE.DodecahedronGeometry(0.1, 0)),
    material,
  )
  hand.scale.set(1.05, 0.78, 0.68)
  return hand
}

function createArm(material: THREE.Material) {
  const arm = new THREE.Mesh(
    faceted(new THREE.CapsuleGeometry(0.09, 0.34, 3, 7)),
    material,
  )
  arm.scale.set(0.86, 1, 0.76)
  return arm
}

function createSnack(materials: SproutMaterials) {
  const snack = new THREE.Group()
  snack.visible = false
  snack.position.set(0.45, -0.56, 0.9)

  const fruit = new THREE.Mesh(
    faceted(new THREE.DodecahedronGeometry(0.13, 0)),
    materials.snack,
  )
  fruit.scale.set(1.05, 0.95, 0.85)
  snack.add(fruit)

  const leaf = new THREE.Mesh(
    faceted(new THREE.SphereGeometry(0.06, 8, 5)),
    materials.leaf,
  )
  leaf.position.set(0.06, 0.12, 0.01)
  leaf.scale.set(1.3, 0.5, 0.25)
  leaf.rotation.z = -0.45
  snack.add(leaf)

  return snack
}

function createCrumbs(materials: SproutMaterials, root: THREE.Group) {
  return [
    [0.2, -0.22, 0.91, 0.03],
    [0.34, -0.1, 0.92, 0.025],
    [0.06, -0.03, 0.9, 0.02],
  ].map(([x, y, z, radius]) => {
    const crumb = new THREE.Mesh(
      faceted(new THREE.DodecahedronGeometry(radius, 0)),
      materials.crumb,
    )
    crumb.position.set(x, y, z)
    crumb.visible = false
    root.add(crumb)
    return crumb
  })
}

function createSparkles(materials: SproutMaterials, root: THREE.Group) {
  return [
    [-0.82, 0.56, 0.92],
    [0.78, 0.48, 0.96],
    [0.62, 1.0, 0.76],
    [-0.58, 0.94, 0.78],
    [0.02, 1.1, 0.9],
  ].map(([x, y, z]) => {
    const sparkle = new THREE.Mesh(
      faceted(new THREE.OctahedronGeometry(0.08, 0)),
      materials.sparkle,
    )
    sparkle.position.set(x, y, z)
    sparkle.visible = false
    root.add(sparkle)
    return sparkle
  })
}

function createDewDrops(materials: SproutMaterials, root: THREE.Group) {
  return [
    [-0.56, 0.28, 0.88, 0.045],
    [0.57, 0.12, 0.88, 0.038],
    [-0.16, 0.7, 0.76, 0.032],
    [0.76, 0.42, 0.78, 0.028],
  ].map(([x, y, z, radius]) => {
    const drop = new THREE.Mesh(
      faceted(new THREE.SphereGeometry(radius, 7, 5)),
      materials.dew,
    )
    drop.position.set(x, y, z)
    drop.scale.set(0.72, 1.2, 0.42)
    drop.visible = false
    root.add(drop)
    return drop
  })
}

function createSleepPuffs(materials: SproutMaterials, root: THREE.Group) {
  return [
    [0.65, 0.78, 0.88, 0.08],
    [0.84, 1.0, 0.82, 0.06],
    [1, 1.17, 0.76, 0.045],
    [1.12, 1.3, 0.72, 0.032],
  ].map(([x, y, z, radius]) => {
    const puff = new THREE.Mesh(
      faceted(new THREE.SphereGeometry(radius, 8, 5)),
      materials.puff,
    )
    puff.position.set(x, y, z)
    puff.visible = false
    root.add(puff)
    return puff
  })
}
