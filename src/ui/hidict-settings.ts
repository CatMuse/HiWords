import { Notice } from 'obsidian';
import type { SettingDefinition } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { dictText } from '../dictionary/text';

export function hidictSetting(plugin: HiWordsPlugin, refresh: () => void): SettingDefinition {
    return {
        name: dictText('setting'), desc: dictText('description'),
        render: setting => {
            const files = plugin.app.vault.getFiles()
                .filter(file => file.extension.toLowerCase() === 'hidict')
                .sort((a, b) => a.path.localeCompare(b.path));
            const selected = plugin.settings.hidictPath;
            setting.settingEl.addClass('hi-words-hidict-setting');
            if (!selected && !files.length) {
                setting.descEl.createDiv({ text: dictText('empty') });
            }
            setting.addDropdown(dropdown => {
                dropdown.addOption('', dictText('none'));
                for (const file of files) {
                    dropdown.addOption(file.path, file.name);
                }
                if (selected && !files.some(file => file.path === selected)) {
                    dropdown.addOption(selected, `${selected.split('/').pop()} (${dictText('unavailable')})`);
                }
                dropdown.setValue(selected).setDisabled(!files.length && !selected);
                dropdown.selectEl.setAttribute('aria-label', dictText('select'));
                let busy = false;
                dropdown.onChange(async path => {
                    if (busy) return;
                    const previous = plugin.settings.hidictPath;
                    if (path === previous) return;
                    busy = true; dropdown.setDisabled(true);
                    try {
                        if (path) await plugin.hidictService.load(path);
                        plugin.settings.hidictPath = path;
                        plugin.hidictService.invalidate();
                        await plugin.saveSettings();
                        refresh();
                    } catch (error) {
                        plugin.settings.hidictPath = previous;
                        plugin.hidictService.invalidate();
                        dropdown.setValue(previous);
                        new Notice(error instanceof Error ? error.message : dictText('invalid'));
                    } finally {
                        busy = false;
                        dropdown.setDisabled(!files.length && !plugin.settings.hidictPath);
                    }
                });
            });
        },
    };
}
