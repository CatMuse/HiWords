import { App, PluginSettingTab, Setting, TFile, Notice, FuzzySuggestModal, SecretComponent, setIcon } from 'obsidian';
import type { SettingDefinitionItem, SettingDefinition, SettingDefinitionControl } from 'obsidian';
import HiWordsPlugin from '../../main';
import { VocabularyBook, AIProvider } from '../utils';
import { CanvasParser } from '../canvas';
import { HiWordsParser } from '../card';
import { t } from '../i18n';
import { DictionaryService } from '../services/dictionary-service';
import { DEFAULT_AI_DEFINITION_PROMPT, DEFAULT_TRANSLATE_PROMPT } from '../settings';

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin;
    private isTestingAIConnection = false;

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const field = (key: string, label: string, type: 'toggle' | 'text' | 'textarea' = 'toggle'): SettingDefinitionControl => ({
            name: t(`settings.${label}`), desc: t(`settings.${label}_desc`), control: { type, key },
        });
        const select = (key: string, label: string, options: Record<string, string>): SettingDefinition => ({
            name: t(`settings.${label}`), desc: t(`settings.${label}_desc`), control: { type: 'dropdown', key, options },
        });
        const options = (prefix: string, values: string[]) => Object.fromEntries(values.map(value => [value, t(`settings.${prefix}${value}`)]));
        const group = (heading: string, items: SettingDefinition[]): SettingDefinitionItem => ({
            type: 'group', heading: t(`settings.${heading}`), cls: 'hi-words-settings-group', items,
        });
        const prompt = (key: string, label: string, enabled: () => boolean): SettingDefinition => ({
            ...field(key, label, 'textarea'), visible: enabled,
        });
        return [
            group('group_books', [
                { name: t('settings.add_vocabulary_book'), render: setting => { setting.addButton(button => button.setIcon('plus').setTooltip(t('settings.add_vocabulary_book')).onClick(() => this.runAsync(() => this.showVocabularyBookFilePicker(), 'HiWords book picker failed:'))); } },
                ...this.plugin.settings.vocabularyBooks.map(book => ({
                    name: book.name, desc: `${t('settings.path')}: ${book.path}`,
                    render: (setting: Setting) => this.renderVocabularyBook(setting, book),
                })),
                { name: t('settings.statistics'), render: setting => {
                    setting.settingEl.addClass('hi-words-settings-statistics');
                    this.displayStats(setting.controlEl);
                } },
                select('fileNodeParseMode', 'file_node_parse_mode', { 'filename-with-alias': t('settings.mode_filename_with_alias'), filename: t('settings.mode_filename'), content: t('settings.mode_content') }),
            ]),
            group('group_display', [
                field('enableAutoHighlight', 'enable_auto_highlight'),
                field('showDefinitionOnHover', 'show_definition_on_hover'),
                field('enableSectionTabs', 'enable_section_tabs'),
                select('sidebarDefaultDisplayMode', 'sidebar_default_display_mode', { detail: t('settings.sidebar_display_detail'), word: t('settings.sidebar_display_word') }),
                select('highlightStyle', 'highlight_style', options('style_', ['underline', 'background', 'bold', 'dotted', 'wavy'])),
                select('highlightMode', 'highlight_mode', options('mode_', ['all', 'exclude', 'include'])),
                field('highlightPaths', 'highlight_paths', 'textarea'),
            ]),
            group('group_learning', [
                field('enableMasteredFeature', 'enable_mastered_feature'),
                field('blurDefinitions', 'blur_definitions'),
                field('ttsTemplate', 'tts_template', 'text'),
                select('pronunciationVariant', 'pronunciation_variant', options('pronunciation_', ['us', 'uk'])),
            ]),
            group('group_ai', [
                select('aiService.provider', 'ai_provider', { 'openai-compatible': t('settings.ai_provider_openai_compatible'), anthropic: t('settings.ai_provider_anthropic'), gemini: t('settings.ai_provider_gemini'), custom: t('settings.ai_provider_custom') }),
                field('aiService.apiUrl', 'ai_api_url', 'text'),
                { name: t('settings.ai_api_key'), desc: t('settings.ai_api_key_desc'), render: setting => {
                    setting.addComponent(container => new SecretComponent(this.app, container)
                        .setValue(this.plugin.settings.aiService.apiKeySecretId)
                        .onChange(value => this.runAsync(() => this.setControlValue('aiService.apiKeySecretId', value), 'HiWords secret setting failed:')));
                } },
                field('aiService.model', 'ai_model', 'text'),
                { name: t('settings.ai_test_connection'), render: setting => { setting.addButton(button => button.setButtonText(t('settings.ai_test_connection')).setDisabled(this.isTestingAIConnection).onClick(() => this.runAsync(() => this.testAIConnection(), 'HiWords connection test failed:'))); } },
                { ...field('aiService.extraParams', 'ai_extra_params', 'textarea'), control: {
                    type: 'textarea', key: 'aiService.extraParams', rows: 4,
                    validate: value => { try { const parsed = JSON.parse(value || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return t('settings.json_object_required'); } catch { return t('settings.json_object_required'); } },
                } },
                field('aiDefinition.enabled', 'enable_ai_definition'),
                prompt('aiDefinition.prompt', 'ai_prompt', () => this.plugin.settings.aiDefinition.enabled),
                { name: t('settings.restore_default_prompt'), visible: () => this.plugin.settings.aiDefinition.enabled, render: setting => { setting.addButton(button => button.setButtonText(t('settings.restore_default_prompt')).onClick(() => this.runAsync(() => this.setControlValue('aiDefinition.prompt', DEFAULT_AI_DEFINITION_PROMPT), 'HiWords prompt reset failed:'))); } },
                field('selectionTranslate.enabled', 'enable_selection_translate'),
                { ...field('selectionTranslate.targetLang', 'translate_target_lang', 'text'), visible: () => this.plugin.settings.selectionTranslate.enabled },
                prompt('selectionTranslate.prompt', 'translate_prompt', () => this.plugin.settings.selectionTranslate.enabled),
                { name: t('settings.restore_default_prompt'), visible: () => this.plugin.settings.selectionTranslate.enabled, render: setting => { setting.addButton(button => button.setButtonText(t('settings.restore_default_prompt')).onClick(() => this.runAsync(() => this.setControlValue('selectionTranslate.prompt', DEFAULT_TRANSLATE_PROMPT), 'HiWords prompt reset failed:'))); } },
            ]),
            group('group_canvas', [
                field('autoLayoutEnabled', 'enable_auto_layout'),
                ...['cardWidth', 'cardHeight'].map(key => ({
                    name: t(`settings.${key === 'cardWidth' ? 'card_width' : 'card_height'}`),
                    control: { type: 'number' as const, key, validate: (value: number) => Number.isInteger(value) && value > 0 ? undefined : t('settings.positive_integer_required') },
                })),
            ]),
        ];
    }

    getControlValue(key: string): unknown {
        const [section, property] = key.split('.');
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        return property ? (settings[section] as Record<string, unknown>)?.[property] : settings[section];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const [section, property] = key.split('.');
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        if (key === 'aiService.provider') {
            const previous = this.getProviderDefaults(this.plugin.settings.aiService.provider);
            const next = this.getProviderDefaults(value as AIProvider);
            if (next.apiUrl && (!this.plugin.settings.aiService.apiUrl || this.plugin.settings.aiService.apiUrl === previous.apiUrl)) this.plugin.settings.aiService.apiUrl = next.apiUrl;
            if (next.model && (!this.plugin.settings.aiService.model || this.plugin.settings.aiService.model === previous.model)) this.plugin.settings.aiService.model = next.model;
        }
        if (property) (settings[section] as Record<string, unknown>)[property] = value;
        else settings[section] = value;
        if (key === 'enableMasteredFeature') this.plugin.settings.showMasteredInSidebar = value === true;
        await this.plugin.saveSettings();
        if (key === 'fileNodeParseMode') await this.plugin.vocabularyManager.loadAllVocabularyBooks();
        if (['enableAutoHighlight', 'highlightStyle', 'highlightMode', 'highlightPaths', 'enableMasteredFeature', 'pronunciationVariant', 'fileNodeParseMode'].includes(key)) this.plugin.refreshHighlighter();
        this.app.workspace.trigger(key === 'enableMasteredFeature' ? 'hi-words:mastered-changed' : 'hi-words:settings-changed');
        if (key.endsWith('.enabled') || key === 'aiService.provider' || key.endsWith('.prompt')) this.update();
    }

    private runAsync(action: () => Promise<void>, context: string): void {
        void action().catch(error => {
            console.error(context, error);
        });
    }

    /**
     * 测试 AI 服务连接
     */
    private async testAIConnection() {
        if (this.isTestingAIConnection) return;

        this.isTestingAIConnection = true;
        this.update();

        const loadingNotice = new Notice(
            t('notices.testing_ai_connection') || 'Testing AI connection...',
            0
        );

        try {
            const service = new DictionaryService({
                service: this.plugin.settings.aiService,
                apiKey: this.plugin.getAIAPIKey(),
                prompt: 'Reply with "OK" for the word "{{word}}".'
            });
            const result = await service.fetchDefinition(
                'test',
                'This is a test sentence for checking the AI connection.'
            );

            loadingNotice.hide();

            if (!result.trim()) {
                throw new Error(t('ai_errors.invalid_response'));
            }

            new Notice(
                t('notices.ai_connection_success') || 'AI connection successful',
                5000
            );
        } catch (error) {
            loadingNotice.hide();
            console.error('AI connection test failed:', error);
            const errorMessage = error instanceof Error
                ? error.message
                : (t('notices.ai_connection_failed') || 'AI connection test failed');
            new Notice(errorMessage, 6000);
        } finally {
            this.isTestingAIConnection = false;
            this.update();
        }
    }

    private getProviderDefaults(provider: AIProvider): { apiUrl: string; model: string } {
        switch (provider) {
            case 'anthropic':
                return { apiUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' };
            case 'gemini':
                return { apiUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' };
            case 'openai-compatible':
                return { apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
            case 'custom':
            default:
                return { apiUrl: '', model: '' };
        }
    }

    /**
     * 显示词库文件选择器
     */
    private async showVocabularyBookFilePicker() {
        const vocabularyFiles = this.app.vault.getFiles()
            .filter(file => file.extension === 'canvas' || file.extension === 'hiwords');

        if (vocabularyFiles.length === 0) {
            new Notice(t('notices.no_vocabulary_book_files'));
            return;
        }

        // 创建选择模态框
        const modal = new VocabularyBookPickerModal(this.app, vocabularyFiles, (file) => {
            void this.addVocabularyBook(file).catch(error => {
                console.error('HiWords 添加词库失败:', error);
            });
        });
        modal.open();
    }

    /**
     * 添加生词本
     */
    private async addVocabularyBook(file: TFile) {
        // 检查是否已存在
        const exists = this.plugin.settings.vocabularyBooks.some(book => book.path === file.path);
        if (exists) {
            new Notice(t('notices.book_already_exists'));
            return;
        }

        // 验证词库文件
        const hiWordsParser = file.extension === 'hiwords' ? new HiWordsParser(this.app) : null;
        const metadata = hiWordsParser ? await hiWordsParser.readMetadata(file) : null;
        const isValid = hiWordsParser
            ? metadata !== null && await hiWordsParser.validateFile(file)
            : await new CanvasParser(this.app, this.plugin.settings).validateCanvasFile(file);
        if (!isValid) {
            new Notice(t('notices.invalid_vocabulary_book_file'));
            return;
        }

        // 添加到设置
        const newBook: VocabularyBook = {
            path: file.path,
            name: file.basename,
            enabled: true,
        };

        this.plugin.settings.vocabularyBooks.push(newBook);
        await this.plugin.saveSettings();
        await this.plugin.vocabularyManager.loadVocabularyBook(newBook);
        this.plugin.refreshHighlighter();

        new Notice(t('notices.book_added').replace('{0}', newBook.name));
        this.update(); // 刷新设置页面
    }

    /**
     * 显示现有生词本
     */
    private renderVocabularyBook(setting: Setting, book: VocabularyBook): void {
            setting.settingEl.addClass('hi-words-book-setting');

            // 创建图标容器
            const iconsContainer = setting.controlEl.createDiv({ cls: 'hi-words-book-icons' });

            if (book.path.endsWith('.hiwords')) {
                this.addHiWordsBookColorSelector(iconsContainer, book);
            }

            // 重新加载图标
            const reloadIcon = iconsContainer.createDiv({ cls: 'clickable-icon' });
            setIcon(reloadIcon, 'refresh-cw');
            reloadIcon.setAttribute('aria-label', t('settings.reload_book'));
            reloadIcon.addEventListener('click', () => {
                void (async () => {
                    await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_reloaded').replace('{0}', book.name));
                })().catch(error => {
                    console.error('HiWords 重新加载词库失败:', error);
                });
            });

            // 删除图标
            const deleteIcon = iconsContainer.createDiv({ cls: 'clickable-icon mod-warning' });
            setIcon(deleteIcon, 'trash');
            deleteIcon.setAttribute('aria-label', t('settings.remove_vocabulary_book'));
            deleteIcon.addEventListener('click', () => {
                void (async () => {
                    this.plugin.settings.vocabularyBooks = this.plugin.settings.vocabularyBooks.filter(item => item !== book);
                    await this.plugin.saveSettings();
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_removed').replace('{0}', book.name));
                    this.update(); // 刷新设置页面
                })().catch(error => {
                    console.error('HiWords 删除词库失败:', error);
                });
            });

            // 启用/禁用开关
            setting.addToggle(toggle => toggle
                .setValue(book.enabled)
                .onChange((value) => {
                    this.runAsync(async () => {
                        book.enabled = value;
                        await this.plugin.saveSettings();
                        if (value) {
                            await this.plugin.vocabularyManager.loadVocabularyBook(book);
                        } else {
                            await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                        }
                        this.plugin.refreshHighlighter();
                    }, 'HiWords 保存词库启用状态失败:');
                }));
    }

    private addHiWordsBookColorSelector(container: HTMLElement, book: VocabularyBook) {
        const options = [
            { value: '', label: t('settings.book_color_default'), css: 'var(--text-muted)' },
            { value: '1', label: t('modals.color_red'), css: 'var(--color-red)' },
            { value: '2', label: t('modals.color_orange'), css: 'var(--color-orange)' },
            { value: '3', label: t('modals.color_yellow'), css: 'var(--color-yellow)' },
            { value: '4', label: t('modals.color_green'), css: 'var(--color-green)' },
            { value: '5', label: t('modals.color_blue'), css: 'var(--color-cyan)' },
            { value: '6', label: t('modals.color_purple'), css: 'var(--color-purple)' },
        ];

        const colorControl = container.createDiv({ cls: 'hi-words-book-color-control clickable-icon' });
        colorControl.setAttribute('aria-label', t('settings.book_color'));
        colorControl.setAttribute('role', 'button');
        colorControl.setAttribute('tabindex', '0');
        const swatch = colorControl.createSpan({ cls: 'hi-words-book-color-swatch' });

        const updateSwatch = () => {
            const selected = options.find(option => option.value === (book.color || '')) || options[0];
            swatch.style.setProperty('--hi-words-book-color', selected.css);
            colorControl.setAttribute('aria-label', `${t('settings.book_color')}: ${selected.label}`);
        };

        const applyColor = async (value: string) => {
            book.color = value || undefined;
            updateSwatch();
            await this.plugin.saveSettings();
            if (book.enabled) {
                await this.plugin.vocabularyManager.loadVocabularyBook(book);
            }
            this.plugin.refreshHighlighter();
        };

        const openPalette = (event: MouseEvent | KeyboardEvent) => {
            activeDocument.querySelectorAll('.hi-words-book-color-palette').forEach(el => el.remove());

            const palette = activeDocument.body.createDiv({ cls: 'hi-words-book-color-palette' });

            const closePalette = () => {
                palette.remove();
                activeDocument.removeEventListener('click', handleOutsideClick, true);
                activeDocument.removeEventListener('keydown', handleEscape, true);
            };
            const handleOutsideClick = (outsideEvent: MouseEvent) => {
                const target = outsideEvent.target as Node | null;
                if (target && (palette.contains(target) || colorControl.contains(target))) {
                    return;
                }
                closePalette();
            };
            const handleEscape = (keyboardEvent: KeyboardEvent) => {
                if (keyboardEvent.key === 'Escape') {
                    closePalette();
                }
            };

            for (const option of options) {
                const item = palette.createEl('button', {
                    cls: 'hi-words-book-color-palette-item',
                    attr: {
                        type: 'button',
                        'aria-label': option.label,
                        title: option.label,
                    },
                });
                item.style.setProperty('--hi-words-book-color', option.css);
                item.style.setProperty('background-color', option.css, 'important');
                if ((book.color || '') === option.value) {
                    item.addClass('is-selected');
                    setIcon(item, 'check');
                }
                item.addEventListener('click', () => {
                    void applyColor(option.value);
                    closePalette();
                });
            }

            const rect = colorControl.getBoundingClientRect();
            palette.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
            palette.style.top = `${rect.bottom + 6}px`;

            activeDocument.addEventListener('click', handleOutsideClick, true);
            activeDocument.addEventListener('keydown', handleEscape, true);
        };

        colorControl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPalette(event);
        });
        colorControl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPalette(event);
            }
        });

        updateSwatch();
    }

    /**
     * 显示统计信息
     */
    private displayStats(containerEl = this.containerEl) {
        const stats = this.plugin.vocabularyManager.getStats();

        const statsEl = containerEl.createDiv({ cls: 'hi-words-stats' });

        // 总单词本数量
        const totalBooksItem = statsEl.createDiv({ cls: 'stat-item' });
        totalBooksItem.createDiv({ cls: 'stat-value', text: stats.totalBooks.toString() });
        totalBooksItem.createDiv({ cls: 'stat-label', text: t('settings.total_books').split(':')[0] });

        // 已启用单词本
        const enabledBooksItem = statsEl.createDiv({ cls: 'stat-item' });
        enabledBooksItem.createDiv({ cls: 'stat-value', text: stats.enabledBooks.toString() });
        enabledBooksItem.createDiv({ cls: 'stat-label', text: t('settings.enabled_books').split(':')[0] });

        // 总单词数
        const totalWordsItem = statsEl.createDiv({ cls: 'stat-item' });
        totalWordsItem.createDiv({ cls: 'stat-value', text: stats.totalWords.toString() });
        totalWordsItem.createDiv({ cls: 'stat-label', text: t('settings.total_words').split(':')[0] });
    }
}

// 词库文件选择模态框（使用 FuzzySuggestModal 支持模糊搜索）
class VocabularyBookPickerModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onSelect = onSelect;
        this.setPlaceholder(t('modals.select_vocabulary_book_file'));
    }

    // 返回所有可选项
    getItems(): TFile[] {
        return this.files;
    }

    // 返回每个项的显示文本（用于搜索匹配）
    getItemText(file: TFile): string {
        return file.path;
    }

    // 当用户选择某项时调用
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSelect(file);
    }
}
