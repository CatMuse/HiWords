/** Shared vocabulary content. Reading context and study state live outside this model. */
export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'numeral', 'auxiliary', 'modal', 'phrase', 'unknown'] as const;
export type PartOfSpeech = typeof PARTS_OF_SPEECH[number];
export const FORM_TYPES = ['past', 'pastParticiple', 'presentParticiple', 'thirdPersonSingular', 'plural', 'comparative', 'superlative'] as const;
export type FormType = typeof FORM_TYPES[number];
export interface SourcedContent { sourceIds?: string[] }
export interface LexicalMeaning extends SourcedContent { id: string; partsOfSpeech: PartOfSpeech[]; sourceLabels?: string[]; translation?: string; definition?: string }
export interface LexicalExample extends SourcedContent { id: string; text: string; translation?: string; meaningId?: string }
export interface LexicalForm extends SourcedContent { text: string; types: FormType[] }
export interface LexicalPhrase extends SourcedContent { id: string; text: string; type: 'phrase' | 'collocation'; translation?: string; examples?: LexicalExample[] }
export interface LexicalDerivedWord extends SourcedContent { text: string; partsOfSpeech?: PartOfSpeech[]; translation?: string }
export interface LexicalSource { id: string; type: 'dictionary' | 'ai'; name: string; url?: string; version?: string; license?: string; provider?: string; model?: string }
export interface LexicalPhonetics extends SourcedContent { us?: string; uk?: string; unclassified?: string }
export interface LexicalUsage { register?: string[]; patterns?: string[]; notes?: string[]; commonMistakes?: string[] }
export interface LexicalContent {
    language: string;
    translationLanguage: string;
    itemType: 'word' | 'phrase' | 'term';
    phonetics?: LexicalPhonetics;
    meanings: LexicalMeaning[];
    examples?: LexicalExample[];
    forms?: LexicalForm[];
    derivedWords?: LexicalDerivedWord[];
    morphology?: { components?: { type: string; form: string; meaning?: string }[]; explanation?: string };
    phrases?: LexicalPhrase[];
    usage?: LexicalUsage;
    relations?: { type: string; target: string; note?: string }[];
    memory?: { type: string; text: string }[];
    frequency?: { source: string; rank?: number; level?: number };
    sources?: LexicalSource[];
}
export interface LexicalEntry extends LexicalContent { id: string; text: string; aliases?: string[] }

export function normalizePartOfSpeech(value: string): PartOfSpeech {
    const aliases: Record<string, PartOfSpeech> = { 'n.': 'noun', 'v.': 'verb', 'adj.': 'adjective', 'adv.': 'adverb', 'pron.': 'pronoun', 'prep.': 'preposition', 'conj.': 'conjunction', 'det.': 'determiner', 'interj.': 'interjection', 'num.': 'numeral', 'aux.': 'auxiliary', 'phr.': 'phrase', 'noun phrase': 'noun', 'verb phrase': 'verb', 'phrasal verb': 'verb', 'modal verb': 'modal', 'auxiliary verb': 'auxiliary', article: 'determiner' };
    const key = value.trim().toLowerCase();
    return aliases[key] || (PARTS_OF_SPEECH.includes(key as PartOfSpeech) ? key as PartOfSpeech : 'unknown');
}
export function partOfSpeechLabel(value: string): string {
    const labels: Record<string, string> = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.', determiner: 'det.', interjection: 'interj.', numeral: 'num.', auxiliary: 'aux.', modal: 'modal v.', phrase: 'phr.', unknown: '' };
    return labels[value] || '';
}
export function meaningLabel(meaning: Pick<LexicalMeaning, 'partsOfSpeech' | 'sourceLabels'>): string {
    return meaning.sourceLabels?.length ? meaning.sourceLabels.map(label => /^[a-z]+$/i.test(label) ? `${label}.` : label).join('/') : meaning.partsOfSpeech.map(partOfSpeechLabel).filter(Boolean).join('/');
}
export function lexicalDefinition(content: Pick<LexicalContent, 'meanings'>): string {
    return content.meanings.map(item => [meaningLabel(item), item.translation || item.definition].filter(Boolean).join(' ')).filter(Boolean).join('\n');
}

/** Explicit projection prevents reading context and provider wrappers entering shared files. */
export function lexicalContentOf(entry: LexicalContent): LexicalContent {
    const { language, translationLanguage, itemType, phonetics, meanings, examples, forms, derivedWords, morphology, phrases, usage, relations, memory, frequency, sources } = entry;
    return { language, translationLanguage, itemType, phonetics, meanings, examples, forms, derivedWords, morphology, phrases, usage, relations, memory, frequency, sources };
}
