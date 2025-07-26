import { App, TFile } from 'obsidian';
import { WordDefinition, VocabularyBook, HelloWordSettings } from './types';
import { CanvasParser } from './canvas-parser';

export class VocabularyManager {
    private app: App;
    private parser: CanvasParser;
    private definitions: Map<string, WordDefinition[]> = new Map();
    private settings: HelloWordSettings;

    constructor(app: App, settings: HelloWordSettings) {
        this.app = app;
        this.parser = new CanvasParser(app);
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
            const definitions = await this.parser.parseCanvasFile(file);
            
            // 为每个定义设置颜色
            definitions.forEach(def => {
                if (!def.color) {
                    def.color = book.color;
                }
            });
            
            this.definitions.set(book.path, definitions);
            console.log(`Loaded ${definitions.length} words from ${book.name}`);
        } catch (error) {
            console.error(`Failed to load vocabulary book ${book.name}:`, error);
        }
    }

    /**
     * 获取词汇定义
     */
    getDefinition(word: string): WordDefinition | null {
        const normalizedWord = word.toLowerCase().trim();
        
        for (const definitions of this.definitions.values()) {
            const found = definitions.find(def => def.word === normalizedWord);
            if (found) {
                return found;
            }
        }
        
        return null;
    }

    /**
     * 获取所有词汇
     */
    getAllWords(): string[] {
        const words: string[] = [];
        
        for (const definitions of this.definitions.values()) {
            words.push(...definitions.map(def => def.word));
        }
        
        return [...new Set(words)]; // 去重
    }

    /**
     * 获取指定生词本的词汇
     */
    getWordsFromBook(bookPath: string): string[] {
        const definitions = this.definitions.get(bookPath);
        return definitions ? definitions.map(def => def.word) : [];
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
    updateSettings(settings: HelloWordSettings): void {
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
}
