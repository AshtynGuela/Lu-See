/** Shared deterministic engine. Input angles and distances come from JPL Horizons;
 * horizon elevations come from PDS LOLA. No orbital approximation or fabricated data.
 */
export const HOUR = 3600000,
  DAY = 24 * HOUR;
export const ENGINE_VERSION = "0.2.0";
const RAD = Math.PI / 180;
const direction = ({ az, el }) => [
  Math.cos(el * RAD) * Math.sin(az * RAD),
  Math.cos(el * RAD) * Math.cos(az * RAD),
  Math.sin(el * RAD),
];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const solarSamples = Array.from({ length: 127 }, (_, i) => ({
  r: Math.sqrt((i + 0.5) / 127),
  a: i * 2.399963229728653,
}));

/** Opaque, circular apparent Earth disc. No atmospheric refraction, scattering,
 * limb darkening or ellipsoidal limb. Inputs are topocentric JPL observer values. */
export function earthOccultation(sun, earth) {
  const s = direction(sun),
    e = direction(earth),
    cross = [
      s[1] * e[2] - s[2] * e[1],
      s[2] * e[0] - s[0] * e[2],
      s[0] * e[1] - s[1] * e[0],
    ],
    separationDeg = Math.atan2(Math.hypot(...cross), dot(s, e)) / RAD,
    r = sun.radius,
    R = earth.radius,
    d = separationDeg;
  let blockedFraction = 0;
  if (earth.distanceKm < sun.distanceKm && r > 0 && R > 0 && d < r + R) {
    if (d <= Math.abs(R - r)) blockedFraction = Math.min(1, (R * R) / (r * r));
    else {
      const clamp = (v) => Math.max(-1, Math.min(1, v)),
        area =
          r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r))) +
          R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R))) -
          0.5 *
            Math.sqrt(
              Math.max(
                0,
                (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R),
              ),
            );
      blockedFraction = Math.max(0, Math.min(1, area / (Math.PI * r * r)));
    }
  }
  return {
    state:
      blockedFraction === 0
        ? "none"
        : blockedFraction >= 1
          ? "total"
          : "partial",
    blockedFraction,
    transmission: 1 - blockedFraction,
    separationDeg,
  };
}
export function interpolate(rows, t) {
  if (!rows?.length || t < rows[0][0] || t > rows.at(-1)[0]) return null;
  let lo = 0,
    hi = rows.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (rows[m][0] > t) hi = m;
    else lo = m;
  }
  const a = rows[lo],
    b = rows[hi],
    u = (t - a[0]) / (b[0] - a[0] || 1),
    rad = Math.PI / 180;
  const v = (p) => [
      Math.cos(p[2] * rad) * Math.sin(p[1] * rad),
      Math.cos(p[2] * rad) * Math.cos(p[1] * rad),
      Math.sin(p[2] * rad),
    ],
    va = v(a),
    vb = v(b),
    [x, y, z] = va.map((n, i) => n + (vb[i] - n) * u);
  return {
    az: (Math.atan2(x, y) / rad + 360) % 360,
    el: Math.atan2(z, Math.hypot(x, y)) / rad,
    radius: (a[3] + (b[3] - a[3]) * u) / 7200,
    distanceKm: a[4] + (b[4] - a[4]) * u,
  };
}
export function horizonAt(mask, az) {
  if (!mask) return 0;
  const x = ((((az % 360) + 360) % 360) / 360) * mask.length,
    i = Math.floor(x),
    u = x - i;
  return mask[i] * (1 - u) + mask[(i + 1) % mask.length] * u;
}
export function smoothHorizon(data) {
  const altitude = data.observer
    ? data.observer.elevationM + data.observer.mastM
    : data.sources?.[0]?.observerAltitudeM || 0;
  return [
    altitude > 0
      ? (-Math.acos(1737400 / (1737400 + altitude)) * 180) / Math.PI
      : 0,
  ];
}
export function discFraction(state, mask, occluder = null) {
  // Area-uniform deterministic quadrature on the apparent solar disc, 127 samples.
  let visible = 0;
  const center = direction(state),
    az = state.az * RAD,
    el = state.el * RAD,
    east = [Math.cos(az), -Math.sin(az), 0],
    up = [
      -Math.sin(el) * Math.sin(az),
      -Math.sin(el) * Math.cos(az),
      Math.cos(el),
    ],
    earth = occluder && direction(occluder),
    earthLimit = occluder && Math.cos(occluder.radius * RAD);
  for (const sample of solarSamples) {
    const r = sample.r * state.radius * RAD,
      x = Math.cos(sample.a) * Math.sin(r),
      y = Math.sin(sample.a) * Math.sin(r),
      p = center.map((v, i) => v * Math.cos(r) + east[i] * x + up[i] * y),
      sampleAz = Math.atan2(p[0], p[1]) / RAD,
      sampleEl = Math.atan2(p[2], Math.hypot(p[0], p[1])) / RAD;
    if (
      sampleEl >= horizonAt(mask, sampleAz) &&
      (!earth || dot(p, earth) < earthLimit)
    )
      visible++;
  }
  return visible / solarSamples.length;
}
export function conditions(
  data,
  t,
  mask = null,
  minAntennaEl = 5,
  earthMargin = 0,
  arrayMode = "horizontal",
  arrayAzimuth = 0,
) {
  const sun = interpolate(data.sun, t),
    earth = interpolate(data.earth, t);
  if (!sun || !earth) return null;
  const actualMask = mask ?? smoothHorizon(data);
  sun.horizon = horizonAt(actualMask, sun.az);
  sun.terrainVisibleFraction = discFraction(sun, actualMask);
  sun.eclipse = earthOccultation(sun, earth);
  sun.visibleFraction =
    sun.eclipse.state === "none"
      ? sun.terrainVisibleFraction
      : sun.eclipse.state === "total"
        ? 0
        : sun.terrainVisibleFraction === 1
          ? sun.eclipse.transmission
          : Math.min(
              sun.terrainVisibleFraction,
              sun.eclipse.transmission,
              discFraction(sun, actualMask, earth),
            );
  sun.visible = sun.visibleFraction >= 0.5;
  earth.horizon = horizonAt(actualMask, earth.az);
  earth.visible = earth.el >= earth.horizon + earthMargin;
  earth.dte = earth.visible && earth.el >= minAntennaEl;
  const el = (sun.el * Math.PI) / 180,
    az = (sun.az * Math.PI) / 180;
  const incidence =
    arrayMode === "tracking"
      ? 1
      : arrayMode === "vertical"
        ? Math.max(
            0,
            Math.cos(el) * Math.cos(az - (arrayAzimuth * Math.PI) / 180),
          )
        : arrayMode === "single_axis"
          ? Math.sqrt(Math.max(0, 1 - (Math.cos(el) * Math.cos(az)) ** 2))
          : Math.max(0, Math.sin(el));
  const powerIndex =
    sun.visibleFraction * incidence * (149597870.7 / sun.distanceKm) ** 2;
  return { time: t, sun, earth, powerIndex, terrain: !!mask };
}
function clearance(data, body, t, mask, margin) {
  const p = interpolate(data[body], t);
  return p.el - horizonAt(mask, p.az) - (body === "earth" ? margin : 0);
}
export function findEvents(data, mask = null, margin = 0) {
  mask = mask ?? smoothHorizon(data);
  const out = [];
  for (const body of ["sun", "earth"]) {
    const rows = data[body];
    for (let i = 1; i < rows.length; i++) {
      let a = rows[i - 1][0],
        b = rows[i][0],
        ga = clearance(data, body, a, mask, margin),
        gb = clearance(data, body, b, mask, margin);
      // Solar event convention is centre crossing (~50% disc); this differs from
      // first/last limb contact. Search finer subintervals for azimuth-varying ridges.
      for (let k = 0; k < 4; k++) {
        let l = a + ((b - a) * k) / 4,
          r = a + ((b - a) * (k + 1)) / 4,
          g = clearance(data, body, l, mask, margin),
          h = clearance(data, body, r, mask, margin);
        if (g >= 0 === h >= 0) continue;
        const rising = h > g;
        while (r - l > 1000) {
          const m = (l + r) / 2,
            v = clearance(data, body, m, mask, margin);
          if (v >= 0 === g >= 0) l = m;
          else r = m;
        }
        out.push({ body, time: (l + r) / 2, kind: rising ? "rise" : "set" });
      }
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
export function summarize(
  data,
  start,
  durationDays,
  mask = null,
  minAntennaEl = 5,
  earthMargin = 0,
  events = null,
  arrayMode = "horizontal",
  arrayAzimuth = 0,
) {
  const end = start + durationDays * DAY;
  if (start < data.sun[0][0] || end > data.sun.at(-1)[0]) return null;
  let lit = 0,
    earthUp = 0,
    dte = 0,
    power = 0,
    maxDark = 0,
    maxLit = 0,
    darkRun = 0,
    litRun = 0,
    eclipseTime = 0;
  const step = 10 * 60000;
  for (let a = start; a < end; a += step) {
    const dt = Math.min(step, end - a),
      c = conditions(
        data,
        a + dt / 2,
        mask,
        minAntennaEl,
        earthMargin,
        arrayMode,
        arrayAzimuth,
      );
    if (c.sun.visible) {
      lit += dt;
      litRun += dt;
      darkRun = 0;
    } else {
      darkRun += dt;
      litRun = 0;
    }
    if (c.earth.visible) earthUp += dt;
    if (c.earth.dte) dte += dt;
    power += c.powerIndex * dt;
    if (c.sun.eclipse.state !== "none" && c.sun.terrainVisibleFraction > 0)
      eclipseTime += dt;
    maxDark = Math.max(maxDark, darkRun);
    maxLit = Math.max(maxLit, litRun);
  }
  const total = end - start,
    next = (events || findEvents(data, mask, earthMargin)).filter(
      (e) => e.time > start,
    );
  return {
    start,
    end,
    sunlitPct: (lit / total) * 100,
    earthVisiblePct: (earthUp / total) * 100,
    earthDtePct: (dte / total) * 100,
    longestDarkH: maxDark / HOUR,
    longestSunlitH: maxLit / HOUR,
    meanPowerIndex: power / total,
    eclipseHours: eclipseTime / HOUR,
    events: next,
    stepMinutes: 10,
  };
}
export function evaluateRules(metrics, profile, terrain) {
  if (!profile || !metrics || !terrain) return [];
  return [
    {
      id: "sunlight",
      label: `Sunlit ≥ ${profile.minSunlitPct}%`,
      passed: metrics.sunlitPct >= profile.minSunlitPct,
    },
    {
      id: "darkness",
      label: `Longest darkness ≤ ${profile.maxDarknessHours} h`,
      passed: metrics.longestDarkH <= profile.maxDarknessHours,
    },
    {
      id: "dte",
      label: `DTE availability ≥ ${profile.minEarthDtePct}%`,
      passed: metrics.earthDtePct >= profile.minEarthDtePct,
    },
  ];
}
export function durationLabel(ms) {
  if (!Number.isFinite(ms)) return "Unavailable";
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 1440
    ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
    : m >= 60
      ? `${Math.floor(m / 60)}h ${m % 60}m`
      : `${m}m`;
}
export function sweepDates(
  data,
  start,
  end,
  durationDays,
  mask = null,
  minAntennaEl = 5,
) {
  const base = data.sun[0][0],
    last = data.sun.at(-1)[0],
    step = 600000,
    n = Math.floor((last - base) / step),
    sun = new Float64Array(n + 1),
    dte = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const c = conditions(data, base + (i + 0.5) * step, mask, minAntennaEl);
    sun[i + 1] = sun[i] + (c.sun.visible ? step : 0);
    dte[i + 1] = dte[i] + (c.earth.dte ? step : 0);
  }
  const integral = (p, t) => {
    const x = (t - base) / step,
      i = Math.min(n - 1, Math.max(0, Math.floor(x))),
      u = x - i;
    return p[i] + (p[i + 1] - p[i]) * u;
  };
  const output = [],
    duration = durationDays * DAY;
  for (let t = start; t <= end; t += HOUR) {
    if (t < base || t + duration > last) continue;
    output.push({
      time: t,
      sunlitPct:
        ((integral(sun, t + duration) - integral(sun, t)) / duration) * 100,
      earthDtePct:
        ((integral(dte, t + duration) - integral(dte, t)) / duration) * 100,
    });
  }
  return output;
}
