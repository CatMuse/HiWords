import type { LexicalEntry } from '../lexical/types';
import { meaningLabel } from '../lexical/types';
import { dictText } from '../dictionary/text';
function formatPhonetic(text: string): string {
    const value = text.trim();
    return /^(\/.*\/|\[.*\])$/.test(value) ? value : `/${value}/`;
}
function compactMeaning(meaning: LexicalEntry['meanings'][number]): string {
    return (meaning.translation || meaning.definition || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('；');
}
export function hidictDefinition(entry: LexicalEntry): string {
    return entry.meanings.map(meaning => [meaningLabel(meaning), compactMeaning(meaning)].filter(Boolean).join(' ')).join('\n');
}
export function renderHidictResult(container: HTMLElement, entries: LexicalEntry[], onSelect: (entry: LexicalEntry, definition: string) => void, options: { phoneticsContainer?: HTMLElement; onPhonetic?: (element: HTMLElement) => void; pronunciationVariant?: 'uk' | 'us' } = {}): void {
    container.empty();
    let body: HTMLElement;
    let headerPhonetics: HTMLElement | undefined;
    const show = (entry: LexicalEntry) => {
        body.empty();
        headerPhonetics?.remove();
        const phonetics = (options.phoneticsContainer || body).createDiv({ cls: 'hi-words-hidict-phonetics hi-words-tooltip-title-phonetic' });
        if (options.phoneticsContainer) headerPhonetics = phonetics;
        const text = entry.phonetics?.[options.pronunciationVariant || 'us'] || entry.phonetics?.unclassified;
        if (text) {
            const chip = phonetics.createDiv({ cls: 'hi-words-hidict-phonetic' });
            const transcription = chip.createSpan({ cls: 'hi-words-hidict-transcription', text: formatPhonetic(text) });
            options.onPhonetic?.(transcription);
        }
        const definition = hidictDefinition(entry);
        const meanings = body.createDiv({ cls: 'hi-words-translate-result hi-words-hidict-meanings' });
        for (const meaning of entry.meanings) {
            const row = meanings.createDiv({ cls: 'hi-words-hidict-meaning' });
            const label = meaningLabel(meaning);
            row.createSpan({ cls: 'hi-words-hidict-pos', text: label ? label : '—' });
            row.createSpan({ cls: 'hi-words-hidict-definition', text: compactMeaning(meaning) });
        }
        const formOrder = ['plural', 'thirdPersonSingular', 'presentParticiple', 'past', 'pastParticiple', 'comparative', 'superlative'];
        const priority = (form: NonNullable<LexicalEntry['forms']>[number]) => Math.min(...form.types.map(type => formOrder.indexOf(type)));
        const forms = [...new Set([...(entry.forms || [])].sort((a, b) => priority(a) - priority(b)).map(form => form.text))];
        if (forms.length) body.createDiv({ cls: 'hi-words-hidict-forms', text: forms.join(' / ') });
        const frequency = body.createDiv({ cls: 'hi-words-hidict-frequency' });
        if (entry.frequency?.level === undefined) frequency.createSpan({ cls: 'hi-words-hidict-frequency-value', text: '—', attr: { 'aria-label': dictText('unknown') } });
        else {
            const marks = frequency.createSpan({ cls: 'hi-words-hidict-frequency-marks', attr: { role: 'img', 'aria-label': `${dictText('frequency')} ${entry.frequency!.level}/5` } });
            for (let i = 1; i <= 5; i++) marks.createSpan({ cls: i <= entry.frequency!.level ? 'is-filled' : '' }).setAttribute('aria-hidden', 'true');
            frequency.createSpan({ cls: 'hi-words-hidict-frequency-value', text: `${entry.frequency!.level}/5` });
        }
        onSelect(entry, definition);
    };
    if (entries.length > 1) {
        const select = container.createEl('select', { attr: { 'aria-label': dictText('candidates') } });
        entries.forEach((entry, i) => select.createEl('option', { value: String(i), text: entry.text }));
        select.addEventListener('change', () => show(entries[Number(select.value)]));
    }
    body = container.createDiv({ cls: 'hi-words-hidict-result' });
    show(entries[0]);
}
