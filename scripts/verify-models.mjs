import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildRobot, robotAnimation } from '../src/models.js';

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
  return shoulder.quaternion.clone().normalize();
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
function verifyContactGrip(model,label) {
  const localMixer=new THREE.AnimationMixer(model.scene), localActions=model.animations.map(clip=>localMixer.clipAction(clip));
  assert.equal(model.animations.reduce((n,clip)=>n+clip.tracks.length,0),8,'Four original arm tracks plus four contact-grip tracks');
  let maxAnchorSeparation=0,maxAnchorPathError=0,minHandSurfaceRadius=Infinity,minNormalDot=1,maxWristBendDegrees=0;
  const releaseAnchors=[];
  const thumbChecks=[];
  for(const t of [0,.12,.2667,.325,.49,.65]) {
    localActions.forEach(action=>action.reset().play());localMixer.setTime(t);model.scene.updateMatrixWorld(true);
    const dip=t===.65?0:Math.sin(Math.PI*t/.65);
    const expected=new THREE.Vector3(.43+.03*dip,2-.12*dip,0);
    const anchors=['left','right'].map(side=>model.scene.getObjectByName(`grip_ball_center_${side}`).getWorldPosition(new THREE.Vector3()));
    maxAnchorSeparation=Math.max(maxAnchorSeparation,anchors[0].distanceTo(anchors[1]));
    const heldBall=anchors[0].clone().add(anchors[1]).multiplyScalar(.5);
    for(let i=0;i<2;i++) {
      const side=i===0?'left':'right',palm=model.scene.getObjectByName(`palm_${side}`);
      const marker=model.scene.getObjectByName(`palm_normal_${side}`),contact=model.scene.getObjectByName(`grip_contact_${side}`);
      const position=palm.getWorldPosition(new THREE.Vector3()),normal=marker.getWorldPosition(new THREE.Vector3()).sub(position).normalize();
      const dot=normal.dot(heldBall.clone().sub(position).normalize());minNormalDot=Math.min(minNormalDot,dot);
      const contactDistance=contact.getWorldPosition(new THREE.Vector3()).distanceTo(heldBall);
      assert.ok(Math.abs(contactDistance-.12)<.005,`${label}: grip pad touches the ball within5mm`);
      assert.ok(dot>.999,`${label}: grip normal faces the ball`);
      maxAnchorPathError=Math.max(maxAnchorPathError,anchors[i].distanceTo(expected));
      if(t===.65){assert.ok(anchors[i].distanceTo(new THREE.Vector3(.43,2,0))<1e-6,'Release at0.65s is exactly the physical release position');releaseAnchors.push(anchors[i].toArray());}
      const forearm=new THREE.Vector3(0,-1,0).transformDirection(model.scene.getObjectByName(`elbow_${side}`).matrixWorld);
      const handAlong=new THREE.Vector3(1,0,0).transformDirection(palm.matrixWorld);
      maxWristBendDegrees=Math.max(maxWristBendDegrees,THREE.MathUtils.radToDeg(forearm.angleTo(handAlong)));
      if(t===0) {
        let thumb;
        palm.traverse(object=>{if(object.name.replaceAll(' ','_')===`Compact_opposed_thumb_${side}`)thumb=object;});
        assert.ok(thumb,`${label}: each hand has its opposed thumb`);
        const palmInverse=palm.matrixWorld.clone().invert(),localBounds=new THREE.Box3(),v=new THREE.Vector3();
        const attribute=thumb.geometry.attributes.position;
        for(let j=0;j<attribute.count;j++)localBounds.expandByPoint(v.fromBufferAttribute(attribute,j).applyMatrix4(thumb.matrixWorld).applyMatrix4(palmInverse));
        const localCentre=localBounds.getCenter(new THREE.Vector3());
        const thumbOffset=localCentre.clone().applyMatrix4(palm.matrixWorld).sub(position);
        const anatomicalSide=side==='left'?-1:1;
        assert.ok(localCentre.z*anatomicalSide>.025,`${label}: thumb is on the anatomical opposition side of the palm`);
        assert.ok(thumbOffset.x<-.025,`${label}: thumbs face the robot/shooter, not the basket`);
        thumbChecks.push({side,palmLocalAcross:localCentre.z,worldOffsetX:thumbOffset.x});
      }
      palm.traverse(object=>{if(object.isMesh){const attribute=object.geometry.attributes.position,v=new THREE.Vector3();for(let j=0;j<attribute.count;j++)minHandSurfaceRadius=Math.min(minHandSurfaceRadius,v.fromBufferAttribute(attribute,j).applyMatrix4(object.matrixWorld).distanceTo(heldBall));}});
    }
  }
  assert.ok(maxAnchorSeparation<.0001,`${label}: both hands hold the same ball during preparation`);
  assert.ok(maxAnchorPathError<.0005,`${label}: preparation follows the held-ball path`);
  assert.ok(minHandSurfaceRadius>=.1199,`${label}: fingers and pad do not penetrate the0.12m ball`);
  assert.ok(maxWristBendDegrees<60,`${label}: upright hand continues the forearm instead of a90degree bend`);
  return {label,maxAnchorSeparation,maxAnchorPathError,minHandSurfaceRadius,minNormalDot,maxWristBendDegrees,releaseAnchors,thumbChecks};
}
const gripChecks=[verifyContactGrip(robot,'Blender GLB'),verifyContactGrip({scene:buildRobot(),animations:[robotAnimation()]},'Three.js fallback')];
report.validation = { rimCentre: centre.toArray(), rimInnerRadius: minRadius, rimOuterRadius: maxRadius, robotAnimationRadiansChanged: before.angleTo(after), animationResetReplayPasses: 2, gripChecks, axes: 'X forward, Y up; one Blender metre equals one Three.js unit' };
await writeFile(new URL('../public/models/model-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('PASS: Blender origin, metres, Y-up conversion, regulation rim and exported joint animation.');
