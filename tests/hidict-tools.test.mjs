import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

test('compression CLI preserves exact JSON bytes and Python edits preserve plain/gzip encoding', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hiwords-gzip-'));
    const input = join(folder, 'plain.hidict'), output = join(folder, 'compressed.hidict');
    const json = Buffer.from('{ "schema":"hidict", "schemaVersion":1, "entryCount":1, "entries":[{"word":"test", "definition":"中文"}] }\n');
    const run = args => {
        const result = spawnSync('python3', args, { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return result;
    };
    try {
        writeFileSync(input, json);
        run(['scripts/compress-hidict.py', input, output]);
        assert.deepEqual(gunzipSync(readFileSync(output)), json);
        assert.deepEqual(readFileSync(input), json);
        assert.notEqual(spawnSync('python3', ['scripts/compress-hidict.py', input, output]).status, 0);
        run(['scripts/compress-hidict.py', output, '--in-place']);
        assert.deepEqual(gunzipSync(readFileSync(output)), json);
        run(['-c', `import sys; sys.path.insert(0, 'scripts')
from hidict_io import read_hidict, write_hidict
for path in sys.argv[1:]:
    data = read_hidict(path)
    data['entries'][0]['definition'] = '修订释义'
    write_hidict(path, data)
    assert read_hidict(path) == data
`, input, output]);
        assert.equal(readFileSync(input)[0], 0x7b);
        assert.equal(readFileSync(output)[0], 0x1f);
        assert.equal(JSON.parse(gunzipSync(readFileSync(output))).entries[0].definition, '修订释义');
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
});
