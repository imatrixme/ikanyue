export const canvas = { width: 640, height: 640 }
export const anchor = { x: 320, y: 585 }
export const alphaThreshold = 16

export const paths = {
  extractedDir: 'assets-src/pets/v8/extracted',
  manifestPath: 'assets-src/pets/v8/manifests/goldie-sheet.v8.json',
  reviewDir: 'assets-src/pets/v8/review',
  runtimeDir: 'src/assets/pets/frames-v8',
  runtimeGoldieManifestPath: 'src/data/generated/goldieAnimationManifest.ts',
  runtimeManifestPath: 'src/data/generated/petAnimationManifest.ts',
  sourceDir: 'assets-src/pets/v8/source',
}

export const actions = {
  idle: {
    durationMs: 0,
    fps: 12,
    frames: 18,
    loop: true,
    poses: ['bottomFront', 'bottomSideFront', 'bottomSideLook', 'bottomSideFront', 'bottomFront'],
  },
  eating: {
    durationMs: 1500,
    fps: 14,
    frames: 18,
    loop: false,
    poses: ['bottomFront', 'bottomOpen', 'bottomLaugh', 'bottomOpen', 'bottomFront'],
  },
  play: {
    durationMs: 1800,
    fps: 14,
    frames: 20,
    loop: false,
    poses: ['swimLeft', 'dance', 'uprightOpen', 'uprightLook', 'bottomLaugh'],
  },
  clean: {
    durationMs: 1800,
    fps: 14,
    frames: 18,
    loop: false,
    poses: ['sideRight', 'topBackSide', 'backTail', 'topBack', 'topFront'],
  },
  sleep: {
    durationMs: 2300,
    fps: 8,
    frames: 18,
    loop: false,
    poses: ['backTail', 'backTail', 'bottomSideLook'],
  },
  weak: {
    durationMs: 0,
    fps: 8,
    frames: 18,
    loop: true,
    poses: ['bottomFront', 'bottomSideLook', 'bottomFront'],
  },
}

export const poses = {
  topFront: { manual: { left: 28, top: 62, width: 145, height: 214 } },
  topBackSide: { manual: { left: 410, top: 70, width: 156, height: 205 } },
  topBack: { manual: { left: 588, top: 70, width: 115, height: 210 } },
  swimLeft: { manual: { left: 16, top: 690, width: 208, height: 188 } },
  dance: { manual: { left: 238, top: 690, width: 198, height: 188 } },
  uprightOpen: { manual: { left: 450, top: 690, width: 198, height: 190 } },
  uprightLook: { manual: { left: 685, top: 690, width: 178, height: 198 } },
  sideRight: { manual: { left: 865, top: 692, width: 230, height: 178 } },
  backTail: { manual: { left: 1105, top: 690, width: 180, height: 190 } },
  bottomOpen: { manual: { left: 22, top: 925, width: 174, height: 250 } },
  bottomSideLook: { manual: { left: 220, top: 935, width: 202, height: 245 } },
  bottomSideFront: { manual: { left: 430, top: 935, width: 202, height: 245 } },
  bottomFront: { manual: { left: 680, top: 925, width: 180, height: 250 } },
  bottomLaugh: { manual: { left: 1088, top: 925, width: 182, height: 250 } },
}

export const sheetGrid = {
  firstRowHeight: 324,
  rowHeight: 171,
  rowTops: [0, 324, 495, 666, 837],
  splitX: 652,
  width: 1313,
}
