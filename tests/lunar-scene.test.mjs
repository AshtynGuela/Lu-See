import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { lunarCameraDelta, lunarModelSunDirection, lunarSunPosition } from "../engine/lunar-scene.mjs";
import { planetOrientation } from "../engine/planetOrientation.mjs";
import { LUNAR_RADIUS_M, lunarTerrainLayer } from "../engine/lunar-map.mjs";

const before = Date.parse("2026-11-14T12:00:00Z");
const after = before + 86400000;
const toFixed = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

test("lunar rotation keeps an inertial observer fixed while coordinates stay body-fixed", () => {
  const point = new Vector3(2e6, 3e6, 4e6);
  const initial = point.clone().applyQuaternion(planetOrientation("moon", before));
  const moved = point.clone().applyQuaternion(lunarCameraDelta(before, after))
    .applyQuaternion(planetOrientation("moon", after));
  assert.ok(moved.distanceTo(initial) < 1e-8);
  const degrees = planetOrientation("moon", before).angleTo(planetOrientation("moon", after)) * 180 / Math.PI;
  assert.ok(degrees > 12 && degrees < 15, "Moon must rotate by about 13 degrees per day, not once per day");
  assert.ok(lunarCameraDelta(before, before).angleTo(new Quaternion()) < 1e-7);
});

test("Cesium Z-up camera motion matches the Three.js Y-up body frame", () => {
  const point = new Vector3(2, 3, 4);
  const model = point.clone().applyQuaternion(lunarCameraDelta(before, after)).applyQuaternion(toFixed);
  const fixed = point.clone().applyQuaternion(toFixed).applyQuaternion(lunarCameraDelta(before, after, true));
  assert.ok(model.distanceTo(fixed) < 1e-12);
});

test("topocentric Sun reconstruction returns the same centre from day and night sites", () => {
  const distanceM = 149597870700;
  const day = lunarSunPosition({ az: 0, el: 90, distanceKm: (distanceM-LUNAR_RADIUS_M)/1000, visibleFraction: 1 }, {lat:0,lon:0,elevationM:0});
  const night = lunarSunPosition({ az: 0, el: -90, distanceKm: (distanceM+LUNAR_RADIUS_M)/1000, visibleFraction: 0 }, {lat:0,lon:180,elevationM:0});
  assert.ok(day.distanceTo(night) < .0001);
  assert.ok(day.distanceTo(new Vector3(distanceM,0,0)) < .0001);
  assert.equal(lunarSunPosition(null, {lat:0,lon:0}), null);
  assert.equal(lunarSunPosition({az:0,el:0,distanceKm:NaN}, {lat:0,lon:0}), null);
});

test("Solar System Moon shading uses real heliocentric direction independent of display compression", () => {
  const raw = [.7,.6,.02];
  const expected = new Vector3(-raw[0],-raw[2],raw[1]).normalize();
  const actual = lunarModelSunDirection(raw,before).applyQuaternion(planetOrientation("moon",before));
  assert.ok(actual.distanceTo(expected) < 1e-12);
  assert.equal(lunarModelSunDirection(null,before), null);
  assert.ok(lunarTerrainLayer.extensions.includes("octvertexnormals"), "Use the source terrain normals for relief lighting");
});
