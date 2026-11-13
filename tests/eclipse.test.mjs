import { test } from "node:test";
import assert from "node:assert/strict";
import {
  earthOccultation,
  conditions,
  summarize,
  DAY,
} from "../engine/index.mjs";
const sun = { az: 0, el: 0, radius: 0.25, distanceKm: 149597870.7 };
const earth = { az: 0, el: 0, radius: 1, distanceKm: 380000 };
function packet(s, e) {
  const rows = (body) =>
    [0, DAY].map((t) => [
      t,
      body.az,
      body.el,
      body.radius * 7200,
      body.distanceKm,
    ]);
  return { sun: rows(s), earth: rows(e) };
}
test("Earth fully covers the Sun only when its apparent disc is in front", () => {
  const total = earthOccultation(sun, earth);
  assert.equal(total.state, "total");
  assert.equal(total.transmission, 0);
  assert.equal(
    earthOccultation(sun, { ...earth, distanceKm: 2e8 }).state,
    "none",
  );
  assert.equal(earthOccultation(sun, { ...earth, az: 180 }).blockedFraction, 0);
});
test("equal apparent discs one radius apart match the circle-intersection area", () => {
  const c = earthOccultation(sun, { ...earth, az: 0.25, radius: 0.25 }),
    expected = 2 / 3 - Math.sqrt(3) / (2 * Math.PI);
  assert.equal(c.state, "partial");
  assert.ok(Math.abs(c.blockedFraction - expected) < 1e-10);
  assert.equal(
    earthOccultation(sun, { ...earth, az: 1.25 }).blockedFraction,
    0,
  );
  assert.equal(
    earthOccultation(sun, { ...earth, radius: 0.125 }).blockedFraction,
    0.25,
  );
});
test("Earth-shadow geometry handles north wrap and the zenith", () => {
  assert.equal(
    earthOccultation({ ...sun, az: 359.9 }, { ...earth, az: 0.1 }).state,
    "total",
  );
  assert.equal(
    earthOccultation({ ...sun, az: 0, el: 90 }, { ...earth, az: 180, el: 90 })
      .state,
    "total",
  );
});
test("terrain and Earth clipping share the same disc rather than multiplying independent fractions", () => {
  const c = conditions(packet(sun, { ...earth, el: 0.3, radius: 0.25 }), 0, [
    0,
  ]);
  assert.ok(
    c.sun.terrainVisibleFraction > 0.45 && c.sun.terrainVisibleFraction < 0.55,
  );
  assert.ok(
    c.sun.visibleFraction <
      c.sun.terrainVisibleFraction * c.sun.eclipse.transmission - 0.05,
  );
  assert.ok(
    c.sun.visibleFraction >= 0 &&
      c.sun.visibleFraction <= c.sun.terrainVisibleFraction,
  );
});
test("total occultation removes direct power and is integrated into mission darkness", () => {
  const data = packet({ ...sun, el: 30 }, { ...earth, el: 30 }),
    c = conditions(data, 0, [0], 5, 0, "tracking"),
    m = summarize(data, 0, 1, [0]);
  assert.equal(c.sun.terrainVisibleFraction, 1);
  assert.equal(c.sun.visibleFraction, 0);
  assert.equal(c.powerIndex, 0);
  assert.equal(m.sunlitPct, 0);
  assert.equal(m.longestDarkH, 24);
  assert.equal(m.eclipseHours, 24);
  const hidden = summarize(
    packet({ ...sun, el: -30 }, { ...earth, el: -30 }),
    0,
    1,
    [0],
  );
  assert.equal(
    hidden.eclipseHours,
    0,
    "night-side overlap is not sun-exposed eclipse time",
  );
});
