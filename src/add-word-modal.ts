import { App, Modal, Notice } from 'obsidian';
import type { VocabularyBook } from './types';
import HiWordsPlugin from '../main';

/**
 * 添加词汇到生词本的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;

    constructor(app: App, plugin: HiWordsPlugin, word: string) {
        super(app);
        this.plugin = plugin;
        this.word = word;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 标题中包含词汇
        contentEl.createEl('h2', { text: `添加 "${this.word}" 到生词本` });
        
        // 生词本选择
        const bookSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        bookSelectContainer.createEl('label', { text: '生词本', cls: 'form-item-label' });
        
        const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: '请选择生词本', value: '' });
        
        this.plugin.settings.vocabularyBooks.forEach(book => {
            if (book.enabled) {
                bookSelect.createEl('option', { text: book.name, value: book.path });
            }
        });
        
        // 颜色选择
        const colorSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        colorSelectContainer.createEl('label', { text: '卡片颜色', cls: 'form-item-label' });
        
        const colorSelect = colorSelectContainer.createEl('select', { cls: 'dropdown' });
        colorSelect.createEl('option', { text: '灰色', value: '' });
        
        // Canvas 支持的颜色
        const colors = [
            { name: '红色', value: '1' },
            { name: '橙色', value: '2' },
            { name: '黄色', value: '3' },
            { name: '绿色', value: '4' },
            { name: '蓝色', value: '5' },
            { name: '紫色', value: '6' }
        ];
        
        colors.forEach(color => {
            colorSelect.createEl('option', { text: color.name, value: color.value });
        });
        
        // 别名输入
        const aliasesContainer = contentEl.createDiv({ cls: 'form-item' });
        aliasesContainer.createEl('label', { text: '别名（可选，用逗号分隔）', cls: 'form-item-label' });
        
        const aliasesInput = aliasesContainer.createEl('input', { 
            placeholder: '例如：doing, done, did',
            cls: 'word-aliases-input'
        });
        
        // 定义输入
        const definitionContainer = contentEl.createDiv({ cls: 'form-item' });
        definitionContainer.createEl('label', { text: '词汇定义', cls: 'form-item-label' });
        
        const definitionInput = definitionContainer.createEl('textarea', { 
            placeholder: '请输入词汇定义...',
            cls: 'word-definition-input'
        });
        definitionInput.rows = 5;
        
        // 按钮
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const addButton = buttonContainer.createEl('button', { text: '添加', cls: 'mod-cta' });
        addButton.onclick = async () => {
            const selectedBook = bookSelect.value;
            const definition = definitionInput.value;
            const colorValue = colorSelect.value ? parseInt(colorSelect.value) : undefined;
            const aliasesText = aliasesInput.value.trim();
            
            // 处理别名
            let aliases: string[] | undefined = undefined;
            if (aliasesText) {
                aliases = aliasesText.split(',').map(alias => alias.trim().toLowerCase());
                // 去除空别名
                aliases = aliases.filter(alias => alias.length > 0);
                if (aliases.length === 0) {
                    aliases = undefined;
                }
            }
            
            if (!selectedBook) {
                new Notice('请选择生词本');
                return;
            }
            
            // 显示加载中提示
            const loadingNotice = new Notice('正在添加词汇到生词本...', 0);
            
            try {
                // 调用添加词汇到 Canvas 的方法
                const success = await this.plugin.vocabularyManager.addWordToCanvas(
                    selectedBook,
                    this.word,
                    definition,
                    colorValue,
                    aliases
                );
                
                // 关闭加载提示
                loadingNotice.hide();
                
                if (success) {
                    new Notice(`词汇 "${this.word}" 已成功添加到生词本`);
                    // 刷新高亮器
                    this.plugin.refreshHighlighter();
                    this.close();
                } else {
                    new Notice('添加词汇失败，请检查生词本文件');
                }
            } catch (error) {
                loadingNotice.hide();
                console.error('Failed to add word:', error);
                new Notice('添加词汇时发生错误');
            }
        };
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
