"""Binary graph asset writer (+ test-only reader). Contract: docs/reference/graph-asset-format.md."""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .config import SPEEDS_KMH

MAGIC = b"ILSOWALK"
FORMAT_VERSION = 1
_Q = 65535


@dataclass
class GraphArrays:
    node_lng: np.ndarray   # float64 [N]
    node_lat: np.ndarray   # float64 [N]
    csr_offsets: np.ndarray  # uint32 [N+1]
    csr_targets: np.ndarray  # uint32 [D]
    csr_time_cs: np.ndarray  # uint32 [D]
    csr_geom_ref: np.ndarray  # uint32 [D]
    geom_offsets: np.ndarray  # uint32 [U+1]
    geom_lng: np.ndarray   # float64 [G]
    geom_lat: np.ndarray   # float64 [G]


@dataclass
class ParsedAsset:
    meta: dict
    node_lng: np.ndarray
    node_lat: np.ndarray
    csr_offsets: np.ndarray
    csr_targets: np.ndarray
    csr_time_cs: np.ndarray
    csr_geom_ref: np.ndarray
    geom_offsets: np.ndarray
    geom_lng: np.ndarray
    geom_lat: np.ndarray


def _quantize(v: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(np.rint((v - lo) / (hi - lo) * _Q), 0, _Q).astype("<u2")


def _dequantize(q: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return lo + q.astype(np.float64) / _Q * (hi - lo)


def write_asset(arrays: GraphArrays, meta_extra: dict, out_path: Path) -> dict:
    all_lng = np.concatenate([arrays.node_lng, arrays.geom_lng])
    all_lat = np.concatenate([arrays.node_lat, arrays.geom_lat])
    min_lng, max_lng = float(all_lng.min()), float(all_lng.max())
    min_lat, max_lat = float(all_lat.min()), float(all_lat.max())
    if max_lng - min_lng < 1e-9:
        max_lng += 1e-6
    if max_lat - min_lat < 1e-9:
        max_lat += 1e-6

    meta = {
        "formatVersion": FORMAT_VERSION,
        "profile": meta_extra["profile"],
        "osmSnapshot": meta_extra["osmSnapshot"],
        "buildTimestamp": meta_extra.get(
            "buildTimestamp", datetime.now(timezone.utc).isoformat(timespec="seconds")
        ),
        "bbox": [min_lng, min_lat, max_lng, max_lat],
        "counts": {
            "nodes": int(len(arrays.node_lng)),
            "directedEdges": int(len(arrays.csr_targets)),
            "undirectedEdges": int(len(arrays.geom_offsets) - 1),
            "geometryPoints": int(len(arrays.geom_lng)),
        },
        "speeds": {"defaultKmh": SPEEDS_KMH["default"], "stepsKmh": SPEEDS_KMH["steps"]},
    }
    meta_bytes = json.dumps(meta, separators=(",", ":")).encode("utf-8")

    out = bytearray()
    out += MAGIC
    out += struct.pack("<II", FORMAT_VERSION, len(meta_bytes))
    out += meta_bytes

    def emit(arr: np.ndarray) -> None:
        while len(out) % 8:
            out.append(0)
        out.extend(arr.tobytes())

    emit(_quantize(arrays.node_lng, min_lng, max_lng))
    emit(_quantize(arrays.node_lat, min_lat, max_lat))
    emit(arrays.csr_offsets.astype("<u4"))
    emit(arrays.csr_targets.astype("<u4"))
    emit(arrays.csr_time_cs.astype("<u4"))
    emit(arrays.csr_geom_ref.astype("<u4"))
    emit(arrays.geom_offsets.astype("<u4"))
    emit(_quantize(arrays.geom_lng, min_lng, max_lng))
    emit(_quantize(arrays.geom_lat, min_lat, max_lat))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(out))
    return meta


def section_offsets(raw: bytes) -> dict[str, int]:
    """Byte offset of each section start; shared by read_asset and the alignment test."""
    version, meta_len = struct.unpack_from("<II", raw, 8)
    assert raw[:8] == MAGIC, "bad magic"
    assert version == FORMAT_VERSION, f"unsupported version {version}"
    meta = json.loads(raw[16:16 + meta_len])
    n = meta["counts"]["nodes"]
    d = meta["counts"]["directedEdges"]
    u = meta["counts"]["undirectedEdges"]
    g = meta["counts"]["geometryPoints"]
    sizes = [
        ("nodeX", 2 * n), ("nodeY", 2 * n),
        ("csrOffsets", 4 * (n + 1)), ("csrTargets", 4 * d),
        ("csrTimeCs", 4 * d), ("csrGeomRef", 4 * d),
        ("geomOffsets", 4 * (u + 1)),
        ("geomX", 2 * g), ("geomY", 2 * g),
    ]
    offsets: dict[str, int] = {}
    pos = 16 + meta_len
    for name, size in sizes:
        pos = (pos + 7) // 8 * 8
        offsets[name] = pos
        pos += size
    assert pos <= len(raw), "asset truncated"
    return offsets


def read_asset(path: Path) -> ParsedAsset:
    raw = path.read_bytes()
    _, meta_len = struct.unpack_from("<II", raw, 8)
    meta = json.loads(raw[16:16 + meta_len])
    off = section_offsets(raw)
    c = meta["counts"]
    min_lng, min_lat, max_lng, max_lat = meta["bbox"][0], meta["bbox"][1], meta["bbox"][2], meta["bbox"][3]

    def u16(name: str, count: int) -> np.ndarray:
        return np.frombuffer(raw, dtype="<u2", count=count, offset=off[name])

    def u32(name: str, count: int) -> np.ndarray:
        return np.frombuffer(raw, dtype="<u4", count=count, offset=off[name])

    return ParsedAsset(
        meta=meta,
        node_lng=_dequantize(u16("nodeX", c["nodes"]), min_lng, max_lng),
        node_lat=_dequantize(u16("nodeY", c["nodes"]), min_lat, max_lat),
        csr_offsets=u32("csrOffsets", c["nodes"] + 1),
        csr_targets=u32("csrTargets", c["directedEdges"]),
        csr_time_cs=u32("csrTimeCs", c["directedEdges"]),
        csr_geom_ref=u32("csrGeomRef", c["directedEdges"]),
        geom_offsets=u32("geomOffsets", c["undirectedEdges"] + 1),
        geom_lng=_dequantize(u16("geomX", c["geometryPoints"]), min_lng, max_lng),
        geom_lat=_dequantize(u16("geomY", c["geometryPoints"]), min_lat, max_lat),
    )
