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
        assert.ok(JSON.parse(requests[0].body).messages[0].content.startsWith(`Translate selected text to ${config.selectionTranslate.targetLang}`));
        assert.ok(JSON.parse(requests[0].body).messages[0].content.includes('Return exactly one JSON object'));
        await service.translate('selected text'); assert.equal(requests.length, 1);
        config.selectionTranslate.targetLang = 'fr';
        await service.translate('selected text'); assert.equal(requests.length, 2);
        assert.ok(JSON.parse(requests[1].body).messages[0].content.startsWith('Translate selected text to fr'));
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

test('translation service blocks accidental selections before requesting AI and sends cleaned words', async () => {
    const requests = [];
    globalThis.__webTranslationRequest = async request => {
        requests.push(request);
        return { status: 200, json: { choices: [{ message: { content: 'translated' } }] } };
    };
    try {
        const service = new TranslationService(settings(), () => 'test-only-key');
        for (const text of ['。', '123', 'hello_world', 'word/word', 'word@word', 'a+b']) {
            await assert.rejects(service.translate(text));
        }
        assert.equal(requests.length, 0);
        await service.translate('**hello**');
        assert.ok(JSON.parse(requests[0].body).messages[0].content.startsWith('Translate hello to zh-CN'));
        for (const text of ['hello', '_hello', 'hello_', '#hello', '***hello__,']) await service.translate(text);
        assert.equal(requests.length, 1, 'cleaned selections share the cache');
    } finally { delete globalThis.__webTranslationRequest; }
});

test('structured default supports existing OpenAI-compatible, Claude and Gemini response envelopes', async () => {
    const json = JSON.stringify({ kind: 'word', text: 'future', meanings: [{ pos: 'noun', definition: '未来' }], usage: null, example: null });
    try {
        for (const provider of ['openai-compatible', 'anthropic', 'gemini']) {
            const config = settings(); config.selectionTranslate.prompt = ''; config.aiService.provider = provider;
            let request;
            globalThis.__webTranslationRequest = async value => {
                request = value;
                return { status: 200, json: provider === 'anthropic' ? { content: [{ text: json }] }
                    : provider === 'gemini' ? { candidates: [{ content: { parts: [{ text: json }] } }] }
                    : { choices: [{ message: { content: json } }] } };
            };
            const service = new TranslationService(config, () => 'test-only-key');
            assert.equal(await service.translateDetailed('future', 'Plan for the future.'), json);
            const body = JSON.parse(request.body);
            const prompt = provider === 'gemini' ? body.contents[0].parts[0].text : body.messages[0].content;
            assert.ok(prompt.includes('Return exactly one JSON object'));
            assert.ok(prompt.includes('Selection: "future"'));
            assert.ok(prompt.includes('Target language: zh-CN'));
        }
    } finally { delete globalThis.__webTranslationRequest; }
});

test('custom explanation prompt applies to words and sentences, preserves the output contract and invalidates cached details', async () => {
    const prompts = [];
    globalThis.__webTranslationRequest = async request => {
        prompts.push(JSON.parse(request.body).messages[0].content);
        return { status: 200, json: { choices: [{ message: { content: 'result' } }] } };
    };
    try {
        const config = settings();
        config.selectionTranslate.explanationPrompt = 'Explain {{text}} using {{context}} in {{to}}. Focus on grammar.';
        config.selectionTranslate.targetLang = 'ja';
        const service = new TranslationService(config, () => 'test-only-key');
        await service.translateDetailed('future', 'Plan for the future.');
        assert.ok(prompts[0].startsWith('Explain future using Plan for the future. in ja. Focus on grammar.'));
        assert.ok(prompts[0].includes('Return exactly one JSON object'));
        assert.ok(prompts[0].includes('Target language: ja'));
        await service.translateDetailed('The future is bright.', 'Context');
        assert.ok(prompts[1].startsWith('Explain The future is bright. using Context in ja.'));
        assert.ok(prompts[1].includes('"kind":"sentence"'));
        await service.translateDetailed('future', 'Plan for the future.');
        assert.equal(prompts.length, 2);
        config.selectionTranslate.explanationPrompt = 'Use beginner-friendly explanations.';
        await service.translateDetailed('future', 'Plan for the future.');
        assert.ok(prompts[2].startsWith('Use beginner-friendly explanations.'));
        config.selectionTranslate.explanationPrompt = '  ';
        await service.translateDetailed('future', 'Plan for the future.');
        assert.ok(prompts[3].startsWith('Explain the selection for a language learner.'));
        await service.translate('future');
        assert.ok(prompts[4].startsWith('Translate future to ja'));
    } finally { delete globalThis.__webTranslationRequest; }
});

test('simple translation uses shared fields and detailed requests cache separately by bounded context', async () => {
    const requests = [];
    globalThis.__webTranslationRequest = async request => {
        requests.push(request);
        return { status: 200, json: { choices: [{ message: { content: 'result' } }] } };
    };
    try {
        const config = settings(); config.selectionTranslate.prompt = '';
        const service = new TranslationService(config, () => 'test-only-key');
        await service.translate('future');
        let prompt = JSON.parse(requests[0].body).messages[0].content;
        assert.ok(prompt.includes('Return exactly one JSON object'));
        assert.ok(prompt.includes('partsOfSpeech'));
        await service.translateDetailed('future', 'Context one');
        await service.translateDetailed('future', 'Context one');
        assert.equal(requests.length, 2);
        prompt = JSON.parse(requests[1].body).messages[0].content;
        assert.ok(prompt.includes('"phrases"')); assert.ok(prompt.includes('Context: "Context one"'));
        await service.translateDetailed('future', 'Context two'); assert.equal(requests.length, 3);
        await service.translateDetailed('future', 'x'.repeat(1000) + 'PRIVATE_TAIL');
        assert.ok(!JSON.parse(requests[3].body).messages[0].content.includes('PRIVATE_TAIL'));
        await service.translate('future'); assert.equal(requests.length, 4);
    } finally { delete globalThis.__webTranslationRequest; }
});
