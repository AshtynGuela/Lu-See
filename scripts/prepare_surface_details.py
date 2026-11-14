"""Crop registered NASA/PDS terrain and orthophotos for browser rendering."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio

from lunar_terrain import RADIUS, bilinear, forward
from surface_imagery import BASE, LAYERS, sample

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/surface-details"
ARCHIVE = ("https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/"
           "pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/")
CROP_M = 512
PRODUCTS = {
    "apollo11": ("APOLLO11", ["M150368601_50CM", "M150361817_50CM"]),
    "apollo12": ("APOLLO12", ["M120005333_50CM"]),
    "apollo14": ("APOLLO14", ["M150633128_50CM", "M150639913_50CM"]),
    "apollo15": ("APOLLO15", ["M111571816_50CM", "M111578606_50CM"]),
    "apollo16": ("APOLLO16", ["MOSAIC_50CM"]),
    "apollo17": ("APOLLO17", ["MOSAIC_120CM"]),
    "change6": ("CHANGE6", ["M1487705442_110CM", "M1487691414_110CM"]),
    "change4": ("CHANGE4", ["M1303619844_140CM", "M1303640934_140CM"]),
    "chandrayaan3": ("VIKRAMSITE1", ["M1442997156_100CM", "M1443025251_100CM"]),
    "blueghost1": ("CRISHORSE", ["MOSAIC_110CM"]),
    "slim": ("THEOPHILUS", ["MOSAIC_90CM"]),
}


PGDA = "https://pgda.gsfc.nasa.gov/data/"
PGDA_CREDIT = "https://pgda.gsfc.nasa.gov/products/90"
SHACKLETON = "https://pds.shadowcam.im-ldi.com/derived/dtm/shackleton1_p896s1181/"
MOUTON = ARCHIVE + ("EXTRAS/BROWSE/NAC_ROI/MOUTNPLTLO1/"
                    "NAC_ROI_MOUTNPLTLO1_P843S0306.PYR.TIF")
POLAR_PRODUCTS = {
    "im1": {
        "elevation": PGDA + "LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF",
        "texture": "IM1_NAC", "extent": 512,
        "terrainSource": "LOLA", "imagerySource": "Moon Trek NAC",
        "sourceUrl": PGDA_CREDIT,
    },
    "im2": {
        "elevation": PGDA + "LOLA_20mpp/LDEM_83S_10MPP_ADJ.TIF",
        "texture": MOUTON, "extent": 1024,
        "terrainSource": "LOLA", "imagerySource": "LROC",
        "sourceUrl": "https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_MOUTNPLTLO1",
    },
    "shackleton": {
        "elevation": SHACKLETON + "shadowcam_dtm_shackleton1_p896s1181_dtm_6m_cog.tif",
        "texture": SHACKLETON + "shadowcam_dtm_shackleton1_p896s1181_orthomosaic_190cm_cog.tif",
        "extent": 1024,
        "terrainSource": "ShadowCam stereo", "imagerySource": "ShadowCam",
        "sourceUrl": SHACKLETON,
    },
}



def coordinates(axis, site, reverse=False):
    east, north = np.meshgrid(axis, axis[::-1] if reverse else axis)
    return forward(site["lat"], site["lon"], np.arctan2(east, north), np.hypot(east, north))


def read_crop(url, site, is_photo, local=None, extent=CROP_M):
    with rasterio.open(local if local and local.is_file() else "/vsicurl/" + url) as source:
        definition = source.crs.to_dict()
        if definition.get("proj") not in ("eqc", "stere") or definition.get("R", definition.get("a")) != RADIUS:
            raise ValueError(f"Unexpected lunar projection: {source.crs}")
        native = round(abs(source.transform.a), 6)
        intervals = int(extent / native)
        if is_photo:
            intervals = min(1024, intervals)
            step = extent / intervals
            axis = (np.arange(intervals) + .5) * step - extent / 2
        else:
            intervals -= intervals % 2
            axis = np.linspace(-extent / 2, extent / 2, intervals + 1)
        lat, lon = coordinates(axis, site, reverse=is_photo)
        angle = np.radians(lon - definition.get("lon_0", 0))
        if definition["proj"] == "eqc":
            scale = RADIUS * np.cos(np.radians(definition.get("lat_ts", 0)))
            origin = (source.bounds.left + source.bounds.right) / 2 - definition.get("x_0", 0)
            period = 2 * np.pi * scale
            east = origin + (angle * scale - origin + period / 2) % period - period / 2
            north = np.radians(lat - definition.get("lat_0", 0)) * RADIUS
        else:
            pole = definition.get("lat_0")
            standard = definition.get("lat_ts", pole)
            if pole not in (-90, 90):
                raise ValueError("Expected a polar lunar stereographic projection")
            sign = pole / 90
            rho = RADIUS * (1 + np.sin(np.radians(sign * standard))) * np.tan(np.radians(90 - sign * lat) / 2)
            east, north = rho * np.sin(angle), -sign * rho * np.cos(angle)
        east += definition.get("x_0", 0)
        north += definition.get("y_0", 0)
        col, row = (~source.transform) * (east, north)
        left, top = int(np.floor(col.min())) - 2, int(np.floor(row.min())) - 2
        right, bottom = int(np.ceil(col.max())) + 2, int(np.ceil(row.max())) + 2
        if left < 0 or top < 0 or right > source.width or bottom > source.height:
            raise ValueError("Crop exceeds NASA product coverage")
        pixels = source.read(1, window=rasterio.windows.Window(left, top, right-left, bottom-top),
                             masked=True).astype(np.float64).filled(np.nan)
        result = bilinear(pixels, col-left-.5, row-top-.5)
        if not np.isfinite(result).all():
            raise ValueError("NASA product has missing pixels inside the crop")
        return result, native


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(site_id):
    site = json.loads((ROOT / f"public/data/{site_id}.json").read_text())
    cache = ROOT / ".cache" / site_id
    if site_id in POLAR_PRODUCTS:
        source = POLAR_PRODUCTS[site_id]
        dtm = source["elevation"]
        extent = source["extent"]
        elevations, elevation_spacing = read_crop(dtm, site, False, cache / "elevation.tif", extent)
        photo = source["texture"]
        if photo == "IM1_NAC":
            region, product, _, level = LAYERS[photo]
            image_spacing = 30578404.0178571 * .00028 / 2 ** level
            count = int(extent / image_spacing)
            axis = ((np.arange(count) + .5) / count - .5) * extent
            lat, lon = coordinates(axis, site, reverse=True)
            tile_cache = cache / "tiles"
            tile_cache.mkdir(parents=True, exist_ok=True)
            rgb, alpha = sample(photo, lat, lon, tile_cache)
            if np.any(alpha < .99):
                raise ValueError("Moon Trek orthomosaic has missing pixels inside the crop")
            pixels = rgb @ np.array([.2126, .7152, .0722])
            photo = f"{BASE}/{region}/{product}/1.0.0/WMTSCapabilities.xml"
            texture_label = f"{product} at level {level}"
        else:
            pixels, image_spacing = read_crop(photo, site, True, cache / "ortho.tif", extent)
            texture_label = photo.rsplit("/", 1)[-1]
        return write_patch(site_id, site, elevations, elevation_spacing, pixels, image_spacing,
                           dtm, photo, texture_label, source, extent)

    product, images = PRODUCTS[site_id]
    dtm = ARCHIVE + f"DATA/SDP/NAC_DTM/{product}/NAC_DTM_{product}.TIF"
    elevations, elevation_spacing = read_crop(dtm, site, False, cache / "elevation.tif")
    for image in images:
        photo = ARCHIVE + f"EXTRAS/BROWSE/NAC_DTM/{product}/NAC_DTM_{product}_{image}.TIF"
        try:
            pixels, image_spacing = read_crop(photo, site, True, cache / "ortho.tif")
            break
        except (ValueError, rasterio.errors.RasterioError) as error:
            print(f"{site_id} {image}: {error}", flush=True)
    else:
        raise ValueError(f"No complete orthophoto crop for {site_id}")
    source = {
        "terrainSource": "LROC", "imagerySource": "LROC",
        "sourceUrl": f"https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_{product}",
    }
    return write_patch(site_id, site, elevations, elevation_spacing, pixels, image_spacing,
                       dtm, photo, image, source)


def write_patch(site_id, site, elevations, elevation_spacing, pixels, image_spacing,
                dtm, photo, texture_label, source, extent=CROP_M):
    folder = OUT / site_id
    size = elevations.shape[0]
    center = elevations[size // 2, size // 2]
    lo, hi = np.percentile(pixels, [1, 99])
    if hi <= lo:
        raise ValueError(f"Orthophoto lacks usable contrast at {site_id}")

    # Keep the source relief at 1 cm precision relative to the landing point.
    # The view applies this relative relief to the existing LOLA site elevation.
    values = np.rint((elevations - center) * 100)
    if np.abs(values).max() > 32767:
        raise ValueError("Crop relief exceeds signed 16-bit storage")
    folder.mkdir(parents=True, exist_ok=True)
    mesh = folder / "relief.bin"
    mesh.write_bytes(gzip.compress(values.astype("<i2").tobytes(), mtime=0))
    rendered = np.rint(38 + 188 * np.clip((pixels - lo) / (hi - lo), 0, 1)).astype(np.uint8)
    texture = folder / "surface.webp"
    Image.fromarray(rendered).save(texture, "WEBP", quality=86, method=6)
    provenance = {
        "site": site_id, "lat": site["lat"], "lon": site["lon"],
        "extentM": extent, "samples": size,
        "elevationSpacingM": elevation_spacing, "imagerySpacingM": image_spacing,
        "renderElevationSpacingM": round(extent / (size - 1), 6),
        "renderImagerySpacingM": round(extent / pixels.shape[0], 6),
        "dtm": {"url": dtm},
        "terrainSource": source["terrainSource"],
        "imagerySource": source["imagerySource"],
        "sourceUrl": source["sourceUrl"],
        "orthophoto": {"url": photo},
        "relief": "int16 little endian, centimetres relative to DTM centre, south to north",
        "texture": f"{texture_label}, percentile stretch, north at top",
        "sourceCenterElevationM": round(float(center), 3),
        "meshBytes": mesh.stat().st_size, "textureBytes": texture.stat().st_size,
        "meshSha256": sha256(mesh), "textureSha256": sha256(texture),
    }
    if site_id == "apollo12":
        provenance["surveyor3Coordinates"] = "https://lroc.im-ldi.com/images/938"
    (folder / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"{site_id}: {size}x{size} samples, {mesh.stat().st_size + texture.stat().st_size:,} bytes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sites", nargs="+", choices=(*PRODUCTS, *POLAR_PRODUCTS))
    with rasterio.Env(GDAL_HTTP_TIMEOUT=35, GDAL_HTTP_MAX_RETRY=2, GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        for site_id in parser.parse_args().sites:
            prepare(site_id)
    catalogue = [json.loads(path.read_text()) for path in sorted(OUT.glob("*/provenance.json"))]
    keys = ("site", "lat", "lon", "extentM", "samples", "elevationSpacingM", "imagerySpacingM",
            "terrainSource", "imagerySource", "sourceUrl")
    for item in catalogue:
        item.setdefault("terrainSource", "LROC")
        item.setdefault("imagerySource", "LROC")
        item.setdefault("sourceUrl", item.get("lroc"))
    (ROOT / "src/surface-detail-catalog.json").write_text(
        json.dumps([{key: item[key] for key in keys} for item in catalogue], indent=2) + "\n"
    )


if __name__ == "__main__":
    main()

