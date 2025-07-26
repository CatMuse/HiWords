import { App, Plugin, TFile, MarkdownView, Notice, Modal, WorkspaceLeaf } from 'obsidian';
import { Extension } from '@codemirror/state';
import { HelloWordSettings, VocabularyBook } from './src/types';
import { VocabularyManager } from './src/vocabulary-manager';
import { WordHighlighter, createWordHighlighterExtension, getWordUnderCursor } from './src/word-highlighter';
import { DefinitionPopover } from './src/definition-popover';
import { HelloWordSettingTab } from './src/settings-tab';
import { HelloWordSidebarView, SIDEBAR_VIEW_TYPE } from './src/sidebar-view';

// 默认设置
const DEFAULT_SETTINGS: HelloWordSettings = {
    vocabularyBooks: [],
    defaultColor: '#007acc',
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
        
        // 添加状态栏
        this.addStatusBar();
        
        // 初始化侧边栏
        this.initializeSidebar();
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

        // 查看词汇定义命令
        this.addCommand({
            id: 'show-word-definition',
            name: '显示词汇定义',
            editorCallback: (editor, view) => {
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                const word = this.getWordAtPosition(line, cursor.ch);
                
                if (word) {
                    const definition = this.vocabularyManager.getDefinition(word);
                    if (definition) {
                        new WordDefinitionModal(this.app, word, definition.definition).open();
                    } else {
                        new Notice(`未找到词汇 "${word}" 的定义`);
                    }
                } else {
                    new Notice('请将光标放在词汇上');
                }
            }
        });

        // 添加词汇到生词本命令
        this.addCommand({
            id: 'add-word-to-vocabulary',
            name: '添加词汇到生词本',
            editorCallback: (editor, view) => {
                const selectedText = editor.getSelection();
                if (selectedText) {
                    new AddWordModal(this.app, this, selectedText).open();
                } else {
                    new Notice('请先选择要添加的词汇');
                }
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
    }

    /**
     * 添加状态栏
     */
    private addStatusBar() {
        const statusBarItem = this.addStatusBarItem();
        const updateStatusBar = () => {
            const stats = this.vocabularyManager.getStats();
            statusBarItem.setText(`📚 ${stats.enabledBooks}/${stats.totalBooks} 生词本 | ${stats.totalWords} 词汇`);
        };
        
        updateStatusBar();
        
        // 定期更新状态栏
        this.registerInterval(window.setInterval(updateStatusBar, 5000));
    }

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
            // 可以选择默认打开侧边栏，或者等待用户手动打开
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
     * 获取指定位置的词汇
     */
    private getWordAtPosition(line: string, position: number): string | null {
        const wordRegex = /[a-zA-Z]+/g;
        let match;
        
        while ((match = wordRegex.exec(line)) !== null) {
            if (position >= match.index && position <= match.index + match[0].length) {
                return match[0];
            }
        }
        
        return null;
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

// 词汇定义模态框
class WordDefinitionModal extends Modal {
    private word: string;
    private definition: string;

    constructor(app: App, word: string, definition: string) {
        super(app);
        this.word = word;
        this.definition = definition;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: this.word });
        
        const definitionEl = contentEl.createEl('div', { cls: 'word-definition-content' });
        if (this.definition.trim()) {
            definitionEl.innerHTML = this.definition;
        } else {
            definitionEl.textContent = '暂无定义';
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 添加词汇模态框
class AddWordModal extends Modal {
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
        const bookSelect = contentEl.createEl('select');
        bookSelect.createEl('option', { text: '请选择生词本', value: '' });
        
        this.plugin.settings.vocabularyBooks.forEach(book => {
            if (book.enabled) {
                bookSelect.createEl('option', { text: book.name, value: book.path });
            }
        });
        
        // 定义输入
        const definitionInput = contentEl.createEl('textarea', { 
            placeholder: '请输入词汇定义...',
            cls: 'word-definition-input'
        });
        
        // 按钮
        const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const addButton = buttonContainer.createEl('button', { text: '添加', cls: 'mod-cta' });
        addButton.onclick = async () => {
            const selectedBook = bookSelect.value;
            const definition = definitionInput.value;
            
            if (!selectedBook) {
                new Notice('请选择生词本');
                return;
            }
            
            // 这里需要实现添加词汇到 Canvas 的逻辑
            // 由于 Canvas 文件的复杂性，这里先显示提示
            new Notice('请手动在 Canvas 中添加词汇卡片');
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
