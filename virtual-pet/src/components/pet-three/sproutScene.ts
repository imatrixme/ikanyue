import * as THREE from 'three'
import type { Condition, StageId } from '../../game/types'
import { disposeObject } from './disposeObject'
import { createSproutRig } from './sproutRig'
import { updateSproutRig } from './sproutMotion'

export interface SproutThreeScene {
  camera: THREE.OrthographicCamera
  renderAt: (options: SproutRenderOptions) => void
  resize: (width: number, height: number) => void
  renderer: THREE.WebGLRenderer
  root: THREE.Group
  scene: THREE.Scene
  teardown: () => void
}

export interface SproutThreeSceneOptions {
  preserveDrawingBuffer?: boolean
}

export interface SproutRenderOptions {
  condition: Condition
  elapsed: number
  pitch?: number
  stageId: StageId
  yaw?: number
}

const viewHeight = 4.1

export function createSproutThreeScene(
  canvas: HTMLCanvasElement,
  options: SproutThreeSceneOptions = {},
): SproutThreeScene {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
  camera.position.set(0, 0.42, 8)
  camera.lookAt(0, 0.25, 0)

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    premultipliedAlpha: false,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const root = new THREE.Group()
  scene.add(root)
  const rig = createSproutRig()
  root.add(rig.root)

  const ambientLight = new THREE.AmbientLight(0xf8fff4, 2.15)
  scene.add(ambientLight)

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.25)
  keyLight.position.set(-2.6, 4.2, 5)
  scene.add(keyLight)

  const rimLight = new THREE.DirectionalLight(0xa7f4d9, 1.45)
  rimLight.position.set(2.2, 2.3, 4)
  scene.add(rimLight)

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false)
    const aspect = width / Math.max(height, 1)
    camera.left = (-viewHeight * aspect) / 2
    camera.right = (viewHeight * aspect) / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
  }

  function renderAt({
    condition,
    elapsed,
    pitch = 0,
    stageId,
    yaw = 0,
  }: SproutRenderOptions) {
    updateSproutRig(rig, condition, stageId, elapsed)
    root.rotation.x = pitch
    root.rotation.y = yaw
    renderer.render(scene, camera)
  }

  return {
    camera,
    renderAt,
    renderer,
    resize,
    root,
    scene,
    teardown: () => {
      disposeObject(root)
      renderer.dispose()
    },
  }
}
