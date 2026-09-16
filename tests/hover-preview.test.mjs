import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
    entryPoints: ['src/ui/definition-popover.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'hover-boundary', setup(b) {
        b.onResolve({ filter: /^(obsidian|\.\.\/core|\.\.\/utils|\.\.\/i18n|\.\/word-card-renderer|\.\.\/schema\/hiwords|\.\/word-popover-actions)$/ }, args => ({ path: args.path, namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
            export class Component { registerDomEvent() {} removeChild() {} }
            export class App {} export class MarkdownView {} export class Notice {}
            export const MarkdownRenderer = {}; export const setIcon = () => {};
            export class VocabularyManager {} export class MasteredService {}
            export const playWordTTS = () => {}; export const t = x => x;
            export const renderWordCard = () => {}; export const isWordCard = () => true;
            export const getPopoverTargetSentence = () => '';
            export class WordPopoverActions { cancel() {} }
        ` }));
    } }],
});
const { DefinitionPopover } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('entering a Markdown highlight cancels old hide timers and unrelated mouseout cannot cancel preview', () => {
    const saved = { window: globalThis.window, activeDocument: globalThis.activeDocument, Node: globalThis.Node };
    let now = 0, id = 0;
    const timers = new Map();
    class Node {
        static ELEMENT_NODE = 1;
        nodeType = 1;
        instanceOf(type) { return this instanceof type; }
        contains(node) { return node === this || node.parent === this; }
        closest() { return this.highlight ? this : null; }
        getAttribute(key) { return key === 'data-word' ? 'hello' : 'definition'; }
        hasClass() { return false; }
    }
    const advance = duration => {
        const end = now + duration;
        for (;;) {
            const next = [...timers].filter(([,v]) => v.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
            if (!next) break;
            timers.delete(next[0]); now = next[1].at; next[1].callback();
        }
        now = end;
    };
    try {
        globalThis.Node = Node; globalThis.activeDocument = {};
        globalThis.window = { setTimeout(callback, delay) { const key=++id;timers.set(key,{callback,at:now+delay});return key; }, clearTimeout(key) { timers.delete(key); } };
        const popover = new DefinitionPopover({ app: {}, settings: { showDefinitionOnHover: true } });
        const word = new Node(); word.highlight = true;
        const plain = new Node();
        let shown = 0;
        popover.createTooltip = () => { shown++; };
        // Real browser ordering: mouseout of plain text, then mouseover of the word.
        popover.handleMouseOut({ target: plain, relatedTarget: word });
        popover.handleMouseOver({ target: word });
        advance(130); assert.equal(shown, 1);
        popover.lastShowTs = 0;
        popover.handleMouseOut({ target: word, relatedTarget: plain });
        popover.handleMouseOver({ target: word });
        advance(130); assert.equal(shown, 2, 'reenter before hide must still open the preview');
        const child = new Node();child.parent = word;
        popover.handleMouseOut({ target: word, relatedTarget: child });
        assert.equal(timers.size, 0, 'moving within the highlighted word must not schedule dismissal');
        popover.handleMouseOut({ target: word, relatedTarget: plain });
        advance(90); assert.equal(popover.currentTargetEl, null, 'actually leaving should clean up');
    } finally {
        for (const [key,value] of Object.entries(saved)) { if (value===undefined) delete globalThis[key]; else globalThis[key]=value; }
    }
});
