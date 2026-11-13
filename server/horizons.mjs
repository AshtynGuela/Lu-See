import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const endpoint = "https://ssd.jpl.nasa.gov/api/horizons.api";
const cacheDir = path.resolve(".cache/horizons");
let queue = Promise.resolve();
const inflight = new Map();
export function enqueueHorizons(task) {
  const job = queue.then(task);
  queue = job.catch(() => {});
  return job;
}
export function parseObserver(text) {
  if (!text.includes("$$SOE") || !text.includes("$$EOE"))
    throw new Error(
      "Horizons did not return a usable observer table. " + text.slice(0, 200),
    );
  if (!text.includes("MEAN_ME") || !text.includes("AIRLESS"))
    throw new Error(
      "Unexpected lunar frame or refraction in Horizons response",
    );
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const rows = text
    .split("$$SOE")[1]
    .split("$$EOE")[0]
    .trim()
    .split("\n")
    .map((line) => {
      const f = line.split(",").map((x) => x.trim()),
        m = f[0].match(/(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})(?::([\d.]+))?/);
      if (!m) throw new Error("Unrecognized Horizons timestamp");
      const t = Date.UTC(
        +m[1],
        months.indexOf(m[2]),
        +m[3],
        +m[4],
        +m[5],
        +(m[6] || 0),
      );
      const vals = [+f[3], +f[4], +f[5], +f[6] * 149597870.7];
      if (!vals.every(Number.isFinite))
        throw new Error("Unavailable Horizons angle or distance");
      return [t, ...vals];
    });
  if (rows.length < 2) throw new Error("Horizons table is too short");
  return rows;
}
export async function observer(
  body,
  { lat, lon, elevationM = 0, start, days = 33, step = "10m" },
) {
  const from = new Date(start),
    to = new Date(from.getTime() + days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " "),
    quote = (s) => `'${s}'`;
  const params = {
    format: "json",
    COMMAND: quote(body === "sun" ? "10" : "399"),
    EPHEM_TYPE: quote("OBSERVER"),
    CENTER: quote("coord@301"),
    COORD_TYPE: quote("GEODETIC"),
    SITE_COORD: quote(`${lon},${lat},${elevationM / 1000}`),
    START_TIME: quote(fmt(from)),
    STOP_TIME: quote(fmt(to)),
    STEP_SIZE: quote(step),
    QUANTITIES: quote("4,13,20"),
    CSV_FORMAT: quote("YES"),
    EXTRA_PREC: quote("YES"),
    OBJ_DATA: quote("NO"),
    APPARENT: quote("AIRLESS"),
    TIME_DIGITS: quote("SECONDS"),
    CAL_FORMAT: quote("CAL"),
  };
  const url = endpoint + "?" + new URLSearchParams(params),
    key = crypto.createHash("sha256").update(url).digest("hex"),
    file = path.join(cacheDir, key + ".json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  if (inflight.has(key)) return inflight.get(key);
  const job = enqueueHorizons(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok)
      throw new Error(`JPL Horizons returned ${response.status}`);
    const json = await response.json();
    if (json.error) throw new Error("Horizons: " + json.error);
    const rows = parseObserver(json.result),
      retrievedUtc = new Date().toISOString();
    const data = {
      rows,
      source: {
        name: "NASA/JPL Horizons",
        url,
        apiSignature: json.signature,
        sha256: crypto.createHash("sha256").update(json.result).digest("hex"),
        retrievedUtc,
        frame: "MEAN_ME (high precision)",
        model:
          json.result.match(/Target body name:.*?\{source: ([^}]+)\}/)?.[1] ||
          "Horizons",
        refraction: "AIRLESS",
        step,
        observerAltitudeM: elevationM,
        timeSystem: "UTC (Horizons UT output after 1962)",
        rawFile: key + ".txt",
      },
    };
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, key + ".txt"), json.result);
    await fs.writeFile(file, JSON.stringify(data));
    return data;
  });
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}
export async function ephemeris(options) {
  const sun = await observer("sun", options),
    earth = await observer("earth", options);
  return {
    sun: sun.rows,
    earth: earth.rows,
    sources: [sun.source, earth.source],
    interpolation:
      "Normalized unit-vector interpolation for direction; linear angular diameter and range between 10-minute API samples; no extrapolation",
  };
}
