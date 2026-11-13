"""Project Moon Trek camera tiles into the same local frame as the LOLA mesh."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import sys
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

import numpy as np
from PIL import Image, ImageFilter

from lunar_terrain import RADIUS, forward

SIZE = 768
BASE = "https://trek.nasa.gov/tiles/Moon"
LAYERS = {
    "EQ": ("EQ", "LRO_WAC_Mosaic_Global_303ppd_v02", "jpg", 8),
    "SP": ("SP", "LRO_WAC_Mosaic_SPole60_100mp", "png", 4),
    "NP": ("NP", "LRO_WAC_Mosaic_NPole60_100mp", "png", 4),
    "NAC": ("SP", "LRO_NAC_AvgMosaic_SPole855_1mp", "png", 11),
    "IM1": ("SP", "LRO_LOLA_NAC_ColorHillshade_3_5mpp_IM_1_LandingSite_SP", "png", 10),
    "IM1_NAC": ("SP", "LRO_NAC_Post_Landing_OrthoMosaic_1mpp_IM_1_LandingSite_SP", "png", 12),
    "PSR": ("SP", "NAC_POLE_PSR_SOUTH_STRETCH", "png", 8),
    "RELIEF": ("EQ", "LRO_LOLAKaguya_ClrHillshade_60N60S_512ppd", "png", 10),
}


def map_pixels(projection, latitude, longitude, level, cols, rows):
    """WMTS pixel centres, in the projection of the source mosaic."""
    if projection == "EQ":
        x = ((longitude + 180) % 360) * (cols * 256 / 360)
        y = (90 - latitude) * (rows * 256 / 180)
        return (x - .5) % (cols * 256), np.clip(y - .5, 0, rows * 256 - 1)
    south = projection != "NP"
    distance = 2 * RADIUS * np.tan(np.radians(90 + (latitude if south else -latitude)) / 2)
    lon = np.radians(longitude)
    resolution = 30578404.0178571 * .00028 / (2 ** level)
    east = distance * np.sin(lon)
    north = distance * np.cos(lon) * (1 if south else -1)
    return (east + 1095930) / resolution - .5, (1095930 - north) / resolution - .5


def tile(projection, level, row, col, folder):
    region, product, extension, _ = LAYERS[projection]
    cols, rows = (2 << level, 1 << level)
    if not (0 <= row < rows and 0 <= col < cols):
        return None
    path = folder / f"{projection}-{level}-{row}-{col}.{extension}"
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        url = f"{BASE}/{region}/{product}/1.0.0/default/default028mm/{level}/{row}/{col}.{extension}"
        for _ in range(2):
            try:
                with urlopen(url, timeout=8) as response:
                    data = response.read(512 * 1024 + 1)
                break
            except HTTPError as error:
                if error.code == 404:
                    return None
                if error.code < 500 and error.code != 429:
                    raise
            except (URLError, TimeoutError):
                continue
        else:
            return None
        if len(data) > 512 * 1024:
            raise ValueError("Unexpected Moon Trek tile size")
    with Image.open(BytesIO(data)) as image:
        if image.size != (256, 256):
            raise ValueError("Unexpected Moon Trek tile dimensions")
        rgba = np.asarray(image.convert("RGBA"))
    if not path.exists():
        part = path.with_suffix(".part")
        part.write_bytes(data)
        part.replace(path)
    path.touch()
    return rgba


def sample(projection, latitude, longitude, folder, level=None):
    if level is None:
        level = LAYERS[projection][3]
    cols, rows = (2 << level, 1 << level)
    x, y = map_pixels(projection, latitude, longitude, level, cols, rows)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1 = (x0 + 1) % (cols * 256) if projection == "EQ" else x0 + 1
    y1 = np.minimum(y0 + 1, rows * 256 - 1)
    ux, uy = x - x0, y - y0
    corners = [(x0, y0, (1-ux)*(1-uy)), (x1, y0, ux*(1-uy)),
               (x0, y1, (1-ux)*uy), (x1, y1, ux*uy)]
    keys = sorted({(int(row), int(col)) for xx, yy, _ in corners
                   for row, col in np.unique(np.stack([yy.ravel()//256, xx.ravel()//256], axis=1), axis=0)})
    if len(keys) > 24:
        raise ValueError("Too many imagery tiles for this patch")
    with ThreadPoolExecutor(max_workers=4) as pool:
        rasters = dict(zip(keys, pool.map(lambda k: tile(projection, level, *k, folder), keys)))
    rgb = np.zeros((*x.shape, 3))
    weights = np.zeros(x.shape)
    for xx, yy, weight in corners:
        for (row, col), raster in rasters.items():
            if raster is None:
                continue
            inside = (yy//256 == row) & (xx//256 == col)
            pixels = raster[yy[inside] % 256, xx[inside] % 256]
            alpha = pixels[:, 3] / 255 * weight[inside]
            rgb[inside] += pixels[:, :3] * alpha[:, None]
            weights[inside] += alpha
    return rgb / np.maximum(weights[..., None], 1e-8), weights


def texture(lat, lon, width, folder):
    # Match the mesh UV convention: image top is north and right is east.
    axis = ((np.arange(SIZE) + .5) / SIZE - .5) * width
    east, north = np.meshgrid(axis, axis[::-1])
    latitude, longitude = forward(lat, lon, np.arctan2(east, north), np.hypot(east, north))
    projection = "SP" if lat <= -65 else "NP" if lat >= 65 else "EQ"
    rgb, coverage = sample(projection, latitude, longitude, folder)
    details = []
    if lat <= -85.5:
        details = [("NAC", 11 if width <= 1280 else 9, .92), ("PSR", 8, .85)]
    elif -80.46 <= lat <= -79.8 and .9 <= lon <= 1.95:
        details = [("IM1", 10 if width <= 1280 else 9, .85), ("IM1_NAC", 12 if width <= 1280 else 9, .78)]
    elif abs(lat) < 59.9:
        details = [("RELIEF", 10, .7)]
    for detail, level, strength in details:
        try:
            detail_rgb, weight = sample(detail, latitude, longitude, folder, level)
            # Add luminance detail from NASA's imagery and fixed-light relief.
            # Remove the broad brightness trend to soften regional mosaic seams.
            grey = detail_rgb @ np.array([.2126, .7152, .0722])
            image = Image.fromarray(np.clip(grey, 0, 255).astype(np.uint8))
            smooth = np.asarray(image.filter(ImageFilter.GaussianBlur(9)), dtype=float)
            confidence = np.asarray(
                Image.fromarray(np.rint(weight * 255).clip(0, 255).astype(np.uint8))
                .filter(ImageFilter.GaussianBlur(4)), dtype=float,
            ) / 255
            blend = np.minimum(confidence, weight) * strength
            if detail == "PSR":
                # The shadow mosaic covers dark ground. Avoid replacing
                # already illuminated pixels from the camera mosaic.
                blend *= np.clip((105 - rgb.mean(axis=-1)) / 55, 0, 1)
            if detail in ("RELIEF", "IM1", "IM1_NAC"):
                enhanced = 0.55 * grey + 0.45 * 128 + np.clip(grey - smooth, -45, 45) * .8
            else:
                enhanced = grey + np.clip(grey - smooth, -40, 40) * .6
            blend = np.where(coverage > .05, blend, weight)
            rgb = rgb * (1-blend[..., None]) + enhanced[..., None] * blend[..., None]
            coverage = np.maximum(coverage, blend)
        except (OSError, ValueError):
            pass  # The broad WAC mosaic remains available.
    if projection != "EQ" and np.any(coverage < .5):
        fallback, fallback_coverage = sample("EQ", latitude, longitude, folder, 4)
        missing = coverage < .5
        rgb[missing] = fallback[missing]
        coverage[missing] = fallback_coverage[missing]
    if not np.any(coverage > .5):
        raise ValueError("Moon Trek imagery does not cover this site")
    # Camera images contain lighting from their acquisition. Preserve image
    # contrast but limit deep baked shadows before applying the scene lighting.
    rgb = np.where(coverage[..., None] > .05, rgb, 135)
    grey = rgb @ np.array([.2126, .7152, .0722])
    return Image.fromarray(np.rint(32 + grey * .84).clip(0, 255).astype(np.uint8))


if __name__ == "__main__":
    latitude, longitude, width = map(float, sys.argv[1:4])
    destination, folder = map(Path, sys.argv[4:6])
    folder.mkdir(parents=True, exist_ok=True)
    texture(latitude, longitude, width, folder).save(destination, "JPEG", quality=88, optimize=True)
