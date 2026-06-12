"""Tests for the SQLite offline event queue."""
from pathlib import Path

from event_queue import EventQueue


def make_queue(tmp_path: Path) -> EventQueue:
    return EventQueue(tmp_path / "queue.sqlite")


GATE = "11111111-2222-4333-8444-555555555555"


class TestPush:
    def test_push_and_count(self, tmp_path):
        q = make_queue(tmp_path)
        q.push(GATE, "EPC1", 1000, -50)
        q.push(GATE, "EPC2", 2000, None)
        assert q.count_pending() == 2
        assert q.count_total() == 2

    def test_oversized_tag_is_dropped(self, tmp_path):
        q = make_queue(tmp_path)
        assert q.push(GATE, "X" * 100, 1000, -50) == 0
        assert q.count_pending() == 0


class TestSyncLifecycle:
    def test_get_pending_returns_oldest_first(self, tmp_path):
        q = make_queue(tmp_path)
        first = q.push(GATE, "EPC1", 1000, -50)
        q.push(GATE, "EPC2", 2000, -51)
        pending = q.get_pending(limit=1)
        assert len(pending) == 1
        assert pending[0].id == first
        assert pending[0].tag == "EPC1"
        assert pending[0].rssi == -50

    def test_mark_synced_removes_from_pending(self, tmp_path):
        q = make_queue(tmp_path)
        a = q.push(GATE, "EPC1", 1000, -50)
        q.push(GATE, "EPC2", 2000, -51)
        q.mark_synced([a])
        pending = q.get_pending()
        assert [e.tag for e in pending] == ["EPC2"]

    def test_mark_synced_empty_list_is_noop(self, tmp_path):
        q = make_queue(tmp_path)
        q.push(GATE, "EPC1", 1000, -50)
        q.mark_synced([])
        assert q.count_pending() == 1

    def test_purge_removes_only_old_synced(self, tmp_path):
        q = make_queue(tmp_path)
        a = q.push(GATE, "EPC1", 1000, -50)
        q.push(GATE, "EPC2", 2000, -51)
        q.mark_synced([a])
        q.purge_synced(max_age_hours=0)
        # The synced event is gone, the pending one survives
        assert q.count_total() == 1
        assert q.count_pending() == 1

    def test_queue_survives_reopen(self, tmp_path):
        q = make_queue(tmp_path)
        q.push(GATE, "EPC1", 1000, -50)
        q2 = make_queue(tmp_path)
        assert q2.count_pending() == 1
