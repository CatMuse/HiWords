import { HidictEntry, selectedWord } from './hidict';
import { prepareSelectionText } from '../utils/selection-text';
export type SelectionResult = { kind: 'dictionary'; entries: HidictEntry[] } | { kind: 'translation'; text: string } | { kind: 'miss' } | { kind: 'stale' };
export async function resolveSelection(text: string, options: {
    dictionary: boolean; ai: boolean; current: () => boolean;
    lookup: (word: string) => Promise<HidictEntry[]>;
    translate: (text: string) => Promise<string>;
}): Promise<SelectionResult> {
    const cleanText = prepareSelectionText(text);
    if (!options.current()) return { kind: 'stale' };
    if (!cleanText) return { kind: 'miss' };
    const word = selectedWord(cleanText);
    if (word && options.dictionary) {
        const entries = await options.lookup(word);
        if (!options.current()) return { kind: 'stale' };
        if (entries.length) return { kind: 'dictionary', entries };
    }
    if (!options.current()) return { kind: 'stale' };
    if (!options.ai) return { kind: 'miss' };
    const translated = await options.translate(cleanText);
    return options.current() ? { kind: 'translation', text: translated } : { kind: 'stale' };
}
