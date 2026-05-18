"""SQLite queue for offline event storage."""
import sqlite3
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class QueuedEvent:
    id: int
    gate_id: str
    tag: str
    timestamp_ms: int
    rssi: Optional[int]
    created_at: int
    synced: bool
    synced_at: Optional[int]


class EventQueue:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize the database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gate_id TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    timestamp_ms INTEGER NOT NULL,
                    rssi INTEGER,
                    created_at INTEGER NOT NULL,
                    synced INTEGER DEFAULT 0,
                    synced_at INTEGER
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_pending 
                ON events(synced, created_at)
            """)
    
    MAX_TAG_LEN = 50

    def push(self, gate_id: str, tag: str, timestamp_ms: int, rssi: Optional[int] = None) -> int:
        """Add an event to the queue. Returns the event ID."""
        if len(tag) > self.MAX_TAG_LEN:
            logger.warning(f"Dropping oversized tag ({len(tag)} chars): {tag[:80]!r}")
            return 0
        created_at = int(datetime.now().timestamp() * 1000)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                INSERT INTO events (gate_id, tag, timestamp_ms, rssi, created_at, synced)
                VALUES (?, ?, ?, ?, ?, 0)
            """, (gate_id, tag, timestamp_ms, rssi, created_at))
            return cursor.lastrowid or 0
    
    def get_pending(self, limit: int = 50) -> list[QueuedEvent]:
        """Get pending events that need to be synced."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT * FROM events 
                WHERE synced = 0 
                ORDER BY created_at ASC 
                LIMIT ?
            """, (limit,)).fetchall()
            
            return [
                QueuedEvent(
                    id=row["id"],
                    gate_id=row["gate_id"],
                    tag=row["tag"],
                    timestamp_ms=row["timestamp_ms"],
                    rssi=row["rssi"],
                    created_at=row["created_at"],
                    synced=bool(row["synced"]),
                    synced_at=row["synced_at"]
                )
                for row in rows
            ]
    
    def mark_synced(self, event_ids: list[int]):
        """Mark events as synced."""
        if not event_ids:
            return
        
        synced_at = int(datetime.now().timestamp() * 1000)
        placeholders = ",".join("?" * len(event_ids))
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"""
                UPDATE events SET synced = 1, synced_at = ?
                WHERE id IN ({placeholders})
            """, [synced_at] + event_ids)
    
    def purge_synced(self, max_age_hours: int = 24):
        """Delete old synced events."""
        cutoff = int(datetime.now().timestamp() * 1000) - (max_age_hours * 3600 * 1000)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM events WHERE synced = 1 AND synced_at < ?
            """, (cutoff,))
            
            if cursor.rowcount > 0:
                logger.info(f"Purged {cursor.rowcount} old synced events")
    
    def count_pending(self) -> int:
        """Count events waiting to be synced."""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute("SELECT COUNT(*) FROM events WHERE synced = 0").fetchone()
            return row[0] if row else 0
    
    def count_total(self) -> int:
        """Count total events in queue."""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute("SELECT COUNT(*) FROM events").fetchone()
            return row[0] if row else 0
