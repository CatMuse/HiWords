import { App, Modal, Notice, setIcon } from 'obsidian';
import type { VocabularyBook, WordDefinition } from '../utils';
import HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { DictionaryService } from '../services/dictionary-service';

/**
 * 添加或编辑词汇的模态框
 */
export class AddWordModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;
    private sentence: string;
    private isEditMode: boolean;
    private definition: WordDefinition | null;
    private dictionaryService: DictionaryService;
    
    // 静态变量，记住用户上次选择的生词本（重启后丢失）
    private static lastSelectedBookPath: string | null = null;

    /**
     * 构造函数
     * @param app Obsidian 应用实例
     * @param plugin 插件实例
     * @param word 要添加或编辑的单词
     * @param sentence 单词所在的句子（可选）
     * @param isEditMode 是否为编辑模式
     */
    constructor(app: App, plugin: HiWordsPlugin, word: string, sentence: string = '', isEditMode: boolean = false) {
        super(app);
        this.plugin = plugin;
        this.word = word;
        this.sentence = sentence;
        this.isEditMode = isEditMode;
        this.dictionaryService = new DictionaryService(this.plugin.settings.aiDictionary!);
        
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
        
        // 单词输入（仅在添加模式下显示）
        let wordInput: HTMLInputElement | null = null;
        if (!this.isEditMode) {
            const wordContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
            wordContainer.createEl('label', { text: t('modals.word_label'), cls: 'hiwords-form-item-label' });
            
            wordInput = wordContainer.createEl('input', { 
                type: 'text',
                placeholder: t('modals.word_placeholder'),
                cls: 'setting-item-input'
            });
            wordInput.value = this.word;
            
            // 如果没有预填充单词，自动聚焦到单词输入框
            if (!this.word) {
                setTimeout(() => wordInput?.focus(), 50);
            }
        }
        
        // 生词本选择
        const bookSelectContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        bookSelectContainer.createEl('label', { text: t('modals.book_label'), cls: 'hiwords-form-item-label' });
        
        const bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown' });
        bookSelect.createEl('option', { text: t('modals.select_book'), value: '' });
        
        const enabledBooks = this.plugin.settings.vocabularyBooks.filter(book => book.enabled);
        let defaultBookSelected = false;
        enabledBooks.forEach((book, index) => {
            const option = bookSelect.createEl('option', { text: book.name, value: book.path });
            
            // 如果是编辑模式且当前词汇来自此生词本，则选中该选项
            if (this.isEditMode && this.definition && this.definition.source === book.path) {
                option.selected = true;
                defaultBookSelected = true;
            }
            // 如果是添加模式，优先选择上次使用的生词本
            else if (!this.isEditMode && !defaultBookSelected) {
                // 优先选择上次使用的生词本
                if (AddWordModal.lastSelectedBookPath && book.path === AddWordModal.lastSelectedBookPath) {
                    option.selected = true;
                    defaultBookSelected = true;
                }
                // 如果没有缓存或缓存的生词本不可用，选择第一个
                else if (!AddWordModal.lastSelectedBookPath && index === 0) {
                    option.selected = true;
                    defaultBookSelected = true;
                }
            }
        });
        
        // 如果是编辑模式，禁用生词本选择（不允许更改词汇所在的生词本）
        if (this.isEditMode && this.definition) {
            bookSelect.disabled = true;
        }

        // 颜色选择
        const colorSelectContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        colorSelectContainer.createEl('label', { text: t('modals.color_label'), cls: 'hiwords-form-item-label' });
        
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
        const aliasesContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        aliasesContainer.createEl('label', { text: t('modals.aliases_label'), cls: 'hiwords-form-item-label' });
        
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
        const definitionContainer = contentEl.createDiv({ cls: 'hiwords-form-item' });
        const definitionLabelContainer = definitionContainer.createDiv({ cls: 'hiwords-definition-label-container' });
        definitionLabelContainer.createEl('label', { text: t('modals.definition_label'), cls: 'hiwords-form-item-label' });
        
        // 添加自动填充按钮
        const autoFillBtn = definitionLabelContainer.createDiv({ cls: 'hiwords-auto-fill-btn' });
        const iconContainer = autoFillBtn.createDiv({ cls: 'hiwords-auto-fill-icon' });
        setIcon(iconContainer, 'sparkles');
        autoFillBtn.setAttribute('aria-label', t('modals.auto_fill_definition'));
        
        autoFillBtn.addEventListener('click', async () => {
            // 获取要查询的单词
            const queryWord = this.isEditMode ? this.word : (wordInput?.value.trim() || '');
            
            if (!queryWord) {
                new Notice(t('notices.enter_word_first'));
                return;
            }
            
            // 显示加载状态
            autoFillBtn.addClass('hiwords-loading');
            iconContainer.empty();
            setIcon(iconContainer, 'loader');
            
            try {
                const definition = await this.dictionaryService.fetchDefinition(queryWord, this.sentence);
                definitionInput.value = definition;
                new Notice(t('notices.definition_fetched'));
            } catch (error) {
                console.error('Failed to fetch definition:', error);
                new Notice(t('notices.definition_fetch_failed'));
            } finally {
                // 恢复按钮状态
                autoFillBtn.removeClass('hiwords-loading');
                iconContainer.empty();
                setIcon(iconContainer, 'sparkles');
            }
        });
        
        const definitionInput = definitionContainer.createEl('textarea', { 
            placeholder: t('modals.definition_placeholder'),
            cls: 'setting-item-input hiwords-word-definition-input'
        });
        definitionInput.rows = 5;
        
        // 如果是编辑模式且当前词汇有定义，则预填充定义
        if (this.isEditMode && this.definition && this.definition.definition) {
            definitionInput.value = this.definition.definition;
        }
        
        // 智能聚焦逻辑
        setTimeout(() => {
            if (!this.isEditMode && this.word) {
                // 添加模式且有预填充单词时，聚焦到定义输入框
                definitionInput.focus();
            } else if (this.isEditMode && this.definition) {
                // 编辑模式时，聚焦到定义输入框（方便修改定义）
                definitionInput.focus();
            }
            // 注意：如果是添加模式且没有预填充单词，已经在第 64 行聚焦到单词输入框了
        }, 50);
        
        // 按钮
        const buttonContainer = contentEl.createDiv({ cls: 'hiwords-modal-button-container' });
        
        // 创建左侧容器（用于删除按钮或占位）
        const leftButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-left' });
        
        // 在编辑模式下添加删除按钮（左侧）
        if (this.isEditMode && this.definition) {
            const deleteButton = leftButtonGroup.createEl('button', { 
                cls: 'delete-word-button',
            });
            // 使用 Obsidian 的 setIcon 方法
            setIcon(deleteButton, 'trash');
            deleteButton.onclick = async () => {
                // 确认删除
                const confirmed = await this.showDeleteConfirmation();
                if (!confirmed) return;
                
                // 显示删除中提示
                const loadingNotice = new Notice(t('notices.deleting_word'), 0);
                
                try {
                    const success = await this.plugin.vocabularyManager.deleteWordFromCanvas(
                        this.definition!.source, 
                        this.definition!.nodeId
                    );
                    
                    loadingNotice.hide();
                    
                    if (success) {
                        new Notice(t('notices.word_deleted'));
                        // 刷新高亮
                        this.plugin.refreshHighlighter();
                        this.close();
                    } else {
                        new Notice(t('notices.delete_word_failed'));
                    }
                } catch (error) {
                    loadingNotice.hide();
                    console.error('删除词汇时发生错误:', error);
                    new Notice(t('notices.error_deleting_word'));
                }
            };
        }
        
        // 创建右侧按钮组
        const rightButtonGroup = buttonContainer.createDiv({ cls: 'hiwords-button-group-right' });
        
        const cancelButton = rightButtonGroup.createEl('button', { text: t('modals.cancel_button') });
        cancelButton.onclick = () => this.close();
        
        // 根据模式显示不同的按钮文本
        const buttonTextKey = this.isEditMode ? 'modals.save_button' : 'modals.add_button';
        const actionButton = rightButtonGroup.createEl('button', { text: t(buttonTextKey), cls: 'mod-cta' });
        actionButton.onclick = async () => {
            // 在添加模式下，从输入框获取单词
            let finalWord = this.word;
            if (!this.isEditMode && wordInput) {
                finalWord = wordInput.value.trim();
                if (!finalWord) {
                    new Notice(t('notices.word_required'));
                    wordInput.focus();
                    return;
                }
            }
            
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
                        finalWord,
                        definition,
                        colorValue,
                        aliases
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_updated_success').replace('{0}', finalWord);
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
                        finalWord,
                        definition,
                        colorValue,
                        aliases
                    );
                    
                    // 关闭加载提示
                    loadingNotice.hide();
                    
                    if (success) {
                        // 保存用户选择的生词本到缓存
                        AddWordModal.lastSelectedBookPath = selectedBook;
                        // 使用格式化字符串替换
                        const successMessage = t('notices.word_added_success').replace('{0}', finalWord);
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

    /**
     * 显示删除确认对话框
     * @returns Promise<boolean> 用户是否确认删除
     */
    private async showDeleteConfirmation(): Promise<boolean> {
        // 使用原生的 confirm 对话框，更简洁且符合 Obsidian 的设计原则
        return window.confirm(t('modals.delete_confirmation').replace('{0}', this.definition?.word || this.word));
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
