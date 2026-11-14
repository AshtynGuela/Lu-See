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

Planet rotation follows the selected UTC time, playback and speed controls. Planet axes and prime meridians use the NASA/JPL `pck00011` orientation model, including periodic terms, retrograde Venus and sideways Uranus. Earth uses an approximately 106 KB table derived from the JPL ITRF93 orientation kernels, with six-hour residual samples and explicit leap-second boundaries across 1969–2040. Its Greenwich meridian and geographic poles are registered to NASA GIBS Blue Marble imagery. Earth orientation appears consistently in Solar System and Earth–Moon views. The source kernels contain predicted Earth orientations for future dates. The numerical checks in `data/validation/planet-rotation.json` compare 3,490 orientations against direct SPICE transforms, with a maximum Earth residual below 0.000064 degrees. Rebuild Earth's table using `python scripts/prepare_earth_orientation.py` with the listed kernels and SpiceyPy installed.


In lunar views, choose a site and use **Plan landing**. Choose a historical mission reference or keep the IM-1 default. The planner fills the directly editable surface duration, uses the map clock as earliest departure, and searches the next 30 days of arrivals after the estimated flight. Timing and historical sources contains the other timing overrides. Each candidate lists a departure estimate calculated by subtracting the reference launch-to-touchdown duration. **Find possible landing dates** screens hourly arrivals using real JPL positions and the site's LOLA horizon, including geometric Earth-shadow screening. **Find next window** continues beyond an empty result, checking up to another year in chronological batches until a match is found. You can stop the search and continue from completed batches. Choose the earliest compatible arrival or the best surface conditions within each checked window; your mission limits remain unchanged. Choose a suggested date to compare or travel. Manual arrival entry and live-clock scenarios remain available. Up to four scenarios can be compared; the date-slip view explores nearby dates. Custom coordinates use the same terrain and JPL calculations as curated sites using NASA-hosted numerical elevation sections. Suggestions are screening candidates, not certified landing dates or calculated transfer trajectories.

The inspector separates **Sunlight now**, **Earth contact now** and **Over your whole mission**. Status and blockage reasons come first; expand Position in the sky for centre elevation and compass bearing. Engineer mode exposes the detailed measurements. The inspector's JSON and CSV buttons export the current reading and selected mission, with separate UTC epochs, array settings, observer definitions, sources and assumptions. Exports wait for the selected mission calculation; an earlier result is never substituted. CSV preserves numerical precision and treats user site names as text.

Click Rocky’s floating button to chat. The animated model starts near the map’s bottom-right and loops random animations even while chat or the context menu is open. Drag the button or pinch to resize it. Right-click or long-press for animations, corner docking, position reset, idle bubbles, gradual reply text and Calm dialogue blips. Rocky can explain Lu-See controls, discuss space science and handle general questions. Site measurements use verified data. Keyboard shortcuts are in the Controls dialog.

