import './style.css';
import './styles-responsive.css';
import './theory.css';
import { renderTheory } from './theory.js';
import { DEFAULTS, LIMITS, validateParams, requiredSpeed, optimizeShot, stateAt, apex, flightTime, evaluateShot, sampleTrajectory, runExperiment } from './physics.js';
import { createSimulation } from './scene.js';
import { createCharts, createExperimentChart } from './charts.js';

const $ = (id) => document.getElementById(id);
renderTheory($('theory-content'));
let params = { ...DEFAULTS }, mode = 'manual', phase = 'ready', elapsed = 0, windup = 0, previousPhase = 'ready';
let duration = flightTime(params), prediction = evaluateShot(params), verdictShown = false, expanded = null;
const specs = [
  ['angle', '발사 각도', 'θ', '°', .1, 3], ['speed', '초기 속력', 'v₀', 'm/s', .01, 3],
  ['height', '발사 높이', 'h', 'm', .05, 2], ['distance', '골대까지 거리', 'd', 'm', .1, 2],
  ['mass', '공의 질량', 'm', 'kg', .01, 2], ['playback', '재생 속도', '', '×', .1, 1],
];
$('control-fields').innerHTML = specs.map(([key, label, symbol, unit, step]) => {
  const [min, max] = LIMITS[key];
  return `<div class="control"><div class="control-top"><label for="${key}-number">${label}<small>${symbol}</small></label><div class="number-unit"><input id="${key}-number" type="number" min="${min}" max="${max}" step="${step}" aria-label="${label}"><span>${unit}</span></div></div><input id="${key}-range" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label} 슬라이더"><div class="range-labels"><span>${min}${unit}</span><span>${max}${unit}</span></div></div>`;
}).join('');

