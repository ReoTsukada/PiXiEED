import test from 'node:test';
import assert from 'node:assert/strict';
import { planetSky, galileanPhases, orbitPath, heliocentric, PLANETS } from '../../js/globe/planets.mjs';
import { celestialState, observe } from '../../js/globe/astronomy.mjs';

const DEG = Math.PI / 180;
const skyAt = (iso) => { const date = new Date(iso); const state = celestialState(date, { planets: true }); return { state, planets: Object.fromEntries(state.planets.map((planet) => [planet.id, planet])) }; };

test('oppositions happen on their published dates', () => {
  // Jupiter 2023-11-03 and 2024-12-07, Saturn 2024-09-08, Uranus 2024-11-17, Neptune 2024-09-21.
  for (const [iso, id] of [['2023-11-03T05:00Z', 'jupiter'], ['2024-12-07T21:00Z', 'jupiter'], ['2024-09-08T04:00Z', 'saturn'], ['2024-11-17T00:00Z', 'uranus'], ['2024-09-21T00:00Z', 'neptune']]) {
    assert.ok(skyAt(iso).planets[id].elongation > 177, `${id} at ${iso}`);
  }
  // Mars 2025-01-16 sits about 4 degrees off the ecliptic, so its elongation peaks a little lower.
  assert.ok(skyAt('2025-01-16T02:00Z').planets.mars.elongation > 174);
});

test('Venus reaches its greatest eastern elongation of 47.2 degrees on 2025-01-10', () => {
  const venus = skyAt('2025-01-10T06:00Z').planets.venus;
  assert.ok(Math.abs(venus.elongation - 47.2) < 0.3, String(venus.elongation));
  assert.ok(venus.magnitude < -4.2 && venus.magnitude > -4.7);
});

test('planets share the Sun and Moon frame (the Sun seen via any planet agrees to 0.02 degrees)', () => {
  for (const iso of ['2020-06-21T00:00Z', '2026-09-26T00:00Z', '2035-03-01T12:00Z']) {
    const { state, planets } = skyAt(iso);
    const p = planets.mars; const auInEarthRadii = 149597870.7 / 6378.137;
    const sun = p.vector.map((c, i) => c + p.toSun[i] * p.sunDistanceAU * auInEarthRadii);
    const length = Math.hypot(...sun);
    const cos = sun.reduce((sum, c, i) => sum + (c / length) * state.sunDirection[i], 0);
    assert.ok(Math.acos(Math.min(1, cos)) / DEG < 0.02, iso);
  }
});

test('apparent sizes and brightness are in the right range', () => {
  const { planets } = skyAt('2024-12-07T21:00Z');
  assert.ok(planets.jupiter.angularRadius * 2 / DEG * 3600 > 46 && planets.jupiter.angularRadius * 2 / DEG * 3600 < 49);
  assert.ok(planets.jupiter.magnitude < -2.6 && planets.jupiter.magnitude > -3.0);
  assert.ok(planets.neptune.magnitude > 7.5);
});

test('Galilean moons keep their orbital radii and Jupiter carries them in the sky', () => {
  const phases = galileanPhases(new Date('2026-02-20T10:00Z'));
  assert.deepEqual(phases.map(({ r }) => Math.round(r)), [6, 9, 15, 26]);
  const { planets } = skyAt('2026-02-20T10:00Z');
  assert.equal(planets.jupiter.moons.length, 4);
  for (const moon of planets.jupiter.moons) {
    const separation = Math.acos(Math.min(1, moon.direction.reduce((sum, c, i) => sum + c * planets.jupiter.direction[i], 0))) / DEG;
    assert.ok(separation < 0.2, moon.id);
  }
});

test('orbits close and planets sit on them', () => {
  const date = new Date('2026-09-26T00:00Z');
  for (const planet of PLANETS) {
    const path = orbitPath(planet.id, date, 360);
    const position = heliocentric(planet.id, date);
    const nearest = Math.min(...path.map((point) => Math.hypot(point[0] - position[0], point[1] - position[1], point[2] - position[2])));
    const circumference = 2 * Math.PI * Math.hypot(...position);
    assert.ok(nearest < circumference / 360, planet.id);
  }
});

test('planets are opt-in so eclipse searches stay light, and observe() places them in the local sky', () => {
  assert.equal(celestialState(new Date('2026-01-01T00:00Z')).planets, null);
  const { state } = skyAt('2026-02-20T10:00Z');
  const o = observe(state, 35.7, 139.7);
  const jupiter = o.planets.find((planet) => planet.id === 'jupiter');
  assert.ok(Math.abs(Math.hypot(...jupiter.local) - 1) < 1e-9);
  assert.ok(jupiter.altitude > 20, 'Jupiter is well up over Tokyo on a February evening');
});
