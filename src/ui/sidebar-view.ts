import { ItemView, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, setIcon, Notice } from 'obsidian';
import HiWordsPlugin from '../../main';
import { WordDefinition, mapCanvasColorToCSSVar, getColorWithOpacity, playWordTTS } from '../utils';
import { t } from '../i18n';

export const SIDEBAR_VIEW_TYPE = 'hi-words-sidebar';

export class HiWordsSidebarView extends ItemView {
    private plugin: HiWordsPlugin;
    private currentWords: WordDefinition[] = [];
    private activeTab: 'learning' | 'mastered' = 'learning';
    private currentFile: TFile | null = null;
    private firstLoadForFile: boolean = false; // 仅在切换到新文件后的首次渲染生效
    private updateTimer: number | null = null; // 合并/防抖更新
    private measureQueue: HTMLElement[] = []; // 批量测量的队列
    private measureScheduled = false; // 是否已安排 RAF 测量
    private delegatedBound = false; // 是否已绑定根级事件委托
    private lastInteractionTime = 0; // 最后一次交互的时间戳
    private viewMode: 'current-document' | string = 'current-document'; // 视图模式：'current-document' 或生词本路径

    constructor(leaf: WorkspaceLeaf, plugin: HiWordsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    /**
     * 安排一次 requestAnimationFrame，把所有待测量的 collapsible 高度一次性计算并写回
     */
    private scheduleMeasure() {
        if (this.measureScheduled) return;
        this.measureScheduled = true;
        requestAnimationFrame(() => {
            this.measureScheduled = false;
            if (this.measureQueue.length === 0) return;

            const MAX_COLLAPSED = 140; // 与 CSS 保持一致
            const items = this.measureQueue.splice(0, this.measureQueue.length);

            // 先读后写：先生成读集
            const results: Array<{ el: HTMLElement; needsToggle: boolean }> = items.map((el) => ({
                el,
                needsToggle: el.scrollHeight > MAX_COLLAPSED + 4,
            }));

            // 再统一写
            for (const { el, needsToggle } of results) {
                if (!needsToggle) {
                    el.removeClass('collapsed');
                    continue;
                }
                const definition = el.parentElement as HTMLElement; // collapsible 的父级就是 definition 容器
                if (!definition) continue;
                
                // 检查是否已存在展开/收起按钮，避免重复创建
                let overlay = definition.querySelector('.hi-words-expand-overlay') as HTMLElement | null;
                if (!overlay) {
                    overlay = definition.createEl('div', { cls: 'hi-words-expand-overlay' });
                }
                
                // 更新按钮文本（根据当前状态）
                overlay.setText(el.hasClass('collapsed') ? t('actions.expand') : t('actions.collapse'));
            }
        });
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
        
        // 创建下拉框容器（在右上角）
        this.createViewModeSelector(container as HTMLElement);
        
        // 初始化显示
        this.scheduleUpdate(0);

        // 监听文件打开事件（使用 file-open 代替 active-leaf-change，避免侧边栏激活触发更新）
        // 仅在"当前文档"模式下监听
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                if (this.viewMode === 'current-document') {
                    this.scheduleUpdate(120);
                }
            })
        );

        // 监听文件内容变化
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 仅在"当前文档"模式下监听
                if (this.viewMode === 'current-document') {
                    // 延迟更新，避免频繁刷新
                    this.scheduleUpdate(500);
                }
            })
        );
        
        // 监听文件修改（包括 Canvas 文件的修改）
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 如果修改的是 Canvas 文件，则刷新侧边栏
                if (file instanceof TFile && file.extension === 'canvas') {
                    // 如果当前选择的是该生词本，或者当前是"当前文档"模式，则刷新
                    if (this.viewMode === file.path || this.viewMode === 'current-document') {
                        this.scheduleUpdate(250);
                    }
                }
            })
        );
        
        // 监听已掌握功能状态变化
        this.registerEvent(
            this.app.workspace.on('hi-words:mastered-changed' as any, () => {
                this.scheduleUpdate(100);
            })
        );
        
        // 监听设置变化（如模糊效果开关、生词本列表变化）
        this.registerEvent(
            this.app.workspace.on('hi-words:settings-changed' as any, () => {
                // 更新下拉框选项
                const container = this.containerEl.querySelector('.hi-words-sidebar') as HTMLElement;
                if (container) {
                    this.createViewModeSelector(container);
                }
                this.scheduleUpdate(100);
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
        // 根据视图模式决定如何更新
        if (this.viewMode === 'current-document') {
            const activeFile = this.app.workspace.getActiveFile();
            
            if (!activeFile || (activeFile.extension !== 'md' && activeFile.extension !== 'pdf')) {
                const container = this.containerEl.querySelector('.hi-words-sidebar') as HTMLElement;
                if (container) {
                    const contentContainer = (container.querySelector('.hi-words-content') as HTMLElement) || container.createEl('div', { cls: 'hi-words-content' });
                    contentContainer.empty();
                    this.showEmptyState('请打开一个 Markdown 文档或 PDF 文件', contentContainer);
                }
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
        } else {
            // 显示指定生词本的所有单词
            await this.loadVocabularyBookWords(this.viewMode);
        }
        
        this.renderWordList();
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
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        this.updateTimer = window.setTimeout(() => {
            this.updateTimer = null;
            void this.updateView();
        }, Math.max(0, delay));
    }

    /**
     * 加载指定生词本的所有单词
     */
    private async loadVocabularyBookWords(bookPath: string) {
        try {
            const wordDefinitions = await this.plugin.vocabularyManager.getWordDefinitionsByBook(bookPath);
            this.currentWords = wordDefinitions;
        } catch (error) {
            console.error('Failed to load vocabulary book words:', error);
            this.currentWords = [];
        }
    }

    /**
     * 扫描当前文档中的生词
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

            const allWordDefinitions = await this.plugin.vocabularyManager.getAllWordDefinitions();

            // 创建一个数组来存储找到的单词及其位置
            const foundWordsWithPosition: { wordDef: WordDefinition, position: number }[] = [];
            
            // 扫描文档内容，查找生词并记录位置
            for (const wordDef of allWordDefinitions) {
                // 检查主单词
                // 使用 Unicode 感知的匹配：
                // 英文等拉丁词使用 \b 边界；含日语/CJK 的词不使用 \b，以便能在无空格文本中命中
                let regex = this.buildSearchRegex(wordDef.word);
                let match = regex.exec(content);
                let position = match ? match.index : -1;
                
                // 检查别名
                if (position === -1 && wordDef.aliases) {
                    for (const alias of wordDef.aliases) {
                        regex = this.buildSearchRegex(alias);
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
     * 创建视图模式选择器（下拉框）
     */
    private createViewModeSelector(container: HTMLElement) {
        // 如果已存在选择器，先移除
        const existingSelector = container.querySelector('.hi-words-view-mode-selector');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        const selectorContainer = container.createEl('div', { cls: 'hi-words-view-mode-selector' });
        const select = selectorContainer.createEl('select', { cls: 'hi-words-view-mode-select' });
        
        // 添加"当前文档"选项
        select.createEl('option', { 
            text: t('sidebar.current_document'),
            attr: { value: 'current-document' }
        });
        
        // 添加所有启用的生词本选项
        const enabledBooks = this.plugin.settings.vocabularyBooks.filter(book => book.enabled);
        for (const book of enabledBooks) {
            const option = select.createEl('option', {
                text: book.name,
                attr: { value: book.path }
            });
        }
        
        // 设置当前选中值（如果当前选中的生词本已被禁用，则切换回"当前文档"）
        const currentBookExists = enabledBooks.some(book => book.path === this.viewMode);
        if (this.viewMode !== 'current-document' && !currentBookExists) {
            this.viewMode = 'current-document';
        }
        select.value = this.viewMode;
        
        // 监听变化
        select.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.viewMode = target.value;
            this.currentFile = null; // 重置当前文件，强制重新加载
            this.currentWords = []; // 清空当前单词列表
            this.scheduleUpdate(0);
        });
    }

    /**
     * 渲染生词列表
     */
    private async renderWordList() {
        const container = this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        // 保留下拉框，只清空内容区域
        const contentContainer = (container.querySelector('.hi-words-content') as HTMLElement) || container.createEl('div', { cls: 'hi-words-content' });
        contentContainer.empty();
        
        // 确保事件委托已绑定（容器清空后仍然存在于同一根上）
        this.bindDelegatedHandlers(container as HTMLElement);

        if (this.currentWords.length === 0) {
            this.showEmptyState(t('sidebar.empty_state'), contentContainer as HTMLElement);
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
        this.createTabNavigation(contentContainer as HTMLElement, unmasteredWords.length, masteredWords.length);
        
        // 创建 Tab 内容
        await this.createTabContent(contentContainer as HTMLElement, unmasteredWords, masteredWords);
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

        // 在完成当前 Tab 的所有渲染后，统一安排一次测量折叠高度
        this.scheduleMeasure();
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
    private async createWordCard(container: HTMLElement, wordDef: WordDefinition, isMastered: boolean = false) {
        const card = container.createEl('div', { cls: 'hi-words-word-card' });
        
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
        const wordTextEl = wordTitle.createEl('span', { text: wordDef.word, cls: 'hi-words-word-text' });
        // 点击主词发音
        wordTextEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            await playWordTTS(this.plugin, wordDef.word);
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
        
        // 定义内容
        if (wordDef.definition && wordDef.definition.trim()) {
            const definition = card.createEl('div', { cls: 'hi-words-word-definition' });

            // 外层可折叠容器
            const collapsible = definition.createEl('div', { cls: 'hi-words-collapsible collapsed' });

            // 真正的 Markdown 内容容器
            const defContainer = collapsible.createEl('div', {
                cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition'
            });

            // 渲染 Markdown 内容
            try {
                // 使用 getMostRecentLeaf 获取最近的视图
                const leaf = this.app.workspace.getMostRecentLeaf();
                const activeView = leaf?.view instanceof MarkdownView ? leaf.view : null;
                const sourcePath = (activeView && activeView.file?.path) || this.app.workspace.getActiveFile()?.path || '';
                // 使用新的 render API
                await MarkdownRenderer.render(
                    this.plugin.app,
                    wordDef.definition,
                    defContainer,
                    sourcePath,
                    this
                );
                // 渲染完成后绑定交互（下一帧确保节点已生成）
                requestAnimationFrame(() => this.bindInternalLinksAndTags(defContainer, sourcePath, defContainer));
            } catch (error) {
                console.error('Markdown 渲染失败:', error);
                // 兜底文本
                defContainer.textContent = wordDef.definition;
            }

            // 交由批量测量队列统一处理折叠逻辑，避免逐卡片触发布局计算
            this.measureQueue.push(collapsible);
        }
        
        // 来源信息
        const source = card.createEl('div', { cls: 'hi-words-word-source' });
        const bookName = this.getBookNameFromPath(wordDef.source);
        source.createEl('span', { text: `${t('sidebar.source_prefix')}${bookName}`, cls: 'hi-words-source-text' });
        
        // 添加点击事件到来源信息：导航到源文件
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
    private showEmptyState(message: string, targetContainer?: HTMLElement) {
        const container = targetContainer || this.containerEl.querySelector('.hi-words-sidebar');
        if (!container) return;

        if (!targetContainer) {
            container.empty();
            // 重新创建下拉框
            this.createViewModeSelector(container as HTMLElement);
        }
        
        const contentContainer = (container.querySelector('.hi-words-content') as HTMLElement) || container.createEl('div', { cls: 'hi-words-content' });
        contentContainer.empty();
        const emptyState = contentContainer.createEl('div', { cls: 'hi-words-empty-state' });
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
                const target = e.target as HTMLElement | null;
                if (!target) return;

                // Tab 切换
                const tabEl = target.closest('.hi-words-tab') as HTMLElement | null;
                if (tabEl && root.contains(tabEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tab = (tabEl.getAttr('data-tab') as 'learning' | 'mastered') || 'learning';
                    if (tab !== this.activeTab) this.switchTab(tab);
                    return;
                }

                // 展开/收起：覆盖层
                const overlay = target.closest('.hi-words-expand-overlay') as HTMLElement | null;
                if (overlay && root.contains(overlay)) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 记录交互时间并取消所有待执行的更新
                    this.lastInteractionTime = Date.now();
                    if (this.updateTimer !== null) {
                        clearTimeout(this.updateTimer);
                        this.updateTimer = null;
                    }
                    
                    const definition = overlay.parentElement as HTMLElement | null;
                    const collapsible = definition?.querySelector('.hi-words-collapsible') as HTMLElement | null;
                    const el = collapsible || definition;
                    if (el) {
                        const nextCollapsed = !el.hasClass('collapsed');
                        el.toggleClass('collapsed', nextCollapsed);
                        overlay.setText(nextCollapsed ? t('actions.expand') : t('actions.collapse'));
                    }
                    return;
                }

                // 已掌握/取消按钮
                const masteredBtn = target.closest('.hi-words-title-mastered-button') as HTMLElement | null;
                if (masteredBtn && root.contains(masteredBtn)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const card = masteredBtn.closest('.hi-words-word-card') as HTMLElement | null;
                    const isMastered = !!card?.hasClass('hi-words-word-card-mastered');
                    const wordText = card?.querySelector('.hi-words-word-text') as HTMLElement | null;
                    const word = wordText?.textContent?.trim();
                    if (word && this.plugin.settings.enableMasteredFeature && this.plugin.masteredService) {
                        const detail = this.currentWords.find((w) => w.word === word);
                        if (detail) {
                            (async () => {
                                try {
                                    if (isMastered) {
                                        await this.plugin.masteredService!.unmarkWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    } else {
                                        await this.plugin.masteredService!.markWordAsMastered(detail.source, detail.nodeId, detail.word);
                                    }
                                    setTimeout(() => this.updateView(), 100);
                                } catch (err) {
                                    console.error('切换已掌握状态失败:', err);
                                }
                            })();
                        }
                    }
                    return;
                }

                // 来源跳转
                const sourceEl = target.closest('.hi-words-word-source') as HTMLElement | null;
                if (sourceEl && root.contains(sourceEl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const card = sourceEl.closest('.hi-words-word-card') as HTMLElement | null;
                    const wordText = card?.querySelector('.hi-words-word-text') as HTMLElement | null;
                    const word = wordText?.textContent?.trim();
                    if (word) {
                        const detail = this.currentWords.find((w) => w.word === word);
                        if (detail) this.navigateToSource(detail);
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
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 查找所有 PDF 文本层
            const textLayers = document.querySelectorAll('.textLayer');
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
                const pdfViews = document.querySelectorAll('.pdf-container, .mod-pdf');
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
     * - 对包含日语/CJK 的词：不使用 \b（因为 CJK 文本常无空格），并使用 Unicode 标志。
     */
    private buildSearchRegex(term: string): RegExp {
        const escaped = this.escapeRegExp(term);
        // 检测是否包含 CJK 或日语脚本
        const hasCJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term);
        const pattern = hasCJK ? `${escaped}` : `\\b${escaped}\\b`;
        const flags = hasCJK ? 'giu' : 'gi';
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
            const linktext = (linkEl.getAttribute('href') || (linkEl as any).dataset?.href || '').trim();
            if (!linktext) return;

            linkEl.addEventListener('mouseover', (evt) => {
                (this.app.workspace as any).trigger('hover-link', {
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
                this.app.workspace.openLinkText(linktext, sourcePath);
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
                const view: any = leaves[0].view;
                view.setQuery?.(query);
                this.app.workspace.revealLeaf(leaves[0]);
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
     * 强制刷新视图
     */
    public refresh() {
        this.currentFile = null; // 强制重新扫描
        this.scheduleUpdate(0);
    }
}