The supplied D-DIN font and bubble artwork are used across the interface and Rocky chat respectively. The three map views use artwork from the supplied space pack. Calm audio is from [Dialogue Blips Free by heyheythere](https://heyheythere.itch.io/dialogue-blips-free), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).


Earth-shadow screening uses the real JPL Sun/Earth apparent positions and angular sizes. It tests an opaque circular Earth disc against the solar disc, combines that with the terrain horizon, and feeds the resulting direct-light fraction into mission summaries, timelines, date sweeps and Rocky's numerical tools. The retained Three.js views apply the corresponding approximate shadow geometry across the globe. Cesium lunar views reconstruct the Moon-centred Sun direction from JPL observer positions, illuminate the day/night hemispheres and cast terrain shadows locally. A selected site’s terrain visibility never dims the entire globe. Local views apply the selected site’s eclipse transmission; they do not project a spatial Earth-eclipse footprint across the whole Moon. Atmospheric red/refracted light is excluded from the screening model. Polar hillshade and statistical rasters remain cartographic/precomputed layers, not eclipse images.

## Scientific data

- **Sun and Earth:** real [NASA/JPL Horizons observer API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) responses, requested for the selected lunar coordinates and observer altitude. High-precision MEAN_ME frame, east-positive longitude, airless apparent angles, angular diameters and topocentric ranges. Horizons currently reports DE441 in the checked responses. Ten-minute directions are interpolated as normalized unit vectors to handle north-wrap and zenith passages; angular sizes and ranges are interpolated linearly, without extrapolation.
- **Source records:** responses are stored unchanged under `.cache/horizons/`, along with SHA-256 digests, exact request URLs, retrieval times and returned model/frame metadata. The inspector's Data & methodology dialog links to raw responses. A source failure produces an error and Retry, never invented readings.
- **Curated coordinates:** NASA NSSDCA/LRO landing-site tables and NASA mission releases; Shackleton is a USGS/IAU named-feature centre, explicitly not a recommended landing point. Each record links to its source. Published coordinate precision and frame-realisation differences remain limitations.
- **Terrain:** official PDS LOLA `LDEM_128` (global, approximately 237 m/pixel at the equator) and `LDEM_80S_20M` (20 m/pixel at the south pole). Scientific masks use the original numeric heights, spherical curvature, mast height, 720 azimuth rays and a 150 km search radius. Pixel resolution does not imply equivalent horizontal or vertical accuracy. Outside the south-polar product, the global product is used.
- **Custom points:** enter lunar latitude and east-positive longitude or click the globe. The server reads selected byte sections of the NASA-hosted PDS LOLA grids, uses the resulting elevation for JPL Horizons, and builds the terrain tile and 360° skyline. If the remote source is unavailable, the app labels the smooth-horizon fallback.
- **Precomputed layers:** NASA long-term visibility products and/or Moon Trek API rasters, with separate metadata. They describe their source period and visibility definition; they do not change to match the current clock or supply numerical mission metrics from image colours.
- **Visual assets:** normal Moon, polar, surface and horizon navigation streams ACT QuickMap quantized-mesh terrain and registered LROC WAC/NAC/ROI imagery through CesiumJS; see Streamed lunar navigation below. The original Three.js renderer and its NASA Moon Trek imagery remain for Earth–Moon exploration and cinematic travel. The owner-supplied Earth model and compressed original Rocky rig are retained. Recorded imagery lighting remains visible; **Use mission lighting** adds the selected time’s direct-light estimate. Numerical terrain masks and mission analysis continue to use LOLA and JPL data.

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

Rocky uses a 3.43 MB floating-button model with 154,164 vertices, eighteen texture slots and all eight animations. The web export uses simplified geometry and 512-pixel source textures. The original rig remains in the Rocky project. Rebuild the web export with `node scripts/prepare_assets.mjs`.

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

Normal Horizon and Surface View now use the streamed lunar renderer described below. **Use mission lighting** adds a directional-light estimate from the selected time's Sun direction and visible solar fraction. It does not reproduce the old local-mesh shadow-map rendering or remove the mosaic's recorded acquisition lighting.

The retained Three.js surface renderer has prepared local terrain and orbital-image crops for all 14 curated sites. Those assets are legacy rendering resources, rather than the imagery source for normal Horizon and Surface View. Apollo sites, Chang’e 4 and 6, Chandrayaan-3, Blue Ghost and SLIM have LROC stereo terrain and associated orthophotos; IM-1 and IM-2 combine LOLA terrain with Moon Trek/LROC imagery, and Shackleton has ShadowCam stereo terrain and an orthomosaic. Prepared surroundings include Moon Trek imagery and, within SLDEM2015 coverage, 12 km elevation patches at approximately 60 m spacing. Provenance under `public/assets/surface-details/<site>/provenance.json` records the exact products, export spacing and checksums. With Rasterio installed, `python scripts/prepare_surface_details.py apollo12` rebuilds a crop; `--surroundings` rebuilds the wider legacy assets. Preparation reads the relevant archived raster windows or Moon Trek tiles. Numerical skyline and landing analysis retain their underlying terrain records.

Run independent direction validation with `python -m pip install spiceypy` followed by `npm run test:spice`. The [report](data/validation/spice.json) covers 216 Sun and Earth directions at nine sites from 1969 to 2039. The largest angular difference is 0.0002022° when rounded up. It records the independent SPICE kernel checksums, Horizons query provenance and residuals for each observation. The original roadmap still includes denser nearby grids, offline packaging and further export and educator features. `PROJECT_BRIEF.md` records decisions and `ORIGINAL_SPECIFICATION.txt` preserves the supplied source.

The Solar System checks compare one off-grid point per planet with a direct Horizons vector query; the largest checked interpolation discrepancy is about 74 metres. This limited check is not a bound over all dates or an independent ephemeris validation. `data/validation/solar-vectors.json` records the requests and results. Rebuild visual assets with `node scripts/prepare-planets.mjs` and optionally prefill the current month's real ephemerides with `node scripts/prepare-solar.mjs`.


### Streamed lunar navigation

Moon, polar, surface and horizon views use CesiumJS with a lunar ellipsoid of radius 1,737,400 m. Terrain streams directly from ACT QuickMap's public quantized-mesh tiles, with its LROC WAC/NAC/ROI imagery mosaic. These are progressively refined network tiles, not a downloaded global model or an embedded QuickMap page. The renderer is loaded only when entering lunar navigation; a 160-tile terrain cache and render-on-demand limit retained terrain and idle rendering. Existing Earth-Moon and Solar System views retain their original renderer.

Drag to pan, wheel/right-drag to zoom, and middle-drag or Ctrl-drag to tilt. Navigation settings contain **3D terrain**, **Unlock camera Z-axis**, and keyboard help. The Z-axis is unlocked by default, including camera roll. Two-finger pinch/drag supports touch navigation. Arrow keys pan; A/Z zoom; E/D move higher/lower; T/G pitch; S/F turn; O/P roll; B switches horizon/overhead; V rises; X returns to the selected site's Observer horizon. Keyboard navigation does not handle input fields or dialogs.

**Terrain flyover** enters 900 m above sampled terrain at the selected site, looking down across its relief. **Observer horizon** enters at the configured mast height above sampled terrain, with a 2 m camera minimum. Switch between them using the labelled mode control. Free navigation can move the camera away from that observer; the numerical horizon and Sun/Earth controls still refer to the selected site. At widths of 1,000 px or less, the horizon card starts collapsed; expanding it closes the inspector, and opening the inspector collapses the horizon card.

The bottom readout reports latitude, longitude, terrain height above the lunar reference sphere, ground distance per screen pixel, and camera-to-cursor distance from the currently loaded terrain intersection. Click or tap terrain to place a visible measurement pin; mouse movement updates the pointer readout, while touch preserves the tapped reading. **Measurement details** explains the spherical height datum, screen-pixel resolution and source-detail limit. Coarse tiles refine as they load; view resolution is not an assertion of native DEM accuracy, and source imagery limits close-range detail. Right-click a terrain point for Lu-See's existing site menu, or use **Add custom coordinates** and select a point. Site markers, nearby candidates and Rocky's map snapshots use the new renderer too.

The local `/api/lunar-terrain-v2/layer.json` (with the original route retained for compatibility) describes the observed geographic tile grid; mesh/image requests go directly to the public source with browser caching. Imagery uses 512-pixel tiles and a zoom index one above the equivalent Cesium terrain level. Public endpoints may change and have no app-specific service guarantee. Attribution links back to [LROC QuickMap](https://quickmap.lroc.im-ldi.com/). Numerical horizon masks, event timing and landing windows continue to use Lu-See's NASA/JPL and LOLA calculation pipeline; the visual mesh does not replace or independently validate those results. Horizon controls refer to the selected site's observer, while free camera navigation can move elsewhere. Recorded imagery lighting remains in the mosaic; **Use mission lighting** adds the selected date's direct-light direction, rather than reconstructing acquisition-neutral imagery.

`npm run build` copies Cesium's worker/runtime assets into `dist/cesium`. The dev server serves these from the installed dependency; production and Docker builds include the copied assets. No Cesium ion account or token is required for this public lunar tile integration.


### Lunar rotation and moving shadows

The Moon follows the existing NASA/JPL PCK orientation model, including its periodic terms, rather than an arbitrary spin loop. Its Solar System orientation is absolute; globe and Earth-Moon views transform the camera into the changing lunar frame as the simulation clock advances. This displays sidereal rotation while keeping terrain, site markers and coordinate picking in the body-fixed reference frame. Surface, horizon and polar cameras stay attached to lunar coordinates. **Show lunar rotation in globe view** can disable the inertial globe camera behavior.

**Sunlight and terrain shadows** is enabled by default in lunar navigation settings; turn it off to inspect the recorded imagery. Sun direction comes from the real JPL observer ephemerides, corrected from the observer to the lunar centre. The streamed mesh's encoded vertex normals provide relief lighting and the global terminator. Surface and horizon views also cast and receive terrain shadows, using a 20 km maximum shadow range and 2048-pixel maps (1024 on small screens). The global view uses direct lighting without the cost of whole-Moon shadow maps. Dates and playback update both lighting and rotation; idle time does not introduce a second animation loop. In the readable Solar System, the Moon's phase lighting uses the original heliocentric vector rather than the compressed display position.

Recorded shadows in the image mosaic remain; dynamic lighting does not remove acquisition lighting or create sub-pixel terrain detail. The numerical NASA/JPL/LOLA horizon and landing calculations remain separate. Tests cover the inertial/body frame transform, the two renderer axis conventions, solar-centre reconstruction from day and night sites, and heliocentric illumination independent of display compression.
