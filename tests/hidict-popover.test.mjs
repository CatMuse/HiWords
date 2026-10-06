import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({
    stdin: { contents: `export {SelectionTranslatePopover} from './src/ui/selection-translate-popover'; export {DEFAULT_SETTINGS} from './src/settings';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'obsidian', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export class Component { addChild() {} removeChild() {} registerDomEvent() {} } export class MarkdownView {} export class App {} export const getLanguage = () => 'en'; export const setIcon = () => {}; export const requestUrl = () => { throw Error('Unexpected AI request'); };` }));
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
    fire(name) { if (!this.disabled) this.listeners[name]?.({ stopPropagation() {}, preventDefault() {} }); }
    contains(child) { return this === child || this.children.some(c => c.contains(child)); }
    getBoundingClientRect() { return { width: 350, height: 220 }; }
    find(cls) { return this.className.split(' ').includes(cls) ? this : this.children.map(c => c.find(cls)).find(Boolean); }
    all(tag) { return [...(this.tag === tag ? [this] : []), ...this.children.flatMap(c => c.all(tag))]; }
}
const entry = (word, definition) => ({ word, meanings: [{ partsOfSpeech: ['noun'], sourceLabels: ['n'], definitions: [definition] }], phonetics: { uk: null, us: null, unclassified: 'test' }, frequency: { level: 4 }, forms: [{ word: word + 's', types: ['plural'] }] });
function fixture(lookup, controllerApi = api) {
    const body = new Element(); body.root = true;
    const win = { scrollX: 0, scrollY: 0, innerWidth: 900, innerHeight: 600, requestAnimationFrame: cb => cb() };
    globalThis.window = win;
    const doc = { body, defaultView: win, documentElement: { scrollTop: 0, scrollLeft: 0 }, createElement: tag => new Element(tag) };
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
