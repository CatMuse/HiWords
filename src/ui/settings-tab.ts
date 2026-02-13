import { App, PluginSettingTab, Setting, TFile, Notice, FuzzySuggestModal, setIcon } from 'obsidian';
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
     * 添加高亮范围设置（作为高亮设置的子部分）
     */
    private addHighlightScopeSettings() {
        const { containerEl } = this;

        // 高亮模式选择
        new Setting(containerEl)
            .setName(t('settings.highlight_mode'))
            .setDesc(t('settings.highlight_mode_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('all', t('settings.mode_all'))
                .addOption('exclude', t('settings.mode_exclude'))
                .addOption('include', t('settings.mode_include'))
                .setValue(this.plugin.settings.highlightMode || 'all')
                .onChange(async (value) => {
                    this.plugin.settings.highlightMode = value as 'all' | 'exclude' | 'include';
                    await this.plugin.saveSettings();
                    this.plugin.refreshHighlighter();
                }));

        // 文件路径输入框（上下结构）
        new Setting(containerEl)
            .setName(t('settings.highlight_paths'))
            .setDesc(t('settings.highlight_paths_desc'));
        
        // 创建全宽文本域
        const textAreaContainer = containerEl.createDiv({ cls: 'hi-words-textarea-container' });
        const textArea = textAreaContainer.createEl('textarea');
        textArea.placeholder = t('settings.highlight_paths_placeholder') || 'e.g.: Archive, Templates, Private/Diary';
        textArea.value = this.plugin.settings.highlightPaths || '';
        textArea.rows = 3;
        
        // 使用 change 事件而不是 input 事件，避免频繁保存
        textArea.addEventListener('blur', async () => {
            this.plugin.settings.highlightPaths = textArea.value;
            await this.plugin.saveSettings();
            this.plugin.refreshHighlighter();
        });
    }

    /**
     * 添加文件节点解析模式设置
     */
    private addFileNodeParseModeSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.file_node_parse_mode'))
            .setDesc(t('settings.file_node_parse_mode_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('filename-with-alias', t('settings.mode_filename_with_alias'))
                .addOption('filename', t('settings.mode_filename'))
                .addOption('content', t('settings.mode_content'))
                .setValue(this.plugin.settings.fileNodeParseMode || 'filename-with-alias')
                .onChange(async (value) => {
                    this.plugin.settings.fileNodeParseMode = value as 'filename' | 'content' | 'filename-with-alias';
                    await this.plugin.saveSettings();
                    // 提示用户重新加载插件以应用新的解析模式
                    new Notice('请重新加载插件以应用新的文件节点解析模式');
                }));
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

        // 卡片尺寸设置（宽度和高度在同一行）
        new Setting(containerEl)
            .setName(t('settings.card_size') || 'Card size')
            .setDesc(t('settings.card_size_desc') || 'Default width and height for canvas cards')
            .addText(text => text
                .setPlaceholder('260')
                .setValue(String(this.plugin.settings.cardWidth ?? 260))
                .onChange(async (value) => {
                    const width = parseInt(value);
                    if (!isNaN(width) && width > 0) {
                        this.plugin.settings.cardWidth = width;
                        await this.plugin.saveSettings();
                    }
                }))
            .addText(text => text
                .setPlaceholder('120')
                .setValue(String(this.plugin.settings.cardHeight ?? 120))
                .onChange(async (value) => {
                    const height = parseInt(value);
                    if (!isNaN(height) && height > 0) {
                        this.plugin.settings.cardHeight = height;
                        await this.plugin.saveSettings();
                    }
                }));
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 1. 生词本管理
        this.addVocabularyBooksSection();
        this.addFileNodeParseModeSettings();

        // 2. 高亮设置
        this.addHighlightingSection();

        // 3. 学习功能
        this.addLearningFeaturesSection();

        // 4. Canvas 设置
        this.addAutoLayoutSettings();
    }

    /**
     * 2. 添加高亮设置
     */
    private addHighlightingSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight') || 'Highlighting')
            .setHeading();

        // 启用自动高亮
        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight'))
            .setDesc(t('settings.enable_auto_highlight_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoHighlight = value;
                    await this.plugin.saveSettings();
                    // 刷新高亮器,立即应用设置
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

        // 高亮范围设置
        this.addHighlightScopeSettings();
    }

    /**
     * 确保 AI 词典配置已初始化
     */
    private ensureAIDictionaryConfig() {
        if (!this.plugin.settings.aiDictionary) {
            this.plugin.settings.aiDictionary = {
                apiUrl: '',
                apiKey: '',
                model: '',
                prompt: ''
            };
        }
    }

    /**
     * 3. 添加学习功能设置
     */
    private addLearningFeaturesSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature') || 'Learning Features')
            .setHeading();

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
                // updateSettings 已经处理了缓存失效，不需要手动重新加载
                // 只有当 masteredDetection 变化时才需要重新解析数据
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

        // AI 词典配置
        new Setting(containerEl)
            .setName(t('settings.ai_dictionary') || 'AI Dictionary')
            .setHeading();

        // API URL
        new Setting(containerEl)
            .setName(t('settings.ai_api_url') || 'API URL')
            .setDesc(t('settings.ai_api_url_desc') || 'API endpoint (auto-detects: OpenAI, Claude, Gemini). ⚠️ Privacy: Words and sentences will be sent to this external service.')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1/chat/completions')
                .setValue(this.plugin.settings.aiDictionary?.apiUrl || '')
                .onChange(async (val) => {
                    this.ensureAIDictionaryConfig();
                    this.plugin.settings.aiDictionary!.apiUrl = val.trim();
                    await this.plugin.saveSettings();
                }));

        // API Key
        new Setting(containerEl)
            .setName(t('settings.ai_api_key') || 'API Key')
            .setDesc(t('settings.ai_api_key_desc') || 'Your AI API key')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.aiDictionary?.apiKey || '')
                    .onChange(async (val) => {
                        this.ensureAIDictionaryConfig();
                        this.plugin.settings.aiDictionary!.apiKey = val.trim();
                        await this.plugin.saveSettings();
                    });
            });

        // Model
        new Setting(containerEl)
            .setName(t('settings.ai_model') || 'Model')
            .setDesc(t('settings.ai_model_desc') || 'AI model name (e.g., gpt-4o-mini, deepseek-chat)')
            .addText(text => text
                .setPlaceholder('gpt-4o-mini')
                .setValue(this.plugin.settings.aiDictionary?.model || '')
                .onChange(async (val) => {
                    this.ensureAIDictionaryConfig();
                    this.plugin.settings.aiDictionary!.model = val.trim();
                    await this.plugin.saveSettings();
                }));

        // Custom Prompt（上下结构）
        new Setting(containerEl)
            .setName(t('settings.ai_prompt') || 'Custom Prompt')
            .setDesc(t('settings.ai_prompt_desc') || 'Use {{word}} and {{sentence}} as placeholders. The AI will use this prompt to generate definitions.');
        
        // 创建全宽文本域
        const promptContainer = containerEl.createDiv({ cls: 'hi-words-textarea-container' });
        const promptTextArea = promptContainer.createEl('textarea');
        const defaultPrompt = 'Please provide a concise definition for the word "{{word}}" based on this context:\n\nSentence: {{sentence}}\n\nFormat:\n1) Part of speech\n2) English definition\n3) Chinese translation\n4) Example sentence (use the original sentence if appropriate)';
        promptTextArea.placeholder = defaultPrompt;
        promptTextArea.value = this.plugin.settings.aiDictionary?.prompt || defaultPrompt;
        promptTextArea.rows = 6;
        
        // 使用 blur 事件，避免频繁保存
        promptTextArea.addEventListener('blur', async () => {
            this.ensureAIDictionaryConfig();
            this.plugin.settings.aiDictionary!.prompt = promptTextArea.value;
            await this.plugin.saveSettings();
        });

        // 文本选择气泡菜单配置
        new Setting(containerEl)
            .setName(t('settings.selection_bubble_menu'))
            .setHeading();

        // 启用AI取词
        new Setting(containerEl)
            .setName(t('settings.enable_selection_bubble'))
            .setDesc(t('settings.enable_selection_bubble_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.selectionBubble ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.selectionBubble = value;
                    await this.plugin.saveSettings();
                }));
        // AI 助手输出语言
        new Setting(containerEl)
            .setName(t('settings.ai_output_language'))
            .setDesc(t('settings.ai_output_language_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('Chinese (Simplified)', 'Chinese (Simplified)')
                .addOption('English', 'English')
                .addOption('Japanese', 'Japanese')
                .addOption('Korean', 'Korean')
                .addOption('French', 'French')
                .addOption('German', 'German')
                .addOption('Spanish', 'Spanish')
                .addOption('Russian', 'Russian')
                .addOption('Portuguese', 'Portuguese')
                .addOption('Italian', 'Italian')
                .setValue(this.plugin.settings.aiOutputLanguage || 'Chinese (Simplified)')
                .onChange(async (value) => {
                    this.plugin.settings.aiOutputLanguage = value;
                    await this.plugin.saveSettings();
                }));

    }

    /**
     * 添加生词本管理部分
     */
    private addVocabularyBooksSection() {
        const { containerEl } = this;
            
        // 添加生词本图标按钮
        const addBookContainer = containerEl.createDiv({ cls: 'hi-words-add-book-container' });
        addBookContainer.addEventListener('click', () => this.showCanvasFilePicker());
        
        const addBookLabel = addBookContainer.createSpan({ 
            text: t('settings.add_vocabulary_book'),
            cls: 'hi-words-add-book-label'
        });
        
        const addBookIcon = addBookContainer.createDiv({ cls: 'clickable-icon hi-words-add-book-icon' });
        setIcon(addBookIcon, 'plus-circle');
        addBookIcon.setAttribute('aria-label', t('settings.add_vocabulary_book'));

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

            // 创建图标容器
            const iconsContainer = setting.controlEl.createDiv({ cls: 'hi-words-book-icons' });
            
            // 重新加载图标
            const reloadIcon = iconsContainer.createDiv({ cls: 'clickable-icon' });
            setIcon(reloadIcon, 'refresh-cw');
            reloadIcon.setAttribute('aria-label', t('settings.reload_book'));
            reloadIcon.addEventListener('click', async () => {
                await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                this.plugin.refreshHighlighter();
                new Notice(t('notices.book_reloaded').replace('{0}', book.name));
            });

            // 删除图标
            const deleteIcon = iconsContainer.createDiv({ cls: 'clickable-icon mod-warning' });
            setIcon(deleteIcon, 'trash');
            deleteIcon.setAttribute('aria-label', t('settings.remove_vocabulary_book'));
            deleteIcon.addEventListener('click', async () => {
                this.plugin.settings.vocabularyBooks.splice(index, 1);
                await this.plugin.saveSettings();
                await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                this.plugin.refreshHighlighter();
                new Notice(t('notices.book_removed').replace('{0}', book.name));
                this.display(); // 刷新设置页面
            });
                
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

