---
version: 1
slug: "src-lunarglobe-tsx"
primary_target: "src/LunarGlobe.tsx"
related_targets: ["src/World.tsx","src/lunar-map.css"]
---

## Direction contract

THESIS
Make Moon navigation continuous from the whole globe to measured local relief, following QuickMap's streaming terrain and camera behavior.

OWN-WORLD
Extend Lu-See's existing D-DIN instrument console, dark surfaces, lime active controls and compact labelled tools. Preserve the surrounding site's analysis layout.

STORY
Users zoom, tilt and fly across real lunar terrain, read coordinates and height under the pointer, then select a point for landing analysis.

FIRST VIEWPORT
The globe fills the map workspace. Camera controls sit at its right edge, settings expand beside them, and a compact bottom readout presents latitude, longitude, height, view resolution and distance to cursor. Existing site markers remain selectable.

FORM
An Operate-mode extension of the established map surface. Stream progressively refined mesh and image tiles, retain coarse coverage during refinement, use render-on-demand and bounded caching, and support mouse, keyboard and touch navigation.

FINISH
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Extension provenance

This is a precisely requested extension of the existing Moon navigation, following the user-selected QuickMap reference. No concept seed or approval comp applies under new-work section 3 (narrow extension). Retain existing PRODUCT.md / DESIGN.md. Quality target: real streamed lunar topography, readable terrain flyover, literal observer horizon, useful clear map area at narrow widths and five-field pointer/touch measurements. Source imagery bounds attainable mast-height detail.


## Implemented surface record

Normal Moon, north/south polar, Terrain flyover and Observer horizon views use a lazily loaded CesiumJS renderer. The existing Three.js renderer remains for Earth–Moon exploration and cinematic travel. ACT QuickMap quantized-mesh tiles and registered LROC WAC/NAC/ROI image tiles refine progressively over a lunar sphere of radius 1,737,400 m. Imagery tiles are 512 px, requested one source zoom index above the corresponding Cesium level. Render-on-demand and a 160-tile terrain cache are implementation limits, not measured performance claims.

The incumbent console identity is retained: D-DIN, blue-black panel/line surfaces, lime controls and pins, compact icon buttons with accessible names, and tabular numerical readings. Camera buttons sit at the right map edge, shifting clear of the inspector on desktop; settings use the existing bordered panel treatment. At 760 px and below, the camera buttons form a two-column grid and measurements form three columns. The map remains full-workspace behind these instruments. No new global palette, typography or shape rule is established.

Terrain flyover enters 900 m above sampled terrain at the selected site. Observer horizon uses sampled terrain plus the configured mast height, with the implemented 2 m camera minimum. A labelled mode switch distinguishes these views. Free Z-axis navigation is enabled by default; mouse, two-finger touch and keyboard controls remain available. Camera movement does not relocate the numerical observer. At widths of 1,000 px or less the horizon card starts collapsed; expansion closes the inspector, and opening the inspector collapses the card.

The bottom instrument strip reports latitude, longitude, displayed terrain height, ground metres per screen pixel and camera-to-cursor distance. Click/tap places a lime measurement pin. Mouse hover updates the readout; touch retains the tapped measurement. Measurement details defines height relative to the 1,737.4 km lunar sphere, distinguishes screen resolution from source DEM resolution, and states the close-range imagery limitation. Refining geometry can change display measurements. Source loading, refinement and failure/retry states remain explicit, with QuickMap attribution.

NASA/JPL directions, LOLA horizons, events and landing-window calculations keep their existing backend. Streamed visual terrain does not independently validate those calculations. Mission lighting adds a selected-time directional-light estimate to imagery with recorded acquisition lighting; it does not promise acquisition-neutral or radiometrically validated imagery. This documentation records inspected source behavior. Required finish review remains separate; no scientific validation or faster-rendering benchmark is asserted.
