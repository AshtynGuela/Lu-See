# Lu-See

A separate browser app for the [NASA Space Apps Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/). The core workflow is site + landing date + mission duration → Sun/Earth state, terrain obstruction, events and comparison. The existing Rocky Electron overlay is separate.

See [BUILD_STATUS.md](BUILD_STATUS.md) for this build's delivered features, completed checks and remaining work.

## Run locally

Requires Node 22+, npm and Python 3.11+ with `pip install -r requirements.txt` for custom terrain. From this directory:

```text
npm install
npm run dev
```

Open http://127.0.0.1:5173. The server binds to loopback. `npm run build` checks TypeScript and creates a production build; `npm run preview` serves that build with the API backend.

The welcome screen now opens a Sun-centred Solar System map, following the user's JPL Orbit Viewer reference. Select any of the eight planets to focus, drag to orbit, wheel/pinch to zoom, or use WASD/QE to fly. Whole-system and inner-planet views, orbit/label toggles, readable spacing and physical scale are available. The supplied NASA planet models are optimized copies. The Sun uses the supplied `Rocky/Sun_1_1391000.glb` mesh and its emissive texture atlas, with the embedded image compressed for the web. Readable mode compresses radial spacing and enlarges bodies; physical mode uses linear AU spacing and physical radii. Numerical distances always use the unscaled JPL vectors. Model attitude and rendering brightness are visual context, not an attitude or radiometric solution.

Solar positions use actual Sun-centred ecliptic J2000 Horizons vectors and velocities, with six-hour cubic Hermite interpolation and a cached monthly window. Orbit lines sample roughly one sidereal revolution of actual trajectories. Jupiter through Neptune use their planetary-system barycentres, explicitly labelled. Orbital periods and mean radii are cited to JPL's physical-parameters table. Only the Moon has landing-site analysis; use **Explore Earth–Moon** or **Moon** to enter it. New, uncached months require additional NASA requests; failures remain visible and can be retried.

In lunar views, choose a site and use **Plan landing**. Choose a historical mission reference or keep the IM-1 default. The planner fills the directly editable surface duration, uses the map clock as earliest departure, and searches the next 30 days of arrivals after the estimated flight. Timing and historical sources contains the other timing overrides. Each candidate lists a departure estimate calculated by subtracting the reference launch-to-touchdown duration. **Find possible landing dates** screens hourly arrivals using real JPL positions and the site's LOLA horizon, including geometric Earth-shadow screening. **Find next window** continues beyond an empty result, checking up to another year in chronological batches until a match is found. You can stop the search and continue from completed batches. Choose the earliest compatible arrival or the best surface conditions within each checked window; your mission limits remain unchanged. Choose a suggested date to compare or travel. Manual arrival entry and live-clock scenarios remain available. Up to four scenarios can be compared; the date-slip view explores nearby dates. Custom coordinates use the same terrain and JPL calculations as curated sites using NASA-hosted numerical elevation sections. Suggestions are screening candidates, not certified landing dates or calculated transfer trajectories.

The inspector separates **Sunlight now**, **Earth contact now** and **Over your whole mission**. Status and blockage reasons come first; expand Position in the sky for centre elevation and compass bearing. Engineer mode exposes the detailed measurements. The inspector's JSON and CSV buttons export the current reading and selected mission, with separate UTC epochs, array settings, observer definitions, sources and assumptions. Exports wait for the selected mission calculation; an earlier result is never substituted. CSV preserves numerical precision and treats user site names as text.

Click Rocky to chat. He starts beside the map above the bottom controls, introduces his click features, and loops random animations even while chat or the context menu is open. Drag him across the app or pinch to resize. Right-click or long-press for animations, corner docking, position reset, idle bubbles, gradual reply text and Calm dialogue blips. Replies are revealed after the server validates them. Keyboard shortcuts are in the Controls dialog.

