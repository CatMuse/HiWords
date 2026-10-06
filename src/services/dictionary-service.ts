import { AIClient } from './ai-client';
import { t } from '../i18n';
import type { AIServiceSettings } from '../utils';

interface AIConfig {
    service: AIServiceSettings;
    apiKey: string;
    prompt: string;
    maxTokens?: number;
}

/**
 * 缓存条目
 */
interface CacheEntry {
    content: string;
    timestamp: number;
}

/**
 * 词典服务 - 使用 AI API（支持多种格式）
 */
export class DictionaryService {
    private config: AIConfig;
    private cache = new Map<string, CacheEntry>();
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
    constructor(config: AIConfig) {
        this.config = config;
    }

    /**
     * 验证 AI 配置是否有效
     */
    private validateConfig(): { isValid: boolean; error?: string } {
        if (!this.config.service.apiUrl?.trim()) {
            return { isValid: false, error: t('ai_errors.api_url_required') };
        }
        
        if (!this.config.apiKey.trim()) {
            return { isValid: false, error: t('ai_errors.api_key_not_configured') };
        }
        
        if (!this.config.service.model?.trim()) {
            return { isValid: false, error: t('ai_errors.model_required') };
        }
        
        if (!this.config.prompt?.trim()) {
            return { isValid: false, error: t('ai_errors.prompt_required') };
        }
        
        // 验证 URL 格式
        try {
            new URL(this.config.service.apiUrl);
        } catch {
            return { isValid: false, error: t('ai_errors.invalid_api_url') };
        }
        
        // 验证 prompt 包含必要的占位符
        if (!this.config.prompt.includes('{{word}}')) {
            return { isValid: false, error: t('ai_errors.prompt_missing_word_placeholder') };
        }
        
        return { isValid: true };
    }

    /**
     * 替换 prompt 中的占位符
     */
    private replacePlaceholders(word: string, sentence?: string): string {
        return this.config.prompt
            .replace(/\{\{word\}\}/g, word)
            .replace(/\{\{sentence\}\}/g, sentence || '');
    }

    /**
     * 获取单词释义
     * @param word 要查询的单词
     * @param sentence 单词所在的句子（可选）
     * @returns 释义文本
     */
    async fetchDefinition(word: string, sentence?: string): Promise<string> {
        // 参数验证
        if (!word?.trim()) {
            throw new Error(t('ai_errors.word_empty'));
        }

        // 配置验证
        const validation = this.validateConfig();
        if (!validation.isValid) {
            throw new Error(validation.error ?? t('ai_errors.request_failed'));
        }

        const cleanWord = word.trim();
        const cacheKey = `${cleanWord}:${sentence || ''}`;

        // 检查缓存
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.content;
        }

        const content = await new AIClient(this.config.service, this.config.apiKey)
            .generate(this.replacePlaceholders(cleanWord, sentence), this.config.maxTokens || 500);
        this.cache.set(cacheKey, { content, timestamp: Date.now() });
        return content;
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存统计
     */
    getCacheStats(): { size: number; oldestEntry: number | null } {
        let oldestTimestamp: number | null = null;
        
        for (const entry of this.cache.values()) {
            if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
            }
        }

        return {
            size: this.cache.size,
            oldestEntry: oldestTimestamp
        };
    }

}
