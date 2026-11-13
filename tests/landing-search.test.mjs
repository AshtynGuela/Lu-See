import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR } from '../engine/index.mjs';
import { nextWindowSearch, nextWindowChunk } from '../engine/landing-search.mjs';
import { landingWindows } from '../engine/landing.mjs';

test('forward search checks every hourly candidate exactly once across a full year', () => {
  const search = nextWindowSearch(Date.parse('2026-01-01T00:20Z'), 7);
  let chunk = search, count = 0, previousEnd = null;
  while (true) {
    if (previousEnd !== null) assert.equal(chunk.start, previousEnd + HOUR);
    assert.ok(chunk.end - chunk.start < 30 * DAY);
    count += (chunk.end - chunk.start) / HOUR + 1;
    previousEnd = chunk.end;
    if (chunk.end === search.limit) break;
    chunk = nextWindowChunk(chunk.end + HOUR, search.limit);
  }
  assert.equal(count, 365 * 24);
  assert.equal(search.origin, Date.parse('2026-01-01T01:00Z'));
});

test('forward search keeps the entire manual mission inside supported coverage', () => {
  for (const days of [.1, 7, 90]) {
    const search = nextWindowSearch(Date.parse('2040-09-01'), days);
    assert.ok(search.limit + days * DAY < Date.parse('2041-01-01'));
    assert.ok(search.limit + HOUR + days * DAY >= Date.parse('2041-01-01'));
  }
  assert.throws(() => nextWindowSearch(Date.parse('2040-12-31'), 7), /No further arrivals/);
  assert.throws(() => nextWindowSearch(Date.now(), 0), /duration/);
});

test('chronological batches continue through an empty month to the earliest actual match', () => {
  const epoch = Date.parse('2025-01-01'), sun = [], earth = [];
  for (let i = 0; i <= 62 * 24 * 6; i++) {
    const t = epoch + i * 600000;
    sun.push([t, 90, t < epoch + 31 * DAY ? -30 : 30, 1920, 149597870.7]);
    earth.push([t, 270, 20, 6800, 380000]);
  }
  const data = {sun, earth}, profile = {minSunlitPct:100,maxDarknessHours:0,minEarthDtePct:100};
  const search = nextWindowSearch(epoch, 1);
  const first = landingWindows(data, search.start, search.end, 1, null, 5, profile);
  assert.equal(first.matching, 0);
  assert.equal(first.tested, 720);
  const next = nextWindowChunk(search.end + HOUR, search.limit);
  const result = landingWindows(data, next.start, next.end, 1, null, 5, profile);
  assert.equal(result.windows[0].first.time, epoch + 31 * DAY);
  assert.equal(result.windows[0].first.sunlitPct, 100);
});
