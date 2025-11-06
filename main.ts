import { App, Plugin, TFile, Notice, WorkspaceLeaf } from 'obsidian';
import { Extension } from '@codemirror/state';
// 使用新的模块化导入
import { HiWordsSettings } from './src/utils';
import { registerReadingModeHighlighter } from './src/ui/reading-mode-highlighter';
import { registerPDFHighlighter, cleanupPDFHighlighter } from './src/ui/pdf-highlighter';
import { VocabularyManager, MasteredService, WordHighlighter, createWordHighlighterExtension, highlighterManager } from './src/core';
import { DefinitionPopover, HiWordsSettingTab, HiWordsSidebarView, SIDEBAR_VIEW_TYPE, AddWordModal } from './src/ui';
import { extractSentenceFromEditorMultiline } from './src/utils/sentence-extractor';
import { i18n, t } from './src/i18n';

// 默认设置
const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
    showDefinitionOnHover: true,
    enableAutoHighlight: true,
    highlightStyle: 'underline', // 默认使用下划线样式
    enableMasteredFeature: true, // 默认启用已掌握功能
    showMasteredInSidebar: true,  // 跟随 enableMasteredFeature 的值
    blurDefinitions: false, // 默认不启用模糊效果
    // 发音地址模板（用户可在设置里修改）
    ttsTemplate: 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2',
    // AI 词典配置
    aiDictionary: {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4o-mini',
        prompt: 'Please provide a concise definition for the word "{{word}}" based on this context:\n\nSentence: {{sentence}}\n\nFormat:\n1) Part of speech\n2) English definition\n3) Chinese translation\n4) Example sentence (use the original sentence if appropriate)'
    },
    // 自动布局（简化版，使用固定参数）
    autoLayoutEnabled: true,
    // 卡片尺寸设置
    cardWidth: 260,
    cardHeight: 120,
    // 高亮范围设置
    highlightMode: 'all',
    highlightPaths: '',
    // 文件节点解析模式
    fileNodeParseMode: 'filename-with-alias'
};

export default class HiWordsPlugin extends Plugin {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    definitionPopover: DefinitionPopover;
    masteredService: MasteredService;
    editorExtensions: Extension[] = [];
    private isSidebarInitialized = false;

    async onload() {
        // 加载设置
        await this.loadSettings();
        
        // 初始化国际化模块
        i18n.setApp(this.app);
        
        // 初始化管理器
        this.vocabularyManager = new VocabularyManager(this.app, this.settings);
        
        // 初始化已掌握服务
        this.masteredService = new MasteredService(this, this.vocabularyManager);
        
        // 初始化定义弹出框（作为 Component 需要加载）
        this.definitionPopover = new DefinitionPopover(this);
        this.addChild(this.definitionPopover);
        this.definitionPopover.setVocabularyManager(this.vocabularyManager);
        this.definitionPopover.setMasteredService(this.masteredService);
        
        // 加载生词本
        await this.vocabularyManager.loadAllVocabularyBooks();
        
        // 注册侧边栏视图
        this.registerView(
            SIDEBAR_VIEW_TYPE,
            (leaf) => new HiWordsSidebarView(leaf, this)
        );
        
        // 注册编辑器扩展
        this.setupEditorExtensions();
        
        // 注册命令
        this.registerCommands();
        
        // 注册事件
        this.registerEvents();

        // 注册阅读模式（Markdown）后处理器，实现阅读模式高亮
        registerReadingModeHighlighter(this);
        
        // 注册 PDF 高亮功能
        registerPDFHighlighter(this);
        
        // 添加设置页面
        this.addSettingTab(new HiWordsSettingTab(this.app, this));
        
        // 初始化侧边栏
        this.initializeSidebar();
        
        // 在布局准备好后自动刷新生词本
        this.app.workspace.onLayoutReady(async () => {
            await this.vocabularyManager.loadAllVocabularyBooks();
            this.refreshHighlighter();
        });
    }

    /**
     * 设置编辑器扩展
     * 注意: 扩展始终注册,但会在 WordHighlighter 内部检查 enableAutoHighlight 设置
     */
    private setupEditorExtensions() {
        // 始终注册扩展,让 WordHighlighter 内部根据设置决定是否高亮
        const extension = createWordHighlighterExtension(
            this.vocabularyManager,
            (filePath) => this.shouldHighlightFile(filePath)
        );
        this.editorExtensions = [extension];
        this.registerEditorExtension(this.editorExtensions);
    }

