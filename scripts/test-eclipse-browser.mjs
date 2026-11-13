import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { encodeSession } from "../src/share.mjs";
const root = "data/validation/ui-eclipse-export",
  shots = ".impeccable/review/eclipse";
await fs.mkdir(root, { recursive: true });
await fs.mkdir(shots, { recursive: true });
const state = {
  scenarios: [
    {
      id: "A",
      siteId: "apollo11",
      epoch: "2025-03-14T00:00:00.000Z",
      durationDays: 1,
      arrayMode: "tracking",
      arrayAzimuth: 0,
    },
  ],
  custom: [],
  mastM: 2,
  minAntennaEl: 5,
  time: Date.parse("2025-03-14T07:00:00.000Z"),
  selected: "apollo11",
  view: "globe",
  mode: "plain",
  activeScenarioId: "A",
};
const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  }),
  errors = [],
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    "http://127.0.0.1:5173/?session=" +
      encodeURIComponent(encodeSession(state)),
  );
  await page.getByRole("button", { name: "Skip introduction" }).click();
  await expect(page.locator(".eclipse-status")).toContainText("total", {
    timeout: 150000,
  });
  await expect(page.locator(".condition-readings")).toContainText(
    "Earth's shadow reduces direct sunlight.",
  );
  await expect(page.locator(".comparison-values").first()).not.toContainText(
    "Loading",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Close comparison" }).click();
  await expect(page.locator(".metrics-grid")).toBeVisible();
  const initialReadings = await page
    .locator(".condition-reading > strong")
    .allTextContents();
  await page.getByRole("button", { name: "Plain", exact: true }).click();
  await expect(page.locator(".engineering-readings")).toBeVisible();
  assert.deepEqual(
    await page.locator(".condition-reading > strong").allTextContents(),
    initialReadings,
  );
  await page.locator(".inspector").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: path.join(shots, "engineer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Engineer", exact: true }).click();
  await expect(page.locator(".engineering-readings")).toHaveCount(0);
  async function download(format, name) {
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export data as " + format.toUpperCase(),
        exact: true,
      })
      .click();
    const file = await waiting;
    await file.saveAs(path.join(root, name));
    return fs.readFile(path.join(root, name), "utf8");
  }
  const report = JSON.parse(await download("json", "eclipse.json")),
    csv = await download("csv", "eclipse.csv");
  await page.screenshot({
    path: path.join(shots, "exports.png"),
    fullPage: true,
  });
  assert.equal(report.current.epochUtc, "2025-03-14T07:00:00.000Z");
  assert.equal(report.mission.startUtc, state.scenarios[0].epoch);
  assert.equal(report.current.values.powerIndex, 0);
  assert.ok(report.mission.metrics.meanPowerIndex > 0);
  assert.ok(report.mission.metrics.eclipseHours > 1);
  assert.ok(
    report.sources.some(
      (s) => s.name === "NASA/JPL Horizons" && s.sha256.length === 64,
    ),
  );
  assert.ok(csv.includes('"current","power_index","0"'));
  assert.ok(csv.includes('"mission","array_mode","tracking"'));
  await page.locator(".inspector").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: path.join(shots, "desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Time", exact: true }).click();
  await page
    .getByLabel("Date and time · UTC", { exact: true })
    .fill("2025-03-14T12:00");
  await page.getByLabel("Date and time · UTC", { exact: true }).blur();
  await expect(page.locator(".eclipse-status")).toContainText("none");
  const later = JSON.parse(await download("json", "after-eclipse.json"));
  assert.equal(later.current.epochUtc, "2025-03-14T12:00:00.000Z");
  assert.equal(later.mission.startUtc, state.scenarios[0].epoch);
  assert.equal(
    later.mission.metrics.meanPowerIndex,
    report.mission.metrics.meanPowerIndex,
  );
  assert.ok(later.current.values.powerIndex > 0);
  async function globeLuminance() {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    return page.locator(".world canvas").evaluate((canvas) => {
      const gl = canvas.getContext("webgl2"),
        pixel = new Uint8Array(4);
      let value = 0;
      for (const x of [0.43, 0.47, 0.53, 0.57])
        for (const y of [0.4, 0.45, 0.55, 0.6]) {
          gl.readPixels(
            Math.floor(canvas.width * x),
            Math.floor(canvas.height * y),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          value += 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
        }
      return value / 16;
    });
  }
  const daylightLuminance = await globeLuminance();
  await page.locator(".inspector").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: path.join(shots, "daylight.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Date and time · UTC", { exact: true })
    .fill("2025-03-14T09:00");
  await page.getByLabel("Date and time · UTC", { exact: true }).blur();
  await expect(page.locator(".eclipse-status")).toContainText("partial");
  const partialLuminance = await globeLuminance();
  assert.ok(
    partialLuminance > 1 && partialLuminance < daylightLuminance,
    "Partial geometry must render intermediate illumination",
  );
  await page.screenshot({
    path: path.join(shots, "partial.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Date and time · UTC", { exact: true })
    .fill("2025-03-14T07:00");
  await page.getByLabel("Date and time · UTC", { exact: true }).blur();
  await expect(page.locator(".eclipse-status")).toContainText("total");
  const eclipseLuminance = await globeLuminance();
  assert.ok(daylightLuminance > 15, "Daylit globe must actually render");
  assert.ok(
    eclipseLuminance < daylightLuminance * 0.1,
    "Geometric totality must suppress the globe's direct illumination",
  );
  await page.getByRole("button", { name: "Sites", exact: true }).click();
  await page.locator(".inspector").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: path.join(shots, "desktop.png"),
    fullPage: true,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(
    "http://127.0.0.1:5173/?session=" +
      encodeURIComponent(encodeSession(state)),
  );
  await mobile.getByRole("button", { name: "Skip introduction" }).click();
  await expect(mobile.locator(".eclipse-status")).toContainText("total", {
    timeout: 150000,
  });
  await mobile.getByRole("button", { name: "Close comparison" }).click();
  if(await mobile.getByRole("button", { name: "Close tools" }).count()) await mobile.getByRole("button", { name: "Close tools" }).click();
  await mobile.locator(".eclipse-status").scrollIntoViewIfNeeded();
  await mobile.screenshot({
    path: path.join(shots, "mobile.png"),
    fullPage: true,
  });
  const overflow = await mobile.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(overflow.width, overflow.scrollWidth);
  assert.equal(errors.length, 0);
  await fs.writeFile(
    path.join(root, "checks.json"),
    JSON.stringify(
      {
        testedUtc: new Date().toISOString(),
        realApi: true,
        eclipseState: true,
        zeroDirectPowerInTotality: true,
        missionTimeBasisPreserved: true,
        csvAndJsonDownloaded: true,
        modesPreserveReadings: true,
        globeShadow: { daylightLuminance, partialLuminance, eclipseLuminance },
        overflow,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      eclipse: report.current.values.sun.eclipse,
      missionEclipseHours: report.mission.metrics.eclipseHours,
      modes: true,
      exports: true,
      errors,
      overflow,
    }),
  );
} finally {
  await browser.close();
}
