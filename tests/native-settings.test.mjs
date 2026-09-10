import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const result = await build({
    stdin: { contents: "export { HiWordsSettingTab } from './src/ui/settings-tab'; export { DEFAULT_SETTINGS, DEFAULT_AI_DEFINITION_PROMPT, DEFAULT_TRANSLATE_PROMPT, resolvePrompt } from './src/settings';", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'settings-boundary', setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
        b.onResolve({ filter: /^\.\.\/(canvas|card)$/ }, a => ({ path: a.path, namespace: 'parsers' }));
        b.onLoad({ filter: /.*/, namespace: 'parsers' }, () => ({ contents: 'export class CanvasParser {} export class HiWordsParser {}' }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
            export class App {} export class TFile {} export class Notice {} export class FuzzySuggestModal {}
            export class SecretComponent {} export class Setting {}
            export class PluginSettingTab { constructor(app) { this.app = app; } update() {} }
            export const getLanguage = () => 'en'; export const setIcon = () => {};
            export const requestUrl = () => { throw Error('Unexpected network request'); };
        ` }));
    } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
function fixture() {
    const events = [];
    const plugin = { settings: structuredClone(api.DEFAULT_SETTINGS), saveSettings: async () => {}, refreshHighlighter: () => {}, vocabularyManager: { loadAllVocabularyBooks: async () => {} } };
    const tab = new api.HiWordsSettingTab({ workspace: { trigger: name => events.push(name) } }, plugin);
    return { tab, plugin, events, rows: tab.getSettingDefinitions().flatMap(group => group.items) };
}
test('settings use five native groups with independently indexed controls', () => {
    const { tab, rows } = fixture();
    assert.equal(tab.getSettingDefinitions().length, 5);
    assert.ok(tab.getSettingDefinitions().every(group => group.type === 'group' && group.heading));
    const keys = rows.filter(row => row.control).map(row => row.control.key);
    assert.equal(keys.length, 20);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(typeof tab.display, 'undefined');
});
test('nested settings persist and control conditional prompt visibility', async () => {
    const { tab, plugin, rows } = fixture();
    await tab.setControlValue('aiDefinition.enabled', false);
    assert.equal(plugin.settings.aiDefinition.enabled, false);
    assert.equal(rows.find(row => row.name === 'Definition prompt').visible(), false);
    await tab.setControlValue('selectionTranslate.enabled', true);
    assert.equal(rows.find(row => row.name === 'Translation prompt').visible(), true);
    await tab.setControlValue('selectionTranslate.targetLang', 'ja');
    assert.equal(tab.getControlValue('selectionTranslate.targetLang'), 'ja');
});
test('mastery changes preserve sidebar linkage and provider changes preserve custom URLs', async () => {
    const { tab, plugin, events } = fixture();
    await tab.setControlValue('enableMasteredFeature', false);
    assert.equal(plugin.settings.showMasteredInSidebar, false);
    assert.ok(events.includes('hi-words:mastered-changed'));
    await tab.setControlValue('aiService.provider', 'gemini');
    assert.equal(plugin.settings.aiService.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
    plugin.settings.aiService.apiUrl = 'https://custom.example';
    await tab.setControlValue('aiService.provider', 'anthropic');
    assert.equal(plugin.settings.aiService.apiUrl, 'https://custom.example');
});
test('native validators reject invalid card sizes and non-object extra parameters', () => {
    const { rows } = fixture();
    const size = rows.find(row => row.control?.key === 'cardWidth').control;
    assert.ok(size.validate(-1)); assert.ok(size.validate(1.5)); assert.equal(size.validate(360), undefined);

});

test('blank prompts use defaults and custom prompts remain unchanged', async () => {
    const { tab, plugin, rows } = fixture();
    for (const [key, fallback] of [
        ['aiDefinition.prompt', api.DEFAULT_AI_DEFINITION_PROMPT],
        ['selectionTranslate.prompt', api.DEFAULT_TRANSLATE_PROMPT],
    ]) {
        const row = rows.find(row => row.name === (key.startsWith('aiDefinition') ? 'Definition prompt' : 'Translation prompt'));
        const rendered = renderMultiline(row);
        assert.equal(rendered.input.placeholder, fallback);
        rendered.cleanup();
        assert.equal(tab.getControlValue(key), '');
        await tab.setControlValue(key, fallback);
        assert.equal(tab.getControlValue(key), '', 'old stored defaults should appear as placeholders');
        await tab.setControlValue(key, 'Custom {{word}} {{text}}');
        assert.equal(tab.getControlValue(key), 'Custom {{word}} {{text}}');
        assert.equal(api.resolvePrompt(tab.getControlValue(key), fallback), 'Custom {{word}} {{text}}');
        await tab.setControlValue(key, '  ');
        assert.equal(tab.getControlValue(key), '');
        const [section, property] = key.split('.');
        assert.equal(api.resolvePrompt(plugin.settings[section][property], fallback), fallback);
        await tab.setControlValue(key, '');
        assert.equal(api.resolvePrompt(plugin.settings[section][property], fallback), fallback);
    }
    assert.ok(rows.every(row => row.name !== 'Restore default prompt'));
});

function renderMultiline(row) {
    const input = { value: '', placeholder: '', rows: 0, setAttribute() {} };
    const error = { hidden: true, text: '', setAttribute() {}, setText(text) { this.text = text; } };
    const classes = [];
    let change;
    const component = {
        inputEl: input,
        setValue(value) { input.value = value; return this; },
        setPlaceholder(value) { input.placeholder = value; return this; },
        setDisabled() { return this; },
        onChange(callback) { change = callback; return this; },
    };
    const cleanup = row.render({
        settingEl: { addClass: name => classes.push(name) },
        controlEl: { createDiv: () => error, appendChild() {} },
        addTextArea: callback => callback(component),
    });
    return { input, error, classes, cleanup, change: value => change(value) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('explicit multiline rows preserve validation, saving, placeholders and cleanup', async () => {
    const { plugin, rows } = fixture();
    const json = renderMultiline(rows.find(row => row.name === 'Extra Request Parameters'));
    assert.ok(json.classes.includes('hi-words-setting-textarea'));
    json.change('[]'); await settle();
    assert.equal(json.error.hidden, false);
    assert.equal(plugin.settings.aiService.extraParams, '{}');
    json.change('{"temperature":0.5}'); await settle();
    assert.equal(json.error.hidden, true);
    assert.equal(plugin.settings.aiService.extraParams, '{"temperature":0.5}');
    const prompt = renderMultiline(rows.find(row => row.name === 'Definition prompt'));
    assert.equal(prompt.input.rows, 8);
    assert.equal(prompt.input.placeholder, api.DEFAULT_AI_DEFINITION_PROMPT);
    prompt.change('Custom {{word}}'); await settle();
    assert.equal(plugin.settings.aiDefinition.prompt, 'Custom {{word}}');
    prompt.change(''); await settle();
    assert.equal(api.resolvePrompt(plugin.settings.aiDefinition.prompt, api.DEFAULT_AI_DEFINITION_PROMPT), api.DEFAULT_AI_DEFINITION_PROMPT);
    prompt.change('Ignored after teardown'); prompt.cleanup(); await settle();
    assert.equal(plugin.settings.aiDefinition.prompt, '');
    json.cleanup();
});
