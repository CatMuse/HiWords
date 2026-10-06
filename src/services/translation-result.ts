import type { LexicalEntry, LexicalExample } from '../lexical/types';
import { lexicalDefinition, partOfSpeechLabel } from '../lexical/types';
import { lexicalId, parseAiLexicalContent, withAiSource } from '../lexical/ai-content';
import { record } from '../lexical/validation';

export type TranslationResult =
    | (LexicalEntry & { kind: 'word'; reading?: { contextMeaning?: string } })
    | { kind: 'sentence'; text: string; translation: string; explanation?: string; keyPhrases?: LexicalExample[]; structure?: string }
    | { kind: 'text'; text: string; translation: string; savable: boolean };
export interface AiResultSource { provider: string; model: string; translationLanguage?: string }
export const aiMeaningLabel = partOfSpeechLabel;
export function translationDefinition(result: TranslationResult): string | null {
    if (result.kind === 'word') return lexicalDefinition(result) || null;
    return result.kind === 'sentence' || result.savable ? result.translation : null;
}

export function parseTranslationObject(data: unknown, selection: string, source?: AiResultSource): TranslationResult | null {
    if (!record(data)) return null;
    if (data.kind === 'word') {
        const content = parseAiLexicalContent({ ...data, translationLanguage: data.translationLanguage || source?.translationLanguage });
        if (!content) return null;
        const sourced = source ? withAiSource(content, source.provider, source.model) : content;
        const contextMeaning = record(data.reading) && typeof data.reading.contextMeaning === 'string' ? data.reading.contextMeaning.trim() : undefined;
        return { ...sourced, kind: 'word', id: lexicalId('entry'), text: selection, ...(contextMeaning ? { reading: { contextMeaning } } : {}) };
    }
    if (data.kind === 'sentence' && typeof data.translation === 'string' && data.translation.trim()) {
        const note = (value: unknown): string | undefined => {
            if (typeof value === 'string') return value.trim() || undefined;
            if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join('\n').trim() || undefined;
            return undefined;
        };
        const keyPhrases = Array.isArray(data.keyPhrases) ? data.keyPhrases.flatMap(item => record(item) && note(item.text) ? [{ id: lexicalId('phrase'), text: note(item.text)!, translation: note(item.translation) }] : []) : undefined;
        return { kind: 'sentence', text: selection, translation: data.translation.trim(), explanation: note(data.explanation), structure: note(data.structure), ...(keyPhrases?.length ? { keyPhrases } : {}) };
    }
    return null;
}

/** Structured failures are never saved as raw JSON; ordinary translations remain usable. */
export function parseTranslationResult(raw: string, selection: string, source?: AiResultSource): TranslationResult {
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const candidate = cleaned.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
    let data: unknown;
    try { data = JSON.parse(candidate); } catch { /* Plain translation. */ }
    const parsed = record(data) && data.text === selection ? parseTranslationObject(data, selection, source) : null;
    if (parsed) return parsed;
    const fallback = record(data) && typeof data.translation === 'string' ? data.translation.trim() : '';
    const structured = /^[{[]/.test(candidate);
    return { kind: 'text', text: selection, translation: fallback || (structured ? '' : cleaned), savable: !!fallback || !structured && !!cleaned };
}
