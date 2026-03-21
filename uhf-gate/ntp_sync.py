"""NTP time synchronization."""
import socket
import struct
import time
import logging

logger = logging.getLogger(__name__)

NTP_EPOCH = 2208988800


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
        
        # Unpack timestamp (bits 40-80)
        timestamp = struct.unpack("!12I", data)[10]
        ntp_time = timestamp - NTP_EPOCH
        
        return ntp_time * 1000
    except Exception as e:
        logger.warning(f"NTP sync failed: {e}")
        return None


def sync_time(ntp_server: str = "pool.ntp.org") -> float:
    """
    Synchronize system time with NTP server.
    Returns the current time in milliseconds since epoch.
    Falls back to local time if NTP fails.
    """
    ntp_ms = get_ntp_time(ntp_server)
    
    if ntp_ms:
        logger.info(f"NTP time synchronized: {ntp_ms}")
        return ntp_ms
    
    # Fallback to local time
    local_ms = time.time() * 1000
    logger.warning(f"Using local time (NTP unavailable): {local_ms}")
    return local_ms


def get_local_time_ms() -> float:
    """Get current time in milliseconds since epoch."""
    return time.time() * 1000
