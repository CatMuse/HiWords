import { App, Modal, Notice } from 'obsidian';
import type { VocabularyBook, WordDefinition } from './types';
import HiWordsPlugin from '../main';
import { t } from './i18n';

/**
 * 添加或编辑词汇的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;
    private isEditMode: boolean;
    private definition: WordDefinition | null;

    /**
     * 构造函数
     * @param app Obsidian 应用实例
     * @param plugin 插件实例
     * @param word 要添加或编辑的单词
     * @param isEditMode 是否为编辑模式
     */
    constructor(app: App, plugin: HiWordsPlugin, word: string, isEditMode: boolean = false) {
        super(app);
        this.plugin = plugin;
        this.word = word;
        this.isEditMode = isEditMode;
        
        // 如果是编辑模式，获取单词的定义
        if (isEditMode) {
            this.definition = this.plugin.vocabularyManager.getDefinition(word);
        } else {
            this.definition = null;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 标题中包含词汇，根据模式显示不同标题
        const titleKey = this.isEditMode ? 'modals.edit_word_title' : 'modals.add_word_title';
        contentEl.createEl('h2', { text: `${t(titleKey)} "${this.word}"` });
        
        // 生词本选择
        const bookSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        bookSelectContainer.createEl('label', { text: t('modals.book_label'), cls: 'form-item-label' });
        
        const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: t('modals.select_book'), value: '' });
        
        this.plugin.settings.vocabularyBooks.forEach(book => {
            if (book.enabled) {
                const option = bookSelect.createEl('option', { text: book.name, value: book.path });
                
                // 如果是编辑模式且当前词汇来自此生词本，则选中该选项
                if (this.isEditMode && this.definition && this.definition.source === book.path) {
                    option.selected = true;
                }
            }
        });
        
        // 如果是编辑模式，禁用生词本选择（不允许更改词汇所在的生词本）
        if (this.isEditMode && this.definition) {
            bookSelect.disabled = true;
        }
        
        // 颜色选择
        const colorSelectContainer = contentEl.createDiv({ cls: 'form-item' });
        colorSelectContainer.createEl('label', { text: t('modals.color_label'), cls: 'form-item-label' });
        
        const colorSelect = colorSelectContainer.createEl('select', { cls: 'dropdown setting-item-select' });
        colorSelect.createEl('option', { text: t('modals.color_gray'), value: '' });
        
        // Canvas 支持的颜色
        const colors = [
            { name: t('modals.color_red'), value: '1' },
            { name: t('modals.color_orange'), value: '2' },
            { name: t('modals.color_yellow'), value: '3' },
            { name: t('modals.color_green'), value: '4' },
            { name: t('modals.color_blue'), value: '5' },
            { name: t('modals.color_purple'), value: '6' }
        ];
        
        colors.forEach(color => {
            const option = colorSelect.createEl('option', { text: color.name, value: color.value });
            
            // 如果是编辑模式且当前词汇使用此颜色，则选中该选项
            if (this.isEditMode && this.definition && this.definition.color === color.value) {
                option.selected = true;
            }
        });
        
        // 别名输入
        const aliasesContainer = contentEl.createDiv({ cls: 'form-item' });
        aliasesContainer.createEl('label', { text: t('modals.aliases_label'), cls: 'form-item-label' });
        
        const aliasesInput = aliasesContainer.createEl('input', { 
            type: 'text',
            placeholder: t('modals.aliases_placeholder'),
            cls: 'setting-item-input word-aliases-input'
        });
        
        // 如果是编辑模式且当前词汇有别名，则预填充别名
        if (this.isEditMode && this.definition && this.definition.aliases && this.definition.aliases.length > 0) {
            aliasesInput.value = this.definition.aliases.join(', ');
        }
        
        // 定义输入
        const definitionContainer = contentEl.createDiv({ cls: 'form-item' });
        definitionContainer.createEl('label', { text: t('modals.definition_label'), cls: 'form-item-label' });
        
        const definitionInput = definitionContainer.createEl('textarea', { 
            placeholder: t('modals.definition_placeholder'),
            cls: 'setting-item-input word-definition-input'
        });
        definitionInput.rows = 5;
        
        // 如果是编辑模式且当前词汇有定义，则预填充定义
        if (this.isEditMode && this.definition && this.definition.definition) {
            definitionInput.value = this.definition.definition;
        }
        
        // 按钮
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: t('modals.cancel_button') });
        cancelButton.onclick = () => this.close();
        
        // 根据模式显示不同的按钮文本
        const buttonTextKey = this.isEditMode ? 'modals.save_button' : 'modals.add_button';
        const actionButton = buttonContainer.createEl('button', { text: t(buttonTextKey), cls: 'mod-cta' });
        actionButton.onclick = async () => {
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
                new Notice(t('notices.select_book_required'));
                return;
            }
            
            // 显示加载中提示
            const loadingNotice = this.isEditMode ? 
                new Notice(t('notices.updating_word'), 0) : 
                new Notice(t('notices.adding_word'), 0);
            
            try {
                let success = false;
                
                if (this.isEditMode && this.definition) {
                    // 编辑模式：调用更新词汇的方法
                    
                    success = await this.plugin.vocabularyManager.updateWordInCanvas(
                        this.definition.source,
                        this.definition.nodeId,
                        this.word,
                        definition,
                        colorValue,
                        aliases
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_updated_success').replace('{0}', this.word);
                        new Notice(successMessage);
                        // 刷新高亮器
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.update_word_failed'));
                    }
                } else {
                    // 添加模式：调用添加词汇到 Canvas 的方法
                    success = await this.plugin.vocabularyManager.addWordToCanvas(
                        selectedBook,
                        this.word,
                        definition,
                        colorValue,
                        aliases
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_added_success').replace('{0}', this.word);
                        new Notice(successMessage);
                        // 刷新高亮器
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.add_word_failed'));
                    }
                }
            } catch (error) {
                loadingNotice.hide();
                console.error('Failed to add/update word:', error);
                new Notice(t('notices.error_processing_word'));
            }
        };
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
