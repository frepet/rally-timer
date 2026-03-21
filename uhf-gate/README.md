# UHF Gate - Standalone RFID Gate for Rally Timing

Robust Python application for capturing RFID tag passes and posting them to the rally-timing API.

## Features

- Connects to YRM100 UHF RFID reader via USB-Serial
- Posts events to rally-timing API with gate UUID
- SQLite queue for offline resilience
- NTP time synchronization
- Auto-generates and persists gate UUID

## Setup

```bash
# Install dependencies
pip install pyserial requests python-dotenv

# Copy and edit config
cp .env.example .env
nano .env
```

## Configuration (.env)

```env
API_BASE_URL=http://localhost:5173
SERVER_URL=http://rally-timer-dev.peteri.se  # Use this for production
SERIAL_PORT=/dev/ttyUSB0  # Auto-detects if empty
DEDUP_SECONDS=2
RSSI_THRESHOLD=200
NTP_SERVER=pool.ntp.org
```

## Running

```bash
python uhf_gate.py
```

## Architecture

```
YRM100 Reader → Parser → Queue → HTTP POST → API
                     ↓
               [SQLite DB]  (for offline resilience)
```
