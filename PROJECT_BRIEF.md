# Lu-See

Agreed product brief, recorded from the requirements discussion on 12 November 2026.

## Purpose and scope

Build a separate browser application that reuses the existing Rocky model and animations. The first milestone is the full Phase 1 MVP of the supplied technical specification; the intended project extends through the broader roadmap. This is for the user's own initial testing, with no fixed delivery deadline supplied.

Challenge: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

The central task is rapid lunar site-and-date comparison: Sun and Earth positions relative to local terrain, sunlight and Earth-communication windows, explicit assumptions, and traceable scientific results. Screening results must not be presented as flight-certified mission planning.

Updated 13 November: the user explicitly requested a Sun-centred Solar System map first, like JPL's Orbit Viewer, with the other planets present for exploration and no extended analysis on them. This supersedes the earlier Earth–Moon-only opening. Detailed landing-site analysis remains lunar. The eight supplied NASA planet models are used as visual assets; Horizons vectors supply positions and sampled orbit paths. Rocky's free-moving overlay and bubble-chat redesign are recorded in TODO.md for a later pass.

## Experience

- Product name: **Lu-See**.
- A short cinematic introduction leads into free exploration.
- Start at a Sun-centred Solar System overview, with access to the detailed Earth–Moon and lunar views. This is the user's revised opening on 13 November 2026.
- Blend cinematic exploration with a detailed, Terra Invicta-inspired strategy interface during lunar analysis.
- Support both click-to-destination travel and free keyboard-and-mouse camera navigation.
- Use enlarged bodies for a readable overview, provide a true-scale toggle, and show accurate distance readouts. Make the display-scale distinction visible.
- Keep the camera as the main navigation tool. A placeholder shuttle appears during travel; a user-supplied model can replace it later.
- Travel uses a third-person chase view with a toggle back to the free map camera.
- A chosen lunar site supports a simplified descent and landing tied to its analysis, rather than a manual landing game.
- After touchdown, show a short surface reveal, then offer horizon view or overhead terrain analysis.
- Start new sessions at current UTC; landing dates remain editable.
- Travel advances the clock toward the selected arrival/landing date. This is an interpretation adopted after the user referred journey timing back to the challenge: do not invent physical transfer durations or imply the cinematic follows a calculated trajectory.

## Scientific requirements

- The first usable version needs verified Sun/Earth positions and real terrain horizons at curated sites.
- Include Apollo-era analysis as well as 2024–2040. Exact continuous kernel coverage and supported endpoints must be checked during data preparation.
- Custom-site terrain support follows curated-site support. In the interim, custom sites may show smooth-horizon Sun/Earth results with a prominent **terrain not included** label; terrain-based viability is unavailable.
- Ask for mission duration when creating a scenario. Do not silently assume a 14-day mission.
- Offer an optional, editable solar-lander profile. Raw positions, events, and countdowns remain usable without a profile. A viability rating requires explicit thresholds.
- Keep computation deterministic. The assistant explains verified results and navigates the application; it does not calculate scientific values.
- Retain the supplied specification's provenance, uncertainty, frame, terrain, event-finding, and validation requirements unless a documented engineering finding requires a revision.
- Make missing data and supported date limits explicit; never substitute sample or unverified values into scientific results.

## Rocky

- Reuse the supplied rigged GLB and its animation work; retain the corrected rigid screen-right arm and fingers only on the forked screen-left hand.
- Explain relevant Solar System objects and navigation, with detailed analysis tools for the Moon.
- Follow the supplied bubble-state workflow and evidence-backed answer format.
- Primary provider/model: OpenRouter, `nvidia/nemotron-3.5-super-vl:free`.
- Fallback provider/model: Groq, `openai/gpt-oss-20b`.
- The user has provider API keys. Configure these server-side later; do not place keys in browser code, source control, or this document.
- Support snapshots of the app's current map for visual questions. Scientific numbers must still trace to engine results.
- **For image-dependent questions, if Nemotron is unavailable, keep the question pending and offer Retry. Do not send it to the text-only GPT-OSS fallback as if the image had been inspected.**
- GPT-OSS fallback is for requests that do not depend on an image.
- Provider listings were checked during discovery; authenticated access, real tool calls, answer validation, timeouts, and rate-limit handling still need implementation and testing.
- Keep the mascot configurable, as in the source specification.

## Source assets and separation

The existing Electron desktop overlay remains its own application. The browser project lives in `lunar-scout/`.

Available locally in the parent workspace:

- `Rocky/Rocky-Rigged.glb`: current connected 21-joint rig, eight animation clips, embedded textures.
- `Rocky/26_11_12_09_31_03_057.glb`: original source sculpt.
- `SolarSystem/Earth_1_12756.glb`
- `SolarSystem/Mercury_1_4878.glb`
- `SolarSystem/Venussurface_1_12103.glb`
- `SolarSystem/24881_Mars_1_6792.glb`
- `SolarSystem/Jupiter_1_142984.glb`
- `SolarSystem/Saturn_1_120536.glb`
- `SolarSystem/Uranus_1_51118.glb`
- `SolarSystem/Neptune_1_49528.glb`

These are user-described NASA assets. Individual provenance, dimensions, orientation, and rendering suitability have not yet been audited. No Sun, Moon, or shuttle model was found in that folder during discovery. Obtain suitable lunar/Sun assets or generate appropriate geometry; use a simple shuttle placeholder until the user supplies their model. The current large Rocky asset needs optimization for the browser; do not assume it meets the source specification's asset budget.

## Delivery sequence

1. Establish the separate app, verify source assets and data sources, define scientific contracts, and implement validated engine foundations.
2. Deliver the full Phase 1 MVP: globe and polar views; precomputed layers; curated/custom sites with the stated terrain distinction; editable UTC and playback; context menus and keyboard alternatives; inspector, sky strip and countdowns; two-scenario comparison; complete Rocky bubble workflow and core tools.
3. Integrate the cinematic Earth–Moon entry, camera navigation, shuttle travel, date advance, descent and surface-view choice as part of the agreed product experience.
4. Continue the full-project roadmap: richer terrain/shadows, date-slip analysis, nearby alternatives, timeline, four-scenario comparison, and subsequent sharing/export/offline features. Keep scientific validation and performance evidence attached to each increment.

The original specification's architecture is a baseline, not proof that its exact package versions, accuracy claims, data sizes, performance estimates, or shader costs are achievable. Verify current documentation and test these claims before adopting them.

## Main test target

User hardware: Intel i5-12450H, 16 GB RAM, NVIDIA RTX 4050. The preferred browser was not specified. Start automated browser testing with Chromium, then validate the source specification's other supported browsers. Measure actual performance rather than inferring it from the GPU model.

## Discovery status

Core product choices are settled. Browser implementation, real Horizons API integration, official LOLA preparation for 14 curated sites, comparison and date-slip tools, and numerical/browser tests now exist. See README.md and data/validation for implemented behavior and limits. Authenticated live assistant testing still depends on configured provider keys. Further questions should address concrete findings or missing information rather than reopening these decisions.
