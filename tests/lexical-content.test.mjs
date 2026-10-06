import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/lexical/types'; export * from './src/lexical/validation'; export * from './src/lexical/ai-content'; export * from './src/dictionary/lexical-entry'; export * from './src/editor/hiwords-document'; export * from './src/services/add-vocabulary-word'; export * from './src/services/hiwords-generation-service';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', define: { window: 'globalThis' }, plugins: [{ name: 'obsidian', setup(b) { b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export class TFile {} export const getLanguage = () => 'en'; export const requestUrl = () => { throw Error('Unexpected network'); };` })); } }] });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const raw = { id: 'lead', word: 'Lead', sourceId: 'dict', phonetics: { us: null, uk: null, unclassified: 'led' }, meanings: [{ partsOfSpeech: ['noun', 'verb'], sourceLabels: ['n', 'vt'], definitions: ['铅；铅制品', '引领；带领'] }], forms: [{ word: 'led', types: ['past', 'pastParticiple'] }], frequency: { source: 'ecdict.frq', rank: null, level: null } };
const dict = { name: 'Real dictionary', language: 'en', definitionLanguage: 'zh-CN', version: '1.2', sources: [{ id: 'dict', license: 'MIT', url: 'https://example.test/dict' }] };

test('dictionary adapter preserves grouped lines, original POS labels, multiple form types and unknown frequency', () => {
    const entry = api.hidictToLexicalEntry(raw, dict);
    assert.equal(entry.text, 'Lead'); assert.equal(entry.meanings.length, 1);
    assert.equal(entry.meanings[0].translation, '铅；铅制品\n引领；带领'); assert.equal(entry.meanings[0].definition, undefined);
    assert.deepEqual(entry.meanings[0].partsOfSpeech, ['noun', 'verb']); assert.deepEqual(entry.meanings[0].sourceLabels, ['n', 'vt']);
    assert.deepEqual(entry.forms[0].types, ['past', 'pastParticiple']); assert.equal(entry.phonetics.us, undefined); assert.equal(entry.phonetics.unclassified, 'led');
    assert.equal(entry.frequency.level, undefined); assert.equal(entry.sources[0].license, 'MIT'); assert.equal(api.isLexicalContent(entry), true);
    assert.deepEqual(api.hidictToLexicalEntry(raw, dict), entry, 'adapter IDs remain stable');
});

test('AI and dictionary save through the same schema without reading context or study state', () => {
    const pack = api.createEmptyHiWordsPack('Words');
    const entry = { ...api.hidictToLexicalEntry(raw, dict), kind: 'word', reading: { contextMeaning: 'PRIVATE_CONTEXT' }, mastered: true, sourcePath: 'PRIVATE_NOTE.md' };
    const card = api.appendWordCard(pack, { word: 'Lead', definition: api.lexicalDefinition(entry), lexical: entry });
    const saved = api.serializeHiWordsPack(pack);
    assert.equal(pack.schemaVersion, 3); assert.equal(api.parseHiWordsEditorDocument(saved).kind, 'hiwords');
    assert.equal(card.data.meanings[0].translation, entry.meanings[0].translation); assert.deepEqual(card.data.forms[0].types, entry.forms[0].types);
    for (const forbidden of ['PRIVATE_CONTEXT', 'PRIVATE_NOTE', 'mastered', 'sourcePath', '"kind"', '"text": "Lead"']) assert.ok(!saved.includes(forbidden), forbidden);
    assert.equal(JSON.parse(saved).cards[0].title, 'Lead');
});

test('AI omits missing optional values and never accepts claimed sources, frequency or study state', () => {
    const parsed = api.parseAiLexicalContent({ language: 'en', translationLanguage: 'fr', itemType: 'term', meanings: [{ partsOfSpeech: ['invented'], translation: 'terme' }, { partsOfSpeech: ['noun'], definition: 'An English-only definition.' }], phonetics: { us: '' }, sources: [{ id: 'fake' }], frequency: { rank: 1 }, mastered: true, examples: [{ text: 'An example.' }], forms: [{ text: 'led', types: ['past', 'pastParticiple', 'invented'] }] });
    assert.equal(parsed.meanings[0].partsOfSpeech[0], 'unknown'); assert.equal(parsed.meanings[0].definition, undefined);
    assert.equal(parsed.meanings[1].translation, undefined); assert.equal(parsed.examples[0].translation, undefined);
    assert.deepEqual(parsed.forms[0].types, ['past', 'pastParticiple']); assert.equal(parsed.frequency, undefined); assert.equal(parsed.sources, undefined); assert.equal(parsed.phonetics, undefined);
    const sourced = api.withAiSource(parsed, 'custom', 'model'); assert.equal(api.isLexicalContent(sourced), true);
    assert.equal(api.parseAiLexicalContent({ meanings: [{ pos: 'noun', definition: 'old contract' }] }), null);
});

test('validation rejects dangling meaning/source references, duplicate IDs and invalid form/POS types', () => {
    const content = api.hidictToLexicalEntry(raw, dict);
    for (const mutate of [c => c.meanings[0].sourceIds = ['missing'], c => c.meanings.push({ ...c.meanings[0] }), c => c.examples = [{ id: 'example', text: 'Sample.', meaningId: 'missing' }], c => c.forms[0].types = ['bad'], c => c.meanings[0].partsOfSpeech = ['bad'], c => c.sources.push({ ...c.sources[0] })]) {
        const invalid = structuredClone(content); mutate(invalid); assert.equal(api.isLexicalContent(invalid), false);
    }
});

test('generation preserves user senses, IDs and content even when a different sense shares their POS', () => {
    const card = api.createEmptyWordCard(); card.title = 'lead';
    card.data.meanings = [{ id: 'mine', partsOfSpeech: ['noun'], translation: '我写的铅', sourceLabels: ['n'] }];
    card.data.examples = [{ id: 'my-example', text: 'My example.' }];
    const generated = api.withAiSource(api.parseAiLexicalContent({ meanings: [{ partsOfSpeech: ['noun'], translation: '领先', definition: 'A leading position.' }], examples: [{ text: 'Generated example.' }] }), 'custom', 'model');
    const result = api.mergeGeneratedContent(card, generated);
    assert.equal(result.data.meanings.length, 2); assert.equal(result.data.meanings[0].id, 'mine'); assert.equal(result.data.meanings[0].definition, undefined);
    assert.equal(result.data.examples[0].id, 'my-example'); assert.equal(card.data.meanings.length, 1); assert.equal(api.isLexicalContent(result.data), true);
});

test('single-language meanings are complete and old files are rejected without rewriting originals', () => {
    const pack = api.createEmptyHiWordsPack('Words'); const card = api.createEmptyWordCard(); card.title = 'future'; card.data.meanings[0].translation = '未来'; pack.cards.push(card);
    assert.deepEqual(api.validateHiWordsPack(pack), []); const saved = api.serializeHiWordsPack(pack); assert.ok(!saved.includes('"definition"'));
    assert.equal(api.parseHiWordsEditorDocument(saved).kind, 'hiwords');
    const old = JSON.stringify({ ...pack, schemaVersion: 2 }); const result = api.parseHiWordsEditorDocument(old);
    assert.equal(result.kind, 'invalid'); assert.equal(result.original, old); assert.match(result.message, /version 3/);
});


test('the reference v3 file validates and non-language draft fields survive serialization', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile('docs/examples/lexical-v3.hiwords', 'utf8');
    const doc = api.parseHiWordsEditorDocument(raw);
    assert.equal(doc.kind, 'hiwords'); assert.deepEqual(api.validateHiWordsPack(doc.pack), []);
    const pack = api.createEmptyHiWordsPack('Concept draft'); pack.cardKind = 'knowledge.concept'; pack.cards = [api.createEmptyConceptCard()];
    assert.equal(api.parseHiWordsEditorDocument(api.serializeHiWordsPack(pack)).kind, 'hiwords');
    assert.equal(JSON.parse(api.serializeHiWordsPack(pack)).cards[0].data.definition, '');
});
