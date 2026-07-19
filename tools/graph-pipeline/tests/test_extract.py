"""Extraction tests — run entirely offline on the committed tiny fixture."""
import osmium

from graph_pipeline.extract import extract_walk_network


class _Counter(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = 0
        self.ways = 0
        self.highways = set()

    def node(self, n):
        self.nodes += 1

    def way(self, w):
        self.ways += 1
        if "highway" in w.tags:
            self.highways.add(w.tags["highway"])


def test_fixture_parses_with_osmium(fixture_pbf):
    h = _Counter()
    h.apply_file(str(fixture_pbf))
    assert h.nodes == 24
    assert h.ways == 13  # 3 horizontal + 4 vertical + ways 301-306
    assert {"residential", "footway", "steps", "motorway"} <= h.highways


def test_filters_walkability(fixture_pbf):
    nodes, edges = extract_walk_network(fixture_pbf, bbox=None)
    highways = set(edges["highway"])
    assert "motorway" not in highways
    assert {"residential", "footway", "steps"} <= highways
    # foot=no footway (way 304) excluded: no edge touches osmids 19/20
    used = set(edges["u"]).union(edges["v"])
    assert not {19, 20} & used
    # access=private service (way 305) excluded
    assert not {21, 22} & used
    # island way 306 survives extraction (pruned later, in build)
    assert {23, 24} <= used
    # nodes frame covers exactly the used ids
    assert set(nodes["id"]) == used


def test_bbox_clip(fixture_pbf):
    # bbox excluding everything east of col 1 keeps only a sliver
    nodes, edges = extract_walk_network(fixture_pbf, bbox=(34.7795, 32.0795, 34.7805, 32.0825))
    used = set(edges["u"]).union(edges["v"])
    assert used and used <= {1, 5, 9}
