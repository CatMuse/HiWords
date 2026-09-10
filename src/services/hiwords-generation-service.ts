import type HiWordsPlugin from '../../main';
import { createStableId } from '../editor/hiwords-document';
import type {
    HiWordsWordCard,
    HiWordsDerivedWord,
    HiWordsForm,
    HiWordsMeaning,
    HiWordsMemoryItem,
    HiWordsMorphology,
    HiWordsPhrase,
    HiWordsRelation,
    HiWordsSentence,
    HiWordsUsage,
} from '../schema/hiwords';
import { normalizeHiWordsPartOfSpeech } from '../schema/hiwords';
import { DictionaryService } from './dictionary-service';

export interface HiWordsGeneratedContent {
    aliases?: string[];
    phonetics?: { us?: string; uk?: string };
    meanings?: HiWordsMeaning[];
    sentences?: HiWordsSentence[];
    forms?: HiWordsForm[];
    derivedWords?: HiWordsDerivedWord[];
    morphology?: HiWordsMorphology;
    phrases?: HiWordsPhrase[];
    usage?: HiWordsUsage;
    relations?: HiWordsRelation[];
    memory?: HiWordsMemoryItem[];
}

const GENERATION_PROMPT = `Create a high-quality structured English vocabulary entry for "{{word}}".
Return ONLY valid JSON. Do not use Markdown fences and do not add commentary.
Use concise learner-friendly English definitions and Simplified Chinese translations.
Prefer quality over quantity. Do not invent citations, images, personal notes, or custom sections.

Return this shape, omitting empty optional fields:
{
  "aliases": ["spelling variants only"],
  "phonetics": { "us": "IPA without slashes", "uk": "IPA without slashes" },
  "meanings": [{ "partOfSpeech": "noun|verb|adjective|adverb|pronoun|preposition|conjunction|determiner|interjection|auxiliary|modal|phrase", "translation": "中文释义", "definition": "concise English definition" }],
  "sentences": [{ "text": "natural example", "translation": "中文翻译" }],
  "forms": [{ "form": "inflected form", "type": "past|plural|comparative|..." }],
  "derivedWords": [{ "word": "derived word", "partOfSpeech": "noun|verb|adjective|adverb|phrase", "meaning": "中文释义" }],
  "morphology": { "components": [{ "type": "root|prefix|suffix|base|other", "form": "component", "meaning": "中文说明" }], "explanation": "brief explanation" },
  "phrases": [{ "text": "common phrase", "translation": "中文释义", "sentence": "natural example" }],
  "usage": { "register": ["neutral|formal|informal"], "patterns": ["common pattern"], "notes": ["usage guidance"], "commonMistakes": ["common mistake"] },
  "relations": [{ "type": "synonym|antonym|confusable|related", "target": "word", "note": "brief distinction" }],
  "memory": [{ "type": "mnemonic", "text": "short memory cue" }]
}

Limits: at most 4 meanings, 5 standalone sentences, 5 forms, 5 derived words, 5 phrases, 8 relations, and 3 memory cues.`;

export class HiWordsGenerationService {
    private readonly dictionary: DictionaryService;

    constructor(plugin: HiWordsPlugin) {
        this.dictionary = new DictionaryService({
            service: plugin.settings.aiService,
            apiKey: plugin.getAIAPIKey(),
            prompt: GENERATION_PROMPT,
            maxTokens: 6000,
        });
    }

    async generate(word: string): Promise<HiWordsGeneratedContent> {
        const response = await this.dictionary.fetchDefinition(word);
        return sanitizeGeneratedContent(parseJsonResponse(response));
    }
}

export function mergeGeneratedContent(card: HiWordsWordCard, generated: HiWordsGeneratedContent): HiWordsWordCard {
    const merged = cloneCard(card);
    if (!(merged.aliases?.length) && generated.aliases?.length) merged.aliases = generated.aliases;
    merged.data.phonetics = mergePhonetics(merged.data.phonetics, generated.phonetics);

    const currentMeaningsHaveContent = merged.data.meanings.some(hasMeaningContent);
    if (!currentMeaningsHaveContent && generated.meanings?.length) {
        merged.data.meanings = generated.meanings;
    } else if (generated.meanings?.length) {
        merged.data.meanings = merged.data.meanings.map(meaning => {
            const candidate = generated.meanings?.find(item => normalize(item.partOfSpeech) === normalize(meaning.partOfSpeech));
            if (!candidate) return meaning;
            return {
                ...meaning,
                partOfSpeech: normalizeHiWordsPartOfSpeech(meaning.partOfSpeech || candidate.partOfSpeech),
                translation: meaning.translation || candidate.translation,
                definition: meaning.definition || candidate.definition,
            };
        });
    }

    fillArray(merged, 'sentences', generated.sentences);
    fillArray(merged, 'forms', generated.forms);
    fillArray(merged, 'derivedWords', generated.derivedWords);
    fillArray(merged, 'phrases', generated.phrases);
    fillArray(merged, 'relations', generated.relations);
    fillArray(merged, 'memory', generated.memory);
    if (!merged.data.morphology && generated.morphology) merged.data.morphology = generated.morphology;
    else if (generated.morphology) {
        merged.data.morphology = {
            components: merged.data.morphology?.components?.length ? merged.data.morphology.components : generated.morphology.components,
            explanation: merged.data.morphology?.explanation || generated.morphology.explanation,
        };
    }
    merged.data.usage = mergeUsage(merged.data.usage, generated.usage);
    return merged;
}

