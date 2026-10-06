import { requestUrl } from 'obsidian';
import type { RequestUrlParam } from 'obsidian';
import type { AIProtocol, AIServiceSettings } from '../utils';
import { t } from '../i18n';
import { extractAIResponse, responseErrorMessage, responseFinishReason, unwrapResponse } from './ai-response';

/** Legacy custom endpoints retain their protocol until the user selects one. */
export function resolveAIProtocol(config: AIServiceSettings): AIProtocol {
    if (config.provider === 'anthropic' || config.provider === 'gemini') return config.provider;
    if (config.provider !== 'custom') return 'openai';
    if (config.apiProtocol) return config.apiProtocol;
    const url = config.apiUrl.toLowerCase();
    return url.includes('anthropic') ? 'anthropic'
        : url.includes('googleapis') || url.includes('generativelanguage') ? 'gemini' : 'openai';
}

/** Accept either an API root or a full generation endpoint. */
export function aiRoot(base: string, protocol: AIProtocol): string {
    const url = new URL(base.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error(t('ai_connection.invalid_url'));
    }
    let path = url.pathname.replace(/\/+$/, '');
    if (protocol === 'openai') path = path.replace(/\/chat\/completions$/, '');
    if (protocol === 'anthropic') {
        path = path.replace(/\/messages$/, '');
        if (!path) path = '/v1';
    }
    if (protocol === 'gemini') {
        path = path.replace(/\/models(?:\/[^/]+:generateContent)?$/, '');
        if (!path) path = '/v1beta';
    }
    return url.origin + path;
}

type JsonObject = Record<string, unknown>;
function isObject(value: unknown): value is JsonObject {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function merge(target: JsonObject, source: JsonObject): JsonObject {
    const output = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
        output[key] = isObject(value) && isObject(output[key]) ? merge(output[key] as JsonObject, value) : value;
    }
    return output;
}

/** One request path for definitions, translation, generation, and model tests. */
export class AIClient {
    private readonly config: AIServiceSettings;
    constructor(config: AIServiceSettings, private readonly apiKey: string) {
        this.config = { ...config };
    }

    private headers(): Record<string, string> {
        if (!this.apiKey.trim()) throw new Error(t('ai_errors.api_key_not_configured'));
        const protocol = resolveAIProtocol(this.config);
        return {
            'Content-Type': 'application/json',
            ...(protocol === 'anthropic' ? { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }
                : protocol === 'gemini' ? { 'x-goog-api-key': this.apiKey }
                    : { Authorization: `Bearer ${this.apiKey}` }),
        };
    }

    async generate(prompt: string, maxTokens = 500): Promise<string> {
        const { model, apiUrl, extraParams } = this.config;
        if (!model.trim()) throw new Error(t('ai_errors.model_required'));
        const protocol = resolveAIProtocol(this.config);
        const root = aiRoot(apiUrl, protocol);
        const url = root + (protocol === 'anthropic' ? '/messages'
            : protocol === 'gemini' ? `/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`
                : '/chat/completions');
        let extra: JsonObject = {};
        if (extraParams?.trim()) {
            let parsed: unknown;
            try { parsed = JSON.parse(extraParams); } catch { throw new Error(t('settings.json_object_required')); }
            if (!isObject(parsed)) throw new Error(t('settings.json_object_required'));
            extra = parsed;
        }
        let body: JsonObject = protocol === 'gemini'
            ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }
            : { model, messages: [{ role: 'user', content: prompt }],
                ...(protocol === 'openai' ? { max_completion_tokens: Math.max(maxTokens, 4096) } : { max_tokens: maxTokens }) };
        body = merge(body, extra);
        // Generation requests are not automatically replayed: an ambiguous failure may have been billed.
        const data = await this.request({ url, method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
        const content = extractAIResponse(data, protocol);
        if (content?.trim()) return content.trim();
        const value = unwrapResponse(data);
        const reason = responseFinishReason(value);
        throw new Error(responseErrorMessage(value) || (['length', 'MAX_TOKENS', 'max_tokens'].includes(reason || '')
            ? t('ai_connection.truncated') : t('ai_errors.invalid_response')));
    }

    async listModels(): Promise<string[]> {
        const protocol = resolveAIProtocol(this.config);
        const root = aiRoot(this.config.apiUrl, protocol);
        const headers = this.headers();
        const models = new Set<string>();
        const seen = new Set<string>();
        const deadline = Date.now() + 45000;
        let cursor = '';
        for (let page = 0; page < 20; page++) {
            const url = new URL(root + '/models');
            if (protocol === 'anthropic') url.searchParams.set('limit', '1000');
            if (protocol === 'gemini') url.searchParams.set('pageSize', '1000');
            if (cursor) url.searchParams.set(protocol === 'gemini' ? 'pageToken' : 'after_id', cursor);
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error(t('ai_connection.timeout'));
            const data = await this.request({ url: url.toString(), method: 'GET', headers }, remaining);
            if (!isObject(data)) throw new Error(t('ai_errors.invalid_response'));
            const entries = protocol === 'gemini' ? data.models : data.data;
            if (!Array.isArray(entries)) throw new Error(t('ai_errors.invalid_response'));
            for (const entry of entries) {
                if (!isObject(entry)) continue;
                if (protocol === 'gemini' && Array.isArray(entry.supportedGenerationMethods)
                    && !entry.supportedGenerationMethods.includes('generateContent')) continue;
                const id = protocol === 'gemini' ? entry.name : entry.id;
                if (typeof id === 'string' && id.trim()) models.add(protocol === 'gemini' ? id.replace(/^models\//, '') : id);
            }
            const next = protocol === 'gemini' ? data.nextPageToken : data.has_more ? data.last_id : '';
            if (!next && !data.has_more) return [...models].sort();
            if (typeof next !== 'string' || !next || seen.has(next)) throw new Error(t('ai_connection.pagination_error'));
            seen.add(next);
            cursor = next;
        }
        throw new Error(t('ai_connection.pagination_error'));
    }

    private async request(config: RequestUrlParam, timeout = 45000): Promise<unknown> {
        // requestUrl cannot abort transport. Timeout ends the UI wait and ignores late completion.
        let timer: number | undefined;
        try {
            const response = await Promise.race([
                requestUrl({ ...config, throw: false }),
                new Promise<never>((_, reject) => {
                    timer = window.setTimeout(() => reject(new Error(t('ai_connection.timeout'))), timeout);
                }),
            ]);
            if (response.status < 200 || response.status >= 300) {
                let message = '';
                try { message = responseErrorMessage(response.json) || ''; } catch { /* Non-JSON error. */ }
                // Never expose a request URL, headers, or full provider payload in diagnostics.
                message = message.split(this.apiKey).join('[redacted]').slice(0, 200);
                throw new Error(`HTTP ${response.status}${message ? ': ' + message : ''}`);
            }
            return response.json as unknown;
        } finally {
            if (timer !== undefined) window.clearTimeout(timer);
        }
    }
}
