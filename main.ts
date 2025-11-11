import { App, Plugin, WorkspaceLeaf } from 'obsidian';
import { Extension } from '@codemirror/state';
// 使用新的模块化导入
import { HiWordsSettings } from './src/utils';
import { DEFAULT_SETTINGS } from './src/settings';
import { registerReadingModeHighlighter } from './src/ui/reading-mode-highlighter';
import { registerPDFHighlighter, cleanupPDFHighlighter } from './src/ui/pdf-highlighter';
import { VocabularyManager, MasteredService, createWordHighlighterExtension, highlighterManager } from './src/core';
import { DefinitionPopover, HiWordsSettingTab, HiWordsSidebarView, SIDEBAR_VIEW_TYPE, AddWordModal } from './src/ui';
import { i18n } from './src/i18n';
import { registerCommands } from './src/commands';
import { registerEvents } from './src/events';
import { shouldHighlightFile } from './src/utils/highlight-utils';

export default class HiWordsPlugin extends Plugin {
    settings!: HiWordsSettings;
    vocabularyManager!: VocabularyManager;
    definitionPopover!: DefinitionPopover;
    masteredService!: MasteredService;
    editorExtensions: Extension[] = [];
    private isSidebarInitialized = false;

    async onload() {
        // 加载设置（快速完成）
        await this.loadSettings();
        
        // 初始化国际化模块
        i18n.setApp(this.app);
        
        // 初始化管理器（不加载数据）
        this.vocabularyManager = new VocabularyManager(this.app, this.settings);
        
        // 初始化已掌握服务
        this.masteredService = new MasteredService(this, this.vocabularyManager);
        
        // 初始化定义弹出框（作为 Component 需要加载）
        this.definitionPopover = new DefinitionPopover(this);
        this.addChild(this.definitionPopover);
        this.definitionPopover.setVocabularyManager(this.vocabularyManager);
        this.definitionPopover.setMasteredService(this.masteredService);
        
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
        
        // 延迟加载生词本（在布局准备好后）
        // 这样可以加快插件启动速度，避免阻塞 Obsidian 启动
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
            (filePath) => shouldHighlightFile(filePath, this.settings)
        );
        this.editorExtensions = [extension];
        this.registerEditorExtension(this.editorExtensions);
    }

    /**
     * 注册命令（委托给命令管理器）
     */
    private registerCommands() {
        registerCommands(this);
    }

    /**
     * 注册事件（委托给事件管理器）
     */
    private registerEvents() {
        registerEvents(this);
    }

    /**
     * 检查文件是否应该被高亮（包装方法）
     */
    shouldHighlightFile(filePath: string): boolean {
        return shouldHighlightFile(filePath, this.settings);
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