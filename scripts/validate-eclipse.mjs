import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { ephemeris } from "../server/horizons.mjs";
import { conditions, summarize } from "../engine/index.mjs";
const site = JSON.parse(await fs.readFile("data/sites.json", "utf8")).find(
    (s) => s.id === "apollo11",
  ),
  terrain = JSON.parse(await fs.readFile("public/data/apollo11.json", "utf8")),
  start = "2025-03-14T00:00:00.000Z",
  data = await ephemeris({
    lat: site.lat,
    lon: site.lon,
    elevationM: terrain.elevationM + 2,
    start,
    days: 1,
  });
data.observer = {
  lat: site.lat,
  lon: site.lon,
  elevationM: terrain.elevationM,
  mastM: 2,
  terrainApplied: true,
};
const checks = [
  { utc: "2025-03-14T02:00:00.000Z", expected: "none" },
  { utc: "2025-03-14T07:00:00.000Z", expected: "total" },
  { utc: "2025-03-14T12:00:00.000Z", expected: "none" },
].map(({ utc, expected }) => {
  const c = conditions(
    data,
    Date.parse(utc),
    terrain.masks["2"],
    5,
    0,
    "tracking",
  );
  assert.equal(c.sun.eclipse.state, expected, utc);
  if (expected === "total") {
    assert.equal(c.powerIndex, 0);
    assert.equal(c.sun.terrainVisibleFraction, 1);
  }
  return {
    utc,
    expected,
    observed: c.sun.eclipse.state,
    sunElDeg: c.sun.el,
    solarDiscBlockedFraction: c.sun.eclipse.blockedFraction,
    solarDiscVisibleFraction: c.sun.visibleFraction,
    trackingPowerIndex: c.powerIndex,
  };
});
const metrics = summarize(data, Date.parse(start), 1, terrain.masks["2"]);
assert.ok(metrics.eclipseHours > 1 && metrics.eclipseHours < 6);
const report = {
  validatedUtc: new Date().toISOString(),
  site,
  checks,
  metrics,
  reference: {
    url: "https://science.nasa.gov/solar-system/moon/what-you-need-to-know-about-the-march-2025-total-lunar-eclipse/",
    totalityWholeMoonUtc: ["2025-03-14T06:26:00Z", "2025-03-14T07:31:00Z"],
  },
  scope:
    "Actual JPL topocentric observer geometry at a curated Apollo 11 point. Broad state checks well inside/outside NASA's documented March 2025 eclipse; not a contact-time validation. Local site occultation times differ from whole-Moon contacts. Atmospheric shadow enlargement, refraction/scattering, solar limb darkening and ellipsoidal Earth limb excluded.",
  sources: data.sources,
  terrainSources: terrain.sources,
};
await fs.mkdir("data/validation", { recursive: true });
await fs.writeFile(
  "data/validation/eclipse.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    checks,
    eclipseHours: metrics.eclipseHours,
    sunlitPct: metrics.sunlitPct,
  }),
);
