import * as THREE from 'three';

// Layered unlit tubes give a readable red glow without a full-screen bloom pass.
// Points are the same analytical trajectory samples used by the charts.
const layers = [
  { radius: .070, color: 0xff0022, opacity: .10 },
  { radius: .034, color: 0xff0928, opacity: .28 },
  { radius: .013, color: 0xff293b, opacity: 1 },
];
const materials = layers.map(({ color, opacity }) => new THREE.MeshBasicMaterial({
  color, opacity, transparent: opacity < 1, toneMapped: false,
  depthWrite: false, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
}));

export function createNeonTrajectory(samples) {
  const points = samples.map(s => new THREE.Vector3(s.x, Math.max(.12, s.y), s.z ?? 0));
  const curve = new THREE.CatmullRomCurve3(points);
  const group = new THREE.Group();
  group.name = 'red-neon-trajectory';
  layers.forEach(({ radius }, index) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, samples.length - 1, radius, 6, false), materials[index]);
    mesh.renderOrder = 3 + index;
    group.add(mesh);
  });
  return group;
}
