# Lu-See

A separate browser app for the [NASA Space Apps Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/). The core workflow is site + landing date + mission duration → Sun/Earth state, terrain obstruction, events and comparison. The existing Rocky Electron overlay is separate.

See [BUILD_STATUS.md](BUILD_STATUS.md) for this build's delivered features, completed checks and remaining work.

## Run locally

On Windows, double-click **Launch Lu-See.cmd**. It opens Lu-See in your browser, normally on port 5175, and prints the URL if it uses a different port. Keep the launcher window open while using the app.

Requires Node 22+, npm and Python 3.11+ with `pip install -r requirements.txt` for custom terrain. Create `.env` from `.env.example` if you want to configure Rocky or override the port. To start from a terminal in this directory:

```text
npm install
npm run dev
```

Open http://127.0.0.1:5175. The development server binds to loopback; production binds to Render's assigned port on `0.0.0.0`. `npm run build` checks TypeScript and creates a production build; `npm run preview` serves that build with the API backend.

The welcome screen now opens a Sun-centred Solar System map, following the user's JPL Orbit Viewer reference. Select any of the eight planets to focus, drag to orbit, wheel/pinch to zoom, or use WASD/QE to fly. Whole-system and inner-planet views, orbit/label toggles, readable spacing and physical scale are available. The supplied NASA planet models are optimized copies. The Sun uses the supplied `Rocky/Sun_1_1391000.glb` mesh and its emissive texture atlas, with the embedded image compressed for the web. Readable mode compresses radial spacing and enlarges bodies; physical mode uses linear AU spacing and physical radii. Numerical distances always use the unscaled JPL vectors. Model attitude and rendering brightness are visual context, not an attitude or radiometric solution.

Solar positions use actual Sun-centred ecliptic J2000 Horizons vectors and velocities, with six-hour cubic Hermite interpolation and a cached monthly window. Orbit lines sample roughly one sidereal revolution of actual trajectories. Jupiter through Neptune use their planetary-system barycentres, explicitly labelled. Orbital periods and mean radii are cited to JPL's physical-parameters table. Only the Moon has landing-site analysis; use **Explore Earth–Moon** or **Moon** to enter it. New, uncached months require additional NASA requests; failures remain visible and can be retried.

In lunar views, choose a site and use **Plan landing**. Choose a historical mission reference or keep the IM-1 default. The planner fills the directly editable surface duration, uses the map clock as earliest departure, and searches the next 30 days of arrivals after the estimated flight. Timing and historical sources contains the other timing overrides. Each candidate lists a departure estimate calculated by subtracting the reference launch-to-touchdown duration. **Find possible landing dates** screens hourly arrivals using real JPL positions and the site's LOLA horizon, including geometric Earth-shadow screening. **Find next window** continues beyond an empty result, checking up to another year in chronological batches until a match is found. You can stop the search and continue from completed batches. Choose the earliest compatible arrival or the best surface conditions within each checked window; your mission limits remain unchanged. Choose a suggested date to compare or travel. Manual arrival entry and live-clock scenarios remain available. Up to four scenarios can be compared; the date-slip view explores nearby dates. Custom coordinates use the same terrain and JPL calculations as curated sites using NASA-hosted numerical elevation sections. Suggestions are screening candidates, not certified landing dates or calculated transfer trajectories.

The inspector separates **Sunlight now**, **Earth contact now** and **Over your whole mission**. Status and blockage reasons come first; expand Position in the sky for centre elevation and compass bearing. Engineer mode exposes the detailed measurements. The inspector's JSON and CSV buttons export the current reading and selected mission, with separate UTC epochs, array settings, observer definitions, sources and assumptions. Exports wait for the selected mission calculation; an earlier result is never substituted. CSV preserves numerical precision and treats user site names as text.

Click Rocky’s floating button to chat. The animated model starts near the map’s bottom-right and loops random animations even while chat or the context menu is open. Drag the button or pinch to resize it. Right-click or long-press for animations, corner docking, position reset, idle bubbles, gradual reply text and Calm dialogue blips. Rocky can explain Lu-See controls, discuss space science and handle general questions. Site measurements use verified data. Keyboard shortcuts are in the Controls dialog.