The supplied D-DIN font and bubble artwork are used across the interface and Rocky chat respectively. The three map views use artwork from the supplied space pack. Calm audio is from [Dialogue Blips Free by heyheythere](https://heyheythere.itch.io/dialogue-blips-free), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).


Earth-shadow screening uses the real JPL Sun/Earth apparent positions and angular sizes. It tests an opaque circular Earth disc against the solar disc, combines that with the terrain horizon, and feeds the resulting direct-light fraction into mission summaries, timelines, date sweeps and Rocky's numerical tools. The globe applies the corresponding approximate geometry across its surface. Atmospheric red/refracted light is deliberately excluded, so geometric totality renders black. Polar hillshade and statistical rasters remain cartographic/precomputed layers, not eclipse images.

## Scientific data, not sample values

- **Sun and Earth:** real [NASA/JPL Horizons observer API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) responses, requested for the selected lunar coordinates and observer altitude. High-precision MEAN_ME frame, east-positive longitude, airless apparent angles, angular diameters and topocentric ranges. Horizons currently reports DE441 in the checked responses. Ten-minute directions are interpolated as normalized unit vectors to handle north-wrap and zenith passages; angular sizes and ranges are interpolated linearly, without extrapolation.
- **Source records:** responses are stored unchanged under `.cache/horizons/`, along with SHA-256 digests, exact request URLs, retrieval times and returned model/frame metadata. The inspector's Data & methodology dialog links to raw responses. A source failure produces an error and Retry, never invented readings.
- **Curated coordinates:** NASA NSSDCA/LRO landing-site tables and NASA mission releases; Shackleton is a USGS/IAU named-feature centre, explicitly not a recommended landing point. Each record links to its source. Published coordinate precision and frame-realisation differences remain limitations.
- **Terrain:** official PDS LOLA `LDEM_128` (global, approximately 237 m/pixel at the equator) and `LDEM_80S_20M` (20 m/pixel at the south pole). Scientific masks use the original numeric heights, spherical curvature, mast height, 720 azimuth rays and a 150 km search radius. Pixel resolution does not imply equivalent horizontal or vertical accuracy. Outside the south-polar product, the global product is used.
- **Custom points:** enter lunar latitude and east-positive longitude or click the globe. The server reads selected byte sections of the NASA-hosted PDS LOLA grids, uses the resulting elevation for JPL Horizons, and builds the terrain tile and 360° skyline. If the remote source is unavailable, the app labels the smooth-horizon fallback.
- **Precomputed layers:** NASA long-term visibility products and/or Moon Trek API rasters, with separate metadata. They describe their source period and visibility definition; they do not change to match the current clock or supply numerical mission metrics from image colours.
- **Visual assets:** the LROC WAC global mosaic from [NASA Moon Trek](https://trek.nasa.gov/moon/), owner-supplied Earth model, and an unchanged copy of the existing Rocky rig. The Moon rendering texture is visual context, not a scientific shadow map. Polar hillshade uses downloaded LOLA elevations and fixed cartographic lighting, not current solar illumination.

No orbital periods, made-up orbit animations or placeholder Sun/Earth values drive scientific results. The shuttle is explicitly a cinematic guide: travel advances to the selected arrival epoch, not a calculated transfer duration.

## Prepare the actual datasets

The downloaded elevation products total approximately 4 GB. They are acquired once with resumable range requests; final products are memory-mapped for preparation. Source labels, file sizes, hashes and processing assumptions are retained. Do not delete `data/raw/` during an active download.

```text
python -m pip install -r requirements.txt
python scripts/prepare_data.py
python scripts/prepare_polar.py
python scripts/prepare_statistics.py
```

`prepare_data.py` generates curated terrain records with the same sampler used for custom coordinates. Horizon View reports compass bearing, skyline angle, distance to the terrain that sets the skyline, and Sun/Earth centre clearance. The global 237 m grid and 20 m south-polar grid cover the surroundings. For Shackleton rim detail, install `rasterio`, download the [NASA Site04 elevation GeoTIFF](https://pgda.gsfc.nasa.gov/products/78), and run `python scripts/prepare_regional_terrain.py PATH_TO_TIF`. The 5 m grid is used inside its footprint with a 200 m blend at the edges. The browser checks for newly prepared terrain periodically. `prepare_polar.py` generates display-only polar relief and globe displacement. `prepare_statistics.py` reads the numeric precomputed visibility products linked by NASA PGDA. `prepare_layers.py` is an alternative Moon Trek WMTS acquisition path. If a source is unavailable, its layer remains unavailable rather than being fabricated.

To prepare visual assets, run `node scripts/prepare_assets.mjs`. The parent directory's source GLBs are preserved. Rocky is copied byte-for-byte to `public/assets/rocky-original-rigged.glb`: 79.6 MB, 866,045 vertices, all eighteen original 2048-pixel textures, original material assignments, the rig and eight animation clips. He is excluded from planet simplification and texture resizing. `data/validation/rocky-original-assets.json` records the source hash and verifies that every embedded texture and material matches the original unrigged mesh. This increases initial transfer size and graphics memory use. His rights/provenance remain those of the supplied fan asset; the mascot path can be replaced.

## Rocky keys

Put these in this directory's ignored `.env` file, then restart the server:

```text
OPENROUTER_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

Primary: `nvidia/nemotron-3.5-super-vl:free` through OpenRouter. Fallback: `openai/gpt-oss-20b` through Groq. Keys remain server-side.

Image-dependent questions are never sent to the text-only fallback. They remain pending with Retry if Nemotron is unavailable. Snapshots contain the app's map canvas. The model proposes actions; the user clicks before any action runs. Evidence IDs refer to server-created facts. The model inserts fact placeholders in its prose; the server supplies numerical strings, rejects unsupported numbers/references, and validates action targets and dates. This constrains numerical provenance; it is not proof that every natural-language interpretation is correct.

No hosted AI call is possible until valid keys are configured. A missing key is shown as a configuration error, not a fake assistant answer. Local scene selection and measurements do not require LLM credentials.

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

The original roadmap also includes deeper terrain shadowing, nearby-alternative ranking, broader validation, offline packaging and further export/educator features. `PROJECT_BRIEF.md` records decisions; `ORIGINAL_SPECIFICATION.txt` preserves the supplied source.

The Solar System checks compare one off-grid point per planet with a direct Horizons vector query; the largest checked interpolation discrepancy is about 74 metres. This limited check is not a bound over all dates or an independent ephemeris validation. `data/validation/solar-vectors.json` records the requests and results. Rebuild visual assets with `node scripts/prepare-planets.mjs` and optionally prefill the current month's real ephemerides with `node scripts/prepare-solar.mjs`.
