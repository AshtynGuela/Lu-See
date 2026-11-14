"""Sample the PDS SLDEM2015 elevation tiles for a local display mesh."""
import json
import sys

import numpy as np

from lunar_terrain import forward
from remote_dem import POOL, fetch_ranges

ARCHIVE = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
           "lrolol_1xxx/data/sldem2015/tiles/float_img/")
PPD = 512
ROWS, COLS = 30 * PPD, 45 * PPD
SIZE, WIDTH = 201, 12000
BANDS = ("30n_60n", "00n_30n", "30s_00s", "60s_30s")


def pixel_values(rows, cols):
    bands, strips = rows // ROWS, cols // COLS
    result = np.empty(rows.shape, dtype=np.float32)
    for band, strip in np.unique(np.stack([bands.ravel(), strips.ravel()], axis=1), axis=0):
        inside = (bands == band) & (strips == strip)
        ys, xs = rows[inside] % ROWS, cols[inside] % COLS
        order = np.argsort(ys, kind="stable")
        sorted_rows = ys[order]
        sorted_cols = xs[order]
        source = {
            "url": ARCHIVE + f"sldem2015_512_{BANDS[band]}_{strip*45:03}_{(strip+1)*45:03}_float.img",
            "rows": ROWS, "cols": COLS, "byteLength": ROWS * COLS * 4,
        }
        unique, starts = np.unique(sorted_rows, return_index=True)
        stops = np.r_[starts[1:], len(sorted_rows)]
        windows = []
        for y, start, stop in zip(unique, starts, stops):
            row_cols = sorted_cols[start:stop]
            left, right = int(row_cols.min()), int(row_cols.max())
            offset = (int(y) * COLS + left) * 4
            windows.append(((offset, offset + (right - left + 1) * 4 - 1), start, stop, left))
        futures = []
        for i in range(0, len(windows), 160):
            batch = windows[i:i+160]
            futures.append((POOL.submit(fetch_ranges, source, [item[0] for item in batch]), batch))
        values = np.empty(len(order), dtype=np.float32)
        for future, batch in futures:
            sections = future.result()
            for span, start, stop, left in batch:
                values[order[start:stop]] = np.frombuffer(sections[span], dtype="<f4")[sorted_cols[start:stop] - left]
        result[inside] = values
    return result


def surface_tile(lat, lon):
    axis = np.linspace(-WIDTH / 2, WIDTH / 2, SIZE)
    east, north = np.meshgrid(axis, axis)
    latitude, longitude = forward(lat, lon, np.arctan2(east, north), np.hypot(east, north))
    x = longitude * PPD - .5
    y = (60 - latitude) * PPD - .5
    if y.min() < 0 or y.max() >= ROWS * len(BANDS) - 1:
        raise ValueError("Site falls outside SLDEM2015 coverage")
    col, row = np.floor(x).astype(int), np.floor(y).astype(int)
    u, v = x - col, y - row
    a, b = col % (360 * PPD), (col + 1) % (360 * PPD)
    tl, tr, bl, br = pixel_values(np.stack([row, row, row+1, row+1]), np.stack([a, b, a, b]))
    heights = 1000 * ((1-v)*((1-u)*tl+u*tr) + v*((1-u)*bl+u*br))
    if np.any(~np.isfinite(heights) | (np.abs(heights) > 12000)):
        raise ValueError("Invalid SLDEM2015 elevations")
    return {"size": SIZE, "widthM": WIDTH, "heightsM": heights.round(2).ravel().tolist()}


if __name__ == "__main__":
    print(json.dumps(surface_tile(float(sys.argv[1]), float(sys.argv[2])), separators=(",", ":"), allow_nan=False))
