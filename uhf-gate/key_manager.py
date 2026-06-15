"""Ed25519 key management for gate authentication."""
import base64
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)


def load_or_generate_key(key_file: Path) -> Ed25519PrivateKey:
    """Load private key from PKCS8 PEM file, or generate and persist a new one."""
    if key_file.exists():
        key = load_pem_private_key(key_file.read_bytes(), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError(f"Key file {key_file} does not contain an Ed25519 private key")
        return key

    key = Ed25519PrivateKey.generate()
    pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    key_file.write_bytes(pem)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key


def get_public_key_pem(key: Ed25519PrivateKey) -> str:
    """Return the SPKI PEM-encoded public key for this private key."""
    return key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()


def sign_request(key: Ed25519PrivateKey, timestamp_ms: int, body: str) -> tuple[str, str]:
    """
    Sign a gate request.

    Returns (timestamp_str, base64_signature). The signed message is
    "{timestamp_ms}\\n{body}" encoded as UTF-8.
    """
    message = f"{timestamp_ms}\n{body}".encode()
    signature = key.sign(message)
    return str(timestamp_ms), base64.b64encode(signature).decode()
