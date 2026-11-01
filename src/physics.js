/** Ideal, SI-unit projectile physics. Rendering never integrates these equations. */
export const GRAVITY = 9.8;
export const HOOP_HEIGHT = 3.05;
export const BALL_RADIUS = 0.12;
export const RIM_RADIUS = 0.225;
export const EFFECTIVE_RADIUS = RIM_RADIUS - BALL_RADIUS;
export const LIMITS = Object.freeze({
  angle: [5, 85], speed: [0.5, 20], height: [0.5, 3],
  distance: [1, 10], mass: [0.2, 1.5], playback: [0.1, 2],
});
const names = { angle: '발사 각도', speed: '초기 속력', height: '발사 높이', distance: '골대 거리', mass: '공의 질량', playback: '재생 속도' };
export const toRadians = (degrees) => degrees * Math.PI / 180;
export const toDegrees = (radians) => radians * 180 / Math.PI;

function errorsFor(p, keys) {
  return keys.flatMap((key) => {
    const value = p?.[key];
    const [min, max] = LIMITS[key];
    return !Number.isFinite(value) || value < min || value > max
      ? [`${names[key]}은(는) ${min}~${max} 범위의 유한한 숫자여야 합니다.`] : [];
  });
}

export function validateParams(p) {
  const errors = errorsFor(p, Object.keys(LIMITS));
  return { valid: errors.length === 0, errors };
}

function assertParams(p) {
  const checked = validateParams(p);
  if (!checked.valid) throw new RangeError(checked.errors.join(' '));
}

/** Solve y(d)=H. This does not imply a descending basket crossing. */
export function requiredSpeed(p) {
  const errors = errorsFor(p, ['angle', 'height', 'distance']);
  if (errors.length) return { ok: false, speed: null, error: errors.join(' ') };
  const theta = toRadians(p.angle);
  const riseBudget = p.distance * Math.tan(theta) + p.height - HOOP_HEIGHT;
  const denominator = 2 * Math.cos(theta) ** 2 * riseBudget;
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    return { ok: false, speed: null, error: '이 각도에서는 골대 높이에 도달할 수 없습니다. 각도 또는 발사 높이를 높여 주세요. (계산식의 분모 ≤ 0)' };
  }
  const speed = Math.sqrt(GRAVITY * p.distance ** 2 / denominator);
  if (!Number.isFinite(speed) || speed < LIMITS.speed[0] || speed > LIMITS.speed[1]) {
    return { ok: false, speed: null, error: '필요한 초기 속력이 지원 범위(0.5~20 m/s)를 벗어납니다. 각도·높이·거리를 조절해 주세요.' };
  }
  return { ok: true, speed, error: null };
}

/** Minimum initial speed in the ideal point-trajectory model, not maximum scoring probability. */
export function optimizeShot(p) {
  const errors = errorsFor(p, ['height', 'distance']);
  if (errors.length) return { ok: false, angle: null, speed: null, error: errors.join(' ') };
  const angle = 45 + 0.5 * toDegrees(Math.atan((HOOP_HEIGHT - p.height) / p.distance));
  return { angle, ...requiredSpeed({ ...p, angle }) };
}

const baseDefaults = { angle: 50, height: 2, distance: 4, mass: 0.6, playback: 1 };
export const DEFAULTS = Object.freeze({ ...baseDefaults, speed: requiredSpeed(baseDefaults).speed });

/** Analytical state at elapsed simulation time; independent of frame rate. */
export function stateAt(p, t) {
  assertParams(p);
  if (!Number.isFinite(t) || t < 0) throw new RangeError('시간은 0 이상의 유한한 숫자여야 합니다.');
  const theta = toRadians(p.angle);
  const vx = p.speed * Math.cos(theta);
  const vy0 = p.speed * Math.sin(theta);
  const vy = vy0 - GRAVITY * t;
  const x = vx * t;
  const y = p.height + vy0 * t - 0.5 * GRAVITY * t ** 2;
  const speed = Math.hypot(vx, vy);
  const kinetic = 0.5 * p.mass * speed ** 2;
  const potential = p.mass * GRAVITY * y;
  return { t, x, y, z: 0, vx, vy, speed, kinetic, potential, total: kinetic + potential };
}

export function apex(p) {
  assertParams(p);
  const vy0 = p.speed * Math.sin(toRadians(p.angle));
  return { time: vy0 / GRAVITY, height: p.height + vy0 ** 2 / (2 * GRAVITY) };
}

/** Stop when the ball's lower surface first touches the floor. No bounce model. */
export function flightTime(p) {
  assertParams(p);
  const vy0 = p.speed * Math.sin(toRadians(p.angle));
  return (vy0 + Math.sqrt(vy0 ** 2 + 2 * GRAVITY * (p.height - BALL_RADIUS))) / GRAVITY;
}

export function evaluateShot(p) {
  assertParams(p);
  const vy0 = p.speed * Math.sin(toRadians(p.angle));
  const discriminant = vy0 ** 2 - 2 * GRAVITY * (HOOP_HEIGHT - p.height);
  if (discriminant <= 0) {
    return { success: false, crossingTime: null, offset: null, descending: false,
      reason: '최고점이 림보다 낮거나 림 높이에 접하므로 하강 통과가 없습니다.' };
  }
  // The PLUS root is the descending crossing, regardless of render frame timing.
  const crossingTime = (vy0 + Math.sqrt(discriminant)) / GRAVITY;
  const state = stateAt(p, crossingTime);
  const offset = Math.hypot(state.x - p.distance, state.z);
  const descending = state.vy < 0;
  const success = descending && offset <= EFFECTIVE_RADIUS + 1e-10;
  return { success, crossingTime, offset, descending,
    reason: success ? '하강 통과 시 공 중심이 유효 반지름 안에 있습니다.' : '하강 통과 시 골대 중심 오차가 유효 반지름(0.105 m)을 초과합니다.' };
}

export function sampleTrajectory(p, count = 121) {
  assertParams(p);
  if (!Number.isInteger(count) || count < 2 || count > 10001) throw new RangeError('표본 개수는 2~10001 정수여야 합니다.');
  const end = flightTime(p);
  return Array.from({ length: count }, (_, i) => stateAt(p, end * i / (count - 1)));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Uniform angular error in degrees; the baseline speed remains fixed. rate is 0..1. */
export function runExperiment(p, { seed = 42, trials = 100, errorDegrees = 1 } = {}) {
  assertParams(p);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('시드는 0~4294967295 정수여야 합니다.');
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000) throw new RangeError('실험 횟수는 1~10000 정수여야 합니다.');
  if (!Number.isFinite(errorDegrees) || errorDegrees < 0 || errorDegrees > 5) throw new RangeError('각도 오차는 0~5°여야 합니다.');
  if (p.angle - errorDegrees < LIMITS.angle[0] || p.angle + errorDegrees > LIMITS.angle[1]) throw new RangeError('오차를 적용한 각도가 지원 범위(5~85°)를 벗어납니다.');
  const random = seededRandom(seed);
  const results = Array.from({ length: trials }, () => {
    const angleError = (random() * 2 - 1) * errorDegrees;
    const angle = p.angle + angleError;
    return { angle, angleError, ...evaluateShot({ ...p, angle }) };
  });
  const successes = results.filter((result) => result.success).length;
  return { successes, trials, rate: successes / trials, results };
}
