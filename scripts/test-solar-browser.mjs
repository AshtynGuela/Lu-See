import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const dir = ".impeccable/review/solar";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  }),
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5175/");
  await expect(page.locator(".solar-info summary")).toContainText(
    "8/8 loaded",
    { timeout: 180000 },
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: dir + "/welcome.png", fullPage: true });
  await page
    .getByRole("button", { name: "Enter the Solar System", exact: true })
    .click();
  await expect(page.locator(".solar-world")).toBeVisible();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await expect(page.locator(".sun-label")).toBeVisible();
  await page.screenshot({ path: dir + "/desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "Inner planets", exact: true })
    .click();
  await page.screenshot({ path: dir + "/inner.png", fullPage: true });
  await page
    .locator(".solar-catalog")
    .getByRole("button", { name: "Saturn", exact: true })
    .click();
  await expect(page.locator(".solar-info h1")).toHaveText("Saturn");
  const distance = await page.locator(".solar-distance").textContent();
  await page.screenshot({ path: dir + "/saturn.png", fullPage: true });
  await page
    .getByRole("button", { name: "Physical scale", exact: true })
    .click();
  await expect(page.locator(".solar-distance")).toHaveText(distance);
  await page.screenshot({ path: dir + "/physical.png", fullPage: true });
  await page.getByRole("button", { name: "Readable", exact: true }).click();
  await page.getByRole("button", { name: "Whole system", exact: true }).click();
  await page.getByRole("checkbox", { name: "Orbits", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Orbits", exact: true }).check();
  await page
    .getByRole("button", { name: "Explore Earth–Moon", exact: true })
    .click();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.locator(".body-readings")).toBeVisible({ timeout: 150000 });
  await page.getByRole("button", { name: "Moon", exact: true }).click();
  await expect(page.locator(".quality")).toContainText("LOLA terrain");
  await page.getByRole("button", { name: "Solar System", exact: true }).click();
  await expect(page.locator(".solar-info summary")).toContainText("8/8 loaded");
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://127.0.0.1:5175/");
  await mobile.getByRole("button", { name: "Skip introduction" }).click();
  await expect(mobile.locator(".solar-info summary")).toContainText(
    "8/8 loaded",
    { timeout: 180000 },
  );
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: dir + "/mobile.png", fullPage: true });
  const overflow = await mobile.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(overflow.width, overflow.scrollWidth);
  assert.equal(errors.length, 0);
  await fs.writeFile(
    "data/validation/solar-browser.json",
    JSON.stringify(
      {
        testedUtc: new Date().toISOString(),
        sunVisible: true,
        planetsLoaded: 8,
        focusedSaturn: true,
        physicalScalePreservesDistance: true,
        lunarHandoff: true,
        overflow,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ errors, overflow, planetsLoaded: 8, lunarHandoff: true }),
  );
} finally {
  await browser.close();
}
