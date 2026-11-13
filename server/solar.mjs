import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { enqueueHorizons } from "./horizons.mjs";
import {
  SOLAR_BODIES,
  PHYSICAL_SOURCE,
  monthWindow,
} from "../engine/solar.mjs";
const inflight = new Map(),
  cache = path.resolve(".cache/horizons");
export function parseVectors(text) {
  if (
    !text?.includes("$$SOE") ||
    !/Ecliptic of J2000/i.test(text) ||
    !/AU-D/.test(text) ||
    !/JDUT/.test(text) ||
    !/Calendar Date \(UT\s*\)/.test(text) ||
    !/Center body name:\s*Sun \(10\)/.test(text) ||
    !/GEOMETRIC cartesian states/.test(text)
  )
    throw Error("Unexpected Horizons vector frame, units or time system");
  const rows = text
    .split("$$SOE")[1]
    .split("$$EOE")[0]
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split(",").map((s) => s.trim()),
        vals = [cols[0], ...cols.slice(2, 8)].map(Number);
      if (
        cols.length < 8 ||
        cols.slice(2, 8).some((s) => !s) ||
        vals.length !== 7 ||
        vals.some((v) => !Number.isFinite(v))
      )
        throw Error("Malformed JPL vector sample");
      return [(vals[0] - 2440587.5) * 86400000, ...vals.slice(1)];
    });
  if (rows.length < 2 || rows.some((r, i) => i && r[0] <= rows[i - 1][0]))
    throw Error("Unordered JPL vector samples");
  return rows;
}
export async function vectorTable(body, start, end, step) {
  const fmt = (t) => new Date(t).toISOString().slice(0, 19).replace("T", " "),
    params = {
      format: "json",
      COMMAND: `'${body.target}'`,
      EPHEM_TYPE: "'VECTORS'",
      CENTER: "'500@10'",
      REF_PLANE: "'ECLIPTIC'",
      REF_SYSTEM: "'ICRF'",
      VEC_CORR: "'NONE'",
      OUT_UNITS: "'AU-D'",
      TIME_TYPE: "'UT'",
      START_TIME: `'${fmt(start)}'`,
      STOP_TIME: `'${fmt(end)}'`,
      STEP_SIZE: `'${step}'`,
      CSV_FORMAT: "'YES'",
      VEC_TABLE: "'2'",
      OBJ_DATA: "'NO'",
    };
  const url =
      "https://ssd.jpl.nasa.gov/api/horizons.api?" +
      new URLSearchParams(params),
    key = crypto.createHash("sha256").update(url).digest("hex"),
    file = path.join(cache, key + ".vectors.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  if (inflight.has(key)) return inflight.get(key);
  const job = enqueueHorizons(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok)
      throw Error("JPL vector request failed (" + response.status + ")");
    const data = await response.json();
    if (data.error) throw Error("Horizons: " + data.error);
    const rows = parseVectors(data.result);
    const source = {
      name: "NASA/JPL Horizons",
      url,
      sha256: crypto.createHash("sha256").update(data.result).digest("hex"),
      rawFile: key + ".txt",
      retrievedUtc: new Date().toISOString(),
      apiSignature: data.signature,
      frame: "Sun-centred ecliptic J2000 / ICRF",
      timeSystem: "UTC (Horizons UT after 1962)",
      units: "AU, AU/day",
      target: body.target,
      targetType: body.barycentre
        ? "planetary-system barycentre"
        : "planet centre",
      model:
        data.result.match(/Target body name:.*?\{source: ([^}]+)\}/)?.[1] ||
        "Horizons",
    };
    const packet = { rows, source };
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, key + ".txt"), data.result);
    await fs.writeFile(file, JSON.stringify(packet));
    return packet;
  });
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}
export async function solarPacket(id, time) {
  const body = SOLAR_BODIES.find((p) => p.id === id);
  if (!body) throw Error("Unknown planet");
  const { start, end } = monthWindow(time),
    mid = (start + end) / 2,
    span = body.periodYears * 365.25 * 86400000;
  const local = await vectorTable(body, start, end, "6h"),
    orbit = await vectorTable(body, mid - span / 2, mid + span / 2, "192");
  return {
    id,
    body,
    start,
    end,
    samples: local.rows,
    orbit: orbit.rows,
    source: local.source,
    orbitSource: orbit.source,
    physicalSource: PHYSICAL_SOURCE,
    note: "Orbit paths sample roughly one revolution of real JPL trajectories. Cubic Hermite interpolation uses six-hour position/velocity samples. Readable mode compresses radial spacing and enlarges bodies; physical mode uses linear AU and physical body sizes.",
  };
}
