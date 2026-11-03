import json
from pathlib import Path

import pytest


@pytest.fixture
def real_payload():
    """Measured first 300 s of NASA B0046 discharge 25, previous history only."""
    return json.loads((Path(__file__).parent / "fixtures/B0046_cycle25.json").read_text(encoding="utf-8"))
