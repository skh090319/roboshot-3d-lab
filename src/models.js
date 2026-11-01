import * as THREE from 'three';

// Authored in metres, X toward the basket, Y upward. No remote assets or textures.
const geometries = new Map();
const cached = (key, make) => {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
};
const boxGeo = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
const sphereGeo = () => cached('sphere', () => new THREE.SphereGeometry(1, 20, 12));
const cylinderGeo = () => cached('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20));
const materials = {
  armor: new THREE.MeshStandardMaterial({ color: 0xd9e4e7, roughness: .34, metalness: .55 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f3ed, roughness: .58, metalness: .18 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x18272e, roughness: .37, metalness: .7 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x10191e, roughness: .8 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x647e88, roughness: .27, metalness: .85 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x36d9c8, roughness: .32, metalness: .4, emissive: 0x0a7f78, emissiveIntensity: .23 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x164351, roughness: .55, metalness: .35 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x071a23, roughness: .13, metalness: .75 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe96126, roughness: .75 }),
  seam: new THREE.MeshStandardMaterial({ color: 0x2a201b, roughness: .9 }),
  line: new THREE.MeshStandardMaterial({ color: 0xd6e5e2, roughness: .85 }),
  net: new THREE.MeshStandardMaterial({ color: 0xdbe4de, roughness: .95 }),
};

function mesh(parent, geometry, material, position, scale) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function box(parent, dimensions, position, material = materials.armor, bevel = 0) {
  // Round bevels on primary armor keep the silhouette soft without subdivision.
  if (!bevel) return mesh(parent, boxGeo(), material, position, dimensions);
  const shape = new THREE.Shape();
  const w = dimensions[0] / 2, h = dimensions[1] / 2, r = Math.min(bevel, w, h);
  shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r); shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: dimensions[2] - 2 * r, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: r * .35, bevelThickness: r, curveSegments: 4 });
  geometry.translate(0, 0, -dimensions[2] / 2 + r);
  return mesh(parent, geometry, material, position);
}
function sphere(parent, r, position, material = materials.metal, scale = [1, 1, 1]) {
  return mesh(parent, sphereGeo(), material, position, scale.map(v => v * r));
}
function cylinder(parent, r, length, position, material = materials.metal, axis = 'y') {
  const object = mesh(parent, cylinderGeo(), material, position, [r, length, r]);
  if (axis === 'x') object.rotation.z = Math.PI / 2;
  if (axis === 'z') object.rotation.x = Math.PI / 2;
  return object;
}
function rod(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const object = cylinder(parent, radius, start.distanceTo(end), start.clone().add(end).multiplyScalar(.5).toArray(), material);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return object;
}

