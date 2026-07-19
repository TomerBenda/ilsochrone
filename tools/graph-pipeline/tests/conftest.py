from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def fixture_pbf() -> Path:
    pbf = FIXTURES / "tiny.osm.pbf"
    assert pbf.exists(), "run: uv run python tests/make_fixture.py"
    return pbf
