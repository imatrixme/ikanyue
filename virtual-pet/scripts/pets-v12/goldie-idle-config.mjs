export const v12IdleAction = {
  actionId: 'idle',
  durationMs: 0,
  fps: 18,
  loop: true,
  runtimeFrames: 32,
  sourceFrames: 32,
}

export const v12Canvas = { width: 640, height: 640 }
export const v12Anchor = { x: 320, y: 585 }

export const v12Alignment = {
  alphaThreshold: 20,
  bodyBottomTrimRatio: 0.08,
  bodyCutRatio: 0.58,
  bodyTopTrimRatio: 0.08,
  smoothBobAmplitudeX: 1,
  smoothBobAmplitudeY: 2,
  strategy: 'body-anchor-stabilized-v1',
}

export const v12Paths = {
  forgeProcessedDir: 'assets-src/pets/v11/processed/goldie-idle',
  manifestPath: 'assets-src/pets/v12/manifests/goldie-idle.v12.json',
  reviewDir: 'assets-src/pets/v12/review',
  runtimeDir: 'src/assets/pets/frames-v12',
  sourcePath: 'assets-src/pets/v11/source/goldie-idle-32-sheet-forge-safe.png',
  stabilizedDir: 'assets-src/pets/v12/stabilized/goldie-idle',
}

export const v12Tolerances = {
  maxBodyAnchorStepPx: 6,
  maxResidualAnchorOffsetPx: 1,
  minVisibleMarginPx: 24,
}
