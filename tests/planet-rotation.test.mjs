import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {Vector3} from "three";
import {planetOrientation, earthTableSize} from "../engine/planetOrientation.mjs";

const references = JSON.parse(fs.readFileSync(new URL("./fixtures/planet-rotation.json", import.meta.url)));
const bytes = gunzipSync(fs.readFileSync(new URL("../public/assets/planets/earth-orientation.bin", import.meta.url)));
const table = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const axes = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];

test("planet rotations reproduce independent SPICE reference frames including historical UTC", () => {
  assert.equal(table.byteLength, earthTableSize);
  for (const row of references) {
    const orientation = planetOrientation(row.id, Date.parse(row.time), table);
    for (let i = 0; i < 3; i++) {
      const actual = new Vector3(...axes[i]).applyQuaternion(orientation);
      const [x, y, z] = row.axes[i];
      const errorDeg = actual.angleTo(new Vector3(x, z, -y)) * 180 / Math.PI;
      assert.ok(errorDeg < 0.0001, row.id + " " + row.time + " axis " + i + " error " + errorDeg);
    }
  }
});

test("Earth completes a sidereal turn and Venus rotates in the reverse direction", () => {
  const time = Date.parse("2026-11-14T12:00:00Z");
  const earth = planetOrientation("earth", time, table);
  const after = planetOrientation("earth", time + 86164091, table);
  assert.ok(earth.angleTo(after) < 0.00002);
  for (const [id, direction] of [["earth", 1], ["venus", -1]]) {
    const from = planetOrientation(id, time, table);
    const to = planetOrientation(id, time + 3600000, table);
    const pole = new Vector3(0, 1, 0).applyQuaternion(from);
    const start = new Vector3(1, 0, 0).applyQuaternion(from);
    const end = new Vector3(1, 0, 0).applyQuaternion(to);
    assert.ok(start.cross(end).dot(pole) * direction > 0);
  }
});
