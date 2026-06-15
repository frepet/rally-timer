"""Tests for key_manager.py — Ed25519 key generation, loading, and request signing."""
import base64
import stat

from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

from key_manager import load_or_generate_key, get_public_key_pem, sign_request


class TestLoadOrGenerateKey:
    def test_generates_key_file_when_missing(self, tmp_path):
        key_file = tmp_path / "gate.pem"
        assert not key_file.exists()

        key = load_or_generate_key(key_file)

        assert key_file.exists(), "key file should be created"
        assert isinstance(key, Ed25519PrivateKey)
        # file must not be group- or world-readable
        assert (key_file.stat().st_mode & 0o077) == 0, "key file must be chmod 600"

    def test_loads_existing_key(self, tmp_path):
        key_file = tmp_path / "gate.pem"

        first_key = load_or_generate_key(key_file)
        first_pub = first_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )

        second_key = load_or_generate_key(key_file)
        second_pub = second_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )

        assert first_pub == second_pub, "reloaded key must be identical to the generated one"


class TestGetPublicKeyPem:
    def test_get_public_key_pem_is_spki(self, tmp_path):
        key_file = tmp_path / "gate.pem"
        key = load_or_generate_key(key_file)

        pem = get_public_key_pem(key)

        assert pem.startswith("-----BEGIN PUBLIC KEY-----"), (
            "PEM must be SPKI format (BEGIN PUBLIC KEY), not a raw or legacy format"
        )
        assert "-----END PUBLIC KEY-----" in pem


class TestSignRequest:
    def test_sign_request_produces_verifiable_signature(self, tmp_path):
        key_file = tmp_path / "gate.pem"
        key = load_or_generate_key(key_file)
        timestamp_ms = 1_700_000_000_000
        body = '{"epc": "AABBCCDD", "gate": "gate-1"}'

        ts_str, sig_b64 = sign_request(key, timestamp_ms, body)

        assert ts_str == str(timestamp_ms), "returned timestamp string must match input"

        # Verify the signature using the public key from the cryptography library directly
        pub = key.public_key()
        message = f"{timestamp_ms}\n{body}".encode()
        signature_bytes = base64.b64decode(sig_b64)
        # verify() raises InvalidSignature on failure; should not raise here
        pub.verify(signature_bytes, message)

    def test_sign_request_different_bodies(self, tmp_path):
        key_file = tmp_path / "gate.pem"
        key = load_or_generate_key(key_file)
        timestamp_ms = 1_700_000_000_000

        _, sig1 = sign_request(key, timestamp_ms, '{"epc": "AABBCCDD"}')
        _, sig2 = sign_request(key, timestamp_ms, '{"epc": "11223344"}')

        assert sig1 != sig2, "different bodies must produce different signatures"
