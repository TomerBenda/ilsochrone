import json
import struct

import numpy as np

from graph_pipeline import binfmt


def _mini_arrays():
    # 3 nodes in a line, 2 undirected edges, straight-line geometry.
    return binfmt.GraphArrays(
        node_lng=np.array([34.78, 34.781, 34.782]),
        node_lat=np.array([32.08, 32.08, 32.08]),
        csr_offsets=np.array([0, 1, 3, 4], dtype=np.uint32),
        csr_targets=np.array([1, 0, 2, 1], dtype=np.uint32),
        csr_time_cs=np.array([6000, 6000, 7000, 7000], dtype=np.uint32),
        csr_geom_ref=np.array([0 << 1 | 0, 0 << 1 | 1, 1 << 1 | 0, 1 << 1 | 1], dtype=np.uint32),
        geom_offsets=np.array([0, 2, 4], dtype=np.uint32),
        geom_lng=np.array([34.78, 34.781, 34.781, 34.782]),
        geom_lat=np.array([32.08, 32.08, 32.08, 32.08]),
    )


def test_round_trip(tmp_path):
    out = tmp_path / "mini.bin"
    meta = binfmt.write_asset(_mini_arrays(), {"profile": "walk-v1", "osmSnapshot": "2026-07-19"}, out)
    raw = out.read_bytes()
    assert raw[:8] == b"ILSOWALK"
    version, meta_len = struct.unpack_from("<II", raw, 8)
    assert version == 1
    assert json.loads(raw[16:16 + meta_len]) == meta
    assert meta["counts"] == {"nodes": 3, "directedEdges": 4, "undirectedEdges": 2, "geometryPoints": 4}

    parsed = binfmt.read_asset(out)
    assert parsed.meta == meta
    np.testing.assert_allclose(parsed.node_lng, [34.78, 34.781, 34.782], atol=1e-5)
    np.testing.assert_allclose(parsed.node_lat, [32.08, 32.08, 32.08], atol=1e-5)
    np.testing.assert_array_equal(parsed.csr_offsets, [0, 1, 3, 4])
    np.testing.assert_array_equal(parsed.csr_time_cs, [6000, 6000, 7000, 7000])
    np.testing.assert_array_equal(parsed.geom_offsets, [0, 2, 4])
    np.testing.assert_allclose(parsed.geom_lng, [34.78, 34.781, 34.781, 34.782], atol=1e-5)


def test_sections_are_8_byte_aligned(tmp_path):
    out = tmp_path / "mini.bin"
    binfmt.write_asset(_mini_arrays(), {"profile": "walk-v1", "osmSnapshot": "x"}, out)
    offsets = binfmt.section_offsets(out.read_bytes())
    assert all(off % 8 == 0 for off in offsets.values())
