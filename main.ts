import { App, Plugin, TFile, MarkdownView, Notice, Modal, WorkspaceLeaf, ItemView } from 'obsidian';
import { Extension } from '@codemirror/state';
import { HiWordsSettings, VocabularyBook } from './src/types';
import { VocabularyManager } from './src/vocabulary-manager';
import { WordHighlighter, createWordHighlighterExtension, getWordUnderCursor } from './src/word-highlighter';
import { DefinitionPopover } from './src/definition-popover';
import { HiWordsSettingTab } from './src/settings-tab';
import { HiWordsSidebarView, SIDEBAR_VIEW_TYPE } from './src/sidebar-view';
import { AddWordModal } from './src/add-word-modal';
import { i18n, t } from './src/i18n';
import { highlighterManager } from './src/word-highlighter';

// 默认设置
const DEFAULT_SETTINGS: HiWordsSettings = {
    vocabularyBooks: [],
    showDefinitionOnHover: true,
    enableAutoHighlight: true,
    highlightStyle: 'underline' // 默认使用下划线样式
};

export default class HiWordsPlugin extends Plugin {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    definitionPopover: DefinitionPopover;
    editorExtensions: Extension[] = [];
    highlighterInstance: WordHighlighter | null = null;
    private sidebarView: HiWordsSidebarView | null = null;
    private isSidebarInitialized = false;

    async onload() {
        // 加载设置
        await this.loadSettings();
        
        // 初始化国际化模块
        i18n.setApp(this.app);
        
        // 初始化管理器
        this.vocabularyManager = new VocabularyManager(this.app, this.settings);
        
        // 初始化定义弹出框
        this.definitionPopover = new DefinitionPopover(this.app);
        this.definitionPopover.setVocabularyManager(this.vocabularyManager);
        
        // 加载生词本
        await this.vocabularyManager.loadAllVocabularyBooks();
        
        // 注册侧边栏视图
        this.registerView(
            SIDEBAR_VIEW_TYPE,
            (leaf) => {
                this.sidebarView = new HiWordsSidebarView(leaf, this);
                return this.sidebarView;
            }
        );
        
        // 注册编辑器扩展
        this.setupEditorExtensions();
        
        // 注册命令
        this.registerCommands();
        
        // 注册事件
        this.registerEvents();
        
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
     */
    private setupEditorExtensions() {
        if (this.settings.enableAutoHighlight) {
            const extension = createWordHighlighterExtension(this.vocabularyManager);
            this.editorExtensions = [extension];
            this.registerEditorExtension(this.editorExtensions);
        }
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
                                this.addOrEditWord(word);
                            });
                    });
                }
            })
        );
    }

    /**
     * 刷新高亮器
     */
    refreshHighlighter() {
        if (this.settings.enableAutoHighlight) {
            // 使用全局高亮器管理器刷新所有高亮器实例
            highlighterManager.refreshAll();
        }
        
        // 刷新侧边栏视图
        if (this.sidebarView) {
            this.sidebarView.refresh();
        }
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
    }

    /**
     * 添加或编辑单词
     * 检查单词是否已存在，如果存在则打开编辑模式，否则打开添加模式
     * @param word 要添加或编辑的单词
     */
    addOrEditWord(word: string) {
        // 检查单词是否已存在
        const exists = this.vocabularyManager.hasWord(word);
        
        if (exists) {
            // 如果单词已存在，打开编辑模式
            new AddWordModal(this.app, this, word, true).open();
        } else {
            // 如果单词不存在，打开添加模式
            new AddWordModal(this.app, this, word).open();
        }
    }

    /**
     * 卸载插件
     */
    onunload() {
        this.definitionPopover.unload();
        this.vocabularyManager.clear();
        // 清理增量更新相关资源
        if (this.vocabularyManager.destroy) {
            this.vocabularyManager.destroy();
        }
        // 清理全局高亮器管理器
        highlighterManager.clear();
    }
}