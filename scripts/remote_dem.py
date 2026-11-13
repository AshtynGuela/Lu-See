"""Read exact NASA raster samples via bounded HTTP byte ranges, with a disk LRU.

The PDS products remain on NASA's archive. Never accept a full-file response in
place of a range, or derive elevations from visual map tiles.
"""
import concurrent.futures
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import threading
import time

import numpy as np
import requests

PAGE = 512
CACHE = Path(os.environ.get("LUNAR_TERRAIN_CACHE", Path(__file__).resolve().parents[1] / ".cache/terrain"))
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4)
LOCAL = threading.local()


def decode_ranges(body, content_type, content_range, expected, total):
    """Reject wrong offsets, missing parts, full files and truncated samples."""
    parts = []
    if content_type.lower().startswith("multipart/byteranges"):
        # The archive's IIS server uses a <...> boundary that generic email
        # parsers normalize incorrectly. Respect its exact binary delimiter.
        boundary = re.search(r'boundary=(?:"([^"]+)"|([^;\s]+))', content_type, re.I)
        if not boundary:
            raise ValueError("NASA multipart response has no boundary")
        token = boundary.group(1) or boundary.group(2)
        if len(token) > 200 or any(ord(c) < 32 or c in '\r\n"' for c in token):
            raise ValueError("NASA multipart boundary is invalid")
        marker = ('--' + token).encode('ascii')
        position = 0
        while True:
            if body[position:position+len(marker)] != marker:
                raise ValueError("NASA returned an invalid multipart range delimiter")
            position += len(marker)
            if body[position:position+2] == b'--':
                if body[position+2:].strip(b'\r\n'):
                    raise ValueError("Unexpected data after NASA multipart response")
                break
            if body[position:position+2] != b'\r\n':
                raise ValueError("Invalid NASA multipart header")
            header_end = body.find(b'\r\n\r\n', position+2, position+4096)
            if header_end < 0:
                raise ValueError("Truncated NASA multipart headers")
            header = re.search(rb'(?:^|\r\n)Content-Range:\s*(bytes \d+-\d+/\d+)', body[position+2:header_end], re.I)
            if not header:
                raise ValueError("NASA multipart section has no byte coordinates")
            coordinate = header.group(1).decode('ascii')
            a, b, _ = map(int,re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',coordinate).groups())
            begin, end = header_end + 4, header_end + 4 + b - a + 1
            if end > len(body) or body[end:end+2] != b'\r\n':
                raise ValueError("NASA multipart section is truncated")
            parts.append((coordinate, body[begin:end]))
            position = end + 2
    else:
        parts = [(content_range or "", body)]
    result = {}
    for header, payload in parts:
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", header.strip())
        if not match:
            raise ValueError("NASA response has no valid byte coordinates")
        a, b, size = map(int, match.groups())
        if (a, b) not in expected or size != total or (a, b) in result or len(payload) != b - a + 1:
            raise ValueError("NASA range offsets, product size or byte count changed")
        result[(a, b)] = payload
    if set(result) != set(expected):
        raise ValueError("NASA omitted requested elevation sections")
    return result


def fetch_ranges(source, ranges):
    if not hasattr(LOCAL, "session"):
        LOCAL.session = requests.Session()
    headers = {"Range": "bytes=" + ",".join(f"{a}-{b}" for a, b in ranges), "Accept-Encoding": "identity"}
    if source.get("httpEtag") and not source['httpEtag'].startswith('W/'):
        headers["If-Range"] = source["httpEtag"]
    limit = sum(b - a + 1 for a, b in ranges) + len(ranges) * 512 + 2048
    for attempt in range(3):
        try:
            with LOCAL.session.get(source["url"], headers=headers, stream=True, timeout=(10, 45)) as response:
                if response.status_code != 206:
                    raise ValueError(f"NASA range request returned HTTP {response.status_code}; full-file download refused")
                if source.get("httpEtag") and response.headers.get("ETag") != source["httpEtag"]:
                    raise ValueError("NASA dataset version changed; refresh the source metadata")
                body = bytearray()
                for chunk in response.iter_content(65536):
                    body.extend(chunk)
                    if len(body) > limit:
                        raise ValueError("NASA range response exceeded the requested size")
                return decode_ranges(bytes(body), response.headers.get("Content-Type", ""),
                    response.headers.get("Content-Range"), ranges, source.get("byteLength", source["rows"] * source["cols"] * 2))
        except (requests.RequestException, ValueError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def batches(pages, total):
    ranges = []
    for page in sorted(pages):
        a, b = int(page) * PAGE, min((int(page) + 1) * PAGE, total) - 1
        if ranges and a == ranges[-1][1] + 1 and b - ranges[-1][0] < 262144:
            ranges[-1] = (ranges[-1][0], b)
        else:
            ranges.append((a, b))
    batch, size = [], 0
    for span in ranges:
        length = span[1] - span[0] + 1
        if batch and (len(batch) == 320 or size + length > 4 * 1024 * 1024):
            yield batch
            batch, size = [], 0
        batch.append(span)
        size += length
    if batch:
        yield batch


class RemoteGrid:
    def __init__(self, source, cache_dir=None, fetcher=fetch_ranges):
        self.source = source
        self.shape = source["rows"], source["cols"]
        self.fetcher = fetcher
        self.total = self.shape[0] * self.shape[1] * 2
        self.key = hashlib.sha256((source["url"] + source["sha256"] + source.get("httpEtag", "") + str(PAGE)).encode()).hexdigest()
        folder = Path(cache_dir) if cache_dir is not None else CACHE
        folder.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(folder / f"raster-blocks-{PAGE}.sqlite", timeout=30)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS blocks (source TEXT, n INTEGER, data BLOB, used REAL, PRIMARY KEY(source,n))")
        self.db.execute("CREATE INDEX IF NOT EXISTS blocks_used ON blocks(used)")

    def values(self, indices):
        indices = np.asarray(indices, dtype=np.int64)
        if np.any(indices < 0) or np.any(indices >= self.shape[0] * self.shape[1]):
            raise ValueError("Elevation sample is outside the raster")
        flat = indices.ravel()
        page_ids, offsets = flat // (PAGE // 2), flat % (PAGE // 2)
        order = np.argsort(page_ids, kind="stable")
        ordered = page_ids[order]
        unique = np.unique(ordered)
        result = np.empty(len(flat), dtype="<i2")
        per_batch = 4 * 1024 * 1024 // PAGE
        for base in range(0, len(unique), per_batch):
            wanted = [int(n) for n in unique[base:base+per_batch]]
            stored = {}
            for i in range(0, len(wanted), 400):
                group = wanted[i:i+400]
                sql = "SELECT n,data FROM blocks WHERE source=? AND n IN (" + ",".join("?" for _ in group) + ")"
                stored.update(self.db.execute(sql, [self.key, *group]).fetchall())
            missing = set(wanted) - set(stored)
            futures = [POOL.submit(self.fetcher, self.source, batch) for batch in batches(missing, self.total)]
            for future in concurrent.futures.as_completed(futures):
                for (a, b), payload in future.result().items():
                    for page in range(a // PAGE, b // PAGE + 1):
                        data = payload[page * PAGE - a:(page + 1) * PAGE - a]
                        stored[page] = data
            # Never hold a SQLite write lock while waiting for NASA responses.
            now = time.time()
            self.db.executemany("INSERT OR REPLACE INTO blocks VALUES (?,?,?,?)",
                ((self.key, page, stored[page], now) for page in missing))
            matrix = np.zeros((len(wanted), PAGE // 2), dtype="<i2")
            for i, page in enumerate(wanted):
                data = np.frombuffer(stored[page], dtype="<i2")
                matrix[i, :len(data)] = data
            a = np.searchsorted(ordered, wanted[0], side="left")
            b = np.searchsorted(ordered, wanted[-1], side="right")
            locations = order[a:b]
            rows = np.searchsorted(wanted, ordered[a:b])
            result[locations] = matrix[rows, offsets[locations]]
            now = time.time()
            self.db.executemany("UPDATE blocks SET used=? WHERE source=? AND n=?", ((now, self.key, n) for n in wanted))
            self.db.commit()
            # Bound persistent working storage; raw planet-wide files never appear.
            maximum = int(os.environ.get("LUNAR_BLOCK_CACHE_MB", "256")) * 1024 * 1024 // PAGE
            excess = self.db.execute("SELECT COUNT(*) FROM blocks").fetchone()[0] - maximum
            if excess > 0:
                self.db.execute("DELETE FROM blocks WHERE rowid IN (SELECT rowid FROM blocks ORDER BY used LIMIT ?)", (excess,))
                self.db.commit()
        return result.reshape(indices.shape)

    def corners(self, a, b, next_x, next_y):
        cols = self.shape[1]
        return self.values(np.stack([b * cols + a, b * cols + next_x, next_y * cols + a, next_y * cols + next_x]))


def regional_grid(source):
    """Fetch only the small regional source, verify it, and cache numeric heights."""
    from PIL import Image
    folder = CACHE / "regional"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (source["product"] + ".f32")
    expected_size = source["rows"] * source["cols"] * 4
    if not target.is_file() or target.stat().st_size != expected_size:
        temporary = folder / (source["product"] + ".tif.part")
        try:
            length = source['byteLength']
            if not 0 < length < 50 * 1024 * 1024:
                raise ValueError("Regional elevation product exceeded its size limit")
            spans = [(a,min(a+1048576,length)-1) for a in range(0,length,1048576)]
            futures = {POOL.submit(fetch_ranges, source, [span]): span for span in spans}
            with temporary.open('wb') as out:
                out.truncate(length)
                for future in concurrent.futures.as_completed(futures):
                    a,b = futures[future]
                    data = future.result()[(a,b)]
                    out.seek(a);out.write(data)
                    del futures[future]
            with temporary.open('rb') as original:
                digest = hashlib.file_digest(original,'sha256').hexdigest()
            if digest != source["sourceSha256"]:
                raise ValueError("Regional NASA DEM checksum changed")
            with Image.open(temporary) as image:
                grid = np.asarray(image, dtype="<f4")
                if grid.shape != (source["rows"], source["cols"]):
                    raise ValueError("Regional NASA DEM dimensions changed")
                if hashlib.sha256(grid.tobytes()).hexdigest() != source["sha256"]:
                    raise ValueError("Regional height conversion differs from the verified source")
                working = target.with_suffix(".part")
                grid.tofile(working)
                working.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return np.memmap(target, dtype="<f4", mode="r", shape=(source["rows"], source["cols"]))
