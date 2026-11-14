# AMAZE-X deployment

AMAZE-X is a separate copy of the lunar-scout prototype, with D-DIN body text.
The production service uses the included Dockerfile: Node 22, Python, NumPy,
Requests and Pillow. It runs `node server/index.mjs --production`, binds to
`0.0.0.0:$PORT`, and serves the built browser app and API from one origin.

Create a Docker web service from the repository's main branch. Use Singapore,
the free compute plan for the initial prototype, and `/api/health` for HTTP
health checks when configuring the service. Add `OPENROUTER_API_KEY` and
`GROQ_API_KEY` through Render's Environment settings. Never commit `.env` or
include it in the Docker build context. Do not override Render's `PORT` with
the local development value.

## NASA terrain access

No complete global/polar rasters are included in this repository or container.
Curated sites retain their prepared numeric terrain and masks. Custom sites
read exact sections of the original NASA/PDS products, using HTTP byte ranges
and multipart requests. Offsets, byte counts, total product size and the pinned
HTTP ETag are checked. Unexpected complete-file responses are refused. The
whole-product SHA256 values document the earlier verified download; they are
not recomputed by downloading an entire product for each custom site.

The algorithm retains the original interpolation, 720 bearings, 150 km horizon,
mast heights and curvature calculation. The 5 m Shackleton regional source is
downloaded only when needed, checked against its original checksum, converted
to exact numeric heights and cached. It is about 41 MB, rather than a global
multi-gigabyte download.

The raster working cache is bounded to approximately 256 MB of block payloads;
SQLite bookkeeping and regional heights add storage. Final coordinate results
are cached separately, with a version derived from the code and source metadata.
Only one new terrain calculation runs at a time. Uncached polar calculations
can make many range requests and take longer than curated-site lookups.

`GET /api/terrain?lat=...&lon=...` returns HTTP 202 while work is pending. The
browser polls the same coordinate; completed jobs return HTTP 200. Failures
remain errors and may be retried explicitly using `retry=1`. No fabricated DEM
or reduced-resolution numerical substitute is used when NASA is unavailable.

Render's free filesystem cache is temporary: a restart can make the next custom
coordinate slower. It does not affect the prepared curated-site terrain. The
browser never receives entire source rasters.

## Verification

- `npm test`: deterministic scientific engine and session/report checks.
- `npm run test:terrain-remote`: range decoding, boundaries, interpolation and
  cache reuse against independent arrays, including NASA's multipart format.
- `data/validation/nasa-range-equatorial.json`: live NASA read compared with
  the previously downloaded original, including all mast masks and surface tile.
- `npm run build`: browser production build and TypeScript checks.

The full Rocky asset remains unchanged at approximately 80 MB; its initial load
uses the visitor's connection and its animation uses their graphics hardware.
