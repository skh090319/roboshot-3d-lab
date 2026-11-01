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
const wristChecks = [];
const heldBall = new THREE.Vector3(.43, 2, 0); // Robot origin is placed at X=-0.43 in the web scene.
for (const side of ['left', 'right']) {
  const palm = robot.scene.getObjectByName(`palm_${side}`);
  const marker = robot.scene.getObjectByName(`palm_normal_${side}`);
  const wrist = robot.scene.getObjectByName(`wrist_roll_${side}`);
  assert.ok(palm && marker && wrist, 'Hand, normal marker and explicit wrist roll pivot are exported');
  const expectedRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, -1, 0), Math.PI);
  assert.ok(wrist.quaternion.angleTo(expectedRoll) < 1e-5, 'Wrist has the requested exact180degree rotation around the forearm length axis');
  assert.ok(wrist.position.distanceTo(new THREE.Vector3(0, -.29, 0)) < 1e-6, 'Wrist rotation uses the existing forearm-end pivot');
  const unrolledMatrix = wrist.parent.matrixWorld.clone()
    .multiply(new THREE.Matrix4().makeTranslation(...wrist.position.toArray())).multiply(palm.matrix);
  const unrolledCentre = new THREE.Vector3().setFromMatrixPosition(unrolledMatrix);
  const previousCentre = new THREE.Vector3(.395, 1.90, side === 'left' ? -.095 : .095);
  assert.ok(unrolledCentre.distanceTo(previousCentre) < 1e-5, 'Child palm placement has not counteracted the requested wrist rotation');
  const unrolledNormal = new THREE.Vector3(0, 1, 0).transformDirection(unrolledMatrix);
  assert.ok(unrolledNormal.dot(heldBall.clone().sub(previousCentre).normalize()) > .999, 'Original pre-roll palm frame is preserved under the wrist pivot');
  const originalQuaternion = new THREE.Quaternion().setFromRotationMatrix(unrolledMatrix);
  const actualQuaternion = palm.getWorldQuaternion(new THREE.Quaternion());
  const actualRotationDegrees = THREE.MathUtils.radToDeg(originalQuaternion.angleTo(actualQuaternion));
  assert.ok(Math.abs(actualRotationDegrees - 180) < .001, 'Visible hand orientation actually changed180degrees without cancellation');
  const position = palm.getWorldPosition(new THREE.Vector3());
  const normal = marker.getWorldPosition(new THREE.Vector3()).sub(position).normalize();
  const toBall = heldBall.clone().sub(position).normalize();
  const dot = normal.dot(toBall);
  // Report the real post-roll direction. A forced dot=1 would silently undo the
  // user's explicit180degree wrist rotation, so it is no longer a requirement.
  assert.ok(position.y < heldBall.y && heldBall.y - position.y < .13, 'Palm supports the ball from below');
  wristChecks.push({ side, requestedRollDegrees: 180, actualRotationDegrees, axis: 'forearm local -Y', pivot: wrist.position.toArray(), uncompensated: true, centreInRobot: position.toArray(), actualPalmNormal: normal.toArray(), dotToBallAfterRoll: dot });
}
report.validation = { rimCentre: centre.toArray(), rimInnerRadius: minRadius, rimOuterRadius: maxRadius, robotAnimationRadiansChanged: before.angleTo(after), animationResetReplayPasses: 2, wristChecks, axes: 'X forward, Y up; one Blender metre equals one Three.js unit' };
await writeFile(new URL('../public/models/model-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('PASS: Blender origin, metres, Y-up conversion, regulation rim and exported joint animation.');
