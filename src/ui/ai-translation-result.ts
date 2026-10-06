import { aiMeaningLabel, TranslationResult } from '../services/translation-result';
import { dictText } from '../dictionary/text';

/** All model text is rendered as text, never HTML or Markdown. */
export function renderAiTranslationResult(container: HTMLElement, result: TranslationResult): void {
    container.empty();
    const body = container.createDiv({ cls: 'hi-words-ai-result hi-words-translate-result' });
    const type = result.kind === 'word' && result.lexicalType === 'phrase' ? 'phrase' : result.kind;
    body.setAttribute('data-kind', type);
    if (type !== 'text') body.createDiv({ cls: 'hi-words-ai-type', text: dictText(type === 'phrase' ? 'aiPhrase' : type === 'word' ? 'aiWord' : 'aiSentence') });
    if (result.kind === 'word') {
        const meanings = section(body, dictText(type === 'phrase' ? 'phraseMeaning' : 'definition'), undefined, 'meanings');
        for (const meaning of result.meanings) {
            const row = meanings.createDiv({ cls: 'hi-words-ai-meaning' });
            if (aiMeaningLabel(meaning.pos)) row.createSpan({ cls: 'hi-words-ai-pos', text: aiMeaningLabel(meaning.pos) });
            else row.classList.add('hi-words-ai-meaning-unlabelled');
            row.createSpan({ cls: 'hi-words-ai-definition', text: meaning.definition });
        }
        if (result.contextMeaning) section(body, dictText('contextMeaning'), result.contextMeaning, 'context');
        if (result.usage) section(body, dictText('usage'), result.usage, 'usage');
        pairSection(body, dictText('collocations'), result.collocations, 'collocations');
        const examples = [...(result.example ? [result.example] : []), ...(result.examples || [])];
        pairSection(body, dictText('example'), examples.filter((item, index) => examples.findIndex(other => other.text === item.text && other.translation === item.translation) === index), 'examples');
        for (const [items, label, field] of [[result.scenarios, dictText('scenarios'), 'scenarios'], [result.pitfalls, dictText('pitfalls'), 'pitfalls']] as const) {
            if (!items?.length) continue;
            const group = section(body, label, undefined, field);
            const list = group.createEl('ul', { cls: 'hi-words-ai-list' });
            for (const item of items) list.createEl('li', { text: item });
        }
    } else if (result.kind === 'sentence') {
        body.createDiv({ cls: 'hi-words-ai-source', text: result.text });
        section(body, dictText('translation'), undefined, 'translation').createDiv({ cls: 'hi-words-ai-translation', text: result.translation });
        pairSection(body, dictText('keyPhrases'), result.keyPhrases, 'key-phrases');
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

function pairSection(body: HTMLElement, label: string, items: { text: string; translation: string }[] | undefined, field: string): void {
    if (!items?.length) return;
    const group = section(body, label, undefined, field);
    for (const item of items) {
        const pair = group.createDiv({ cls: 'hi-words-ai-pair' });
        pair.createDiv({ cls: 'hi-words-ai-section-text', text: item.text });
        pair.createDiv({ cls: 'hi-words-ai-example-translation', text: item.translation });
    }
}
