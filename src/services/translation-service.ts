import { buildTranslationPrompt, buildDetailedTranslationPrompt } from './translation-prompt';
import { AIClient } from './ai-client';
import { prepareSelectionText } from '../utils/selection-text';
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
    private readonly getAPIKey: () => string;
    private cache = new Map<string, CacheEntry>();
    private readonly CACHE_TTL = 30 * 60 * 1000; // 30 分钟缓存
    private revision = 0;
    private configKey = '';

    constructor(settings: HiWordsSettings, getAPIKey: () => string) {
        this.settings = settings;
        this.getAPIKey = getAPIKey;
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
    async translate(text: string): Promise<string> { return this.translateCached(text); }

    async translateDetailed(text: string, context = ''): Promise<string> {
        return this.translateCached(text, context.trim().slice(0, 1000));
    }

    private async translateCached(text: string, detailContext?: string): Promise<string> {
        const cleanText = prepareSelectionText(text);
        if (!cleanText) {
            throw new Error(t('translate.text_empty'));
        }

        // Settings are mutated in place; snapshot the effective configuration, including the selected secret value.
        const configKey = JSON.stringify([this.settings.aiService, this.settings.selectionTranslate, this.getAPIKey()]);
        if (configKey !== this.configKey) { this.cache.clear(); this.configKey = configKey; this.revision++; }
        const revision = this.revision;
        const cacheKey = JSON.stringify([detailContext === undefined ? 'simple' : 'detail', cleanText, detailContext]);

        // 检查缓存
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.content;
        }

        const result = await this.translateWithAI(cleanText, detailContext);

        if (revision !== this.revision) throw new Error(t('translate.failed'));
        // 存入缓存
        this.cache.set(cacheKey, { content: result, timestamp: Date.now() });

        return result;
    }

    /**
     * 取消正在进行的翻译请求
     */
    abort() {
        // Obsidian requestUrl cannot abort transport. Invalidate completion and cache writes instead.
        this.revision++;
    }

    /**
     * 使用 AI 引擎翻译（复用现有的 AI 配置）
     */
    private async translateWithAI(text: string, detailContext?: string): Promise<string> {
        const aiConfig = this.settings.aiService;
        const apiKey = this.getAPIKey();
        if (!aiConfig?.apiUrl || !apiKey || !aiConfig?.model) {
            throw new Error(t('translate.ai_not_configured'));
        }

        const targetLang = this.settings.selectionTranslate.targetLang || 'zh-CN';
        const detailed = detailContext !== undefined;
        const prompt = detailed ? buildDetailedTranslationPrompt(text, targetLang, detailContext)
            : buildTranslationPrompt(this.settings.selectionTranslate.prompt, text, targetLang);

        const content = await new AIClient(aiConfig, apiKey).generate(prompt, detailed ? 2200 : 500);

        // 清理 AI 思考过程标签（如 <think>...</think>）
        let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // 如果清理后为空（整个内容都是思考过程），回退到原始内容
        if (!cleaned) {
            cleaned = content.trim();
        }

        return cleaned;
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }
}
