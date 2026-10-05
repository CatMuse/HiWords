import { HidictEntry } from '../dictionary/hidict';
import { dictText } from '../dictionary/text';
function meaningLabel(meaning: HidictEntry['meanings'][number]): string {
    return meaning.sourceLabels.length ? meaning.sourceLabels.join('/') : meaning.partsOfSpeech.filter(p => p !== 'unknown').join('/');
}
function formatPhonetic(text: string): string {
    const value = text.trim();
    return /^(\/.*\/|\[.*\])$/.test(value) ? value : `/${value}/`;
}
export function hidictDefinition(entry: HidictEntry): string {
    return entry.meanings.map(m => {
        const label = meaningLabel(m);
        return `${label ? label + '. ' : ''}${m.definitions.join('；')}`;
    }).join('\n');
}
export function renderHidictResult(container: HTMLElement, entries: HidictEntry[], onSelect: (entry: HidictEntry, definition: string) => void, options: { phoneticsContainer?: HTMLElement; onPhonetic?: (element: HTMLElement) => void; pronunciationVariant?: 'uk' | 'us' } = {}): void {
    container.empty();
    let body: HTMLElement;
    let headerPhonetics: HTMLElement | undefined;
    const show = (entry: HidictEntry) => {
        body.empty();
        headerPhonetics?.remove();
        const phonetics = (options.phoneticsContainer || body).createDiv({ cls: 'hi-words-hidict-phonetics hi-words-tooltip-title-phonetic' });
        if (options.phoneticsContainer) headerPhonetics = phonetics;
        const text = entry.phonetics[options.pronunciationVariant || 'us'] || entry.phonetics.unclassified;
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
            row.createSpan({ cls: 'hi-words-hidict-pos', text: label ? `${label}.` : '—' });
            row.createSpan({ cls: 'hi-words-hidict-definition', text: meaning.definitions.join('；') });
        }
        const formOrder = ['plural', 'thirdPersonSingular', 'presentParticiple', 'past', 'pastParticiple', 'comparative', 'superlative'];
        const priority = (form: HidictEntry['forms'][number]) => Math.min(...form.types.map(type => formOrder.indexOf(type)));
        const forms = [...new Set([...entry.forms].sort((a, b) => priority(a) - priority(b)).map(form => form.word))];
        if (forms.length) body.createDiv({ cls: 'hi-words-hidict-forms', text: forms.join(' / ') });
        const frequency = body.createDiv({ cls: 'hi-words-hidict-frequency' });
        if (entry.frequency.level === null) frequency.createSpan({ cls: 'hi-words-hidict-frequency-value', text: '—', attr: { 'aria-label': dictText('unknown') } });
        else {
            const marks = frequency.createSpan({ cls: 'hi-words-hidict-frequency-marks', attr: { role: 'img', 'aria-label': `${dictText('frequency')} ${entry.frequency.level}/5` } });
            for (let i = 1; i <= 5; i++) marks.createSpan({ cls: i <= entry.frequency.level ? 'is-filled' : '' }).setAttribute('aria-hidden', 'true');
            frequency.createSpan({ cls: 'hi-words-hidict-frequency-value', text: `${entry.frequency.level}/5` });
        }
        onSelect(entry, definition);
    };
    if (entries.length > 1) {
        const select = container.createEl('select', { attr: { 'aria-label': dictText('candidates') } });
        entries.forEach((entry, i) => select.createEl('option', { value: String(i), text: entry.word }));
        select.addEventListener('change', () => show(entries[Number(select.value)]));
    }
    body = container.createDiv({ cls: 'hi-words-hidict-result' });
    show(entries[0]);
}
