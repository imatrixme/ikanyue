export const v10IdleAction = {
  actionId: 'idle',
  durationMs: 0,
  fps: 18,
  loop: true,
  runtimeFrames: 32,
  sourceFrames: 32,
}

export const v10Canvas = { width: 640, height: 640 }
export const v10Anchor = { x: 320, y: 585 }

export const v10Paths = {
  extractedDir: 'assets-src/pets/v10/extracted',
  manifestPath: 'assets-src/pets/v10/manifests/goldie-idle.v10.json',
  reviewDir: 'assets-src/pets/v10/review',
  runtimeDir: 'src/assets/pets/frames-v10',
  sourceDir: 'assets-src/pets/v10/source',
  sourcePath: 'assets-src/pets/v10/source/goldie-idle-32-sheet.png',
}

export const v10Sheet = {
  columns: 8,
  rows: 4,
}

export const v10Tolerances = {
  maxCenterStepPx: 16,
  minVisibleMarginPx: 24,
}
