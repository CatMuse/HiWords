import { App, PluginSettingTab, Setting, TFile, Notice, Modal } from 'obsidian';
import HiWordsPlugin from '../main';
import { VocabularyBook } from './types';
import { CanvasParser } from './canvas-parser';

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
        
        containerEl.createEl('h3', { text: '基础设置' });

        // 启用自动高亮
        new Setting(containerEl)
            .setName('启用自动高亮')
            .setDesc('在阅读时自动高亮生词本中的词汇')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoHighlight = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 悬停显示定义
        new Setting(containerEl)
            .setName('悬停显示定义')
            .setDesc('鼠标悬停在高亮词汇上时显示定义')
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
        
        containerEl.createEl('h3', { text: '生词本管理' });

        // 添加新生词本按钮
        new Setting(containerEl)
            .setName('添加生词本')
            .setDesc('选择一个 Canvas 文件作为生词本')
            .addButton(button => button
                .setIcon('plus-circle')
                .setTooltip('添加 Canvas 生词本')
                .setCta()
                .onClick(() => this.showCanvasFilePicker()));

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
            new Notice('未找到 Canvas 文件');
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
            new Notice('该生词本已存在');
            return;
        }

        // 验证 Canvas 文件
        const parser = new CanvasParser(this.app);
        const isValid = await parser.validateCanvasFile(file);
        if (!isValid) {
            new Notice('无效的 Canvas 文件');
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

        new Notice(`已添加生词本: ${newBook.name}`);
        this.display(); // 刷新设置页面
    }

    /**
     * 显示现有生词本
     */
    private displayVocabularyBooks() {
        const { containerEl } = this;

        if (this.plugin.settings.vocabularyBooks.length === 0) {
            containerEl.createEl('p', { 
                text: '暂无生词本，请添加 Canvas 文件作为生词本',
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.vocabularyBooks.forEach((book, index) => {
            const setting = new Setting(containerEl)
                .setName(book.name)
                .setDesc(`路径: ${book.path}`);

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



            // 重新加载按钮
            setting.addButton(button => button
                .setIcon('refresh-cw')
                .setTooltip('重新解析该生词本')
                .onClick(async () => {
                    await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                    this.plugin.refreshHighlighter();
                    new Notice(`已重新加载: ${book.name}`);
                }));

            // 删除按钮
            setting.addButton(button => button
                .setIcon('trash')
                .setTooltip('删除生词本')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.vocabularyBooks.splice(index, 1);
                    await this.plugin.saveSettings();
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    new Notice(`已删除生词本: ${book.name}`);
                    this.display(); // 刷新设置页面
                }));
        });
    }

    /**
     * 显示统计信息
     */
    private displayStats() {
        const { containerEl } = this;
        
        containerEl.createEl('h3', { text: '统计信息' });
        
        const stats = this.plugin.vocabularyManager.getStats();
        
        const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' });
        statsEl.createEl('p', { text: `总生词本数量: ${stats.totalBooks}` });
        statsEl.createEl('p', { text: `已启用生词本: ${stats.enabledBooks}` });
        statsEl.createEl('p', { text: `总词汇数量: ${stats.totalWords}` });
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

        contentEl.createEl('h2', { text: '选择 Canvas 文件' });

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
