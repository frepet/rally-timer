"""HTTP API client for rally-timing."""
import requests
import logging
import time
from typing import Optional
from dataclasses import dataclass

from key_manager import load_or_generate_key, get_public_key_pem, sign_request

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
    def __init__(
        self,
        base_url: str,
        gate_uuid: str,
        key_file,
        timeout: float = 10.0,
        # Legacy token params kept for backward compat with tests that pass them
        token: str | None = None,
        on_token=None,
    ):
        self.base_url = base_url.rstrip("/")
        self.gate_uuid = gate_uuid
        self.timeout = timeout
        self.session = requests.Session()
        self._registered = False
        self._key = load_or_generate_key(key_file)
        self._public_key_pem = get_public_key_pem(self._key)

        # Legacy token support — used if key_file doesn't exist yet was the old flow
        self.on_token = on_token
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _signed_headers(self, body: str = "") -> dict:
        """Return Ed25519 auth headers for a request with the given body."""
        ts_str, sig = sign_request(self._key, int(time.time() * 1000), body)
        return {
            "X-Gate-Timestamp": ts_str,
            "X-Gate-Signature": sig,
        }

    def register(self) -> bool:
        """Register this gate with the server, sending the public key."""
        try:
            response = self.session.post(
                self._url("/api/gate"),
                json={
                    "id": self.gate_uuid,
                    "name": f"Gate-{self.gate_uuid[:8]}",
                    "public_key": self._public_key_pem,
                },
                timeout=self.timeout,
            )

            if response.status_code in (200, 201):
                try:
                    data = response.json()
                except ValueError:
                    data = {}
                status = data.get("status", "unknown")
                logger.info(f"Gate registered: {self.gate_uuid} (status={status})")
                if status == "pending":
                    logger.warning(
                        "Gate is PENDING admin approval. Events will be rejected until "
                        "an admin accepts this gate in the management UI."
                    )
                self._registered = True
                return True
            else:
                logger.error(f"Registration failed: {response.status_code} {response.text}")
                return False

        except requests.RequestException as e:
            logger.error(f"Registration error: {e}")
            return False

    def send_heartbeat(self) -> bool:
        """Send a signed heartbeat to keep the gate online."""
        try:
            response = self.session.post(
                self._url(f"/api/gate/{self.gate_uuid}/heartbeat"),
                headers=self._signed_headers(""),
                timeout=self.timeout,
            )
            return response.status_code == 200
        except requests.RequestException:
            return False

    def post_event(self, tag: str, timestamp_ms: int, rssi: Optional[int] = None) -> bool:
        """Post a single signed event to the API."""
        try:
            import json as _json
            body = _json.dumps({
                "gate_id": self.gate_uuid,
                "tag": tag,
                "timestamp_ms": timestamp_ms,
                "rssi": rssi,
            }, separators=(",", ":"))
            response = self.session.post(
                self._url("/api/gate-event"),
                data=body,
                headers={
                    "Content-Type": "application/json",
                    **self._signed_headers(body),
                },
                timeout=self.timeout,
            )

            if response.status_code == 201:
                return True
            elif response.status_code == 404:
                logger.warning("Gate not registered, attempting re-registration...")
                self._registered = False
                return False
            elif response.status_code in (401, 403):
                logger.error(
                    f"Gate rejected ({response.status_code}): {response.text}. "
                    "The gate may need admin approval in the management UI."
                )
                return False
            else:
                logger.error(f"Event post failed: {response.status_code} {response.text}")
                return False

        except requests.RequestException as e:
            logger.error(f"Event post error: {e}")
            return False

    def sync_events(self, events: list[QueuedEvent]) -> tuple[int, int] | None:
        """
        Sync multiple events in a signed batch.
        Returns (stored_count, error_count) on HTTP 200, or None on failure.
        """
        if not events:
            return 0, 0

        try:
            import json as _json
            body = _json.dumps(
                {
                    "events": [
                        {
                            "gate_id": e.gate_id,
                            "tag": e.tag,
                            "timestamp_ms": e.timestamp_ms,
                            "rssi": e.rssi,
                        }
                        for e in events
                    ]
                },
                separators=(",", ":"),
            )
            response = self.session.post(
                self._url("/api/gate-sync"),
                data=body,
                headers={
                    "Content-Type": "application/json",
                    **self._signed_headers(body),
                },
                timeout=self.timeout,
            )

            if response.status_code == 200:
                data = response.json()
                stored = data.get("stored", 0)
                errors = len(data.get("errors", []))
                return stored, errors
            elif response.status_code in (401, 403):
                logger.error(
                    f"Sync rejected ({response.status_code}): {response.text}"
                )
                return None
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
                timeout=5.0,
            )
            return response.status_code == 200
        except requests.RequestException:
            return False
