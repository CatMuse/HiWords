import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Run production TypeScript with a minimal Obsidian boundary; no vault or network access.
const bundled = await build({
    stdin: {
        contents: `
            export { TFile } from 'obsidian';
            export { createEmptyWordCard } from './src/editor/hiwords-document';
            export { createEmptyHiWordsPack } from './src/editor/hiwords-document';
            export { isHiWordsPack } from './src/schema/hiwords';
            export { normalizeStoredSettings } from './src/settings-storage';
            export { mergeGeneratedContent } from './src/services/hiwords-generation-service';
            export { HiWordsMutationService } from './src/services/hiwords-mutation-service';
            export { setCanvasNodeSentences, getCanvasSentencesFromSections } from './src/canvas/canvas-note';
        `,
        resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{
        name: 'obsidian-test-boundary',
        setup(build) {
            build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
            build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
                export class TFile { constructor(path) { this.path = path; this.extension = path.split('.').pop(); } }
                export const getLanguage = () => 'en';
                export const requestUrl = () => { throw new Error('Unexpected network request'); };
            ` }));
        },
    }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('legacy plaintext credentials are removed without losing the selected secret or provider', () => {
    const result = api.normalizeStoredSettings({ aiService: {
        apiKey: 'test-only-legacy-value', apiKeySecretId: 'my-provider', provider: 'gemini',
    } });
    assert.equal(Object.hasOwn(result.settings.aiService, 'apiKey'), false);
    assert.equal(result.settings.aiService.apiKeySecretId, 'my-provider');
    assert.equal(result.settings.aiService.provider, 'gemini');
    assert.equal(result.hadLegacyAPIKeyField, true);
    assert.equal(result.discardedLegacyAPIKey, true);
    assert.equal(api.normalizeStoredSettings(result.settings).hadLegacyAPIKeyField, false);
});

test('loading rejects mismatched image and list values before they reach card renderers', () => {
    const pack = api.createEmptyHiWordsPack('Test');
    pack.cards = [api.createEmptyWordCard()];
    pack.fields = [{ id: 'field', label: 'Field', type: 'image' }];
    pack.cards[0].fieldValues = { field: [{ path: 'photo.png' }] };
    assert.equal(api.isHiWordsPack(pack), true);
    pack.fields[0].type = 'list';
    assert.equal(api.isHiWordsPack(pack), false);
    pack.cards[0].fieldValues.field = ['text'];
    assert.equal(api.isHiWordsPack(pack), true);
    pack.fields[0].type = 'image';
    assert.equal(api.isHiWordsPack(pack), false);
});

test('typed custom fields accept false, zero, and absent values without coercion', () => {
    const pack = api.createEmptyHiWordsPack('Test');
    pack.cards = [api.createEmptyWordCard()];
    pack.fields = [{ id: 'number', label: 'Number', type: 'number' }, { id: 'flag', label: 'Flag', type: 'boolean' }];
    assert.equal(api.isHiWordsPack(pack), true);
    pack.cards[0].fieldValues = { number: 0, flag: false };
    assert.equal(api.isHiWordsPack(pack), true);
    pack.cards[0].fieldValues.flag = 'false';
    assert.equal(api.isHiWordsPack(pack), false);
});

test('AI fills a new card with generated meanings instead of retaining the noun placeholder', () => {
    const card = api.createEmptyWordCard();
    card.title = 'quickly';
    const meanings = [{ id: 'generated', partOfSpeech: 'adverb', translation: '迅速地', definition: 'At speed.' }];
    assert.deepEqual(api.mergeGeneratedContent(card, { meanings }).data.meanings, meanings);
    assert.equal(card.data.meanings[0].translation, '', 'draft generation must not mutate the saved card');
});

test('AI preserves existing meanings and fills only missing matching content', () => {
    const card = api.createEmptyWordCard();
    card.data.meanings[0].translation = '我的释义';
    const result = api.mergeGeneratedContent(card, { meanings: [
        { id: 'generated', partOfSpeech: 'noun', translation: 'AI 释义', definition: 'AI definition' },
    ] });
    assert.equal(result.data.meanings[0].translation, '我的释义');
    assert.equal(result.data.meanings[0].definition, 'AI definition');
    assert.equal(result.data.meanings[0].id, card.data.meanings[0].id);
});

function readSentences(text) {
    const sections = text.split(/\n\s*---\s*\n/).map(part => {
        const [heading, ...body] = part.trim().split('\n');
        return { title: heading.replace(/^\*\*|\*\*$/g, ''), content: body.join('\n') };
    });
    return api.getCanvasSentencesFromSections(sections);
}

function canvasFixture() {
    const file = new api.TFile('words.canvas');
    let content = JSON.stringify({ nodes: [{ id: 'word', type: 'text', x: 12, y: 34, width: 300, height: 200,
        text: api.setCanvasNodeSentences('word\n\n**Definition**\nOriginal definition', [
            { id: 'existing', text: 'The existing sentence.', translation: '已有例句。', source: 'Source.md' },
        ]) }], edges: [] });
    let queue = Promise.resolve();
    const plugin = {
        app: { vault: {
            getAbstractFileByPath: () => file,
            process: (_file, update) => {
                queue = queue.then(() => { content = update(content); });
                return queue;
            },
        } },
        vocabularyManager: {
            reloadVocabularyBook: async () => {},
            getWordDefinitionByNodeId: async () => ({ savedSentences: readSentences(JSON.parse(content).nodes[0].text) }),
        },
        refreshHighlighter: () => {},
    };
    return {
        service: new api.HiWordsMutationService(plugin),
        definition: () => ({ source: file.path, nodeId: 'word', canvasNodeType: 'text', savedSentences: [] }),
        canvas: () => JSON.parse(content),
        sentences: () => readSentences(JSON.parse(content).nodes[0].text),
    };
}

test('Canvas sentence saving retains newer disk content despite a stale definition', async () => {
    const fixture = canvasFixture();
    assert.deepEqual(await fixture.service.toggleSentence(fixture.definition(), { text: 'Another sentence.' }), { success: true, saved: true });
    assert.deepEqual(fixture.sentences().map(item => item.text), ['The existing sentence.', 'Another sentence.']);
    assert.equal(fixture.sentences()[0].source, 'Source.md');
    assert.equal(fixture.canvas().nodes[0].x, 12);
    assert.match(fixture.canvas().nodes[0].text, /Original definition/);
});

test('Canvas sentence removal checks current disk data with normalized matching', async () => {
    const fixture = canvasFixture();
    assert.deepEqual(await fixture.service.toggleSentence(fixture.definition(), { text: ' THE   EXISTING sentence. ' }), { success: true, saved: false });
    assert.deepEqual(fixture.sentences(), []);
});

test('concurrent Canvas sentence additions do not overwrite each other', async () => {
    const fixture = canvasFixture();
    await Promise.all([
        fixture.service.toggleSentence(fixture.definition(), { text: 'First addition.' }),
        fixture.service.toggleSentence(fixture.definition(), { text: 'Second addition.' }),
    ]);
    assert.deepEqual(fixture.sentences().map(item => item.text), ['The existing sentence.', 'First addition.', 'Second addition.']);
});