export function buildRobot() {
  const root = new THREE.Group();
  root.name = 'RoboShot_Robot';
  root.userData = { units: 'metres', forward: '+X', up: '+Y', source: 'Three.js procedural fallback', standingHeight: 1.94 };
  // Feet, segmented shins and thigh armor.
  for (const side of [-1, 1]) {
    const z = side * .16;
    box(root, [.36, .10, .19], [.075, .075, z], materials.dark, .025);
    box(root, [.27, .06, .17], [.09, .13, z], materials.armor, .02);
    box(root, [.035, .025, .14], [.22, .12, z], materials.teal);
    cylinder(root, .075, .16, [0, .21, z], materials.metal, 'z');
    box(root, [.15, .29, .16], [-.035, .38, z], materials.armor, .025);
    box(root, [.035, .22, .11], [.052, .39, z], materials.blue, .012);
    cylinder(root, .09, .19, [-.04, .57, z], materials.dark, 'z');
    cylinder(root, .048, .195, [-.04, .57, z], materials.teal, 'z');
    box(root, [.18, .32, .19], [-.015, .77, z], materials.armor, .035);
    rod(root, [-.10, .61, z + side * .095], [-.11, .89, z + side * .095], .017, materials.metal);
    sphere(root, .10, [0, .97, z], materials.dark);
  }
  box(root, [.27, .18, .43], [0, 1.03, 0], materials.dark, .035);
  box(root, [.29, .13, .37], [.022, 1.09, 0], materials.armor, .025);
  cylinder(root, .105, .12, [0, 1.17, 0], materials.metal);
  // Chest shell, spine and power pack.
  box(root, [.30, .37, .45], [0, 1.39, 0], materials.armor, .045);
  box(root, [.06, .22, .34], [.175, 1.41, 0], materials.dark, .025);
  box(root, [.012, .023, .25], [.214, 1.46, 0], materials.teal);
  box(root, [.012, .035, .065], [.214, 1.35, -.09], materials.white);
  box(root, [.09, .23, .27], [-.19, 1.39, 0], materials.blue, .025);
  for (let i = 0; i < 4; i++) box(root, [.015, .014, .20], [-.242, 1.32 + i * .04, 0], materials.metal);
  cylinder(root, .066, .10, [0, 1.64, 0], materials.dark);
  // Helmet: aerodynamic shell, dark wraparound visor and paired optical sensors.
  sphere(root, .18, [.018, 1.80, 0], materials.armor, [.87, .92, 1]);
  box(root, [.11, .105, .30], [.13, 1.81, 0], materials.lens, .027);
  box(root, [.012, .016, .23], [.192, 1.819, 0], materials.teal, .005);
  for (const side of [-1, 1]) {
    cylinder(root, .057, .025, [.015, 1.79, side * .173], materials.dark, 'z');
    cylinder(root, .025, .029, [.015, 1.79, side * .173], materials.teal, 'z');
    sphere(root, .021, [.195, 1.81, side * .09], materials.teal);
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'shoulder_left' : 'shoulder_right';
    shoulder.position.set(.01, 1.51, side * .29);
    root.add(shoulder);
    sphere(shoulder, .105, [0, 0, 0], materials.dark);
    cylinder(shoulder, .067, .22, [0, 0, 0], materials.armor, 'z');
    cylinder(shoulder, .03, .225, [0, 0, 0], materials.teal, 'z');
    box(shoulder, [.15, .24, .15], [0, -.17, 0], materials.armor, .028);
    box(shoulder, [.025, .17, .07], [.085, -.17, 0], materials.blue);
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? 'elbow_left' : 'elbow_right';
    elbow.position.set(0, -.31, 0); shoulder.add(elbow);
    cylinder(elbow, .068, .17, [0, 0, 0], materials.dark, 'z');
    cylinder(elbow, .035, .177, [0, 0, 0], materials.metal, 'z');
    box(elbow, [.12, .24, .14], [0, -.155, 0], materials.armor, .025);
    rod(elbow, [-.063, -.03, 0], [-.063, -.25, 0], .016, materials.metal);
    box(elbow, [.012, .11, .045], [.07, -.15, 0], materials.teal);
    sphere(elbow, .055, [0, -.29, 0], materials.dark);
    box(elbow, [.085, .09, .115], [.018, -.35, 0], materials.dark, .015);
    for (let f = 0; f < 3; f++) {
      box(elbow, [.034, .07, .024], [.024, -.417, -.037 + f * .037], materials.armor, .006);
    }
    box(elbow, [.05, .035, .025], [.06, -.34, side * .07], materials.armor, .006);
    shoulder.rotation.x = -side * .40;
    shoulder.rotation.z = 1.65;
    elbow.rotation.z = 1.35;
  }
  return root;
}

export function robotAnimation() {
  const tracks = [];
  const times = [0, .28, .65, .9, 1.15, 1.5];
  for (const side of ['left', 'right']) {
    const quaternions = (angles, inward = 0) => angles.flatMap(angle => new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), inward)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)).toArray());
    tracks.push(new THREE.QuaternionKeyframeTrack(`shoulder_${side}.quaternion`, times, quaternions([1.65, 1.40, 1.65, 2.18, 2.35, 2.32], side === 'left' ? .40 : -.40)));
    tracks.push(new THREE.QuaternionKeyframeTrack(`elbow_${side}.quaternion`, times, quaternions([1.35, 1.50, 1.35, .40, .15, .18])));
  }
  return new THREE.AnimationClip('RoboShot_Shooting', 1.5, tracks);
}

function floorLine(group, a, b, width = .035, material = materials.line) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const object = box(group, [Math.hypot(dx, dz), .008, width], [(a[0] + b[0]) / 2, .012, (a[1] + b[1]) / 2], material);
  object.rotation.y = -Math.atan2(dz, dx); object.castShadow = false;
  return object;
}
function courtArc(group, cx, cz, radius, start, end, material = materials.line) {
  const points = [];
  for (let i = 0; i <= 72; i++) {
    const a = start + (end - start) * i / 72;
    points.push(new THREE.Vector3(cx + Math.cos(a) * radius, .015, cz + Math.sin(a) * radius));
  }
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, .018, 4, false);
  const object = mesh(group, geometry, material); object.castShadow = false;
}

