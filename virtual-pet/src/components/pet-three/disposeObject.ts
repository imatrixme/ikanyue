import type * as THREE from 'three'

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()

  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      geometries.add(mesh.geometry)
    }

    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((item) => materials.add(item))
    } else if (material) {
      materials.add(material)
    }
  })

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}
