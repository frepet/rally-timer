#!/usr/bin/env python3
"""
UHF Gate - Standalone RFID Gate for Rally Timing

Captures RFID tag passes from a YRM100 UHF reader and posts them
to the rally-timing API with offline queue support.
"""

import sys
import time
import signal
import logging
import threading
from datetime import datetime

from config import config
from reader import YRM100Reader, extract_frames, parse_inventory, find_serial_ports
from event_queue import EventQueue
from api import APIClient
from ntp_sync import sync_time, get_local_time_ms

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


class UHFGate:
    """Main gate controller."""

    def __init__(self):
        self.running = False
        self.reader = YRM100Reader(config.serial_port)
        self.queue = EventQueue(config.db_file)
        self.api = APIClient(config.api_base_url, config.get_or_create_uuid())

        # State
        self.last_seen: dict[str, float] = {}
        self.tag_count = 0
        self.synced_count = 0
        self.buffer = b""

        # Threads
        self.sync_thread: threading.Thread | None = None
        self.heartbeat_thread: threading.Thread | None = None

    def setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, shutting down...")
        self.running = False

    def sync_worker(self):
        """Background thread for syncing queued events."""
        while self.running:
            try:
                if self.api.ensure_registered():
                    pending = self.queue.get_pending(limit=50)
                    if pending:
                        stored, errors = self.api.sync_events(pending)
                        if stored > 0:
                            self.queue.mark_synced([e.id for e in pending[:stored]])
                            self.synced_count += stored
                            logger.info(
                                f"Synced {stored} events (queue: {self.queue.count_pending()})"
                            )

                self.queue.purge_synced(max_age_hours=24)

            except Exception as e:
                logger.error(f"Sync worker error: {e}")

            time.sleep(2)

    def heartbeat_worker(self):
        """Background thread for sending heartbeats."""
        while self.running:
            try:
                self.api.send_heartbeat()
            except Exception as e:
                logger.debug(f"Heartbeat error: {e}")

            time.sleep(15)

    def process_tag(self, epc: str, rssi: int):
        """Process a detected tag."""
        now = get_local_time_ms()
        short_id = epc[-config.epc_chars :]

        # Client-side deduplication
        prev = self.last_seen.get(epc, 0)
        if now - prev < config.dedup_seconds * 1000:
            return

        self.last_seen[epc] = now
        self.tag_count += 1

        # Log the detection
        ts_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        logger.info(f"TAG  {ts_str}  EPC: {epc} → {short_id}  RSSI: {rssi}")

        # Push to queue
        self.queue.push(self.api.gate_uuid, epc, int(now), rssi)

        # Try immediate sync
        if self.api.ensure_registered():
            success = self.api.post_event(epc, int(now), rssi)
            if success:
                logger.debug(f"Immediate sync successful")

    def run(self):
        """Main event loop."""
        logger.info("=" * 60)
        logger.info("UHF Gate Starting")
        logger.info(f"Gate UUID: {config.get_or_create_uuid()}")
        logger.info(f"API URL: {config.api_base_url}")
        logger.info(f"Queue DB: {config.db_file}")
        logger.info("=" * 60)

        # NTP sync
        logger.info("Syncing time with NTP...")
        ntp_time = sync_time(config.ntp_server)
        logger.info(f"NTP time: {ntp_time}")

        # Connect to reader
        if not self.reader.connect():
            logger.error("Failed to connect to reader")
            return 1

        # Register with server
        if not self.api.register():
            logger.warning("Could not register with server, will queue events")

        # Start background threads
        self.running = True
        self.sync_thread = threading.Thread(target=self.sync_worker, daemon=True)
        self.sync_thread.start()

        self.heartbeat_thread = threading.Thread(
            target=self.heartbeat_worker, daemon=True
        )
        self.heartbeat_thread.start()

        # Start polling
        self.reader.start_polling()

        logger.info(
            f"Polling started. Dedup: {config.dedup_seconds}s, RSSI threshold: {config.rssi_threshold}"
        )
        logger.info(f"Queue: {self.queue.count_pending()} pending events")
        logger.info("Press Ctrl+C to stop")
        logger.info("-" * 60)

        try:
            poll_start = time.time()
            while self.running:
                if time.time() - poll_start > 60:
                    self.reader.start_polling()
                    poll_start = time.time()

                chunk = self.reader.read_chunk(256)
                if chunk:
                    self.buffer += chunk
                    frames, self.buffer = extract_frames(self.buffer)

                    for frame in frames:
                        tag = parse_inventory(frame)
                        if tag and tag["rssi"] >= config.rssi_threshold:
                            self.process_tag(tag["epc"], tag["rssi"])
                else:
                    time.sleep(0.005)

        except Exception as e:
            logger.error(f"Main loop error: {e}")

        finally:
            self.shutdown()

        return 0

    def shutdown(self):
        """Clean shutdown."""
        logger.info("Shutting down...")
        self.running = False

        self.reader.close()

        if self.sync_thread:
            self.sync_thread.join(timeout=2)

        logger.info(f"Total tags: {self.tag_count}, synced: {self.synced_count}")
        logger.info(f"Pending in queue: {self.queue.count_pending()}")
        logger.info("Shutdown complete")


def main():
    gate = UHFGate()
    gate.setup_signal_handlers()
    return gate.run()


if __name__ == "__main__":
    sys.exit(main())
