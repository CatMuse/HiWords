import { FORM_TYPES, LexicalContent, PARTS_OF_SPEECH } from './types';
export const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const optionalString = (value: unknown): boolean => value === undefined || typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const optionalStrings = (value: unknown): boolean => value === undefined || strings(value);
const array = (value: unknown, check: (item: Record<string, unknown>) => boolean): boolean => value === undefined || (Array.isArray(value) && value.every(item => record(item) && check(item)));
const sourced = (item: Record<string, unknown>): boolean => optionalStrings(item.sourceIds);
const positions = (value: unknown): boolean => strings(value) && value.length > 0 && value.every(item => PARTS_OF_SPEECH.includes(item as typeof PARTS_OF_SPEECH[number]));
const example = (item: Record<string, unknown>): boolean => typeof item.id === 'string' && typeof item.text === 'string' && optionalString(item.translation) && optionalString(item.meaningId) && sourced(item);

/** Structural validation accepts editable drafts; completeness is checked before saving. */
export function isLexicalContent(value: unknown): value is LexicalContent {
    if (!record(value)) return false;
    if (typeof value.language !== 'string' || typeof value.translationLanguage !== 'string' || !['word', 'phrase', 'term'].includes(value.itemType as string)) return false;
    if (!Array.isArray(value.meanings) || !value.meanings.every(item => record(item) && typeof item.id === 'string' && positions(item.partsOfSpeech) && optionalStrings(item.sourceLabels) && optionalString(item.translation) && optionalString(item.definition) && sourced(item))) return false;
    if (value.phonetics !== undefined && !(record(value.phonetics) && ['us', 'uk', 'unclassified'].every(key => optionalString((value.phonetics as Record<string, unknown>)[key])) && sourced(value.phonetics))) return false;
    if (!array(value.examples, example) || !array(value.forms, item => typeof item.text === 'string' && strings(item.types) && item.types.every(type => FORM_TYPES.includes(type as typeof FORM_TYPES[number])) && sourced(item))) return false;
    if (!array(value.derivedWords, item => typeof item.text === 'string' && (item.partsOfSpeech === undefined || positions(item.partsOfSpeech)) && optionalString(item.translation) && sourced(item))) return false;
    if (!array(value.phrases, item => typeof item.id === 'string' && typeof item.text === 'string' && ['phrase', 'collocation'].includes(item.type as string) && optionalString(item.translation) && array(item.examples, example) && sourced(item))) return false;
    if (value.usage !== undefined && !(record(value.usage) && ['register', 'patterns', 'notes', 'commonMistakes'].every(key => optionalStrings((value.usage as Record<string, unknown>)[key])))) return false;
    if (value.morphology !== undefined && !(record(value.morphology) && optionalString(value.morphology.explanation) && array(value.morphology.components, item => typeof item.type === 'string' && typeof item.form === 'string' && optionalString(item.meaning)))) return false;
    if (!array(value.relations, item => typeof item.type === 'string' && typeof item.target === 'string' && optionalString(item.note)) || !array(value.memory, item => typeof item.type === 'string' && typeof item.text === 'string')) return false;
    if (value.frequency !== undefined && !(record(value.frequency) && typeof value.frequency.source === 'string' && (value.frequency.rank === undefined || (Number.isInteger(value.frequency.rank) && Number(value.frequency.rank) > 0)) && (value.frequency.level === undefined || (Number.isInteger(value.frequency.level) && Number(value.frequency.level) >= 1 && Number(value.frequency.level) <= 5)))) return false;
    if (!array(value.sources, item => typeof item.id === 'string' && ['dictionary', 'ai'].includes(item.type as string) && typeof item.name === 'string' && ['url', 'version', 'license', 'provider', 'model'].every(key => optionalString(item[key])))) return false;
    const ids = new Set<string>();
    for (const item of [...value.meanings, ...(value.examples as Record<string, unknown>[] || []), ...(value.phrases as Record<string, unknown>[] || []), ...(value.phrases as Record<string, unknown>[] || []).flatMap(item => item.examples as Record<string, unknown>[] || [])]) {
        if (!item.id || ids.has(item.id as string)) return false;
        ids.add(item.id as string);
    }
    const sources = value.sources as Record<string, unknown>[] || [];
    const sourceIds = new Set(sources.map(item => item.id));
    if (sourceIds.size !== sources.length || sources.some(item => !(item.id as string).trim())) return false;
    const items = [...value.meanings, ...(value.examples as Record<string, unknown>[] || []), ...(value.forms as Record<string, unknown>[] || []), ...(value.derivedWords as Record<string, unknown>[] || []), ...(value.phrases as Record<string, unknown>[] || []), ...(value.phrases as Record<string, unknown>[] || []).flatMap(item => item.examples as Record<string, unknown>[] || []), ...(record(value.phonetics) ? [value.phonetics] : [])];
    const meanings = new Set(value.meanings.map(item => item.id));
    return items.every(item => (item.sourceIds as string[] || []).every(id => sourceIds.has(id)) && (item.meaningId === undefined || meanings.has(item.meaningId)));
}

/** Complete shared entries may be monolingual, but never contain empty content items. */
export function validateLexicalContent(content: LexicalContent): { path: string; message: string }[] {
    const issues: { path: string; message: string }[] = [];
    const add = (path: string, message: string) => issues.push({ path, message });
    if (!content.language.trim()) add('language', 'Choose a word language.');
    if (!content.translationLanguage.trim()) add('translationLanguage', 'Choose a translation language.');
    if (!content.meanings.length) add('meanings', 'Add at least one meaning.');
    content.meanings.forEach((meaning, index) => { if (!meaning.translation?.trim() && !meaning.definition?.trim()) add(`meanings[${index}]`, 'Add a translation or an original-language definition.'); });
    content.examples?.forEach((example, index) => { if (!example.text.trim()) add(`examples[${index}].text`, 'Add example text.'); });
    content.forms?.forEach((form, index) => { if (!form.text.trim() || !form.types.length) add(`forms[${index}]`, 'Add a form and select its types.'); });
    content.phrases?.forEach((phrase, index) => {
        if (!phrase.text.trim()) add(`phrases[${index}].text`, 'Add phrase text.');
        phrase.examples?.forEach((example, exampleIndex) => { if (!example.text.trim()) add(`phrases[${index}].examples[${exampleIndex}]`, 'Add example text.'); });
    });
    return issues;
}
