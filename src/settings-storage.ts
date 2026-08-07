import { DEFAULT_SETTINGS } from './settings';
import type { AIServiceSettings, HiWordsSettings } from './utils';

interface NormalizedSettings {
    settings: HiWordsSettings;
    hadLegacyAPIKeyField: boolean;
    discardedLegacyAPIKey: boolean;
}

type StoredAIServiceSettings = Partial<AIServiceSettings> & {
    apiKey?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalizes persisted settings and deliberately removes the legacy plaintext API key.
 * The old value is not migrated: users must select a secret again after upgrading.
 */
export function normalizeStoredSettings(data: unknown): NormalizedSettings {
    const stored = isRecord(data) ? data as Partial<HiWordsSettings> : {};
    const storedAIService = isRecord(stored.aiService)
        ? stored.aiService as StoredAIServiceSettings
        : {};
    const hadLegacyAPIKeyField = Object.prototype.hasOwnProperty.call(storedAIService, 'apiKey');
    const discardedLegacyAPIKey = typeof storedAIService.apiKey === 'string'
        && storedAIService.apiKey.trim().length > 0;
    const { apiKey: _discardedAPIKey, ...safeAIService } = storedAIService;

    return {
        settings: {
            ...DEFAULT_SETTINGS,
            ...stored,
            aiService: {
                ...DEFAULT_SETTINGS.aiService,
                ...safeAIService,
                apiKeySecretId: typeof safeAIService.apiKeySecretId === 'string'
                    ? safeAIService.apiKeySecretId
                    : ''
            },
            aiDefinition: {
                ...DEFAULT_SETTINGS.aiDefinition,
                ...stored.aiDefinition
            },
            selectionTranslate: {
                ...DEFAULT_SETTINGS.selectionTranslate,
                ...stored.selectionTranslate
            }
        },
        hadLegacyAPIKeyField,
        discardedLegacyAPIKey
    };
}
