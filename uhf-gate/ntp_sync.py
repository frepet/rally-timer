"""NTP time synchronization.

Tracks the offset between the NTP reference and the local system clock so
`get_local_time_ms()` returns corrected timestamps. Call `sync_time()` at
startup and periodically — system clocks on SBCs drift noticeably over an
event day.
"""
import socket
import struct
import time
import logging

logger = logging.getLogger(__name__)

NTP_EPOCH = 2208988800

# Measured NTP-minus-system offset in milliseconds; applied to all timestamps.
_offset_ms = 0.0


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


def sync_time(ntp_server: str = "pool.ntp.org") -> float:
    """
    Measure the offset between NTP and the system clock.
    Returns the current corrected time in milliseconds since epoch.
    Keeps the previous offset (initially 0 = plain system time) if NTP fails.
    """
    global _offset_ms
    ntp_ms = get_ntp_time(ntp_server)

    if ntp_ms:
        local_ms = time.time() * 1000
        _offset_ms = ntp_ms - local_ms
        if abs(_offset_ms) > 1000:
            logger.warning(f"System clock is {_offset_ms:+.0f} ms off NTP — correcting")
        else:
            logger.info(f"NTP offset: {_offset_ms:+.1f} ms")
        return get_local_time_ms()

    logger.warning("NTP unavailable — using previous offset (local clock)")
    return get_local_time_ms()


def get_local_time_ms() -> float:
    """Current time in milliseconds since epoch, corrected by the NTP offset."""
    return time.time() * 1000 + _offset_ms
