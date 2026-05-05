import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';
import type { WordCard, WordDefinition } from '../utils';

export type WordCardRenderMode = 'popover' | 'sidebar';

interface RenderOptions {
    mode: WordCardRenderMode;
    app?: App;
    pronunciationVariant?: 'uk' | 'us';
    onPronunciationClick?: (variant: 'uk' | 'us') => void | Promise<void>;
}

export function renderWordCard(container: HTMLElement, wordDef: WordDefinition, options: RenderOptions): boolean {
    const card = wordDef.card;
    if (!card) return false;

    container.empty();

    const root = container.createDiv({
        cls: `hi-words-structured-card hi-words-structured-card-${options.mode}`,
    });

    renderMeta(root, card, options.pronunciationVariant || 'us', options.onPronunciationClick);
    renderImages(root, card, options.app);
    renderDefinitions(root, card);
    renderExamples(root, card);
    renderMemory(root, card);
    renderCollocations(root, card);
    renderConfusables(root, card);

    return true;
}

function renderMeta(
    root: HTMLElement,
    card: WordCard,
    pronunciationVariant: 'uk' | 'us',
    onPronunciationClick?: (variant: 'uk' | 'us') => void | Promise<void>
): void {
    const phonetics = getPhoneticItems(card, pronunciationVariant);
    const hasMeta = phonetics.length > 0 ||
        card.level ||
        card.frequency !== undefined ||
        card.register ||
        card.tags?.length ||
        card.domains?.length ||
        card.examTags?.length ||
        card.aliases?.length;
    if (!hasMeta) return;

    const meta = root.createDiv({ cls: 'hi-words-structured-meta' });

    for (const item of phonetics) {
        const phonetic = meta.createSpan({ cls: 'hi-words-structured-phonetic' });
        if (onPronunciationClick) {
            phonetic.setAttribute('aria-label', `Play ${item.variant.toUpperCase()} pronunciation`);
            phonetic.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void onPronunciationClick(item.variant);
            });
        }
        if (item.label) {
            phonetic.createSpan({ text: item.label, cls: 'hi-words-structured-phonetic-label' });
        }
        phonetic.createSpan({ text: item.value });
    }

    if (card.level) {
        meta.createSpan({ text: card.level, cls: 'hi-words-structured-level' });
    }

    if (card.frequency !== undefined) {
        meta.createSpan({ text: `Freq ${card.frequency}`, cls: 'hi-words-structured-level' });
    }

    if (card.register) {
        meta.createSpan({ text: card.register, cls: 'hi-words-structured-tag' });
    }

    const allTags = [
        ...(card.tags || []),
        ...(card.domains || []),
        ...(card.examTags || []),
    ];

    if (allTags.length) {
        const tags = meta.createSpan({ cls: 'hi-words-structured-tags' });
        for (const tag of allTags) {
            tags.createSpan({ text: tag, cls: 'hi-words-structured-tag' });
        }
    }

    if (card.aliases?.length) {
        const aliases = root.createDiv({ cls: 'hi-words-structured-aliases' });
        aliases.createSpan({ text: 'Forms', cls: 'hi-words-structured-label' });
        aliases.createSpan({ text: card.aliases.join(', '), cls: 'hi-words-structured-muted' });
    }
}

function getPhoneticItems(card: WordCard, pronunciationVariant: 'uk' | 'us'): Array<{ label: string; value: string; variant: 'uk' | 'us' }> {
    if (card.phonetics?.uk || card.phonetics?.us) {
        const preferred = card.phonetics[pronunciationVariant];
        if (preferred) {
            return [{ label: pronunciationVariant.toUpperCase(), value: preferred, variant: pronunciationVariant }];
        }

        const fallbackVariant = pronunciationVariant === 'uk' ? 'us' : 'uk';
        const fallback = card.phonetics[fallbackVariant];
        return fallback ? [{ label: fallbackVariant.toUpperCase(), value: fallback, variant: fallbackVariant }] : [];
    }

    return card.phonetic ? [{ label: '', value: card.phonetic, variant: pronunciationVariant }] : [];
}

