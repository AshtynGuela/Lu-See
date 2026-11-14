"""Build Earth orientation residuals from NASA/JPL SPICE kernels."""
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
KERNELS = ROOT / "data/kernels"
OUTPUT = ROOT / "public/assets/planets"
BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
FILES = (
    ("lsk", "naif0012.tls"),
    ("pck", "earth_1962_260806_2126_combined.bpc"),
    ("pck", "earth_000101_270208_261113.bpc"),
)
EPOCH = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
START = datetime(1969, 1, 1, tzinfo=timezone.utc)
END = datetime(2041, 1, 1, tzinfo=timezone.utc)
SCALE = 2_000_000


def earth_residual(time):
    # Remove nominal daily spin so that a six-hour interval resolves the slower
    # precession, nutation, UT1 variation and polar motion in the SPICE data.
    days = (time - EPOCH).total_seconds() / 86400
    spin = 2 * np.pi * ((0.7790572732640 + 1.00273781191135448 * days) % 1)
    rotation = spice.pxform("ITRF93", "J2000", spice.str2et(time.isoformat().replace("+00:00", "")))
    residual = spice.m2q(rotation @ spice.rotate(spin, 3))
    return residual[1:] * (1 if residual[0] >= 0 else -1)


def main():
    sources = []
    for folder, name in FILES:
        kernel = KERNELS / name
        spice.furnsh(str(kernel))
        with kernel.open("rb") as stream:
            sources.append({"url": BASE + folder + "/" + name, "sha256": hashlib.file_digest(stream, "sha256").hexdigest()})
    step = timedelta(hours=6)
    count = (END - START) // step + 1
    epochs = [START + step * i for i in range(count)]
    leap_dates = json.loads((ROOT / "engine/leap-seconds.json").read_text())
    # A leap second is absent from JS time. Sample just before midnight as
    # well as after it, so interpolation stays on the correct side.
    for day in leap_dates:
        midnight = datetime.fromisoformat(day).replace(tzinfo=timezone.utc)
        epochs.append(midnight - timedelta(milliseconds=1))
    xyz = np.array([earth_residual(time) for time in epochs])
    encoded = np.rint(xyz * SCALE)
    assert np.max(np.abs(encoded)) <= 32767
    data = gzip.compress(encoded.astype("<i2").tobytes(), mtime=0)
    (OUTPUT / "earth-orientation.bin").write_bytes(data)
    (OUTPUT / "earth-orientation.json").write_text(json.dumps({
        "startUtc": START.isoformat(),
        "endUtc": END.isoformat(),
        "spacingHours": 6,
        "preLeapSamples": leap_dates,
        "count": count,
        "scale": SCALE,
        "frame": "ITRF93 to J2000",
        "encoding": "Gzip, signed little-endian 16-bit residual quaternion x/y/z; w is positive",
        "sources": sources,
        "sha256": hashlib.sha256(data).hexdigest(),
    }, indent=2) + "\n")
    print(f"{len(epochs)} orientation samples in {len(data):,} bytes")


if __name__ == "__main__":
    main()
