import type { TranslationResult } from '../services/translation-result';
import { dictText } from '../dictionary/text';
import { renderHiWordsMeanings, renderHiWordsSentences, renderHiWordsForms, renderHiWordsDerivedWords, renderHiWordsMorphology, renderHiWordsPhrases, renderHiWordsUsage, renderHiWordsRelations, renderHiWordsMemory, renderHiWordsSources } from './hiwords-card-sections';

/** Word details reuse the same content components as the vocabulary editor and library. */
export function renderAiTranslationResult(container: HTMLElement, result: TranslationResult): void {
    container.empty();
    const body = container.createDiv({ cls: 'hi-words-ai-result hi-words-translate-result' });
    const type = result.kind === 'word' ? result.itemType : result.kind;
    body.setAttribute('data-kind', type);
    if (result.kind === 'word') {
        const card = { data: result };
        renderHiWordsMeanings(body, card);
        if (result.reading?.contextMeaning) section(body, dictText('contextMeaning'), result.reading.contextMeaning, 'context');
        renderHiWordsSentences(body, card);
        renderHiWordsPhrases(body, card);
        renderHiWordsForms(body, card);
        renderHiWordsUsage(body, card);
        renderHiWordsMorphology(body, card);
        renderHiWordsDerivedWords(body, card);
        renderHiWordsRelations(body, card);
        renderHiWordsMemory(body, card);
        renderHiWordsSources(body, card);
    } else if (result.kind === 'sentence') {
        section(body, dictText('translation'), undefined, 'translation').createDiv({ cls: 'hi-words-ai-translation', text: result.translation });
        if (result.keyPhrases?.length) {
            const phrases = section(body, dictText('keyPhrases'), undefined, 'key-phrases');
            for (const item of result.keyPhrases) {
                const pair = phrases.createDiv({ cls: 'hi-words-ai-pair' });
                pair.createDiv({ cls: 'hi-words-ai-section-text', text: item.text });
                if (item.translation) pair.createDiv({ cls: 'hi-words-ai-example-translation', text: item.translation });
            }
        }
        if (result.structure) section(body, dictText('structure'), result.structure, 'structure');
        if (result.explanation) section(body, dictText('explanation'), result.explanation, 'explanation');
    } else body.createDiv({ cls: 'hi-words-ai-translation', text: result.translation });
}
function section(body: HTMLElement, label: string, text?: string, field?: string): HTMLElement {
    const element = body.createDiv({ cls: 'hi-words-ai-section' });
    if (field) element.setAttribute('data-field', field);
    element.createDiv({ cls: 'hi-words-ai-section-label', text: label });
    if (text) element.createDiv({ cls: 'hi-words-ai-section-text', text });
    return element;
}
