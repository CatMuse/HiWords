import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
    stdin: { contents: "export * from './src/web/web-vocabulary'; export { WebWordIndex } from './src/web/web-word-index'; export * from './src/web/page-runtime'; export * from './src/web/page-interactions'; export * from './src/web/page-surface'; export { WebHighlighter } from './src/web/web-highlighter';", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'browser', format: 'esm', minify: true, target: 'es2018',
    plugins: [{ name: 'desktop-boundary', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const Platform = { isDesktopApp: true };' }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('web matching preserves case, boundaries, aliases and longest nonoverlapping matches', () => {
    const { trie } = api.buildWebVocabulary([
        { word: 'take', color: '#111111' },
        { word: 'take into account', aliases: ['consider'], color: '#222222' },
        { word: 'ephemeral', color: '#333333' },
    ], value => value);
    const text = 'Take into account CONSIDER ephemeral ephemeralness.';
    const [result] = api.matchWebTexts([{ id: 1, text }], trie);
    assert.deepEqual(result.ranges.map(r => [text.slice(r.from, r.to), r.color]), [
        ['Take into account', 1], ['CONSIDER', 1], ['ephemeral', 2],
    ]);
});

test('untrusted page snapshots are bounded and cannot carry vocabulary metadata back into the page', () => {
    const { trie } = api.buildWebVocabulary([{ word: 'hello', source: 'private.canvas', definition: 'private meaning', color: '#123456' }], value => value);
    for (const value of [null, {}, Array(257).fill({ id: 1, text: 'hello' })]) assert.deepEqual(api.matchWebTexts(value, trie), []);
    const results = api.matchWebTexts([null, { id: -1, text: 'hello' }, { id: 2, text: {} }, { id: 3, text: 'x'.repeat(200001) }, { id: 4, text: 'hello' }], trie);
    assert.deepEqual(results, [{ id: 4, text: 'hello', ranges: [{ from: 0, to: 5, color: 0, token: 1 }] }]);
    const serialized = api.pageScript({ action: 'apply', nodes: results });
    assert.ok(!serialized.includes('private.canvas') && !serialized.includes('private meaning'));
});

test('production-minified guest script has no external runtime dependencies and safely encodes page text', () => {
    const context = vm.createContext({ window: {}, CSS: {}, document: {} });
    const script = api.pageScript({ action: 'apply', nodes: [{ id: 1, text: '\");throw new Error("injected");//', ranges: [] }] });
    const result = vm.runInContext(script, context);
    assert.equal(result.supported, false);
    assert.equal(vm.runInContext(api.pageScript({ action: 'stop' }), context).nodes.length, 0);
});

test('web styles use isolated highlight names and a documented bold fallback', () => {
    const css = api.webHighlightCSS(['#123456'], 'wavy', 'test-owner');
    assert.match(css, /::highlight\(test-owner-0\)/);
    assert.match(css, /text-decoration-style:wavy/);
    assert.match(api.webHighlightCSS(['#123456'], 'bold'), /background-color:/);
});


test('rapid off/on reconnects immediately after cleanup without waiting for background discovery', async () => {
    const originals = Object.fromEntries(['window', 'document', 'getComputedStyle', 'CSS'].map(key => [key, globalThis[key]]));
    const timers = new Map();
    let nextTimer = 0;
    const scripts = [];
    const view = {
        isConnected: true, getURL: () => 'https://example.test/',
        addEventListener() {}, removeEventListener() {},
        insertCSS: async () => 'css-key', removeInsertedCSS: async () => {},
        executeJavaScript: async script => { scripts.push(script); return { supported: true, nodes: [], pending: false }; },
    };
    const callbacks = [];
    const plugin = {
        settings: { enableAutoHighlight: true, enableWebHighlight: true, highlightStyle: 'underline' },
        vocabularyManager: { getStudyDefinitions: () => [{ word: 'hello' }] },
        clearWebWordInSidebar() {}, refreshWebSidebar() {}, addChild() {},
        definitionPopover: { closeForOwner() {} }, selectionTranslatePopover: { closeForOwner() {} },
        register: callback => callbacks.push(callback), registerEvent() {}, registerInterval() {},
        app: { workspace: { on() {}, onLayoutReady: callback => callback(),
            getLeavesOfType: () => [{ view: { containerEl: { querySelectorAll: () => [view] } } }],
        } },
    };
    const flush = () => new Promise(resolve => setImmediate(resolve));
    try {
        globalThis.window = {
            setInterval: () => 999, // Never fire discovery: background timers may be throttled.
            setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
            clearTimeout: id => timers.delete(id),
        };
        globalThis.document = { body: {} };
        globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
        globalThis.CSS = { supports: () => true };
        const manager = new api.WebHighlighter(plugin);
        plugin.settings.enableWebHighlight = false;
        manager.refresh();
        plugin.settings.enableWebHighlight = true;
        manager.refresh();
        await flush();
        assert.equal(timers.size, 1, 'cleanup should schedule the replacement session immediately');
        const [id, callback] = timers.entries().next().value;
        timers.delete(id); callback(); await flush();
        assert.ok(scripts.some(script => script.includes('"action":"stop"')));
        assert.ok(scripts.some(script => script.includes('"action":"reset"')));
        callbacks.forEach(callback => callback());
        await flush();
        assert.equal(timers.size, 0, 'unload must not reconnect or leave timers');
    } finally {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});


test('web click tokens resolve aliases to the canonical local card and reject stale or unissued tokens', () => {
    const definition = { word: 'take into account', aliases: ['consider'], source: 'private.canvas', nodeId: 'card-1' };
    const { trie, tokens } = api.buildWebVocabulary([definition], color => color);
    const [result] = api.matchWebTexts([{ id: 1, text: 'CONSIDER' }], trie);
    const token = result.ranges[0].token;
    assert.equal(api.resolveWebClick({ token, generation: 7 }, 7, tokens, new Set([token])), definition);
    for (const value of [null, { token, generation: 6 }, { token: '1', generation: 7 }, { token: 999, generation: 7 }, { token: 1.5, generation: 7 }]) {
        assert.equal(api.resolveWebClick(value, 7, tokens, new Set([token])), undefined);
    }
    assert.equal(api.resolveWebClick({ token, generation: 7 }, 7, tokens, new Set()), undefined);
});


test('page interactions require a real single click inside a range, preserve links and remove listeners', () => {
    const originals = Object.fromEntries(['document', 'Element', 'Node'].map(key => [key, globalThis[key]]));
    const listeners = new Map();
    const clicks = [];
    let link = false, collapsed = true;
    class Element { closest(selector) { return selector === 'a[href]' && link ? this : null; } }
    const target = new Element();
    const node = { nodeType: 3, data: 'hello', isConnected: true };
    const range = { getClientRects: () => [{ left: 10, right: 50, top: 10, bottom: 30, width: 40 }] };
    const entry = { node, text: 'hello', ranges: [{ range, token: 4 }] };
    try {
        globalThis.Element = Element; globalThis.Node = { TEXT_NODE: 3 };
        globalThis.document = {
            addEventListener: (type, handler) => listeners.set(type, handler),
            removeEventListener: type => listeners.delete(type),
            getSelection: () => ({ isCollapsed: collapsed }),
            caretPositionFromPoint: () => ({ offsetNode: node }),
        };
        const cleanup = api.installWebInteractions(new Map([[1, entry]]), new WeakMap([[node, 1]]), 9, value => clicks.push(value));
        function fire(overrides = {}, start = {}) {
            const event = { isTrusted: true, button: 0, detail: 1, clientX: 20, clientY: 20, target,
                preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...overrides };
            listeners.get('pointerdown')({ ...event, ...start });
            listeners.get('click')(event); return event;
        }
        fire(); assert.deepEqual(clicks, [{ token: 4, generation: 9 }]);
        for (const overrides of [{ isTrusted: false }, { detail: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { clientX: 90 }]) fire(overrides);
        fire({}, { clientX: 0 });
        collapsed = false; fire(); collapsed = true;
        node.data = 'changed'; fire(); node.data = 'hello';
        assert.equal(clicks.length, 1);
        link = true;
        assert.equal(fire().prevented, undefined);
        assert.equal(clicks.length, 1);
        assert.equal(fire({ altKey: true }).prevented, true);
        assert.equal(clicks.length, 2);
        cleanup(); assert.equal(listeners.size, 0);
    } finally {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});

test('web surface rejects malformed geometry, excessive selections and obsolete page generations', () => {
    const rect = { left: 1, top: 2, right: 60, bottom: 24 };
    const valid = { kind: 'selection', generation: 3, text: 'hello', sentence: 'hello world', rect };
    assert.deepEqual(api.validateSurfaceEvent(valid, 3), valid);
    for (const value of [null, { ...valid, generation: 2 }, { ...valid, text: 'x'.repeat(501) }, { ...valid, sentence: 'x'.repeat(1201) }, { ...valid, rect: { ...rect, left: NaN } }, { ...valid, rect: { ...rect, bottom: 0 } }, { ...valid, kind: 'execute' }, { ...valid, kind: 'hover', token: '1' }]) {
        assert.equal(api.validateSurfaceEvent(value, 3), undefined);
    }
});


test('page word index deduplicates occurrences and aliases, retains mastered entries and drops removed or hidden text', () => {
    const a = { word: 'ephemeral', aliases: ['brief'], studyKey: 'a', mastered: true };
    const b = { word: 'tablets', studyKey: 'b' };
    const vocab = api.buildWebVocabulary([a, b], c => c);
    const index = new api.WebWordIndex();
    index.update(api.matchWebTexts([{id: 1, text: 'brief ephemeral tablets'}, {id: 2, text: 'tablets'}], vocab.trie), []);
    assert.deepEqual(index.words(vocab.tokens), [a, b]);
    index.update([], [1]);
    assert.deepEqual(index.words(vocab.tokens), [b]);
    index.update(api.matchWebTexts([{id: 2, text: 'no matches'}], vocab.trie), []);
    assert.deepEqual(index.words(vocab.tokens), []);
    index.update(api.matchWebTexts([{id: 3, text: 'brief'}], vocab.trie), []);
    index.clear();
    assert.deepEqual(index.words(vocab.tokens), []);
});
