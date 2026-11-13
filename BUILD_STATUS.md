# First working build

Prepared 13 November 2026, local time. The governing challenge remains [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

## Available now

- Separate browser app, cinematic welcome, Sun-centred Solar System opening with all eight supplied NASA planet models, selectable planet focus, sampled JPL orbit paths, whole/inner-system views, orbit and label controls, and readable/physical scales. Detailed analysis remains Moon-only, reached through the Earth–Moon overview, globe, both polar views and local terrain.
- Fourteen cited curated sites with prepared numeric LOLA terrain horizons. Apollo-era dates through 2040 use actual JPL Horizons observer requests. Custom coordinates sample numeric LOLA elevation and horizons on demand and use the site elevation for JPL observer requests.
- UTC editing and transport, sky strip, event countdowns, observer mast and antenna limits, required mission duration, pinned/live scenarios, up to four comparisons, mission-average solar incidence, optional user thresholds, timelines and landing-date sweeps.
- NASA long-term sunlight/Earth visibility rasters, separately labelled from the selected clock. Local terrain and horizon views use real elevations and prepared horizon masks.
- Placeholder shuttle approach and arrival choice. Travel advances to the chosen arrival date; it is not a physical trajectory solution.
- Supplied rigged Rocky model, question/error/cancel/retry/history flow, server-side tool results and numerical evidence checks, text fallback, and image-dependent retry without text-only fallback. Authenticated responses remain untested until keys are configured.
- Share links with scientific settings and custom coordinates, JSON/CSV exports with separate current and mission epochs, source links and raw-response provenance. Export rejects incomplete or stale mission results.
- Geometric Earth-shadow screening from real JPL positions and apparent sizes, included in direct sunlight, power, mission summaries and date sweeps. Corresponding globe shading and local direct-light attenuation are implemented; atmosphere and refracted light are excluded.
- Plain explanations and an Engineer inspector with horizon angles, apparent radii, direct solar-disc fraction, range and observer settings.

## Checks completed

- Production build and 27 automated engine/schema/provider-policy/export/vector tests pass.
- Browser smoke checks use real API data and assert completed mission metrics. Desktop/mobile captures report no page errors and no horizontal mobile overflow.
- Comparison across non-overlapping observation windows passes; the inspector and comparison mission-power values agree.
- 824 off-grid directions at historical Apollo 11 and modern IM-1 epochs agree with direct JPL queries to better than 0.005 degrees. An additional seeded 400-direction check spans ten sites and 1969–2040; its largest direction discrepancy is approximately 0.00000356 degrees. These are interpolation checks against Horizons, not independent SPICE validation.
- All fourteen terrain masks pass finite-value, mast-monotonicity and tile checks. Published landing-height comparisons are sanity checks, not full horizon validation.
- JPL geometry at Apollo 11 correctly gives clear / total / clear states before, during and after NASA's documented March 2025 eclipse. This checks broad states, not contact-time precision. Browser checks download actual JSON/CSV, preserve pinned mission epochs while changing the sky clock, and verify none/partial/total globe rendering, both detail modes and mobile overflow.
- Visual review scored its five listed corrections resolved: mission time basis, raster depth, horizon obstruction, annotations, and Rocky/comparison overlap. That verdict is limited to those corrections.

Reports are under `data/validation/` and `.impeccable/review/`.

The Solar System update checks one off-grid position per planet against direct JPL vector queries (largest checked interpolation error approximately 74 m), all eight models/data packets, planet focus, unchanged numerical distance across scale modes, mobile overflow, and the transition into and back from lunar analysis. Solar rendering and lunar rendering share one graphics surface. Readable radial compression and outer-planet system barycentres are explicitly disclosed. This is a limited overview validation, not a mission trajectory certification.

## Still required or deferred

Configure `OPENROUTER_API_KEY` and `GROQ_API_KEY` in the ignored `.env` file and restart the local server to test actual Rocky responses. Never put keys in browser code or chat.

Rocky roams as a transparent overlay. Right-click or long-press to choose animations, toggle reply text reveal and Calm dialogue blips, or move him to the corner. Chat uses the supplied pixel bubble art and keeps map attachments, history, cancellation, and retry. The Solar System, Earth–Moon and Moon use supplied space artwork. D-DIN is the app font.

This is an early-screening prototype, not a completed mission-tool acceptance programme. Independent SPICE/mission-report/Quickmap checks, complete assistant evaluations, broader browser/performance testing and long-term operational validation remain. New, uncached NASA queries can take time or fail; the app shows errors instead of substituting values.

Terrain resolution, finite ray spacing and a 150 km horizon radius limit obstruction estimates. Events use centre crossings and ten-minute source/integration sampling; refined times do not establish one-second physical accuracy. DTE is Earth-centre geometry, not a station-specific link budget. Power is relative incidence, not energy production. Eclipse screening excludes atmospheric enlargement, refracted/scattered light, limb darkening and Earth's ellipsoidal limb; apparent circular-disc and globe-reconstruction approximations remain. Dynamic terrain shadows, broader regional DEM coverage, nearby-alternative ranking, offline PWA, PDF exports, guided lessons and audio remain future work. See README.md for detailed numerical limits and provenance.

## Calculated landing-date planning

The lunar inspector distinguishes sunlight now from Earth contact now, explains centre height and compass bearing, and separates these from whole-mission totals. Plan landing defaults to calculating hourly candidate arrivals over 30/60/90 days from real JPL positions and LOLA terrain, filtered by editable sunlight, darkness and contact limits. Users select a candidate to compare or land; manual entry remains available. No matching dates is an explicit result. Custom sites use the same terrain screening when the local grids are available.
