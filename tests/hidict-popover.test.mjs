import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({
    stdin: { contents: `export {SelectionTranslatePopover} from './src/ui/selection-translate-popover'; export {AiDetailPanel} from './src/ui/ai-detail-panel'; export {aiDetailPosition} from './src/ui/ai-detail-position'; export {clampAiDetailRect} from './src/ui/ai-detail-interactions'; export {DEFAULT_SETTINGS} from './src/settings';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'obsidian', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export class Component { cleanups=[]; addChild() {} removeChild(child) {child.cleanups.splice(0).forEach(fn=>fn())} register(fn){this.cleanups.push(fn)} registerDomEvent(target,name,fn,options) {target.addEventListener(name,fn,options);this.register(()=>target.removeEventListener(name,fn,options))} } export class View {} export class MarkdownView extends View {} export class App {} export const getLanguage = () => 'en'; export const setIcon = () => {}; export const requestUrl = () => { throw Error('Unexpected AI request'); };` }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
// Minimal DOM boundary exercises the real controller/renderer, including action state.
class Element {
    children = []; listeners = {}; style = {}; attributes = {}; disabled = false; value = '';
    constructor(tag = 'div', options = {}) { this.tag = tag; this.className = options.cls || ''; this.textContent = options.text || ''; this.value = options.value || ''; Object.assign(this.attributes, options.attr); }
    classList = { add: name => this.className += ' ' + name, remove: name => this.className = this.className.split(' ').filter(c => c !== name).join(' ') };
    get isConnected() { return this.root || !!this.parentNode?.isConnected; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    createEl(tag, options) { return this.appendChild(new Element(tag, options)); }
    createDiv(options) { return this.createEl('div', options); }
    createSpan(options) { return this.createEl('span', options); }
    empty() { this.children.forEach(child => child.parentNode = undefined); this.children = []; this.textContent = ''; }
    remove() { this.parentNode?.removeChild(this); }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = undefined; }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, v) { this.listeners[k] = v; }
    removeEventListener(k, v) { if (this.listeners[k] === v) delete this.listeners[k]; }
    closest(tag) { return this.tag === tag ? this : this.parentNode?.closest(tag); }
    focus() { this.focused = true; }
    fire(name, event = {}) { if (!this.disabled) this.listeners[name]?.({ target: this, stopPropagation() {}, preventDefault() {}, ...event }); }
    contains(child) { return this === child || this.children.some(c => c.contains(child)); }
    getBoundingClientRect() { return { width: 350, height: 220 }; }
    find(cls) { return this.className.split(' ').includes(cls) ? this : this.children.map(c => c.find(cls)).find(Boolean); }
    all(tag) { return [...(this.tag === tag ? [this] : []), ...this.children.flatMap(c => c.all(tag))]; }
}
const entry = (word, definition) => ({ word, meanings: [{ partsOfSpeech: ['noun'], sourceLabels: ['n'], definitions: [definition] }], phonetics: { uk: null, us: null, unclassified: 'test' }, frequency: { level: 4 }, forms: [{ word: word + 's', types: ['plural'] }] });
function events(target) {
    const listeners = new Map();
    target.addEventListener = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
    target.removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
    target.fire = (name, event = {}) => { for (const fn of [...(listeners.get(name) || [])]) fn({ preventDefault() {}, stopPropagation() {}, ...event }); };
    target.listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    return target;
}
function fixture(lookup, controllerApi = api) {
    const body = new Element(); body.root = true;
    const win = events({ scrollX: 0, scrollY: 0, innerWidth: 900, innerHeight: 600, requestAnimationFrame: cb => cb() });
    globalThis.window = win;
    const doc = events({ body, defaultView: win, documentElement: { scrollTop: 0, scrollLeft: 0 }, createDocumentFragment: () => new Element('fragment') });
    const added = [];
    const plugin = { settings: { ...structuredClone(api.DEFAULT_SETTINGS), hidictPath: 'test.hidict' }, getAIAPIKey: () => '', hidictService: { lookup }, addOrEditWord: (...args) => added.push(args) };
    const popover = new controllerApi.SelectionTranslatePopover(plugin);
    const owner = {};
    const context = { owner, sourcePath: 'note.md', sentence: 'Some context.', document: doc, isCurrent: () => true, rect: { left: 850, top: 580, bottom: 600 } };
    return { body, plugin, popover, owner, context, added };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('offline popup renders phonetics and frequency; candidate switch adds the chosen headword using the existing flow', async () => {
    const f = fixture(async () => [entry('first', '<script>raw definition</script>'), entry('second', '第二词')]);
    f.popover.showSelection('shared', f.context);
    const add = f.body.find('hi-words-translate-btn-add'); assert.equal(add.disabled, true);
    await flush(); assert.equal(add.disabled, false);
    assert.equal(add.attributes['aria-label'], 'Add word');
    assert.equal(add.attributes.title, undefined, 'Use the host tooltip without a second native title tooltip');
    assert.equal(f.body.find('hi-words-translate-btn-copy'), undefined);
    assert.equal(f.body.find('hi-words-translate-title').textContent, 'first');
    assert.equal(f.body.find('hi-words-hidict-definition').textContent, '<script>raw definition</script>');
    assert.equal(f.body.all('script').length, 0);
    assert.equal(f.body.find('hi-words-hidict-transcription').textContent, '/test/');
    assert.equal(f.body.find('hi-words-hidict-accent'), undefined);
    assert.equal(f.body.find('hi-words-hidict-frequency').attributes['aria-label'], undefined);
    assert.equal(f.body.find('hi-words-hidict-frequency-marks').attributes['aria-label'], 'Frequency 4/5');
    const popup = f.body.find('hi-words-translate-popover'); assert.equal(popup.style.left, '540px'); assert.equal(popup.style.top, '354px');
    const select = f.body.all('select')[0]; select.value = '1'; select.fire('change');
    add.fire('click'); assert.deepEqual(f.added, [['second', 'Some context.', 'n. 第二词']]); assert.equal(f.body.children.length, 0);
});
test('disabled AI leaves misses without enabled add actions and skips sentence popups', async () => {
    const f = fixture(async () => []);
    f.popover.showSelection('sentence has words', f.context); assert.equal(f.body.children.length, 0);
    f.popover.showSelection('absent', f.context); await flush();
    assert.equal(f.body.find('hi-words-translate-btn-add').disabled, true);
    assert.equal(f.body.find('hi-words-translate-btn-copy'), undefined);
    f.popover.closeForOwner(f.owner); assert.equal(f.body.children.length, 0);
});
test('closing a pending dictionary popup discards its late result; changing settings closes existing results', async () => {
    let finish;
    const f = fixture(() => new Promise(resolve => finish = resolve));
    f.popover.showSelection('pending', f.context); f.popover.closeForOwner(f.owner);
    finish([entry('pending', '旧结果')]); await flush(); assert.equal(f.body.children.length, 0);
    f.plugin.hidictService.lookup = async () => [entry('new', '新结果')];
    f.popover.showSelection('new', f.context); await flush(); assert.equal(f.body.children.length, 1);
    f.popover.updateSettings(); assert.equal(f.body.children.length, 0);
});

test('dictionary displays only the selected accent, preserves delimiters, and never substitutes the opposite accent', async () => {
    const word = entry('proof', '证据');
    word.phonetics = { uk: '/pɹuːf/', us: '[pɹuf]', unclassified: null };
    word.forms = [];
    const f = fixture(async () => [word]);
    f.popover.showSelection('proof', f.context); await flush();
    assert.equal(f.body.find('hi-words-hidict-phonetics').children.length, 1);
    assert.equal(f.body.find('hi-words-hidict-transcription').textContent, '[pɹuf]');
    assert.equal(f.body.find('hi-words-hidict-accent'), undefined);
    assert.equal(f.body.find('hi-words-hidict-forms'), undefined);
    assert.equal(f.body.find('hi-words-hidict-pos').textContent, 'n.');
    f.plugin.settings.pronunciationVariant = 'uk'; f.popover.updateSettings();
    f.popover.showSelection('proof', f.context); await flush();
    assert.equal(f.body.find('hi-words-hidict-transcription').textContent, '/pɹuːf/');
    word.phonetics.uk = null; f.popover.updateSettings();
    f.popover.showSelection('proof', f.context); await flush();
    assert.equal(f.body.find('hi-words-hidict-transcription'), undefined);
    word.phonetics.unclassified = 'legacy'; f.popover.updateSettings();
    f.popover.showSelection('proof', f.context); await flush();
    assert.equal(f.body.find('hi-words-hidict-transcription').textContent, '/legacy/');
});

test('dictionary pronunciation is click-only, honors accents and follows the selected headword without IPA', async () => {
    const previous = globalThis.Audio;
    const played = [];
    globalThis.Audio = class { src = ''; async play() { played.push(this.src); } };
    try {
        const first = entry('first', '第一词'); first.phonetics = { uk: null, us: null, unclassified: null };
        const second = entry('second', '第二词'); second.phonetics = first.phonetics;
        const f = fixture(async () => [first, second]);
        f.plugin.settings.pronunciationVariant = 'uk';
        f.popover.showSelection('shared', f.context); await flush();
        assert.deepEqual(played, [], 'rendering must not request audio');
        assert.equal(f.body.find('hi-words-tooltip').attributes['data-mode'], 'dictionary');
        const title = f.body.find('hi-words-tooltip-title'); title.fire('click'); await flush();
        assert.equal(title.attributes.title, undefined, 'Pronunciation exposes only one tooltip label');
        assert.equal(played[0], 'https://dict.youdao.com/dictvoice?audio=first&type=1');
        assert.equal(f.body.find('hi-words-word-popover-pronunciation'), undefined);
        assert.equal(f.body.find('hi-words-word-popover-section-label'), undefined);
        assert.equal(f.body.find('hi-words-hidict-section-label'), undefined);
        assert.equal(f.body.find('hi-words-hidict-frequency-label'), undefined);
        f.plugin.settings.pronunciationVariant = 'us';
        title.fire('click'); await flush();
        assert.equal(played[1], 'https://dict.youdao.com/dictvoice?audio=first&type=2');
        f.plugin.settings.pronunciationVariant = 'uk';
        const select = f.body.all('select')[0]; select.value = '1'; select.fire('change');
        title.listeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} }); await flush();
        assert.equal(played[2], 'https://dict.youdao.com/dictvoice?audio=second&type=1');
        assert.equal(f.body.find('hi-words-tooltip-heading').children.filter(c => c.className.includes('hi-words-hidict-phonetics')).length, 1);
        f.popover.closeForOwner(f.owner); title.fire('click'); await flush(); assert.equal(played.length, 3);
    } finally { globalThis.Audio = previous; }
});


