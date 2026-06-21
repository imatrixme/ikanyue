import * as THREE from 'three'

export function faceted<TGeometry extends THREE.BufferGeometry>(
  geometry: TGeometry,
) {
  const flatGeometry = geometry.index ? geometry.toNonIndexed() : geometry
  flatGeometry.computeVertexNormals()
  if (flatGeometry !== geometry) {
    geometry.dispose()
  }
  return flatGeometry
}

export function standardMaterial(color: number, roughness: number) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0,
    roughness,
  })
}

export function basicMaterial(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    depthWrite: opacity >= 1,
    opacity,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
  })
}
