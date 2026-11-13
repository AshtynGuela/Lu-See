import { ENGINE_VERSION, HOUR, DAY } from "./index.mjs";
import { flightEstimate } from "./mission-history.mjs";

export const missionEpoch = (scenario, time) =>
  scenario.epoch === "live"
    ? Math.floor(time / HOUR) * HOUR
    : Date.parse(scenario.epoch);
export const scientificLimits = [
  "Early screening; confirm results with independent mission tools.",
  "Sun/Earth directions and angular sizes: actual topocentric airless JPL Horizons observer data; normalized unit-vector interpolation, no extrapolation.",
  "Solar fraction combines the terrain horizon with an opaque circular apparent Earth disc. Partial eclipse overlap uses a small-angle disc-area approximation. Atmosphere, refracted/scattered light, solar limb darkening and Earth's ellipsoidal limb are excluded.",
  "Terrain clipping uses 127 deterministic solar-disc samples; mission integration uses ten-minute midpoints. Short grazing events can be missed.",
  "Sunrise/set are terrain-centre crossings, not eclipse contacts. Refined event times do not imply one-second physical accuracy.",
  "DTE is Earth-centre geometry and the antenna elevation limit, not station availability or a radio link budget.",
  "Power index is idealized incidence and distance scaling relative to normal incidence at 1 AU, not electrical energy or a full spacecraft power budget.",
];

