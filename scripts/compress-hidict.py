"""Losslessly gzip a HiDict, keeping its extension and exact JSON bytes.

python3 scripts/compress-hidict.py INPUT.hidict OUTPUT.hidict
python3 scripts/compress-hidict.py INPUT.hidict --in-place
"""
import argparse
import hashlib
import json
from pathlib import Path
from hidict_io import read_hidict_bytes, write_hidict_bytes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path, nargs='?')
    parser.add_argument('--in-place', action='store_true')
    args = parser.parse_args()
    if bool(args.output) == args.in_place:
        parser.error('Specify either OUTPUT.hidict or --in-place')
    output = args.input if args.in_place else args.output
    if not args.in_place and output.exists():
        parser.error('Output already exists; use --in-place to replace the input')
    payload = read_hidict_bytes(args.input)
    data = json.loads(payload.decode('utf-8-sig'))
    if data.get('schema') != 'hidict' or data.get('schemaVersion') != 1 or data.get('entryCount') != len(data.get('entries', [])):
        raise ValueError('Invalid HiDict v1 dictionary')
    write_hidict_bytes(output, payload, compressed=True)
    print(json.dumps({'file': str(output), 'entries': data['entryCount'], 'jsonBytes': len(payload),
                      'gzipBytes': output.stat().st_size, 'jsonSHA256': hashlib.sha256(payload).hexdigest()}, ensure_ascii=False))


if __name__ == '__main__':
    main()
