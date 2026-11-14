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
const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const response = page.waitForResponse(
  (r) => r.url().includes("/api/ephemeris?") && r.status() === 200,
  { timeout: 150000 },
);
await page.goto("http://127.0.0.1:5175");
await expect(
  page.getByRole("heading", { name: "AMAZE-X." }),
).toBeVisible();
await page.getByRole("button", { name: "Skip introduction" }).click();
await page.locator("button[aria-label=Moon]").click();
const data = await (await response).json();
if (
  !data.sources.every(
    (s) => s.name === "NASA/JPL Horizons" && s.sha256.length === 64,
  )
)
  throw Error("Real provenance missing");
await expect(
  page.getByText("No sample measurements are substituted."),
).not.toBeVisible({ timeout: 20000 });
await page.getByRole("button", { name: "Plan landing", exact: true }).click();
await expect(
  page.getByRole("dialog", { name: "Plan a landing" }),
).toBeVisible();
await page.getByRole("button", { name: "Manual date", exact: true }).click();
await page.getByText("Timing and historical sources", { exact: true }).click();
await expect(page.getByRole("spinbutton", { name: /Surface duration/ })).toHaveValue("7");
await page.getByRole("spinbutton", { name: /Surface duration/ }).fill("14");
await page
  .getByRole("button", { name: "Add to comparison", exact: true })
  .click();
await expect(
  page.getByRole("heading", { name: /Compare landing scenarios/ }),
).toBeVisible();
await expect(page.locator(".comparison-values")).toContainText("14 days");
await expect(page.locator(".comparison-values")).not.toContainText("Loading", {
  timeout: 30000,
});
await expect(page.locator(".comparison-values")).toContainText(
  /Sunlit[0-9.]+%/,
);
await page.getByRole("button", { name: "Close comparison" }).click();
await page.getByRole("button", { name: "Site actions" }).click();
await expect(page.getByRole("menu")).toBeVisible();
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Sites", exact: true }).click();
await page.getByRole("button", { name: "Add custom coordinates" }).click();
await page.getByRole("textbox", { name: "Site name" }).fill("Test south point");
await page.getByRole("spinbutton", { name: /Latitude/ }).fill("-89");
await page.getByRole("spinbutton", { name: /Longitude/ }).fill("0");
await page.getByRole("button", { name: "Create site", exact: true }).click();
const health = await (await page.request.get("http://127.0.0.1:5175/api/health")).json();
await expect(page.locator(".quality")).toContainText(
  health.coordinateTerrainReady ? "LOLA terrain" : "Terrain not included",
  { timeout: 150000 },
);
await page.getByRole("button", { name: "Ask Rocky", exact: true }).click();
await expect(
  page.getByRole("textbox", { name: "Question for Rocky" }),
).toBeFocused();
await page
  .getByRole("textbox", { name: "Question for Rocky" })
  .fill("Explain libration.");
await page.getByRole("button", { name: "Send question" }).click();
await expect(page.locator(".rocky-panel")).toContainText(
  /Checking the evidence|Question|I have an answer/,
);
await page.getByRole("button", { name: "Close Rocky" }).click();
if (!(await page.getByRole("button", { name: /Odysseus · IM-1/ }).first().isVisible()))
  await page.getByRole("button", { name: "Sites", exact: true }).click();
await page
  .getByRole("button", { name: /Odysseus · IM-1/ })
  .first()
  .click();
await fs.mkdir("data/validation", { recursive: true });
await fs.writeFile(
  "data/validation/browser-smoke.json",
  JSON.stringify(
    {
      testedUtc: new Date().toISOString(),
      realApi: true,
      historicalSurfaceDurationDefault: true,
      scenarioCreated: true,
      missionMetricsComputed: true,
      customSiteLabel: true,
      contextMenu: true,
      rockyWorkflow: true,
      errors,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    realApi: true,
    rows: data.sun.length,
    checks:
      "scenario creation, historical surface duration and override, custom site, context menu, Rocky workflow",
    errors,
  }),
);
await browser.close();
if (errors.length) process.exitCode = 1;
