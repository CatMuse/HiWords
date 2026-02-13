import { requestUrl } from 'obsidian';
import { t } from '../i18n';
import type { HiWordsSettings } from '../utils';

/**
 * 缓存条目
 */
interface CacheEntry {
    content: string;
    timestamp: number;
}

/**
 * 翻译服务 - 使用 AI 引擎翻译
 */
export class TranslationService {
    private settings: HiWordsSettings;
    private cache = new Map<string, CacheEntry>();
    private readonly CACHE_TTL = 30 * 60 * 1000; // 30 分钟缓存
    private abortController: AbortController | null = null;

    constructor(settings: HiWordsSettings) {
        this.settings = settings;
    }

    /**
     * 更新设置
     */
    updateSettings(settings: HiWordsSettings) {
        this.settings = settings;
    }

    /**
     * 翻译文本
     * @param text 要翻译的文本
     * @returns 翻译结果
     */
    async translate(text: string): Promise<string> {
        if (!text?.trim()) {
            throw new Error(t('translate.text_empty'));
        }

        const cleanText = text.trim();
        const cacheKey = `ai:${cleanText}`;

        // 检查缓存
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.content;
        }

        let result: string;

        result = await this.translateWithAI(cleanText);

        // 存入缓存
        this.cache.set(cacheKey, { content: result, timestamp: Date.now() });

        return result;
    }

    /**
     * 取消正在进行的翻译请求
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * 使用 AI 引擎翻译（复用现有的 AI 配置）
     */
    private async translateWithAI(text: string): Promise<string> {
        const aiConfig = this.settings.aiDictionary;
        if (!aiConfig?.apiUrl || !aiConfig?.apiKey || !aiConfig?.model) {
            throw new Error(t('translate.ai_not_configured'));
        }

        const targetLang = this.settings.translateTargetLang || 'zh-CN';
        const promptTemplate = this.settings.translatePrompt || 
            'Translate the following text to {{to}}. Only return the translation, no explanation.\n\nText: {{text}}';
        
        const prompt = promptTemplate
            .replace(/\{\{text\}\}/g, text)
            .replace(/\{\{to\}\}/g, targetLang);

        // 自动检测 API 类型并构建请求
        const url = aiConfig.apiUrl;
        const apiType = this.detectAPIType(url);

        let requestBody: any;
        let headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let finalUrl = url;

        switch (apiType) {
            case 'claude':
                requestBody = {
                    model: aiConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 1024
                };
                headers['x-api-key'] = aiConfig.apiKey;
                headers['anthropic-version'] = '2023-06-01';
                break;
            case 'gemini':
                requestBody = {
                    contents: [{ parts: [{ text: prompt }] }]
                };
                if (!finalUrl.includes(':generateContent')) {
                    finalUrl = `${finalUrl.replace(/\/$/, '')}/models/${aiConfig.model}:generateContent`;
                }
                finalUrl = `${finalUrl}?key=${aiConfig.apiKey}`;
                break;
            default: // openai
                requestBody = {
                    model: aiConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 500
                };
                headers['Authorization'] = `Bearer ${aiConfig.apiKey}`;
                break;
        }

        const response = await requestUrl({
            url: finalUrl,
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.text}`);
        }

        const data = response.json;
        let content: string | undefined;

        switch (apiType) {
            case 'claude':
                content = data?.content?.[0]?.text;
                break;
            case 'gemini':
                content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                break;
            default:
                content = data?.choices?.[0]?.message?.content;
                break;
        }

        if (!content) {
            throw new Error(t('translate.invalid_response'));
        }

        // 清理 AI 思考过程标签（如 <think>...</think>）
        let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // 如果清理后为空（整个内容都是思考过程），回退到原始内容
        if (!cleaned) {
            cleaned = content.trim();
        }

        return cleaned;
    }

    /**
     * 自动检测 API 类型
     */
    private detectAPIType(url: string): 'openai' | 'claude' | 'gemini' {
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('anthropic')) return 'claude';
        if (lowerUrl.includes('googleapis') || lowerUrl.includes('generativelanguage')) return 'gemini';
        return 'openai';
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
}
