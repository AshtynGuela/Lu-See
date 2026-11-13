import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
await fs.mkdir(".impeccable/review", { recursive: true });
const errors = [];
const desktop = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
desktop.on("pageerror", (e) => errors.push(e.message));
await desktop.goto("http://127.0.0.1:5175");
await expect(desktop.locator(".welcome")).toBeVisible();
await expect(desktop.locator(".solar-info")).toBeVisible({
  timeout: 150000,
});
await desktop.waitForTimeout(1000);
await desktop.screenshot({
  path: ".impeccable/review/welcome.png",
  fullPage: true,
});
await desktop.getByRole("button", { name: "Skip introduction" }).click();
await desktop.getByRole("button", { name: "Moon", exact: true }).click();
await expect(desktop.locator(".body-readings")).toBeVisible({
  timeout: 150000,
});
await desktop.getByRole("button", { name: "Moon", exact: true }).click();
await desktop.waitForTimeout(1000);
await desktop.screenshot({
  path: ".impeccable/review/desktop.png",
  fullPage: true,
});
await desktop.getByRole("button", { name: "South pole", exact: true }).click();
await desktop.waitForTimeout(500);
await desktop.screenshot({
  path: ".impeccable/review/polar.png",
  fullPage: true,
});
await desktop.getByRole("button", { name: "Layers", exact: true }).click();
await desktop
  .getByRole("combobox", { name: "Precomputed map overlay" })
  .selectOption("illumination");
await desktop.waitForTimeout(500);
await desktop.screenshot({
  path: ".impeccable/review/illumination.png",
  fullPage: true,
});
await desktop.getByRole("button", { name: "Moon", exact: true }).click();
await desktop
  .getByRole("button", { name: "Plan landing", exact: true })
  .click();
await desktop.getByRole("spinbutton", { name: /Mission duration/ }).fill("14");
await desktop
  .getByRole("button", { name: "Add to comparison", exact: true })
  .click();
await expect(desktop.locator(".comparison-values")).not.toContainText(
  "Loading",
  { timeout: 20000 },
);
await desktop
  .getByRole("button", { name: "Add scenario", exact: true })
  .click();
await desktop.getByRole("spinbutton", { name: /Mission duration/ }).fill("14");
const arrival = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 16);
await desktop.getByLabel(/Arrival date and time/).fill(arrival);
await desktop
  .getByRole("button", { name: "Add to comparison", exact: true })
  .click();
await expect(desktop.locator(".compare-column")).toHaveCount(2);
await expect(desktop.locator(".comparison-values").nth(1)).not.toContainText(
  "Loading",
  { timeout: 150000 },
);
await expect(desktop.locator(".comparison-values").nth(0)).toContainText(
  /Sunlit[0-9.]+%/,
);
await expect(desktop.locator(".comparison-values").nth(1)).toContainText(
  /Sunlit[0-9.]+%/,
);
await desktop.screenshot({
  path: ".impeccable/review/compare.png",
  fullPage: true,
});
const comparedPower = await desktop
  .locator(".compare-column")
  .nth(1)
  .locator("dd")
  .last()
  .textContent();
await desktop.getByRole("button", { name: "Close comparison" }).click();
await expect(
  desktop.locator(".metrics-grid > div").nth(3).locator("strong"),
).toHaveText(comparedPower, { timeout: 20000 });
await desktop.getByRole("button", { name: "Open horizon view" }).click();
await desktop.waitForTimeout(500);
await desktop.screenshot({
  path: ".impeccable/review/horizon.png",
  fullPage: true,
});
await desktop.getByRole("button", { name: "Moon", exact: true }).click();
await desktop.emulateMedia({ reducedMotion: "no-preference" });
await desktop
  .getByRole("button", { name: "Plan landing", exact: true })
  .click();
await desktop.getByRole("spinbutton", { name: /Mission duration/ }).fill("1");
await desktop.evaluate(() => {
  const original = performance.now.bind(performance),
    base = original();
  window.__captureOffset = 0;
  performance.now = () =>
    base + window.__captureOffset + (original() - base) * 0.1;
});
await desktop
  .getByRole("button", { name: "Travel & land", exact: true })
  .click();
await desktop.evaluate(() => {
  window.__captureOffset = 1800;
});
await expect(desktop.locator(".travel-banner")).toBeVisible();
await desktop.waitForTimeout(300);
await desktop.screenshot({
  path: ".impeccable/review/travel.png",
  fullPage: true,
});
// Reload restores the real performance clock before the settled surface check.
await desktop.reload();
await desktop.emulateMedia({ reducedMotion: "reduce" });
await desktop.getByRole("button", { name: "Skip introduction" }).click();
await desktop.locator(".body-readings").waitFor({ timeout: 150000 });
await desktop
  .getByRole("button", { name: "Plan landing", exact: true })
  .click();
await desktop.getByRole("spinbutton", { name: /Mission duration/ }).fill("1");
await desktop
  .getByRole("button", { name: "Travel & land", exact: true })
  .click();
await expect(desktop.locator(".landing-choice")).toBeVisible({
  timeout: 20000,
});
await desktop
  .getByRole("button", { name: "Overhead analysis", exact: true })
  .click();
await expect(desktop.locator(".metrics-grid")).toBeVisible({ timeout: 30000 });
await desktop.screenshot({
  path: ".impeccable/review/surface.png",
  fullPage: true,
});
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
mobile.on("pageerror", (e) => errors.push(e.message));
await mobile.goto("http://127.0.0.1:5175");
await mobile.getByRole("button", { name: "Skip introduction" }).click();
await mobile.getByRole("button", { name: "Moon", exact: true }).click();
await expect(mobile.locator(".body-readings")).toBeVisible({ timeout: 150000 });
await mobile.getByRole("button", { name: "Close tools" }).click();
await mobile.waitForTimeout(500);
await mobile.screenshot({
  path: ".impeccable/review/mobile.png",
  fullPage: true,
});
const overflow = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  width: innerWidth,
}));
await fs.writeFile(
  ".impeccable/review/capture-report.json",
  JSON.stringify(
    {
      testedUtc: new Date().toISOString(),
      errors,
      overflow,
      distinctDateWindows: true,
      missionPowerConsistent: true,
      travelFrame:
        "Performance clock slowed to capture midflight; surface tested with real clock after reload.",
      viewports: ["1440x1000", "390x844"],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ errors, overflow }));
await browser.close();
if (errors.length || overflow.scrollWidth > overflow.width)
  process.exitCode = 1;
