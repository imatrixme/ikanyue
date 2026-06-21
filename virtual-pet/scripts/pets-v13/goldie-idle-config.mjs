export const v13IdleAction = {
  actionId: 'idle',
  durationMs: 0,
  fps: 18,
  loop: true,
  runtimeFrames: 32,
  sourceFrames: 14,
}

export const v13Canvas = { width: 640, height: 640 }
export const v13Anchor = { x: 320, y: 585 }

export const v13Loop = {
  alphaThreshold: 20,
  maxVisualStep: 42,
  sourceSequence: [26, 27, 28, 29, 30, 31, 32, 31, 30, 29, 28, 27, 26],
  strategy: 'continuous-segment-crossfade-local-blink-v2',
}

export const v13Blink = {
  masks: [
    { centerX: 158, centerY: 324, featherRatio: 0.32, radiusX: 43, radiusY: 38 },
    { centerX: 286, centerY: 323, featherRatio: 0.3, radiusX: 63, radiusY: 46 },
  ],
  runtimeAmounts: new Map([
    [15, 1],
    [16, 1],
  ]),
  sourceFrame: 12,
  strategy: 'localized-closed-eye-overlay-v1',
}

export const v13Paths = {
  manifestPath: 'assets-src/pets/v13/manifests/goldie-idle.v13.json',
  reviewDir: 'assets-src/pets/v13/review',
  runtimeDir: 'src/assets/pets/frames-v13',
  sourceDir: 'assets-src/pets/v12/stabilized/goldie-idle',
  sourceManifestPath: 'assets-src/pets/v12/manifests/goldie-idle.v12.json',
  stabilizedDir: 'assets-src/pets/v13/stabilized/goldie-idle',
}

export const v13Tolerances = {
  maxVisualStep: v13Loop.maxVisualStep,
  minVisibleMarginPx: 24,
}
