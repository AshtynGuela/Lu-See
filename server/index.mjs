import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ephemeris } from "./horizons.mjs";
import { answerQuestion } from "./assistant.mjs";
import { solarPacket } from "./solar.mjs";
import { coordinateTerrainReady, terrainAt } from "./terrain.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const app = express(),
  sites = JSON.parse(
    await fs.readFile(path.join(root, "data/sites.json"), "utf8"),
  );
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && new URL(origin).host !== req.get("host"))
    return res
      .status(403)
      .json({ error: "Cross-origin API requests are not allowed" });
  res.set("Cache-Control", "no-store");
  next();
});
const coords = z.object({
  lat: z.string().trim().min(1).pipe(z.coerce.number().min(-90).max(90)),
  lon: z.string().trim().min(1).pipe(z.coerce.number().min(-180).max(180)),
});
const date = z
  .string()
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s)) &&
      Date.parse(s) >= Date.parse("1969-01-01") &&
      Date.parse(s) < Date.parse("2041-01-01"),
    "Choose a date from 1969 through 2040",
  );
async function loadTerrain(id) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(root, "public/data", id + ".json"), "utf8"),
    );
  } catch {
    return null;
  }
}
async function loadData({ site, iso, days, mast, terrain }) {
  return ephemeris({
    lat: site.lat,
    lon: site.lon,
    elevationM: (terrain?.elevationM || 0) + mast,
    start: iso,
    days,
  });
}
async function loadSiteTerrain(site) {
  if (site.family === "custom") return terrainAt(site.lat, site.lon).catch(() => null);
  return loadTerrain(site.id);
}
app.get("/api/health", async (req, res) => {
  let heightReady = false;
  try {
    await fs.access(path.join(root, "public/data/moon-height.png"));
    heightReady = true;
  } catch {}
  res.json({
    ready: true,
    primaryConfigured: !!process.env.OPENROUTER_API_KEY,
    fallbackConfigured: !!process.env.GROQ_API_KEY,
    terrainReady: !!(await loadTerrain("im1")),
    coordinateTerrainReady: await coordinateTerrainReady(),
    terrainAccess: process.env.LUNAR_TERRAIN_MODE === 'local' ? 'local' : 'NASA byte-range reads with cached results',
    heightReady,
    challenge:
      "https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/",
  });
});
app.get("/api/sites", async (req, res) =>
  res.json(
    await Promise.all(
      sites.map(async (s) => {
        const terrain = await loadTerrain(s.id);
        return {
          ...s,
          terrainReady: !!terrain,
          resolutionM: terrain?.resolutionM,
          elevationM: terrain?.elevationM,
        };
      }),
    ),
  ),
);
app.get("/api/solar/:id", async (req, res, next) => {
  try {
    const iso = date.parse(req.query.time);
    res.json(await solarPacket(req.params.id, Date.parse(iso)));
  } catch (e) {
    next(e);
  }
});
app.get("/api/terrain", async (req, res, next) => {
  try {
    const { lat, lon } = coords.parse(req.query);
    const pending = Symbol('pending');
    let timer;
    const terrain = await Promise.race([terrainAt(lat, lon, req.query.retry === '1'),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(pending),250);})]).finally(()=>clearTimeout(timer));
    if (terrain === pending) return res.status(202).json({pending:true,message:'Reading NASA elevation sections and calculating the horizon.'});
    if (!terrain) return res.status(503).json({ error: "LOLA elevation data is unavailable." });
    res.json({ ...terrain, lat, lon });
  } catch (e) {
    next(e);
  }
});
app.get("/api/terrain/:id", async (req, res) => {
  if (!sites.some((s) => s.id === req.params.id))
    return res.status(404).json({ error: "Unknown site" });
  const terrain = await loadTerrain(req.params.id);
  if (!terrain)
    return res.status(503).json({
      error:
        "Official LOLA terrain is still being prepared. Terrain analysis is not available yet.",
    });
  res.json(terrain);
});
app.get("/api/ephemeris", async (req, res, next) => {
  try {
    const { lat, lon } = coords.parse(req.query),
      iso = date.parse(req.query.start),
      days = z.coerce
        .number()
        .min(1)
        .max(367)
        .parse(req.query.days ?? 33),
      mast = z.coerce
        .number()
        .refine((v) => [0, 2, 5, 10].includes(v))
        .parse(req.query.mast ?? 2);
    const site = sites.find((s) => s.id === req.query.siteId),
      curated =
        site &&
        Math.abs(site.lat - lat) < 1e-7 &&
        Math.abs(site.lon - lon) < 1e-7
          ? await loadTerrain(site.id)
          : null,
      custom = typeof req.query.siteId === "string" && /^custom-[a-f0-9-]{1,73}$/.test(req.query.siteId),
      terrain = custom ? await terrainAt(lat, lon).catch(() => null) : curated;
    const result = await ephemeris({
      lat,
      lon,
      elevationM: (terrain?.elevationM || 0) + mast,
      start: iso,
      days,
    });
    res.json({
      ...result,
      observer: {
        lat,
        lon,
        elevationM: terrain?.elevationM ?? 0,
        mastM: mast,
        terrainApplied: !!terrain,
      },
      terrainPending: (!!site || custom) && !terrain,
      ...(req.query.includeTerrain === "1" && terrain ? { terrain } : {}),
    });
  } catch (e) {
    next(e);
  }
});
const rate = new Map();
app.post("/api/assistant", async (req, res, next) => {
  try {
    const key = req.ip,
      now = Date.now(),
      recent = (rate.get(key) || []).filter((t) => now - t < 60000);
    if (recent.length >= 20)
      return res
        .status(429)
        .json({ error: "Rocky needs a short rest. Try again in a minute." });
    rate.set(key, [...recent, now]);
    const input = z
      .object({
        question: z.string().trim().min(1).max(500),
        mode: z.enum(["plain", "engineer"]).default("plain"),
        image: z
          .string()
          .max(2200000)
          .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
          .optional(),
        context: z.record(z.string(), z.unknown()).optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(9000),
            }),
          )
          .max(12)
          .optional(),
      })
      .parse(req.body);
    const customSites = z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^custom-[a-f0-9-]+$/)
            .max(80),
          name: z.string().trim().min(1).max(64),
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
        }),
      )
      .max(40)
      .parse(input.context?.customSites || []);
    const assistantSites = [
      ...sites,
      ...customSites.map((s) => ({
        ...s,
        family: "custom",
        region: "User coordinates",
        source: "User-supplied lunar coordinates",
      })),
    ];
    const signal = AbortSignal.timeout(45000);
    const deadline = new Promise((_, reject) =>
      signal.addEventListener(
        "abort",
        () =>
          reject(
            new Error(
              "Rocky timed out after 45 seconds. Your question is kept for Retry.",
            ),
          ),
        { once: true },
      ),
    );
    const result = await Promise.race([
      answerQuestion(input, {
        sites: assistantSites,
        loadData,
        loadTerrain: loadSiteTerrain,
        signal,
      }),
      deadline,
    ]);
    res.json(result);
  } catch (e) {
    next(e);
  }
});
app.get("/api/provenance/:hash", async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.hash)) return res.sendStatus(404);
  try {
    res
      .type("text/plain")
      .send(
        await fs.readFile(
          path.join(root, ".cache/horizons", req.params.hash + ".txt"),
          "utf8",
        ),
      );
  } catch {
    res.sendStatus(404);
  }
});
app.use((err, req, res, next) => {
  console.error("[API]", err.message);
  res.status(err instanceof z.ZodError ? 400 : 502).json({
    error:
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join("; ")
        : err.message,
  });
});
const production = process.argv.includes("--production");
if (production) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(Number(process.env.PORT) || 5173, process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1"), () =>
  console.log(
    "Lu-See http://127.0.0.1:" + server.address().port,
  ),
);
