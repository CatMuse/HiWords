// Validate generated artifacts against the production schema and vocabulary parser.
// Usage: node scripts/validate-vocabulary-packs.mjs OUTPUT_DIRECTORY
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const directory = path.resolve(process.argv[2]);
const bundle = await build({
    stdin: {
        contents: `export { HiWordsParser } from './src/card/hiwords-parser';
            export { parseHiWordsEditorDocument, serializeHiWordsPack } from './src/editor/hiwords-document';
            export { validateHiWordsPack } from './src/schema/hiwords';`,
        resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'obsidian-boundary', setup(builder) {
        builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
            contents: `export class TFile {}
                export const getLanguage = () => 'en';`,
        }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const results = [], stageWords = new Set(), allHeadwords = new Set(), aliasOwners = new Map();
const filenames = (await readdir(directory)).filter(name => name.endsWith('.hiwords')).sort();
assert.equal(filenames.length, 8, 'Expected eight exam packs');
for (const filename of filenames) {
    const text = await readFile(path.join(directory, filename), 'utf8');
    const document = api.parseHiWordsEditorDocument(text);
    assert.equal(document.kind, 'hiwords', filename);
    const pack = document.pack;
    assert.deepEqual(api.validateHiWordsPack(pack), [], filename);
    const roundTrip = api.parseHiWordsEditorDocument(api.serializeHiWordsPack(pack));
    assert.equal(roundTrip.kind, 'hiwords');
    assert.deepEqual(roundTrip.pack, pack, 'Editor round trip must preserve data and provenance');
    const parser = new api.HiWordsParser({ vault: { cachedRead: async () => text } });
    const started = performance.now();
    const definitions = await parser.parseFile({ path: filename });
    assert.equal(definitions.length, pack.cards.length, 'No cards may silently disappear from the highlight index');
    for (const card of pack.cards) {
        const key = card.title.toLowerCase();
        allHeadwords.add(key);
        assert(card.tags.includes(pack.provenance.examTag));
        if (pack.id.endsWith('-incremental')) {
            assert(!stageWords.has(key), `Duplicate stage word: ${key}`);
            stageWords.add(key);
        }
        for (const alias of card.aliases || []) {
            assert(!aliasOwners.has(alias) || aliasOwners.get(alias) === key, `Ambiguous alias: ${alias}`);
            aliasOwners.set(alias, key);
        }
    }
    results.push({ file: filename, cards: pack.cards.length, parserMilliseconds: Math.round(performance.now() - started) });
}
for (const alias of aliasOwners.keys()) assert(!allHeadwords.has(alias), `Alias shadows headword: ${alias}`);
const report = { passed: true, checkedPacks: results.length, uniqueHeadwords: allHeadwords.size,
    incrementalHeadwords: stageWords.size, unambiguousAliases: aliasOwners.size, packs: results,
    scope: 'Production schema validation, editor serialization, vocabulary parsing, incremental disjointness and alias collisions. Obsidian UI/mobile not tested.' };
await writeFile(path.join(directory, '验证报告.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
