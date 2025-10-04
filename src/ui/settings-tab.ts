import { App, PluginSettingTab, Setting, TFile, Notice, FuzzySuggestModal } from 'obsidian';
import HiWordsPlugin from '../../main';
import { VocabularyBook, HighlightStyle } from '../utils';
import { CanvasParser } from '../canvas';
import { t } from '../i18n';

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin;

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 添加自动布局设置
     */
    private addAutoLayoutSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.auto_layout'))
            .setHeading();

        // 启用自动布局
        new Setting(containerEl)
            .setName(t('settings.enable_auto_layout'))
            .setDesc(t('settings.enable_auto_layout_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLayoutEnabled ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.autoLayoutEnabled = value;
                    await this.plugin.saveSettings();
                }));

        // 左侧区域卡片尺寸
        const sizeSetting = new Setting(containerEl)
            .setName(t('settings.card_size'))
            .setDesc(t('settings.card_size_desc'));
        sizeSetting.addText(text => text
            .setPlaceholder('width')
            .setValue(String(this.plugin.settings.cardWidth ?? 260))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 60) {
                    this.plugin.settings.cardWidth = num;
                    await this.plugin.saveSettings();
                }
            }));
        sizeSetting.addText(text => text
            .setPlaceholder('height')
            .setValue(String(this.plugin.settings.cardHeight ?? 120))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 40) {
                    this.plugin.settings.cardHeight = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 网格间距
        const gapSetting = new Setting(containerEl)
            .setName(t('settings.grid_gaps'))
            .setDesc(t('settings.grid_gaps_desc'));
        gapSetting.addText(text => text
            .setPlaceholder('horizontal')
            .setValue(String(this.plugin.settings.horizontalGap ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.horizontalGap = num;
                    await this.plugin.saveSettings();
                }
            }));
        gapSetting.addText(text => text
            .setPlaceholder('vertical')
            .setValue(String(this.plugin.settings.verticalGap ?? 16))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.verticalGap = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 左侧留白与最小X
        const padSetting = new Setting(containerEl)
            .setName(t('settings.left_padding'))
            .setDesc(t('settings.left_padding_desc'));
        padSetting.addText(text => text
            .setPlaceholder('leftPadding')
            .setValue(String(this.plugin.settings.leftPadding ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.leftPadding = num;
                    await this.plugin.saveSettings();
                }
            }));
        padSetting.addText(text => text
            .setPlaceholder('minLeftX')
            .setValue(String(this.plugin.settings.minLeftX ?? 0))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num)) {
                    this.plugin.settings.minLeftX = num;
                    await this.plugin.saveSettings();
                }
            }));

        // 列数设置
        new Setting(containerEl)
            .setName(t('settings.columns_auto'))
            .setDesc(t('settings.columns_auto_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.columnsAuto ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.columnsAuto = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (!(this.plugin.settings.columnsAuto ?? true)) {
            const colSetting = new Setting(containerEl)
                .setName(t('settings.columns'))
                .setDesc(t('settings.columns_desc'));
            colSetting.addText(text => text
                .setPlaceholder('columns')
                .setValue(String(this.plugin.settings.columns ?? 3))
                .onChange(async (val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.columns = num;
                        await this.plugin.saveSettings();
                    }
                }));
            colSetting.addText(text => text
                .setPlaceholder('maxColumns')
                .setValue(String(this.plugin.settings.maxColumns ?? 6))
                .onChange(async (val) => {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxColumns = num;
                        await this.plugin.saveSettings();
                    }
                }));
        }

        // 分组内布局
        const innerSetting = new Setting(containerEl)
            .setName(t('settings.group_inner_layout'))
            .setDesc(t('settings.group_inner_layout_desc'));
        innerSetting.addText(text => text
            .setPlaceholder('innerPadding')
            .setValue(String(this.plugin.settings.groupInnerPadding ?? 24))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.groupInnerPadding = num;
                    await this.plugin.saveSettings();
                }
            }));
        innerSetting.addText(text => text
            .setPlaceholder('innerGap')
            .setValue(String(this.plugin.settings.groupInnerGap ?? 12))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) {
                    this.plugin.settings.groupInnerGap = num;
                    await this.plugin.saveSettings();
                }
            }));
        innerSetting.addText(text => text
            .setPlaceholder('innerColumns')
            .setValue(String(this.plugin.settings.groupInnerColumns ?? 2))
            .onChange(async (val) => {
                const num = parseInt(val, 10);
                if (!isNaN(num) && num > 0) {
                    this.plugin.settings.groupInnerColumns = num;
                    await this.plugin.saveSettings();
                }
            }));

    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 基础设置
        this.addBasicSettings();

        // 生词本管理
        this.addVocabularyBooksSection();

        // 自动布局设置（移动到最后）
        this.addAutoLayoutSettings();
    }

    /**
     * 添加基础设置
     */
    private addBasicSettings() {
        const { containerEl } = this;

        // 启用自动高亮
        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight'))
            .setDesc(t('settings.enable_auto_highlight_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoHighlight = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 浮动显示定义
        new Setting(containerEl)
            .setName(t('settings.show_definition_on_hover'))
            .setDesc(t('settings.show_definition_on_hover_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDefinitionOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showDefinitionOnHover = value;
                    await this.plugin.saveSettings();
                }));

        // 高亮样式选择
        new Setting(containerEl)
            .setName(t('settings.highlight_style'))
            .setDesc(t('settings.highlight_style_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('underline', t('settings.style_underline'))
                .addOption('background', t('settings.style_background'))
                .addOption('bold', t('settings.style_bold'))
                .addOption('dotted', t('settings.style_dotted'))
                .addOption('wavy', t('settings.style_wavy'))
                .setValue(this.plugin.settings.highlightStyle)
                .onChange(async (value) => {
                    this.plugin.settings.highlightStyle = value as HighlightStyle;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 启用已掌握功能
        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature'))
            .setDesc(t('settings.enable_mastered_feature_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMasteredFeature)
                .onChange(async (value) => {
                    this.plugin.settings.enableMasteredFeature = value;
                    // 当启用已掌握功能时，自动启用侧边栏分组显示
                    this.plugin.settings.showMasteredInSidebar = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                    // 触发侧边栏更新
                    this.plugin.app.workspace.trigger('hi-words:mastered-changed');
                    this.display();
                }));

        // 已掌握判定模式（分组/颜色）
        const masteredMode = new Setting(containerEl)
            .setName(t('settings.mastered_detection') || 'Mastered detection mode')
            .setDesc(t('settings.mastered_detection_desc') || 'Choose how to detect "mastered": by group or by color (green = 4)');
        masteredMode.addDropdown(dropdown => dropdown
            .addOption('group', t('settings.mode_group') || 'Group mode')
            .addOption('color', t('settings.mode_color') || 'Color mode (green = 4)')
            .setValue(this.plugin.settings.masteredDetection ?? 'group')
            .onChange(async (value) => {
                // 保存并同步到各子模块
                (this.plugin.settings as any).masteredDetection = value as 'group' | 'color';
                await this.plugin.saveSettings();
                // 同步给 VocabularyManager/Parser/Editor
                if (this.plugin.vocabularyManager?.updateSettings) {
                    this.plugin.vocabularyManager.updateSettings(this.plugin.settings as any);
                }
                // 重新加载以按新模式解析 mastered 状态
                await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                this.plugin.refreshHighlighter();
                // 通知工作区应用
                this.plugin.app.workspace.trigger('hi-words:settings-changed');
            }));
        // 当功能未启用时禁用选择
        if (!this.plugin.settings.enableMasteredFeature) {
            masteredMode.setDisabled(true);
        }

        // 模糊定义内容
        new Setting(containerEl)
            .setName(t('settings.blur_definitions'))
            .setDesc(t('settings.blur_definitions_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.blurDefinitions)
                .onChange(async (value) => {
                    this.plugin.settings.blurDefinitions = value;
                    await this.plugin.saveSettings();
                    // 触发侧边栏更新以应用模糊效果
                    this.plugin.app.workspace.trigger('hi-words:settings-changed');
                }));

        // 发音地址模板（点击主词发音）
        new Setting(containerEl)
            .setName(t('settings.tts_template') || 'TTS template')
            .setDesc(t('settings.tts_template_desc') || 'Use {{word}} as placeholder, e.g. https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
            .addText(text => text
                .setPlaceholder('https://...{{word}}...')
                .setValue(this.plugin.settings.ttsTemplate || 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
                .onChange(async (val) => {
                    this.plugin.settings.ttsTemplate = val.trim();
                    await this.plugin.saveSettings();
                }));

    }

    /**
     * 添加生词本管理部分
     */
    private addVocabularyBooksSection() {
        const { containerEl } = this;
        
        // 添加标题 - 使用 Obsidian 推荐的设置标题样式
        new Setting(containerEl)
            .setName(t('settings.vocabulary_books'))
            .setHeading();
            
        // 添加生词本按钮 - 使用默认的 setting-item 样式
        new Setting(containerEl)
            .setName(t('settings.add_vocabulary_book'))
            .setDesc('')
            .addButton(button => button
                .setIcon('plus-circle')
                .setTooltip(t('settings.add_vocabulary_book'))
                .onClick(() => this.showCanvasFilePicker())
            );

        // 显示现有生词本
        this.displayVocabularyBooks();

        // 统计信息
        this.displayStats();
    }

    /**
     * 显示 Canvas 文件选择器
     */
    private async showCanvasFilePicker() {
        const canvasFiles = this.app.vault.getFiles()
            .filter(file => file.extension === 'canvas');

        if (canvasFiles.length === 0) {
            new Notice(t('notices.no_canvas_files'));
            return;
        }

        // 创建选择模态框
        const modal = new CanvasPickerModal(this.app, canvasFiles, async (file) => {
            await this.addVocabularyBook(file);
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

        // 验证 Canvas 文件
        const parser = new CanvasParser(this.app, this.plugin.settings as any);
        const isValid = await parser.validateCanvasFile(file);
        if (!isValid) {
            new Notice(t('notices.invalid_canvas_file'));
            return;
        }

        // 添加到设置
        const newBook: VocabularyBook = {
            path: file.path,
            name: file.basename,
            enabled: true
        };

        this.plugin.settings.vocabularyBooks.push(newBook);
        await this.plugin.saveSettings();
        await this.plugin.vocabularyManager.loadVocabularyBook(newBook);
        this.plugin.refreshHighlighter();

        new Notice(t('notices.book_added').replace('{0}', newBook.name));
        this.display(); // 刷新设置页面
    }

    /**
     * 显示现有生词本
     */
    private displayVocabularyBooks() {
        const { containerEl } = this;

        if (this.plugin.settings.vocabularyBooks.length === 0) {
            containerEl.createEl('p', { 
                text: t('settings.no_vocabulary_books'),
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.vocabularyBooks.forEach((book, index) => {
            const setting = new Setting(containerEl)
                .setName(book.name)
                .setDesc(`${t('settings.path')}: ${book.path}`);

            // 重新加载按钮
            setting.addButton(button => button
                .setIcon('refresh-cw')
                .setTooltip(t('settings.reload_book'))
                .onClick(async () => {
                    await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_reloaded').replace('{0}', book.name));
                }));

            // 删除按钮
            setting.addButton(button => button
                .setIcon('trash')
                .setTooltip(t('settings.remove_vocabulary_book'))
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.vocabularyBooks.splice(index, 1);
                    await this.plugin.saveSettings();
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_removed').replace('{0}', book.name));
                    this.display(); // 刷新设置页面
                }));
                
            // 启用/禁用开关
            setting.addToggle(toggle => toggle
                .setValue(book.enabled)
                .onChange(async (value) => {
                    book.enabled = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        await this.plugin.vocabularyManager.loadVocabularyBook(book);
                    } else {
                        await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    }
                    this.plugin.refreshHighlighter();
                }));
        });
    }

    /**
     * 显示统计信息
     */
    private displayStats() {
        const { containerEl } = this;
        const stats = this.plugin.vocabularyManager.getStats();
        
        new Setting(containerEl)
            .setName(t('settings.statistics'))
            .setHeading();
        
        const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' });

        // 总单词本数量
        const totalBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalBooksItem.createEl('div', { cls: 'stat-value', text: stats.totalBooks.toString() });
        totalBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.total_books').split(':')[0] });

        // 已启用单词本
        const enabledBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        enabledBooksItem.createEl('div', { cls: 'stat-value', text: stats.enabledBooks.toString() });
        enabledBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.enabled_books').split(':')[0] });

        // 总单词数
        const totalWordsItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalWordsItem.createEl('div', { cls: 'stat-value', text: stats.totalWords.toString() });
        totalWordsItem.createEl('div', { cls: 'stat-label', text: t('settings.total_words').split(':')[0] });
    }
}

// Canvas 文件选择模态框（使用 FuzzySuggestModal 支持模糊搜索）
class CanvasPickerModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onSelect = onSelect;
        this.setPlaceholder(t('modals.select_canvas_file'));
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
