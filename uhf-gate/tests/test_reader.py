"""Tests for YRM100 frame parsing and extraction."""
from reader import checksum, parse_inventory, extract_frames, MAX_BUFFER_LEN


def make_frame(epc: bytes, rssi: int = -59, frame_type: int = 0x02) -> bytes:
    """Build a valid inventory notification frame."""
    payload = bytes([rssi & 0xFF]) + b"\x30\x00" + epc + b"\x00\x00"
    pl = len(payload)
    body = bytes([frame_type, 0x22, pl >> 8, pl & 0xFF]) + payload
    return b"\xBB" + body + bytes([checksum(body)]) + b"\x7E"


EPC = bytes(range(0xA0, 0xAC))  # 12-byte EPC


class TestChecksum:
    def test_sums_bytes_mod_256(self):
        assert checksum(b"\x01\x02\x03") == 6
        assert checksum(b"\xff\x01") == 0


class TestParseInventory:
    def test_parses_valid_frame(self):
        tag = parse_inventory(make_frame(EPC, rssi=-59))
        assert tag is not None
        assert tag["epc"] == EPC.hex().upper()
        assert tag["rssi"] == -59

    def test_rssi_is_signed(self):
        tag = parse_inventory(make_frame(EPC, rssi=-80))
        assert tag["rssi"] == -80

    def test_rejects_corrupted_checksum(self):
        frame = bytearray(make_frame(EPC))
        frame[10] ^= 0xFF  # flip a payload byte; checksum no longer matches
        assert parse_inventory(bytes(frame)) is None

    def test_rejects_short_frames(self):
        assert parse_inventory(b"\xBB\x02\x22\x7E") is None

    def test_rejects_wrong_markers(self):
        frame = bytearray(make_frame(EPC))
        frame[0] = 0xAA
        assert parse_inventory(bytes(frame)) is None

    def test_rejects_non_inventory_command(self):
        payload = b"\x00"
        body = bytes([0x01, 0x0E, 0x00, len(payload)]) + payload
        frame = b"\xBB" + body + bytes([checksum(body)]) + b"\x7E"
        assert parse_inventory(frame) is None


class TestExtractFrames:
    def test_extracts_single_frame(self):
        frames, rest = extract_frames(make_frame(EPC))
        assert len(frames) == 1
        assert rest == b""

    def test_extracts_multiple_frames_with_garbage(self):
        data = b"\x00\x01" + make_frame(EPC) + b"\xFF" + make_frame(EPC)
        frames, rest = extract_frames(data)
        assert len(frames) == 2
        assert rest == b""

    def test_keeps_partial_frame_in_buffer(self):
        frame = make_frame(EPC)
        frames, rest = extract_frames(frame[:10])
        assert frames == []
        assert rest == frame[:10]
        # Completing the data yields the frame
        frames, rest = extract_frames(rest + frame[10:])
        assert len(frames) == 1
        assert rest == b""

    def test_frame_with_7e_in_payload_is_not_split(self):
        # 0x7E inside the EPC must not terminate the frame early.
        epc = b"\x7E" * 12
        frames, rest = extract_frames(make_frame(epc))
        assert len(frames) == 1
        tag = parse_inventory(frames[0])
        assert tag is not None
        assert tag["epc"] == epc.hex().upper()

    def test_resyncs_past_false_start_marker(self):
        # 0xBB followed by a corrupt length field, then a real frame.
        data = b"\xBB\xFF\xFF\xFF\xFF" + make_frame(EPC)
        frames, _ = extract_frames(data)
        assert len(frames) == 1

    def test_buffer_is_capped(self):
        # Endless garbage with a trailing 0xBB must not grow unboundedly.
        junk = b"\xBB" + b"\x01\x22\x00\xFF" + b"\x00" * (MAX_BUFFER_LEN * 2)
        _, rest = extract_frames(junk)
        assert len(rest) <= MAX_BUFFER_LEN
