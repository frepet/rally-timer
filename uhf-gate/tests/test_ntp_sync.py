"""Tests for NTP-anchored time tracking."""
import time

import pytest

import ntp_sync
from ntp_sync import sync_time, get_local_time_ms, is_synced


def _fake_ntp(monkeypatch, ntp_ms):
    monkeypatch.setattr(ntp_sync, "get_ntp_time", lambda server="x": ntp_ms)


class TestSyncState:
    def setup_method(self):
        ntp_sync.reset()

    def test_not_synced_initially(self):
        assert not is_synced()

    def test_get_local_time_raises_before_first_sync(self):
        with pytest.raises(ntp_sync.NotSyncedError):
            get_local_time_ms()

    def test_failed_sync_leaves_unsynced(self, monkeypatch):
        _fake_ntp(monkeypatch, None)
        assert sync_time("mock") is None
        assert not is_synced()

    def test_implausible_ntp_reply_rejected(self, monkeypatch):
        _fake_ntp(monkeypatch, 5000.0)  # 1970
        assert sync_time("mock") is None
        assert not is_synced()

    def test_sync_marks_synced_and_uses_ntp_time(self, monkeypatch):
        target = time.time() * 1000 + 5000
        _fake_ntp(monkeypatch, target)
        sync_time("mock")
        assert is_synced()
        assert abs(get_local_time_ms() - target) < 100

    def test_failed_resync_keeps_previous_anchor(self, monkeypatch):
        target = time.time() * 1000 + 5000
        _fake_ntp(monkeypatch, target)
        sync_time("mock")
        _fake_ntp(monkeypatch, None)
        sync_time("mock")
        assert is_synced()
        assert abs(get_local_time_ms() - target) < 100


class TestClockJumps:
    def setup_method(self):
        ntp_sync.reset()

    def test_small_backward_correction_is_clamped(self, monkeypatch):
        now = time.time() * 1000
        _fake_ntp(monkeypatch, now)
        sync_time("mock")
        base = get_local_time_ms()
        # Re-sync says we were 1s fast: emitted time must not go backwards.
        _fake_ntp(monkeypatch, now - 1000)
        sync_time("mock")
        assert get_local_time_ms() >= base

    def test_large_backward_correction_is_not_frozen(self, monkeypatch):
        """Regression: a gate whose clock was 6 days ahead froze at the old
        future timestamp after the correction, collapsing every pass into one
        row server-side."""
        now = time.time() * 1000
        _fake_ntp(monkeypatch, now + 6 * 86400 * 1000)
        sync_time("mock")
        get_local_time_ms()
        _fake_ntp(monkeypatch, now)
        sync_time("mock")
        a = get_local_time_ms()
        time.sleep(0.02)
        b = get_local_time_ms()
        assert abs(a - now) < 1000
        assert b > a

    def test_system_clock_step_does_not_affect_time(self, monkeypatch):
        now = time.time() * 1000
        _fake_ntp(monkeypatch, now)
        sync_time("mock")
        before = get_local_time_ms()
        real_time = time.time
        monkeypatch.setattr(time, "time", lambda: real_time() + 500000)
        assert abs(get_local_time_ms() - before) < 100

    def test_monotonic_under_rapid_calls(self, monkeypatch):
        _fake_ntp(monkeypatch, time.time() * 1000)
        sync_time("mock")
        prev = get_local_time_ms()
        for _ in range(1000):
            now = get_local_time_ms()
            assert now >= prev
            prev = now
