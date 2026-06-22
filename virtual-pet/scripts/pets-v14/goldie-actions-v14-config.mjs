export const v14Canvas = { width: 640, height: 640 }
export const v14Anchor = { x: 320, y: 585 }
export const v14SourceFrames = 32
export const v14RuntimeFrames = 64
export const v14Strategy = 'stabilized-forge-action-interp-v2'

export const v14ForgeProcessor = {
  align: 'center',
  cellSize: 640,
  cols: 8,
  componentMode: 'largest',
  componentPadding: 0,
  duration: 56,
  edgeCleanDepth: 3,
  edgeThreshold: 150,
  edgeTouchMargin: 2,
  fitScale: 0.82,
  minComponentArea: 128,
  rows: 4,
  sharedScale: true,
  threshold: 100,
  trimBorder: 4,
}

export const v14Actions = {
  idle: {
    durationMs: 0,
    fps: 36,
    loop: true,
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-idle',
    sourceRuntimeDir: 'src/assets/pets/frames-v13',
    sourceType: 'runtime-v13',
  },
  eating: {
    durationMs: 1_500,
    fps: 43,
    loop: false,
    processedDir: 'assets-src/pets/v14/processed/goldie-eating',
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-eating-source',
    sourceSheet: 'assets-src/pets/v14/source/goldie-eating-32-sheet-forge.png',
    sourceType: 'forge',
  },
  play: {
    durationMs: 1_800,
    fps: 36,
    loop: false,
    processedDir: 'assets-src/pets/v14/processed/goldie-play',
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-play-source',
    sourceSheet: 'assets-src/pets/v14/source/goldie-play-32-sheet-forge.png',
    sourceType: 'forge',
  },
  clean: {
    durationMs: 1_800,
    fps: 36,
    loop: false,
    processedDir: 'assets-src/pets/v14/processed/goldie-clean',
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-clean-source',
    sourceSheet: 'assets-src/pets/v14/source/goldie-clean-32-sheet-forge.png',
    sourceType: 'forge',
  },
  sleep: {
    durationMs: 2_300,
    fps: 28,
    loop: false,
    processedDir: 'assets-src/pets/v14/processed/goldie-sleep',
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-sleep-source',
    sourceSheet: 'assets-src/pets/v14/source/goldie-sleep-32-sheet-forge.png',
    sourceType: 'forge',
  },
  weak: {
    durationMs: 0,
    fps: 24,
    loop: true,
    processedDir: 'assets-src/pets/v14/processed/goldie-weak',
    sourceFrames: v14SourceFrames,
    sourcePrefix: 'goldie-weak-source',
    sourceSheet: 'assets-src/pets/v14/source/goldie-weak-32-sheet-forge.png',
    sourceType: 'forge',
  },
}

export const v14ActionIds = Object.keys(v14Actions)

export const v14Paths = {
  manifestPath: 'assets-src/pets/v14/manifests/goldie-actions.v14.json',
  reviewDir: 'assets-src/pets/v14/review',
  runtimeDir: 'src/assets/pets/frames-v14',
  runtimeGoldieManifestPath: 'src/data/generated/goldieAnimationManifest.ts',
  stabilizedDir: 'assets-src/pets/v14/stabilized',
}

export const v14Stabilization = {
  alphaThreshold: 20,
  blendMaxBodyStepPx: 4,
  anchorOffsets: {
    clean: { x: 0, y: 0 },
    eating: { x: 0, y: 0 },
    idle: { x: 0, y: 0 },
    play: { x: 0, y: 0 },
    sleep: { x: 0, y: 0 },
    weak: { x: 0, y: 4 },
  },
  bodyBottomTrimRatio: 0.08,
  bodyCutRatio: 0.58,
  bodyTopTrimRatio: 0.08,
  maxScale: 1.04,
  minScale: 0.78,
  motionClamp: {
    clean: { x: 3, y: 3 },
    default: { x: 3, y: 3 },
    eating: { x: 3, y: 4 },
    idle: { x: 1, y: 2 },
    play: { x: 2, y: 2 },
    sleep: { x: 3, y: 4 },
    weak: { x: 2, y: 3 },
  },
  strategy: 'idle-scale-body-anchor-stabilized-64-v1',
  targetBounds: {
    clean: { heightRatio: 1.06, widthRatio: 1.08 },
    default: { heightRatio: 1.05, widthRatio: 1.08 },
    eating: { heightRatio: 1.08, widthRatio: 1.12 },
    idle: { heightRatio: 1, widthRatio: 1 },
    play: { heightRatio: 1.06, widthRatio: 1.08 },
    sleep: { heightRatio: 1.06, widthRatio: 1.1 },
    weak: { heightRatio: 1.08, widthRatio: 1.05 },
  },
}

export const v14Validation = {
  alphaThreshold: 16,
  maxRuntimeBodyStepPx: 9,
  minVisibleMarginPx: 22,
  sourceSheetMinRatio: 1.75,
}
