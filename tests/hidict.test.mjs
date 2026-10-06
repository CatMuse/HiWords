import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
const bundle = await build({
    stdin: { contents: `export * from './src/dictionary/hidict'; export * from './src/dictionary/hidict-bytes'; export * from './src/dictionary/hidict-service'; export * from './src/dictionary/selection-lookup'; export * from './src/ui/hidict-result'; export { TFile } from 'obsidian';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'obsidian', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export class Component { registerEvent() {} } export class TFile {} export const getLanguage = () => 'en'; export const setIcon = () => {};` }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function entry(word, forms = []) {
    return { id: word, word, meanings: [{ partsOfSpeech: ['verb'], sourceLabels: ['vt'], definitions: ['做；进行'] }], phonetics: { uk: null, us: null, unclassified: 'test' }, frequency: { source: 'ecdict.frq', rank: 1200, level: 4 }, forms: forms.map(word => ({ word, types: ['past'] })), sourceId: 'ecdict' };
}
function dictionary(entries = [entry('do', ['did'])]) {
    return { schema: 'hidict', schemaVersion: 1, name: 'Test', language: 'en', entryCount: entries.length, sources: [{ id: 'ecdict' }], frequencyScale: { direction: 'higher-level-more-frequent' }, entries };
}
const binary = text => new TextEncoder().encode(text).buffer;
const gzipped = text => Uint8Array.from(gzipSync(text)).buffer;
const parse = d => api.parseHidict(JSON.stringify(d));
test('validates supported data and rejects corrupt entries and duplicate headwords', () => {
    assert.equal(parse(dictionary()).entries[0].word, 'do');
    for (const mutate of [d => d.schemaVersion = 2, d => d.entryCount = 9, d => d.entries[0].frequency.level = 6,
        d => d.entries[0].meanings[0].definitions = [], d => d.entries[0].phonetics.us = {}, d => d.entries[0].sourceId = 'missing']) {
        const d = dictionary(); mutate(d); assert.throws(() => parse(d));
    }
    assert.throws(() => parse(dictionary([entry('Do'), entry('do')])));
});
test('normalizes selected words, preserves word boundaries, prefers exact headwords and returns ambiguous forms', () => {
    assert.equal(api.selectedWord('“Patterned,”'), 'patterned');
    assert.equal(api.selectedWord('DON’T'), "don't");
    for (const text of ['two words', 'do\nthis', '你好', 'do / did']) assert.equal(api.selectedWord(text), null);
    const index = new api.HidictIndex(parse(dictionary([entry('do', ['did']), entry('did'), entry('a', ['shared']), entry('b', ['shared'])])));
    assert.equal(index.lookup('DID')[0].word, 'did');
    assert.deepEqual(index.lookup('shared').map(e => e.word), ['a', 'b']);
    assert.deepEqual(index.lookup('absent'), []);
});
test('local hit skips AI, local miss falls back, sentences bypass dictionary, and disabled AI stays offline', async () => {
    let local = 0, ai = 0;
    const options = { dictionary: true, ai: true, current: () => true,
        lookup: async word => { local++; return word === 'do' ? [entry('do')] : []; },
        translate: async () => { ai++; return '翻译'; } };
    assert.equal((await api.resolveSelection('do', options)).kind, 'dictionary'); assert.equal(ai, 0);
    assert.equal((await api.resolveSelection('missing', options)).kind, 'translation'); assert.equal(ai, 1);
    assert.equal((await api.resolveSelection('do this', options)).kind, 'translation'); assert.equal(local, 2);
    assert.equal((await api.resolveSelection('missing', { ...options, ai: false })).kind, 'miss'); assert.equal(ai, 2);
});
test('stale selection prevents AI fallback and dictionary read errors do not silently send text to AI', async () => {
    let current = true, ai = 0;
    const options = { dictionary: true, ai: true, current: () => current,
        lookup: async () => { current = false; return []; }, translate: async () => { ai++; return 'x'; } };
    assert.equal((await api.resolveSelection('word', options)).kind, 'stale'); assert.equal(ai, 0);
    current = true;
    await assert.rejects(api.resolveSelection('word', { ...options, lookup: async () => { throw Error('bad dictionary'); } })); assert.equal(ai, 0);
});
function vaultFixture() {
    let reads = 0, path = 'test.hidict';
    const files = new Map();
    const handlers = {};
    const file = name => { const f = Object.assign(new api.TFile(), { path: name, extension: 'hidict', stat: { mtime: 1, size: 1 } }); files.set(name, f); return f; };
    file(path);
    const vault = { getAbstractFileByPath: p => files.get(p), readBinary: async () => { reads++; return binary(JSON.stringify(dictionary())); }, on: (name, callback) => { handlers[name] = callback; } };
    const service = new api.HidictService({ vault }, () => path); service.onload();
    return { service, vault, files, handlers, setPath: p => path = p, file, reads: () => reads };
}
test('dictionary loads lazily, shares concurrent reads, invalidates modifications, and reports deleted files', async () => {
    const f = vaultFixture(); assert.equal(f.reads(), 0);
    await Promise.all([f.service.lookup('do'), f.service.lookup('did')]); assert.equal(f.reads(), 1);
    await f.service.lookup('do'); assert.equal(f.reads(), 1);
    f.handlers.modify(f.files.get('test.hidict')); await f.service.lookup('do'); assert.equal(f.reads(), 2);
    f.files.clear(); await assert.rejects(f.service.lookup('do'), /missing/);
});
test('a late read from the previous dictionary cannot poison the new cache', async () => {
    const f = vaultFixture(); let release;
    f.vault.readBinary = file => file.path === 'test.hidict' ? new Promise(resolve => release = resolve) : Promise.resolve(binary(JSON.stringify(dictionary([entry('new')]))));
    const old = f.service.lookup('do');
    f.file('new.hidict'); f.setPath('new.hidict'); f.service.invalidate();
    assert.equal((await f.service.lookup('new'))[0].word, 'new');
    release(gzipped(JSON.stringify(dictionary()))); await assert.rejects(old, /changed/);
    assert.equal((await f.service.lookup('new'))[0].word, 'new');
});
test('copied or saved definitions contain only grouped meanings', () => {
    assert.equal(api.hidictDefinition(entry('do')), 'vt. 做；进行');
});

test('plain and gzip dictionaries preserve Unicode, entries and form lookup', async () => {
    const text = JSON.stringify(dictionary());
    assert.equal(api.decodeHidictBytes(binary(text)), text);
    assert.equal(api.decodeHidictBytes(gzipped(text)), text);
    const f = vaultFixture(); let reads = 0;
    f.vault.readBinary = async () => { reads++; return gzipped(text); };
    const [head, form] = await Promise.all([f.service.lookup('do'), f.service.lookup('did')]);
    assert.deepEqual(head, form); assert.equal(head[0].meanings[0].definitions[0], '做；进行');
    await f.service.lookup('do'); assert.equal(reads, 1);
    f.handlers.modify(f.files.get('test.hidict'));
    f.vault.readBinary = async () => binary(JSON.stringify(dictionary([entry('new')])));
    assert.equal((await f.service.lookup('new'))[0].word, 'new');
});
test('truncated gzip, damaged checksum/length, invalid UTF-8 and invalid JSON fail without caching', async () => {
    const gzip = new Uint8Array(gzipped(JSON.stringify(dictionary())));
    const badCrc = gzip.slice(); badCrc[badCrc.length - 8] ^= 1;
    const badLength = gzip.slice(); badLength[badLength.length - 4] ^= 1;
    for (const bytes of [gzip.slice(0, 5), gzip.slice(0, -10), badCrc, badLength, Uint8Array.of(0xff), new TextEncoder().encode('{bad'), new Uint8Array(gzipped('{}'))]) {
        const f = vaultFixture(); f.vault.readBinary = async () => bytes.buffer;
        await assert.rejects(f.service.lookup('do'), /Invalid/);
        f.vault.readBinary = async () => gzipped(JSON.stringify(dictionary()));
        assert.equal((await f.service.lookup('did'))[0].word, 'do');
    }
});

test('accidental selections never call lookup or AI; wrapped words are cleaned before routing', async () => {
    const lookups = [], translations = [];
    const options = { dictionary: true, ai: true, current: () => true,
        lookup: async word => { lookups.push(word); return word === 'hello' ? [entry('hello')] : []; },
        translate: async text => { translations.push(text); return 'translated'; } };
    for (const text of ['.', '。', '_', '***', '123', '3.14', 'hello_world', 'word/word', 'word@word', 'a+b', 'hello_world is code']) {
        assert.equal((await api.resolveSelection(text, options)).kind, 'miss', text);
    }
    assert.deepEqual(lookups, []); assert.deepEqual(translations, []);
    for (const text of ['(hello)', '**hello**', '__hello__', '“hello,”', '`hello`', '**hello**,', '(**hello**)']) {
        assert.equal((await api.resolveSelection(text, options)).kind, 'dictionary', text);
    }
    assert.deepEqual(lookups, Array(7).fill('hello')); assert.deepEqual(translations, []);
    await api.resolveSelection('**unknown**', options);
    await api.resolveSelection('The price is $10.50, right?', options);
    await api.resolveSelection('你好，世界！', options);
    await api.resolveSelection('café', options);
    await api.resolveSelection('今日は晴れです。', options);
    await api.resolveSelection('don’t', options);
    assert.deepEqual(translations, ['unknown', 'The price is $10.50, right?', '你好，世界！', 'café', '今日は晴れです。', 'don’t']);
});

test('extra boundary symbols are removed without merging interior symbols into a word', async () => {
    const lookups = [], translations = [];
    const options = { dictionary: true, ai: true, current: () => true,
        lookup: async word => { lookups.push(word); return word === 'future' ? [entry('future')] : []; },
        translate: async text => { translations.push(text); return 'translated'; } };
    const decorated = ['_future', 'future_', '#future', '@future!', '***future__', '/future/', '\\future\\', '~~future', '★future★', '(_future_,)'];
    for (const text of decorated) assert.equal((await api.resolveSelection(text, options)).kind, 'dictionary', text);
    assert.deepEqual(lookups, decorated.map(() => 'future'));
    assert.deepEqual(translations, []);
    for (const text of ['hello_world', '_hello_world_', 'hello/world', '#hello@world#']) {
        assert.equal((await api.resolveSelection(text, options)).kind, 'miss', text);
    }
    assert.equal(lookups.length, decorated.length);
    await api.resolveSelection('_unknown', options);
    await api.resolveSelection('#don’t!', options);
    await api.resolveSelection('~well-known_', options);
    assert.deepEqual(translations, ['unknown', 'don’t', 'well-known']);
});
