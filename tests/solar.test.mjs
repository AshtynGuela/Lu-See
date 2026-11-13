import { test } from "node:test";
import assert from "node:assert/strict";
import {
  solarPosition,
  solarDisplayPoint,
  monthWindow,
} from "../engine/solar.mjs";
import { parseVectors } from "../server/solar.mjs";
test("solar position interpolation uses velocities and never extrapolates", () => {
  const rows = [
    [0, 0, 2, 3, 0, 0, 0],
    [86400000, 1, 2, 3, 3, 0, 0],
  ];
  assert.deepEqual(solarPosition(rows, 43200000), [0.125, 2, 3]);
  assert.equal(solarPosition(rows, -1), null);
  assert.equal(solarPosition(rows, 86400001), null);
});
test("display scales preserve direction and separate readable compression from AU geometry", () => {
  assert.deepEqual(solarDisplayPoint([1, 0, 0]), [4, 0, -0]);
  assert.deepEqual(solarDisplayPoint([1, 2, 3], true), [2, 6, -4]);
  const { start, end } = monthWindow(Date.parse("2024-02-20"));
  assert.equal(end - start, 29 * 86400000);
});
test("vector parser rejects a wrong frame, time scale or non-numeric payload", () => {
  assert.throws(() => parseVectors("$$SOE\n1,2,3\n$$EOE"));
});
