import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const result = await build({
    stdin: { contents: "export { TranslationService } from './src/services/translation-service'; export { DEFAULT_SETTINGS } from './src/settings';", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'translation-service-boundary', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const getLanguage = () => "en"; export class App {} export const requestUrl = args => globalThis.__webTranslationRequest(args);' }));
    } }],
});
const { TranslationService, DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const settings = () => {
    const value = structuredClone(DEFAULT_SETTINGS);
    value.aiService = { ...value.aiService, apiUrl: 'https://translation.invalid/v1', model: 'test-model', provider: 'openai-compatible' };
    value.selectionTranslate.prompt = 'Translate {{text}} to {{to}}';
    return value;
};

test('translation sends the selected text, honors target/provider and invalidates cache after settings changes', async () => {
    const requests = [];
    globalThis.__webTranslationRequest = async request => {
        requests.push(request);
        return { status: 200, json: { choices: [{ message: { content: 'translated' } }] } };
    };
    try {
        const config = settings();
        const service = new TranslationService(config, () => 'test-only-key');
        assert.equal(await service.translate(' selected text '), 'translated');
        assert.equal(requests[0].url, 'https://translation.invalid/v1/chat/completions');
        assert.equal(JSON.parse(requests[0].body).messages[0].content, `Translate selected text to ${config.selectionTranslate.targetLang}`);
        await service.translate('selected text'); assert.equal(requests.length, 1);
        config.selectionTranslate.targetLang = 'fr';
        await service.translate('selected text'); assert.equal(requests.length, 2);
        assert.equal(JSON.parse(requests[1].body).messages[0].content, 'Translate selected text to fr');
        config.aiService.model = 'another-model';
        await service.translate('selected text'); assert.equal(requests.length, 3);
    } finally { delete globalThis.__webTranslationRequest; }
});

test('dismissed translation cannot resolve or poison the cache; missing configuration makes no request', async () => {
    let resolve;
    let calls = 0;
    globalThis.__webTranslationRequest = () => { calls++; return new Promise(done => { resolve = done; }); };
    try {
        const service = new TranslationService(settings(), () => 'test-only-key');
        const pending = service.translate('hello');
        service.abort();
        resolve({ status: 200, json: { choices: [{ message: { content: 'stale' } }] } });
        await assert.rejects(pending);
        globalThis.__webTranslationRequest = async () => { calls++; return { status: 200, json: { choices: [{ message: { content: 'fresh' } }] } }; };
        assert.equal(await service.translate('hello'), 'fresh');
        assert.equal(calls, 2);
        const unconfigured = new TranslationService(settings(), () => '');
        await assert.rejects(unconfigured.translate('hello'));
        assert.equal(calls, 2);
    } finally { delete globalThis.__webTranslationRequest; }
});
