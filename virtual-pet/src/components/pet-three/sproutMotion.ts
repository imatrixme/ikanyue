import type { Condition, StageId } from '../../game/types'
import type { SproutRig } from './sproutRig'

const conditionDurations: Record<Condition, number> = {
  clean: 1.8,
  eating: 1.45,
  idle: 2.4,
  play: 1.65,
  sleep: 2.9,
  weak: 2.6,
}

export function updateSproutRig(
  rig: SproutRig,
  condition: Condition,
  stageId: StageId,
  elapsed: number,
) {
  const duration = conditionDurations[condition]
  const phase = (elapsed % duration) / duration
  const wave = Math.sin(phase * Math.PI * 2)
  const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
  const quick = Math.sin(phase * Math.PI * 6)
  const blink = shouldBlink(condition, phase)

  resetSproutRig(rig, stageId, wave, pulse, blink)

  if (condition === 'idle') {
    rig.root.position.y += pulse * 0.09
    rig.body.scale.y += pulse * 0.035
    rig.body.scale.x -= pulse * 0.02
    rig.crown.position.y += pulse * 0.025
    rig.crownPetals.forEach((petal, index) => {
      petal.position.y += pulse * 0.018 + Math.sin(elapsed * 2 + index) * 0.006
    })
    rig.hands.left.position.y += wave * 0.015
    rig.hands.right.position.y -= wave * 0.015
    rig.bodyFacets.forEach((facet, index) => {
      facet.scale.setScalar(1 + Math.sin(elapsed * 1.7 + index) * 0.025)
    })
    rig.feet.forEach((foot, index) => {
      foot.rotation.z = (index === 0 ? -0.08 : 0.08) + wave * 0.035
    })
    return
  }

  if (condition === 'eating') {
    const chew = Math.abs(quick)
    rig.body.scale.y = 0.92 + chew * 0.07
    rig.body.scale.x = 1.05 - chew * 0.035
    rig.belly.scale.set(1.08 + chew * 0.06, 0.62 + chew * 0.05, 0.11)
    rig.cheeks.forEach((cheek) => {
      cheek.scale.set(1.38 + chew * 0.08, 0.82 + chew * 0.04, 1)
    })
    rig.mouth.scale.set(1.38, 1.08 + chew * 0.48, 1)
    rig.arms.left.rotation.z = -0.36 - chew * 0.14
    rig.arms.right.rotation.z = 0.36 + chew * 0.14
    rig.hands.left.position.set(-0.74 - chew * 0.05, -0.44 + chew * 0.07, 0.7)
    rig.hands.right.position.set(0.74 + chew * 0.05, -0.44 + chew * 0.07, 0.7)
    rig.snack.visible = true
    rig.snack.position.set(0.43 + wave * 0.04, -0.56 + chew * 0.06, 0.92)
    rig.snack.rotation.z = wave * 0.16
    rig.snack.scale.setScalar(1 - pulse * 0.1)
    rig.crumbs.forEach((crumb, index) => {
      crumb.visible = true
      crumb.position.y += Math.sin(elapsed * 8 + index) * 0.035
      crumb.position.x += Math.cos(elapsed * 6 + index) * 0.025
      crumb.rotation.z = elapsed * (2.4 + index)
      crumb.scale.setScalar(0.7 + chew * 0.55)
    })
    return
  }

  if (condition === 'play') {
    rig.root.position.y += pulse * 0.31
    rig.root.rotation.z = wave * 0.13
    rig.body.scale.y = 0.95 + pulse * 0.055
    rig.arms.left.rotation.z = -1.02 - pulse * 0.25
    rig.arms.right.rotation.z = 1.02 + pulse * 0.25
    rig.hands.left.position.set(-0.92 - pulse * 0.08, 0.06 + pulse * 0.18, 0.48)
    rig.hands.right.position.set(0.92 + pulse * 0.08, 0.06 + pulse * 0.18, 0.48)
    rig.leaves.left.rotation.z = 0.48 + wave * 0.2
    rig.leaves.right.rotation.z = -0.46 + wave * 0.2
    rig.crownPetals.forEach((petal, index) => {
      petal.rotation.z += wave * 0.09 * (index - 2)
      petal.position.y += pulse * 0.03
    })
    rig.feet.forEach((foot, index) => {
      foot.position.y = -1.04 + (index === 0 ? pulse : 1 - pulse) * 0.07
      foot.rotation.z = (index === 0 ? -0.2 : 0.2) + wave * 0.14
    })
    rig.sparkles.forEach((sparkle, index) => {
      sparkle.visible = true
      sparkle.rotation.z = elapsed * (1.6 + index * 0.35)
      sparkle.scale.setScalar(0.82 + 0.32 * Math.sin(elapsed * 4 + index))
    })
    return
  }

  if (condition === 'clean') {
    const scrub = Math.sin(phase * Math.PI * 8)
    rig.root.rotation.z = scrub * 0.045
    rig.arms.left.rotation.z = -0.28 - Math.abs(scrub) * 0.28
    rig.arms.right.rotation.z = 0.28 + Math.abs(scrub) * 0.28
    rig.hands.left.position.set(-0.7 - scrub * 0.06, -0.12 + Math.abs(scrub) * 0.1, 0.74)
    rig.hands.right.position.set(0.7 + scrub * 0.06, -0.12 + Math.abs(scrub) * 0.1, 0.74)
    rig.tufts.forEach((tuft, index) => {
      tuft.rotation.z += scrub * 0.04 * (index % 2 === 0 ? 1 : -1)
    })
    rig.sparkles.forEach((sparkle, index) => {
      sparkle.visible = index < 2
      sparkle.rotation.z = elapsed * 2 + index
      sparkle.scale.setScalar(0.7 + Math.abs(scrub) * 0.4)
    })
    rig.dewDrops.forEach((drop, index) => {
      drop.visible = true
      drop.position.y -= ((phase + index * 0.18) % 1) * 0.14
      drop.scale.setScalar(0.75 + Math.abs(scrub) * 0.28)
    })
    return
  }

  if (condition === 'sleep') {
    rig.root.position.y -= 0.08
    rig.body.scale.set(1.12 - pulse * 0.02, 0.84 + pulse * 0.04, 0.82)
    rig.belly.scale.set(1.16, 0.54 + pulse * 0.03, 0.1)
    rig.arms.left.rotation.z = -0.48 + wave * 0.025
    rig.arms.right.rotation.z = 0.48 + wave * 0.025
    rig.hands.left.position.set(-0.82, -0.48 + pulse * 0.02, 0.44)
    rig.hands.right.position.set(0.82, -0.48 + pulse * 0.02, 0.44)
    rig.leaves.left.rotation.set(0.08, -0.18, 0.35 + wave * 0.035)
    rig.leaves.right.rotation.set(-0.04, 0.18, -0.34 + wave * 0.035)
    rig.eyes.forEach((eye) => {
      eye.visible = false
    })
    rig.eyeHighlights.forEach((shine) => {
      shine.visible = false
    })
    rig.eyelids.forEach((lid) => {
      lid.visible = true
      lid.scale.set(1, 0.72, 1)
    })
    rig.mouth.visible = false
    rig.sleepPuffs.forEach((puff, index) => {
      puff.visible = true
      puff.position.y += Math.sin(elapsed * 1.8 + index) * 0.03
      puff.scale.setScalar(1 + Math.sin(elapsed * 1.5 + index) * 0.12)
    })
    return
  }

  if (condition === 'weak') {
    rig.root.position.y -= 0.14
    rig.root.rotation.z = wave * 0.04
    rig.body.scale.set(0.98, 0.87 + pulse * 0.02, 0.78)
    rig.belly.scale.set(0.98, 0.54, 0.1)
    rig.crown.position.y -= 0.07
    rig.crownPetals.forEach((petal, index) => {
      petal.position.y -= 0.06
      petal.rotation.z += (index - 2) * 0.035 + wave * 0.025
    })
    rig.stem.rotation.z = -0.25 + wave * 0.035
    rig.leaves.left.rotation.set(0.1, -0.18, 0.18 + wave * 0.035)
    rig.leaves.right.rotation.set(-0.04, 0.16, -0.22 + wave * 0.035)
    rig.arms.left.rotation.z = -0.26 + wave * 0.035
    rig.arms.right.rotation.z = 0.26 + wave * 0.035
    rig.hands.left.position.set(-0.92, -0.55 + wave * 0.015, 0.4)
    rig.hands.right.position.set(0.92, -0.55 - wave * 0.015, 0.4)
    rig.eyes.forEach((eye) => {
      eye.scale.set(0.76, 0.72, 0.34)
    })
    rig.cheeks.forEach((cheek) => {
      cheek.visible = false
    })
    rig.brows.forEach((brow) => {
      brow.visible = true
    })
    rig.mouth.rotation.z = 0
    rig.mouth.scale.set(0.92, 0.26, 1)
    rig.dewDrops.forEach((drop, index) => {
      drop.visible = index < 2
      if (index === 0) {
        drop.position.set(0.54, 0.42 - pulse * 0.05, 0.9)
      }
      if (index === 1) {
        drop.position.set(-0.54, 0.18 - pulse * 0.04, 0.9)
      }
      drop.scale.set(0.92 + pulse * 0.12, 1.42 + pulse * 0.18, 0.48)
    })
  }
}

