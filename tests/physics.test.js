import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, GRAVITY, HOOP_HEIGHT, BALL_RADIUS, EFFECTIVE_RADIUS,
  toRadians, toDegrees, validateParams, requiredSpeed, optimizeShot,
  stateAt, apex, flightTime, evaluateShot, sampleTrajectory, runExperiment,
} from '../src/physics.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected} ± ${tolerance}`);

test('reference launch speeds and minimum-speed angle match requested values', () => {
  near(requiredSpeed({ ...DEFAULTS, angle: 40 }).speed, 7.61, 0.01);
  near(requiredSpeed({ ...DEFAULTS, angle: 50 }).speed, 7.14, 0.01);
  const optimum = optimizeShot(DEFAULTS);
  assert.ok(optimum.ok);
  near(optimum.angle, 52.4, 0.1);
  near(optimum.speed, 7.13, 0.01);
  assert.ok(requiredSpeed({ ...DEFAULTS, angle: optimum.angle - 1 }).speed > optimum.speed);
  assert.ok(requiredSpeed({ ...DEFAULTS, angle: optimum.angle + 1 }).speed > optimum.speed);
});

test('40°, 50° and optimized shots reach hoop centre while descending', () => {
  for (const angle of [40, 50, optimizeShot(DEFAULTS).angle]) {
    const p = { ...DEFAULTS, angle, speed: requiredSpeed({ ...DEFAULTS, angle }).speed };
    const timeAtHoop = p.distance / (p.speed * Math.cos(toRadians(angle)));
    const state = stateAt(p, timeAtHoop);
    near(state.x, p.distance);
    near(state.y, HOOP_HEIGHT);
    assert.ok(state.vy < 0);
    const result = evaluateShot(p);
    assert.ok(result.success && result.descending);
    near(result.offset, 0);
    near(result.crossingTime, timeAtHoop);
  }
});

test('an upward centre-height match is a MISS on the later downward crossing', () => {
  const angle = 20;
  const calculation = requiredSpeed({ ...DEFAULTS, angle });
  assert.ok(calculation.ok);
  const p = { ...DEFAULTS, angle, speed: calculation.speed };
  const timeAtHoop = p.distance / (p.speed * Math.cos(toRadians(angle)));
  near(stateAt(p, timeAtHoop).y, HOOP_HEIGHT);
  assert.ok(stateAt(p, timeAtHoop).vy > 0);
  const result = evaluateShot(p);
  assert.equal(result.success, false);
  assert.ok(result.crossingTime > timeAtHoop);
  assert.ok(result.offset > EFFECTIVE_RADIUS);
});

test('rim clearance includes ball radius, and absent crossings remain explicit', () => {
  const centre = evaluateShot(DEFAULTS);
  assert.equal(evaluateShot({ ...DEFAULTS, distance: DEFAULTS.distance + EFFECTIVE_RADIUS - 0.001 }).success, true);
  assert.equal(evaluateShot({ ...DEFAULTS, distance: DEFAULTS.distance + EFFECTIVE_RADIUS + 0.001 }).success, false);
  const low = evaluateShot({ ...DEFAULTS, speed: 1 });
  assert.equal(low.success, false);
  assert.equal(low.crossingTime, null);
  assert.equal(low.offset, null);
  assert.ok(centre.descending);
});

test('analytical trajectory preserves energy and mass does not change motion', () => {
  const initial = stateAt(DEFAULTS, 0);
  const samples = sampleTrajectory(DEFAULTS, 401);
  for (const sample of samples) {
    near(sample.total, initial.total, 1e-10);
    const theta = toRadians(DEFAULTS.angle);
    const trajectoryHeight = DEFAULTS.height + sample.x * Math.tan(theta) - GRAVITY * sample.x ** 2 / (2 * DEFAULTS.speed ** 2 * Math.cos(theta) ** 2);
    near(sample.y, trajectoryHeight, 1e-10);
  }
  const heavy = stateAt({ ...DEFAULTS, mass: 1.2 }, 0.5);
  const normal = stateAt(DEFAULTS, 0.5);
  near(heavy.x, normal.x);
  near(heavy.y, normal.y);
  near(heavy.total, normal.total * 2);
  near(samples.at(-1).y, BALL_RADIUS);
});

test('apex, floor contact, degree conversion and time sampling are consistent', () => {
  near(toRadians(180), Math.PI);
  near(toDegrees(Math.PI / 2), 90);
  const peak = apex(DEFAULTS);
  near(stateAt(DEFAULTS, peak.time).vy, 0);
  near(stateAt(DEFAULTS, peak.time).y, peak.height);
  near(stateAt(DEFAULTS, flightTime(DEFAULTS)).y, BALL_RADIUS);
  // Frame schedules cannot alter the state at the same elapsed time.
  const elapsed60Hz = Array.from({ length: 60 }, () => 1 / 60).reduce((a, b) => a + b, 0);
  const elapsed30Hz = Array.from({ length: 30 }, () => 1 / 30).reduce((a, b) => a + b, 0);
  near(stateAt(DEFAULTS, elapsed60Hz).y, stateAt(DEFAULTS, elapsed30Hz).y);
});

test('invalid input and impossible launch geometry never emit a usable NaN', () => {
  assert.ok(validateParams(DEFAULTS).valid);
  for (const bad of [NaN, Infinity, -Infinity, '', null, undefined]) {
    assert.equal(validateParams({ ...DEFAULTS, speed: bad }).valid, false);
    assert.throws(() => stateAt({ ...DEFAULTS, speed: bad }, 0), RangeError);
    assert.equal(requiredSpeed({ ...DEFAULTS, angle: bad }).ok, false);
  }
  assert.equal(requiredSpeed({ ...DEFAULTS, angle: 5 }).ok, false);
  assert.equal(requiredSpeed({ ...DEFAULTS, angle: 15 }).ok, false); // Needed speed exceeds support range.
  assert.equal(optimizeShot({ ...DEFAULTS, distance: 0 }).ok, false);
  assert.throws(() => stateAt(DEFAULTS, NaN), RangeError);
  assert.throws(() => stateAt(DEFAULTS, -1), RangeError);
  assert.throws(() => sampleTrajectory(DEFAULTS, 1), RangeError);
  assert.equal(validateParams({ ...DEFAULTS, mass: 0 }).valid, false);
});

test('seeded 100-shot experiments are reproducible and use the finite-ball criterion', () => {
  const first = runExperiment(DEFAULTS, { seed: 12345, trials: 100, errorDegrees: 1 });
  assert.deepEqual(first, runExperiment(DEFAULTS, { seed: 12345, trials: 100, errorDegrees: 1 }));
  assert.notDeepEqual(first.results, runExperiment(DEFAULTS, { seed: 12346, trials: 100, errorDegrees: 1 }).results);
  assert.equal(first.trials, 100);
  assert.equal(first.rate, first.successes / 100);
  assert.equal(first.successes, first.results.filter((r) => r.descending && r.offset <= EFFECTIVE_RADIUS).length);
  assert.equal(runExperiment(DEFAULTS, { seed: 1, errorDegrees: 0 }).successes, 100);
  assert.throws(() => runExperiment(DEFAULTS, { seed: NaN }), RangeError);
  assert.throws(() => runExperiment(DEFAULTS, { errorDegrees: -1 }), RangeError);
});