export function buildCourt() {
  const root = new THREE.Group(); root.name = 'RoboShot_Court';
  root.userData = { units: 'metres', forward: '+X', up: '+Y' };
  const woods = [0x96795a, 0xa48864, 0x9b805c, 0xa58a68, 0x92795b].map(color => new THREE.MeshStandardMaterial({ color, roughness: .61, metalness: .03 }));
  box(root, [17.5, .18, 14.2], [3.4, -.12, 0], materials.dark);
  for (let i = 0; i < 58; i++) {
    const material = woods[(i * 13 + 3) % woods.length];
    box(root, [17.35, .04, .236], [3.4, -.009, -6.85 + i * .239], material);
  }
  // Thin end grain seams at staggered positions create real parquet scale.
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x786144, roughness: .8 });
  for (let i = 0; i < 58; i++) {
    for (let j = 0; j < 5; j++) {
      const x = -4.3 + j * 3.3 + (i % 3) * .8;
      box(root, [.007, .003, .235], [x, .014, -6.85 + i * .239], seamMat).castShadow = false;
    }
  }
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x2d6669, roughness: .75 });
  box(root, [5.65, .006, 4.9], [6.28, .017, 0], keyMat).castShadow = false;
  const boundary = [[-4.8, -6.55], [10.9, -6.55], [10.9, 6.55], [-4.8, 6.55], [-4.8, -6.55]];
  for (let i = 1; i < boundary.length; i++) floorLine(root, boundary[i - 1], boundary[i], .045);
  floorLine(root, [-4.8, -6.55], [-4.8, 6.55]);
  courtArc(root, -4.8, 0, 1.8, -Math.PI / 2, Math.PI / 2);
  floorLine(root, [3.45, -2.45], [9.1, -2.45]);
  floorLine(root, [3.45, 2.45], [9.1, 2.45]);
  floorLine(root, [3.45, -2.45], [3.45, 2.45]);
  courtArc(root, 3.45, 0, 1.8, Math.PI / 2, Math.PI * 1.5);
  courtArc(root, 8.3, 0, 6.25, Math.PI * .39, Math.PI * 1.61);
  courtArc(root, 8.3, 0, 1.25, Math.PI / 2, Math.PI * 1.5);
  return root;
}

export function buildHoop() {
  const root = new THREE.Group(); root.name = 'RoboShot_Hoop';
  root.userData = { units: 'metres', hoopHeight: 3.05, innerRimRadius: .225, forward: '+X', up: '+Y' };
  // Origin is the rim centre horizontally. The rim's inner edge is 0.225m.
  const rim = mesh(root, new THREE.TorusGeometry(.2375, .0125, 10, 72), materials.orange, [0, 3.05, 0]);
  rim.name = 'Rim_3_05m_450mm'; rim.rotation.x = Math.PI / 2;
  box(root, [.20, .026, .12], [.29, 3.05, 0], materials.orange);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xd1e8ea, roughness: .12, metalness: .05, transparent: true, opacity: .19, depthWrite: false, side: THREE.DoubleSide });
  box(root, [.025, 1.05, 1.80], [.39, 3.53, 0], glass).castShadow = false;
  const trim = materials.white;
  for (const z of [-.90, .90]) box(root, [.052, 1.10, .035], [.39, 3.53, z], trim);
  for (const y of [3.005, 4.055]) box(root, [.052, .035, 1.83], [.39, y, 0], trim);
  for (const z of [-.295, .295]) box(root, [.014, .45, .022], [.369, 3.32, z], trim);
  for (const y of [3.095, 3.545]) box(root, [.014, .022, .61], [.369, y, 0], trim);
  box(root, [.075, .12, 1.82], [.40, 2.98, 0], materials.blue);
  // Freestanding cantilever, padded base and mechanical supports.
  box(root, [1.10, .22, 1.05], [1.62, .13, 0], materials.dark, .04);
  box(root, [.52, 2.55, .42], [1.75, 1.44, 0], materials.blue, .035);
  box(root, [.08, 1.6, .47], [1.45, 1.12, 0], materials.dark, .025);
  rod(root, [1.75, 2.65, -.14], [.62, 3.75, -.14], .065, materials.metal);
  rod(root, [1.75, 2.65, .14], [.62, 3.75, .14], .065, materials.metal);
  rod(root, [.64, 3.75, -.14], [.47, 3.75, -.14], .06, materials.metal);
  rod(root, [.64, 3.75, .14], [.47, 3.75, .14], .06, materials.metal);
  for (const z of [-.47, .47]) for (const x of [1.25, 1.96]) cylinder(root, .09, .07, [x, .10, z], materials.rubber, 'z');
  // Diamond net. Lines are actual thin mesh rods so they survive GLB export.
  const segments = 12, layers = 5;
  for (let layer = 0; layer < layers; layer++) {
    const r1 = .224 - layer * .019, r2 = .224 - (layer + 1) * .019;
    const y1 = 3.035 - layer * .085, y2 = y1 - .085;
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2 + (layer % 2) * Math.PI / segments;
      for (const dir of [-1, 1]) {
        const b = a + dir * Math.PI / segments;
        rod(root, [Math.cos(a) * r1, y1, Math.sin(a) * r1], [Math.cos(b) * r2, y2, Math.sin(b) * r2], .0033, materials.net).castShadow = false;
      }
    }
  }
  return root;
}

export function buildBall() {
  const root = new THREE.Group(); root.name = 'Basketball_radius_0_12m';
  sphere(root, .12, [0, 0, 0], materials.orange);
  const seamGeometry = new THREE.TorusGeometry(.1201, .0016, 4, 64);
  for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0], [0, Math.PI / 4, Math.PI / 4]]) {
    const seam = mesh(root, seamGeometry, materials.seam); seam.rotation.set(...rotation);
  }
  return root;
}
