import { z } from "zod";
import { MISSION_PROFILES } from "../engine/mission-history.mjs";
const date = z.iso
  .datetime()
  .refine(
    (s) =>
      Date.parse(s) >= Date.parse("1969-01-01") &&
      Date.parse(s) < Date.parse("2041-01-01"),
  );
const profile = z.object({
  minSunlitPct: z.number().min(0).max(100),
  maxDarknessHours: z.number().min(0).max(2160),
  minEarthDtePct: z.number().min(0).max(100),
});
const scenario = z
  .object({
    id: z.enum(["A", "B", "C", "D"]),
    siteId: z.string().max(80),
    epoch: z.union([z.literal("live"), date]),
    durationDays: z.number().min(0.1).max(90),
    flightProfile: z.enum(Object.keys(MISSION_PROFILES)).optional(),
    arrayMode: z
      .enum(["horizontal", "vertical", "single_axis", "tracking"])
      .optional(),
    arrayAzimuth: z.number().min(0).max(360).optional(),
    profile: profile.optional(),
  })
  .refine(
    (s) =>
      s.epoch === "live" ||
      Date.parse(s.epoch) + s.durationDays * 86400000 <
        Date.parse("2041-01-01"),
  );
const custom = z.object({
  id: z
    .string()
    .regex(/^custom-[a-f0-9-]+$/)
    .max(80),
  name: z.string().trim().min(1).max(64),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
const session = z
  .object({
    version: z.literal(1),
    activeScenarioId: z.string().nullable().optional(),
    scenarios: z.array(scenario).max(4),
    custom: z.array(custom).max(40),
    mastM: z.union([z.literal(0), z.literal(2), z.literal(5), z.literal(10)]),
    minAntennaEl: z.number().min(0).max(90),
    timeUtc: date,
    selected: z.string().max(80),
    view: z.enum([
      "solar_system",
      "overview",
      "globe",
      "polar_south",
      "polar_north",
      "horizon",
      "surface",
    ]),
    mode: z.enum(["plain", "engineer"]),
  })
  .refine(
    (s) => new Set(s.scenarios.map((x) => x.id)).size === s.scenarios.length,
  );
export function encodeSession(state) {
  const value = session.parse({
    version: 1,
    activeScenarioId: state.activeScenarioId || null,
    scenarios: state.scenarios,
    custom: state.custom,
    mastM: state.mastM,
    minAntennaEl: state.minAntennaEl,
    timeUtc: new Date(state.time).toISOString(),
    selected: state.selected,
    view: state.view,
    mode: state.mode,
  });
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))),
  );
}
export function decodeSession(encoded, curated) {
  if (encoded.length > 30000) throw Error("Shared session is too large");
  const text = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    ),
    value = session.parse(JSON.parse(text)),
    customSites = value.custom.map((s) => ({
      ...s,
      family: "custom",
      region: "Shared custom coordinates",
      source: "User-shared coordinates",
      description: "Smooth horizon only. Terrain not included.",
    }));
  const ids = new Set([...curated, ...customSites].map((s) => s.id));
  if (
    !ids.has(value.selected) ||
    value.scenarios.some((s) => !ids.has(s.siteId))
  )
    throw Error("Shared session contains an unknown site");
  return {
    scenarios: value.scenarios,
    activeScenarioId: value.activeScenarioId || null,
    custom: customSites,
    mastM: value.mastM,
    minAntennaEl: value.minAntennaEl,
    time: Date.parse(value.timeUtc),
    selected: value.selected,
    view: value.view,
    mode: value.mode,
    compare: value.scenarios.length > 0,
  };
}
