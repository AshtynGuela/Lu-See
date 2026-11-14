import { Quaternion, Vector3 } from "three";
import constants from "./planet-orientation.json" with { type: "json" };
import leapSeconds from "./leap-seconds.json" with { type: "json" };

const DEG = Math.PI / 180;
const DAY = 86400000;
const J2000 = Date.UTC(2000, 0, 1, 12);
// Rotate equatorial J2000 into the viewer's ecliptic, Y-up frame.
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const fromJ2000 = new Quaternion().setFromAxisAngle(X, -(90 + 84381.448 / 3600) * DEG);
const modelToFixed = new Quaternion().setFromAxisAngle(X, Math.PI / 2);
const EARTH_START = Date.UTC(1969, 0, 1);
const EARTH_END = Date.UTC(2041, 0, 1);
const STEP = DAY / 4;
const earthSampleCount = (EARTH_END - EARTH_START) / STEP + 1;
export const earthTableSize = (earthSampleCount + leapSeconds.length) * 6;
const EARTH_SCALE = 2_000_000;
const turn = angle => (angle % 360) * DEG;
const poly = (terms, t) => terms.reduceRight((value, coefficient) => value * t + coefficient, 0);

// UTC to TT for the IAU polynomials. The whole-second offsets here have a
// negligible effect even in 1969, before the modern UTC leap-second system.
const leapDates = leapSeconds.map(date => Date.parse(date));
const earthLeapSamples = new Map(leapDates.map((date, i) => [(date - EARTH_START) / STEP - 1, earthSampleCount + i]));

function fixedToJ2000(ra, dec, meridian) {
  return new Quaternion().setFromAxisAngle(Z, turn(ra + 90))
    .multiply(new Quaternion().setFromAxisAngle(X, turn(90 - dec)))
    .multiply(new Quaternion().setFromAxisAngle(Z, turn(meridian)));
}

function residual(table, i) {
  const x = table.getInt16(i * 6, true) / EARTH_SCALE;
  const y = table.getInt16(i * 6 + 2, true) / EARTH_SCALE;
  const z = table.getInt16(i * 6 + 4, true) / EARTH_SCALE;
  return new Quaternion(x, y, z, Math.sqrt(1 - x*x - y*y - z*z));
}

function earthFixedToJ2000(time, table) {
  const days = (time - J2000) / DAY;
  const spin = (0.7790572732640 + 1.00273781191135448 * days) * 360;
  const index = (time - EARTH_START) / STEP;
  if (!table || index < 0 || index > earthSampleCount - 1) {
    // Mean-Earth display fallback while the JPL orientation asset loads.
    const t = days / 36525;
    const sidereal = spin + (0.014506 + t * (4612.156534 + 1.3915817 * t)) / 3600;
    return fixedToJ2000(-0.641 * t, 90 - 0.557 * t, sidereal - 90);
  }
  const row = Math.min(Math.floor(index), earthSampleCount - 2);
  const next = earthLeapSamples.get(row) ?? row + 1;
  return residual(table, row).slerp(residual(table, next), index - row)
    .multiply(new Quaternion().setFromAxisAngle(Z, turn(spin)));
}

export function planetOrientation(id, time, earthTable = null) {
  let orientation;
  if (id === "earth") {
    orientation = earthFixedToJ2000(time, earthTable);
  } else {
    const values = constants[id];
    if (!values) return new Quaternion();
    const leaps = leapDates.findIndex(date => date > time);
    const offset = time < Date.UTC(1972, 0, 1) ? 41.184 : 42.184 + (leaps < 0 ? leapDates.length : leaps);
    const ttDays = (time - J2000 + offset * 1000) / DAY;
    const centuries = ttDays / 36525;
    let ra = poly(values.ra, centuries);
    let dec = poly(values.dec, centuries);
    let meridian = poly(values.prime, ttDays);
    for (const [phase, rightAscension, declination, prime] of values.nutation) {
      const angle = turn(poly(phase, centuries));
      const sine = Math.sin(angle);
      ra += rightAscension * sine;
      dec += declination * Math.cos(angle);
      meridian += prime * sine;
    }
    orientation = fixedToJ2000(ra, dec, meridian);
  }
  return fromJ2000.clone().multiply(orientation).multiply(modelToFixed);
}
