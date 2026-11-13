"""Install NASA PGDA's 5 m Shackleton rim DEM from its original GeoTIFF."""
import argparse
import hashlib
import json
from pathlib import Path

from lunar_terrain import ROOT

URL = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif"
SOURCE_SHA256 = "38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758"


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def install(path):
    import rasterio

    if digest(path) != SOURCE_SHA256:
        raise ValueError("GeoTIFF does not match the verified NASA Site04 source")
    out = ROOT / "data/raw"
    out.mkdir(parents=True, exist_ok=True)
    grid = out / "site04.f32"
    temp = grid.with_suffix(".tmp")
    with rasterio.open(path) as ds:
        if (ds.shape != (3200, 3200) or ds.transform.a != 5 or ds.transform.e != -5
                or ds.transform.b != 0 or ds.transform.d != 0):
            raise ValueError("Unexpected Site04 GeoTIFF grid")
        ds.read(1).astype("<f4").tofile(temp)
        record = {
            "product": "site04", "name": "Shackleton rim adjusted LOLA", "url": URL,
            "sourceSha256": SOURCE_SHA256, "sha256": digest(temp), "rows": ds.height,
            "cols": ds.width, "mapScaleM": ds.transform.a,
            "westM": ds.bounds.left, "northM": ds.bounds.top,
        }
    temp.replace(grid)
    manifest = out / "lola-regional-site04.json"
    tmp_manifest = manifest.with_suffix(".tmp")
    tmp_manifest.write_text(json.dumps([record], indent=2))
    tmp_manifest.replace(manifest)
    print("Installed NASA PGDA Shackleton rim 5 m elevation grid")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geotiff", type=Path, help="Original Site04 GeoTIFF from " + URL)
    install(parser.parse_args().geotiff)
