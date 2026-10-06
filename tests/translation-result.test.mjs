import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/services/translation-result'; export * from './src/services/detailed-translation-result'; export * from './src/services/translation-prompt'; export { normalizeStoredSettings } from './src/settings-storage';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const word = { kind: 'word', text: 'future', language: 'en', translationLanguage: 'zh-CN', itemType: 'word', meanings: [{ partsOfSpeech: ['noun'], translation: '未来；将来', definition: 'Time that has not happened yet.' }], usage: { notes: ['描述尚未发生的时间。'] }, examples: [{ text: 'Plan for the future.', translation: '为未来做打算。' }] };

test('word and sentence results separate translation, original-language definitions and reading context', () => {
    const parsed = api.parseTranslationResult('<think>reasoning</think>\n```json\n' + JSON.stringify({ ...word, reading: { contextMeaning: '这次计划的未来' } }) + '\n```', 'future');
    assert.equal(parsed.kind, 'word'); assert.equal(parsed.meanings[0].definition, word.meanings[0].definition);
    assert.ok(parsed.meanings[0].id); assert.ok(parsed.examples[0].id);
    assert.equal(api.translationDefinition(parsed), 'n. 未来；将来');
    assert.ok(!api.translationDefinition(parsed).includes('这次计划'));
    const sentence = api.parseTranslationResult(JSON.stringify({ kind: 'sentence', text: 'The future is bright.', translation: '未来是光明的。' }), 'The future is bright.');
    assert.equal(sentence.kind, 'sentence'); assert.equal(api.translationDefinition(sentence), '未来是光明的。');
    assert.equal(api.translationDefinition(api.parseTranslationResult('简单译文', 'future')), '简单译文');
});

test('old field contracts and malformed JSON do not become vocabulary definitions', () => {
    for (const data of [{ ...word, text: 'other' }, { ...word, meanings: [] }, { ...word, meanings: [{ pos: 'noun', definition: '' }] }, { kind: 'word', text: 'future', meanings: [{ pos: 'noun', chinese: '未来' }] }]) {
        const parsed = api.parseTranslationResult(JSON.stringify(data), 'future');
        assert.equal(parsed.kind, 'text'); assert.equal(api.translationDefinition(parsed), null);
    }
    assert.equal(api.translationDefinition(api.parseTranslationResult('{broken JSON', 'future')), null);
    assert.equal(api.parseDetailedTranslationResult('{}', 'future'), null);
    assert.equal(api.parseTranslationResult(JSON.stringify({ ...word, meanings: [{ partsOfSpeech: ['invented'], translation: '未来' }] }), 'future').meanings[0].partsOfSpeech[0], 'unknown');
});

test('custom guidance and dollar signs remain literal while every request uses the shared output contract', () => {
    const prompt = api.buildTranslationPrompt('Translate {{text}} to {{to}}', 'Price $10, {{to}}', 'zh-CN');
    assert.ok(prompt.startsWith('Translate Price $10, {{to}} to zh-CN'));
    assert.ok(prompt.includes('Return exactly one JSON object'));
    assert.ok(prompt.includes('partsOfSpeech'));
    assert.ok(!prompt.includes('"pos"')); assert.ok(!prompt.includes('"collocations"'));
    assert.ok(api.buildDetailedTranslationPrompt('future', 'zh-CN', 'Plan for the future.').includes('reading.contextMeaning'));
    assert.equal(api.normalizeStoredSettings({ selectionTranslate: { prompt: 'Custom' } }).settings.selectionTranslate.prompt, 'Custom');
});

test('malformed optional sections do not hide valid meanings; repeated examples are deduplicated', () => {
    const parsed = api.parseTranslationResult(JSON.stringify({ ...word, examples: [...word.examples, ...word.examples, {}, { text: 'Example without translation.' }], phrases: [{ type: 'collocation', text: 'in the future', translation: '在未来', examples: word.examples }], usage: { notes: [{}], commonMistakes: ['区分 future 和 present'] } }), 'future');
    assert.equal(parsed.kind, 'word'); assert.equal(parsed.examples.length, 2);
    assert.equal(parsed.examples[1].translation, undefined); assert.equal(parsed.usage.notes, undefined);
    assert.equal(parsed.phrases[0].examples[0].text, word.examples[0].text);
    assert.equal(parsed.usage.commonMistakes[0], '区分 future 和 present');
});

test('details tolerate provider wrappers and source echoes without replacing the actual selection', () => {
    const parsed = api.parseDetailedTranslationResult('Here is JSON:\n```json\n' + JSON.stringify({ ...word, text: 'wrong source echo' }) + '\n```', 'future');
    assert.equal(parsed.kind, 'word'); assert.equal(parsed.text, 'future');
    const source = { provider: 'custom', model: 'new-model' };
    const sourced = api.parseDetailedTranslationResult(JSON.stringify(word), 'future', source);
    assert.equal(sourced.sources[0].type, 'ai'); assert.equal(sourced.sources[0].model, 'new-model');
    assert.deepEqual(sourced.meanings[0].sourceIds, [sourced.sources[0].id]);
});

test('plain detailed prose is displayed but never saved as a general definition', () => {
    const prose = '这句话表示根据自己的需求调整工具。';
    const result = api.parseDetailedTranslationResult(prose, 'shape');
    assert.equal(result.kind, 'text'); assert.equal(result.translation, prose); assert.equal(api.translationDefinition(result), null);
    for (const raw of ['', '<think>reason</think>', '{broken', '{}', '```json\n{"translation":"截断', 'Here is JSON: {"kind":"sentence",']) assert.equal(api.parseDetailedTranslationResult(raw, 'shape'), null, raw);
});

test('phrase item types and sentence-only fields do not leak into saved word definitions', () => {
    const phrase = api.parseDetailedTranslationResult(JSON.stringify({ ...word, itemType: 'phrase', meanings: [{ partsOfSpeech: ['phrase'], translation: '适合你的需求' }] }), 'to your needs');
    assert.equal(phrase.itemType, 'phrase'); assert.equal(api.translationDefinition(phrase), 'phr. 适合你的需求');
    const sentence = api.parseDetailedTranslationResult(JSON.stringify({ kind: 'sentence', translation: '你可以调整它们。', keyPhrases: [{ text: 'shape them', translation: '调整它们' }, {}], structure: 'can + 动词原形' }), 'You can shape them.');
    assert.equal(sentence.keyPhrases.length, 1); assert.equal(sentence.structure, 'can + 动词原形');
    assert.equal(api.translationDefinition(sentence), '你可以调整它们。');
});
