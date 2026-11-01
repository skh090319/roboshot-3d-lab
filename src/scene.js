import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRobot, buildCourt, buildHoop, buildBall } from './models.js';
import { createNeonTrajectory } from './trajectory.js';

const base = import.meta.env.BASE_URL;
export function createSimulation(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1721);
  scene.fog = new THREE.Fog(0x0c1721, 22, 47);
  const camera = new THREE.PerspectiveCamera(44, 1, .08, 80);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute('aria-label', '농구 로봇과 실내 코트 3D 시뮬레이션. 드래그로 회전, 휠로 확대합니다.');
  renderer.domElement.style.display = 'block';
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.maxPolarAngle = Math.PI / 2 - .035;
  controls.minDistance = 1.5;
  controls.maxDistance = 27;
  controls.enablePan = true;
  const ambient = new THREE.HemisphereLight(0xd9efff, 0x3c382e, 2.1);
  scene.add(ambient);
  const mainLight = new THREE.DirectionalLight(0xfff0d8, 3.5);
  mainLight.position.set(-2, 10, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  Object.assign(mainLight.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: .5, far: 28 });
  mainLight.shadow.bias = -.0003;
  mainLight.shadow.normalBias = .025;
  scene.add(mainLight);
  const fill = new THREE.DirectionalLight(0x75c6df, 1.5); fill.position.set(7, 6, -6); scene.add(fill);

  const stage = new THREE.Group(); scene.add(stage);
  let robot = buildRobot(), court = buildCourt(), hoop = buildHoop();
  stage.add(robot, court, hoop);
  const ball = buildBall(); scene.add(ball);
  let params = { height: 2, distance: 4 }, pose = 0, ballState = { x: 0, y: 2, z: 0, t: 0 };
  const loaded = { robot: false, court: false, hoop: false }, modelErrors = [];
  let robotMixer, shootingAction, shootingActions = [], currentPreset = 'overview', disposed = false;

  function basicBox(size, position, color, materialOptions = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .85, ...materialOptions }));
    mesh.position.set(...position); mesh.receiveShadow = true; return mesh;
  }
  const room = new THREE.Group(); scene.add(room);
  const backWall = basicBox([22, 5.3, .20], [3.4, 2.5, -7.35], 0x172d38);
  room.add(backWall);
  for (let i = 0; i < 8; i++) {
    room.add(basicBox([.10, 5.15, .18], [-6.5 + i * 2.8, 2.5, -7.18], 0x28404a));
  }
  room.add(basicBox([22, .09, .10], [3.4, .7, -7.18], 0x3b555e));
  room.add(basicBox([22, .035, .06], [3.4, 3.95, -7.18], 0x507a83, { emissive: 0x284d56, emissiveIntensity: .3 }));
  const outerGround = basicBox([70, .1, 60], [0, -.27, 0], 0x10222b); scene.add(outerGround);

  function textPlane(text, width, height, style = {}) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `${style.weight ?? 700} ${style.fontSize ?? 62}px Arial, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = style.color ?? '#b7d2d8'; context.fillText(text, 512, 80);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const object = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    return object;
  }
  const wallTitle = textPlane('ROBOSHOT   /   TRAINING LAB', 6.0, .95, { fontSize: 51 });
  wallTitle.position.set(1.1, 3.05, -7.225); room.add(wallTitle);
  const wallSubtitle = textPlane('PHYSICS IN MOTION     —     BAY 01', 4.8, .55, { fontSize: 39, weight: 400, color: '#72939f' });
  wallSubtitle.position.set(1.1, 2.48, -7.22); room.add(wallSubtitle);
  const trainingMark = textPlane('01', 1.3, 1.1, { fontSize: 105, color: '#568184' });
  trainingMark.position.set(7.0, 2.9, -7.22); room.add(trainingMark);

  let trajectory;
  const releaseMarker = new THREE.Mesh(new THREE.RingGeometry(.22, .24, 40), new THREE.MeshBasicMaterial({ color: 0x6af0db, side: THREE.DoubleSide, transparent: true, opacity: .75 }));
  releaseMarker.rotation.x = -Math.PI / 2; releaseMarker.position.set(0, .027, 0); scene.add(releaseMarker);
  const measureMaterial = new THREE.LineDashedMaterial({ color: 0x96c6c6, transparent: true, opacity: .65, dashSize: .08, gapSize: .07 });
  let measure, distanceLabel;
  function updateMeasure() {
    if (measure) { scene.remove(measure); measure.geometry.dispose(); }
    const points = [[0, .026, .65], [params.distance, .026, .65]];
    measure = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), measureMaterial);
    measure.computeLineDistances(); scene.add(measure);
    if (distanceLabel) { scene.remove(distanceLabel); distanceLabel.material.map.dispose(); distanceLabel.geometry.dispose(); distanceLabel.material.dispose(); }
    distanceLabel = textPlane(`${params.distance.toFixed(2)} m`, 1.05, .20, { fontSize: 74, color: '#c1e0da' });
    distanceLabel.rotation.x = -Math.PI / 2;
    distanceLabel.position.set(params.distance * .5, .032, .92); scene.add(distanceLabel);
  }

  function setConditions(next) {
    params = { ...params, ...next };
    robot.position.set(-.43, 0, 0);
    // This adjustable teaching robot is scaled to the requested release height;
    // the regulation basket and the ball always retain their real dimensions.
    const scale = params.height / 2;
    robot.scale.setScalar(scale); robot.position.x = -.43 * scale;
    hoop.position.set(params.distance, 0, 0);
    court.position.x = params.distance - 8.3;
    room.position.x = params.distance - 4;
    updateMeasure();
    setBallState({ x: 0, y: params.height, z: 0, t: 0 });
    setShotPose(pose);
  }

  function setBallState(state) {
    ballState = state;
    ball.position.set(state.x, Math.max(.12, state.y), state.z ?? 0);
    // Seam orientation remains fixed: rotation is excluded from the ideal mechanics model.
  }
  function setShotPose(progress = 0) {
    pose = Math.max(0, Math.min(2, progress));
    if (pose <= 1) {
      const dip = Math.sin(pose * Math.PI) * params.height / 2;
      ball.position.set(.03 * dip, params.height - .12 * dip, 0);
    }
    if (robotMixer && shootingAction) {
      // Deterministic pose sampling also clears LoopOnce's paused/end state so
      // RESET and every subsequent shot reproduce exactly the same animation.
      shootingActions.forEach(action => { action.reset(); action.play(); });
      robotMixer.setTime(pose === 0 ? 0 : pose <= 1 ? pose * .65 : .65 + (pose - 1) * .65);
      return;
    }
    const follow = THREE.MathUtils.smoothstep(pose - 1, 0, 1);
    const shoulder = pose <= 1 ? 1.65 - .25 * Math.sin(pose * Math.PI) : 1.65 + .70 * follow;
    const elbow = pose <= 1 ? 1.35 + .15 * Math.sin(pose * Math.PI) : 1.35 - 1.20 * follow;
    for (const side of ['left', 'right']) {
      const shoulderJoint = robot.getObjectByName(`shoulder_${side}`), elbowJoint = robot.getObjectByName(`elbow_${side}`);
      if (shoulderJoint) shoulderJoint.rotation.z = shoulder;
      if (elbowJoint) elbowJoint.rotation.z = elbow;
    }
  }
  function setTrajectory(samples) {
    if (trajectory) { scene.remove(trajectory); trajectory.traverse(object => object.geometry?.dispose()); }
    if (!samples?.length) return;
    trajectory = createNeonTrajectory(samples);
    scene.add(trajectory);
  }

  function setCamera(preset = 'overview') {
    currentPreset = preset;
    const d = params.distance;
    const positions = {
      overview: { position: [-4.2, 5.5 + d * .13, 8.0 + d * .22], target: [d * .43, 1.40, 0] },
      side: { position: [d * .45, 2.5, 6 + d * .67], target: [d * .45, 2.2, 0] },
      robot: { position: [-1.25, Math.max(1.65, params.height + .35), .8], target: [d, 3.05, 0] },
      hoop: { position: [d + 2.1, 4.4, 3.1], target: [d * .45, 1.8, 0] },
    };
    const selected = positions[preset] ?? positions.overview;
    camera.position.set(...selected.position); controls.target.set(...selected.target); controls.update();
  }
  function setQuality(quality) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.5));
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.setSize(host.clientWidth, host.clientHeight, false);
  }
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);

  const loader = new GLTFLoader();
  // Static Blender parts are batched per material to keep the detailed court inexpensive.
  function batchStaticModel(source) {
    source.updateMatrixWorld(true);
    const byMaterial = new Map();
    source.traverse(object => {
      if (!object.isMesh || Array.isArray(object.material)) return;
      const key = object.material.uuid;
      if (!byMaterial.has(key)) byMaterial.set(key, { material: object.material, geometries: [] });
      byMaterial.get(key).geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    });
    const batched = new THREE.Group(); batched.name = source.name;
    for (const { material, geometries } of byMaterial.values()) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry) return source;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
      batched.add(mesh); geometries.forEach(g => g.dispose());
    }
    source.traverse(object => object.geometry?.dispose());
    return batched;
  }
  const ready = Promise.all(['robot', 'court', 'hoop'].map(async name => {
    try {
      const gltf = await loader.loadAsync(`${base}models/${name}.glb`);
      if (disposed) return;
      gltf.scene.traverse(object => {
        if (object.isMesh) {
          object.castShadow = name !== 'court'; object.receiveShadow = true;
          if (object.material?.transparent) object.castShadow = false;
        }
      });
      if (name === 'robot') {
        stage.remove(robot); robot = gltf.scene; stage.add(robot);
        if (gltf.animations.length) {
          robotMixer = new THREE.AnimationMixer(robot);
          shootingActions = gltf.animations.map(clip => robotMixer.clipAction(clip));
          shootingActions.forEach(action => { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); });
          shootingAction = shootingActions[0];
        }
      }
      if (name === 'court') { stage.remove(court); court = batchStaticModel(gltf.scene); court.traverse(o => { o.castShadow = false; }); stage.add(court); }
      if (name === 'hoop') { stage.remove(hoop); hoop = batchStaticModel(gltf.scene); stage.add(hoop); }
      loaded[name] = true;
      const saved = ballState; setConditions(params); setBallState(saved);
    } catch (error) {
      modelErrors.push(`${name}: ${error.message}`);
      // Procedural model already present, so a failed asset load cannot interrupt physics.
      console.warn(`RoboShot ${name} GLB load failed; using procedural model.`, error);
    }
  }));

  function diagnostics() {
    return {
      loadedGLB: { ...loaded }, errors: [...modelErrors], units: 'metres', axes: '+X forward / +Y up',
      rimCentre: [hoop.position.x, 3.05, 0], innerRimDiameter: .45, ballRadius: .12,
      robotAnimation: Boolean(shootingAction), cameraPreset: currentPreset,
      renderedFrames: renderer.info.render.frame, drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      ballPosition: ball.position.toArray(), cameraPosition: camera.position.toArray(),
    };
  }
  function dispose() {
    disposed = true; resizeObserver.disconnect(); controls.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material) { materials.add(material); if (material.map) textures.add(material.map); }
      }
    });
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    renderer.dispose(); renderer.domElement.remove();
  }
  setConditions(params); setCamera(); resize();
  return {
    setConditions, setBallState, setTrajectory, setShotPose, setCamera, setQuality, resize, dispose, ready, diagnostics,
    render() { controls.update(); renderer.render(scene, camera); },
  };
}
