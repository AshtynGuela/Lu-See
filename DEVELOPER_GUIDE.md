# Developer quick guide

## Run and verify

Requires Node 22+ and npm. Run commands from `lunar-scout`:

```sh
npm install
npm run dev
# Open http://127.0.0.1:5175
npm run build
npm run preview  # production build plus API; use instead of dev
npm test
```

The Node server binds to loopback and supplies both the browser app and same-origin APIs. Do not run dev and preview on the same port simultaneously. Backend changes require a server restart; production frontend changes require a build and browser refresh.

## Reading the inspector

All readings refer to the selected lunar location, observer height and UTC clock.

| Reading | Meaning |
|---|---|
| Sunlight now | Direct solar-disc fraction after terrain and geometric Earth-shadow screening. At least half the disc must be visible for the sunlight-available status. |
| Earth contact now | Whether Earth's centre clears the terrain/smooth horizon and the selected antenna limit. The message distinguishes a horizon blockage from a low antenna angle. Geometry only, not a radio link budget. |
| Height above level horizon | Centre elevation in degrees: positive above the local horizontal, negative below. It is not terrain clearance. |
| Compass bearing | Azimuth clockwise from north: N=0°, E=90°, S=180°, W=270°, with a compass abbreviation. |
| Over your whole mission | Integrated results for the selected scenario's pinned arrival (or hourly live epoch) and duration; distinct from conditions at the global clock. |
| Terrain horizon | Maximum terrain elevation angle along an azimuth, derived from numeric LOLA heights, observer mast and lunar curvature. |

### Calculated landing dates

`Plan landing` defaults to calculated dates. The IM-1 reference supplies the default flight and surface durations, with Apollo and Blue Ghost alternatives. `engine/mission-history.mjs` computes the median observed launch-to-touchdown time (nearest hour) and surface stay (nearest tenth of a day). The search begins at the first hourly arrival after the chosen earliest departure plus flight time. Each candidate's estimated departure is its arrival minus the flight time. Surface duration, earliest departure, arrival search span and manual arrival remain editable. Flight timing uses historical records. It does not solve launch geometry, vehicle performance or a trajectory. The surface screening still applies sunlight, darkness and Earth-contact limits.

`src/LandingPlanner.tsx` requests coverage for the entire search **plus** mission duration via `ensureData`. Its worker uses `engine/landing.mjs`: expensive horizon/disc calculations run once per ten-minute cell; prefix integrals and clipped dark runs evaluate hourly arrivals. Fractional final cells match the mission integrator. Consecutive passing hourly starts form candidate groups, retaining both the earliest passing row and the row that favours sunlight and contact with less darkness. Selecting a suggestion pins that date in the existing comparison/travel flow. Changed scientific inputs invalidate earlier results; failed API requests never receive simulated replacements.

**Find next window** uses `engine/landing-search.mjs` to scan up to 365 days in batches of 720 hourly arrivals. A continuation begins one hour beyond the previous empty result, avoiding duplicates or gaps. Every batch includes additional ephemeris coverage for the full manually chosen surface stay. The search stops on the first batch with matching arrivals, defaults to its earliest passing arrival, and offers a best-surface-conditions alternative. The checked range is displayed; a matching group may continue beyond that range. The 2040 boundary clips the arrival range so the entire mission still fits. Stop retains only completed batches, and a network retry repeats the current batch. Inputs invalidate in-progress jobs and terminate their workers. This optimizes the site-condition recommendation, not launch energy or transfer geometry.

The search includes terrain and geometric Earth-shadow screening at curated sites. Custom sites are explicitly smooth-horizon estimates with terrain-based viability unavailable. These are screening candidates, not certified safe landing dates or computed transfer opportunities. Hourly arrivals and ten-minute integration can miss narrower windows. Panel settings affect the eventual power index, not the sunlight/contact filter.

## Code map

| File / folder | Responsibility |
|---|---|
| `src/App.tsx` | App shell, inspector, UTC controls, scenarios, context menus, custom-coordinate dialog and map-picking flow. |
| `src/store.ts` | Zustand state, persistence, terrain/ephemeris loading and date-window packet selection. |
| `src/World.tsx` | Shared 3D canvas; Moon, Earth–Moon, polar and local views; picking coordinates and camera travel. |
| `src/SolarSystem.tsx` | Solar overview, planet/Moon rendering, focus, labels and display scales. |
| `src/SpaceBackdrop.tsx` | Camera-aligned space artwork selected by map view. |
| `src/Charts.tsx`, `metrics.worker.ts` | Sky plot, timelines, comparison and background mission calculations. Worker results belong to a specific input job; never show an earlier job as current. |
| `src/LandingPlanner.tsx`, `engine/landing.mjs` | Calculated candidate arrival dates, requirements and scenario handoff. |
| `src/DateSlip.tsx` | Exploratory date-slip sweep around an existing scenario. |
| `src/Rocky.tsx`, `src/RockyOverlay.tsx`, `src/rocky-voice.ts` | Chat and evidence, draggable rigged overlay, context menu, gradual reply reveal and Calm samples. |
| `engine/index.mjs` | Shared deterministic visibility, solar fraction, eclipses, events and mission metrics. Used by browser workers and server tools. |
| `engine/solar.mjs` | Solar body catalogue, vector interpolation and display-coordinate conversion. |
| `engine/report.mjs`, `src/share.mjs` | Traceable JSON/CSV reports and validated share sessions. |
| `server/index.mjs` | Express endpoints, request validation, local serving and assistant limits. |
| `server/horizons.mjs`, `server/solar.mjs` | Real JPL requests, shared request queue, parsing, source records and disk caches. |
| `server/assistant.mjs` | Model proxy, deterministic tools, evidence placeholders and proposed-action validation. |
| `scripts/` | NASA data/asset preparation and validation. |