function renderImages(root: HTMLElement, card: WordCard, app?: App): void {
    if (!card.images?.length) return;

    const image = card.images.find(item => item.src);
    if (!image) return;

    const figure = root.createEl('figure', { cls: 'hi-words-structured-image' });
    const imageSrc = resolveImageSrc(image.src, app);
    const img = figure.createEl('img', {
        attr: {
            src: imageSrc,
            alt: image.alt || card.word,
            loading: 'lazy',
        },
    });
    img.addEventListener('error', () => {
        figure.remove();
    });
    if (image.caption || image.credit) {
        const caption = figure.createEl('figcaption');
        caption.setText([image.caption, image.credit].filter(Boolean).join(' · '));
    }
}

function resolveImageSrc(src: string, app?: App): string {
    if (/^(https?:|data:|app:)/i.test(src)) {
        return src;
    }

    if (!app) {
        return src;
    }

    return app.vault.adapter.getResourcePath(normalizePath(src));
}

function renderDefinitions(root: HTMLElement, card: WordCard): void {
    const section = createSection(root, 'Definition');

    if (card.definition?.trim()) {
        section.createDiv({ text: card.definition.trim(), cls: 'hi-words-structured-definition-text' });
        return;
    }

    if (!card.definitions?.length) {
        section.remove();
        return;
    }

    for (const definition of card.definitions) {
        const item = section.createDiv({ cls: 'hi-words-structured-definition-item' });
        if (definition.pos) {
            item.createSpan({ text: definition.pos, cls: 'hi-words-structured-pos' });
        }
        const body = item.createDiv({ cls: 'hi-words-structured-definition-body' });
        if (definition.zh) {
            body.createDiv({ text: definition.zh, cls: 'hi-words-structured-zh' });
        }
        if (definition.en) {
            body.createDiv({ text: definition.en, cls: 'hi-words-structured-en' });
        }
    }
}

function renderExamples(root: HTMLElement, card: WordCard): void {
    if (!card.examples?.length) return;

    const section = createSection(root, 'Examples');
    for (const example of card.examples) {
        if (!example.text) continue;
        const item = section.createDiv({ cls: 'hi-words-structured-example' });
        item.createDiv({ text: example.text, cls: 'hi-words-structured-example-text' });
        if (example.translation) {
            item.createDiv({ text: example.translation, cls: 'hi-words-structured-example-translation' });
        }
        if (example.source) {
            item.createDiv({ text: example.source, cls: 'hi-words-structured-example-source' });
        }
    }
}

function renderMemory(root: HTMLElement, card: WordCard): void {
    if (!card.memory) return;

    const values = [
        card.memory.root ? { label: 'Root', value: card.memory.root } : null,
        card.memory.hint ? { label: 'Hint', value: card.memory.hint } : null,
        card.memory.note ? { label: 'Note', value: card.memory.note } : null,
    ].filter((item): item is { label: string; value: string } => item !== null);

    if (values.length === 0) return;

    const section = createSection(root, 'Memory');
    for (const item of values) {
        const row = section.createDiv({ cls: 'hi-words-structured-memory-row' });
        row.createSpan({ text: item.label, cls: 'hi-words-structured-label' });
        row.createSpan({ text: item.value, cls: 'hi-words-structured-memory-text' });
    }
}

function renderCollocations(root: HTMLElement, card: WordCard): void {
    if (!card.collocations?.length) return;

    const section = createSection(root, 'Collocations');
    const list = section.createDiv({ cls: 'hi-words-structured-chip-list' });
    for (const item of card.collocations) {
        list.createSpan({ text: item, cls: 'hi-words-structured-chip' });
    }
}

function renderConfusables(root: HTMLElement, card: WordCard): void {
    if (!card.confusables?.length) return;

    const section = createSection(root, 'Confusables');
    for (const item of card.confusables) {
        if (!item.word || !item.note) continue;
        const row = section.createDiv({ cls: 'hi-words-structured-confusable' });
        row.createSpan({ text: item.word, cls: 'hi-words-structured-confusable-word' });
        row.createSpan({ text: item.note, cls: 'hi-words-structured-memory-text' });
    }
}

function createSection(root: HTMLElement, title: string): HTMLElement {
    const section = root.createDiv({ cls: 'hi-words-structured-section' });
    section.createDiv({ text: title, cls: 'hi-words-structured-section-title' });
    return section;
}
