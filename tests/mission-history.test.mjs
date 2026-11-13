import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY, HOUR } from "../engine/index.mjs";
import { arrivalSearch, flightEstimate, historicalTiming } from "../engine/mission-history.mjs";

test("historical estimates retain different launch-to-touchdown profiles", () => {
  assert.equal(historicalTiming("im-1").flightHours, 185);
  assert.equal(historicalTiming("im-1").surfaceDays, 7);
  assert.equal(historicalTiming("apollo").flightHours, 106);
  assert.equal(historicalTiming("apollo").surfaceDays, 2.1);
  assert.equal(historicalTiming("blue-ghost").flightHours, 1106);
  assert.equal(historicalTiming("blue-ghost").surfaceDays, 14.6);
  assert.equal(flightEstimate(Date.now(), "toString"), null);
});

test("hourly arrival search never implies departure before the chosen clock", () => {
  const departure = Date.parse("2025-03-01T06:40Z");
  const { start, end } = arrivalSearch(departure, 30, "im-1");
  const flight = flightEstimate(start, "im-1");
  assert.equal(Date.parse(flight.departureUtc), Date.parse("2025-03-01T07:00Z"));
  assert.equal(Date.parse(flight.arrivalUtc) - Date.parse(flight.departureUtc), 185 * HOUR);
  assert.equal(end - start, 30 * DAY);
});
