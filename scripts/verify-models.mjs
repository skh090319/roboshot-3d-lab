import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const models = {}, report = { verifiedWith: 'Three.js GLTFLoader', models: {} };
for (const name of ['robot', 'court', 'hoop']) {
  const file = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url));
  const json = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  assert.match(json.asset.generator, /Blender/);
  assert.equal(json.scenes.length, 1, 'Only authored model scene is exported');
  const model = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  model.scene.updateMatrixWorld(true); models[name] = model;
  const bounds = new THREE.Box3().setFromObject(model.scene);
  assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
  report.models[name] = { bytes: file.byteLength, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, animationTracks: model.animations.reduce((n,a) => n+a.tracks.length, 0), generator: json.asset.generator };
}
const rim = models.hoop.scene.getObjectByName('Rim_3_05m_450mm');
assert.ok(rim, 'Named rim exists');
const rimBounds = new THREE.Box3().setFromObject(rim), centre = rimBounds.getCenter(new THREE.Vector3());
assert.ok(Math.abs(centre.y - 3.05) < 1e-5, 'Rim is exactly3.05m in Three Y-up coordinates');
assert.ok(Math.abs(centre.x) < 1e-5 && Math.abs(centre.z) < 1e-5);
let minRadius = Infinity, maxRadius = 0;
const vertex = new THREE.Vector3(), positions = rim.geometry.attributes.position;
for (let i = 0; i < positions.count; i++) {
  vertex.fromBufferAttribute(positions, i).applyMatrix4(rim.matrixWorld);
  const radius = Math.hypot(vertex.x - centre.x, vertex.z - centre.z);
  minRadius = Math.min(radius, minRadius); maxRadius = Math.max(radius, maxRadius);
}
assert.ok(Math.abs(minRadius - .225) < .001, 'Rim inner radius is0.225m');
assert.ok(Math.abs(maxRadius - .25) < .001);
const robot = models.robot, shoulder = robot.scene.getObjectByName('shoulder_left');
assert.ok(shoulder && robot.animations.length);
const mixer = new THREE.AnimationMixer(robot.scene);
const actions = robot.animations.map(clip => mixer.clipAction(clip));
actions.forEach(action => { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; });
function sample(time) {
  actions.forEach(action => { action.reset(); action.play(); });
  mixer.setTime(time);
  return shoulder.quaternion.clone();
}
const before = sample(0), after = sample(.30);
assert.ok(before.angleTo(after) > .1, 'Blender shoulder animation moves in Three.js');
for (let repeat = 0; repeat < 2; repeat++) {
  sample(1.6); // Deliberately finish/clamp the clip, then RESET and replay.
  assert.ok(before.angleTo(sample(0)) < 1e-6, 'RESET restores initial joint pose after a finished action');
  assert.ok(after.angleTo(sample(.30)) < 1e-6, 'Repeated shot reaches identical joint pose');
}
assert.ok(report.models.robot.bounds.max[1] > 1.8 && report.models.robot.bounds.max[1] < 2.1);
assert.ok(report.models.court.bounds.max[1] < .1, 'Court lies in the XZ floor plane');
sample(0); robot.scene.updateMatrixWorld(true);
const palmChecks = [];
const heldBall = new THREE.Vector3(.43, 2, 0); // Robot origin is placed at X=-0.43 in the web scene.
for (const side of ['left', 'right']) {
  const palm = robot.scene.getObjectByName(`palm_${side}`);
  const marker = robot.scene.getObjectByName(`palm_normal_${side}`);
  assert.ok(palm && marker, 'Palm frame and grip-normal marker are exported');
  const position = palm.getWorldPosition(new THREE.Vector3());
  const normal = marker.getWorldPosition(new THREE.Vector3()).sub(position).normalize();
  const toBall = heldBall.clone().sub(position).normalize();
  const dot = normal.dot(toBall);
  assert.ok(dot > .99, 'Palmar grip surface faces the ball, never the back of the hand');
  assert.ok(position.y < heldBall.y && heldBall.y - position.y < .13, 'Palm supports the ball from below');
  palmChecks.push({ side, centreInRobot: position.toArray(), normalTowardBall: normal.toArray(), dotToBall: dot });
}
report.validation = { rimCentre: centre.toArray(), rimInnerRadius: minRadius, rimOuterRadius: maxRadius, robotAnimationRadiansChanged: before.angleTo(after), animationResetReplayPasses: 2, palmChecks, axes: 'X forward, Y up; one Blender metre equals one Three.js unit' };
await writeFile(new URL('../public/models/model-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('PASS: Blender origin, metres, Y-up conversion, regulation rim and exported joint animation.');
