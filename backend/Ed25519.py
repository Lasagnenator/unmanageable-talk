"""
The following code has been adapted from https://ed25519.cr.yp.to/python/ed25519.py
The main purpose here is to compress/decompress points.

Written by Matthew Richards.
"""

__all__ = ["compress_key", "decompress_key"]

from Crypto.PublicKey import ECC
from Crypto.Signature import eddsa

b = 256
q = 2**255 - 19

def inv(x: int) -> int:
    return pow(x, q - 2, q)

d = -121665 * inv(121666)
I = pow(2, (q - 1) // 4, q)

def xrecover(y: int) -> int:
    xx = (y * y - 1) * inv(d * y * y + 1)
    x = pow(xx, (q + 3) // 8, q)
    if (x*x - xx) % q != 0:
        x = (x * I) % q
    if x % 2 != 0:
        x = q - x
    return x

def compress(x: int, y: int) -> int:
    return ((x & 1) << 255) | y

def compress_key(point: ECC.EccPoint) -> str:
    """Compress a point"""
    return compress(int(point.x), int(point.y)).to_bytes(32, "little").hex()

def decompress_key(key_hex: str) -> ECC.EccPoint:
    """Decompress a point"""
    key_byte = bytes.fromhex(key_hex)
    key = int.from_bytes(key_byte, "little")
    x_odd = key >> 255
    y = key & ~(1 << 255)
    x = xrecover(y)
    if x & 1 != x_odd:
        x = q - x
    return ECC.EccPoint(x, y, "Ed25519")

def generate_challenge(public: str) -> "tuple[str, str]":
    """
    Returns a (chal, expected) tuple.
    Assumes the public key has been checked before.
    """
    public_key = decompress_key(public)
    key = ECC.generate(curve="Ed25519")
    return compress_key(key.pointQ), compress_key(public_key * key.d)

def verify(public: str, message: str, signature: str) -> bool:
    """
    Verify a message with a public key and signature.
    Returns true on success, errors out for any failure reason:
    - Inputs not hex strings
    - Public key not valid
    - Signature fails to verify
    """
    pointx, pointy = decompress_key(public).xy
    key = ECC.construct(curve = "Ed25519", point_x = pointx, point_y = pointy)
    signer = eddsa.new(key, "rfc8032")
    message_bytes = bytes.fromhex(message)
    signature_bytes = bytes.fromhex(signature)
    signer.verify(message_bytes, signature_bytes)
    return True