const charts = createCharts(Object.fromEntries(['height', 'speed', 'energy', 'total'].map((key) => [key, $(`chart-${key}`)])));
let simulation;
try { simulation = createSimulation($('scene')); }
catch (error) {
  $('scene-loading').textContent = `3D 초기화 실패: ${error.message}. 브라우저의 하드웨어 가속을 확인하세요.`;
  $('shoot').disabled = true;
  console.error(error);
}
function message(text, error = false) { $('input-message').textContent = text; $('input-message').classList.toggle('error', error); }
function syncInputs(force = false) {
  specs.forEach(([key, , , , , digits]) => {
    if (force || document.activeElement !== $(`${key}-number`)) $(`${key}-number`).value = Number(params[key].toFixed(digits));
    $(`${key}-range`).value = params[key];
  });
  $('speed-number').disabled = mode === 'auto'; $('speed-range').disabled = mode === 'auto';
}
function showStatus(label, detail, kind = '') {
  $('result-label').textContent = label; $('result-detail').textContent = detail;
  $('shot-result').className = `shot-result ${kind}`;
}
function updateTelemetry(state) {
  [['x', 'x', 'm'], ['height', 'y', 'm'], ['speed', 'speed', 'm/s'], ['kinetic', 'kinetic', 'J'], ['potential', 'potential', 'J'], ['total', 'total', 'J']].forEach(([id, key, unit]) => {
    $(`value-${id}`).innerHTML = `${state[key].toFixed(2)}<small>${unit}</small>`;
  });
  $('flight-clock').textContent = `${state.t.toFixed(2)} s`;
  $('time-progress').style.width = `${Math.min(100, state.t / duration * 100)}%`;
  document.body.dataset.simulationTime = state.t.toFixed(6);
}
function setPhase(next) {
  phase = next; document.body.dataset.phase = phase;
  const busy = ['windup', 'flying', 'paused'].includes(phase);
  $('conditions').disabled = busy;
  ['manual-mode','auto-mode','auto-calculate','optimize'].forEach(id => $(id).disabled = busy);
  $('shoot').disabled = busy || !simulation || (mode === 'auto' && !requiredSpeed(params).ok);
  $('pause').disabled = !busy;
  $('pause').textContent = phase === 'paused' ? '▶ RESUME' : 'Ⅱ PAUSE';
}
function reset() {
  elapsed = 0; windup = 0; verdictShown = false;
  setPhase('ready');
  simulation?.setShotPose(0); simulation?.setBallState(stateAt(params, 0));
  charts.setTime(0); updateTelemetry(stateAt(params, 0));
  showStatus('READY', '발사 조건을 조절한 뒤 슈팅을 시작하세요');
}
function refresh() {
  duration = flightTime(params); prediction = evaluateShot(params);
  const top = apex(params), samples = sampleTrajectory(params);
  simulation?.setConditions(params); simulation?.setTrajectory(samples);
  charts.setTrajectory(samples);
  $('apex-height').textContent = `${top.height.toFixed(2)} m`;
  $('apex-time').textContent = `${top.time.toFixed(3)} s`;
  $('predicted-result').textContent = prediction.success ? 'SUCCESS · 하강 통과' : prediction.crossingTime === null ? 'MISS · 높이 부족' : `MISS · 오차 ${prediction.offset.toFixed(3)} m`;
  $('predicted-result').classList.toggle('good', prediction.success);
  $('dimension-chip').textContent = `림 높이 3.05 m · 거리 ${params.distance.toFixed(2)} m`;
  syncInputs(); reset();
}
function changeValue(key, raw) {
  if (['windup','flying','paused'].includes(phase)) return;
  const value = raw === '' ? NaN : Number(raw), candidate = { ...params, [key]: value };
  const checked = validateParams(candidate);
  if (!checked.valid) { message(checked.errors[0], true); syncInputs(true); setPhase(phase); return; }
  params = candidate;
  if (mode === 'auto' && key !== 'speed') {
    const solution = requiredSpeed(params);
    if (solution.ok) { params.speed = solution.speed; message(`자동 계산: ${solution.speed.toFixed(4)} m/s · 하강 통과 여부를 별도로 확인합니다.`); }
    else message(solution.error, true);
  } else message('수동 조건이 적용되었습니다. 궤적과 에너지는 입력 즉시 갱신됩니다.');
  refresh();
}
for (const [key] of specs) {
  $(`${key}-range`).addEventListener('input', e => changeValue(key, e.target.value));
  $(`${key}-number`).addEventListener('input', e => {
    const candidate = { ...params, [key]: e.target.value === '' ? NaN : Number(e.target.value) };
    const checked = validateParams(candidate);
    if (checked.valid) changeValue(key, e.target.value);
    else { message(checked.errors[0], true); $('shoot').disabled = true; }
  });
  $(`${key}-number`).addEventListener('change', e => changeValue(key, e.target.value));
}
function setMode(next) {
  mode = next;
  $('manual-mode').classList.toggle('active', mode === 'manual');
  $('auto-mode').classList.toggle('active', mode === 'auto');
  syncInputs();
  if (mode === 'auto') calculate(false); else { syncInputs(); setPhase(phase); message('각도와 속력을 독립적으로 조절할 수 있습니다.'); }
}
function calculate(optimize) {
  const solution = optimize ? optimizeShot(params) : requiredSpeed(params);
  if (!solution.ok) { message(solution.error, true); setPhase(phase); return; }
  params.speed = solution.speed;
  if (optimize) params.angle = solution.angle;
  refresh();
  message(optimize ? `최소 초기 속력: ${params.angle.toFixed(3)}° / ${params.speed.toFixed(4)} m/s. 득점 확률의 최적값은 아닙니다.` : `계산 완료: ${params.speed.toFixed(4)} m/s. ${prediction.success ? '하강 통과 조건도 만족합니다.' : '높이 일치만으로 득점하지 않습니다.'}`);
}
$('manual-mode').onclick = () => setMode('manual'); $('auto-mode').onclick = () => setMode('auto');
$('auto-calculate').onclick = () => calculate(false); $('optimize').onclick = () => calculate(true);
function shoot() {
  if ($('shoot').disabled) return;
  reset(); setPhase('windup'); showStatus('PREPARING', '관절 정렬 · 발사 준비');
}
function pause() {
  if (phase === 'paused') { setPhase(previousPhase); if (!verdictShown) showStatus(previousPhase === 'windup' ? 'PREPARING' : 'IN FLIGHT', '포물선 운동을 실시간으로 계산하고 있습니다'); }
  else if (phase === 'windup' || phase === 'flying') { previousPhase = phase; setPhase('paused'); if (!verdictShown) showStatus('PAUSED', '시간이 정지되었습니다 · RESUME으로 재개'); }
}
function showVerdict() {
  verdictShown = true;
  const detail = prediction.crossingTime === null ? '림 높이의 하강 통과 없음 · 수평 통과 오차를 정의할 수 없습니다' : `하강 통과 오차 ${prediction.offset.toFixed(3)} m / 허용 0.105 m`;
  showStatus(prediction.success ? 'SUCCESS' : 'MISS', detail, prediction.success ? 'success' : 'miss');
}
$('shoot').onclick = shoot; $('reset').onclick = reset; $('pause').onclick = pause;
document.querySelectorAll('[data-camera]').forEach(button => button.onclick = () => {
  simulation?.setCamera(button.dataset.camera);
  document.querySelectorAll('[data-camera]').forEach(b => b.classList.toggle('active', b === button));
});
$('camera-reset').onclick = () => document.querySelector('[data-camera="overview"]').click();
$('quality').onchange = e => simulation?.setQuality(e.target.value);
$('presentation').onclick = () => {
  const active = document.body.classList.toggle('presentation');
  $('presentation').querySelector('span').textContent = active ? '발표 종료' : '발표 모드';
  requestAnimationFrame(() => { simulation?.resize(); charts.resize(); });
};
function closeExpanded() {
  document.querySelector('.chart-card.expanded')?.classList.remove('expanded'); expanded = null;
  $('chart-backdrop').hidden = true; $('close-chart').hidden = true; charts.setExpanded(null);
}
document.querySelectorAll('[data-expand]').forEach(button => button.onclick = () => {
  if (expanded) { closeExpanded(); return; }
  expanded = button.dataset.expand; document.querySelector(`[data-chart="${expanded}"]`).classList.add('expanded');
  $('chart-backdrop').hidden = false; $('close-chart').hidden = false; charts.setExpanded(expanded); $('close-chart').focus();
});
$('close-chart').onclick = closeExpanded; $('chart-backdrop').onclick = closeExpanded;
function openDialog(id) { if (['windup','flying'].includes(phase)) pause(); $(id).showModal(); }
$('theory-open').onclick = () => openDialog('theory-dialog'); $('model-info').onclick = () => openDialog('theory-dialog');
$('experiment-open').onclick = () => openDialog('experiment-dialog');
$('lab-nav').onclick = () => window.scrollTo({top:0,behavior:'smooth'});
document.querySelectorAll('.dialog-close').forEach(button => button.onclick = () => button.closest('dialog').close());
let experimentChart;
$('run-experiment').onclick = () => {
  try {
    const seed = $('experiment-seed').value === '' ? NaN : Number($('experiment-seed').value);
    const result = runExperiment(params, { seed, trials: 100, errorDegrees: Number($('error-degrees').value) });
    experimentChart ??= createExperimentChart($('chart-experiment')); experimentChart.update(result);
    $('experiment-summary').textContent = `SUCCESS ${result.successes} / ${result.trials} · 성공률 ${(result.rate * 100).toFixed(1)}% · seed ${seed}`;
  } catch (error) { $('experiment-summary').textContent = error.message; }
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeExpanded(); if (document.body.classList.contains('presentation')) $('presentation').click(); }
  if (e.code === 'Space' && !['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) {
    e.preventDefault(); if (['windup','flying','paused'].includes(phase)) pause(); else shoot();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && ['windup','flying'].includes(phase)) pause(); });