function parseJsonResponse(response: string): unknown {
    const trimmed = response.trim();
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(withoutFence) as unknown;
    } catch {
        const start = withoutFence.indexOf('{');
        const end = withoutFence.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('AI did not return a JSON vocabulary entry.');
        return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
    }
}

function sanitizeGeneratedContent(value: unknown): HiWordsGeneratedContent {
    if (!isRecord(value)) throw new Error('AI returned an invalid vocabulary entry.');
    const result: HiWordsGeneratedContent = {};
    result.aliases = strings(value.aliases, 6);
    if (isRecord(value.phonetics)) {
        result.phonetics = compactObject({ us: stringValue(value.phonetics.us), uk: stringValue(value.phonetics.uk) });
    }
    result.meanings = records(value.meanings, 4).map(item => ({
        id: createStableId('meaning'),
        partOfSpeech: normalizeHiWordsPartOfSpeech(stringValue(item.partOfSpeech)),
        translation: stringValue(item.translation),
        definition: stringValue(item.definition),
    })).filter(item => !!item.partOfSpeech && !!item.translation && !!item.definition);
    result.sentences = records(value.sentences, 5).map(item => ({
        id: createStableId('sentence'), text: stringValue(item.text), translation: optionalString(item.translation),
    })).filter(item => !!item.text);
    result.forms = records(value.forms, 5).map(item => ({ form: stringValue(item.form), type: stringValue(item.type) })).filter(item => !!item.form);
    result.derivedWords = records(value.derivedWords, 5).map(item => ({
        word: stringValue(item.word),
        partOfSpeech: optionalString(item.partOfSpeech) ? normalizeHiWordsPartOfSpeech(stringValue(item.partOfSpeech)) : undefined,
        meaning: optionalString(item.meaning),
    })).filter(item => !!item.word);
    if (isRecord(value.morphology)) {
        const components = records(value.morphology.components, 8).map(item => ({
            type: stringValue(item.type) || 'other', form: stringValue(item.form), meaning: optionalString(item.meaning),
        })).filter(item => !!item.form);
        const explanation = optionalString(value.morphology.explanation);
        if (components.length || explanation) result.morphology = { components, explanation };
    }
    result.phrases = records(value.phrases, 5).map(item => ({
        id: createStableId('phrase'), text: stringValue(item.text), translation: optionalString(item.translation), sentence: optionalString(item.sentence),
    })).filter(item => !!item.text);
    if (isRecord(value.usage)) {
        const usage: HiWordsUsage = {
            register: strings(value.usage.register, 4), patterns: strings(value.usage.patterns, 6),
            notes: strings(value.usage.notes, 5), commonMistakes: strings(value.usage.commonMistakes, 5),
        };
        if (Object.values(usage).some(items => items?.length)) result.usage = usage;
    }
    result.relations = records(value.relations, 8).map(item => ({
        type: stringValue(item.type) || 'related', target: stringValue(item.target), note: optionalString(item.note),
    })).filter(item => !!item.target);
    result.memory = records(value.memory, 3).map(item => ({
        type: stringValue(item.type) || 'mnemonic', text: stringValue(item.text),
    })).filter(item => !!item.text);
    const cleaned = removeEmptyCollections(result);
    if (!Object.keys(cleaned).length) throw new Error('AI returned an empty vocabulary entry.');
    return cleaned;
}

function cloneCard(card: HiWordsWordCard): HiWordsWordCard {
    return JSON.parse(JSON.stringify(card)) as HiWordsWordCard;
}

function hasMeaningContent(item: HiWordsMeaning): boolean {
    return !!(item.translation.trim() || item.definition.trim());
}

function fillArray<K extends 'sentences' | 'forms' | 'derivedWords' | 'phrases' | 'relations' | 'memory'>(
    card: HiWordsWordCard,
    key: K,
    generated: NonNullable<HiWordsWordCard['data'][K]> | undefined,
): void {
    if (!(card.data[key]?.length) && generated?.length) card.data[key] = generated;
}

function mergePhonetics(current: HiWordsWordCard['data']['phonetics'], generated: HiWordsWordCard['data']['phonetics']): HiWordsWordCard['data']['phonetics'] {
    const result = { us: current?.us || generated?.us, uk: current?.uk || generated?.uk };
    return result.us || result.uk ? result : undefined;
}

function mergeUsage(current: HiWordsUsage | undefined, generated: HiWordsUsage | undefined): HiWordsUsage | undefined {
    if (!current) return generated;
    if (!generated) return current;
    return {
        register: current.register?.length ? current.register : generated.register,
        patterns: current.patterns?.length ? current.patterns : generated.patterns,
        notes: current.notes?.length ? current.notes : generated.notes,
        commonMistakes: current.commonMistakes?.length ? current.commonMistakes : generated.commonMistakes,
    };
}

function records(value: unknown, limit: number): Array<Record<string, unknown>> {
    return Array.isArray(value) ? value.filter(isRecord).slice(0, limit) : [];
}

function strings(value: unknown, limit: number): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result = Array.from(new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))).slice(0, limit);
    return result.length ? result : undefined;
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
    return stringValue(value) || undefined;
}

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

function compactObject<T extends Record<string, string | undefined>>(value: T): T | undefined {
    return Object.values(value).some(Boolean) ? value : undefined;
}

function removeEmptyCollections(value: HiWordsGeneratedContent): HiWordsGeneratedContent {
    for (const key of Object.keys(value) as Array<keyof HiWordsGeneratedContent>) {
        const item = value[key];
        if (Array.isArray(item) && item.length === 0) delete value[key];
        else if (item && typeof item === 'object' && Object.keys(item).length === 0) delete value[key];
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
