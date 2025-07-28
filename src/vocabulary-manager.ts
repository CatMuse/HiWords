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

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.canvasParser = new CanvasParser(app);
        this.canvasEditor = new CanvasEditor(app);
        this.settings = settings;
    }

    /**
     * 加载所有启用的生词本
     */
    async loadAllVocabularyBooks(): Promise<void> {
        this.definitions.clear();
        
        for (const book of this.settings.vocabularyBooks) {
            if (book.enabled) {
                await this.loadVocabularyBook(book);
            }
        }
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

        for (const definitions of this.definitions.values()) {
            // 先检查主单词
            const foundByMainWord = definitions.find(def => def.word === normalizedWord);
            if (foundByMainWord) {
                return foundByMainWord;
            }

            // 再检查别名
            const foundByAlias = definitions.find(def => 
                def.aliases && def.aliases.includes(normalizedWord)
            );
            if (foundByAlias) {
                return foundByAlias;
            }
        }

        return null;
    }

    /**
     * 获取所有词汇，包括别名
     */
    getAllWords(): string[] {
        const words: string[] = [];
        
        for (const definitions of this.definitions.values()) {
            // 添加主单词
            words.push(...definitions.map(def => def.word));
            
            // 添加别名
            definitions.forEach(def => {
                if (def.aliases && def.aliases.length > 0) {
                    words.push(...def.aliases);
                }
            });
        }
        
        return [...new Set(words)]; // 去重
    }

    /**
     * 获取指定生词本的词汇，包括别名
     */
    getWordsFromBook(bookPath: string): string[] {
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
        
        return [...new Set(words)]; // 去重
    }

    /**
     * 重新加载指定的生词本
     */
    async reloadVocabularyBook(bookPath: string): Promise<void> {
        const book = this.settings.vocabularyBooks.find(b => b.path === bookPath);
        if (book && book.enabled) {
            await this.loadVocabularyBook(book);
        }
    }

    /**
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings): void {
        this.settings = settings;
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
        return this.getDefinition(word) !== null;
    }

    /**
     * 清除所有数据
     */
    clear(): void {
        this.definitions.clear();
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
        }
        
        return success;
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
