import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/services/translation-result'; export * from './src/services/detailed-translation-result'; export * from './src/services/translation-prompt'; export { normalizeStoredSettings } from './src/settings-storage';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const word = { kind: 'word', text: 'future', meanings: [{ pos: 'noun', definition: '未来；将来' }], usage: '描述尚未发生的时间。', example: { text: 'Plan for the future.', translation: '为未来做打算。' } };

test('verified word/sentence JSON, fences and reasoning tags yield cards and clean saved definitions', () => {
    const parsed = api.parseTranslationResult('<think>reasoning</think>\n```json\n' + JSON.stringify(word) + '\n```', 'future');
    assert.deepEqual(parsed, word);
    assert.equal(api.translationDefinition(parsed), 'n. 未来；将来');
    const sentence = api.parseTranslationResult(JSON.stringify({ kind: 'sentence', text: 'The future is bright.', translation: '未来是光明的。', explanation: null }), 'The future is bright.');
    assert.equal(sentence.kind, 'sentence'); assert.equal(api.translationDefinition(sentence), '未来是光明的。');
    assert.equal(api.parseTranslationResult('简单译文', 'future').kind, 'text');
    assert.equal(api.translationDefinition(api.parseTranslationResult('简单译文', 'future')), '简单译文');
});

test('invalid fields never become structured cards or raw JSON vocabulary definitions', () => {
    for (const change of [d => d.text = 'other', d => d.meanings = [], d => d.meanings[0].pos = '<script>', d => d.meanings[0].definition = '', d => d.meanings = Array(5).fill(d.meanings[0]), d => d.usage = {}, d => d.example = { text: 'incomplete' }]) {
        const data = structuredClone(word); change(data);
        const parsed = api.parseTranslationResult(JSON.stringify(data), 'future');
        assert.equal(parsed.kind, 'text'); assert.equal(api.translationDefinition(parsed), null);
    }
    assert.equal(api.translationDefinition(api.parseTranslationResult('{broken JSON', 'future')), null);
    const fallback = api.parseTranslationResult(JSON.stringify({ kind: 'bad', translation: '可用译文' }), 'future');
    assert.equal(fallback.kind, 'text'); assert.equal(api.translationDefinition(fallback), '可用译文');
});

test('legacy defaults migrate, custom guidance remains, selection placeholders and dollar signs remain literal', () => {
    const migrated = api.normalizeStoredSettings({ selectionTranslate: { prompt: api.LEGACY_TRANSLATE_PROMPT, enabled: true } }).settings;
    assert.equal(migrated.selectionTranslate.prompt, ''); assert.equal(migrated.selectionTranslate.enabled, true);
    assert.equal(api.normalizeStoredSettings({ selectionTranslate: { prompt: 'Custom' } }).settings.selectionTranslate.prompt, 'Custom');
    assert.equal(api.normalizeStoredSettings({ selectionTranslate: { prompt: api.STRUCTURED_TRANSLATE_PROMPT } }).settings.selectionTranslate.prompt, '');
    const prompt = api.buildTranslationPrompt('Translate {{text}} to {{to}}', 'Price $10, {{to}}', 'zh-CN');
    assert.ok(prompt.startsWith('Translate Price $10, {{to}} to zh-CN'));
    assert.ok(!prompt.includes('Return exactly one JSON object'));
    assert.ok(api.buildDetailedTranslationPrompt('future', 'zh-CN', 'Plan for the future.').includes('Return exactly one JSON object'));
    assert.equal(api.buildTranslationPrompt(api.LEGACY_TRANSLATE_PROMPT, 'future', 'zh-CN'), api.buildTranslationPrompt('', 'future', 'zh-CN'));
});

test('detailed word sections are bounded and malformed optional sections do not break meanings', () => {
    const parsed = api.parseTranslationResult(JSON.stringify({ ...word, contextMeaning: '原句含义', collocations: [{ text: 'in the future', translation: '在未来' }], examples: [{ text: 'Our future.', translation: '我们的未来。' }], scenarios: ['日常讨论'], pitfalls: ['注意区别'] }), 'future');
    assert.equal(parsed.kind, 'word'); assert.equal(parsed.collocations[0].text, 'in the future');
    assert.equal(api.translationDefinition(parsed), 'n. 未来；将来');
    const invalid = api.parseTranslationResult(JSON.stringify({ ...word, collocations: Array(6).fill({ text: 'x', translation: 'y' }), examples: [{ text: 'missing' }], scenarios: [{}], pitfalls: [] }), 'future');
    assert.equal(invalid.kind, 'word'); assert.equal(invalid.collocations, undefined); assert.equal(invalid.examples, undefined); assert.equal(invalid.scenarios, undefined);
});

