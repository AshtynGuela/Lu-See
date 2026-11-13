import { DAY, HOUR } from "./index.mjs";

const nasaApollo = "https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/";
const hours = (h, m, s = 0) => h + m / 60 + s / 3600;
const elapsed = (from, to) => (Date.parse(to) - Date.parse(from)) / HOUR;
const apollo = (number, flightHours, surfaceHours) => ({
  name: `Apollo ${number}`, flightHours, surfaceHours,
  sources: [nasaApollo + `Apollo_${number}a_Summary.htm`],
});

export const MISSION_PROFILES = {
  "im-1": {
    label: "IM-1 · Robotic lander",
    missions: [{
      name: "IM-1 Odysseus",
      flightHours: elapsed("2024-02-15T06:05Z", "2024-02-22T23:23Z"),
      surfaceHours: 7 * 24,
      sources: ["https://ntrs.nasa.gov/citations/20250010290", "https://www.intuitivemachines.com/im-1"],
    }],
  },
  apollo: {
    label: "Apollo · Crewed landing",
    missions: [
      apollo(11, hours(102, 45, 39.9), hours(21, 36, 20.89)),
      apollo(12, hours(110, 32, 36.2), hours(31, 31, 11.6)),
      apollo(14, hours(108, 15, 11.4), hours(33, 30, 31)),
      apollo(15, hours(104, 42, 29.3), hours(66, 54, 53.9)),
      apollo(16, hours(104, 29, 35), hours(71, 2, 13)),
      apollo(17, hours(110, 21, 58), hours(74, 59, 40)),
    ],
  },
  "blue-ghost": {
    label: "Blue Ghost · Extended cruise",
    missions: [{
      name: "Blue Ghost Mission 1",
      flightHours: elapsed("2025-01-15T06:11Z", "2025-03-02T08:34Z"),
      surfaceHours: elapsed("2025-03-02T08:34Z", "2025-03-16T23:15Z"),
      sources: ["https://fireflyspace.com/news/blue-ghost-mission-1-live-updates/"],
    }],
  },
};

export const DEFAULT_MISSION_PROFILE = "im-1";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return (sorted[mid] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2;
}

export function historicalTiming(profileId) {
  const profile = Object.hasOwn(MISSION_PROFILES, profileId) ? MISSION_PROFILES[profileId] : null;
  if (!profile) return null;
  const flights = profile.missions.map(m => m.flightHours);
  return {
    ...profile,
    // Round the planning offset to the same hourly grid as arrival screening.
    flightHours: Math.round(median(flights)),
    surfaceDays: Math.round(median(profile.missions.map(m => m.surfaceHours)) / 24 * 10) / 10,
    observedMinHours: Math.min(...flights),
    observedMaxHours: Math.max(...flights),
  };
}

export function arrivalSearch(earliestDeparture, searchDays, profileId) {
  const timing = historicalTiming(profileId);
  const start = Math.ceil((earliestDeparture + timing.flightHours * HOUR) / HOUR) * HOUR;
  return { start, end: start + searchDays * DAY };
}

export function flightEstimate(arrival, profileId) {
  const timing = historicalTiming(profileId);
  if (!timing || !Number.isFinite(arrival)) return null;
  return {
    profileId,
    flightHours: timing.flightHours,
    departureUtc: new Date(arrival - timing.flightHours * HOUR).toISOString(),
    arrivalUtc: new Date(arrival).toISOString(),
    method: "Historical launch-to-touchdown median rounded to the nearest hour",
    missions: timing.missions,
  };
}
