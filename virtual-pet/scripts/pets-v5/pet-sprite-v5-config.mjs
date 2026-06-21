export const v5Pipeline = {
  canvas: { width: 640, height: 640 },
  reviewDir: 'assets-src/pets/v5/review',
  manifestPath: 'assets-src/pets/v5/manifests/pet-assets.v5.json',
  rawDir: 'assets-src/pets/v5/raw',
  runtimeDir: 'src/assets/pets/frames-v5',
  runtimeManifestPath: 'src/data/generated/petAnimationManifest.ts',
}

export const v5Actions = [
  {
    actionId: 'idle',
    anchor: { x: 320, y: 585 },
    durationMs: 0,
    frameCount: 16,
    fps: 16,
    loop: true,
    maxBaselineStepPx: 5,
    maxCenterStepPx: 7,
    maxLoopCenterStepPx: 7,
    renderer: 'three-sprout-rig',
    speciesId: 'sprout',
    stageId: 'baby',
    sourceDurationSeconds: 2.4,
    visibleMarginPx: 8,
  },
]