test('details tolerate source echoes, omitted metadata, prose around JSON and explanation lists', () => {
    const selection = 'so you can shape them to your unique needs.';
    const raw = 'Here is the explanation:\n```json\n' + JSON.stringify({ text: 'So you can shape them to your unique needs', translation: '因此你可以根据自己的独特需求进行调整。', explanation: ['so you can 表示目的。', { title: 'shape', text: '表示调整；字符串内的 { } 不影响解析。' }] }) + '\n```';
    const parsed = api.parseDetailedTranslationResult(raw, selection);
    assert.equal(parsed.kind, 'sentence'); assert.equal(parsed.text, selection);
    assert.match(parsed.explanation, /shape：/);
    assert.equal(api.translationDefinition(parsed), '因此你可以根据自己的独特需求进行调整。');
    const wordResult = api.parseDetailedTranslationResult(JSON.stringify({ meanings: [{ pos: 'n.', definition: '未来' }, { definition: '' }], usage: '', example: { text: 'missing translation' }, examples: [{ text: 'Our future.', translation: '我们的未来。' }, {}] }), 'future');
    assert.equal(wordResult.kind, 'word'); assert.equal(wordResult.usage, null);
    assert.equal(wordResult.example, null); assert.equal(wordResult.examples.length, 1);
    assert.equal(api.translationDefinition(wordResult), 'n. 未来');
});

test('plain detailed answers render without saving learning prose; unreadable JSON still retries', () => {
    const prose = '这句话表示根据自己的需求调整工具。\nshape 在这里意为调整。';
    const result = api.parseDetailedTranslationResult(prose, 'shape');
    assert.equal(result.kind, 'text'); assert.equal(result.translation, prose);
    assert.equal(api.translationDefinition(result), null);
    for (const raw of ['', '<think>reason</think>', '{broken', '{}', '```json\n{"translation":"截断', 'Here is JSON: {"kind":"sentence",']) {
        assert.equal(api.parseDetailedTranslationResult(raw, 'shape'), null, raw);
    }
    assert.equal(api.parseDetailedTranslationResult(JSON.stringify({ kind: 'sentence', translation: '调整', explanation: {} }), 'shape').explanation, null);
});

test('phrase metadata and sentence learning fields survive without polluting saved definitions', () => {
    const phrase = api.parseDetailedTranslationResult(JSON.stringify({ kind: 'phrase', meanings: [{ pos: 'phrase', definition: '适合你的需求' }], usage: '常用于谈论定制。' }), 'to your needs');
    assert.equal(phrase.kind, 'word'); assert.equal(phrase.lexicalType, 'phrase');
    assert.equal(api.translationDefinition(phrase), 'phr. 适合你的需求');
    const fallback = api.parseDetailedTranslationResult(JSON.stringify({ kind: 'phrase', translation: '根据需要调整', examples: [{ text: 'Adapt to your needs.', translation: '根据你的需求调整。' }] }), 'adapt to your needs');
    assert.equal(fallback.lexicalType, 'phrase'); assert.equal(fallback.examples.length, 1);
    const sentence = api.parseDetailedTranslationResult(JSON.stringify({ kind: 'sentence', translation: '你可以调整它们。', keyPhrases: [{ text: 'shape them', translation: '调整它们' }, { text: 'missing' }], structure: ['can + 动词原形'], explanation: '' }), 'You can shape them.');
    assert.equal(sentence.keyPhrases.length, 1); assert.equal(sentence.structure, 'can + 动词原形');
    assert.equal(sentence.explanation, null); assert.equal(api.translationDefinition(sentence), '你可以调整它们。');
    const malformed = api.parseDetailedTranslationResult(JSON.stringify({ translation: '译文', keyPhrases: {}, structure: {} }), 'A sentence.');
    assert.equal(malformed.keyPhrases, undefined); assert.equal(malformed.structure, undefined);
});
