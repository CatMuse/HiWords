import { DEFAULT_SETTINGS } from './settings';
import { LEGACY_TRANSLATE_PROMPT, STRUCTURED_TRANSLATE_PROMPT } from './services/translation-prompt';
import { AI_PROVIDERS, defaultAIProfile } from './services/ai-profiles';
import type { AIProvider, AIServiceSettings, HiWordsSettings } from './utils';

interface NormalizedSettings {
    settings: HiWordsSettings;
    hadLegacyAPIKeyField: boolean;
    discardedLegacyAPIKey: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalizes persisted settings and deliberately removes the legacy plaintext API key.
 * The old value is not migrated: users must select a secret again after upgrading.
 */
export function normalizeStoredSettings(data: unknown): NormalizedSettings {
    const stored = isRecord(data) ? data as Partial<HiWordsSettings> : {};
    let hadLegacyAPIKeyField = false;
    let discardedLegacyAPIKey = false;
    const normalizeProfile = (value: unknown, provider: AIProvider): AIServiceSettings => {
        const raw = isRecord(value) ? value : {};
        hadLegacyAPIKeyField ||= Object.prototype.hasOwnProperty.call(raw, 'apiKey');
        discardedLegacyAPIKey ||= typeof raw.apiKey === 'string' && !!raw.apiKey.trim();
        const defaults = defaultAIProfile(provider);
        return {
            ...defaults,
            apiProtocol: undefined,
            apiUrl: typeof raw.apiUrl === 'string' ? raw.apiUrl : defaults.apiUrl,
            model: typeof raw.model === 'string' ? raw.model : defaults.model,
            apiKeySecretId: typeof raw.apiKeySecretId === 'string' ? raw.apiKeySecretId : '',
            extraParams: typeof raw.extraParams === 'string' ? raw.extraParams : '{}',
            ...(['openai', 'anthropic', 'gemini'].includes(String(raw.apiProtocol))
                ? { apiProtocol: raw.apiProtocol as AIServiceSettings['apiProtocol'] } : {}),
        };
    };
    const rawActive: Record<string, unknown> = isRecord(stored.aiService) ? stored.aiService : {};
    const provider = AI_PROVIDERS.includes(rawActive.provider as AIProvider)
        ? rawActive.provider as AIProvider : DEFAULT_SETTINGS.aiService.provider;
    const aiService = normalizeProfile(rawActive, provider);
    const aiProfiles: HiWordsSettings['aiProfiles'] = {};
    if (isRecord(stored.aiProfiles)) {
        for (const id of AI_PROVIDERS) {
            if (isRecord(stored.aiProfiles[id])) aiProfiles[id] = normalizeProfile(stored.aiProfiles[id], id);
        }
    }
    aiProfiles[provider] = { ...aiService };

    return {
        settings: {
            ...DEFAULT_SETTINGS,
            ...stored,
            hidictPath: typeof stored.hidictPath === 'string' ? stored.hidictPath : '',
            aiService,
            aiProfiles,
            aiDefinition: {
                ...DEFAULT_SETTINGS.aiDefinition,
                ...stored.aiDefinition
            },
            selectionTranslate: {
                ...DEFAULT_SETTINGS.selectionTranslate,
                ...stored.selectionTranslate,
                prompt: typeof stored.selectionTranslate?.prompt === 'string' && ![LEGACY_TRANSLATE_PROMPT, STRUCTURED_TRANSLATE_PROMPT].includes(stored.selectionTranslate.prompt.trim())
                    ? stored.selectionTranslate.prompt : '',
                explanationPrompt: typeof stored.selectionTranslate?.explanationPrompt === 'string'
                    ? stored.selectionTranslate.explanationPrompt : ''
            }
        },
        hadLegacyAPIKeyField,
        discardedLegacyAPIKey
    };
}
