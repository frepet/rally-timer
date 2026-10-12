"""NTP time synchronization.

Time is anchored to the last successful NTP reply and advanced with the
monotonic clock, so later steps of the system clock (e.g. timesyncd fixing a
Pi that booted with a wrong date) cannot corrupt timestamps. Nothing may be
timestamped until the first successful sync: `get_local_time_ms()` raises
`NotSyncedError` before that. Call `sync_time()` periodically to correct drift.
"""
import socket
import struct
import threading
import time
import logging

logger = logging.getLogger(__name__)

NTP_EPOCH = 2208988800

# Earliest believable NTP time (2025-01-01); rejects zeroed/garbage replies.
MIN_PLAUSIBLE_MS = 1_735_689_600_000
# Backward corrections smaller than this are hidden by holding the last issued
# timestamp (keeps passes ordered). Larger ones are real clock errors and must
# be applied immediately — holding them would freeze time for as long as the
# error, which collapsed a whole event's passes into one timestamp.
MAX_HOLD_MS = 5000.0


class NotSyncedError(RuntimeError):
    """Raised when time is requested before the first successful NTP sync."""


_anchor_ntp_ms: float | None = None
_anchor_mono: float = 0.0
_last_issued_ms = 0.0
# Written from the NTP thread, read from the main thread.
_lock = threading.Lock()


def reset() -> None:
    """Forget all sync state (tests)."""
    global _anchor_ntp_ms, _anchor_mono, _last_issued_ms
    with _lock:
        _anchor_ntp_ms = None
        _anchor_mono = 0.0
        _last_issued_ms = 0.0


def is_synced() -> bool:
    return _anchor_ntp_ms is not None


def get_ntp_time(ntp_server: str = "pool.ntp.org") -> float | None:
    """Get current time from NTP server. Returns milliseconds since epoch."""
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.settimeout(5)

        ntp_packet = b'\x1b' + 47 * b'\0'
        client.sendto(ntp_packet, (ntp_server, 123))

        data, _ = client.recvfrom(1024)
        client.close()

        if len(data) < 48:
            return None

        # Transmit timestamp: seconds + 32-bit fraction (bytes 40-47)
        fields = struct.unpack("!12I", data)
        seconds = fields[10] - NTP_EPOCH
        fraction = fields[11] / 2**32

        return (seconds + fraction) * 1000
    except Exception as e:
        logger.warning(f"NTP sync failed: {e}")
        return None


def sync_time(ntp_server: str = "pool.ntp.org") -> float | None:
    """
    Re-anchor time to NTP. Returns the corrected time in ms since epoch, or
    None if NTP failed (any previous anchor is kept; before the first success
    the gate stays unsynced).
    """
    global _anchor_ntp_ms, _anchor_mono
    mono = time.monotonic()
    ntp_ms = get_ntp_time(ntp_server)

    if not ntp_ms or ntp_ms < MIN_PLAUSIBLE_MS:
        if ntp_ms:
            logger.warning(f"Ignoring implausible NTP time {ntp_ms}")
        logger.warning("NTP unavailable — keeping previous anchor")
        return None

    with _lock:
        if _anchor_ntp_ms is None:
            logger.info(f"First NTP sync: system clock is {ntp_ms - time.time() * 1000:+.0f} ms off")
        else:
            step = ntp_ms - (_anchor_ntp_ms + (mono - _anchor_mono) * 1000)
            level = logging.WARNING if abs(step) > 1000 else logging.INFO
            logger.log(level, f"NTP correction: {step:+.1f} ms")
        _anchor_ntp_ms = ntp_ms
        _anchor_mono = mono
    return get_local_time_ms()


def get_local_time_ms() -> float:
    """Current NTP-anchored time in ms since epoch. Small backward corrections
    are held back so timestamps stay non-decreasing."""
    global _last_issued_ms
    with _lock:
        if _anchor_ntp_ms is None:
            raise NotSyncedError("no NTP sync yet")
        t = _anchor_ntp_ms + (time.monotonic() - _anchor_mono) * 1000
        if _last_issued_ms - MAX_HOLD_MS < t < _last_issued_ms:
            t = _last_issued_ms
        _last_issued_ms = t
        return t
