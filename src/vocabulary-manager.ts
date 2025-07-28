import { App, TFile } from 'obsidian';
import { WordDefinition, VocabularyBook, HiWordsSettings } from './types';
import { CanvasParser } from './canvas-parser';
import { CanvasEditor } from './canvas-editor';

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

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.canvasParser = new CanvasParser(app);
        this.canvasEditor = new CanvasEditor(app);
        this.settings = settings;
        
        // 性能监控
        console.log("VocabularyManager 初始化");
    }

    /**
     * 加载所有启用的生词本
     */
    async loadAllVocabularyBooks(): Promise<void> {
        const startTime = performance.now();
        
        this.definitions.clear();
        this.invalidateCache();
        
        const loadPromises = this.settings.vocabularyBooks
            .filter(book => book.enabled)
            .map(book => this.loadVocabularyBook(book));
            
        await Promise.all(loadPromises);
        
        // 重建缓存
        this.rebuildCache();
        
        const endTime = performance.now();
        console.log(`加载所有词汇本耗时: ${(endTime - startTime).toFixed(2)}ms`);
    }

    /**
     * 加载单个生词本
     */
    async loadVocabularyBook(book: VocabularyBook): Promise<void> {
        const startTime = performance.now();
        
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
            
            // 使缓存失效
            this.invalidateCache();
            
            const endTime = performance.now();
            console.log(`加载词汇本 ${book.name} 耗时: ${(endTime - startTime).toFixed(2)}ms，单词数量: ${definitions.length}`);
        } catch (error) {
            console.error(`Failed to load vocabulary book ${book.name}:`, error);
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
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings): void {
        this.settings = settings;
        // 设置变更可能影响词汇，使缓存失效
        this.invalidateCache();
    }

    /**
     * 获取统计信息
     */
    getStats(): { totalBooks: number; enabledBooks: number; totalWords: number } {
        const totalBooks = this.settings.vocabularyBooks.length;
        const enabledBooks = this.settings.vocabularyBooks.filter(b => b.enabled).length;
        const totalWords = this.getAllWords().length;
        
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
     * 代理到 CanvasEditor 的方法
     * @param bookPath Canvas 文件路径
     * @param word 要添加的词汇
     * @param definition 词汇定义
     * @param color 可选的节点颜色
     * @param aliases 可选的词汇别名数组
     */
    async addWordToCanvas(bookPath: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        const success = await this.canvasEditor.addWordToCanvas(bookPath, word, definition, color, aliases);
        
        if (success) {
            // 如果添加成功，重新加载生词本
            await this.reloadVocabularyBook(bookPath);
            // 使缓存失效
            this.invalidateCache();
        }
        
        return success;
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
        const startTime = performance.now();
        
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
        
        const endTime = performance.now();
        console.log(`重建缓存耗时: ${(endTime - startTime).toFixed(2)}ms，单词总数: ${this.allWordsCache.length}`);
    }
    
    /**
     * 更新 Canvas 文件中的词汇
     * 代理到 CanvasEditor 的方法
     * @param bookPath Canvas 文件路径
     * @param nodeId 要更新的节点ID
     * @param word 词汇
     * @param definition 词汇定义
     * @param color 可选的节点颜色
     * @param aliases 可选的词汇别名数组
     */
    async updateWordInCanvas(bookPath: string, nodeId: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        const success = await this.canvasEditor.updateWordInCanvas(bookPath, nodeId, word, definition, color, aliases);
        
        if (success) {
            // 如果更新成功，重新加载生词本
            await this.reloadVocabularyBook(bookPath);
        }
        
        return success;
    }
}
