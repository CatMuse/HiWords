import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/ui/hidict-settings.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'obsidian-mock', setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: "export class Notice { constructor(message) { globalThis.hidictNotices.push(message); } } export const getLanguage = () => 'en';" }));
} }] });
const { hidictSetting } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function fixture(files, selected = '') {
    globalThis.hidictNotices = [];
    const calls = [];
    const dropdown = { options: {}, selectEl: { setAttribute() {} }, addOption(key, label) { this.options[key] = label; return this; }, setValue(value) { this.value = value; return this; }, setDisabled(value) { this.disabled = value; return this; }, onChange(cb) { this.change = cb; return this; } };
    const plugin = { app: { vault: { getFiles: () => files } }, settings: { hidictPath: selected }, hidictService: { async load(path) { calls.push(['load', path]); }, invalidate() { calls.push(['invalidate']); } }, async saveSettings() { calls.push(['save', this.settings.hidictPath]); } };
    const setting = { settingEl: { addClass() {} }, descEl: { createDiv() { return { setAttribute() {} }; } }, addDropdown(cb) { cb(dropdown); } };
    hidictSetting(plugin, () => calls.push(['refresh'])).render(setting);
    return { plugin, dropdown, calls };
}
const file = path => ({ path, name: path.split('/').pop(), extension: path.split('.').pop(), parent: { path: path.slice(0, path.lastIndexOf('/')) } });
test('dictionary dropdown validates before saving, shows filenames only and supports clearing', async () => {
    const f = fixture([file('a/basic.hidict'), file('b/basic.hidict'), file('notes.md')]);
    assert.equal(Object.keys(f.dropdown.options).length, 3);
    assert.equal(f.dropdown.options['a/basic.hidict'], 'basic.hidict');
    assert.equal(f.dropdown.options['b/basic.hidict'], 'basic.hidict');
    await f.dropdown.change('a/basic.hidict');
    assert.deepEqual(f.calls, [['load', 'a/basic.hidict'], ['invalidate'], ['save', 'a/basic.hidict'], ['refresh']]);
    f.calls.length = 0;
    await f.dropdown.change('');
    assert.equal(f.plugin.settings.hidictPath, '');
    assert.deepEqual(f.calls, [['invalidate'], ['save', ''], ['refresh']]);
});
test('invalid dictionary or failed persistence restores the previous selection', async () => {
    const f = fixture([file('a.hidict'), file('b.hidict')], 'a.hidict');
    f.plugin.hidictService.load = async () => { throw Error('Invalid dictionary'); };
    await f.dropdown.change('b.hidict');
    assert.equal(f.plugin.settings.hidictPath, 'a.hidict');
    assert.equal(f.dropdown.value, 'a.hidict');
    assert.ok(!f.calls.some(call => call[0] === 'save'));
    f.plugin.hidictService.load = async () => {};
    f.plugin.saveSettings = async () => { throw Error('Save failed'); };
    await f.dropdown.change('b.hidict');
    assert.equal(f.plugin.settings.hidictPath, 'a.hidict');
    assert.equal(f.dropdown.value, 'a.hidict');
    assert.equal(f.dropdown.disabled, false);
    assert.deepEqual(globalThis.hidictNotices, ['Invalid dictionary', 'Save failed']);
});
test('empty vault disables selection, while missing selected files remain clearable', async () => {
    assert.equal(fixture([]).dropdown.disabled, true);
    const f = fixture([], 'deleted.hidict');
    assert.equal(f.dropdown.disabled, false);
    assert.ok(f.dropdown.options['deleted.hidict'].includes('Unavailable'));
    await f.dropdown.change('');
    assert.equal(f.plugin.settings.hidictPath, '');
    assert.equal(f.dropdown.disabled, true);
});