test('clicking or pressing Enter on dictionary phonetics pronounces the current headword', async () => {
    const previous = globalThis.Audio;
    const played = [];
    globalThis.Audio = class { src = ''; async play() { played.push(this.src); } };
    try {
        const freshApi = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + '\n// Isolated shared audio instance').toString('base64')}`);
        const f = fixture(async () => [entry('first', '第一词'), entry('second', '第二词')], freshApi);
        f.popover.showSelection('shared', f.context); await flush();
        assert.deepEqual(played, []);
        const phonetic = f.body.find('hi-words-hidict-transcription');
        assert.equal(phonetic.attributes.role, 'button');
        assert.equal(phonetic.attributes.tabindex, '0');
        phonetic.fire('click'); await flush();
        assert.equal(played[0], 'https://dict.youdao.com/dictvoice?audio=first&type=2');
        const select = f.body.all('select')[0]; select.value = '1'; select.fire('change');
        f.body.find('hi-words-hidict-transcription').listeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
        await flush();
        assert.equal(played[1], 'https://dict.youdao.com/dictvoice?audio=second&type=2');
        f.popover.closeForOwner(f.owner); phonetic.fire('click'); await flush();
        assert.equal(played.length, 2);
    } finally { globalThis.Audio = previous; }
});

test('native and external selection entries ignore symbols and identifiers even with AI enabled', async () => {
    let lookups = 0;
    const f = fixture(async word => { assert.equal(word, 'hello'); lookups++; return [entry('hello', '你好')]; });
    f.plugin.settings.selectionTranslate.enabled = true;
    for (const text of ['。', '_', '123', 'hello_world', 'hello/there', 'a+b']) {
        f.popover.showSelection(text, f.context);
        f.popover.getSelectedText = () => text;
        f.popover.tryShowPopover({ target: { closest: () => null } });
        assert.equal(f.body.children.length, 0, text);
    }
    await flush(); assert.equal(lookups, 0);
    for (const text of ['**hello**', '_hello', 'hello_', '#hello', '***hello__,']) {
        f.popover.closeForOwner(f.owner);
        f.popover.showSelection(text, f.context); await flush();
        assert.equal(f.body.find('hi-words-translate-title').textContent, 'hello');
    }
    assert.equal(lookups, 5);
});

test('simple translation stays compact; explicit AI click opens details and saves only meanings', async () => {
    const f = fixture(async () => []); f.plugin.settings.selectionTranslate.enabled = true;
    f.popover.translationService.translate = async () => '未来';
    f.popover.detailPanel = new api.AiDetailPanel(f.plugin);
    let calls = 0;
    f.popover.detailPanel.service.translateDetailed = async (word, context) => {
        calls++; assert.equal(word, 'future'); assert.equal(context, 'Some context.');
        return JSON.stringify({ kind: 'word', text: word, meanings: [{ pos: 'noun', definition: '<script>未来</script>' }],
            collocations: [{ text: 'in the future', translation: '在未来' }], examples: [{ text: 'Plan for the future.', translation: '为未来做打算。' }], scenarios: ['表达未来计划'], pitfalls: ['区分future和present'] });
    };
    f.popover.showSelection('_future', f.context); await flush();
    assert.equal(calls, 0);
    assert.equal(f.body.find('hi-words-translate-result').textContent, '未来');
    assert.equal(f.body.find('hi-words-ai-badge'), undefined);
    f.body.find('hi-words-ai-detail-button').fire('click'); await flush();
    assert.equal(calls, 1); assert.equal(f.body.find('hi-words-translate-popover'), undefined);
    assert.equal(f.body.find('hi-words-ai-detail-panel').attributes['aria-modal'], 'false');
    assert.equal(f.body.find('hi-words-ai-definition').textContent, '<script>未来</script>');
    assert.equal(f.body.all('script').length, 0);
    assert.equal(f.body.find('hi-words-ai-example-translation').textContent, '在未来');
    f.body.all('button').find(button => button.attributes['aria-label'] === 'Add word').fire('click');
    assert.deepEqual(f.added, [['future', 'Some context.', 'n. <script>未来</script>']]);
});

test('local dictionary hits offer AI details without automatic AI or enabling selection translation', async () => {
    const f = fixture(async () => [entry('future', '未来')]);
    f.popover.detailPanel = new api.AiDetailPanel(f.plugin); let calls = 0;
    f.popover.detailPanel.service.translateDetailed = async () => { calls++; throw Error('offline'); };
    f.popover.showSelection('future', f.context); await flush(); assert.equal(calls, 0);
    f.body.find('hi-words-ai-detail-button').fire('click'); await flush(); assert.equal(calls, 1);
    assert.equal(f.body.find('hi-words-ai-detail-summary').textContent, 'n. 未来');
    assert.equal(f.body.find('hi-words-ai-detail-error').textContent, 'offline');
    f.popover.detailPanel.service.translateDetailed = async () => JSON.stringify({ kind: 'word', text: 'future', meanings: [{ pos: 'noun', definition: '未来' }] });
    f.body.all('button').find(button => button.textContent === 'Retry').fire('click'); await flush();
    assert.equal(f.body.find('hi-words-ai-detail-summary').hidden, true);
    f.popover.detailPanel.close(); assert.equal(f.body.children.length, 0);
});

test('closing or replacing detail panels discards late results and repeat clicks do not duplicate requests', async () => {
    const f = fixture(async () => []); const panel = new api.AiDetailPanel(f.plugin);
    let finish, calls = 0;
    panel.service.translateDetailed = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const context = { document: f.context.document, sentence: 'context', isCurrent: () => true };
    panel.open('first', context); panel.open('first', context); assert.equal(calls, 1);
    panel.close(); finish(JSON.stringify({ kind: 'word', text: 'first', meanings: [{ pos: 'noun', definition: '旧结果' }] }));
    await flush(); assert.equal(f.body.children.length, 0);
    panel.service.translateDetailed = async text => JSON.stringify({ kind: 'sentence', text, translation: '新的译文', explanation: '说明' });
    panel.open('This is new.', context); await flush();
    assert.equal(f.body.find('hi-words-ai-source').textContent, 'This is new.');
    assert.equal(f.body.find('hi-words-ai-translation').textContent, '新的译文');
    panel.onunload(); assert.equal(f.body.children.length, 0);
});

test('detail panel positions within wide reading panes and small windows', () => {
    const wide = api.aiDetailPosition({ left: 100, top: 100, right: 1800, bottom: 1100 }, { width: 1920, height: 1200 });
    assert.equal(wide.width, 420); assert.equal(wide.left, 1368);
    const small = api.aiDetailPosition({ left: 0, top: 60, right: 320, bottom: 600 }, { width: 320, height: 600 });
    assert.ok(small.left >= 8); assert.ok(small.left + small.width <= 312);
    assert.ok(small.top + small.height <= 588);
});

test('invalid detail output retries and stale source closure invalidates the panel', async () => {
    const f = fixture(async () => []); const panel = new api.AiDetailPanel(f.plugin); let calls = 0, current = true;
    panel.service.translateDetailed = async () => { calls++; return calls === 1 ? '{broken' : JSON.stringify({ kind: 'word', text: 'future', meanings: [{ pos: 'noun', definition: '未来' }] }); };
    const context = { document: f.context.document, owner: f.owner, sentence: 'context', baseDefinition: '原释义', isCurrent: () => current };
    panel.open('future', context); await flush();
    assert.equal(f.body.find('hi-words-ai-detail-summary').hidden, undefined);
    assert.equal(f.body.all('button').find(button => button.attributes['aria-label'] === 'Add word').disabled, true);
    f.body.all('button').find(button => button.textContent === 'Retry').fire('click'); await flush(); assert.equal(calls, 2);
    panel.closeForOwner(f.owner); assert.equal(f.body.children.length, 1);
    current = false; panel.closeForOwner(f.owner); assert.equal(f.body.children.length, 0);
});

test('usable detailed sentence and prose replies display without retry and save only a short definition', async () => {
    const f = fixture(async () => []); const panel = new api.AiDetailPanel(f.plugin);
    const selection = 'so you can shape them to your unique needs.';
    const context = { document: f.context.document, sentence: 'context', baseDefinition: '因此你可以根据自己的需求调整。', isCurrent: () => true };
    panel.service.translateDetailed = async () => JSON.stringify({ kind: 'sentence', translation: '因此你可以根据自己的独特需求进行调整。', explanation: ['so you can 表示目的。', 'shape 表示调整。'] });
    panel.open(selection, context); await flush();
    assert.equal(f.body.find('hi-words-ai-detail-error'), undefined);
    assert.equal(f.body.find('hi-words-ai-source').textContent, selection);
    assert.equal(f.body.find('hi-words-ai-section-text').textContent, 'so you can 表示目的。\nshape 表示调整。');
    panel.close();
    const prose = 'shape 在这里表示调整；to your unique needs 表示适合个人的独特需求。';
    panel.service.translateDetailed = async () => prose;
    panel.open(selection, context); await flush();
    assert.equal(f.body.find('hi-words-ai-detail-error'), undefined);
    assert.equal(f.body.find('hi-words-ai-translation').textContent, prose);
    assert.equal(f.body.find('hi-words-ai-detail-summary').hidden, false);
    f.body.all('button').find(button => button.attributes['aria-label'] === 'Add word').fire('click');
    assert.deepEqual(f.added, [[selection, 'context', context.baseDefinition]]);
    panel.close(); panel.open(selection, { ...context, baseDefinition: undefined }); await flush();
    assert.equal(f.body.all('button').find(button => button.attributes['aria-label'] === 'Add word').disabled, true);
    panel.close();
});

test('field-based details render phrase cards, sentence sections and omit absent fields', async () => {
    const f = fixture(async () => []); const panel = new api.AiDetailPanel(f.plugin);
    const context = { document: f.context.document, sentence: 'context', isCurrent: () => true };
    panel.service.translateDetailed = async () => JSON.stringify({ kind: 'phrase', meanings: [{ pos: 'phrase', definition: '根据你的需求调整' }], collocations: [{ text: 'adapt to needs', translation: '适应需求' }], examples: [{ text: '<img src=x>', translation: '安全文本' }], scenarios: ['定制产品'], pitfalls: ['注意介词 to'] });
    panel.open('adapt to your needs', context); await flush();
    assert.equal(f.body.find('hi-words-ai-result').attributes['data-kind'], 'phrase');
    assert.equal(f.body.find('hi-words-ai-type').textContent, 'Phrase');
    assert.equal(f.body.find('hi-words-ai-section-label').textContent, 'Overall meaning');
    assert.equal(f.body.all('ul').length, 2); assert.equal(f.body.all('img').length, 0);
    f.body.all('button').find(button => button.attributes['aria-label'] === 'Add word').fire('click');
    assert.deepEqual(f.added, [['adapt to your needs', 'context', 'phr. 根据你的需求调整']]);
    panel.close();
    panel.service.translateDetailed = async () => JSON.stringify({ kind: 'sentence', translation: '你可以调整它们。', keyPhrases: [{ text: 'shape them', translation: '调整它们' }], structure: '主语 + can + 动词原形' });
    panel.open('You can shape them.', context); await flush();
    const sections = f.body.all('div').filter(element => element.className === 'hi-words-ai-section');
    assert.deepEqual(sections.map(element => element.attributes['data-field']), ['translation', 'key-phrases', 'structure']);
    assert.equal(f.body.find('hi-words-ai-result').attributes['data-kind'], 'sentence');
    panel.close();
});

test('details start pinned; unpin permits outside dismissal while internal clicks and repinning retain the panel', async () => {
    const f = fixture(async () => []), panel = new api.AiDetailPanel(f.plugin), doc = f.context.document;
    let calls = 0;
    panel.service.translateDetailed = async () => { calls++; return '可用说明'; };
    const context = { document: doc, sentence: 'context', isCurrent: () => true };
    panel.open('future', context); await flush();
    const root = f.body.find('hi-words-ai-detail-panel'), pin = f.body.find('hi-words-ai-detail-pin');
    assert.equal(pin.attributes['aria-pressed'], 'true');
    doc.fire('pointerdown', { target: f.body }); assert.equal(root.isConnected, true);
    pin.fire('click'); assert.equal(pin.attributes['aria-pressed'], 'false');
    doc.fire('pointerdown', { target: f.body.find('hi-words-ai-translation') }); assert.equal(root.isConnected, true);
    pin.fire('click'); doc.fire('pointerdown', { target: f.body }); assert.equal(root.isConnected, true);
    pin.fire('click'); doc.fire('pointerdown', { target: f.body }); assert.equal(root.isConnected, false);
    assert.equal(doc.listenerCount(), 0); assert.equal(doc.defaultView.listenerCount(), 0); assert.equal(calls, 1);
    panel.open('future', context); await flush();
    assert.equal(f.body.find('hi-words-ai-detail-pin').attributes['aria-pressed'], 'true');
    doc.fire('keydown', { key: 'Escape' }); assert.equal(f.body.children.length, 0);
});

test('header dragging preserves position on resize, clamps to the viewport and never translates again', async () => {
    const f = fixture(async () => []), panel = new api.AiDetailPanel(f.plugin), doc = f.context.document;
    let calls = 0;
    panel.service.translateDetailed = async () => { calls++; return '可用说明'; };
    panel.open('future', { document: doc, sentence: '', isCurrent: () => true }); await flush();
    const root = f.body.find('hi-words-ai-detail-panel'), header = f.body.find('hi-words-ai-detail-header');
    const startLeft = parseFloat(root.style.left), startTop = parseFloat(root.style.top);
    header.fire('pointerdown', { button: 0, pointerId: 1, clientX: 600, clientY: 100 });
    doc.fire('pointermove', { pointerId: 2, clientX: 500, clientY: 50 }); assert.equal(parseFloat(root.style.left), startLeft);
    doc.fire('pointermove', { pointerId: 1, clientX: 500, clientY: 50 });
    assert.equal(parseFloat(root.style.left), startLeft - 100); assert.equal(parseFloat(root.style.top), startTop - 50);
    doc.fire('pointerup', { pointerId: 1 }); assert.ok(!root.className.includes('is-dragging'));
    doc.defaultView.fire('resize'); assert.equal(parseFloat(root.style.left), startLeft - 100);
    header.fire('pointerdown', { button: 0, pointerId: 3, clientX: 500, clientY: 50 });
    doc.fire('pointermove', { pointerId: 3, clientX: -2000, clientY: -2000 });
    assert.equal(root.style.left, '8px'); assert.equal(root.style.top, '8px');
    doc.fire('pointercancel', { pointerId: 3 });
    doc.defaultView.innerWidth = 300; doc.defaultView.innerHeight = 350; doc.defaultView.fire('resize');
    assert.ok(parseFloat(root.style.left) + parseFloat(root.style.width) <= 292);
    assert.ok(parseFloat(root.style.top) + parseFloat(root.style.height) <= 342);
    assert.equal(calls, 1); panel.close(); assert.equal(doc.listenerCount(), 0);
});

test('header buttons do not start drags and closing during drag removes document listeners', async () => {
    const f = fixture(async () => []), panel = new api.AiDetailPanel(f.plugin), doc = f.context.document;
    panel.service.translateDetailed = async () => '说明';
    panel.open('future', { document: doc, sentence: '', isCurrent: () => true }); await flush();
    const root = f.body.find('hi-words-ai-detail-panel'), header = f.body.find('hi-words-ai-detail-header');
    const startLeft = root.style.left;
    header.fire('pointerdown', { target: f.body.find('hi-words-ai-detail-pin'), button: 0, pointerId: 1, clientX: 600, clientY: 100 });
    doc.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 0 }); assert.equal(root.style.left, startLeft);
    header.fire('pointerdown', { button: 0, pointerId: 2, clientX: 600, clientY: 100 });
    assert.ok(root.className.includes('is-dragging')); panel.close();
    assert.equal(doc.listenerCount(), 0); assert.equal(doc.defaultView.listenerCount(), 0);
    assert.ok(!root.className.includes('is-dragging'));
});
