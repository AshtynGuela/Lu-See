import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { DAY, interpolate } from "../engine/index.mjs";
import { observer } from "../server/horizons.mjs";

const catalogue = JSON.parse(await fs.readFile("data/sites.json", "utf8"));
const cases = [
  ["apollo11", "1969-07-20"], ["apollo15", "1971-07-30"],
  ["change4", "2019-01-03"], ["chandrayaan3", "2023-08-23"],
  ["im1", "2024-02-22"], ["change6", "2024-06-01"],
  ["blueghost1", "2025-03-02"], ["im2", "2025-03-06"],
  ["shackleton", "2039-11-01"],
];
const inputs = [], sources = [];
for (const [id, day] of cases) {
  const site = catalogue.find(s => s.id === id);
  const { elevationM } = JSON.parse(await fs.readFile(`public/data/${id}.json`, "utf8"));
  const start = Date.parse(day), mastM = 2;
  for (const body of ["sun", "earth"]) {
    const packet = await observer(body, { ...site, elevationM: elevationM + mastM, start, days: 1 });
    const samples = Array.from({ length: 12 }, (_, i) => start + (i * 2 + 1) * DAY / 24 + 233000)
      .map(t => ({ utc: new Date(t).toISOString(), ...interpolate(packet.rows, t) }));
    inputs.push({ id, body, lat: site.lat, lon: site.lon, elevationM, mastM, samples });
    sources.push({ id, body, ...packet.source });
    console.log(id, body, samples.length, "Horizons samples ready");
  }
}
const report = JSON.parse(execFileSync(process.env.LUNAR_TERRAIN_PYTHON || "python",
  ["scripts/validate_spice.py"], { input: JSON.stringify(inputs), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
const toleranceDeg = .005;
const reportFile = process.argv[2] || "data/validation/spice.json";
await fs.writeFile(reportFile, JSON.stringify({
  validatedUtc: new Date().toISOString(), toleranceDeg, ...report, horizonsSources: sources,
}, null, 2) + "\n");
console.log(`${report.directions} directions · max difference ${report.maxDirectionErrorDeg.toFixed(7)}°`);
assert.ok(report.maxDirectionErrorDeg < toleranceDeg, `SPICE residual exceeds ${toleranceDeg}°. See ${reportFile}.`);
