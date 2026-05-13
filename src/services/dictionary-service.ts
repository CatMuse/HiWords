import { requestUrl } from 'obsidian';
import { t } from '../i18n';
import type { AIProvider, AIServiceSettings } from '../utils';

interface AIConfig {
    service: AIServiceSettings;
    prompt: string;
}

type APIType = 'openai' | 'claude' | 'gemini';
type JsonObject = Record<string, unknown>;
type JsonPath = Array<string | number>;

/**
 * API 配置接口
 */
interface APIAdapter {
    buildRequest: (model: string, prompt: string) => JsonObject;
    buildHeaders: (apiKey: string) => Record<string, string>;
    extractResponse: (data: unknown) => string | undefined;
    buildUrl?: (baseUrl: string, model: string, apiKey: string) => string;
}

function readStringPath(data: unknown, path: JsonPath): string | undefined {
    let current = data;
    for (const segment of path) {
        if (typeof segment === 'number') {
            if (!Array.isArray(current)) return undefined;
            current = current[segment];
            continue;
        }
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return typeof current === 'string' ? current : undefined;
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
    private readonly MAX_RETRIES = 3;

    /**
     * API 适配器配置表
     */
    private readonly API_ADAPTERS: Record<APIType, APIAdapter> = {
        openai: {
            buildRequest: (model: string, prompt: string) => ({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500
            }),
            buildHeaders: (apiKey: string) => ({
                'Authorization': `Bearer ${apiKey}`
            }),
            extractResponse: (data: unknown) => readStringPath(data, ['choices', 0, 'message', 'content']),
            buildUrl: (baseUrl: string) => {
                const normalized = baseUrl.replace(/\/$/, '');
                if (normalized.endsWith('/chat/completions')) {
                    return normalized;
                }
                return `${normalized}/chat/completions`;
            }
        },
        claude: {
            buildRequest: (model: string, prompt: string) => ({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1024
            }),
            buildHeaders: (apiKey: string) => ({
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }),
            extractResponse: (data: unknown) => readStringPath(data, ['content', 0, 'text']),
            buildUrl: (baseUrl: string) => {
                const normalized = baseUrl.replace(/\/$/, '');
                if (normalized.endsWith('/messages')) {
                    return normalized;
                }
                return `${normalized}/v1/messages`;
            }
        },
        gemini: {
            buildRequest: (model: string, prompt: string) => ({
                contents: [{ parts: [{ text: prompt }] }]
            }),
            buildHeaders: () => ({}),
            extractResponse: (data: unknown) => readStringPath(data, ['candidates', 0, 'content', 'parts', 0, 'text']),
            buildUrl: (baseUrl: string, model: string, apiKey: string) => {
                let url = baseUrl;
                if (!url.includes(':generateContent')) {
                    url = `${url.replace(/\/$/, '')}/models/${model}:generateContent`;
                }
                return `${url}?key=${apiKey}`;
            }
        }
    };

    constructor(config: AIConfig) {
        this.config = config;
    }

    /**
     * 自动检测 API 类型
     */
    private detectAPIType(): APIType {
        if (this.config.service.provider !== 'custom') {
            const providerMap: Record<Exclude<AIProvider, 'custom'>, APIType> = {
                'openai-compatible': 'openai',
                anthropic: 'claude',
                gemini: 'gemini'
            };
            return providerMap[this.config.service.provider];
        }

        const url = this.config.service.apiUrl.toLowerCase();
        
        if (url.includes('anthropic')) {
            return 'claude';
        }
        
        if (url.includes('googleapis') || url.includes('generativelanguage')) {
            return 'gemini';
        }
        
        // 默认使用 OpenAI 兼容格式（支持大部分 API）
        return 'openai';
    }

    /**
     * 验证 AI 配置是否有效
     */
    private validateConfig(): { isValid: boolean; error?: string } {
        if (!this.config.service.apiUrl?.trim()) {
            return { isValid: false, error: t('ai_errors.api_url_required') };
        }
        
        if (!this.config.service.apiKey?.trim()) {
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
     * 检查值是否为对象（非数组、非 null）
     */
    private isObject(item: unknown): item is JsonObject {
        return !!item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * 深度合并两个对象
     * @param target 目标对象
     * @param source 源对象
     */
    private deepMerge(target: JsonObject, source: JsonObject): JsonObject {
        const output = { ...target };

        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                const sourceValue = source[key];
                const targetValue = target[key];
                if (this.isObject(sourceValue)) {
                    if (!(key in target) || !this.isObject(targetValue)) {
                        Object.assign(output, { [key]: sourceValue });
                    } else {
                        output[key] = this.deepMerge(targetValue, sourceValue);
                    }
                } else {
                    Object.assign(output, { [key]: sourceValue });
                }
            });
        }

        return output;
    }

    /**
     * 合并用户自定义的额外参数到请求体
     */
    private mergeExtraParams(baseBody: JsonObject): JsonObject {
        const extraParamsJson = this.config.service.extraParams?.trim();

        if (!extraParamsJson || extraParamsJson === '{}' || extraParamsJson === '') {
            return baseBody;
        }

        try {
            const extraParams = JSON.parse(extraParamsJson) as unknown;
            if (!this.isObject(extraParams)) return baseBody;
            return this.deepMerge(baseBody, extraParams);
        } catch (error) {
            console.warn('Invalid JSON in extraParams, ignoring:', error);
            return baseBody;
        }
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

        try {
            // 检测 API 类型并获取适配器
            const apiType = this.detectAPIType();
            const adapter = this.API_ADAPTERS[apiType];
            const prompt = this.replacePlaceholders(cleanWord, sentence);

            // 构建请求参数
            const url = adapter.buildUrl
                ? adapter.buildUrl(this.config.service.apiUrl, this.config.service.model, this.config.service.apiKey)
                : this.config.service.apiUrl;
            const headers = adapter.buildHeaders(this.config.service.apiKey);
            let body = adapter.buildRequest(this.config.service.model, prompt);

            // 合并额外参数
            body = this.mergeExtraParams(body);

            // 发送请求(带重试)
            const data = await this.makeRequestWithRetry(url, headers, body);
            
            // 提取响应内容
            const content = adapter.extractResponse(data);
            if (!content) {
                throw new Error(t('ai_errors.invalid_response'));
            }

            const result = content.trim();
            
            // 存入缓存
            this.cache.set(cacheKey, { content: result, timestamp: Date.now() });
            
            return result;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 发送 HTTP 请求(带重试)
     */
    private async makeRequestWithRetry(
        url: string,
        headers: Record<string, string>,
        body: JsonObject
    ): Promise<unknown> {
        let lastError: unknown;

        for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
            try {
                const response = await requestUrl({
                    url,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers
                    },
                    body: JSON.stringify(body)
                });

                if (response.status >= 400) {
                    throw new Error(`HTTP ${response.status}: ${response.text}`);
                }

                return response.json;
            } catch (error) {
                lastError = error;
                
                // 如果是客户端错误(4xx),不重试
                const errorMsg = String(error);
                if (errorMsg.includes('400') || errorMsg.includes('401') || 
                    errorMsg.includes('403') || errorMsg.includes('404')) {
                    break;
                }

                // 最后一次尝试,不等待
                if (attempt < this.MAX_RETRIES - 1) {
                    // 指数退避: 1s, 2s, 4s
                    const delay = 1000 * Math.pow(2, attempt);
                    await new Promise(resolve => activeWindow.setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * 错误处理 - 转换为用户友好的错误信息
     */
    private handleError(error: unknown): Error {
        const message = error instanceof Error ? error.message : String(error);
        
        // API Key 相关错误
        if (message.includes('401') || message.includes('403')) {
            return new Error(t('ai_errors.api_key_invalid'));
        }
        
        // 速率限制
        if (message.includes('429')) {
            return new Error(t('ai_errors.rate_limit'));
        }
        
        // 服务器错误
        if (message.includes('500') || message.includes('502') || 
            message.includes('503') || message.includes('504')) {
            return new Error(t('ai_errors.server_error'));
        }
        
        // 网络错误
        if (message.includes('network') || message.includes('timeout')) {
            return new Error(t('ai_errors.network_error'));
        }
        
        // 其他错误
        console.error('AI Dictionary Error:', error);
        return new Error(`${t('ai_errors.request_failed')}: ${message}`);
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
