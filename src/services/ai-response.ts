import type { AIProtocol } from '../utils';
type JsonPath = Array<string | number>;

function readPath(data: unknown, path: JsonPath): unknown {
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
    return current;
}

function readStringPath(data: unknown, path: JsonPath): string | undefined {
    const current = readPath(data, path);
    return typeof current === 'string' ? current : undefined;
}

function textFromParts(value: unknown): string | undefined {
    if (!Array.isArray(value)) return undefined;
    const text = value.flatMap(item => {
        if (typeof item === 'string') return [item];
        if (!item || typeof item !== 'object') return [];
        const part = item as Record<string, unknown>;
        if (part.thought === true) return [];
        if (typeof part.text === 'string') return [part.text];
        if (typeof part.content === 'string') return [part.content];
        return [];
    }).join('\n').trim();
    return text || undefined;
}

function extractOpenAIResponse(data: unknown): string | undefined {
    if (typeof data === 'string' && data.trim()) return data;
    const content = readPath(data, ['choices', 0, 'message', 'content']);
    if (typeof content === 'string' && content.trim()) return content;
    const contentParts = textFromParts(content);
    if (contentParts) return contentParts;
    return readStringPath(data, ['choices', 0, 'text'])
        || readStringPath(data, ['output_text'])
        || textFromParts(readPath(data, ['output', 0, 'content']));
}

function extractClaudeResponse(data: unknown): string | undefined {
    if (typeof data === 'string' && data.trim()) return data;
    return textFromParts(readPath(data, ['content'])) || readStringPath(data, ['completion']);
}

function extractGeminiResponse(data: unknown): string | undefined {
    if (typeof data === 'string' && data.trim()) return data;
    return textFromParts(readPath(data, ['candidates', 0, 'content', 'parts']));
}

export function unwrapResponse(data: unknown): unknown {
    if (typeof data === 'string') {
        try {
            return unwrapResponse(JSON.parse(data) as unknown);
        } catch {
            return data;
        }
    }
    if (!data || typeof data !== 'object') return data;
    const wrapped = (data as Record<string, unknown>).data;
    return wrapped && typeof wrapped === 'object' ? wrapped : data;
}

export function responseErrorMessage(data: unknown): string | undefined {
    const candidates = [
        readStringPath(data, ['error', 'message']),
        readStringPath(data, ['message']),
        readStringPath(data, ['detail']),
    ];
    return candidates.find(Boolean);
}

export function responseFinishReason(data: unknown): string | undefined {
    return readStringPath(data, ['choices', 0, 'finish_reason'])
        || readStringPath(data, ['candidates', 0, 'finishReason'])
        || readStringPath(data, ['stop_reason']);
}

export function extractAIResponse(data: unknown, protocol: AIProtocol): string | undefined {
    const value = unwrapResponse(data);
    return protocol === 'anthropic' ? extractClaudeResponse(value)
        : protocol === 'gemini' ? extractGeminiResponse(value) : extractOpenAIResponse(value);
}
