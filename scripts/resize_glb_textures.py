"""Resize embedded PNGs in a single-buffer GLB, preserving all glTF bindings."""
from io import BytesIO
import json
from pathlib import Path
import struct
import sys

from PIL import Image


def resize(path, destination, max_size):
    glb = path.read_bytes()
    magic, version, length, json_size, json_type = struct.unpack_from("<4s4I", glb)
    if magic != b"glTF" or version != 2 or length != len(glb) or json_type != 0x4E4F534A:
        raise ValueError("Expected a glTF 2.0 binary file")
    model = json.loads(glb[20:20 + json_size])
    binary_offset = 28 + json_size
    binary_size, binary_type = struct.unpack_from("<2I", glb, binary_offset - 8)
    if len(model["buffers"]) != 1 or binary_type != 0x004E4942 or binary_offset + binary_size != length:
        raise ValueError("Expected one embedded binary buffer")

    image_views = {image["bufferView"] for image in model["images"] if image["mimeType"] == "image/png"}
    binary = bytearray()
    for index, view in enumerate(model["bufferViews"]):
        if view.get("extensions"):
            raise ValueError("Resize images before applying Meshopt compression")
        start = binary_offset + view.get("byteOffset", 0)
        data = glb[start:start + view["byteLength"]]
        if index in image_views:
            with Image.open(BytesIO(data)) as image:
                if max(image.size) > max_size:
                    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                    output = BytesIO()
                    image.save(output, format="PNG", optimize=True)
                    data = output.getvalue()
        view["byteOffset"] = len(binary)
        view["byteLength"] = len(data)
        binary.extend(data)
        binary.extend(bytes(-len(binary) % 4))

    model["buffers"][0]["byteLength"] = len(binary)
    metadata = json.dumps(model, separators=(",", ":")).encode()
    metadata += b" " * (-len(metadata) % 4)
    header = struct.pack("<4s4I", b"glTF", 2, 28 + len(metadata) + len(binary), len(metadata), json_type)
    destination.write_bytes(header + metadata + struct.pack("<2I", len(binary), binary_type) + binary)


if __name__ == "__main__":
    resize(Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]))
