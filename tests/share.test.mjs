import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSession, decodeSession } from "../src/share.mjs";
const state = {
  scenarios: [
    {
      id: "A",
      siteId: "im1",
      epoch: "2026-11-13T00:00:00.000Z",
      durationDays: 14,
      arrayMode: "tracking",
    },
  ],
  custom: [],
  mastM: 5,
  minAntennaEl: 7,
  time: Date.parse("2026-11-13"),
  selected: "im1",
  view: "globe",
  mode: "engineer",
};
test("share retains the scientific settings that affect results", () => {
  const parsed = decodeSession(encodeSession(state), [{ id: "im1" }]);
  assert.equal(parsed.mastM, 5);
  assert.equal(parsed.minAntennaEl, 7);
  assert.equal(parsed.scenarios[0].arrayMode, "tracking");
});
test("share validation rejects malformed dates, duplicate IDs and unknown sites", () => {
  assert.throws(() =>
    encodeSession({
      ...state,
      scenarios: [{ ...state.scenarios[0], epoch: "tomorrow" }],
    }),
  );
  assert.throws(() =>
    encodeSession({
      ...state,
      scenarios: [state.scenarios[0], state.scenarios[0]],
    }),
  );
  assert.throws(() => decodeSession(encodeSession(state), []));
});
