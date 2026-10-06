import type { Hidict, HidictEntry } from './hidict';
import { LexicalEntry, LexicalSource, normalizePartOfSpeech } from '../lexical/types';

/** Keep original grouped definition lines and multi-label forms; do not infer senses. */
export function hidictToLexicalEntry(entry: HidictEntry, dictionary?: Hidict): LexicalEntry {
    const raw = dictionary?.sources?.find(source => source.id === entry.sourceId);
    const source: LexicalSource = { id: entry.sourceId, type: 'dictionary', name: raw?.name || dictionary?.name || entry.sourceId,
        ...(raw?.url ? { url: raw.url } : {}), ...(dictionary?.version ? { version: dictionary.version } : {}), ...(raw?.license ? { license: raw.license } : {}) };
    const sourceIds = [source.id];
    const phonetics = Object.fromEntries(Object.entries(entry.phonetics).filter(([, value]) => value !== null)) as LexicalEntry['phonetics'];
    return {
        id: entry.id, text: entry.word, language: dictionary?.language || 'en', translationLanguage: dictionary?.definitionLanguage || 'zh-CN', itemType: 'word',
        meanings: entry.meanings.map((meaning, index) => ({ id: `${entry.id}-meaning-${index + 1}`, partsOfSpeech: meaning.partsOfSpeech.map(normalizePartOfSpeech), sourceLabels: meaning.sourceLabels.length ? [...meaning.sourceLabels] : undefined, translation: meaning.definitions.join('\n'), sourceIds })),
        phonetics: phonetics && Object.keys(phonetics).length ? { ...phonetics, sourceIds } : undefined,
        forms: entry.forms.length ? entry.forms.map(form => ({ text: form.word, types: [...form.types], sourceIds })) : undefined,
        frequency: { source: entry.frequency.source, ...(entry.frequency.rank !== null ? { rank: entry.frequency.rank } : {}), ...(entry.frequency.level !== null ? { level: entry.frequency.level } : {}) },
        sources: [source],
    };
}
