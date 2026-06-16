export const speciesIds = ['sprout', 'mochi', 'pebble']

export const actionConfigs = {
  idle: { fps: 12, loop: true, durationMs: 0, maxCenterStepPx: 6, maxBaselineStepPx: 8 },
  eating: { fps: 14, loop: false, durationMs: 1_500, maxCenterStepPx: 10, maxBaselineStepPx: 12 },
  play: { fps: 14, loop: false, durationMs: 1_800, maxCenterStepPx: 20, maxBaselineStepPx: 28 },
  clean: { fps: 14, loop: false, durationMs: 1_800, maxCenterStepPx: 14, maxBaselineStepPx: 12 },
  sleep: { fps: 8, loop: false, durationMs: 2_300, maxCenterStepPx: 5, maxBaselineStepPx: 6 },
  weak: { fps: 8, loop: true, durationMs: 0, maxCenterStepPx: 8, maxBaselineStepPx: 8 },
}

export const animationPipeline = {
  sourceDir: 'assets-src/pets/source-seeds',
  outputDir: 'src/assets/pets/frames-v4',
  reviewDir: 'assets-src/pets/review',
  manifestPath: 'src/data/generated/petAnimationManifest.ts',
  runtimeFramesPerAction: 12,
  canvas: { width: 640, height: 640 },
  anchor: { x: 320, y: 585 },
  alphaThreshold: 8,
  visibleMarginPx: 8,
}

export const actionIds = Object.keys(actionConfigs)
