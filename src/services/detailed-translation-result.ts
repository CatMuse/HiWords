import { parseTranslationObject, TranslationResult, AiResultSource } from './translation-result';
import { record } from '../lexical/validation';

/** Extract a complete JSON object even when a provider adds prose or code fences. */
function objectFromResponse(raw: string): Record<string, unknown> | null {
    const start = raw.indexOf('{');
    if (start < 0) return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < raw.length; i++) {
        const char = raw[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) {
            try { const data: unknown = JSON.parse(raw.slice(start, i + 1)); return record(data) ? data : null; }
            catch { return null; }
        }
    }
    return null;
}

/** Provider wrappers are tolerated; legacy vocabulary field names are not converted. */
export function parseDetailedTranslationResult(raw: string, selection: string, source?: AiResultSource): TranslationResult | null {
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!cleaned) return null;
    const data = objectFromResponse(cleaned);
    if (data) return parseTranslationObject(data, selection, source);
    if (/^[{[]/.test(cleaned) || /```(?:json)?/i.test(cleaned) || /\{\s*"(?:kind|translation|meanings|text)"\s*:/.test(cleaned)) return null;
    return { kind: 'text', text: selection, translation: cleaned, savable: false };
}
