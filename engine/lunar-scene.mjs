import { Quaternion, Vector3 } from "three";
import { planetOrientation } from "./planetOrientation.mjs";
import { LUNAR_RADIUS_M } from "./lunar-map.mjs";

const RAD = Math.PI / 180;
const modelToFixed = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

// The map stays in lunar coordinates. Move an inertial observer into the new
// body frame, keeping terrain, markers and ray-picked coordinates registered.
export function lunarCameraDelta(before, after, zUp = false) {
  const delta = planetOrientation("moon", after).invert().multiply(planetOrientation("moon", before));
  return zUp ? modelToFixed.clone().multiply(delta).multiply(modelToFixed.clone().invert()) : delta;
}

// Reconstruct the Moon-centred Sun from JPL's topocentric azimuth/elevation
// and range. A site's terrain visibility must never dim the whole globe.
export function lunarSunPosition(sun, observer) {
  if (!sun || !observer || ![sun.az, sun.el, sun.distanceKm, observer.lat, observer.lon].every(Number.isFinite)
    || sun.distanceKm <= 0) return null;
  const lat = observer.lat * RAD, lon = observer.lon * RAD;
  const az = sun.az * RAD, el = sun.el * RAD;
  const distance = sun.distanceKm * 1000;
  const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const north = new Vector3(-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat));
  const up = new Vector3(Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat));
  return up.multiplyScalar(LUNAR_RADIUS_M + (observer.elevationM ?? 0) + distance*Math.sin(el))
    .addScaledVector(east, distance*Math.cos(el)*Math.sin(az))
    .addScaledVector(north, distance*Math.cos(el)*Math.cos(az));
}

// Heliocentric JPL vectors use ecliptic Z-up, while the model uses Y-up.
export function lunarModelSunDirection(moonPosition, time) {
  if (!moonPosition || !moonPosition.every(Number.isFinite)) return null;
  return new Vector3(-moonPosition[0], -moonPosition[2], moonPosition[1]).normalize()
    .applyQuaternion(planetOrientation("moon", time).invert());
}
