import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import HelloWordPlugin from '../main';
import { WordDefinition } from './types';
import { mapCanvasColorToCSSVar, getColorWithOpacity } from './color-utils';

export const SIDEBAR_VIEW_TYPE = 'hello-word-sidebar';

export class HelloWordSidebarView extends ItemView {
    private plugin: HelloWordPlugin;
    private currentWords: WordDefinition[] = [];
    private currentFile: TFile | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: HelloWordPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return '生词列表';
    }

    getIcon(): string {
        return 'book-open';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('hello-word-sidebar');

        // 创建内容区域
        const content = container.createEl('div', { cls: 'hello-word-sidebar-content' });
        
        // 初始化显示
        this.updateView();

        // 监听活动文件变化
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateView();
            })
        );

        // 监听文件内容变化
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 延迟更新，避免频繁刷新
                setTimeout(() => this.updateView(), 500);
            })
        );
    }

    async onClose() {
        // 清理资源
    }

    /**
     * 更新侧边栏视图
     */
    private async updateView() {
        const activeFile = this.app.workspace.getActiveFile();
        
        if (!activeFile || activeFile.extension !== 'md') {
            this.showEmptyState('请打开一个 Markdown 文档');
            return;
        }

        if (activeFile === this.currentFile && this.currentWords.length > 0) {
            // 文件未变化且已有数据，不需要重新扫描
            return;
        }

        this.currentFile = activeFile;
        await this.scanCurrentDocument();
        this.renderWordList();
    }

    /**
     * 扫描当前文档中的生词
     */
    private async scanCurrentDocument() {
        if (!this.currentFile) return;

        try {
            const content = await this.app.vault.read(this.currentFile);
            const foundWords: WordDefinition[] = [];
            const allWords = this.plugin.vocabularyManager.getAllWords();

            // 扫描文档内容，查找生词
            for (const word of allWords) {
                const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
                if (regex.test(content)) {
                    const definition = this.plugin.vocabularyManager.getDefinition(word);
                    if (definition) {
                        // 避免重复添加
                        if (!foundWords.some(w => w.word === definition.word)) {
                            foundWords.push(definition);
                        }
                    }
                }
            }

            // 按字母顺序排序
            foundWords.sort((a, b) => a.word.localeCompare(b.word));
            this.currentWords = foundWords;
        } catch (error) {
            console.error('Failed to scan document:', error);
            this.currentWords = [];
        }
    }

    /**
     * 渲染生词列表
     */
    private renderWordList() {
        const container = this.containerEl.querySelector('.hello-word-sidebar-content');
        if (!container) return;

        container.empty();

        if (this.currentWords.length === 0) {
            this.showEmptyState('当前文档中没有发现生词');
            return;
        }

        // 创建统计信息
        const stats = container.createEl('div', { cls: 'hello-word-sidebar-stats' });
        stats.createEl('span', { 
            text: `发现 ${this.currentWords.length} 个生词`,
            cls: 'hello-word-stats-text'
        });

        // 创建生词卡片列表
        const wordList = container.createEl('div', { cls: 'hello-word-word-list' });

        this.currentWords.forEach(wordDef => {
            this.createWordCard(wordList, wordDef);
        });
    }

    /**
     * 创建生词卡片
     */
    private createWordCard(container: HTMLElement, wordDef: WordDefinition) {
        const card = container.createEl('div', { cls: 'hello-word-word-card' });
        
        // 设置卡片颜色边框，使用Obsidian CSS变量
        const borderColor = mapCanvasColorToCSSVar(wordDef.color, 'var(--color-base-60)');
        card.style.borderLeftColor = borderColor;
        
        // 设置卡片彩色背景
        if (wordDef.color) {
            card.style.setProperty('--word-card-accent-color', borderColor);
            // 设置更明显的彩色背景
            const bgColor = getColorWithOpacity(borderColor, 0.15);
            card.style.setProperty('--word-card-bg-color', bgColor);
        }

        // 词汇标题
        const wordTitle = card.createEl('div', { cls: 'hello-word-word-title' });
        wordTitle.createEl('span', { text: wordDef.word, cls: 'hello-word-word-text' });
        
        // 来源信息
        const source = card.createEl('div', { cls: 'hello-word-word-source' });
        const bookName = this.getBookNameFromPath(wordDef.source);
        source.createEl('span', { text: `来自: ${bookName}`, cls: 'hello-word-source-text' });

        // 定义内容
        if (wordDef.definition && wordDef.definition.trim()) {
            const definition = card.createEl('div', { cls: 'hello-word-word-definition' });
            // 限制定义长度，避免卡片过长
            const shortDefinition = this.truncateText(wordDef.definition, 100);
            definition.textContent = shortDefinition;
            
            // 如果定义被截断，添加展开按钮
            if (wordDef.definition.length > 100) {
                const expandBtn = definition.createEl('span', { 
                    text: ' ...更多',
                    cls: 'hello-word-expand-btn'
                });
                expandBtn.onclick = () => {
                    if (definition.textContent === shortDefinition + ' ...更多') {
                        definition.textContent = wordDef.definition;
                        const collapseBtn = definition.createEl('span', {
                            text: ' 收起',
                            cls: 'hello-word-expand-btn'
                        });
                        collapseBtn.onclick = () => {
                            definition.textContent = shortDefinition;
                            definition.appendChild(expandBtn);
                        };
                    }
                };
            }
        }

        // 添加悬停效果
        card.onmouseenter = () => {
            card.addClass('hello-word-word-card-hover');
        };
        card.onmouseleave = () => {
            card.removeClass('hello-word-word-card-hover');
        };
    }

    /**
     * 显示空状态
     */
    private showEmptyState(message: string) {
        const container = this.containerEl.querySelector('.hello-word-sidebar-content');
        if (!container) return;

        container.empty();
        const emptyState = container.createEl('div', { cls: 'hello-word-empty-state' });
        emptyState.createEl('div', { text: '📚', cls: 'hello-word-empty-icon' });
        emptyState.createEl('div', { text: message, cls: 'hello-word-empty-text' });
    }

    /**
     * 从路径获取生词本名称
     */
    private getBookNameFromPath(path: string): string {
        const book = this.plugin.settings.vocabularyBooks.find(b => b.path === path);
        return book ? book.name : path.split('/').pop()?.replace('.canvas', '') || '未知';
    }

    /**
     * 截断文本
     */
    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim();
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 打开生词本文件
     */
    private async openVocabularyBook(wordDef: WordDefinition) {
        const file = this.app.vault.getAbstractFileByPath(wordDef.source);
        if (file instanceof TFile) {
            await this.app.workspace.openLinkText(file.path, '');
        }
    }

    /**
     * 强制刷新视图
     */
    public refresh() {
        this.currentFile = null; // 强制重新扫描
        this.updateView();
    }
}
