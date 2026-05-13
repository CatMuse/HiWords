import { EventRef, ItemView, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, setIcon, Notice } from 'obsidian';
import HiWordsPlugin from '../../main';
import { WordDefinition, mapCanvasColorToCSSVar, getColorWithOpacity, playWordTTS, Trie } from '../utils';
import { t } from '../i18n';
import { findPatternMatches } from '../utils/pattern-matcher';
import { renderWordCard } from './word-card-renderer';

export const SIDEBAR_VIEW_TYPE = 'hi-words-sidebar';

type HiWordsWorkspaceEventName = 'hi-words:mastered-changed' | 'hi-words:settings-changed';

interface HiWordsWorkspaceEvents {
    on(name: HiWordsWorkspaceEventName, callback: () => void): EventRef;
}

interface HoverLinkWorkspace {
    trigger(name: 'hover-link', payload: {
        event: Event;
        source: string;
        hoverParent: HTMLElement;
        target: HTMLElement;
        linktext: string;
        sourcePath: string;
    }): void;
}

interface SearchViewLike {
    setQuery?: (query: string) => void;
}

export class HiWordsSidebarView extends ItemView {
    private plugin: HiWordsPlugin;
    private currentWords: WordDefinition[] = [];
    private activeTab: 'learning' | 'mastered' = 'learning';
    private currentFile: TFile | null = null;
    private firstLoadForFile = false; // 仅在切换到新文件后的首次渲染生效
    private updateTimer: number | null = null; // 合并/防抖更新
    private delegatedBound = false; // 是否已绑定根级事件委托
    private lastInteractionTime = 0; // 最后一次交互的时间戳
    private patternDefinitionsCache: WordDefinition[] = []; // 缓存模式短语列表
    private normalDefinitionsCache: WordDefinition[] = []; // 缓存普通单词列表
    private sectionTabStates: Map<string, number> = new Map(); // 记录每个单词当前激活的分区 Tab
    private expandedWordStates: Map<string, boolean> = new Map(); // 记录用户手动展开/收起的词卡状态
    private manualDetailMode = false; // 单词管理页打开详情时，不跟随当前文档扫描结果

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
        this.bindDelegatedHandlers(container as HTMLElement);
        
        // 初始化显示
        this.scheduleUpdate(0);

