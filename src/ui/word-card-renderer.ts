import type { App } from 'obsidian';
import type { CardDisplaySection, VocabularyBookDisplaySettings, WordCardPreviewDensity, WordDefinition } from '../utils';
import { isConceptCard, isCustomCard, isPersonCard, isWordCard } from '../schema/hiwords';
import { getOrderedCardDisplaySections } from '../knowledge';
import { renderConceptCardSection, renderCustomCardSection, renderDynamicFieldSection, renderPersonCardSection } from './knowledge-card-sections';
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

export const DEFAULT_WORD_CARD_DETAIL_SECTIONS: CardDisplaySection[] = [
    'definitions', 'derivedWords', 'morphology', 'phrases', 'examples', 'memory',
    'relations', 'usage', 'forms', 'images', 'custom', 'note',
];

export const DEFAULT_WORD_CARD_PREVIEW_SECTIONS: CardDisplaySection[] = ['definitions'];
export const DEFAULT_WORD_CARD_PREVIEW_DENSITY: WordCardPreviewDensity = 'standard';

export function renderWordCard(container: HTMLElement, wordDef: WordDefinition, options: RenderOptions): boolean {
    const card = wordDef.card;
    const kind = wordDef.cardKind;
    if (!card || !kind) return false;
    container.empty();
    const root = container.createDiv({ cls: `hi-words-structured-card hi-words-structured-card-${options.mode}` });
    const isPreview = options.mode === 'popover';
    const density = options.display?.previewDensity || DEFAULT_WORD_CARD_PREVIEW_DENSITY;
    const hidden = new Set(options.display?.hiddenSections || []);
    const sectionDefinitions = getOrderedCardDisplaySections(kind, wordDef.cardModuleOrder, wordDef.cardFields);
    const supported = sectionDefinitions.filter(section => section.isAvailable(card)).map(section => section.id);
    const defaultPreview = sectionDefinitions.filter(section => section.previewByDefault).map(section => section.id);
    const previewMembership = new Set(unique(options.display?.previewSections || defaultPreview));
    const preview = supported.filter(section => previewMembership.has(section) && !hidden.has(section));
    const configuredDetails = new Set(unique(options.display?.detailSections || supported.filter(section => !previewMembership.has(section))));
    const details = supported.filter(section =>
        !previewMembership.has(section) && !hidden.has(section) &&
        (configuredDetails.has(section) || !options.display?.detailSections)
    );
    for (const section of supported) {
        if (!previewMembership.has(section) && !hidden.has(section) && !details.includes(section)) details.push(section);
    }
    const hasLayoutOverride = options.display?.previewSections !== undefined || options.display?.detailSections !== undefined;
    const sectionsToRender = isPreview
        ? preview
        : hasLayoutOverride
            ? [...preview, ...details]
            : supported.filter(section => !hidden.has(section));

    if (isWordCard(card, kind)) renderMeta(root, wordDef, options);
    for (const section of sectionsToRender) {
        renderSection(root, wordDef, section, isPreview ? density : undefined, options);
    }
    return true;
}

function renderMeta(root: HTMLElement, wordDef: WordDefinition, options: RenderOptions): void {
    const card = wordDef.card;
    if (!card || !wordDef.cardKind || !isWordCard(card, wordDef.cardKind)) return;
    const preferred = options.pronunciationVariant || 'us';
    const fallback = preferred === 'us' ? 'uk' : 'us';
    const value = card.data.phonetics?.[preferred] || card.data.phonetics?.[fallback];
    if (value) {
        const meta = options.pronunciationTarget || root.createDiv({ cls: 'hi-words-structured-meta' });
        const phonetic = meta.createSpan({ cls: 'hi-words-structured-phonetic' });
        const variant = card.data.phonetics?.[preferred] ? preferred : fallback;
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
    section: CardDisplaySection,
    density: WordCardPreviewDensity | undefined,
    options: RenderOptions
): void {
    const card = wordDef.card;
    if (!card || !wordDef.cardKind) return;
    if (section.startsWith('field:')) {
        const fieldId = section.slice('field:'.length);
        const field = wordDef.cardFields?.find(item => item.id === fieldId);
        if (field) renderDynamicFieldSection(root, card, field, options.app);
        return;
    }
    if (isPersonCard(card, wordDef.cardKind)) {
        renderPersonCardSection(root, card, section, options.app);
        return;
    }
    if (isConceptCard(card, wordDef.cardKind)) {
        renderConceptCardSection(root, card, section, options.app);
        return;
    }
    if (isCustomCard(card, wordDef.cardKind)) {
        renderCustomCardSection(root, card, section, options.app);
        return;
    }
    if (!isWordCard(card, wordDef.cardKind)) return;
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
        .createDiv({ text: 'My note', cls: 'hi-words-structured-section-title' });
    section.createDiv({ text: wordDef.userNote, cls: 'hi-words-structured-memory-text' });
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
