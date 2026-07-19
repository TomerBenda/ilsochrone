"""Writes tests/fixtures/tiny.osm.pbf — a deterministic few-block walk network.

Run manually when the layout changes: uv run python tests/make_fixture.py
Layout doc lives in the implementation plan and test comments; keep them in sync.
"""
from pathlib import Path

import osmium

OUT = Path(__file__).parent / "fixtures" / "tiny.osm.pbf"

B_LNG, B_LAT, D = 34.7800, 32.0800, 0.0009


def build() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    writer = osmium.SimpleWriter(str(OUT))

    def node(nid: int, lng: float, lat: float) -> None:
        writer.add_node(osmium.osm.mutable.Node(id=nid, location=(lng, lat)))

    def way(wid: int, refs: list[int], tags: dict[str, str]) -> None:
        writer.add_way(osmium.osm.mutable.Way(id=wid, nodes=refs, tags=list(tags.items())))

    # 3x4 grid, osmid = 1 + r*4 + c
    for r in range(3):
        for c in range(4):
            node(1 + r * 4 + c, B_LNG + c * D, B_LAT + r * D)
    node(13, B_LNG + 3 * D, B_LAT - D)        # steps endpoint
    node(14, B_LNG + 4 * D, B_LAT + D)        # dead-end chain (merge away)
    # Node 15 is offset north so the merged polyline is NOT collinear —
    # otherwise Douglas-Peucker (correctly) strips the interior points and
    # geometry preservation through the merge would be untestable.
    node(15, B_LNG + 5 * D, B_LAT + D + 0.0003)  # dead-end chain (merge away)
    node(16, B_LNG + 6 * D, B_LAT + D)        # dead-end endpoint
    node(17, B_LNG - D, 32.0780)              # motorway (excluded)
    node(18, B_LNG + D, 32.0780)
    node(19, 34.7830, 32.0770)                # foot=no (excluded)
    node(20, 34.7839, 32.0770)
    node(21, 34.7850, 32.0770)                # access=private (excluded)
    node(22, 34.7859, 32.0770)
    node(23, 34.7872, 32.0872)                # disconnected island (pruned)
    node(24, 34.7881, 32.0872)

    for r in range(3):                        # horizontal residential rows
        way(101 + r, [1 + r * 4 + c for c in range(4)], {"highway": "residential"})
    for c in range(4):                        # vertical footway cols
        way(201 + c, [1 + c, 5 + c, 9 + c], {"highway": "footway"})
    way(301, [4, 13], {"highway": "steps"})
    way(302, [8, 14, 15, 16], {"highway": "residential"})
    way(303, [17, 18], {"highway": "motorway"})
    way(304, [19, 20], {"highway": "footway", "foot": "no"})
    way(305, [21, 22], {"highway": "service", "access": "private"})
    way(306, [23, 24], {"highway": "footway"})

    writer.close()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
