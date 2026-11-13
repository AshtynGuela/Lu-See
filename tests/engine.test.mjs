import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpolate,
  horizonAt,
  conditions,
  findEvents,
  summarize,
  evaluateRules,
  smoothHorizon,
  sweepDates,
  DAY,
  HOUR,
} from "../engine/index.mjs";
import { parseObserver } from "../server/horizons.mjs";
import { verifyNumbers, materializeAnswer } from "../server/assistant.mjs";
test("azimuth interpolation crosses north correctly; never extrapolates", () => {
  const rows = [
    [0, 359, -1, 1920, 150000000],
    [600000, 1, 1, 1920, 150000000],
  ];
  assert.ok(interpolate(rows, 300000).az < 0.0001);
  assert.equal(interpolate(rows, -1), null);
  assert.equal(interpolate(rows, 600001), null);
});
test("direction interpolation crosses zenith without bending away from overhead", () => {
  const rows = [
    [0, 0, 89, 1920, 1.5e8],
    [600000, 180, 89, 1920, 1.5e8],
  ];
  assert.ok(interpolate(rows, 300000).el > 89.99999);
});
test("terrain horizon can hide a positive Sun and Earth; DTE has a separate antenna threshold", () => {
  const data = {
    sun: [
      [0, 0, 2, 1920, 149597870.7],
      [HOUR, 0, 2, 1920, 149597870.7],
    ],
    earth: [
      [0, 180, 3, 6800, 380000],
      [HOUR, 180, 3, 6800, 380000],
    ],
  };
  const c = conditions(data, 0, new Array(720).fill(4), 5);
  assert.equal(c.sun.visible, false);
  assert.equal(c.earth.visible, false);
  assert.equal(c.powerIndex, 0);
  const smooth = conditions(data, 0, null, 5);
  assert.equal(smooth.sun.visible, true);
  assert.equal(smooth.earth.visible, true);
  assert.equal(smooth.earth.dte, false);
});
test("negative terrain horizon is retained; azimuth wraps continuously", () => {
  const mask = new Array(720).fill(-1);
  mask[0] = 0;
  assert.equal(horizonAt(mask, 360), 0);
  assert.equal(horizonAt(mask, 180), -1);
});
test("centre crossing refined within a second of the interpolated event", () => {
  const data = {
    sun: [
      [0, 0, -1, 1920, 1.5e8],
      [HOUR, 0, 1, 1920, 1.5e8],
    ],
    earth: [
      [0, 0, 8, 6800, 380000],
      [HOUR, 0, 8, 6800, 380000],
    ],
  };
  const events = findEvents(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "rise");
  assert.ok(Math.abs(events[0].time - HOUR / 2) < 1000);
});
test("mission integration clips to exact duration and rejects unavailable coverage", () => {
  const rows = [
      [0, 90, 20, 1920, 1.5e8],
      [2 * DAY, 90, 20, 1920, 1.5e8],
    ],
    data = { sun: rows, earth: rows };
  const m = summarize(data, 0, 1);
  assert.equal(m.sunlitPct, 100);
  assert.equal(m.longestSunlitH, 24);
  assert.equal(m.longestDarkH, 0);
  assert.equal(summarize(data, 0, 3), null);
  assert.deepEqual(
    evaluateRules(
      m,
      { minSunlitPct: 90, maxDarknessHours: 1, minEarthDtePct: 90 },
      false,
    ),
    [],
  );
});
test("assistant rejects numerical statements without selected evidence", () => {
  const facts = [
    { id: "f1", label: "Sun elevation", value: "3.25", unit: "degrees" },
  ];
  assert.throws(() =>
    verifyNumbers(
      { speech: "Sun is 9 degrees.", details: "", evidenceIds: ["f1"] },
      facts,
    ),
  );
  assert.equal(
    verifyNumbers(
      { speech: "Sun is 3.25 degrees.", details: "", evidenceIds: ["f1"] },
      facts,
    ).length,
    1,
  );
});
test("observer parser rejects wrong frame and malformed responses", () => {
  assert.throws(() => parseObserver("No ephemeris available"));
  assert.throws(() => parseObserver("$$SOE\ninvalid\n$$EOE"));
});
test("smooth spherical horizon includes mast dip, without claiming terrain", () => {
  const h = smoothHorizon({ observer: { elevationM: 0, mastM: 2 } })[0];
  assert.ok(h < -0.08 && h > -0.09);
  assert.equal(smoothHorizon({ observer: { elevationM: 0, mastM: 0 } })[0], 0);
});
test("hourly date sweep matches the mission integrator for constant conditions", () => {
  const rows = [
      [0, 90, 20, 1920, 1.5e8],
      [4 * DAY, 90, 20, 1920, 1.5e8],
    ],
    data = { sun: rows, earth: rows };
  const sweep = sweepDates(data, DAY, 2 * DAY, 1);
  assert.equal(sweep.length, 25);
  assert.ok(sweep.every((r) => r.sunlitPct === 100 && r.earthDtePct === 100));
});
test("array geometry changes incidence but never supplies power while blocked", () => {
  const rows = [
      [0, 0, 30, 1920, 149597870.7],
      [DAY, 0, 30, 1920, 149597870.7],
    ],
    data = { sun: rows, earth: rows };
  assert.ok(
    Math.abs(conditions(data, 0, null, 5, 0, "horizontal").powerIndex - 0.5) <
      1e-6,
  );
  assert.equal(conditions(data, 0, null, 5, 0, "tracking").powerIndex, 1);
  assert.equal(
    conditions(data, 0, new Array(720).fill(40), 5, 0, "tracking").powerIndex,
    0,
  );
});
test("only the server can insert numerical facts into assistant prose", () => {
  const facts = [
    { id: "f1", label: "Sun elevation", value: "3.25", unit: "degrees" },
  ];
  assert.equal(
    materializeAnswer(
      { speech: "Sun elevation is {{f1}}.", details: "", evidenceIds: ["f1"] },
      facts,
    ).speech,
    "Sun elevation is 3.25 degrees.",
  );
  assert.throws(() =>
    materializeAnswer(
      {
        speech: "Sun elevation is 3.25 degrees.",
        details: "",
        evidenceIds: ["f1"],
      },
      facts,
    ),
  );
  assert.throws(() =>
    materializeAnswer(
      { speech: "Sun elevation is {{f9}}.", details: "", evidenceIds: ["f9"] },
      facts,
    ),
  );
});
