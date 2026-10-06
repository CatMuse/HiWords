import { AiExample, AiMeaning, parseTranslationResult, TranslationResult } from './translation-result';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function text(value: unknown, max = 5000): string | null {
    return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
}
function note(value: unknown): string | null {
    const direct = text(value);
    if (direct) return direct;
    if (!Array.isArray(value)) return null;
    const lines = value.slice(0, 8).map(item => {
        if (typeof item === 'string') return text(item, 1000);
        if (!record(item)) return null;
        const body = text(item.explanation ?? item.text ?? item.description, 1000);
        return body ? [text(item.title, 200), body].filter(Boolean).join('：') : null;
    }).filter((item): item is string => !!item);
    return text(lines.join('\n'));
}
function pairs(value: unknown, limit: number): AiExample[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
        if (!record(item)) return [];
        const source = text(item.text, 2000), translation = text(item.translation, 2000);
        return source && translation ? [{ text: source, translation }] : [];
    }).slice(0, limit);
}

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

const posAliases: Record<string, string> = { 'n.': 'noun', 'v.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb', 'phr.': 'phrase' };

/** Keep usable fields independently; model-echoed source text never replaces the actual selection. */
export function parseDetailedTranslationResult(raw: string, selection: string): TranslationResult | null {
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!cleaned) return null;
    const data = objectFromResponse(cleaned);
    if (data) {
        const meanings: AiMeaning[] = Array.isArray(data.meanings) ? data.meanings.flatMap(item => {
            if (!record(item)) return [];
            const definition = text(item.definition, 2000);
            const pos = text(item.pos, 100)?.toLowerCase() || 'unknown';
            return definition ? [{ pos: posAliases[pos] || pos, definition }] : [];
        }).slice(0, 4) : [];
        if (meanings.length && data.kind !== 'sentence') {
            // Reuse the strict parser to bound optional sections and normalize known POS labels.
            const known = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'numeral', 'auxiliary', 'modal', 'phrase', 'unknown']);
            const normalized = { ...data, kind: 'word', text: selection,
                meanings: meanings.map(item => ({ ...item, pos: known.has(item.pos) ? item.pos : 'unknown' })),
                usage: note(data.usage)?.slice(0, 2000) || null, example: pairs([data.example], 1)[0] || null,
                collocations: pairs(data.collocations, 5), examples: pairs(data.examples, 3) };
            const result = parseTranslationResult(JSON.stringify(normalized), selection);
            if (result.kind !== 'word') return null;
            if (data.kind === 'phrase' || meanings.every(item => item.pos === 'phrase')) result.lexicalType = 'phrase';
            return result;
        }
        const translation = text(data.translation);
        if (translation) {
            if (data.kind === 'phrase' || data.kind === 'word') {
                return { kind: 'word', text: selection, meanings: [{ pos: data.kind === 'phrase' ? 'phrase' : 'unknown', definition: translation }],
                    ...(data.kind === 'phrase' ? { lexicalType: 'phrase' as const } : {}), usage: note(data.usage ?? data.explanation), example: null,
                    collocations: pairs(data.collocations, 5), examples: pairs(data.examples, 3) };
            }
            return { kind: 'sentence', text: selection, translation, explanation: note(data.explanation),
                ...(pairs(data.keyPhrases, 6).length ? { keyPhrases: pairs(data.keyPhrases, 6) } : {}),
                ...(note(data.structure) ? { structure: note(data.structure) } : {}) };
        }
        const explanation = note(data.explanation);
        if (explanation) return { kind: 'text', text: selection, translation: explanation, definition: null };
        return null;
    }
    // Never show/save a malformed JSON blob. Ordinary prose remains useful as a detailed answer.
    if (/^[{[]/.test(cleaned) || /```(?:json)?/i.test(cleaned) || /\{\s*"(?:kind|translation|meanings|text)"\s*:/.test(cleaned)) return null;
    return text(cleaned, 20000) ? { kind: 'text', text: selection, translation: cleaned, definition: null } : null;
}
