import type { AIProvider, AIServiceSettings, HiWordsSettings } from '../utils';

export const AI_PROVIDERS: AIProvider[] = ['openai-compatible', 'anthropic', 'gemini', 'custom'];

export function defaultAIProfile(provider: AIProvider): AIServiceSettings {
    const defaults = {
        'openai-compatible': { apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        anthropic: { apiUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' },
        gemini: { apiUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
        custom: { apiUrl: '', model: '' },
    };
    return { provider, ...defaults[provider], apiKeySecretId: '', extraParams: '{}',
        ...(provider === 'custom' ? { apiProtocol: 'openai' as const } : {}) };
}

/** Keep aiService as the active profile so existing feature consumers remain compatible. */
export function switchAIProvider(settings: HiWordsSettings, provider: AIProvider): void {
    if (!AI_PROVIDERS.includes(provider)) throw new Error('Unknown AI provider');
    const current = settings.aiService;
    settings.aiProfiles = { ...settings.aiProfiles, [current.provider]: { ...current } };
    settings.aiService = { ...(settings.aiProfiles[provider] || defaultAIProfile(provider)), provider };
}