export function createAnalysisReport({
  site,
  time,
  mastM,
  minAntennaEl,
  current,
  packet,
  scenario,
  metrics,
  scenarioPacket,
  terrain,
  exportedUtc = new Date().toISOString(),
}) {
  if (!site || !current || !packet)
    throw Error("Current scientific data is not ready to export.");
  if (current.time !== time)
    throw Error("The current reading does not match the selected UTC time.");
  if (scenario) {
    const start = missionEpoch(scenario, time),
      end = start + scenario.durationDays * DAY;
    if (
      !metrics ||
      metrics.start !== start ||
      metrics.end !== end ||
      !scenarioPacket ||
      scenarioPacket.sun[0][0] > start ||
      scenarioPacket.sun.at(-1)[0] < end
    )
      throw Error(
        "Wait for the selected mission window to finish calculating before exporting.",
      );
  }
  const sources = [
    ...new Map(
      [
        ...(packet.sources || []),
        ...(scenarioPacket?.sources || []),
        ...(terrain?.sources || []),
      ].map((s) => [s.sha256 || s.url || JSON.stringify(s), s]),
    ).values(),
  ];
  return {
    schemaVersion: 2,
    application: "Very Best Lunar Site Scouter",
    engineVersion: ENGINE_VERSION,
    exportedUtc,
    challenge:
      "https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/",
    site,
    settings: { mastM, minAntennaEl, timeScale: "UTC" },
    current: {
      epochUtc: new Date(time).toISOString(),
      arrayMode: "horizontal",
      observer: packet.observer,
      values: current,
      sourceIds: (packet.sources || []).map((s) => s.sha256 || s.url),
    },
    mission: scenario
      ? {
          scenario,
          startUtc: new Date(metrics.start).toISOString(),
          endUtc: new Date(metrics.end).toISOString(),
          observer: scenarioPacket.observer,
          ...(scenario.epoch !== "live" && scenario.flightProfile
            ? { flightEstimate: flightEstimate(metrics.start, scenario.flightProfile) }
            : {}),
          metrics: {
            ...metrics,
            events: (metrics.events || []).filter(
              (e) => e.time >= metrics.start && e.time <= metrics.end,
            ),
          },
          eventScope: "within mission interval",
          sourceIds: (scenarioPacket.sources || []).map(
            (s) => s.sha256 || s.url,
          ),
        }
      : null,
    terrain: terrain
      ? {
          included: true,
          resolutionM: terrain.resolutionM,
          elevationM: terrain.elevationM,
          note: terrain.note,
          sources: terrain.sources,
        }
      : {
          included: false,
          note: "Terrain not included; smooth spherical horizon. Terrain-based viability unavailable.",
        },
    sources,
    assumptions: [
      ...scientificLimits,
      ...(terrain
        ? [
            "Terrain horizon: 720 azimuth samples, 150 km search radius, finite LOLA DEM resolution; local obstacles and hardware excluded.",
          ]
        : ["Terrain not included; no terrain-based viability."]),
      ...(scenario?.epoch === "live"
        ? [
            "Live mission summaries refresh on whole UTC hours; current sky readings follow the selected clock.",
          ]
        : []),
    ],
  };
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // User-created site names are text, never executable spreadsheet formulae.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(value))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportCsv(report) {
  const rows = [["section", "field", "value", "unit", "epoch_utc", "source"]],
    add = (section, field, value, unit = "", utc = "", source = "") =>
      rows.push([section, field, value, unit, utc, source]),
    sky = report.current.values,
    now = report.current.epochUtc,
    mission = report.mission;
  add("report", "schema_version", report.schemaVersion);
  add("report", "engine_version", report.engineVersion);
  add("report", "exported_utc", report.exportedUtc);
  add("report", "challenge", report.challenge);
  for (const field of ["id", "name", "lat", "lon", "source"])
    add(
      "site",
      field,
      report.site[field],
      field === "lat"
        ? "deg north-positive"
        : field === "lon"
          ? "deg east-positive"
          : "",
    );
  add(
    "settings",
    "mast_height",
    report.settings.mastM,
    "m above DEM or reference sphere",
  );
  add(
    "settings",
    "minimum_antenna_elevation",
    report.settings.minAntennaEl,
    "deg",
  );
  add("terrain", "included", report.terrain.included);
  if (report.terrain.included) {
    add("terrain", "resolution", report.terrain.resolutionM, "m/pixel");
    add(
      "terrain",
      "elevation",
      report.terrain.elevationM,
      "m above lunar reference radius",
    );
  }
  add("terrain", "note", report.terrain.note);
  for (const body of ["sun", "earth"]) {
    for (const field of ["az", "el", "horizon", "radius"])
      add("current", body + "_" + field, sky[body][field], "deg", now);
    add("current", body + "_range", sky[body].distanceKm, "km", now);
  }
  add(
    "current",
    "solar_disc_visible",
    sky.sun.visibleFraction * 100,
    "% of unobscured solar disc",
    now,
  );
  add(
    "current",
    "earth_blocks_solar_disc",
    sky.sun.eclipse.blockedFraction * 100,
    "%",
    now,
  );
  add(
    "current",
    "eclipse_state",
    sky.sun.eclipse.state,
    "opaque Earth disc geometry",
    now,
  );
  add(
    "current",
    "earth_visible",
    sky.earth.visible,
    "Earth centre above terrain horizon",
    now,
  );
  add(
    "current",
    "earth_dte",
    sky.earth.dte,
    "Earth centre above terrain and antenna limit",
    now,
  );
  add(
    "current",
    "power_index",
    sky.powerIndex,
    "relative; horizontal array",
    now,
  );
  if (mission) {
    const s = mission.scenario,
      m = mission.metrics;
    add("mission", "scenario_id", s.id);
    add("mission", "start_utc", mission.startUtc);
    add("mission", "end_utc", mission.endUtc);
    add("mission", "duration", s.durationDays, "Earth days");
    if (report.mission.flightEstimate) {
      const flight = report.mission.flightEstimate;
      add("flight_estimate", "historical_profile", flight.profileId);
      add("flight_estimate", "launch_to_touchdown", flight.flightHours, "hours");
      add("flight_estimate", "estimated_departure", flight.departureUtc, "UTC");
    }
    add("mission", "array_mode", s.arrayMode || "horizontal");
    add(
      "mission",
      "array_azimuth",
      s.arrayAzimuth ?? 0,
      "deg clockwise from north",
    );
    for (const [field, unit] of [
      ["sunlitPct", "%"],
      ["earthVisiblePct", "%"],
      ["earthDtePct", "%"],
      ["longestDarkH", "h"],
      ["longestSunlitH", "h"],
      ["meanPowerIndex", "relative"],
      [
        "eclipseHours",
        "h; Sun at least partly above terrain during Earth/Sun overlap",
      ],
    ])
      add("mission", field, m[field], unit, mission.startUtc);
    add("mission", "integration_step", m.stepMinutes, "minutes");
    if (s.profile)
      for (const [key, value] of Object.entries(s.profile))
        add("user_threshold", key, value, key.includes("Hours") ? "h" : "%");
    for (const e of m.events || [])
      add(
        "terrain_event",
        e.body + "_" + e.kind,
        new Date(e.time).toISOString(),
        "UTC; terrain centre crossing",
        new Date(e.time).toISOString(),
      );
  }
  for (const [scope, record] of [
    ["current", report.current],
    ["mission", mission],
  ])
    if (record) {
      for (const [key, value] of Object.entries(record.observer || {}))
        add(scope + "_observer", key, value);
      for (const id of record.sourceIds)
        add(scope + "_source", "reference", id);
    }
  for (const source of report.sources)
    for (const [key, value] of Object.entries(source))
      add(
        "source",
        key,
        typeof value === "object" ? JSON.stringify(value) : value,
        "",
        "",
        source.sha256 || source.url || "",
      );
  for (const note of report.assumptions) add("assumption", "limit", note);
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
