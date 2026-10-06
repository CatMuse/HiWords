export interface AiMeaning { pos: string; definition: string }
export interface AiExample { text: string; translation: string }
export interface AiWordDetails { lexicalType?: 'phrase'; contextMeaning?: string | null; collocations?: AiExample[]; examples?: AiExample[]; scenarios?: string[]; pitfalls?: string[] }
export type TranslationResult =
    | ({ kind: 'word'; text: string; meanings: AiMeaning[]; usage: string | null; example: AiExample | null } & AiWordDetails)
    | { kind: 'sentence'; text: string; translation: string; explanation: string | null; keyPhrases?: AiExample[]; structure?: string | null }
    | { kind: 'text'; text: string; translation: string; definition: string | null };

const positions = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'numeral', 'auxiliary', 'modal', 'phrase', 'unknown']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown, max = 2000): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const optional = (value: unknown): value is string | null | undefined => value === null || value === undefined || nonempty(value);
function detailFields(data: Record<string, unknown>): AiWordDetails {
    const fields: AiWordDetails = {};
    if (nonempty(data.contextMeaning)) fields.contextMeaning = data.contextMeaning.trim();
    for (const key of ['collocations', 'examples'] as const) {
        const value = data[key];
        if (Array.isArray(value) && value.length <= (key === 'collocations' ? 5 : 3)
            && value.every(item => record(item) && nonempty(item.text) && nonempty(item.translation))) {
            fields[key] = value.map(item => ({ text: item.text.trim(), translation: item.translation.trim() }));
        }
    }
    for (const key of ['scenarios', 'pitfalls'] as const) {
        const value = data[key];
        if (Array.isArray(value) && value.length <= 3 && value.every(item => nonempty(item))) fields[key] = value.map(item => item.trim());
    }
    return fields;
}

/** Provider/model output is untrusted; only verified fields become a card. */
export function parseTranslationResult(raw: string, selection: string): TranslationResult {
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const candidate = cleaned.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
    let data: unknown;
    try { data = JSON.parse(candidate); } catch { /* Plain text remains supported. */ }
    if (record(data) && nonempty(data.text, 500) && data.text.trim() === selection) {
        if (data.kind === 'word' && Array.isArray(data.meanings) && data.meanings.length >= 1 && data.meanings.length <= 4
            && data.meanings.every(m => record(m) && typeof m.pos === 'string' && positions.has(m.pos) && nonempty(m.definition))
            && optional(data.usage) && (data.example === null || data.example === undefined
                || (record(data.example) && nonempty(data.example.text) && nonempty(data.example.translation)))) {
            return { kind: 'word', text: selection,
                meanings: data.meanings.map(m => ({ pos: m.pos as string, definition: (m.definition as string).trim() })),
                usage: typeof data.usage === 'string' ? data.usage.trim() : null,
                example: record(data.example) ? { text: (data.example.text as string).trim(), translation: (data.example.translation as string).trim() } : null,
                ...detailFields(data) };
        }
        if (data.kind === 'sentence' && nonempty(data.translation, 5000) && optional(data.explanation)) {
            return { kind: 'sentence', text: selection, translation: data.translation.trim(),
                explanation: typeof data.explanation === 'string' ? data.explanation.trim() : null };
        }
    }
    // A usable translation can survive schema errors, but never save raw JSON as a definition.
    const fallback = record(data) && nonempty(data.translation, 5000) ? data.translation.trim() : null;
    const looksStructured = /^[{[]/.test(candidate);
    return { kind: 'text', text: selection, translation: fallback || cleaned,
        definition: fallback || (looksStructured ? null : cleaned || null) };
}

const labels: Record<string, string> = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.',
    preposition: 'prep.', conjunction: 'conj.', determiner: 'det.', interjection: 'interj.', numeral: 'num.', auxiliary: 'aux.', modal: 'modal', phrase: 'phr.', unknown: '' };
export function aiMeaningLabel(pos: string): string { return labels[pos] || ''; }
export function translationDefinition(result: TranslationResult): string | null {
    if (result.kind === 'word') return result.meanings.map(m => [aiMeaningLabel(m.pos), m.definition].filter(Boolean).join(' ')).join('\n');
    return result.kind === 'sentence' ? result.translation : result.definition;
}
