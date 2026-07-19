import numpy as np

from graph_pipeline.build import build_graph_arrays
from graph_pipeline.extract import extract_walk_network


def _arrays(fixture_pbf):
    nodes, edges = extract_walk_network(fixture_pbf, bbox=None)
    return build_graph_arrays(nodes, edges)


def test_counts_and_pruning(fixture_pbf):
    arrays, stats = _arrays(fixture_pbf)
    # Kept: 12 grid nodes + steps endpoint (13) + dead-end endpoint (16) = 14.
    # Nodes 14, 15 merge away (degree-2, same highway); island 23/24 pruned.
    assert stats["nodes"] == 14
    # 9 horizontal segments + 8 vertical + 1 steps + 1 merged dead-end = 19.
    assert stats["undirected_edges"] == 19
    assert len(arrays.csr_targets) == 38  # 2 per undirected edge
    assert arrays.csr_offsets[-1] == 38


def test_dead_end_chain_merged_with_geometry(fixture_pbf):
    arrays, _ = _arrays(fixture_pbf)
    pts_per_edge = np.diff(arrays.geom_offsets)
    # the merged dead-end edge keeps its interior shape points: 4-point polyline
    assert pts_per_edge.max() == 4
    assert (pts_per_edge >= 2).all()


def test_steps_slower_than_residential(fixture_pbf):
    arrays, _ = _arrays(fixture_pbf)
    # steps edge (~100 m at 3 km/h -> ~120 s); grid vertical footway (~100 m at 5 km/h -> ~72 s)
    times_s = arrays.csr_time_cs / 100.0
    assert ((times_s > 110) & (times_s < 130)).any(), "no steps-speed edge found"
    assert ((times_s > 65) & (times_s < 80)).any(), "no default-speed ~100 m edge found"


def test_deterministic(fixture_pbf):
    a1, _ = _arrays(fixture_pbf)
    a2, _ = _arrays(fixture_pbf)
    np.testing.assert_array_equal(a1.csr_targets, a2.csr_targets)
    np.testing.assert_array_equal(a1.csr_time_cs, a2.csr_time_cs)
    np.testing.assert_allclose(a1.geom_lng, a2.geom_lng)
