"""Read plain/gzip HiDict JSON and preserve encoding when editing a dictionary."""
import gzip
import json
import os
from pathlib import Path
import tempfile


def read_hidict_bytes(path):
    raw = Path(path).read_bytes()
    return gzip.decompress(raw) if raw.startswith(b'\x1f\x8b') else raw


def read_hidict(path):
    return json.loads(read_hidict_bytes(path).decode('utf-8-sig'))


def write_hidict_bytes(path, payload, compressed=False):
    path = Path(path)
    raw = gzip.compress(payload, compresslevel=9, mtime=0) if compressed else payload
    if compressed and gzip.decompress(raw) != payload:
        raise ValueError('Compression round-trip failed')
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temp = Path(handle.name)
        try:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        temp.chmod(path.stat().st_mode & 0o777 if path.exists() else 0o644)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def write_hidict(path, value, compressed=None):
    path = Path(path)
    if compressed is None:
        with path.open('rb') as handle:
            compressed = handle.read(2) == b'\x1f\x8b'
    payload = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    write_hidict_bytes(path, payload, compressed)
