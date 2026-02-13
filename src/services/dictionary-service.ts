import { requestUrl } from 'obsidian';
import { t } from '../i18n';

interface AIConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
}

type APIType = 'openai' | 'claude' | 'gemini';

/**
 * API 配置接口
 */
interface APIAdapter {
    buildRequest: (model: string, prompt: string, stream?: boolean) => any;
    buildHeaders: (apiKey: string) => Record<string, string>;
    extractResponse: (data: any) => string | undefined;
    extractStreamContent?: (line: string) => string | null;
    buildUrl?: (baseUrl: string, model: string, apiKey: string) => string;
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
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000;
    private readonly MAX_RETRIES = 3;

    /**
     * API 适配器配置表
     */
    private readonly API_ADAPTERS: Record<APIType, APIAdapter> = {
        openai: {
            buildRequest: (model: string, prompt: string, stream: boolean = false) => ({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500,
                ...(stream && { stream: true })
            }),
            buildHeaders: (apiKey: string) => ({
                'Authorization': `Bearer ${apiKey}`
            }),
            extractResponse: (data: any) => data?.choices?.[0]?.message?.content,
            extractStreamContent: (line: string) => {
                if (!line.startsWith('data: ')) return null;
                const data = line.slice(6);
                if (data === '[DONE]') return null;
                
                try {
                    const parsed = JSON.parse(data);
                    return parsed.choices?.[0]?.delta?.content || null;
                } catch {
                    return null;
                }
            }
        },
        claude: {
            buildRequest: (model: string, prompt: string, stream: boolean = false) => ({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1024,
                ...(stream && { stream: true })
            }),
            buildHeaders: (apiKey: string) => ({
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }),
            extractResponse: (data: any) => data?.content?.[0]?.text,
            extractStreamContent: (line: string) => {
                if (!line.startsWith('data: ')) return null;
                const data = line.slice(6);
                
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'content_block_delta') {
                        return parsed.delta?.text || null;
                    }
                    return null;
                } catch {
                    return null;
                }
            }
        },
        gemini: {
            buildRequest: (model: string, prompt: string, stream: boolean = false) => ({
                contents: [{ parts: [{ text: prompt }] }]
            }),
            buildHeaders: () => ({}),
            extractResponse: (data: any) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
            extractStreamContent: (line: string) => {
                try {
                    const parsed = JSON.parse(line);
                    return parsed.candidates?.[0]?.content?.parts?.[0]?.text || null;
                } catch {
                    return null;
                }
            },
            buildUrl: (baseUrl: string, model: string, apiKey: string) => {
                let url = baseUrl;
                if (!url.includes(':generateContent') && !url.includes(':streamGenerateContent')) {
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
        const url = this.config.apiUrl.toLowerCase();
        
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
     * 验证 AI 配置是否有效（可选验证 prompt 占位符）
     */
    private validateConfig(requireWordPlaceholder: boolean = true): { isValid: boolean; error?: string } {
        if (!this.config.apiUrl?.trim()) {
            return { isValid: false, error: t('ai_errors.api_url_required') };
        }
        
        if (!this.config.apiKey?.trim()) {
            return { isValid: false, error: t('ai_errors.api_key_not_configured') };
        }
        
        if (!this.config.model?.trim()) {
            return { isValid: false, error: t('ai_errors.model_required') };
        }
        
        if (!this.config.prompt?.trim()) {
            return { isValid: false, error: t('ai_errors.prompt_required') };
        }
        
        // 验证 URL 格式
        try {
            new URL(this.config.apiUrl);
        } catch {
            return { isValid: false, error: t('ai_errors.invalid_api_url') };
        }
        
        // 验证 prompt 包含必要的占位符（可选）
        if (requireWordPlaceholder && !this.config.prompt.includes('{{word}}')) {
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
     * 通用 AI 请求方法（供其他服务复用）
     * @param prompt 完整的提示词
     * @param cacheKey 缓存键（可选，不传则不使用缓存）
     * @param useCache 是否使用缓存（默认 true）
     * @returns AI 响应内容
     */
    async makeAIRequestStream(
        prompt: string,
        onChunk: (content: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        const validation = this.validateConfig(false);
        if (!validation.isValid) {
            onError(new Error(validation.error!));
            return;
        }

        const apiType = this.detectAPIType();
        const adapter = this.API_ADAPTERS[apiType];

        if (!adapter.extractStreamContent) {
            onError(new Error('Streaming not supported for this API type'));
            return;
        }

        let url = this.config.apiUrl;
        if (adapter.buildUrl) {
            url = adapter.buildUrl(this.config.apiUrl, this.config.model, this.config.apiKey);
            if (apiType === 'gemini' && !url.includes(':streamGenerateContent')) {
                url = url.replace(':generateContent', ':streamGenerateContent');
                if (!url.includes('alt=sse')) {
                    url += (url.includes('?') ? '&' : '?') + 'alt=sse';
                }
            }
        }

        const headers = adapter.buildHeaders(this.config.apiKey);
        const body = adapter.buildRequest(this.config.model, prompt, true);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    onComplete();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    const content = adapter.extractStreamContent!(trimmedLine);
                    if (content) {
                        onChunk(content);
                    }
                }
            }
        } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    async makeAIRequest(prompt: string, cacheKey?: string, useCache: boolean = true): Promise<string> {
        // 配置验证（不要求 prompt 占位符）
        const validation = this.validateConfig(false);
        if (!validation.isValid) {
            throw new Error(validation.error!);
        }

        // 检查缓存
        if (useCache && cacheKey) {
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.content;
            }
        }

        try {
            // 检测 API 类型并获取适配器
            const apiType = this.detectAPIType();
            const adapter = this.API_ADAPTERS[apiType];

            // 构建请求参数
            const url = adapter.buildUrl 
                ? adapter.buildUrl(this.config.apiUrl, this.config.model, this.config.apiKey)
                : this.config.apiUrl;
            const headers = adapter.buildHeaders(this.config.apiKey);
            const body = adapter.buildRequest(this.config.model, prompt);

            // 发送请求(带重试)
            const data = await this.makeRequestWithRetry(url, headers, body);
            
            // 提取响应内容
            const content = adapter.extractResponse(data);
            if (!content) {
                throw new Error(t('ai_errors.invalid_response'));
            }

            const result = content.trim();
            
            // 存入缓存
            if (useCache && cacheKey) {
                this.cache.set(cacheKey, { content: result, timestamp: Date.now() });
            }
            
            return result;
        } catch (error) {
            throw this.handleError(error);
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
        const validation = this.validateConfig(true);
        if (!validation.isValid) {
            throw new Error(validation.error!);
        }

        const cleanWord = word.trim();
        const prompt = this.replacePlaceholders(cleanWord, sentence);
        const cacheKey = `${cleanWord}:${sentence || ''}`;

        return this.makeAIRequest(prompt, cacheKey, true);
    }

    /**
     * 发送 HTTP 请求(带重试)
     */
    private async makeRequestWithRetry(
        url: string,
        headers: Record<string, string>,
        body: any
    ): Promise<any> {
        let lastError: any;

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
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * 错误处理 - 转换为用户友好的错误信息
     */
    private handleError(error: any): Error {
        const message = error?.message || String(error);
        
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
