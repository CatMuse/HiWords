import type HiWordsPlugin from '../../main';
import type { HiWordsWordCard } from '../schema/hiwords';
import type { LexicalContent } from '../lexical/types';
import { compactLexicalValue, parseAiLexicalContent, withAiSource } from '../lexical/ai-content';
import { record } from '../lexical/validation';
import { DictionaryService } from './dictionary-service';

export type HiWordsGeneratedContent = LexicalContent & { aliases?: string[] };

const GENERATION_PROMPT = `Create a high-quality structured English vocabulary entry for "{{word}}".
Return ONLY valid JSON, without Markdown fences or commentary. Use the shared lexical contract:
{
 "language":"en", "translationLanguage":"zh-CN", "itemType":"word",
 "aliases":["spelling variant"],
 "phonetics":{"us":"confirmed IPA","uk":"confirmed IPA"},
 "meanings":[{"partsOfSpeech":["noun"],"translation":"中文释义","definition":"concise English explanation"}],
 "examples":[{"text":"natural example","translation":"中文译文"}],
 "forms":[{"text":"inflected form","types":["past","pastParticiple"]}],
 "derivedWords":[{"text":"derived word","partsOfSpeech":["noun"],"translation":"中文释义"}],
 "morphology":{"components":[{"type":"root|prefix|suffix|base|other","form":"component","meaning":"说明"}],"explanation":"explanation"},
 "phrases":[{"type":"phrase|collocation","text":"common phrase","translation":"中文释义","examples":[{"text":"example","translation":"译文"}]}],
 "usage":{"register":["neutral"],"patterns":["pattern"],"notes":["guidance"],"commonMistakes":["mistake"]},
 "relations":[{"type":"synonym|antonym|confusable|related","target":"word","note":"distinction"}],
 "memory":[{"type":"mnemonic","text":"memory cue"}]
}
Omit missing optional fields. Each meaning needs translation or definition, not necessarily both.
Use unknown for unknown part of speech. Other labels: noun, verb, adjective, adverb, pronoun, preposition, conjunction, determiner, interjection, numeral, auxiliary, modal, phrase.
Forms use past, pastParticiple, presentParticiple, thirdPersonSingular, plural, comparative, superlative.
itemType is word, phrase or term. Prefer quality over quantity: up to 4 meanings and 5 examples for this request.
Do not generate IDs, sources, frequency, citations, user notes, study state or reading context. Never invent pronunciation.`;

export class HiWordsGenerationService {
    private readonly dictionary: DictionaryService;
    constructor(private readonly plugin: HiWordsPlugin) {
        this.dictionary = new DictionaryService({ service: plugin.settings.aiService, apiKey: plugin.getAIAPIKey(), prompt: GENERATION_PROMPT, maxTokens: 6000 });
    }
    async generate(word: string): Promise<HiWordsGeneratedContent> {
        const response = await this.dictionary.fetchDefinition(word);
        const raw = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const value: unknown = JSON.parse(raw);
        const content = parseAiLexicalContent(value);
        if (!content) throw new Error('AI returned no usable vocabulary meanings.');
        const aliases = record(value) && Array.isArray(value.aliases)
            ? value.aliases.filter((item: unknown): item is string => typeof item === 'string' && !!item.trim()).map((item: string) => item.trim()) : undefined;
        return compactLexicalValue({ ...withAiSource(content, this.plugin.settings.aiService.provider, this.plugin.settings.aiService.model), aliases });
    }
}

/** Generation is an editable draft. Existing meanings never match by part of speech alone. */
export function mergeGeneratedContent(card: HiWordsWordCard, generated: HiWordsGeneratedContent): HiWordsWordCard {
    const merged: HiWordsWordCard = JSON.parse(JSON.stringify(card));
    if (!merged.aliases?.length && generated.aliases?.length) merged.aliases = generated.aliases;
    if (!merged.data.meanings.some(item => item.translation?.trim() || item.definition?.trim())) {
        merged.data.meanings = generated.meanings;
        merged.data.language = generated.language || merged.data.language;
        merged.data.translationLanguage = generated.translationLanguage || merged.data.translationLanguage;
        merged.data.itemType = generated.itemType || merged.data.itemType;
    } else {
        // New meanings remain separate for review; no cross-sense translation/definition filling.
        const key = (item: LexicalContent['meanings'][number]) => JSON.stringify([item.partsOfSpeech, item.translation || '', item.definition || '']);
        const existing = new Set(merged.data.meanings.map(key));
        merged.data.meanings.push(...generated.meanings.filter(item => !existing.has(key(item))));
    }
    if (generated.phonetics) {
        const current = merged.data.phonetics;
        merged.data.phonetics = { ...generated.phonetics, ...current, sourceIds: [...new Set([...(current?.sourceIds || []), ...(generated.phonetics.sourceIds || [])])] };
    }
    for (const key of ['examples', 'forms', 'derivedWords', 'phrases', 'relations', 'memory'] as const) {
        if (!merged.data[key]?.length && generated[key]?.length) Object.assign(merged.data, { [key]: generated[key] });
    }
    if (generated.morphology) merged.data.morphology = { ...generated.morphology, ...merged.data.morphology };
    if (generated.usage) merged.data.usage = { ...generated.usage, ...merged.data.usage };
    if (generated.sources?.length) merged.data.sources = [...(merged.data.sources || []), ...generated.sources.filter(source => !merged.data.sources?.some(item => item.id === source.id))];
    return compactLexicalValue(merged);
}