## Data contracts

- Lunar observer rows: `[UTC milliseconds, azimuth degrees, elevation degrees, angular diameter arcseconds, distance km]`. Engine angular radius is diameter / 7200. Directions use normalized unit-vector interpolation between ten-minute JPL samples; no extrapolation.
- Lunar analysis: high-precision Horizons `MEAN_ME`, airless topocentric observer angles; east-positive longitude. LOLA terrain products use lunar Mean Earth / Polar Axis coordinates. Frame realization and coordinate precision remain limitations.
- Solar vectors: `[UTC milliseconds, x, y, z, vx, vy, vz]`, positions in AU and velocities in AU/day, Sun-centred ecliptic J2000. Six-hour samples use cubic Hermite interpolation. Outer giants use disclosed system barycentres; the Moon uses target 301.
- Readable Solar spacing, body radii and Moon separation are exaggerated for navigation. Physical mode uses linear AU spacing and nominal physical radii. Numerical distances always use unscaled vectors. Mesh attitude and lighting are visual context.
- Curated sites use prepared real LOLA horizons. Custom points sample the local numeric grids with the same pipeline. Map picking fills coordinates into editable fields. A missing grid uses the labelled smooth horizon.
- `packetFor` selects coverage for the requested site, mast, epoch and duration. Current sky time and pinned mission time are distinct: exports must retain both and their correct source packets.

## API and storage

Primary routes: `GET /api/health`, `/api/sites`, `/api/terrain/:id`, `/api/terrain?lat=…&lon=…`, `/api/ephemeris`, `/api/solar/:id`, `/api/provenance/:hash`; `POST /api/assistant`. See route schemas in `server/index.mjs` for parameters and validation.

- `data/sites.json`: curated coordinates and citations.
- `public/data/`, `public/layers/`: derived terrain, masks and visual/statistical products loaded by the browser.
- `public/assets/`: optimized supplied models and visual textures, with provenance records.
- `scripts/remote_dem.py`: exact NASA byte-range reads, multipart validation and a bounded SQLite block cache.
- `data/terrain-regional.json`: checksum and extent of the optional 5 m NASA regional source.
- `data/raw/`: optional offline originals, excluded from Git and Docker.
- `.cache/terrain-results/`: coordinate results with source/code versioning. The API returns 202 while a custom horizon is being calculated.
- `.cache/horizons/`: cached API responses, parsed tables and provenance. Keep hashes, exact request URLs and returned frame/model metadata.
- `data/validation/`: test reports. Fixtures belong in tests, never in scientific fallback paths.

## Rocky and limitations

The overlay loads `/assets/rocky-original-rigged.glb`, a byte-identical copy of `Rocky/Rocky-Rigged.glb`, preserving the original mesh's eighteen 2048-pixel textures and material assignments. Asset preparation copies Rocky directly and only optimizes the planet model. At render time, transmission textures are checked at every red-channel pixel: a wholly black map has zero effective transmission, so its runtime material clone avoids redundant glass passes. Nonzero transmission remains enabled on the right arm. Source files and embedded textures are never changed. The full model uses more transfer size and graphics memory than the earlier reduced asset.

Animation clips loop continuously while the page is visible unless the user explicitly pauses them. Random selection continues during chat and menus; reduced-motion preference suppresses roaming rather than freezing the character. The introduction waits for model loading. The default position leaves room for the inspector and clock; Reset position restores it and Move to corner still reaches the screen edge. `test:rocky-motion-browser` checks actual full-model pixel changes, then suspends the test WebGL context to check controls separately from software-renderer cost. It is not a performance benchmark for the user's RTX 4050. `test:next-window-browser` exercises real NASA/JPL data and terrain while excluding mascot rendering.

Keys belong only in the ignored `.env`: `OPENROUTER_API_KEY` and `GROQ_API_KEY`. Primary is OpenRouter Nemotron; fallback is Groq GPT-OSS-20B for text-only requests. Image-dependent failures remain pending for Retry. Never expose keys in client code, chat, exports or logs. Models explain tool results; they do not supply scientific calculations.

Mission integration is ten-minute resolution. Terrain sampling is finite; local obstacles can be missed. Eclipse screening assumes opaque circular Earth/Sun discs and excludes atmosphere and refracted/scattered light. Sunrise/set events are terrain-centre crossings, not eclipse contacts. Relative power is not an energy/storage/thermal simulation. This is an early-screening prototype, not flight-certified planning.

Useful checks: `npm run test:landing-browser` (real API, candidate selection, empty state, stale results and desktop/mobile), `npm run test:browser`, `npm run test:eclipse`, `npm run test:eclipse-browser`, `npm run test:solar`, `npm run test:solar-browser`, `npm run test:terrain`. Live checks require upstream data or existing real-data caches. Existing reports describe their actual scope; interpolation checks are not independent ephemeris certification.

See `BUILD_STATUS.md` for delivery status, `PROJECT_BRIEF.md` for decisions, `DESIGN.md` for visual conventions, and `TODO.md` for pending copy cleanup and live Rocky provider testing.
