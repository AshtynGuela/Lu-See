import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { observer } from "../server/horizons.mjs";
import { interpolate } from "../engine/index.mjs";
// Independent direct-Horizons off-grid samples verify the local interpolation.
const results = [];
for (const site of [
  {
    id: "apollo11",
    lat: 0.67416,
    lon: 23.47314,
    start: "1969-07-20T00:00:00Z",
  },
  { id: "im1", lat: -80.13, lon: 1.44, start: "2026-11-13T00:00:00Z" },
]) {
  for (const body of ["sun", "earth"]) {
    const coarse = await observer(body, { ...site, days: 1, step: "10m" }),
      reference = await observer(body, { ...site, days: 1, step: "7m" });
    let maxDirectionErrorDeg = 0,
      count = 0;
    const vector = (s) => {
      const a = (s.az * Math.PI) / 180,
        e = (s.el * Math.PI) / 180;
      return [
        Math.cos(e) * Math.sin(a),
        Math.cos(e) * Math.cos(a),
        Math.sin(e),
      ];
    };
    for (const row of reference.rows) {
      const p = interpolate(coarse.rows, row[0]);
      if (!p) continue;
      const v = vector(p),
        w = vector({ az: row[1], el: row[2] }),
        chord = Math.hypot(...v.map((x, i) => x - w[i])),
        error = (2 * Math.asin(Math.min(1, chord / 2)) * 180) / Math.PI;
      maxDirectionErrorDeg = Math.max(maxDirectionErrorDeg, error);
      count++;
    }
    assert.ok(
      maxDirectionErrorDeg < 0.005,
      `Direction error exceeds tolerance: ${body} ${site.id} ${maxDirectionErrorDeg}`,
    );
    results.push({
      site: site.id,
      body,
      count,
      maxDirectionErrorDeg,
      coarse: coarse.source,
      reference: reference.source,
    });
    console.log(
      site.id,
      body,
      count,
      "samples; max error",
      maxDirectionErrorDeg,
      "deg",
    );
  }
}
await fs.mkdir("data/validation", { recursive: true });
await fs.writeFile(
  "data/validation/horizons-interpolation.json",
  JSON.stringify(
    {
      validatedUtc: new Date().toISOString(),
      method:
        "Direct off-grid JPL Horizons observer tables vs local normalized unit-vector direction interpolation; two sites/dates, not the full acceptance matrix.",
      results,
    },
    null,
    2,
  ),
);
