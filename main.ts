import { App, Plugin, TFile, MarkdownView, Notice, Modal, WorkspaceLeaf, ItemView } from 'obsidian';
import { Extension } from '@codemirror/state';
import { HelloWordSettings, VocabularyBook } from './src/types';
import { VocabularyManager } from './src/vocabulary-manager';
import { WordHighlighter, createWordHighlighterExtension, getWordUnderCursor } from './src/word-highlighter';
import { DefinitionPopover } from './src/definition-popover';
import { HelloWordSettingTab } from './src/settings-tab';
import { HelloWordSidebarView, SIDEBAR_VIEW_TYPE } from './src/sidebar-view';
import { AddWordModal } from './src/add-word-modal';

// 默认设置
const DEFAULT_SETTINGS: HelloWordSettings = {
    vocabularyBooks: [],
    showDefinitionOnHover: true,
    enableAutoHighlight: true
};

export default class HelloWordPlugin extends Plugin {
    settings: HelloWordSettings;
    vocabularyManager: VocabularyManager;
    definitionPopover: DefinitionPopover;
    editorExtensions: Extension[] = [];
    highlighterInstance: WordHighlighter | null = null;
    sidebarView: HelloWordSidebarView | null = null;

    async onload() {
        console.log('Loading Hello Word plugin');
        
        // 加载设置
        await this.loadSettings();
        
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
                this.sidebarView = new HelloWordSidebarView(leaf, this);
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
        this.addSettingTab(new HelloWordSettingTab(this.app, this));
        
        // 初始化侧边栏
        this.initializeSidebar();
        
        // 在布局准备好后自动刷新生词本
        this.app.workspace.onLayoutReady(async () => {
            await this.vocabularyManager.loadAllVocabularyBooks();
            this.refreshHighlighter();
            console.log('生词本已自动刷新');
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
            name: '刷新生词本',
            callback: async () => {
                await this.vocabularyManager.loadAllVocabularyBooks();
                this.refreshHighlighter();
                new Notice('生词本已刷新');
            }
        });





        // 打开生词列表侧边栏命令
        this.addCommand({
            id: 'open-vocabulary-sidebar',
            name: '打开生词列表',
            callback: () => {
                this.activateSidebarView();
            }
        });
    }

    /**
     * 注册事件
     */
    private registerEvents() {
        // 监听文件变化
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file instanceof TFile && file.extension === 'canvas') {
                    // 检查是否是生词本文件
                    const isVocabBook = this.settings.vocabularyBooks.some(book => book.path === file.path);
                    if (isVocabBook) {
                        await this.vocabularyManager.reloadVocabularyBook(file.path);
                        this.refreshHighlighter();
                    }
                }
            })
        );

        // 监听活动文件变化
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                // 当切换文件时，可能需要更新高亮
                setTimeout(() => this.refreshHighlighter(), 100);
            })
        );
        
        // 注册编辑器右键菜单
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor) => {
                const selection = editor.getSelection();
                if (selection && selection.trim()) {
                    menu.addItem((item) => {
                        item
                            .setTitle('添加到生词本')
                            .setIcon('book-plus')
                            .onClick(() => {
                                new AddWordModal(this.app, this, selection.trim()).open();
                            });
                    });
                }
            })
        );
    }

    // 状态栏功能已删除

    /**
     * 刷新高亮器
     */
    refreshHighlighter() {
        if (this.settings.enableAutoHighlight) {
            // 强制更新所有编辑器视图
            this.app.workspace.iterateAllLeaves(leaf => {
                if (leaf.view instanceof MarkdownView) {
                    const editor = leaf.view.editor;
                    // @ts-ignore
                    const cm = editor.cm;
                    if (cm) {
                        // 触发重新渲染
                        cm.dispatch({ effects: [] });
                    }
                }
            });
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
        // 在右侧边栏中添加生词列表视图
        this.app.workspace.onLayoutReady(() => {
            // 仅在首次安装插件时打开侧边栏
            // 之后将尊重用户的设置，不强制打开
            const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
            if (leaves.length === 0) {
                // 如果侧边栏视图不存在，创建一个
                this.activateSidebarView();
            }
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
     * 卸载插件
     */
    onunload() {
        console.log('Unloading Hello Word plugin');
        this.definitionPopover.unload();
        this.vocabularyManager.clear();
        
        // 清理侧边栏视图
        this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
    }
}




