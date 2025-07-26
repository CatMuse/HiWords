import { App, Modal, Notice } from 'obsidian';
import type { VocabularyBook } from './types';
import HelloWordPlugin from '../main';

/**
 * 添加词汇到生词本的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HelloWordPlugin;
    private word: string;

    constructor(app: App, plugin: HelloWordPlugin, word: string) {
        super(app);
        this.plugin = plugin;
        this.word = word;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '添加词汇到生词本' });
        
        contentEl.createEl('p', { text: `词汇: ${this.word}` });
        
        // 选择生词本
        const bookSelectContainer = contentEl.createDiv({ cls: 'setting-item' });
        bookSelectContainer.createDiv({ text: '生词本', cls: 'setting-item-name' });
        const bookSelectControl = bookSelectContainer.createDiv({ cls: 'setting-item-control' });
        
        const bookSelect = bookSelectControl.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: '请选择生词本', value: '' });
        
        this.plugin.settings.vocabularyBooks.forEach(book => {
            if (book.enabled) {
                bookSelect.createEl('option', { text: book.name, value: book.path });
            }
        });
        
        // 选择颜色
        const colorSelectContainer = contentEl.createDiv({ cls: 'setting-item' });
        colorSelectContainer.createDiv({ text: '卡片颜色', cls: 'setting-item-name' });
        const colorSelectControl = colorSelectContainer.createDiv({ cls: 'setting-item-control' });
        
        const colorSelect = colorSelectControl.createEl('select', { cls: 'dropdown' });
        colorSelect.createEl('option', { text: '默认', value: '' });
        
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
        
        // 定义输入
        const definitionContainer = contentEl.createDiv({ cls: 'setting-item' });
        definitionContainer.createDiv({ text: '词汇定义', cls: 'setting-item-name' });
        const definitionControl = definitionContainer.createDiv({ cls: 'setting-item-control' });
        
        const definitionInput = definitionControl.createEl('textarea', { 
            placeholder: '请输入词汇定义...',
            cls: 'word-definition-input'
        });
        definitionInput.rows = 5;
        definitionInput.style.width = '100%';
        
        // 按钮
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const addButton = buttonContainer.createEl('button', { text: '添加', cls: 'mod-cta' });
        addButton.style.marginLeft = '10px';
        addButton.onclick = async () => {
            const selectedBook = bookSelect.value;
            const definition = definitionInput.value;
            const colorValue = colorSelect.value ? parseInt(colorSelect.value) : undefined;
            
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
                    colorValue
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
