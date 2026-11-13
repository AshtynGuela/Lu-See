import { test } from "node:test";
import assert from "node:assert/strict";
import { conditions, summarize, DAY } from "../engine/index.mjs";
import { createAnalysisReport, reportCsv } from "../engine/report.mjs";
const packet = {
  sun: [
    [0, 90, 20, 1920, 149597870.7],
    [3 * DAY, 90, 20, 1920, 149597870.7],
  ],
  earth: [
    [0, 0, 10, 6800, 380000],
    [3 * DAY, 0, 10, 6800, 380000],
  ],
  sources: [
    {
      name: "Fixture for report tests only",
      sha256: "a".repeat(64),
      url: "https://example.test/source",
    },
  ],
  observer: { lat: 0, lon: 0, elevationM: 0, mastM: 2 },
};
const site = {
  id: "test",
  name: '=HYPERLINK("https://example.test")\nTest, site',
  lat: 0,
  lon: -1,
  source: "https://example.test/site",
};
function input() {
  return {
    site,
    time: DAY,
    mastM: 2,
    minAntennaEl: 5,
    packet,
    current: conditions(packet, DAY),
    terrain: null,
    scenario: {
      id: "A",
      siteId: "test",
      epoch: new Date(0).toISOString(),
      durationDays: 1,
      arrayMode: "tracking",
    },
    scenarioPacket: packet,
    metrics: summarize(packet, 0, 1, null, 5, 0, null, "tracking"),
  };
}
test("report preserves separate current and pinned mission dates with settings and sources", () => {
  const report = createAnalysisReport(input());
  assert.equal(report.current.epochUtc, new Date(DAY).toISOString());
  assert.equal(report.mission.startUtc, new Date(0).toISOString());
  assert.equal(report.mission.scenario.arrayMode, "tracking");
  assert.equal(report.current.arrayMode, "horizontal");
  assert.equal(report.terrain.included, false);
  assert.equal(report.sources.length, 1);
  assert.ok(
    report.assumptions.some((s) => s.includes("no terrain-based viability")),
  );
});
test("reports reject missing or stale mission calculations and omit out-of-mission events", () => {
  assert.throws(
    () => createAnalysisReport({ ...input(), metrics: null }),
    /finish calculating/,
  );
  assert.throws(
    () =>
      createAnalysisReport({
        ...input(),
        metrics: { ...input().metrics, start: DAY },
      }),
    /finish calculating/,
  );
  assert.throws(
    () =>
      createAnalysisReport({
        ...input(),
        current: { ...input().current, time: 0 },
      }),
    /does not match/,
  );
  const args = input();
  args.metrics.events = [
    { body: "sun", kind: "rise", time: DAY / 2 },
    { body: "sun", kind: "set", time: 2 * DAY },
  ];
  assert.equal(createAnalysisReport(args).mission.metrics.events.length, 1);
});
test("CSV escapes user text and formulae while retaining numeric precision and provenance", () => {
  const csv = reportCsv(createAnalysisReport(input()));
  assert.ok(csv.startsWith('\uFEFF"section"'));
  assert.ok(
    csv.includes('"\'=HYPERLINK(""https://example.test"")\nTest, site"'),
  );
  assert.ok(csv.includes('"lon","-1","deg east-positive"'));
  assert.ok(csv.includes('"source","sha256","' + "a".repeat(64) + '"'));
  assert.ok(csv.includes('"mission","array_mode","tracking"'));
});
