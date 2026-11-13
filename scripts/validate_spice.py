"""Compute independent topocentric SPICE directions and compare to app samples."""
import hashlib
import json
import math
from pathlib import Path
import sys
from urllib.request import urlretrieve

import spiceypy as spice

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNELS = {
    "spk/planets/de440s.bsp": 32726016,
    "pck/moon_pa_de440_200625.bpc": 12863488,
    "fk/satellites/moon_de440_250416.tf": None,
    "lsk/naif0012.tls": None,
}


def unit(az, el):
    az, el = math.radians(az), math.radians(el)
    return math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)


def compare(case):
    lat, lon = math.radians(case["lat"]), math.radians(case["lon"])
    east = -math.sin(lon), math.cos(lon), 0
    north = -math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)
    up = math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)
    altitude_km = (case["elevationM"] + case["mastM"]) / 1000
    position = [(1737.4 + altitude_km) * component for component in up]
    frame = "MOON_ME"
    samples = []
    for sample in case["samples"]:
        et = spice.str2et(sample["utc"])
        state, _ = spice.spkcpo(case["body"].upper(), et, frame, "OBSERVER",
                                "CN+S", position, "MOON", frame)
        e, n, u = (math.fsum(a * b for a, b in zip(axis, state[:3])) for axis in (east, north, up))
        az = math.degrees(math.atan2(e, n)) % 360
        el = math.degrees(math.atan2(u, math.hypot(e, n)))
        distance = math.hypot(e, n, u)
        chord = math.dist(unit(az, el), unit(sample["az"], sample["el"]))
        samples.append({
            "utc": sample["utc"],
            "horizonsAzDeg": sample["az"], "horizonsElDeg": sample["el"],
            "spiceAzDeg": az, "spiceElDeg": el,
            "directionErrorDeg": math.degrees(2 * math.asin(min(1, chord / 2))),
            "rangeDifferenceKm": distance - sample["distanceKm"],
        })
    return {**case, "samples": samples,
            "maxDirectionErrorDeg": max(row["directionErrorDeg"] for row in samples)}


def main():
    inputs = json.load(sys.stdin)
    folder = Path("data/kernels")
    folder.mkdir(exist_ok=True)
    records = []
    try:
        for resource, size in KERNELS.items():
            path = folder / resource.split("/")[-1]
            if not path.exists() or (size is not None and path.stat().st_size != size):
                part = path.with_suffix(".download")
                urlretrieve(BASE + resource, part)
                if size is not None and part.stat().st_size != size:
                    raise ValueError(f"Incomplete NAIF kernel: {path.name}")
                part.replace(path)
            with path.open("rb") as f:
                checksum = hashlib.file_digest(f, "sha256").hexdigest()
            spice.furnsh(str(path.resolve()))
            records.append({"url": BASE + resource, "sha256": checksum})
        results = [compare(case) for case in inputs]
        print(json.dumps({
            "method": "Independent topocentric SPICE DE440s / MOON_ME / CN+S versus interpolated JPL Horizons DE441 airless observer tables. Both use the same LOLA observer elevation and mast. Terrain horizons and photometry are outside this comparison.",
            "spiceToolkit": spice.tkvrsn("TOOLKIT"), "kernels": records,
            "directions": sum(len(row["samples"]) for row in results),
            "maxDirectionErrorDeg": max(row["maxDirectionErrorDeg"] for row in results),
            "results": results,
        }, allow_nan=False))
    finally:
        spice.kclear()


if __name__ == "__main__":
    main()
