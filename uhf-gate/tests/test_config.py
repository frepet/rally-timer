"""Tests for gate configuration: validation and UUID persistence."""
from config import Config


def make_config(tmp_path, **env):
    import os

    for k, v in env.items():
        os.environ[k] = str(v)
    try:
        c = Config()
    finally:
        for k in env:
            os.environ.pop(k, None)
    c.uuid_file = tmp_path / ".gate_uuid"
    c.key_file = tmp_path / ".gate_key"
    return c


class TestValidation:
    def test_positive_rssi_threshold_is_flagged(self, tmp_path):
        # RSSI is negative dBm; a positive threshold silently rejects every
        # read (the .env.example=200 trap). validate() must warn.
        c = make_config(tmp_path)
        c.rssi_threshold = 200
        warnings = c.validate()
        assert any("rssi" in w.lower() for w in warnings)

    def test_sane_config_has_no_warnings(self, tmp_path):
        c = make_config(tmp_path)
        c.rssi_threshold = -65
        c.epc_chars = 8
        c.dedup_seconds = 2
        assert c.validate() == []

    def test_nonpositive_epc_chars_is_flagged(self, tmp_path):
        c = make_config(tmp_path)
        c.epc_chars = 0
        assert any("epc" in w.lower() for w in c.validate())


class TestIdentityPersistence:
    def test_uuid_is_generated_then_reused(self, tmp_path):
        c = make_config(tmp_path)
        first = c.get_or_create_uuid()
        assert c.uuid_file.exists()
        assert c.get_or_create_uuid() == first  # stable across calls