    /**
     * 注册命令
     */
    private registerCommands() {
        // 刷新生词本命令
        this.addCommand({
            id: 'refresh-vocabulary',
            name: t('commands.refresh_vocabulary'),
            callback: async () => {
                await this.vocabularyManager.loadAllVocabularyBooks();
                this.refreshHighlighter();
                new Notice(t('notices.vocabulary_refreshed'));
            }
        });

        // 打开生词列表侧边栏命令
        this.addCommand({
            id: 'open-vocabulary-sidebar',
            name: t('commands.show_sidebar'),
            callback: () => {
                this.activateSidebarView();
            }
        });

        // 添加选中单词到生词本命令
        this.addCommand({
            id: 'add-selected-word',
            name: t('commands.add_selected_word'),
            editorCallback: (editor) => {
                const selection = editor.getSelection();
                const word = selection ? selection.trim() : '';
                // 提取句子（支持跨行）
                const sentence = extractSentenceFromEditorMultiline(editor);
                // 无论是否有选中文本，都打开模态框
                // 有选中文本时预填充，没有时让用户手动输入
                this.addOrEditWord(word, sentence);
            }
        });
    }

    /**
     * 注册事件
     */
    private registerEvents() {
        // 记录当前正在编辑的Canvas文件
        const modifiedCanvasFiles = new Set<string>();
        // 记录当前活动的 Canvas 文件
        let activeCanvasFile: string | null = null;
        
        // 监听文件变化
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'canvas') {
                    // 检查是否是生词本文件
                    const isVocabBook = this.settings.vocabularyBooks.some(book => book.path === file.path);
                    if (isVocabBook) {
                        // 只记录文件路径，不立即解析
                        modifiedCanvasFiles.add(file.path);
                    }
                }
            })
        );

        // 监听活动文件变化
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                // 获取当前活动文件
                const activeFile = this.app.workspace.getActiveFile();
                
                // 如果之前有活动的Canvas文件，且已经变化，并且现在切换到了其他文件
                // 说明用户已经编辑完成并切换了焦点，此时解析该文件
                if (activeCanvasFile && 
                    modifiedCanvasFiles.has(activeCanvasFile) && 
                    (!activeFile || activeFile.path !== activeCanvasFile)) {
                    
                    await this.vocabularyManager.reloadVocabularyBook(activeCanvasFile);
                    this.refreshHighlighter();
                    
                    // 从待解析列表中移除
                    modifiedCanvasFiles.delete(activeCanvasFile);
                }
                
                // 更新当前活动的Canvas文件
                if (activeFile && activeFile.extension === 'canvas') {
                    activeCanvasFile = activeFile.path;
                } else {
                    activeCanvasFile = null;
                    
                    // 如果切换到非Canvas文件，处理所有待解析的文件
                    if (modifiedCanvasFiles.size > 0) {
                        // 创建一个副本并清空原集合
                        const filesToProcess = Array.from(modifiedCanvasFiles);
                        modifiedCanvasFiles.clear();
                        
                        // 处理所有待解析的文件
                        for (const filePath of filesToProcess) {
                            await this.vocabularyManager.reloadVocabularyBook(filePath);
                        }
                        
                        // 刷新高亮
                        this.refreshHighlighter();
                    } else {
                        // 当切换文件时，可能需要更新高亮
                        setTimeout(() => this.refreshHighlighter(), 100);
                    }
                }
            })
        );
        
        // 监听文件重命名/移动
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'canvas') {
                    // 检查旧路径是否在单词本列表中
                    const bookIndex = this.settings.vocabularyBooks.findIndex(book => book.path === oldPath);
                    if (bookIndex !== -1) {
                        // 更新为新路径
                        this.settings.vocabularyBooks[bookIndex].path = file.path;
                        // 更新名称（使用新的文件名）
                        this.settings.vocabularyBooks[bookIndex].name = file.basename;
                        await this.saveSettings();
                        
                        // 重新加载该单词本
                        await this.vocabularyManager.reloadVocabularyBook(file.path);
                        this.refreshHighlighter();
                        
                        new Notice(t('notices.book_path_updated').replace('{0}', file.basename));
                    }
                }
            })
        );
        
        // 注册编辑器右键菜单
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor) => {
                const selection = editor.getSelection();
                if (selection && selection.trim()) {
                    const word = selection.trim();
                    // 检查单词是否已存在
                    const exists = this.vocabularyManager.hasWord(word);
                    
                    menu.addItem((item) => {
                        // 根据单词是否存在显示不同的菜单项文本
                        const titleKey = exists ? 'commands.edit_word' : 'commands.add_word';
                        
                        item
                            .setTitle(t(titleKey))
                            .onClick(() => {
                                // 提取句子（支持跨行）
                                const sentence = extractSentenceFromEditorMultiline(editor);
                                this.addOrEditWord(word, sentence);
                            });
                    });
                }
            })
        );
    }


    /**
     * 检查文件是否应该被高亮
     */
    shouldHighlightFile(filePath: string): boolean {
        const mode = this.settings.highlightMode || 'all';
        
        // 模式1：全部高亮
        if (mode === 'all') {
            return true;
        }
        
        // 解析路径列表（逗号分隔，去除空格）
        const pathsStr = this.settings.highlightPaths || '';
        const paths = pathsStr
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);
        
        // 如果路径列表为空
        if (paths.length === 0) {
            // 排除模式下空列表=全部高亮，包含模式下空列表=全不高亮
            return mode === 'exclude';
        }
        
        // 标准化当前文件路径
        const normalizedFile = filePath.replace(/^\/+|\/+$/g, '');
        
        // 检查文件路径是否匹配任何规则
        const isMatched = paths.some(path => {
            const normalizedPath = path.replace(/^\/+|\/+$/g, '');
            return normalizedFile === normalizedPath || 
                   normalizedFile.startsWith(normalizedPath + '/');
        });
        
        // 模式2：排除模式 - 匹配到则不高亮
        if (mode === 'exclude') {
            return !isMatched;
        }
        
        // 模式3：仅指定路径 - 匹配到才高亮
        if (mode === 'include') {
            return isMatched;
        }
        
        return true;
    }

    /**
     * 刷新高亮器
     */
    refreshHighlighter() {
        // 始终刷新高亮器,让 WordHighlighter 内部根据设置决定是否高亮
        highlighterManager.refreshAll();
        
        // 刷新侧边栏视图（通过 API 获取）
        const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
        leaves.forEach(leaf => {
            if (leaf.view instanceof HiWordsSidebarView) {
                leaf.view.refresh();
            }
        });
    }

    /**
     * 初始化侧边栏
     */
    private async initializeSidebar() {
        if (this.isSidebarInitialized) return;
        
        // 只注册视图，不自动打开
        this.app.workspace.onLayoutReady(() => {
            this.isSidebarInitialized = true;
        });
    }

    /**
     * 激活侧边栏视图
     */
    async activateSidebarView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
        
        if (leaves.length > 0) {
            // 如果已经存在，就激活它
            leaf = leaves[0];
        } else {
            // 否则创建新的侧边栏视图
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
            }
        }
        
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * 加载设置
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 保存设置
     */
    async saveSettings() {
        await this.saveData(this.settings);
        this.vocabularyManager.updateSettings(this.settings);
        this.masteredService.updateSettings();
    }

    /**
     * 添加或编辑单词
     * 检查单词是否已存在，如果存在则打开编辑模式，否则打开添加模式
     * @param word 要添加或编辑的单词
     * @param sentence 单词所在的句子（可选）
     */
    addOrEditWord(word: string, sentence: string = '') {
        // 检查单词是否已存在
        const exists = this.vocabularyManager.hasWord(word);
        
        if (exists) {
            // 如果单词已存在，打开编辑模式
            new AddWordModal(this.app, this, word, sentence, true).open();
        } else {
            // 如果单词不存在，打开添加模式
            new AddWordModal(this.app, this, word, sentence).open();
        }
    }

    /**
     * 卸载插件
     */
    onunload() {
        // definitionPopover 作为子组件会自动卸载
        this.vocabularyManager.clear();
        // 清理增量更新相关资源
        if (this.vocabularyManager.destroy) {
            this.vocabularyManager.destroy();
        }
        // 清理全局高亮器管理器
        highlighterManager.clear();
        // 清理 PDF 高亮器资源
        cleanupPDFHighlighter(this);
    }
}