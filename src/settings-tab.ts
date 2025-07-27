import { App, PluginSettingTab, Setting, TFile, Notice, Modal } from 'obsidian';
import HiWordsPlugin from '../main';
import { VocabularyBook } from './types';
import { CanvasParser } from './canvas-parser';
import { t } from './i18n';

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin;

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 基础设置
        this.addBasicSettings();
        
        // 生词本管理
        this.addVocabularyBooksSection();
    }

    /**
     * 添加基础设置
     */
    private addBasicSettings() {
        const { containerEl } = this;
        
        containerEl.createEl('h3', { text: t('settings.title') });

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

        // 悬停显示定义
        new Setting(containerEl)
            .setName(t('settings.show_definition_on_hover'))
            .setDesc(t('settings.show_definition_on_hover_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDefinitionOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showDefinitionOnHover = value;
                    await this.plugin.saveSettings();
                }));


    }

    /**
     * 添加生词本管理部分
     */
    private addVocabularyBooksSection() {
        const { containerEl } = this;
        
        // 创建标题容器
        const headerContainer = containerEl.createDiv({ cls: 'hi-words-header-container' });
        
        // 添加标题
        headerContainer.createEl('h3', { text: t('settings.vocabulary_books') });
        
        // 添加按钮容器
        const buttonContainer = headerContainer.createDiv({ cls: 'hi-words-button-container' });
        
        // 使用 Obsidian 的 ButtonComponent 创建按钮
        const addButton = new Setting(buttonContainer)
            .addButton(button => button
                .setIcon('plus-circle')
                .setTooltip(t('settings.add_vocabulary_book'))
                .setCta()
                .onClick(() => this.showCanvasFilePicker())
            );
        
        // 移除 Setting 组件的默认样式
        addButton.settingEl.classList.add('hi-words-add-button-setting');
        addButton.infoEl.remove();

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
        const parser = new CanvasParser(this.app);
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
        
        containerEl.createEl('h3', { text: t('settings.statistics') });
        
        const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' });
        statsEl.createEl('p', { text: t('settings.total_books').replace('{0}', stats.totalBooks.toString()) });
        statsEl.createEl('p', { text: t('settings.enabled_books').replace('{0}', stats.enabledBooks.toString()) });
        statsEl.createEl('p', { text: t('settings.total_words').replace('{0}', stats.totalWords.toString()) });
    }
}

// Canvas 文件选择模态框
class CanvasPickerModal extends Modal {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: t('modals.select_canvas_file') });

        this.files.forEach(file => {
            const itemEl = contentEl.createEl('div', { cls: 'canvas-picker-item' });
            
            const nameEl = itemEl.createEl('div', { 
                text: file.basename,
                cls: 'canvas-picker-name'
            });
            
            const pathEl = itemEl.createEl('div', { 
                text: file.path,
                cls: 'canvas-picker-path'
            });

            itemEl.addEventListener('click', () => {
                this.onSelect(file);
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
