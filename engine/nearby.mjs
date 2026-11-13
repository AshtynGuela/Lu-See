import { DAY, summarize } from "./index.mjs";

const RAD = Math.PI / 180;
const MOON_KM = 1737.4;

export function lunarDistanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * MOON_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearbyPoints(center, radius, sites) {
  const catalogue = sites.map(site => ({ ...site, distanceKm: lunarDistanceKm(center, site) }))
    .filter(site => site.id !== center.id && site.distanceKm <= radius && site.distanceKm > .01)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .slice(0, 2);
  const lat = center.lat * RAD, lon = center.lon * RAD;
  const sampled = Array.from({ length: 8 }, (_, i) => {
    const bearing = i * Math.PI / 4;
    const distanceKm = radius * (i % 2 ? 1 : .5);
    const d = distanceKm / MOON_KM;
    const x = Math.cos(lat) * Math.cos(d) - Math.sin(lat) * Math.sin(d) * Math.cos(bearing);
    const y = Math.sin(d) * Math.sin(bearing);
    const z = Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing);
    return {
      name: ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"][i],
      lat: Math.atan2(z, Math.hypot(x, y)) / RAD,
      lon: ((lon + Math.atan2(y, x)) / RAD + 540) % 360 - 180,
      distanceKm,
    };
  });
  return [...catalogue, ...sampled];
}

export function nearbyMetrics(data, start, duration, mask, antenna, profile) {
  if (!mask || !data.earth?.length || start < data.earth[0][0] ||
      start + duration * DAY > data.earth.at(-1)[0]) return null;
  const m = summarize(data, start, duration, mask, antenna, 0, []);
  if (!m) return null;
  const sunlight = m.sunlitPct, contact = m.earthDtePct, darkness = m.longestDarkH;
  return {
    sunlight, contact, darkness,
    meetsLimits: profile ? sunlight >= profile.minSunlitPct &&
      contact >= profile.minEarthDtePct && darkness <= profile.maxDarknessHours : null,
    score: sunlight + contact - (100 * darkness / (duration * 24)),
  };
}

export function compareNearby(a, b) {
  return Number(b.meetsLimits ?? false) - Number(a.meetsLimits ?? false) ||
    b.score - a.score || a.distanceKm - b.distanceKm;
}
