import { FORM_TYPES, LexicalContent, LexicalExample, LexicalMeaning, LexicalSource, normalizePartOfSpeech } from './types';
import { record } from './validation';
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() && value.length <= 20000 ? value.trim() : undefined;
const strings = (value: unknown): string[] | undefined => { const items = Array.isArray(value) ? [...new Set(value.map(text).filter((item): item is string => !!item))] : []; return items.length ? items : undefined; };
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(record) : [];
export function lexicalId(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)}`; }
function examples(value: unknown): LexicalExample[] | undefined {
    const seen = new Set<string>();
    const result = records(value).flatMap(item => {
        const source = text(item.text); if (!source) return [];
        const translation = text(item.translation), key = JSON.stringify([source, translation]);
        if (seen.has(key)) return []; seen.add(key);
        return [{ id: lexicalId('example'), text: source, translation }];
    });
    return result.length ? result : undefined;
}

/** One AI vocabulary contract; IDs and provenance are always assigned by the host. */
export function parseAiLexicalContent(value: unknown): LexicalContent | null {
    if (!record(value)) return null;
    const meanings: LexicalMeaning[] = records(value.meanings).flatMap(item => {
        if (!Array.isArray(item.partsOfSpeech) || !item.partsOfSpeech.length || !item.partsOfSpeech.every(pos => typeof pos === 'string')) return [];
        const translation = text(item.translation), definition = text(item.definition);
        if (!translation && !definition) return [];
        return [{ id: lexicalId('meaning'), partsOfSpeech: (strings(item.partsOfSpeech) || ['unknown']).map(normalizePartOfSpeech), translation, definition }];
    });
    if (!meanings.length) return null;
    const content: LexicalContent = { language: text(value.language) || 'en', translationLanguage: text(value.translationLanguage) || 'zh-CN', itemType: value.itemType === 'phrase' || value.itemType === 'term' ? value.itemType : 'word', meanings };
    if (record(value.phonetics)) content.phonetics = { us: text(value.phonetics.us), uk: text(value.phonetics.uk), unclassified: text(value.phonetics.unclassified) };
    content.examples = examples(value.examples);
    content.forms = records(value.forms).flatMap(item => {
        const source = text(item.text), types = (strings(item.types) || []).filter((type): type is typeof FORM_TYPES[number] => FORM_TYPES.includes(type as typeof FORM_TYPES[number]));
        return source && types.length ? [{ text: source, types }] : [];
    });
    content.derivedWords = records(value.derivedWords).flatMap(item => {
        const source = text(item.text); return source ? [{ text: source, partsOfSpeech: strings(item.partsOfSpeech)?.map(normalizePartOfSpeech), translation: text(item.translation) }] : [];
    });
    content.phrases = records(value.phrases).flatMap(item => {
        const source = text(item.text); return source ? [{ id: lexicalId('phrase'), text: source, type: item.type === 'collocation' ? 'collocation' as const : 'phrase' as const, translation: text(item.translation), examples: examples(item.examples) }] : [];
    });
    if (record(value.usage)) content.usage = { register: strings(value.usage.register), patterns: strings(value.usage.patterns), notes: strings(value.usage.notes), commonMistakes: strings(value.usage.commonMistakes) };
    if (record(value.morphology)) content.morphology = {
        explanation: text(value.morphology.explanation), components: records(value.morphology.components).flatMap(item => {
            const form = text(item.form); return form ? [{ type: text(item.type) || 'other', form, meaning: text(item.meaning) }] : [];
        }),
    };
    content.relations = records(value.relations).flatMap(item => { const target = text(item.target); return target ? [{ type: text(item.type) || 'related', target, note: text(item.note) }] : []; });
    content.memory = records(value.memory).flatMap(item => { const source = text(item.text); return source ? [{ type: text(item.type) || 'mnemonic', text: source }] : []; });
    return compactLexicalValue(content);
}

/** Omit missing optional content without changing required draft fields. */
export function compactLexicalValue<T>(value: T): T {
    if (Array.isArray(value)) return value.map(compactLexicalValue) as unknown as T;
    if (!record(value)) return value;
    const optional = new Set(['phonetics', 'translation', 'definition', 'us', 'uk', 'unclassified', 'sourceLabels', 'sourceIds', 'examples', 'forms', 'derivedWords', 'phrases', 'usage', 'morphology', 'relations', 'memory', 'sources', 'aliases', 'register', 'patterns', 'notes', 'commonMistakes', 'components', 'explanation', 'meaning', 'note', 'url', 'version', 'license', 'provider', 'model', 'meaningId']);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        const next = compactLexicalValue(item);
        const empty = next === undefined || next === '' || (Array.isArray(next) && !next.length) || (record(next) && !Object.keys(next).length);
        if (empty && optional.has(key)) continue;
        if (next !== undefined) result[key] = next;
    }
    return result as T;
}
export function withAiSource(content: LexicalContent, provider: string, model: string): LexicalContent {
    const source: LexicalSource = { id: lexicalId('ai'), type: 'ai', name: `${provider} / ${model}`, provider, model };
    const sourceIds = [source.id];
    return { ...content, sources: [source], meanings: content.meanings.map(item => ({ ...item, sourceIds })), examples: content.examples?.map(item => ({ ...item, sourceIds })), forms: content.forms?.map(item => ({ ...item, sourceIds })), derivedWords: content.derivedWords?.map(item => ({ ...item, sourceIds })), phrases: content.phrases?.map(item => ({ ...item, sourceIds, examples: item.examples?.map(example => ({ ...example, sourceIds })) })), phonetics: content.phonetics ? { ...content.phonetics, sourceIds } : undefined };
}
