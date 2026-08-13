import type { App } from 'obsidian';
import type { VocabularyBookDisplaySettings, WordCardDetailSection, WordCardPreviewDensity, WordDefinition } from '../utils';
import {
    renderHiWordsCustom,
    renderHiWordsDerivedWords,
    renderHiWordsForms,
    renderHiWordsImages,
    renderHiWordsMeanings,
    renderHiWordsMemory,
    renderHiWordsMorphology,
    renderHiWordsPhrases,
    renderHiWordsRelations,
    renderHiWordsSentences,
    renderHiWordsUsage,
} from './hiwords-card-sections';

export type WordCardRenderMode = 'popover' | 'sidebar';

interface RenderOptions {
    mode: WordCardRenderMode;
    app?: App;
    pronunciationVariant?: 'uk' | 'us';
    pronunciationTarget?: HTMLElement;
    onPronunciationClick?: (variant: 'uk' | 'us') => void | Promise<void>;
    display?: VocabularyBookDisplaySettings;
}

export const DEFAULT_WORD_CARD_DETAIL_SECTIONS: WordCardDetailSection[] = [
    'definitions', 'derivedWords', 'morphology', 'phrases', 'examples', 'memory',
    'relations', 'usage', 'forms', 'images', 'custom', 'note',
];

export const DEFAULT_WORD_CARD_PREVIEW_SECTIONS: WordCardDetailSection[] = ['definitions'];
export const DEFAULT_WORD_CARD_PREVIEW_DENSITY: WordCardPreviewDensity = 'standard';

export function renderWordCard(container: HTMLElement, wordDef: WordDefinition, options: RenderOptions): boolean {
    const card = wordDef.card;
    if (!card) return false;
    container.empty();
    const root = container.createDiv({ cls: `hi-words-structured-card hi-words-structured-card-${options.mode}` });
    const isPreview = options.mode === 'popover';
    const density = options.display?.previewDensity || DEFAULT_WORD_CARD_PREVIEW_DENSITY;
    const hidden = new Set(options.display?.hiddenSections || []);
    const supported = getSupportedSections(wordDef);
    const preview = unique(options.display?.previewSections || DEFAULT_WORD_CARD_PREVIEW_SECTIONS)
        .filter(section => supported.includes(section) && !hidden.has(section));
    const details = unique(options.display?.detailSections || supported.filter(section => !preview.includes(section)))
        .filter(section => supported.includes(section) && !hidden.has(section) && !preview.includes(section));

    renderMeta(root, wordDef, options);
    for (const section of isPreview ? preview : [...preview, ...details]) {
        renderSection(root, wordDef, section, isPreview ? density : undefined, options);
    }
    return true;
}

function renderMeta(root: HTMLElement, wordDef: WordDefinition, options: RenderOptions): void {
    const card = wordDef.card;
    if (!card) return;
    const preferred = options.pronunciationVariant || 'us';
    const fallback = preferred === 'us' ? 'uk' : 'us';
    const value = card.phonetics?.[preferred] || card.phonetics?.[fallback];
    if (value) {
        const meta = options.pronunciationTarget || root.createDiv({ cls: 'hi-words-structured-meta' });
        const phonetic = meta.createSpan({ cls: 'hi-words-structured-phonetic' });
        const variant = card.phonetics?.[preferred] ? preferred : fallback;
        phonetic.createSpan({ text: variant.toUpperCase(), cls: 'hi-words-structured-phonetic-label' });
        phonetic.createSpan({ text: value });
        if (options.onPronunciationClick) {
            phonetic.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void options.onPronunciationClick?.(variant);
            });
        }
    }
}

function renderSection(
    root: HTMLElement,
    wordDef: WordDefinition,
    section: WordCardDetailSection,
    density: WordCardPreviewDensity | undefined,
    options: RenderOptions
): void {
    const card = wordDef.card;
    if (!card) return;
    switch (section) {
        case 'definitions': renderHiWordsMeanings(root, card); break;
        case 'examples': renderHiWordsSentences(root, card, density === 'rich' ? 2 : density ? 1 : undefined); break;
        case 'derivedWords': renderHiWordsDerivedWords(root, card); break;
        case 'morphology': renderHiWordsMorphology(root, card); break;
        case 'phrases': renderHiWordsPhrases(root, card); break;
        case 'usage': renderHiWordsUsage(root, card); break;
        case 'relations': renderHiWordsRelations(root, card); break;
        case 'memory': renderHiWordsMemory(root, card); break;
        case 'forms': renderHiWordsForms(root, card); break;
        case 'images': renderHiWordsImages(root, card, options.app); break;
        case 'custom': renderHiWordsCustom(root, card); break;
        case 'note': renderUserNote(root, wordDef); break;
    }
}

function renderUserNote(root: HTMLElement, wordDef: WordDefinition): void {
    if (!wordDef.userNote?.trim()) return;
    const section = root.createDiv({ cls: 'hi-words-structured-section' });
    section.createDiv({ cls: 'hi-words-structured-section-header' })
        .createDiv({ text: 'Note', cls: 'hi-words-structured-section-title' });
    section.createDiv({ text: wordDef.userNote, cls: 'hi-words-structured-memory-text' });
}

function getSupportedSections(wordDef: WordDefinition): WordCardDetailSection[] {
    return DEFAULT_WORD_CARD_DETAIL_SECTIONS;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
