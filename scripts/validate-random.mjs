import fs from "node:fs/promises";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { parseObserver } from "../server/horizons.mjs";
import { interpolate } from "../engine/index.mjs";
const catalogue = JSON.parse(await fs.readFile("data/sites.json", "utf8"));
const sites = [
  ...catalogue.filter((s) =>
    [
      "im1",
      "shackleton",
      "apollo11",
      "apollo12",
      "apollo15",
      "apollo16",
      "apollo17",
      "change4",
      "chandrayaan3",
    ].includes(s.id),
  ),
  { id: "north-pole-validation", lat: 89.5, lon: 0 },
];
let seed = 20261113;
const rng = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
  start = Date.parse("1969-01-01"),
  end = Date.parse("2040-12-01");
await fs.mkdir(".cache/validation", { recursive: true });
const reports = [];
async function query(site, body, times) {
  const q = (s) => `'${s}'`,
    fmt = (t) => new Date(t).toISOString().slice(0, 19).replace("T", " "),
    params = {
      format: "json",
      COMMAND: q(body === "sun" ? "10" : "399"),
      EPHEM_TYPE: q("OBSERVER"),
      CENTER: q("coord@301"),
      COORD_TYPE: q("GEODETIC"),
      SITE_COORD: q(`${site.lon},${site.lat},0.002`),
      TLIST: times.map((t) => q(fmt(t))).join(" "),
      QUANTITIES: q("4,13,20"),
      CSV_FORMAT: q("YES"),
      EXTRA_PREC: q("YES"),
      OBJ_DATA: q("NO"),
      APPARENT: q("AIRLESS"),
      TIME_DIGITS: q("SECONDS"),
    };
  const url =
      "https://ssd.jpl.nasa.gov/api/horizons.api?" +
      new URLSearchParams(params),
    key = crypto.createHash("sha256").update(url).digest("hex"),
    file = ".cache/validation/" + key + ".json";
  let result;
  try {
    result = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw Error("JPL HTTP " + response.status);
        result = await response.json();
        if (result.error || !result.result?.includes("$$SOE"))
          throw Error(result.error || result.result);
        await fs.writeFile(file, JSON.stringify(result));
        break;
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
  }
  return {
    rows: parseObserver(result.result),
    source: {
      url,
      sha256: crypto.createHash("sha256").update(result.result).digest("hex"),
    },
  };
}
for (const site of sites) {
  const samples = Array.from({ length: 20 }, () => {
    const base = Math.floor((start + rng() * (end - start)) / 600000) * 600000;
    return { base, time: base + Math.floor(1 + rng() * 598) * 1000 };
  }).sort((a, b) => a.time - b.time);
  for (const body of ["sun", "earth"]) {
    const coarse = await query(
        site,
        body,
        samples.flatMap((s) => [s.base, s.base + 600000]),
      ),
      fine = await query(
        site,
        body,
        samples.map((s) => s.time),
      );
    let max = 0;
    for (const row of fine.rows) {
      const p = interpolate(coarse.rows, row[0]),
        rad = Math.PI / 180,
        v = (s) => [
          Math.cos(s.el * rad) * Math.sin(s.az * rad),
          Math.cos(s.el * rad) * Math.cos(s.az * rad),
          Math.sin(s.el * rad),
        ],
        a = v(p),
        b = v({ az: row[1], el: row[2] }),
        d =
          (2 *
            Math.asin(
              Math.min(1, Math.hypot(...a.map((x, i) => x - b[i])) / 2),
            )) /
          rad;
      max = Math.max(max, d);
    }
    assert.ok(max < 0.005, `${site.id} ${body} interpolation error ${max}`);
    reports.push({
      site: site.id,
      lat: site.lat,
      lon: site.lon,
      body,
      count: fine.rows.length,
      maxDirectionErrorDeg: max,
      coarse: coarse.source,
      reference: fine.source,
    });
    console.log(site.id, body, "max", max.toExponential(3), "deg");
  }
}
await fs.mkdir("data/validation", { recursive: true });
await fs.writeFile(
  "data/validation/random-interpolation.json",
  JSON.stringify(
    {
      validatedUtc: new Date().toISOString(),
      seed: 20261113,
      timestamps: 200,
      directions: 400,
      range: "1969–2040",
      method:
        "Independent sparse direct-Horizons observer queries vs normalized unit-vector interpolation over bracketing 10-minute samples; mast 2 m above reference sphere. This tests interpolation, not the upstream ephemeris against independent SPICE.",
      reports,
    },
    null,
    2,
  ),
);
