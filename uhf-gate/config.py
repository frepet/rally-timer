"""Configuration management."""
import os
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    api_base_url: str = field(default_factory=lambda: os.getenv("API_BASE_URL", "http://localhost:5173"))
    serial_port: str = field(default_factory=lambda: os.getenv("SERIAL_PORT", ""))
    dedup_seconds: float = field(default_factory=lambda: float(os.getenv("DEDUP_SECONDS", "2")))
    rssi_threshold: int = field(default_factory=lambda: int(os.getenv("RSSI_THRESHOLD", "-65")))
    epc_chars: int = field(default_factory=lambda: int(os.getenv("EPC_CHARS", "8")))
    ntp_server: str = field(default_factory=lambda: os.getenv("NTP_SERVER", "pool.ntp.org"))
    gate_uuid: str = field(default_factory=lambda: os.getenv("GATE_UUID", ""))
    uuid_file: Path = field(default_factory=lambda: Path(__file__).parent / ".gate_uuid")
    db_file: Path = field(default_factory=lambda: Path(__file__).parent / "queue.sqlite")
    led_pin: int | None = field(default_factory=lambda: int(os.getenv("LED_PIN")) if os.getenv("LED_PIN") else None)
    dedup_led_pin: int | None = field(default_factory=lambda: int(os.getenv("DEDUP_LED_PIN")) if os.getenv("DEDUP_LED_PIN") else None)
    buzzer_pin: int | None = field(default_factory=lambda: int(os.getenv("BUZZER_PIN")) if os.getenv("BUZZER_PIN") else None)

    def get_or_create_uuid(self) -> str:
        """Get existing UUID or generate new one."""
        if self.gate_uuid:
            return self.gate_uuid
        
        if self.uuid_file.exists():
            uuid = self.uuid_file.read_text().strip()
            if uuid:
                return uuid
        
        import uuid
        new_uuid = str(uuid.uuid4())
        self.uuid_file.write_text(new_uuid)
        return new_uuid


config = Config()
