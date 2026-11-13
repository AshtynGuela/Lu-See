export const AU_KM = 149597870.7;
export const PHYSICAL_SOURCE = "https://ssd.jpl.nasa.gov/planets/phys_par.html";
// Periods bound the span of the *queried* orbit paths; they never generate positions.
export const PLANETS = [
  {
    id: "mercury",
    name: "Mercury",
    target: "199",
    radiusKm: 2439.4,
    periodYears: 0.2408467,
    color: "#b9afa2",
    displayRadius: 0.075,
    file: "Mercury_1_4878.glb",
  },
  {
    id: "venus",
    name: "Venus",
    target: "299",
    radiusKm: 6051.8,
    periodYears: 0.61519726,
    color: "#dfc391",
    displayRadius: 0.12,
    file: "Venussurface_1_12103.glb",
  },
  {
    id: "earth",
    name: "Earth",
    target: "399",
    radiusKm: 6371.0084,
    periodYears: 1.0000174,
    color: "#7cb8df",
    displayRadius: 0.13,
    file: "Earth_1_12756.glb",
  },
  {
    id: "mars",
    name: "Mars",
    target: "499",
    radiusKm: 3389.5,
    periodYears: 1.8808476,
    color: "#dc9675",
    displayRadius: 0.095,
    file: "24881_Mars_1_6792.glb",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    target: "5",
    barycentre: true,
    radiusKm: 69911,
    periodYears: 11.862615,
    color: "#d5b899",
    displayRadius: 0.38,
    file: "Jupiter_1_142984.glb",
  },
  {
    id: "saturn",
    name: "Saturn",
    target: "6",
    barycentre: true,
    radiusKm: 58232,
    periodYears: 29.447498,
    color: "#d9ca98",
    displayRadius: 0.32,
    file: "Saturn_1_120536.glb",
  },
  {
    id: "uranus",
    name: "Uranus",
    target: "7",
    barycentre: true,
    radiusKm: 25362,
    periodYears: 84.016846,
    color: "#9fd5db",
    displayRadius: 0.23,
    file: "Uranus_1_51118.glb",
  },
  {
    id: "neptune",
    name: "Neptune",
    target: "8",
    barycentre: true,
    radiusKm: 24622,
    periodYears: 164.79132,
    color: "#7da3e5",
    displayRadius: 0.22,
    file: "Neptune_1_49528.glb",
  },
];
export const MOON = {
  id: "moon",
  name: "Moon",
  target: "301",
  radiusKm: 1737.4,
  periodYears: 1.0000174,
  color: "#d6d5cc",
  displayRadius: 0.055,
};
export const SOLAR_BODIES = [...PLANETS, MOON];
export function monthWindow(time) {
  const d = new Date(time),
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, end };
}
export function solarPosition(rows, time) {
  if (!rows?.length || time < rows[0][0] || time > rows.at(-1)[0]) return null;
  let l = 0,
    r = rows.length - 1;
  while (r - l > 1) {
    const m = (l + r) >> 1;
    if (rows[m][0] > time) r = m;
    else l = m;
  }
  const a = rows[l],
    b = rows[r],
    days = (b[0] - a[0]) / 86400000,
    u = (time - a[0]) / (b[0] - a[0] || 1),
    h00 = 2 * u ** 3 - 3 * u * u + 1,
    h10 = u ** 3 - 2 * u * u + u,
    h01 = -2 * u ** 3 + 3 * u * u,
    h11 = u ** 3 - u * u;
  return [0, 1, 2].map(
    (i) =>
      h00 * a[i + 1] +
      h10 * days * a[i + 4] +
      h01 * b[i + 1] +
      h11 * days * b[i + 4],
  );
}
export function solarDisplayPoint(xyz, physical = false) {
  const r = Math.hypot(...xyz),
    scale = physical ? 2 : r ? (4 * Math.log2(1 + r)) / r : 0;
  return [xyz[0] * scale, xyz[2] * scale, -xyz[1] * scale];
}