refresh();
simulation?.ready.then(() => {
  $('scene-loading').remove();
  const diagnostics = simulation.diagnostics();
  document.body.dataset.models = JSON.stringify(diagnostics);
  console.info('RoboShot model validation', diagnostics);
});
let previousTime = performance.now(), lastGraphTime = 0;
function frame(now) {
  const dt = Math.max(0, (now - previousTime) / 1000); previousTime = now;
  let flightDelta = dt * params.playback;
  if (phase === 'windup') {
    windup += flightDelta;
    simulation?.setShotPose(Math.min(1, windup / .65));
    if (windup >= .65) { flightDelta = windup - .65; setPhase('flying'); showStatus('IN FLIGHT', '이상적인 포물선 운동 · 공기 저항 없음'); }
    else flightDelta = 0;
  }
  if (phase === 'flying') {
    elapsed = Math.min(duration, elapsed + flightDelta);
    const state = stateAt(params, elapsed);
    simulation?.setBallState(state); simulation?.setShotPose(1 + Math.min(1, elapsed / .45));
    updateTelemetry(state);
    if (!verdictShown && prediction.crossingTime !== null && elapsed >= prediction.crossingTime) showVerdict();
    if (elapsed >= duration) { if (!verdictShown) showVerdict(); setPhase('ended'); charts.setTime(elapsed); }
  }
  if (now - lastGraphTime >= 80) { charts.setTime(elapsed); lastGraphTime = now; }
  simulation?.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { simulation?.dispose(); charts.destroy(); experimentChart?.destroy(); });
