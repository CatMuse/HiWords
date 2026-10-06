import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({
    stdin: { contents: `export { AIConnectionControls } from './src/ui/ai-connection-controls'; export { DEFAULT_SETTINGS } from './src/settings';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'ui-boundary', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
            export class FuzzySuggestModal { setPlaceholder() {} open() { globalThis.__modelPicker = this; } }
            export const getLanguage = () => 'en';
            export const requestUrl = config => globalThis.__aiUIRequest(config);
        ` }));
    } }],
});
const { AIConnectionControls, DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.window = globalThis;
function fixture() {
    const config = { ...DEFAULT_SETTINGS.aiService };
    const feedback = { text: '', setText(text) { this.text = text; } };
    const status = { text: '', setText(text) { this.text = text; }, setAttribute() {} };
    const buttons = [];
    let updates = 0;
    const controls = new AIConnectionControls({ app: {}, config: () => config, key: () => 'secret',
        selectModel: async id => { config.model = id; controls.invalidate(); }, update: () => updates++ });
    const row = {
        settingEl: { addClass() {} },
        controlEl: { createDiv: () => feedback, appendChild() {} },
        descEl: { createDiv: () => status },
        addText(callback) { callback({ setValue() { return this; }, setPlaceholder() { return this; }, onChange() { return this; } }); },
        addButton(callback) {
            const button = { setButtonText(value) { this.label = value; return this; }, setIcon() { return this; }, setTooltip() { return this; }, setCta() { return this; }, setDisabled(value) { this.disabled = value; return this; }, onClick(callback) { this.click = callback; return this; } };
            buttons.push(button); callback(button);
        },
    };
    const cleanModel = controls.renderModel(row);
    const cleanTest = controls.renderTest(row);
    const cleanup = () => { cleanModel(); cleanTest(); };
    // Keep action indices stable: refresh, choose, test.
    [buttons[0], buttons[1]] = [buttons[1], buttons[0]];

    return { config, status, feedback, controls, buttons, cleanup, updates: () => updates };
}

test('model refresh never changes the current selection; cached picker survives model changes', async () => {
    globalThis.__aiUIRequest = async () => ({ status: 200, json: { data: [{ id: 'first' }, { id: 'second' }] } });
    const f = fixture();
    const original = f.config.model;
    await f.buttons[0].click();
    assert.equal(f.config.model, original);
    f.buttons[1].click();
    globalThis.__modelPicker.onChooseItem('first');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.config.model, 'first');
    f.buttons[1].click();
    globalThis.__modelPicker.onChooseItem('second');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.config.model, 'second');
});

test('configuration changes invalidate a pending test and its displayed result', async () => {
    let finish;
    globalThis.__aiUIRequest = () => new Promise(resolve => { finish = resolve; });
    const f = fixture();
    const pending = f.buttons[2].click();
    assert.equal(f.buttons[2].disabled, true);
    f.config.model = 'different'; f.controls.invalidate();
    assert.equal(f.status.text, 'Not tested');
    finish({ status: 200, json: { choices: [{ message: { content: 'OK' } }] } });
    await pending;
    assert.equal(f.status.text, 'Not tested');
    assert.equal(f.buttons[2].disabled, false);
});

test('row teardown prevents late success from displaying; failed discovery retains manual selection', async () => {
    let finish;
    globalThis.__aiUIRequest = () => new Promise(resolve => { finish = resolve; });
    const f = fixture();
    const pending = f.buttons[2].click();
    f.cleanup();
    finish({ status: 200, json: { choices: [{ message: { content: 'OK' } }] } });
    await pending;
    assert.ok(!f.status.text.includes('Connected'));
    globalThis.__aiUIRequest = async () => ({ status: 404, json: { error: { message: 'no models API' } } });
    const g = fixture();
    const original = g.config.model;
    await g.buttons[0].click();
    assert.equal(g.config.model, original);
    assert.ok(g.feedback.text.includes('manually'));
});
