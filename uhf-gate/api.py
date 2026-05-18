"""HTTP API client for rally-timing."""
import requests
import logging
import time
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


class APIClient:
    def __init__(self, base_url: str, gate_uuid: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.gate_uuid = gate_uuid
        self.timeout = timeout
        self.session = requests.Session()
        self._registered = False
    
    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"
    
    def register(self) -> bool:
        """Register this gate with the server."""
        try:
            response = self.session.post(
                self._url("/api/gate"),
                json={"id": self.gate_uuid, "name": f"Gate-{self.gate_uuid[:8]}"},
                timeout=self.timeout
            )
            
            if response.status_code in (200, 201):
                logger.info(f"Gate registered: {self.gate_uuid}")
                self._registered = True
                return True
            else:
                logger.error(f"Registration failed: {response.status_code} {response.text}")
                return False
                
        except requests.RequestException as e:
            logger.error(f"Registration error: {e}")
            return False
    
    def send_heartbeat(self) -> bool:
        """Send a heartbeat to keep the gate online."""
        try:
            response = self.session.post(
                self._url(f"/api/gate/{self.gate_uuid}/heartbeat"),
                timeout=self.timeout
            )
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    def post_event(self, tag: str, timestamp_ms: int, rssi: Optional[int] = None) -> bool:
        """Post a single event to the API."""
        try:
            response = self.session.post(
                self._url("/api/gate-event"),
                json={
                    "gate_id": self.gate_uuid,
                    "tag": tag,
                    "timestamp_ms": timestamp_ms,
                    "rssi": rssi
                },
                timeout=self.timeout
            )
            
            if response.status_code == 201:
                return True
            elif response.status_code == 404:
                logger.warning("Gate not registered, attempting re-registration...")
                self._registered = False
                return False
            else:
                logger.error(f"Event post failed: {response.status_code} {response.text}")
                return False
                
        except requests.RequestException as e:
            logger.error(f"Event post error: {e}")
            return False
    
    def sync_events(self, events: list[QueuedEvent]) -> tuple[int, int] | None:
        """
        Sync multiple events in a batch.
        Returns (stored_count, error_count) on HTTP 200, or None on failure.
        A 200 response means the server processed all events (stored or deduped).
        """
        if not events:
            return 0, 0

        try:
            response = self.session.post(
                self._url("/api/gate-sync"),
                json={
                    "events": [
                        {
                            "gate_id": e.gate_id,
                            "tag": e.tag,
                            "timestamp_ms": e.timestamp_ms,
                            "rssi": e.rssi
                        }
                        for e in events
                    ]
                },
                timeout=self.timeout
            )

            if response.status_code == 200:
                data = response.json()
                stored = data.get("stored", 0)
                errors = len(data.get("errors", []))
                return stored, errors
            else:
                logger.error(f"Sync failed: {response.status_code} {response.text}")
                return None

        except requests.RequestException as e:
            logger.error(f"Sync error: {e}")
            return None
    
    def ensure_registered(self) -> bool:
        """Ensure the gate is registered, re-registering if necessary."""
        if self._registered:
            return True
        return self.register()
    
    def test_connection(self) -> bool:
        """Test if we can reach the API."""
        try:
            response = self.session.get(
                self._url("/api/gate"),
                timeout=5.0
            )
            return response.status_code == 200
        except requests.RequestException:
            return False
