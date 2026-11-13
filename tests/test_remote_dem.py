import concurrent.futures
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from remote_dem import RemoteGrid, decode_ranges, batches, PAGE, fetch_ranges
from lunar_terrain import bilinear


class RemoteDEMTest(unittest.TestCase):
    def test_numeric_samples_interpolation_wrap_and_disk_cache_match_original_grid(self):
        grid = (np.arange(16 * 2048, dtype=np.int32) % 20000 - 10000).astype('<i2').reshape(16, 2048)
        raw = grid.tobytes()
        source = dict(rows=16, cols=2048, url='https://example.test/elevation.img', sha256='test')
        calls = []
        def read(source, ranges):
            calls.append(ranges)
            return {(a,b):raw[a:b+1] for a,b in ranges}
        with tempfile.TemporaryDirectory() as folder:
            remote = RemoteGrid(source, folder, fetcher=read)
            x = np.array([0., 2047.7, -0.2, 1023.3, 0.1])
            y = np.array([0., 7.2, 15.9, 4.2, -0.4])
            np.testing.assert_allclose(bilinear(remote,x,y,True),bilinear(grid,x,y,True),rtol=0,atol=0)
            self.assertTrue(calls)
            remote.db.close()
            def offline(*args): raise AssertionError('Cached elevations must not need a network request')
            cached = RemoteGrid(source, folder, fetcher=offline)
            np.testing.assert_allclose(bilinear(cached,x,y,True),bilinear(grid,x,y,True),rtol=0,atol=0)
            cached.db.close()

    def test_wrong_offsets_truncation_duplicate_missing_and_wrong_product_are_rejected(self):
        self.assertEqual(decode_ranges(b'ab','application/octet-stream','bytes 0-1/4',[(0,1)],4),{(0,1):b'ab'})
        for header, body, expected, total in [('bytes 0-1/4',b'a',[(0,1)],4),
            ('bytes 1-2/4',b'ab',[(0,1)],4),('bytes 0-1/5',b'ab',[(0,1)],4),
            ('',b'ab',[(0,1)],4),('bytes 0-1/4',b'ab',[(0,1),(2,3)],4)]:
            with self.assertRaises(ValueError): decode_ranges(body,'application/octet-stream',header,expected,total)
        body=b'--test\r\nContent-Range: bytes 0-1/4\r\n\r\nab\r\n--test\r\nContent-Range: bytes 2-3/4\r\n\r\ncd\r\n--test--\r\n'
        self.assertEqual(decode_ranges(body,'multipart/byteranges; boundary=test',None,[(0,1),(2,3)],4),{(0,1):b'ab',(2,3):b'cd'})
        nasa = body.replace(b'--test',b'--<archive>')
        self.assertEqual(decode_ranges(nasa,'multipart/byteranges; boundary=<archive>',None,[(0,1),(2,3)],4),{(0,1):b'ab',(2,3):b'cd'})
        with self.assertRaises(ValueError): decode_ranges(body,'multipart/byteranges; boundary=test',None,[(0,1)],4)

    def test_range_batches_preserve_selected_bytes_and_bound_payload(self):
        wanted=list(range(700))+list(range(1000,2300,2))
        result=list(batches(wanted,3000*PAGE))
        actual=[]
        for batch in result:
            self.assertLessEqual(len(batch),128)
            self.assertLessEqual(sum(b-a+1 for a,b in batch),4*1024*1024)
            for a,b in batch: actual.extend(range(a//PAGE,b//PAGE+1))
        self.assertEqual(actual,wanted)


if __name__ == '__main__': unittest.main()
