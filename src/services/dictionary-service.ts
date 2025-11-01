import { Notice } from 'obsidian';

/**
 * 词典服务 - 支持多个 API 源
 */
export class DictionaryService {
    private apiTemplate: string;

    constructor(apiTemplate?: string) {
        // 默认使用有道词典 API
        this.apiTemplate = apiTemplate || 'https://dict.youdao.com/suggest?q={{word}}&le=en&doctype=json';
    }

    /**
     * 获取单词释义
     * @param word 要查询的单词
     * @returns 释义文本
     */
    async fetchDefinition(word: string): Promise<string> {
        if (!word || !word.trim()) {
            throw new Error('Word cannot be empty');
        }

        const cleanWord = word.trim().toLowerCase();
        
        // 根据配置的 API 模板选择对应的方法
        if (this.apiTemplate.includes('dict.youdao.com/suggest')) {
            return await this.fetchFromYoudao(cleanWord);
        } else {
            // 自定义 API
            return await this.fetchFromCustomAPI(cleanWord);
        }
    }

    /**
     * 从有道词典 API 获取释义
     */
    private async fetchFromYoudao(word: string): Promise<string> {
        const url = `https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&le=en&doctype=json`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Youdao API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.result?.code !== 200 || !data.data?.entries) {
            throw new Error('No definition found in Youdao');
        }

        const entries = data.data.entries;
        if (entries.length === 0) {
            throw new Error('No definition found');
        }

        // 提取释义
        const definitions: string[] = [];
        
        for (let i = 0; i < Math.min(5, entries.length); i++) {
            const entry = entries[i];
            if (entry.explain) {
                definitions.push(`${i + 1}. ${entry.explain}`);
            }
        }

        if (definitions.length === 0) {
            throw new Error('No valid definitions found');
        }

        return definitions.join('\n');
    }

    /**
     * 从自定义 API 获取释义
     */
    private async fetchFromCustomAPI(word: string): Promise<string> {
        const url = this.apiTemplate.replace('{{word}}', encodeURIComponent(word));
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Custom API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // 尝试从常见的 JSON 结构中提取释义
        if (typeof data === 'string') {
            return data;
        }
        
        // 尝试常见的字段名
        const possibleFields = ['definition', 'meaning', 'translation', 'result', 'data'];
        for (const field of possibleFields) {
            if (data[field]) {
                return typeof data[field] === 'string' ? data[field] : JSON.stringify(data[field], null, 2);
            }
        }
        
        // 如果都找不到，返回整个 JSON
        return JSON.stringify(data, null, 2);
    }

}
