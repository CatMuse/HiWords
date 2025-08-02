import { ItemView, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, setIcon } from 'obsidian';
import HiWordsPlugin from '../main';
import { WordDefinition } from './types';
import { mapCanvasColorToCSSVar, getColorWithOpacity } from './color-utils';
import { t } from './i18n';

export const SIDEBAR_VIEW_TYPE = 'hi-words-sidebar';

export class HiWordsSidebarView extends ItemView {
    private plugin: HiWordsPlugin;
    private currentWords: WordDefinition[] = [];
    private activeTab: 'learning' | 'mastered' = 'learning';
    private currentFile: TFile | null = null;
    private lastActiveMarkdownView: MarkdownView | null = null; // 缓存最后一个活动的MarkdownView

    constructor(leaf: WorkspaceLeaf, plugin: HiWordsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('sidebar.title');
    }

    getIcon(): string {
        return 'book-open';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('hi-words-sidebar');
        
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
        
        // 监听文件修改（包括 Canvas 文件的修改）
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 如果修改的是 Canvas 文件，则刷新侧边栏
                if (file instanceof TFile && file.extension === 'canvas') {
                    setTimeout(() => this.updateView(), 200);
                }
            })
        );
        
        // 监听已掌握功能状态变化
        this.registerEvent(
            this.app.workspace.on('hi-words:mastered-changed' as any, () => {
                this.updateView();
            })
        );
        
        // 监听设置变化（如模糊效果开关）
        this.registerEvent(
            this.app.workspace.on('hi-words:settings-changed' as any, () => {
                this.updateView();
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

        // 缓存当前活动的 MarkdownView（如果有的话）
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.lastActiveMarkdownView = activeView;
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
            const allWordDefinitions = await this.plugin.vocabularyManager.getAllWordDefinitions();

            // 创建一个数组来存储找到的单词及其位置
            const foundWordsWithPosition: { wordDef: WordDefinition, position: number }[] = [];
            
            // 扫描文档内容，查找生词并记录位置
            for (const wordDef of allWordDefinitions) {
                // 检查主单词
                let regex = new RegExp(`\\b${this.escapeRegExp(wordDef.word)}\\b`, 'gi');
                let match = regex.exec(content);
                let position = match ? match.index : -1;
                
                // 检查别名
                if (position === -1 && wordDef.aliases) {
                    for (const alias of wordDef.aliases) {
                        regex = new RegExp(`\\b${this.escapeRegExp(alias)}\\b`, 'gi');
                        match = regex.exec(content);
                        if (match) {
                            position = match.index;
                            break;
                        }
                    }
                }
                
                if (position !== -1) {
                    // 避免重复添加
                    if (!foundWordsWithPosition.some(w => w.wordDef.nodeId === wordDef.nodeId)) {
                        foundWordsWithPosition.push({
                            wordDef: wordDef,
                            position: position
                        });
                    }
                }
            }

            // 按照单词在文档中首次出现的位置排序
            foundWordsWithPosition.sort((a, b) => a.position - b.position);
            this.currentWords = foundWordsWithPosition.map(item => item.wordDef);
        } catch (error) {
            console.error('Failed to scan document:', error);
            this.currentWords = [];
        }
    }

    /**
     * 渲染生词列表
     */
    private renderWordList() {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        container.empty();

        if (this.currentWords.length === 0) {
            this.showEmptyState(t('sidebar.empty_state'));
            return;
        }

        // 分组单词：未掌握和已掌握
        const unmasteredWords = this.currentWords.filter(word => !word.mastered);
        const masteredWords = this.currentWords.filter(word => word.mastered);
        

        // 智能初始标签页选择：只在首次加载且没有待学习单词时切换到已掌握
        if (this.activeTab === 'learning' && unmasteredWords.length === 0 && masteredWords.length > 0) {
            this.activeTab = 'mastered';
        }
        
        // 创建 Tab 导航
        this.createTabNavigation(container as HTMLElement, unmasteredWords.length, masteredWords.length);
        
        // 创建 Tab 内容
        this.createTabContent(container as HTMLElement, unmasteredWords, masteredWords);
    }

    /**
     * 创建 Tab 导航
     */
    private createTabNavigation(container: HTMLElement, learningCount: number, masteredCount: number) {
        const tabNav = container.createEl('div', { cls: 'hi-words-tab-nav' });
        
        // 待学习 Tab
        const learningTab = tabNav.createEl('div', { 
            cls: `hi-words-tab ${this.activeTab === 'learning' ? 'active' : ''}`,
            attr: { 'data-tab': 'learning' }
        });
        learningTab.createEl('span', { text: `${t('sidebar.vocabulary_book')} (${learningCount})` });
        
        // 已掌握 Tab (只有在启用功能时显示)
        if (this.plugin.settings.enableMasteredFeature) {
            const masteredTab = tabNav.createEl('div', { 
                cls: `hi-words-tab ${this.activeTab === 'mastered' ? 'active' : ''}`,
                attr: { 'data-tab': 'mastered' }
            });
            masteredTab.createEl('span', { text: `${t('sidebar.mastered')} (${masteredCount})` });
            
            // 添加点击事件
            masteredTab.addEventListener('click', () => {
                this.switchTab('mastered');
            });
        }
        
        // 添加点击事件
        learningTab.addEventListener('click', () => {
            this.switchTab('learning');
        });
    }
    
    /**
     * 创建 Tab 内容
     */
    private createTabContent(container: HTMLElement, unmasteredWords: WordDefinition[], masteredWords: WordDefinition[]) {
        if (this.activeTab === 'learning') {
            if (unmasteredWords.length > 0) {
                this.createWordList(container, unmasteredWords, false);
            } else {
                this.createEmptyState(container, t('sidebar.no_learning_words'));
            }
        } else if (this.activeTab === 'mastered') {
            if (masteredWords.length > 0) {
                this.createWordList(container, masteredWords, true);
            } else {
                this.createEmptyState(container, t('sidebar.no_mastered_words'));
            }
        }
    }
    
    /**
     * 切换 Tab
     */
    private switchTab(tab: 'learning' | 'mastered') {
        if (this.activeTab === tab) return;
        
        this.activeTab = tab;
        this.renderWordList(); // 重新渲染
    }
    
    /**
     * 创建单词列表
     */
    private createWordList(container: HTMLElement, words: WordDefinition[], isMastered: boolean) {
        const wordList = container.createEl('div', { cls: 'hi-words-word-list' });
        
        words.forEach(wordDef => {
            this.createWordCard(wordList, wordDef, isMastered);
        });
    }

    /**
     * 创建单词分组区域
     * @param container 容器元素
     * @param title 分组标题
     * @param words 单词列表
     * @param icon 图标名称
     * @param isMastered 是否为已掌握分组
     */
    private createWordSection(container: HTMLElement, title: string, words: WordDefinition[], icon: string, isMastered: boolean) {
        // 创建分组容器
        const section = container.createEl('div', { 
            cls: isMastered ? 'hi-words-mastered-section' : 'hi-words-section'
        });
        
        // 创建分组标题
        const sectionTitle = section.createEl('div', { cls: 'hi-words-section-title' });
        
        // 添加图标
        const iconEl = sectionTitle.createEl('span', { cls: 'hi-words-section-icon' });
        setIcon(iconEl, icon);
        
        // 添加标题文本
        sectionTitle.createEl('span', { 
            text: `${title} (${words.length})`,
            cls: 'hi-words-section-text'
        });
        
        // 创建单词列表
        const wordList = section.createEl('div', { cls: 'hi-words-word-list' });
        
        words.forEach(wordDef => {
            this.createWordCard(wordList, wordDef, isMastered);
        });
    }

    /**
     * 创建生词卡片
     * @param container 容器元素
     * @param wordDef 单词定义
     * @param isMastered 是否为已掌握单词
     */
    private createWordCard(container: HTMLElement, wordDef: WordDefinition, isMastered: boolean = false) {
        const card = container.createEl('div', { cls: 'hi-words-word-card' });
        
        // 设置卡片颜色边框，使用Obsidian CSS变量
        const borderColor = mapCanvasColorToCSSVar(wordDef.color, 'var(--color-base-60)');
        card.style.borderLeftColor = borderColor;
        
        // 设置卡片彩色背景
        if (wordDef.color) {
            card.style.setProperty('--word-card-accent-color', borderColor);
            // 设置更明显的彩色背景
            const bgColor = getColorWithOpacity(borderColor, 0.1);
            card.style.setProperty('--word-card-bg-color', bgColor);
        }

        // 词汇标题
        const wordTitle = card.createEl('div', { cls: 'hi-words-word-title' });
        wordTitle.createEl('span', { text: wordDef.word, cls: 'hi-words-word-text' });
        
        // 已掌握按钮（如果启用了功能）
        if (this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
            const buttonContainer = wordTitle.createEl('div', { 
                cls: 'hi-words-title-mastered-button'
                // 移除 aria-label 以避免悬停提示重叠
            });
            
            // 设置图标（未掌握显示smile供用户点击标记为已掌握，已掌握显示frown供用户点击取消）
            setIcon(buttonContainer, isMastered ? 'frown' : 'smile');
            
            // 添加点击事件
            buttonContainer.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                try {
                    // 切换已掌握状态
                    if (isMastered) {
                        await this.plugin.masteredService.unmarkWordAsMastered(wordDef.source, wordDef.nodeId, wordDef.word);
                    } else {
                        await this.plugin.masteredService.markWordAsMastered(wordDef.source, wordDef.nodeId, wordDef.word);
                    }
                    
                    // 刷新侧边栏
                    setTimeout(() => this.updateView(), 100);
                } catch (error) {
                    console.error('切换已掌握状态失败:', error);
                }
            });
        }
        
        // 定义内容
        if (wordDef.definition && wordDef.definition.trim()) {
            const definition = card.createEl('div', { cls: 'hi-words-word-definition' });
            
            // 创建定义容器
            const defContainer = definition.createEl('div', { 
                cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition'
            });
            
            // 不再限制定义长度，直接显示完整定义
            
            // 渲染 Markdown 内容
            try {
                // 优先使用当前活动的 MarkdownView，如果没有则使用缓存的最后一个活动视图
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView) || this.lastActiveMarkdownView;
                
                if (activeView && activeView.file) {
                    // 直接渲染完整定义
                    MarkdownRenderer.renderMarkdown(
                        wordDef.definition,
                        defContainer,
                        activeView.file.path,
                        activeView
                    );
                } else {
                    // 如果没有可用的 MarkdownView，使用简单的文本显示
                    defContainer.textContent = wordDef.definition;
                }
            } catch (error) {
                // 如果渲染失败，回退到纯文本显示
                console.error('Markdown 渲染失败:', error);
                defContainer.textContent = wordDef.definition;
            }
        }
        
        // 来源信息和已掌握按钮容器
        const footer = card.createEl('div', { cls: 'hi-words-word-footer' });
        
        // 来源信息
        const source = footer.createEl('div', { cls: 'hi-words-word-source' });
        const bookName = this.getBookNameFromPath(wordDef.source);
        source.createEl('span', { text: `${t('sidebar.source_prefix')}${bookName}`, cls: 'hi-words-source-text' });
        
        // 添加点击事件到来源信息：导航到源文件
        source.style.cursor = 'pointer';
        source.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            this.navigateToSource(wordDef);
        });
        
        // 添加已掌握状态样式
        if (isMastered) {
            card.addClass('hi-words-word-card-mastered');
        }
    }

    /**
     * 在容器中创建空状态（不清空Tab导航）
     */
    private createEmptyState(container: HTMLElement, message: string) {
        const emptyState = container.createEl('div', { cls: 'hi-words-empty-state' });
        emptyState.createEl('div', { text: message, cls: 'hi-words-empty-text' });
    }

    /**
     * 显示空状态（用于全局空状态，会清空整个容器）
     */
    private showEmptyState(message: string) {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        container.empty();
        const emptyState = container.createEl('div', { cls: 'hi-words-empty-state' });
        emptyState.createEl('div', { text: message, cls: 'hi-words-empty-text' });
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
     * 导航到单词源文件
     */
    private async navigateToSource(wordDef: WordDefinition) {
        try {
            const file = this.app.vault.getAbstractFileByPath(wordDef.source);
            if (file instanceof TFile) {
                // 如果是 Canvas 文件，直接打开
                if (file.extension === 'canvas') {
                    await this.app.workspace.openLinkText(file.path, '');
                } else {
                    // 如果是 Markdown 文件，打开并尝试定位到单词
                    await this.app.workspace.openLinkText(file.path, '');
                    // 等待一个短暂时间让文件加载
                    setTimeout(() => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file?.path === file.path) {
                            // 尝试在文件中查找单词
                            const editor = activeView.editor;
                            const content = editor.getValue();
                            const wordIndex = content.toLowerCase().indexOf(wordDef.word.toLowerCase());
                            if (wordIndex !== -1) {
                                const pos = editor.offsetToPos(wordIndex);
                                editor.setCursor(pos);
                                editor.scrollIntoView({ from: pos, to: pos }, true);
                            }
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('导航到源文件失败:', error);
        }
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
