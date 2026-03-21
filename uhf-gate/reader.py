"""YRM100 UHF RFID reader communication."""
import serial
import time
import glob
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TagRead:
    epc: str
    rssi: int
    pc: str
    timestamp_ms: int


def find_serial_ports() -> list[str]:
    """Find available USB serial ports."""
    patterns = ["/dev/ttyUSB*", "/dev/ttyACM*", "/dev/tty.wchusbserial*"]
    ports = []
    for pattern in patterns:
        ports.extend(glob.glob(pattern))
    return sorted(ports)


def checksum(data: bytes) -> int:
    """Calculate MagicRF protocol checksum."""
    return sum(data) & 0xFF


def parse_inventory(frame: bytes) -> Optional[dict]:
    """Parse a tag inventory frame from the YRM100 reader."""
    if frame is None or len(frame) < 7:
        return None
    
    if len(frame) < 9:
        return None
    
    # Frame format: 0xBB | Type | Command | PL_Hi | PL_Lo | [Payload...] | Checksum | 0x7E
    if frame[0] != 0xBB or frame[-1] != 0x7E:
        return None
    
    if frame[2] == 0x22 and frame[1] in (0x01, 0x02):
        pl_len = (frame[3] << 8) | frame[4]
        payload = frame[5 : 5 + pl_len]
        
        if len(payload) >= 5:
            rssi_raw = payload[0]
            pc = payload[1:3]
            epc_len = pl_len - 3 - 2
            if epc_len < 1:
                epc_len = pl_len - 3
            epc = payload[3 : 3 + epc_len]
            
            return {
                "rssi": rssi_raw,
                "pc": pc.hex().upper(),
                "epc": epc.hex().upper(),
            }
    
    return None


def extract_frames(buf: bytes) -> tuple[list[bytes], bytes]:
    """Extract complete frames from serial buffer."""
    frames = []
    while True:
        start = buf.find(b"\xBB")
        if start == -1:
            break
        end = buf.find(b"\x7E", start)
        if end == -1:
            buf = buf[start:]
            break
        frames.append(buf[start : end + 1])
        buf = buf[end + 1 :]
    return frames, buf


class YRM100Reader:
    """Interface to YRM100 UHF RFID reader."""
    
    BAUD_RATE = 115200
    
    def __init__(self, port: str = ""):
        self.port = port
        self.serial: Optional[serial.Serial] = None
        self._connected = False
    
    def find_available_port(self) -> Optional[str]:
        """Find first available serial port."""
        ports = find_serial_ports()
        if ports:
            return ports[0]
        return None
    
    def connect(self, port: str = "") -> bool:
        """Connect to the reader."""
        target_port = port or self.port
        
        if not target_port:
            target_port = self.find_available_port()
            if not target_port:
                logger.error("No serial port found")
                return False
            logger.info(f"Auto-detected port: {target_port}")
        
        try:
            self.serial = serial.Serial(
                target_port,
                self.BAUD_RATE,
                timeout=0
            )
            self.port = target_port
            time.sleep(0.3)
            self.serial.reset_input_buffer()
            
            # Reset to Session S0 for fast polling
            cmd = bytes([0xBB, 0x00, 0x0E, 0x00, 0x02, 0x10, 0x20, 0x28, 0x7E])
            self.serial.write(cmd)
            time.sleep(0.3)
            self.serial.read(64)
            self.serial.reset_input_buffer()
            
            self._connected = True
            logger.info(f"Connected to YRM100 on {target_port}")
            return True
            
        except serial.SerialException as e:
            logger.error(f"Connection failed: {e}")
            self._connected = False
            return False
    
    def start_polling(self, rounds: int = 0xFFFF):
        """Start continuous tag polling."""
        if not self._connected or not self.serial:
            logger.error("Not connected")
            return False
        
        cs = (0x00 + 0x27 + 0x00 + 0x03 + 0x22 + (rounds >> 8) + (rounds & 0xFF)) & 0xFF
        cmd = bytes([
            0xBB, 0x00, 0x27, 0x00, 0x03, 0x22,
            (rounds >> 8) & 0xFF, rounds & 0xFF,
            cs, 0x7E
        ])
        
        self.serial.write(cmd)  # type: ignore
        return True
    
    def stop_polling(self):
        """Stop continuous polling."""
        if self._connected and self.serial:
            cmd = bytes([0xBB, 0x00, 0x28, 0x00, 0x00, 0x28, 0x7E])
            self.serial.write(cmd)  # type: ignore
            time.sleep(0.1)
            self.serial.reset_input_buffer()  # type: ignore
    
    def read_chunk(self, size: int = 256) -> bytes:
        """Read available data from serial."""
        if not self._connected or not self.serial:
            return b""
        return self.serial.read(size)  # type: ignore
    
    def is_connected(self) -> bool:
        """Check if still connected."""
        if not self._connected:
            return False
        return self.serial is not None and self.serial.is_open
    
    def close(self):
        """Close the connection."""
        self.stop_polling()
        if self.serial:
            self.serial.close()
            self.serial = None
        self._connected = False
        logger.info("Reader disconnected")