function resetSproutRig(
  rig: SproutRig,
  stageId: StageId,
  wave: number,
  pulse: number,
  blink: boolean,
) {
  const stageScale = stageId === 'adult' ? 1.16 : stageId === 'teen' ? 1.08 : 1

  rig.root.scale.setScalar(stageScale * 1.14)
  rig.root.position.set(0, -0.35, 0)
  rig.root.rotation.set(-0.06, -0.16, 0)
  rig.shadow.scale.set(1.34 + pulse * 0.05, 0.25 + pulse * 0.02, 1)
  rig.body.position.set(0, -0.13, 0)
  rig.body.scale.set(1.02, 0.96, 0.82)
  rig.belly.scale.set(1.04, 0.62, 0.11)
  rig.crown.position.set(0, 0.67, 0.04)
  rig.crown.scale.set(1.36, 0.5, 0.78)
  rig.crownPetals.forEach((petal, index) => {
    const baseX = [-0.53, -0.24, 0, 0.24, 0.53][index] ?? 0
    const baseY = [0.55, 0.67, 0.72, 0.67, 0.55][index] ?? 0.62
    const baseZ = [0.52, 0.58, 0.6, 0.58, 0.52][index] ?? 0.55
    const baseAngle = [-0.38, -0.16, 0, 0.16, 0.38][index] ?? 0
    petal.position.set(baseX, baseY, baseZ)
    petal.rotation.z = baseAngle
    petal.scale.set(1.2, 0.48, 0.42)
  })
  rig.stem.rotation.z = -0.07 + wave * 0.05
  rig.leaves.left.rotation.set(0.03, -0.24 + wave * 0.035, 0.52 + wave * 0.08)
  rig.leaves.right.rotation.set(
    -0.02,
    0.2 + wave * 0.035,
    -0.5 + wave * 0.08,
  )
  rig.arms.left.rotation.z = -0.72 - wave * 0.08
  rig.arms.right.rotation.z = 0.72 - wave * 0.08
  rig.hands.left.position.set(-1.02, -0.39, 0.39)
  rig.hands.right.position.set(1.02, -0.39, 0.39)
  rig.hands.left.scale.set(1.05, 0.78, 0.68)
  rig.hands.right.scale.set(1.05, 0.78, 0.68)
  rig.mouth.visible = true
  rig.mouth.rotation.z = Math.PI
  rig.mouth.scale.set(1.24, 0.78, 1)
  rig.snack.visible = false

  rig.eyes.forEach((eye) => {
    eye.visible = !blink
    eye.scale.set(0.76, 1.2, 0.36)
  })
  rig.eyeHighlights.forEach((shine) => {
    shine.visible = !blink
  })
  rig.cheeks.forEach((cheek) => {
    cheek.visible = true
    cheek.scale.set(1.24, 0.7, 1)
  })
  rig.eyelids.forEach((lid) => {
    lid.visible = blink
    lid.scale.set(1, 0.9, 1)
  })
  rig.brows.forEach((brow, index) => {
    brow.visible = false
    brow.rotation.z = index === 0 ? 0.42 : -0.42
  })
  rig.feet.forEach((foot, index) => {
    foot.position.set(index === 0 ? -0.36 : 0.36, -1.04, 0.34)
    foot.rotation.z = index === 0 ? -0.08 : 0.08
  })
  rig.tufts.forEach((tuft, index) => {
    tuft.rotation.z = [0.48, 0.18, -0.18, -0.48][index] ?? 0
  })
  rig.bodyFacets.forEach((facet) => {
    facet.visible = true
    facet.scale.set(1.15, 0.78, 1)
  })
  rig.crumbs.forEach((crumb) => {
    crumb.visible = false
    crumb.scale.setScalar(1)
  })
  rig.sparkles.forEach((sparkle) => {
    sparkle.visible = false
    sparkle.scale.setScalar(1)
  })
  rig.dewDrops.forEach((drop) => {
    drop.visible = false
    drop.scale.set(0.72, 1.2, 0.42)
  })
  rig.sleepPuffs.forEach((puff) => {
    puff.visible = false
    puff.scale.setScalar(1)
  })
}

function shouldBlink(condition: Condition, phase: number) {
  if (condition === 'sleep') {
    return false
  }
  if (condition === 'weak') {
    return phase > 0.56 && phase < 0.66
  }
  return phase > 0.88 && phase < 0.94
}
