import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({
    stdin: { contents: `export * from './src/services/ai-client'; export * from './src/services/ai-profiles'; export { DictionaryService } from './src/services/dictionary-service'; export { TranslationService } from './src/services/translation-service'; export { normalizeStoredSettings } from './src/settings-storage'; export { DEFAULT_SETTINGS } from './src/settings';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'ai-boundary', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const getLanguage = () => 'en'; export const requestUrl = config => globalThis.__aiRequest(config);` }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.window = globalThis;
const config = (overrides = {}) => ({ ...api.DEFAULT_SETTINGS.aiService, ...overrides });
const response = json => ({ status: 200, json });

test('Anthropic base URLs and pasted endpoints produce exactly one version path', async () => {
    const requests = [];
    globalThis.__aiRequest = async request => { requests.push(request); return response({ content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'OK' }] }); };
    for (const apiUrl of ['https://proxy.example', 'https://proxy.example/v1/', 'https://proxy.example/v1/messages']) {
        assert.equal(await new api.AIClient(config({ provider: 'anthropic', apiUrl }), 'secret').generate('test'), 'OK');
        assert.equal(requests.at(-1).url, 'https://proxy.example/v1/messages');
        assert.equal(requests.at(-1).headers['x-api-key'], 'secret');
    }
});

test('explicit custom protocol overrides domain hints; Gemini auth stays out of URLs', async () => {
    let request;
    globalThis.__aiRequest = async value => { request = value; return response({ candidates: [{ content: { parts: [{ text: 'first' }, { text: 'second' }] } }] }); };
    const custom = config({ provider: 'custom', apiProtocol: 'gemini', apiUrl: 'https://proxy.example/v1beta/models/old:generateContent', model: 'models/new' });
    assert.equal(await new api.AIClient(custom, 'key&value').generate('test'), 'first\nsecond');
    assert.equal(request.url, 'https://proxy.example/v1beta/models/new:generateContent');
    assert.equal(request.headers['x-goog-api-key'], 'key&value');
    assert.equal(api.resolveAIProtocol(config({ provider: 'custom', apiUrl: 'https://api.anthropic.com' })), 'anthropic');
});

test('dictionary and translation accept the same wrapped array response and extra parameters', async () => {
    const requests = [];
    globalThis.__aiRequest = async request => { requests.push(request); return response({ data: { choices: [{ message: { content: [{ type: 'text', text: 'hello' }, { type: 'text', text: '你好' }] } }] } }); };
    const settings = structuredClone(api.DEFAULT_SETTINGS);
    settings.aiService.extraParams = '{"temperature":0.7,"vendor":{"enabled":true}}';
    const dictionary = new api.DictionaryService({ service: settings.aiService, apiKey: 'secret', prompt: 'Define {{word}}' });
    const translation = new api.TranslationService(settings, () => 'secret');
    assert.equal(await dictionary.fetchDefinition('hello'), 'hello\n你好');
    assert.equal(await translation.translate('hello'), 'hello\n你好');
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => JSON.parse(request.body).temperature === 0.7 && JSON.parse(request.body).vendor.enabled));
});

test('model discovery paginates, deduplicates and never sends a generation request', async () => {
    const requests = [];
    globalThis.__aiRequest = async request => {
        requests.push(request);
        return response(request.url.includes('after_id=') ? { data: [{ id: 'a' }, { id: 'b' }] } : { data: [{ id: 'b' }], has_more: true, last_id: 'b' });
    };
    assert.deepEqual(await new api.AIClient(config({ provider: 'anthropic', apiUrl: 'https://proxy.example/v1/messages' }), 'secret').listModels(), ['a', 'b']);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.method === 'GET' && !request.body));
    assert.ok(requests[1].url.includes('after_id=b'));
});

