export type HidictFormType = 'past' | 'pastParticiple' | 'presentParticiple' | 'thirdPersonSingular' | 'plural' | 'comparative' | 'superlative';
export interface HidictEntry {
    id: string;
    word: string;
    meanings: { partsOfSpeech: string[]; sourceLabels: string[]; definitions: string[] }[];
    phonetics: { uk: string | null; us: string | null; unclassified: string | null };
    frequency: { source: string; rank: number | null; level: number | null };
    forms: { word: string; types: HidictFormType[] }[];
    sourceId: string;
}
export interface Hidict {
    schema: 'hidict'; schemaVersion: 1; name: string; entryCount: number;
    entries: HidictEntry[];
}
const pos = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'numeral', 'auxiliary', 'modal', 'phrase', 'unknown']);
const formTypes = new Set(['past', 'pastParticiple', 'presentParticiple', 'thirdPersonSingular', 'plural', 'comparative', 'superlative']);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const strings = (v: unknown, allowEmpty = false): v is string[] => Array.isArray(v) && (allowEmpty || v.length > 0) && v.every(string);
const rank = (v: unknown): boolean => v === null || (Number.isInteger(v) && (v as number) > 0);

/** Validate the supported v1 lookup contract before constructing an index. */
export function parseHidict(text: string): Hidict {
    const data: unknown = JSON.parse(text);
    if (!record(data) || data.schema !== 'hidict' || data.schemaVersion !== 1 || data.language !== 'en'
        || !string(data.name) || !Array.isArray(data.entries) || !data.entries.length
        || data.entryCount !== data.entries.length || !Array.isArray(data.sources)
        || !record(data.frequencyScale) || data.frequencyScale.direction !== 'higher-level-more-frequent') {
        throw new Error('Invalid or unsupported HiDict v1 dictionary');
    }
    const sources = new Set(data.sources.filter(record).map(s => s.id));
    const ids = new Set<string>();
    const words = new Set<string>();
    for (const e of data.entries) {
        if (!record(e) || !string(e.id) || !string(e.word) || ids.has(e.id) || words.has(normalizeWord(e.word))
            || !string(e.sourceId) || !sources.has(e.sourceId)
            || !Array.isArray(e.meanings) || !e.meanings.length || !e.meanings.every(m => record(m)
                && strings(m.partsOfSpeech) && m.partsOfSpeech.every(p => pos.has(p))
                && strings(m.sourceLabels, true) && strings(m.definitions))
            || !record(e.phonetics) || !['uk', 'us', 'unclassified'].every(k => e.phonetics && record(e.phonetics) && (e.phonetics[k] === null || string(e.phonetics[k])))
            || !record(e.frequency) || e.frequency.source !== 'ecdict.frq' || !rank(e.frequency.rank)
            || !(e.frequency.level === null || (Number.isInteger(e.frequency.level) && Number(e.frequency.level) >= 1 && Number(e.frequency.level) <= 5))
            || !Array.isArray(e.forms) || !e.forms.every(f => record(f) && string(f.word) && strings(f.types) && f.types.every(t => formTypes.has(t)))) {
            throw new Error('Invalid HiDict entry');
        }
        ids.add(e.id); words.add(normalizeWord(e.word));
    }
    return data as unknown as Hidict;
}
export function normalizeWord(word: string): string {
    return word.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑]/g, '-');
}
/** Sentences and phrases never enter local word lookup. */
export function selectedWord(text: string): string | null {
    const word = normalizeWord(text).replace(/^["“”]+|["“”,.!?:;]+$/g, '');
    return /^[a-z]+(?:['-][a-z]+)*$/.test(word) ? word : null;
}
export class HidictIndex {
    private exact = new Map<string, HidictEntry>();
    private forms = new Map<string, HidictEntry[]>();
    constructor(public readonly dictionary: Hidict) {
        for (const entry of dictionary.entries) {
            this.exact.set(normalizeWord(entry.word), entry);
            for (const form of entry.forms) {
                const key = normalizeWord(form.word);
                const candidates = this.forms.get(key) || [];
                if (!candidates.includes(entry)) candidates.push(entry);
                this.forms.set(key, candidates);
            }
        }
    }
    lookup(word: string): HidictEntry[] {
        const key = normalizeWord(word);
        const exact = this.exact.get(key);
        return exact ? [exact] : this.forms.get(key) || [];
    }
}