        // 监听文件打开事件（使用 file-open 代替 active-leaf-change，避免侧边栏激活触发更新）
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                if (file && (file.extension === 'md' || file.extension === 'pdf')) {
                    this.manualDetailMode = false;
                }
                this.scheduleUpdate(120);
            })
        );

        // 监听文件内容变化
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 延迟更新，避免频繁刷新
                this.scheduleUpdate(500);
            })
        );
        
        // 监听文件修改（包括 Canvas 文件和被引用的 Markdown 文件）
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    if (file.extension === 'canvas' || file.extension === 'md') {
                        this.scheduleUpdate(250);
                    }
                }
            })
        );
        
        // 监听已掌握功能状态变化
        this.registerEvent(
            (this.app.workspace as unknown as HiWordsWorkspaceEvents).on('hi-words:mastered-changed', () => {
                this.scheduleUpdate(100);
            })
        );
        
        // 监听设置变化（如模糊效果开关）
        this.registerEvent(
            (this.app.workspace as unknown as HiWordsWorkspaceEvents).on('hi-words:settings-changed', () => {
                this.scheduleUpdate(100);
            })
        );
    }

    async onClose() {
        // 清理资源
    }

    async focusWord(wordDef: WordDefinition, origin: 'document' | 'library' = 'document') {
        if (this.updateTimer !== null) {
            window.clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }

        const key = this.getWordStateKey(wordDef);

        if (origin === 'library') {
            this.manualDetailMode = true;
            this.currentFile = null;
            this.currentWords = [wordDef];
            this.activeTab = wordDef.mastered ? 'mastered' : 'learning';
            this.expandedWordStates.set(key, true);
            this.firstLoadForFile = false;
            this.lastInteractionTime = Date.now();
            await this.renderWordList();
            this.scrollWordCardIntoView(key);
            return;
        }

        this.manualDetailMode = false;
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && (activeFile.extension === 'md' || activeFile.extension === 'pdf') && (activeFile !== this.currentFile || this.currentWords.length === 0)) {
            this.currentFile = activeFile;
            this.firstLoadForFile = true;
            await this.scanCurrentDocument();
        }

        const existingIndex = this.currentWords.findIndex(item => this.getWordStateKey(item) === key);
        if (existingIndex < 0) {
            this.currentWords.unshift(wordDef);
        }
        this.activeTab = wordDef.mastered ? 'mastered' : 'learning';
        this.expandedWordStates.set(key, true);
        this.firstLoadForFile = false;
        this.lastInteractionTime = Date.now();
        await this.renderWordList();
        this.scrollWordCardIntoView(key);
    }

    public applyDefaultDisplayMode() {
        this.expandedWordStates.clear();
        void this.renderWordList();
    }

    private scrollWordCardIntoView(wordKey: string) {
        window.requestAnimationFrame(() => {
            const cards = this.containerEl.querySelectorAll('.hi-words-word-card');
            for (const card of Array.from(cards)) {
                if ((card as HTMLElement).getAttr('data-word-key') === wordKey) {
                    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    return;
                }
            }
        });
    }

    /**
     * 更新侧边栏视图
     */
    private async updateView() {
        if (this.manualDetailMode) {
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        
        if (!activeFile || (activeFile.extension !== 'md' && activeFile.extension !== 'pdf')) {
            this.showEmptyState('请打开一个 Markdown 文档或 PDF 文件');
            return;
        }

        if (activeFile === this.currentFile && this.currentWords.length > 0) {
            // 文件未变化且已有数据，不需要重新扫描
            return;
        }

        // 记录是否为切换到新文件
        const isFileChanged = activeFile !== this.currentFile;
        this.currentFile = activeFile;
        if (isFileChanged) {
            this.firstLoadForFile = true;
        }
        await this.scanCurrentDocument();
        await this.renderWordList();
    }

    /**
     * 合并/防抖更新：多事件密集触发时，避免排队大量 setTimeout
     */
    private scheduleUpdate(delay: number) {
        // 如果用户刚刚交互过（500ms 内），取消更新
        const timeSinceInteraction = Date.now() - this.lastInteractionTime;
        if (timeSinceInteraction < 500) {
            return;
        }
        
        if (this.updateTimer !== null) {
            window.clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        this.updateTimer = window.setTimeout(() => {
            this.updateTimer = null;
            void this.updateView();
        }, Math.max(0, delay));
    }

    /**
     * 扫描当前文档中的生词
     * 优化：使用缓存的单词列表，避免重复分类
     */
    private async scanCurrentDocument() {
        if (!this.currentFile) return;

        try {
            let content: string;
            
            // 根据文件类型提取内容
            if (this.currentFile.extension === 'pdf') {
                content = await this.extractPDFText();
            } else {
                // 使用 cachedRead 因为只读取不修改
                content = await this.app.vault.cachedRead(this.currentFile);
            }

            // 优化：获取并缓存分类后的单词列表
            await this.updateDefinitionsCache();

            const foundWordsByKey = new Map<string, { wordDef: WordDefinition, position: number }>();
            
            // 使用 Trie 一次扫描普通单词和别名，避免在大词库下逐词正则扫描当前文档
            const trie = new Trie();
            for (const wordDef of this.normalDefinitionsCache) {
                trie.addWord(wordDef.word, wordDef);
                wordDef.aliases?.forEach(alias => {
                    if (alias) trie.addWord(alias, wordDef);
                });
            }

            for (const match of trie.findAllMatches(content)) {
                const wordDef = match.payload as WordDefinition;
                const key = this.getWordStateKey(wordDef);
                const existing = foundWordsByKey.get(key);
                if (!existing || match.from < existing.position) {
                    foundWordsByKey.set(key, {
                        wordDef,
                        position: match.from
                    });
                }
            }
            
            // 扫描模式短语
            for (const wordDef of this.patternDefinitionsCache) {
                if (wordDef.patternParts && wordDef.patternParts.length > 0) {
                    // 使用模式匹配
                    const matches = findPatternMatches(content, wordDef.patternParts, 0);
                    if (matches.length > 0) {
                        const position = matches[0].from;
                        const key = this.getWordStateKey(wordDef);
                        const existing = foundWordsByKey.get(key);
                        if (!existing || position < existing.position) {
                            foundWordsByKey.set(key, {
                                wordDef: wordDef,
                                position: position
                            });
                        }
                    }
                }
            }

            // 按照单词在文档中首次出现的位置排序
            const foundWordsWithPosition = [...foundWordsByKey.values()];
            foundWordsWithPosition.sort((a, b) => a.position - b.position);
            this.currentWords = foundWordsWithPosition.map(item => item.wordDef);
        } catch (error) {
            console.error('Failed to scan document:', error);
            this.currentWords = [];
        }
    }
    
    /**
     * 更新单词定义缓存
     * 将单词分类为普通单词和模式短语，避免重复判断
     */
    private async updateDefinitionsCache(): Promise<void> {
        const allWordDefinitions = this.plugin.vocabularyManager.getStudyDefinitions();
        
        this.normalDefinitionsCache = [];
        this.patternDefinitionsCache = [];
        
        for (const wordDef of allWordDefinitions) {
            if (wordDef.isPattern && wordDef.patternParts && wordDef.patternParts.length > 0) {
                this.patternDefinitionsCache.push(wordDef);
            } else {
                this.normalDefinitionsCache.push(wordDef);
            }
        }
    }

    /**
     * 渲染生词列表
     */
    private async renderWordList() {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        container.empty();
        // 确保事件委托已绑定（容器清空后仍然存在于同一根上）
        this.bindDelegatedHandlers(container as HTMLElement);

        if (this.currentWords.length === 0) {
            this.showEmptyState(t('sidebar.empty_state'));
            return;
        }

        // 分组单词：未掌握和已掌握
        const unmasteredWords = this.currentWords.filter(word => !word.mastered);
        const masteredWords = this.currentWords.filter(word => word.mastered);
        

        // 智能初始标签页选择：仅在切换到新文件后的首次加载时进行
        if (this.firstLoadForFile && this.activeTab === 'learning' && unmasteredWords.length === 0 && masteredWords.length > 0) {
            this.activeTab = 'mastered';
        }
        // 首次渲染完成后，重置标记，避免用户点击时被强制切回
        this.firstLoadForFile = false;
        
        // 创建 Tab 导航
        this.createTabNavigation(container as HTMLElement, unmasteredWords.length, masteredWords.length);
        
        // 创建 Tab 内容
        await this.createTabContent(container as HTMLElement, unmasteredWords, masteredWords);
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
        }
        
        // 注意：Tab 点击事件由 bindDelegatedHandlers 中的事件委托统一处理，无需在此添加监听器
    }
    
    /**
     * 创建 Tab 内容
     */
    private async createTabContent(container: HTMLElement, unmasteredWords: WordDefinition[], masteredWords: WordDefinition[]) {
        if (this.activeTab === 'learning') {
            if (unmasteredWords.length > 0) {
                await this.createWordList(container, unmasteredWords, false);
            } else {
                this.createEmptyState(container, t('sidebar.no_learning_words'));
            }
        } else if (this.activeTab === 'mastered') {
            if (masteredWords.length > 0) {
                await this.createWordList(container, masteredWords, true);
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
        void this.renderWordList().catch(error => {
            console.error('HiWords 重新渲染侧边栏失败:', error);
        });
    }
    
    /**
     * 创建单词列表
     */
    private async createWordList(container: HTMLElement, words: WordDefinition[], isMastered: boolean) {
        const wordList = container.createEl('div', { cls: 'hi-words-word-list' });
        
        for (const wordDef of words) {
            await this.createWordCard(wordList, wordDef, isMastered);
        }
    }

    /**
     * 创建生词卡片
     * @param container 容器元素
     * @param wordDef 单词定义
     * @param isMastered 是否为已掌握单词
     */
    private async createWordCard(container: HTMLElement, wordDef: WordDefinition, isMastered = false) {
        const wordKey = this.getWordStateKey(wordDef);
        const isExpanded = this.getWordExpandedState(wordDef);
        const card = container.createEl('div', {
            cls: `hi-words-word-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}`,
            attr: { 'data-word-key': wordKey }
        });
        
        // 设置 CSS 自定义属性，让 CSS 处理实际样式
        if (wordDef.color) {
            const borderColor = mapCanvasColorToCSSVar(wordDef.color, 'var(--color-base-60)');
            card.style.setProperty('--word-card-accent-color', borderColor);
            // 设置更明显的彩色背景
            const bgColor = getColorWithOpacity(borderColor, 0.1);
            card.style.setProperty('--word-card-bg-color', bgColor);
        }

        // 词汇标题
        const wordTitle = card.createEl('div', { cls: 'hi-words-word-title' });
        const wordTextEl = wordTitle.createEl('span', {
            text: wordDef.word,
            cls: 'hi-words-word-text'
        });

        // 点击主词发音
        wordTextEl.addEventListener('click', (e) => {
            e.stopPropagation();
            void playWordTTS(this.plugin, wordDef.word, wordDef).catch(error => {
                console.error('HiWords 播放发音失败:', error);
            });
        });

        wordTitle.createEl('div', {
            cls: 'hi-words-card-toggle-spacer',
            attr: {
                'aria-label': isExpanded ? t('actions.collapse') : t('actions.expand'),
                'data-word-key': wordKey
            }
        });
        
        // 已掌握按钮（如果启用了功能）
        if (this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
            const buttonContainer = wordTitle.createEl('div', { 
                cls: 'hi-words-title-mastered-button',
                attr: {
                    'aria-label': isMastered ? t('actions.unmark_mastered') : t('actions.mark_mastered')
                }
            });
            
            // 设置图标（未掌握显示smile供用户点击标记为已掌握，已掌握显示frown供用户点击取消）
            setIcon(buttonContainer, isMastered ? 'frown' : 'smile');
            
            // 注意：点击事件由事件委托统一处理（bindDelegatedHandlers），无需在此添加监听器
        }

        const enableSectionTabs = this.plugin.settings.enableSectionTabs ?? true;
        const sections = wordDef.sections;
        const savedSectionIndex = this.sectionTabStates.get(wordDef.word) ?? 0;
        const activeSectionIndex = sections && sections.length > savedSectionIndex ? savedSectionIndex : 0;

        if (isExpanded && !wordDef.card && sections && sections.length > 1 && enableSectionTabs) {
            const tabsContainer = card.createEl('div', { cls: 'hi-words-card-tabs' });

            sections.forEach((section, index) => {
                tabsContainer.createEl('div', {
                    cls: `hi-words-card-tab ${index === activeSectionIndex ? 'active' : ''}`,
                    text: section.title,
                    attr: { 'data-section-index': index.toString() }
                });
            });
        }

        const contentToRender = sections && sections.length > 0 && enableSectionTabs
            ? sections[activeSectionIndex].content
            : wordDef.definition;
        
        // 定义内容
        if (isExpanded && wordDef.card) {
            const definition = card.createEl('div', { cls: 'hi-words-word-definition hi-words-word-definition-structured' });
            const defContainer = definition.createEl('div', {
                cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition'
            });
            renderWordCard(defContainer, wordDef, {
                mode: 'sidebar',
                app: this.app,
                pronunciationVariant: this.plugin.settings.pronunciationVariant || 'us',
                onPronunciationClick: (variant) => playWordTTS(this.plugin, wordDef.word, wordDef, variant),
                display: this.plugin.getVocabularyBookDisplaySettings(wordDef.source),
            });
        } else if (isExpanded && contentToRender && contentToRender.trim()) {
            const definition = card.createEl('div', { cls: 'hi-words-word-definition' });

            // 真正的 Markdown 内容容器
            const defContainer = definition.createEl('div', {
                cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition'
            });

            // 渲染 Markdown 内容
            await this.renderSectionContent(defContainer, contentToRender);
        }
        
        // 来源信息
        if (isExpanded && !wordDef.source.endsWith('.hiwords')) {
            const source = card.createEl('div', { cls: 'hi-words-word-source' });
            const bookName = this.getBookNameFromPath(wordDef.source);
            source.createEl('span', { text: `${t('sidebar.source_prefix')}${bookName}`, cls: 'hi-words-source-text' });

            // 添加点击事件到来源信息：导航到源文件
            source.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                void this.navigateToSource(wordDef).catch(error => {
                    console.error('HiWords 导航到来源失败:', error);
                });
            });
        }
        
        // 添加已掌握状态样式
        if (isMastered) {
            card.addClass('hi-words-word-card-mastered');
        }
    }

    private getDefaultExpandedState(): boolean {
        return (this.plugin.settings.sidebarDefaultDisplayMode || 'detail') === 'detail';
    }

    private getWordStateKey(wordDef: WordDefinition): string {
        return `${wordDef.source}::${wordDef.nodeId}::${wordDef.word}`;
    }

    private getWordExpandedState(wordDef: WordDefinition): boolean {
        const wordKey = this.getWordStateKey(wordDef);
        return this.expandedWordStates.get(wordKey) ?? this.getDefaultExpandedState();
    }

    private async renderSectionContent(container: HTMLElement, content: string): Promise<void> {
        container.empty();

        if (!content || content.trim() === '') {
            container.textContent = t('sidebar.no_definition');
            return;
        }

        try {
            const leaf = this.app.workspace.getMostRecentLeaf();
            const activeView = leaf?.view instanceof MarkdownView ? leaf.view : null;
            const sourcePath = (activeView && activeView.file?.path) || this.app.workspace.getActiveFile()?.path || '';

            await MarkdownRenderer.render(
                this.plugin.app,
                content,
                container,
                sourcePath,
                this
            );

            window.requestAnimationFrame(() => this.bindInternalLinksAndTags(container, sourcePath, container));
        } catch (error) {
            console.error('Markdown 渲染失败:', error);
            container.textContent = content;
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
     * 根级事件委托：使用捕获阶段的 mousedown，解决首次点击 click 丢失
     */
    private bindDelegatedHandlers(root: HTMLElement) {
        if (this.delegatedBound) return;
        root.addEventListener(
            'mousedown',
            (e) => {
                const target = e.target instanceof Node && e.target.nodeType === Node.ELEMENT_NODE
                    ? e.target as HTMLElement
                    : null;
                if (!target) return;

                // Tab 切换
                const tabEl = target.closest<HTMLElement>('.hi-words-tab');
                if (tabEl && root.contains(tabEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tab = (tabEl.getAttr('data-tab') as 'learning' | 'mastered') || 'learning';
                    if (tab !== this.activeTab) this.switchTab(tab);
                    return;
                }

                const cardTabEl = target.closest<HTMLElement>('.hi-words-card-tab');
                if (cardTabEl && root.contains(cardTabEl)) {
                    e.preventDefault();
                    e.stopPropagation();

                    this.lastInteractionTime = Date.now();
                    if (this.updateTimer !== null) {
                        window.clearTimeout(this.updateTimer);
                        this.updateTimer = null;
                    }

                    const sectionIndex = parseInt(cardTabEl.getAttr('data-section-index') || '0', 10);
                    const card = cardTabEl.closest<HTMLElement>('.hi-words-word-card');
                    const wordText = card?.querySelector<HTMLElement>('.hi-words-word-text');
                    const word = wordText?.textContent?.trim();
                    if (!card || !word) return;

                    const wordDef = this.currentWords.find(w => w.word === word);
                    if (!wordDef?.sections || sectionIndex >= wordDef.sections.length) return;

                    this.sectionTabStates.set(word, sectionIndex);
                    card.querySelectorAll('.hi-words-card-tab').forEach(tab => tab.removeClass('active'));
                    cardTabEl.addClass('active');

                    const defContainer = card.querySelector<HTMLElement>('.hi-words-definition');
                    if (defContainer) {
                        void this.renderSectionContent(defContainer, wordDef.sections[sectionIndex].content);
                    }
                    return;
                }

                // 展开/收起词卡
                const toggleEl = target.closest<HTMLElement>('.hi-words-card-toggle-spacer');
                if (toggleEl && root.contains(toggleEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 记录交互时间并取消所有待执行的更新
                    this.lastInteractionTime = Date.now();
                    if (this.updateTimer !== null) {
                        window.clearTimeout(this.updateTimer);
                        this.updateTimer = null;
                    }

                    const card = toggleEl.closest<HTMLElement>('.hi-words-word-card');
                    const wordKey = toggleEl.getAttr('data-word-key') || card?.getAttr('data-word-key');
                    if (wordKey) {
                        const currentState = this.expandedWordStates.get(wordKey);
                        const isCurrentlyExpanded = currentState ?? this.getDefaultExpandedState();
                        this.expandedWordStates.set(wordKey, !isCurrentlyExpanded);
                        void this.renderWordList();
                    }
                    return;
                }

                // 已掌握/取消按钮
                const masteredBtn = target.closest<HTMLElement>('.hi-words-title-mastered-button');
                if (masteredBtn && root.contains(masteredBtn)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const card = masteredBtn.closest<HTMLElement>('.hi-words-word-card');
                    const isMastered = !!card?.hasClass('hi-words-word-card-mastered');
                    const wordText = card?.querySelector<HTMLElement>('.hi-words-word-text');
                    const word = wordText?.textContent?.trim();
                    if (word && this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
                        const detail = this.currentWords.find((w) => w.word === word);
                        if (detail) {
                            void (async () => {
                                try {
                                    const masteredService = this.plugin.masteredService;
                                    if (!masteredService) return;

                                    if (isMastered) {
                                        await masteredService.unmarkWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    } else {
                                        await masteredService.markWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    }
                                    window.setTimeout(() => {
                                        void this.updateView();
                                    }, 100);
                                } catch (err) {
                                    console.error('切换已掌握状态失败:', err);
                                }
                            })();
                        }
                    }
                    return;
                }

                // 来源跳转
                const sourceEl = target.closest<HTMLElement>('.hi-words-word-source');
                if (sourceEl && root.contains(sourceEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const card = sourceEl.closest<HTMLElement>('.hi-words-word-card');
                    const wordText = card?.querySelector<HTMLElement>('.hi-words-word-text');
                    const word = wordText?.textContent?.trim();
                    if (word) {
                        const detail = this.currentWords.find((w) => w.word === word);
                        if (detail) {
                            void this.navigateToSource(detail).catch(error => {
                                console.error('HiWords 导航到来源失败:', error);
                            });
                        }
                    }
                    return;
                }
            },
            { capture: true }
        );
        this.delegatedBound = true;
    }

    /**
     * 从路径获取生词本名称
     */
    private getBookNameFromPath(path: string): string {
        const book = this.plugin.settings.vocabularyBooks.find(b => b.path === path);
        return book ? book.name : path.split('/').pop()?.replace('.canvas', '') || '未知';
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 从 PDF 文件中提取文本内容
     */
    private async extractPDFText(): Promise<string> {
        try {
            // 等待 PDF 视图加载并获取文本层内容
            await new Promise(resolve => window.setTimeout(resolve, 500));
            
            // 查找所有 PDF 文本层
            const textLayers = activeDocument.querySelectorAll('.textLayer');
            let extractedText = '';
            
            textLayers.forEach((textLayer: Element) => {
                // 检查是否在当前活动的 PDF 视图中
                const pdfContainer = textLayer.closest('.pdf-container, .mod-pdf');
                if (pdfContainer) {
                    // 获取文本层中的所有文本内容
                    const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
                    textSpans.forEach((span: Element) => {
                        const text = span.textContent || '';
                        if (text.trim()) {
                            extractedText += text + ' ';
                        }
                    });
                    extractedText += '\n'; // 每个文本层后添加换行
                }
            });
            
            // 如果没有找到文本层，尝试从 PDF 视图中提取
            if (!extractedText.trim()) {
                const pdfViews = activeDocument.querySelectorAll('.pdf-container, .mod-pdf');
                pdfViews.forEach((pdfView: Element) => {
                    const allText = pdfView.textContent || '';
                    if (allText.trim()) {
                        extractedText += allText + '\n';
                    }
                });
            }
            
            return extractedText.trim();
        } catch (error) {
            console.error('PDF 文本提取失败:', error);
            return '';
        }
    }

    /**
     * 构建用于扫描文档的正则。
     * - 对仅包含拉丁字符的词：使用 \b 边界避免误匹配，如 "art" 不匹配 "start"。
     * - 对包含日语/CJK/韩语的词：不使用 \b（因为这些文本常无空格），并使用 Unicode 标志。
     */
    private buildSearchRegex(term: string): RegExp {
        const escaped = this.escapeRegExp(term);
        // 检测是否包含 CJK、日语或韩语脚本
        const hasAsianScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(term);
        const pattern = hasAsianScript ? `${escaped}` : `\\b${escaped}\\b`;
        const flags = hasAsianScript ? 'giu' : 'gi';
        return new RegExp(pattern, flags);
    }

    /**
     * 为侧边栏渲染内容绑定内部链接与标签交互：
     * - internal-link: 悬停触发原生 hover 预览；点击跳转
     * - tag: 点击打开/复用搜索视图
     */
    private bindInternalLinksAndTags(root: HTMLElement, sourcePath: string, hoverParent: HTMLElement) {
        // 内部链接
        root.querySelectorAll('a.internal-link').forEach((a) => {
            const linkEl = a as HTMLAnchorElement;
            const linktext = (linkEl.getAttribute('href') || linkEl.dataset.href || '').trim();
            if (!linktext) return;

            linkEl.addEventListener('mouseover', (evt) => {
                (this.app.workspace as unknown as HoverLinkWorkspace).trigger('hover-link', {
                    event: evt,
                    source: 'hi-words',
                    hoverParent,
                    target: linkEl,
                    linktext,
                    sourcePath
                });
            });

            linkEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                void this.app.workspace.openLinkText(linktext, sourcePath).catch(error => {
                    console.error('HiWords 打开内部链接失败:', error);
                });
            });
        });

        // 标签
        root.querySelectorAll('a.tag').forEach((a) => {
            const tagEl = a as HTMLAnchorElement;
            const query = (tagEl.getAttribute('href') || tagEl.textContent || '').trim();
            if (!query) return;
            tagEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.openOrUpdateSearch(query.startsWith('#') ? query : `#${query}`);
            });
        });
    }

    /** 打开或复用全局搜索视图并设置查询 */
    private openOrUpdateSearch(query: string) {
        try {
            const leaves = this.app.workspace.getLeavesOfType('search');
            if (leaves.length > 0) {
                const view = leaves[0].view as SearchViewLike;
                view.setQuery?.(query);
                void this.app.workspace.revealLeaf(leaves[0]).catch(error => {
                    console.error('HiWords 打开搜索视图失败:', error);
                });
                return;
            }

            // 如果搜索视图不存在，提示用户启用搜索插件
            new Notice(t('notices.enable_search_plugin') || '请先启用核心搜索插件');
        } catch (e) {
            console.error('打开搜索失败:', e);
        }
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
                    window.setTimeout(() => {
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
     * 强制刷新视图
     */
    public refresh() {
        this.currentFile = null; // 强制重新扫描
        this.scheduleUpdate(0);
    }
}