test('Gemini discovery filters incompatible models and repeated pagination fails', async () => {
    globalThis.__aiRequest = async () => response({ models: [{ name: 'models/chat', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] });
    assert.deepEqual(await new api.AIClient(config({ provider: 'gemini', apiUrl: 'https://proxy.example' }), 'secret').listModels(), ['chat']);
    let calls = 0;
    globalThis.__aiRequest = async () => { calls++; return response({ data: [], has_more: true, last_id: 'same' }); };
    await assert.rejects(new api.AIClient(config(), 'secret').listModels(), /complete model list/);
    assert.equal(calls, 2);
});

test('failed or truncated generation is not silently replayed and keys are redacted', async () => {
    let calls = 0;
    globalThis.__aiRequest = async () => { calls++; return { status: 429, json: { error: { message: 'rate limit for secret-value' } } }; };
    await assert.rejects(new api.AIClient(config(), 'secret-value').generate('test'), error => error.message.includes('HTTP 429') && !error.message.includes('secret-value'));
    assert.equal(calls, 1);
    globalThis.__aiRequest = async () => response({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    await assert.rejects(new api.AIClient(config(), 'secret').generate('test'), /truncated/);
});

test('timeout releases the caller without replaying a late generation', async () => {
    let finish;
    let calls = 0;
    globalThis.__aiRequest = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const client = new api.AIClient(config(), 'secret');
    // Shorten only the wait, using the same production transport path.
    await assert.rejects(client.request({ url: 'https://proxy.example/v1/models', method: 'GET' }, 5), /timeout/);
    finish(response({ data: [] }));
    assert.equal(calls, 1);
});

test('legacy settings migrate to independent profiles and strip keys from inactive profiles too', () => {
    const normalized = api.normalizeStoredSettings({ aiService: { provider: 'custom', apiUrl: 'https://api.anthropic.com', model: 'mine', apiKey: 'legacy', apiKeySecretId: 'keychain-name' }, aiProfiles: { gemini: { apiKey: 'inactive', model: 'saved', apiKeySecretId: 'other' } } });
    assert.equal(normalized.discardedLegacyAPIKey, true);
    assert.equal(normalized.hadLegacyAPIKeyField, true);
    assert.equal(api.resolveAIProtocol(normalized.settings.aiService), 'anthropic');
    assert.ok(!JSON.stringify(normalized.settings).includes('legacy'));
    assert.ok(!JSON.stringify(normalized.settings).includes('inactive'));
    api.switchAIProvider(normalized.settings, 'gemini');
    assert.equal(normalized.settings.aiService.model, 'saved');
    api.switchAIProvider(normalized.settings, 'anthropic');
    assert.equal(normalized.settings.aiService.apiKeySecretId, '');
    api.switchAIProvider(normalized.settings, 'custom');
    assert.equal(normalized.settings.aiService.apiKeySecretId, 'keychain-name');
    assert.equal(normalized.settings.aiService.model, 'mine');
});

test('invalid URL and parameter JSON fail before making a network request', async () => {
    globalThis.__aiRequest = () => { throw new Error('Unexpected request'); };
    for (const apiUrl of ['file:///tmp/model', 'https://user:password@proxy.example', 'https://proxy.example/v1?key=secret']) {
        await assert.rejects(new api.AIClient(config({ apiUrl }), 'secret').generate('test'), /HTTP\(S\)/);
    }
    await assert.rejects(new api.AIClient(config({ extraParams: '[]' }), 'secret').generate('test'), /JSON object/);
});

test('OpenAI-format requests use one schema regardless of model ID', async () => {
    const requests = [];
    globalThis.__aiRequest = async request => {
        const body = JSON.parse(request.body);
        requests.push(body);
        if ('max_tokens' in body || 'temperature' in body) {
            return { status: 400, json: { error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } } };
        }
        return response({ choices: [{ message: { content: 'OK' } }] });
    };
    for (const model of ['gpt-6.1-sol', 'gateway-alias', 'gpt-4o-mini', 'deepseek-chat', 'qwen3', 'ft:custom-model']) {
        assert.equal(await new api.AIClient(config({ model }), 'secret').generate('Reply only OK.', 32), 'OK');
        assert.equal(requests.at(-1).max_completion_tokens, 4096);
    }
    const settings = structuredClone(api.DEFAULT_SETTINGS);
    settings.aiService.model = 'gpt-6.1-sol';
    assert.equal(await new api.TranslationService(settings, () => 'secret').translate('hello'), 'OK');
    assert.equal(await new api.DictionaryService({ service: settings.aiService, apiKey: 'secret', prompt: 'Define {{word}}' }).fetchDefinition('hello'), 'OK');
    await new api.AIClient(settings.aiService, 'secret').generate('card', 6000);
    assert.equal(requests.at(-1).max_completion_tokens, 6000);
    assert.equal(requests.length, 9, 'each operation sends one correctly formed request without retries');
});

test('extra parameters are applied literally without legacy conversion; other protocols retain their own fields', async () => {
    let body;
    globalThis.__aiRequest = async request => {
        body = JSON.parse(request.body);
        return response(body.contents ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }] }
            : body.model === 'claude' ? { content: [{ text: 'OK' }] } : { choices: [{ message: { content: 'OK' } }] });
    };
    await new api.AIClient(config({ extraParams: '{"max_completion_tokens":8192,"reasoning_effort":"low"}' }), 'secret').generate('test');
    assert.equal(body.max_completion_tokens, 8192);
    assert.equal(body.reasoning_effort, 'low');
    assert.ok(!('max_tokens' in body));
    await new api.AIClient(config({ extraParams: '{"max_tokens":9000,"temperature":0.7}' }), 'secret').generate('test');
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.max_tokens, 9000, 'legacy parameters are not silently converted or removed');
    assert.equal(body.temperature, 0.7);
    await new api.AIClient(config({ provider: 'anthropic', model: 'claude' }), 'secret').generate('test', 500);
    assert.equal(body.max_tokens, 500);
    assert.ok(!('max_completion_tokens' in body));
    await new api.AIClient(config({ provider: 'gemini' }), 'secret').generate('test', 500);
    assert.equal(body.generationConfig.maxOutputTokens, 500);
});
