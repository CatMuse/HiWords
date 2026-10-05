import { gunzipSync } from 'fflate';

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    crcTable[i] = value >>> 0;
}

/** Both encodings keep the .hidict extension and the same v1 JSON payload. */
export function decodeHidictBytes(buffer: ArrayBuffer): string {
    let bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (bytes.length < 18) throw new Error('Truncated gzip dictionary');
        const trailer = new DataView(buffer, buffer.byteLength - 8, 8);
        bytes = gunzipSync(bytes);
        // fflate inflates the payload; also verify the gzip checksum and length.
        let crc = 0xffffffff;
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        if (((crc ^ 0xffffffff) >>> 0) !== trailer.getUint32(0, true)
            || (bytes.length >>> 0) !== trailer.getUint32(4, true)) {
            throw new Error('Invalid gzip dictionary checksum or length');
        }
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