The supplied D-DIN font and bubble artwork are used across the interface and Rocky chat respectively. The three map views use artwork from the supplied space pack. Calm audio is from [Dialogue Blips Free by heyheythere](https://heyheythere.itch.io/dialogue-blips-free), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).


Earth-shadow screening uses the real JPL Sun/Earth apparent positions and angular sizes. It tests an opaque circular Earth disc against the solar disc, combines that with the terrain horizon, and feeds the resulting direct-light fraction into mission summaries, timelines, date sweeps and Rocky's numerical tools. The globe applies the corresponding approximate geometry across its surface. Atmospheric red/refracted light is deliberately excluded, so geometric totality renders black. Polar hillshade and statistical rasters remain cartographic/precomputed layers, not eclipse images.

## Scientific data

- **Sun and Earth:** real [NASA/JPL Horizons observer API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) responses, requested for the selected lunar coordinates and observer altitude. High-precision MEAN_ME frame, east-positive longitude, airless apparent angles, angular diameters and topocentric ranges. Horizons currently reports DE441 in the checked responses. Ten-minute directions are interpolated as normalized unit vectors to handle north-wrap and zenith passages; angular sizes and ranges are interpolated linearly, without extrapolation.
- **Source records:** responses are stored unchanged under `.cache/horizons/`, along with SHA-256 digests, exact request URLs, retrieval times and returned model/frame metadata. The inspector's Data & methodology dialog links to raw responses. A source failure produces an error and Retry, never invented readings.
- **Curated coordinates:** NASA NSSDCA/LRO landing-site tables and NASA mission releases; Shackleton is a USGS/IAU named-feature centre, explicitly not a recommended landing point. Each record links to its source. Published coordinate precision and frame-realisation differences remain limitations.
- **Terrain:** official PDS LOLA `LDEM_128` (global, approximately 237 m/pixel at the equator) and `LDEM_80S_20M` (20 m/pixel at the south pole). Scientific masks use the original numeric heights, spherical curvature, mast height, 720 azimuth rays and a 150 km search radius. Pixel resolution does not imply equivalent horizontal or vertical accuracy. Outside the south-polar product, the global product is used.
- **Custom points:** enter lunar latitude and east-positive longitude or click the globe. The server reads selected byte sections of the NASA-hosted PDS LOLA grids, uses the resulting elevation for JPL Horizons, and builds the terrain tile and 360° skyline. If the remote source is unavailable, the app labels the smooth-horizon fallback.
- **Precomputed layers:** NASA long-term visibility products and/or Moon Trek API rasters, with separate metadata. They describe their source period and visibility definition; they do not change to match the current clock or supply numerical mission metrics from image colours.
- **Visual assets:** the LROC WAC global mosaic from [NASA Moon Trek](https://trek.nasa.gov/moon/), the owner-supplied Earth model, and a compressed export of the original Rocky rig. Horizon and surface views stream cached 768-pixel image patches over the LOLA mesh. Horizon View adds a separate close-range patch. The Moon Trek layers include an IM-1 NAC orthomosaic, a south-pole shadow mosaic and LOLA/Kaguya relief at lower latitudes. The default lighting brings out the recorded detail. **Use mission lighting** switches to the selected time’s direct-light estimate. Terrain masks and numerical lighting still use LOLA and JPL data.

No orbital periods, made-up orbit animations or placeholder Sun/Earth values drive scientific results. The shuttle is explicitly a cinematic guide: travel advances to the selected arrival epoch, not a calculated transfer duration.

## Optional offline dataset preparation

Normal Lu-See operation reads numeric elevation sections directly from NASA and caches them; deployment does not include the 4 GB source rasters. See [DEPLOYMENT.md](DEPLOYMENT.md). The commands below are only for rebuilding prepared products offline. Full downloads use resumable range requests and memory-mapped processing, with source labels and hashes retained.

```text
python -m pip install -r requirements.txt
python scripts/prepare_data.py
python scripts/prepare_polar.py
python scripts/prepare_statistics.py
```

`prepare_data.py` generates curated terrain records with the same sampler used for custom coordinates. Horizon View reports compass bearing, skyline angle, distance to the terrain that sets the skyline, and Sun/Earth centre clearance. The global 237 m grid and 20 m south-polar grid cover the surroundings. Shackleton rim detail is fetched automatically from the checksum-verified [NASA Site04 elevation GeoTIFF](https://pgda.gsfc.nasa.gov/products/78) when required. The optional offline preparation tool uses `rasterio` and `python scripts/prepare_regional_terrain.py PATH_TO_TIF`. The 5 m grid is used inside its footprint with a 200 m blend at the edges. The browser checks for newly prepared terrain periodically. `prepare_polar.py` generates display-only polar relief and globe displacement. `prepare_statistics.py` reads the numeric precomputed visibility products linked by NASA PGDA. `prepare_layers.py` is an alternative Moon Trek WMTS acquisition path. If a source is unavailable, its layer remains unavailable rather than being fabricated.

Rocky uses `public/assets/rocky-web.glb`, a 21.8 MB Meshopt export of the original rig. It retains 866,045 vertices, all eighteen original texture payloads and eight animations. The export quantizes mesh attributes and preserves the original source file. Rebuild it with `node scripts/prepare_assets.mjs`.

## Rocky keys

Primary: `nvidia/nemotron-3.5-super-vl:free` through OpenRouter. Fallback: `openai/gpt-oss-20b` through Groq. Keys remain server-side.

Image-dependent questions remain pending with a snapshot preview and Retry if Nemotron is unavailable. Retry reuses the original map and time even if you navigate somewhere else or close the chat bubble. Groq handles text-only fallback. Snapshots contain the app's map canvas. The model proposes actions; the user clicks before any action runs. Evidence IDs refer to server-created facts. The model inserts fact placeholders in its prose; the server supplies numerical strings, rejects unsupported numbers/references, and validates action targets and dates. This constrains numerical provenance; it is not proof that every natural-language interpretation is correct.

No hosted AI call is possible until valid keys are configured. A missing key is shown as a configuration error. Local scene selection and measurements do not require LLM credentials.

## Validation

```text
npm test
npm run test:live
npm run test:eclipse
npm run test:eclipse-browser
npm run test:solar
npm run test:solar-browser
npm run test:landing-browser
node scripts/smoke-browser.mjs
```

Live validation compares direct off-grid Horizons requests with the shared interpolation engine at an Apollo-era Apollo 11 location and a modern south-pole location. Reports are in `data/validation/`. A further seeded run checks 200 timestamps across ten locations and 1969–2040 (400 Sun/Earth directions) against independent sparse Horizons queries. This verifies interpolation, not independent SPICE agreement or the full mission-tool acceptance matrix. Browser smoke tests exercise real API data, historical timing defaults, comparison, context menus, custom-site labels and Rocky's interaction flow. Test fixtures are confined to tests and never used as scientific fallbacks.

Eclipse validation checks actual JPL geometry at Apollo 11 against broad inside/outside states in [NASA's March 2025 total lunar eclipse account](https://science.nasa.gov/solar-system/moon/what-you-need-to-know-about-the-march-2025-total-lunar-eclipse/). This is not a contact-time validation: local site contacts differ from whole-Moon contacts and atmospheric shadow definitions. Browser checks download actual JSON/CSV reports, preserve pinned mission dates when the global clock changes, compare both detail modes, and check that the rendered globe darkens during totality and has intermediate illumination during partial coverage. Reports include `data/validation/eclipse.json` and `data/validation/ui-eclipse-export/checks.json`.

## Numerical limits

- Events are solar-centre (~half-disc) or Earth-centre crossings of the horizon, not first/last limb contacts. Refinement within interpolated samples is not a claim of one-second physical accuracy. Narrow terrain-grazing events can be missed.
- Candidate landing searches sample arrivals hourly and can miss shorter matching windows. Example thresholds are editable user requirements, not NASA mission criteria.
- Mission percentages and maximum light/dark runs currently use ten-minute integration. Values close to a requirement boundary should be treated with that resolution and terrain uncertainty in mind.
- A 150 km terrain radius, half-degree azimuth spacing and finite DEM resolution can miss obstructions. No local boulders, lander hardware, exact sole contact or terrain beyond the DEM analysis domain are modelled.
- DTE is Earth-centre geometry plus the chosen antenna elevation threshold. It is not a DSN station-specific availability or radio link budget.
- Relative power index is an idealized incidence/distance metric for the selected array orientation. No equipment efficiency, thermal model, storage model or full spacecraft energy budget is included.
- Eclipse screening uses a small-angle apparent-circle overlap approximation with an opaque Earth. Atmospheric shadow enlargement, refraction/scattering, limb darkening and Earth's ellipsoidal limb are excluded. The globe reconstructs approximate Moon-fixed body positions from one observer's apparent JPL data; it is a visualization of that screening model, not a separate physical validation. Local rendering ambience is for navigation, not a radiometric measurement.
- Earth-shadow exposure counts ten-minute integration cells where Earth overlaps the Sun and at least part of the Sun clears terrain. It is not an exact contact duration. Terrain sunrise/set countdowns exclude eclipse contacts. Live mission summaries refresh on whole UTC hours; current sky readings follow the selected clock.
- Supported UI dates are 1969–2040, subject to upstream coverage. Future UTC conversions inherit Horizons' current leap-second assumptions. Mission windows must fit within the supported range; their current UI resource bound is 90 days.

Use **Find better spots nearby** from the inspector or the map context menu. The search samples eight directions within the chosen radius and includes up to two catalogue or saved sites. Each result uses its own LOLA horizon and JPL observer table. The search uses the selected mission date or map clock, the chosen stay duration and the current mast and antenna settings. Sites meeting all configured limits rank first. The remaining score adds sunlight and Earth-contact percentages and subtracts the longest dark period as a percentage of the stay. The results can be placed on the globe as numbered pins or added to a comparison.

In Horizon View and Surface View, **Use mission lighting** enables moving shadows cast by the local LOLA mesh. The render uses the selected time’s Sun direction, Earth occultation and an approximate distant-horizon cutoff. The shadow map covers the loaded terrain patch. Mission metrics continue to use the numerical site horizon and solar-disc model.

All 14 curated sites have local 3D terrain and registered orbital imagery in Horizon and Surface View. The Apollo sites, Chang’e 4 and 6, Chandrayaan-3, Blue Ghost and SLIM use 512 m crops of LROC stereo terrain and associated orthophotos. IM-1 combines adjusted 20 m LOLA terrain with the Moon Trek post-landing orthomosaic. IM-2 combines 10 m LOLA terrain with the 1 m LROC Mons Mouton mosaic. Shackleton uses 6 m ShadowCam stereo terrain and a 1.9 m orthomosaic of the crater interior. The IM-2 and Shackleton crops cover 1,024 m squares. Each site loads only its own compressed height grid and WebP texture. The local relief uses the existing LOLA site elevation as its vertical reference and blends into the surrounding DEM. Numerical skyline and landing analysis use the underlying terrain records. The images preserve lighting from their original acquisition.

Horizon View shows the source sampling for terrain and imagery. Around low- and mid-latitude sites, including custom coordinates, the surrounding 12 km display mesh streams approximately 60 m SLDEM2015 elevations from NASA’s PDS archive. The server requests only the byte ranges needed for that patch and keeps a bounded cache. Outside the SLDEM2015 coverage and when the archive is unavailable, the display uses the existing LOLA surface. Provenance files under `public/assets/surface-details/<site>/provenance.json` record the exact products, export spacing and checksums. Rebuild a crop with Rasterio installed and `python scripts/prepare_surface_details.py apollo12`. Preparation reads only the relevant archived raster windows or Moon Trek tiles.

Run independent direction validation with `python -m pip install spiceypy` followed by `npm run test:spice`. The [report](data/validation/spice.json) covers 216 Sun and Earth directions at nine sites from 1969 to 2039. The largest angular difference is 0.0002022° when rounded up. It records the independent SPICE kernel checksums, Horizons query provenance and residuals for each observation. The original roadmap still includes denser nearby grids, offline packaging and further export and educator features. `PROJECT_BRIEF.md` records decisions and `ORIGINAL_SPECIFICATION.txt` preserves the supplied source.

The Solar System checks compare one off-grid point per planet with a direct Horizons vector query; the largest checked interpolation discrepancy is about 74 metres. This limited check is not a bound over all dates or an independent ephemeris validation. `data/validation/solar-vectors.json` records the requests and results. Rebuild visual assets with `node scripts/prepare-planets.mjs` and optionally prefill the current month's real ephemerides with `node scripts/prepare-solar.mjs`.
