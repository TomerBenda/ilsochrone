"""Extraction tests — run entirely offline on the committed tiny fixture."""
import osmium


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
