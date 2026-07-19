# graph-pipeline

Build-time tool: converts an OSM extract into the versioned binary walk-graph
asset consumed by `packages/engine`. Never deployed. See
`docs/reference/graph-asset-format.md` for the binary contract.

## Usage

    uv run build-graph              # full build: download Israel extract (cached), emit apps/web/assets/graphs/walk-tlv.v1.bin
    uv run build-graph --fixture    # build the tiny test asset for packages/engine
    uv run pytest                   # pipeline tests (offline, run on the committed tiny fixture)

Regenerate the tiny OSM fixture (only when the layout changes):

    uv run python tests/make_fixture.py
