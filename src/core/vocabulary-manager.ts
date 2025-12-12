import { App, TFile, Notice } from 'obsidian';
import { WordDefinition, VocabularyBook, HiWordsSettings } from '../utils';
import { CanvasParser, CanvasEditor } from '../canvas';

export class VocabularyManager {
    private app: App;
    private canvasParser: CanvasParser;
    private canvasEditor: CanvasEditor;
    private definitions: Map<string, WordDefinition[]> = new Map();
    private settings: HiWordsSettings;
    
    // 缓存优化
    private wordDefinitionCache: Map<string, WordDefinition> = new Map(); // 单词 -> 定义映射
    private allWordsCache: string[] = []; // 所有单词的缓存
    private bookWordsCache: Map<string, string[]> = new Map(); // 书本路径 -> 单词列表映射
    private cacheValid: boolean = false; // 缓存是否有效
    
    // 增量更新优化
    private memoryOnlyWords: Map<string, WordDefinition[]> = new Map(); // 仅内存中的新词汇
    private pendingSyncWords: Map<string, WordDefinition[]> = new Map(); // 待同步的词汇
    private syncTimeouts: Map<string, number> = new Map(); // 同步定时器
    private tempNodeIdCounter: number = 0; // 临时节点ID计数器

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.canvasParser = new CanvasParser(app, settings);
        this.canvasEditor = new CanvasEditor(app, settings);
        this.settings = settings;
    }

    /**
     * 加载所有启用的生词本
     */
    async loadAllVocabularyBooks(): Promise<void> {
        this.definitions.clear();
        this.invalidateCache();
        
        const loadPromises = this.settings.vocabularyBooks
            .filter(book => book.enabled)
            .map(book => this.loadVocabularyBook(book));
            
        await Promise.all(loadPromises);
        
        // 重建缓存
        this.rebuildCache();
    }

    /**
     * 加载单个生词本
     */
    async loadVocabularyBook(book: VocabularyBook): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(book.path);
        
        if (!file || !(file instanceof TFile)) {
            console.warn(`Canvas file not found: ${book.path}`);
            return;
        }

        if (!CanvasParser.isCanvasFile(file)) {
            console.warn(`File is not a canvas: ${book.path}`);
            return;
        }

        try {
            const definitions = await this.canvasParser.parseCanvasFile(file);
            this.definitions.set(book.path, definitions);
            
            // 增量更新缓存而不是重建整个缓存
            this.updateCacheForBook(book.path, definitions);
        } catch (error) {
            console.error(`Failed to load vocabulary book ${book.name}:`, error);
            // 解析失败时，确保清理该生词本的数据和缓存
            this.definitions.delete(book.path);
            this.updateCacheForBook(book.path, []); // 清空该生词本的缓存
        }
    }

    /**
     * 获取单词定义，支持别名匹配
     * @param word 要查找的单词
     * @param visited 已访问的单词集合，用于防止循环引用
     * @returns 单词定义或 null
     */
    getDefinition(word: string, visited: Set<string> = new Set()): WordDefinition | null {
        const normalizedWord = word.toLowerCase().trim();
        
        // 防止循环引用
        if (visited.has(normalizedWord)) {
            return null;
        }
        visited.add(normalizedWord);
        
        // 检查缓存
        if (this.cacheValid && this.wordDefinitionCache.has(normalizedWord)) {
            return this.wordDefinitionCache.get(normalizedWord) || null;
        }
        
        // 如果缓存无效，则重建缓存
        if (!this.cacheValid) {
            this.rebuildCache();
            if (this.wordDefinitionCache.has(normalizedWord)) {
                return this.wordDefinitionCache.get(normalizedWord) || null;
            }
        }

        // 缓存中没有找到，执行完整搜索
        for (const definitions of this.definitions.values()) {
            // 先检查主单词
            const foundByMainWord = definitions.find(def => def.word === normalizedWord);
            if (foundByMainWord) {
                // 更新缓存
                this.wordDefinitionCache.set(normalizedWord, foundByMainWord);
                return foundByMainWord;
            }

            // 再检查别名
            const foundByAlias = definitions.find(def => 
                def.aliases && def.aliases.includes(normalizedWord)
            );
            if (foundByAlias) {
                // 更新缓存
                this.wordDefinitionCache.set(normalizedWord, foundByAlias);
                return foundByAlias;
            }
        }

        return null;
    }

    /**
     * 获取所有词汇，包括别名
     */
    getAllWords(): string[] {
        // 如果缓存有效，直接返回缓存的单词列表
        if (this.cacheValid) {
            return [...this.allWordsCache]; // 返回副本以防修改
        }
        
        // 重建缓存并返回
        this.rebuildCache();
        return [...this.allWordsCache];
    }

    /**
     * 获取未掌握的词汇（用于高亮显示）
     * 如果已掌握功能未启用，返回所有单词
     */
    getAllWordsForHighlight(): string[] {
        // 如果已掌握功能未启用，返回所有单词
        if (!this.settings.enableMasteredFeature) {
            return this.getAllWords();
        }
        
        // 如果缓存有效，从缓存中过滤出未掌握的单词
        if (this.cacheValid) {
            const unmasteredWords: string[] = [];
            for (const word of this.allWordsCache) {
                const wordDef = this.wordDefinitionCache.get(word);
                if (wordDef && !wordDef.mastered) {
                    unmasteredWords.push(word);
                }
            }
            return unmasteredWords;
        }
        
        // 重建缓存并过滤
        this.rebuildCache();
        const unmasteredWords: string[] = [];
        for (const word of this.allWordsCache) {
            const wordDef = this.wordDefinitionCache.get(word);
            if (wordDef && !wordDef.mastered) {
                unmasteredWords.push(word);
            }
        }
        return unmasteredWords;
    }

    /**
     * 获取指定生词本的词汇，包括别名
     */
    getWordsFromBook(bookPath: string): string[] {
        // 如果缓存有效且包含该书本的单词列表，直接返回
        if (this.cacheValid && this.bookWordsCache.has(bookPath)) {
            return [...this.bookWordsCache.get(bookPath)!]; // 返回副本以防修改
        }
        
        const definitions = this.definitions.get(bookPath);
        if (!definitions) return [];
        
        const words: string[] = [];
        
        // 添加主单词
        words.push(...definitions.map(def => def.word));
        
        // 添加别名
        definitions.forEach(def => {
            if (def.aliases && def.aliases.length > 0) {
                words.push(...def.aliases);
            }
        });
        
        const uniqueWords = [...new Set(words)]; // 去重
        
        // 更新缓存
        this.bookWordsCache.set(bookPath, uniqueWords);
        
        return uniqueWords;
    }

    /**
     * 重新加载指定的生词本
     */
    async reloadVocabularyBook(bookPath: string): Promise<void> {
        const book = this.settings.vocabularyBooks.find(b => b.path === bookPath);
        if (book && book.enabled) {
            await this.loadVocabularyBook(book);
            // 使缓存失效
            this.invalidateCache();
        }
    }

    /**
     * 删除指定生词本的数据
     * @param bookPath 生词本路径
     */
    removeBookData(bookPath: string): void {
        this.definitions.delete(bookPath);
        this.invalidateCache();
    }

    /**
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings): void {
        const oldSettings = this.settings;
        this.settings = settings;
        
        // 只在影响词汇数据的设置变更时才使缓存失效
        const shouldInvalidateCache = 
            oldSettings.masteredDetection !== settings.masteredDetection ||
            oldSettings.fileNodeParseMode !== settings.fileNodeParseMode ||
            this.hasVocabularyBooksChanged(oldSettings.vocabularyBooks, settings.vocabularyBooks);
            
        if (shouldInvalidateCache) {
            this.invalidateCache();
        }
        
        // 同步给 CanvasEditor
        this.canvasEditor.updateSettings(settings);
        // 同步给 CanvasParser（影响掌握判定等）
        this.canvasParser.updateSettings(settings);
    }
    
    /**
     * 检查生词本配置是否发生变化
     * @param oldBooks 旧的生词本配置
     * @param newBooks 新的生词本配置
     * @returns 是否发生变化
     */
    private hasVocabularyBooksChanged(oldBooks: VocabularyBook[], newBooks: VocabularyBook[]): boolean {
        if (oldBooks.length !== newBooks.length) {
            return true;
        }
        
        // 检查每个生词本的关键属性
        for (let i = 0; i < oldBooks.length; i++) {
            const oldBook = oldBooks[i];
            const newBook = newBooks[i];
            
            if (oldBook.path !== newBook.path || 
                oldBook.enabled !== newBook.enabled ||
                oldBook.name !== newBook.name) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 获取当前设置
     */
    getSettings(): HiWordsSettings {
        return this.settings;
    }

    /**
     * 获取统计信息
     */
    getStats(): { totalBooks: number; enabledBooks: number; totalWords: number } {
        const totalBooks = this.settings.vocabularyBooks.length;
        const enabledBooks = this.settings.vocabularyBooks.filter(b => b.enabled).length;
        
        // 只统计主单词，不包含别名
        let totalWords = 0;
        for (const definitions of this.definitions.values()) {
            totalWords += definitions.length;
        }
        
        return { totalBooks, enabledBooks, totalWords };
    }

    /**
     * 检查词汇是否存在
     */
    hasWord(word: string): boolean {
        const normalizedWord = word.toLowerCase().trim();
        
        // 如果缓存有效，直接检查缓存
        if (this.cacheValid) {
            return this.wordDefinitionCache.has(normalizedWord);
        }
        
        return this.getDefinition(word) !== null;
    }

    /**
     * 清除所有数据
     */
    clear(): void {
        this.definitions.clear();
        this.invalidateCache();
    }
    
    /**
     * 添加词汇到 Canvas 文件
     */
    async addWordToCanvas(bookPath: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        try {
            // 1. 创建词汇定义（使用临时节点ID）
            const wordDef: WordDefinition = {
                word,
                definition,
                source: bookPath,
                nodeId: this.generateTempNodeId(),
                color: color ? this.getColorString(color) : undefined,
                aliases: aliases?.filter(alias => alias && alias.trim().length > 0)
            };
            
            // 2. 立即更新内存缓存（用户立即看到效果）
            this.addWordToMemoryCache(bookPath, wordDef);
            
            // 3. 重建缓存以立即生效
            this.rebuildCache();
            
            // 4. 异步写入文件并更新真实nodeId
            this.scheduleCanvasSync(bookPath, wordDef);
            
            return true;
        } catch (error) {
            console.error('Failed to add word to canvas:', error);
            return false;
        }
    }
    
    /**
     * 仅设置节点颜色，并同步内存缓存的颜色字符串
     */
    async setNodeColor(bookPath: string, nodeId: string, color?: number): Promise<boolean> {
        try {
            const ok = await this.canvasEditor.setNodeColor(bookPath, nodeId, color);
            if (!ok) return false;

            // 更新内存缓存中的该节点颜色
            const defs = this.definitions.get(bookPath);
            if (defs) {
                const idx = defs.findIndex(d => d.nodeId === nodeId);
                if (idx >= 0) {
                    const def = defs[idx];
                    def.color = color !== undefined ? this.getColorString(color) : undefined;
                    // 更新缓存映射
                    this.wordDefinitionCache.set(def.word, def);
                    if (def.aliases) {
                        def.aliases.forEach(alias => this.wordDefinitionCache.set(alias, def));
                    }
                    // 标记缓存需要重建（颜色变化可能影响过滤）
                    this.cacheValid = false;
                }
            }
            return true;
        } catch (e) {
            console.error('设置节点颜色失败:', e);
            return false;
        }
    }
    
    /**
     * 使缓存失效
     * 当词汇数据发生变化时调用
     */
    private invalidateCache(): void {
        this.cacheValid = false;
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
    }
    
    /**
     * 重建缓存
     * 构建单词到定义的映射和所有单词的列表
     */
    private rebuildCache(): void {
        // 清空现有缓存
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
        
        const allWords = new Set<string>();
        
        // 遍历所有词汇本和定义
        for (const [bookPath, definitions] of this.definitions.entries()) {
            const bookWords = new Set<string>();
            
            for (const def of definitions) {
                // 添加主单词到缓存
                const normalizedWord = def.word.toLowerCase().trim();
                this.wordDefinitionCache.set(normalizedWord, def);
                allWords.add(normalizedWord);
                bookWords.add(normalizedWord);
                
                // 添加别名到缓存
                if (def.aliases && def.aliases.length > 0) {
                    for (const alias of def.aliases) {
                        const normalizedAlias = alias.toLowerCase().trim();
                        this.wordDefinitionCache.set(normalizedAlias, def);
                        allWords.add(normalizedAlias);
                        bookWords.add(normalizedAlias);
                    }
                }
            }
            
            // 保存该书本的单词列表
            this.bookWordsCache.set(bookPath, [...bookWords]);
        }
        
        // 保存所有单词列表
        this.allWordsCache = [...allWords];
        
        // 标记缓存为有效
        this.cacheValid = true;
    }
    
    /**
     * 增量更新特定生词本的缓存
     * @param bookPath 生词本路径
     * @param definitions 该生词本的词汇定义
     */
    private updateCacheForBook(bookPath: string, definitions: WordDefinition[]): void {
        // 如果缓存无效，直接重建
        if (!this.cacheValid) {
            this.rebuildCache();
            return;
        }
        
        // 清除该生词本的旧缓存
        const oldBookWords = this.bookWordsCache.get(bookPath) || [];
        const oldWordsSet = new Set(oldBookWords);
        
        // 从 wordDefinitionCache 中删除旧单词
        oldBookWords.forEach(word => {
            this.wordDefinitionCache.delete(word);
        });
        
        // 重建 allWordsCache（更高效的方式）
        this.allWordsCache = this.allWordsCache.filter(word => !oldWordsSet.has(word));
        
        // 添加新的缓存（与 rebuildCache 保持一致）
        const newBookWords = new Set<string>();
        const newAllWords = new Set(this.allWordsCache); // 保持现有的单词
        
        for (const def of definitions) {
            // 添加主单词到缓存
            const normalizedWord = def.word.toLowerCase().trim();
            this.wordDefinitionCache.set(normalizedWord, def);
            newAllWords.add(normalizedWord);
            newBookWords.add(normalizedWord);
            
            // 添加别名到缓存
            if (def.aliases && def.aliases.length > 0) {
                for (const alias of def.aliases) {
                    const normalizedAlias = alias.toLowerCase().trim();
                    this.wordDefinitionCache.set(normalizedAlias, def);
                    newAllWords.add(normalizedAlias);
                    newBookWords.add(normalizedAlias);
                }
            }
        }
        
        // 更新缓存
        this.allWordsCache = [...newAllWords];
        this.bookWordsCache.set(bookPath, [...newBookWords]);
    }
    
    /**
     * 更新 Canvas 文件中的词汇 - 增量更新优化版本
     */
    async updateWordInCanvas(bookPath: string, nodeId: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        try {
            // 1. 先更新Canvas文件
            const success = await this.canvasEditor.updateWordInCanvas(bookPath, nodeId, word, definition, color, aliases);
            
            if (success) {
                // 2. 创建更新后的词汇定义
                const updatedWordDef: WordDefinition = {
                    word,
                    definition,
                    source: bookPath,
                    nodeId, // 使用原有的nodeId
                    color: color ? this.getColorString(color) : undefined,
                    aliases: aliases?.filter(alias => alias && alias.trim().length > 0)
                };
                
                // 3. 立即更新内存缓存
                this.updateWordInMemoryCache(bookPath, nodeId, updatedWordDef);
                
                // 4. 重建缓存以立即生效
                this.rebuildCache();
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to update word in canvas:', error);
            return false;
        }
    }
    
    // ==================== 增量更新优化方法 ====================
    
    /**
     * 生成临时节点ID
     */
    private generateTempNodeId(): string {
        return `temp_${Date.now()}_${++this.tempNodeIdCounter}`;
    }
    
    /**
     * 获取颜色字符串
     * Canvas 使用数字字符串作为颜色标识，不是具体的色值
     */
    private getColorString(color: number): string | undefined {
        // Canvas 中的颜色就是数字字符串 "1", "2", "3" 等
        // 具体的颜色映射由 color-utils.ts 中的 mapCanvasColorToCSSVar 处理
        return (color >= 1 && color <= 6) ? color.toString() : undefined;
    }
    
    /**
     * 将词汇添加到内存缓存
     */
    private addWordToMemoryCache(bookPath: string, wordDef: WordDefinition): void {
        // 获取该书本的现有词汇
        let bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            bookWords = [];
            this.definitions.set(bookPath, bookWords);
        }
        
        // 检查是否已存在（避免重复）
        const existingIndex = bookWords.findIndex(w => w.word === wordDef.word);
        if (existingIndex >= 0) {
            bookWords[existingIndex] = wordDef; // 更新
        } else {
            bookWords.push(wordDef); // 新增
        }
        
        // 更新单词缓存
        this.wordDefinitionCache.set(wordDef.word, wordDef);
        if (wordDef.aliases) {
            wordDef.aliases.forEach(alias => {
                this.wordDefinitionCache.set(alias, wordDef);
            });
        }
        
        // 标记缓存需要重建
        this.cacheValid = false;
    }
    
    /**
     * 更新内存缓存中的词汇（用于编辑功能）
     */
    private updateWordInMemoryCache(bookPath: string, nodeId: string, updatedWordDef: WordDefinition): void {
        // 获取该书本的现有词汇
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`);
            return;
        }
        
        // 根据nodeId查找要更新的词汇
        const existingIndex = bookWords.findIndex(w => w.nodeId === nodeId);
        if (existingIndex >= 0) {
            const oldWordDef = bookWords[existingIndex];
            
            // 清除旧的缓存映射
            this.wordDefinitionCache.delete(oldWordDef.word);
            if (oldWordDef.aliases) {
                oldWordDef.aliases.forEach(alias => {
                    this.wordDefinitionCache.delete(alias);
                });
            }
            
            // 更新词汇
            bookWords[existingIndex] = updatedWordDef;
            
            // 更新新的缓存映射
            this.wordDefinitionCache.set(updatedWordDef.word, updatedWordDef);
            if (updatedWordDef.aliases) {
                updatedWordDef.aliases.forEach(alias => {
                    this.wordDefinitionCache.set(alias, updatedWordDef);
                });
            }
            
            // 标记缓存需要重建
            this.cacheValid = false;
        } else {
            console.warn(`未找到节点ID: ${nodeId}`);
        }
    }
    
    /**
     * 调度Canvas文件同步
     */
    private scheduleCanvasSync(bookPath: string, wordDef: WordDefinition): void {
        // 清除之前的定时器
        const existingTimeout = this.syncTimeouts.get(bookPath);
        if (existingTimeout) {
            window.clearTimeout(existingTimeout);
        }
        
        // 添加到待同步队列
        if (!this.pendingSyncWords.has(bookPath)) {
            this.pendingSyncWords.set(bookPath, []);
        }
        this.pendingSyncWords.get(bookPath)!.push(wordDef);
        
        // 设置新的定时器（延迟1秒批量同步）
        const timeout = window.setTimeout(() => {
            this.syncPendingWords(bookPath);
        }, 1000);
        
        this.syncTimeouts.set(bookPath, timeout);
    }
    
    /**
     * 同步待处理的词汇到Canvas文件
     */
    private async syncPendingWords(bookPath: string): Promise<void> {
        const pendingWords = this.pendingSyncWords.get(bookPath);
        if (!pendingWords || pendingWords.length === 0) return;
        
        try {
            // 批量写入Canvas
            for (const wordDef of pendingWords) {
                const generatedNodeId = await this.canvasEditor.addWordToCanvas(
                    bookPath,
                    wordDef.word,
                    wordDef.definition,
                    wordDef.color ? this.getColorNumber(wordDef.color) : undefined,
                    wordDef.aliases
                );
                
                if (generatedNodeId) {
                    // 成功写入文件，更新为 Canvas 文件中实际生成的 nodeId
                    wordDef.nodeId = generatedNodeId;
                }
            }
            
            // 清空待同步队列和定时器
            this.pendingSyncWords.delete(bookPath);
            this.syncTimeouts.delete(bookPath);
            

            
        } catch (error) {
            console.error('Failed to sync words to canvas:', error);
            // 可以考虑重试机制或用户通知
        }
    }
    
    /**
     * 将颜色字符串转换为数字
     * Canvas 使用数字字符串作为颜色标识，不是具体的色值
     */
    private getColorNumber(colorString: string): number {
        // 直接将字符串转换为数字
        const colorNum = parseInt(colorString, 10);
        // 验证是否为有效的 Canvas 颜色数字 (1-6)
        return (colorNum >= 1 && colorNum <= 6) ? colorNum : 0;
    }

    /**
     * 从Canvas文件中删除词汇
     * @param bookPath 生词本路径
     * @param nodeId 要删除的节点ID
     * @returns 操作是否成功
     */
    async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            // 1. 先从Canvas文件中删除
            const success = await this.canvasEditor.deleteWordFromCanvas(bookPath, nodeId);
            
            if (success) {
                // 2. 从内存缓存中删除
                this.deleteWordFromMemoryCache(bookPath, nodeId);
                
                // 3. 重建缓存以立即生效
                this.rebuildCache();
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Failed to delete word from canvas:', error);
            return false;
        }
    }

    /**
     * 从内存缓存中删除词汇（用于删除功能）
     */
    private deleteWordFromMemoryCache(bookPath: string, nodeId: string): void {
        // 获取该书本的现有词汇
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) {
            console.warn(`未找到书本: ${bookPath}`);
            return;
        }
        
        // 根据nodeId查找要删除的词汇
        const existingIndex = bookWords.findIndex(w => w.nodeId === nodeId);
        if (existingIndex >= 0) {
            const wordDefToDelete = bookWords[existingIndex];
            
            // 清除缓存映射
            this.wordDefinitionCache.delete(wordDefToDelete.word);
            if (wordDefToDelete.aliases) {
                wordDefToDelete.aliases.forEach(alias => {
                    this.wordDefinitionCache.delete(alias);
                });
            }
            
            // 从数组中删除词汇
            bookWords.splice(existingIndex, 1);
            
            // 从仅内存词汇中删除（如果存在）
            const memoryWords = this.memoryOnlyWords.get(bookPath);
            if (memoryWords) {
                const memoryIndex = memoryWords.findIndex(w => w.nodeId === nodeId);
                if (memoryIndex >= 0) {
                    memoryWords.splice(memoryIndex, 1);
                    if (memoryWords.length === 0) {
                        this.memoryOnlyWords.delete(bookPath);
                    }
                }
            }
            
            // 标记缓存需要重建
            this.cacheValid = false;
        } else {
            console.warn(`未找到节点ID: ${nodeId}`);
        }
    }
    
    /**
     * 清理资源
     */
    destroy(): void {
        // 清理所有定时器
        this.syncTimeouts.forEach(timeout => window.clearTimeout(timeout));
        this.syncTimeouts.clear();
        
        // 清理缓存
        this.definitions.clear();
        this.wordDefinitionCache.clear();
        this.allWordsCache = [];
        this.bookWordsCache.clear();
        this.memoryOnlyWords.clear();
        this.pendingSyncWords.clear();
    }

    // ==================== 已掌握功能支持方法 ====================

    /**
     * 根据节点ID获取单词定义
     * @param bookPath 生词本路径
     * @param nodeId 节点ID
     * @returns 单词定义或null
     */
    async getWordDefinitionByNodeId(bookPath: string, nodeId: string): Promise<WordDefinition | null> {
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) return null;

        const wordDef = bookWords.find(w => w.nodeId === nodeId);
        return wordDef || null;
    }

    /**
     * 更新单词定义
     * @param bookPath 生词本路径
     * @param nodeId 节点ID
     * @param updatedDef 更新后的定义
     * @returns 操作是否成功
     */
    async updateWordDefinition(bookPath: string, nodeId: string, updatedDef: WordDefinition): Promise<boolean> {
        const bookWords = this.definitions.get(bookPath);
        if (!bookWords) return false;

        const index = bookWords.findIndex(w => w.nodeId === nodeId);
        if (index === -1) return false;

        const oldDef = bookWords[index];
        
        // 更新定义
        bookWords[index] = updatedDef;

        // 更新缓存
        this.wordDefinitionCache.delete(oldDef.word);
        if (oldDef.aliases) {
            oldDef.aliases.forEach(alias => this.wordDefinitionCache.delete(alias));
        }
        
        this.wordDefinitionCache.set(updatedDef.word, updatedDef);
        if (updatedDef.aliases) {
            updatedDef.aliases.forEach(alias => this.wordDefinitionCache.set(alias, updatedDef));
        }

        // 标记缓存需要重建
        this.cacheValid = false;

        // 保存到 Canvas 文件
        try {
            await this.saveWordDefinitionToCanvas(bookPath, nodeId, updatedDef);
        } catch (error) {
            console.error('保存单词定义到 Canvas 失败:', error);
            // 不返回 false，因为内存更新已经成功
        }

        return true;
    }

    /**
     * 保存单词定义到 Canvas 文件
     * @param bookPath 生词本路径
     * @param nodeId 节点 ID
     * @param wordDef 单词定义
     */
    private async saveWordDefinitionToCanvas(bookPath: string, nodeId: string, wordDef: WordDefinition): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(bookPath);
        if (!(file instanceof TFile)) {
            throw new Error(`Canvas 文件不存在: ${bookPath}`);
        }

        try {
            // 使用 Vault.process 修改文件
            await this.app.vault.process(file, (content) => {
                const canvasData = JSON.parse(content);
                
                // 找到要更新的节点
                const node = canvasData.nodes.find((n: any) => n.id === wordDef.nodeId);
                if (!node) {
                    throw new Error(`找不到节点 ID: ${wordDef.nodeId}`);
                }
                
                // 构建纯文本内容，不包含 frontmatter
                let textContent = wordDef.word;
                
                // 添加别名（如果有）- 使用斜体格式
                if (wordDef.aliases && wordDef.aliases.length > 0) {
                    textContent += `\n*${wordDef.aliases.join(', ')}*`;
                }
                
                // 添加定义
                if (wordDef.definition) {
                    textContent += '\n' + wordDef.definition;
                }
                
                // 更新节点内容
                node.text = textContent;
                
                // 返回更新后的内容
                return JSON.stringify(canvasData);
            });
        } catch (error) {
            console.error('保存 Canvas 文件失败:', error);
            throw error;
        }
    }

    /**
     * 获取所有单词定义
     * @returns 所有单词定义数组
     */
    async getAllWordDefinitions(): Promise<WordDefinition[]> {
        const allDefs: WordDefinition[] = [];
        
        for (const bookWords of this.definitions.values()) {
            allDefs.push(...bookWords);
        }
        
        // 也包括仅内存中的词汇
        for (const memoryWords of this.memoryOnlyWords.values()) {
            allDefs.push(...memoryWords);
        }
        
        return allDefs;
    }

    /**
     * 获取指定生词本的所有单词定义
     * @param bookPath 生词本路径
     * @returns 该生词本的所有单词定义
     */
    async getWordDefinitionsByBook(bookPath: string): Promise<WordDefinition[]> {
        const bookWords = this.definitions.get(bookPath) || [];
        const memoryWords = this.memoryOnlyWords.get(bookPath) || [];
        
        return [...bookWords, ...memoryWords];
    }

    /**
     * 获取未掌握的单词列表（用于高亮过滤）
     * @returns 未掌握的单词数组
     */
    async getUnmasteredWords(): Promise<string[]> {
        if (!this.cacheValid) {
            this.rebuildCache();
        }
        
        // 从缓存中过滤出未掌握的单词
        const unmasteredWords: string[] = [];
        
        for (const word of this.allWordsCache) {
            const wordDef = this.wordDefinitionCache.get(word);
            if (wordDef && !wordDef.mastered) {
                unmasteredWords.push(word);
            }
        }
        
        return unmasteredWords;
    }

    /**
     * 获取已掌握的单词列表
     * @returns 已掌握的单词数组
     */
    async getMasteredWords(): Promise<string[]> {
        if (!this.cacheValid) {
            this.rebuildCache();
        }
        
        // 从缓存中过滤出已掌握的单词
        const masteredWords: string[] = [];
        
        for (const word of this.allWordsCache) {
            const wordDef = this.wordDefinitionCache.get(word);
            if (wordDef && wordDef.mastered) {
                masteredWords.push(word);
            }
        }
        
        return masteredWords;
    }

    /**
     * 检查单词是否已掌握
     * @param word 单词
     * @returns 是否已掌握
     */
    isWordMastered(word: string): boolean {
        const wordDef = this.wordDefinitionCache.get(word.toLowerCase());
        return wordDef?.mastered === true;
    }
}
