"""Tests for NTP offset tracking."""
import time

import ntp_sync
from ntp_sync import sync_time, get_local_time_ms


class TestOffset:
    def setup_method(self):
        ntp_sync._offset_ms = 0.0

    def test_offset_applied_to_local_time(self, monkeypatch):
        # NTP says we are 5 seconds ahead of the system clock
        monkeypatch.setattr(
            ntp_sync, "get_ntp_time", lambda server="x": time.time() * 1000 + 5000
        )
        sync_time("mock")
        drift = get_local_time_ms() - time.time() * 1000
        assert 4900 < drift < 5100

    def test_offset_kept_when_ntp_unreachable(self, monkeypatch):
        ntp_sync._offset_ms = 1234.0
        monkeypatch.setattr(ntp_sync, "get_ntp_time", lambda server="x": None)
        sync_time("mock")
        drift = get_local_time_ms() - time.time() * 1000
        assert 1100 < drift < 1400

    def test_no_offset_without_sync(self):
        drift = get_local_time_ms() - time.time() * 1000
        assert abs(drift) < 100
