import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  PLANETS,
  AU_KM,
  monthWindow,
  solarPosition,
} from "../engine/solar.mjs";
import { solarPacket, vectorTable } from "../server/solar.mjs";
const time =
    monthWindow(Date.now()).start +
    12 * 86400000 +
    3 * 3600000 +
    17 * 60000 +
    19000,
  reports = [];
for (const body of PLANETS) {
  const p = await solarPacket(body.id, time),
    reference = await vectorTable(body, time, time + 2000, "1"),
    t = reference.rows[0][0],
    actual = solarPosition(p.samples, t),
    expected = reference.rows[0].slice(1, 4),
    errorKm = Math.hypot(...actual.map((x, i) => x - expected[i])) * AU_KM;
  assert.ok(
    errorKm < 2,
    body.name + " vector interpolation error " + errorKm + " km",
  );
  reports.push({
    body: body.name,
    timeUtc: new Date(t).toISOString(),
    errorKm,
    source: p.source,
    reference: reference.source,
  });
  console.log(body.name, errorKm.toFixed(5), "km");
}
await fs.writeFile(
  "data/validation/solar-vectors.json",
  JSON.stringify(
    {
      validatedUtc: new Date().toISOString(),
      method:
        "One off-grid check per planet against direct JPL vectors; not independent ephemeris validation. Six-hour cubic Hermite position/velocity interpolation.",
      reports,
    },
    null,
    2,
  ),
);
