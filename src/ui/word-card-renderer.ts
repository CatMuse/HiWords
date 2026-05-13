import type { App } from 'obsidian';
import { normalizePath, setIcon } from 'obsidian';
import type { VocabularyBookDisplaySettings, WordCard, WordCardDetailSection, WordCardPreviewDensity, WordCardRelation, WordDefinition } from '../utils';

export type WordCardRenderMode = 'popover' | 'sidebar';

interface RenderOptions {
    mode: WordCardRenderMode;
    app?: App;
    pronunciationVariant?: 'uk' | 'us';
    onPronunciationClick?: (variant: 'uk' | 'us') => void | Promise<void>;
    onOpenDetail?: () => void | Promise<void>;
    display?: VocabularyBookDisplaySettings;
}

export const DEFAULT_WORD_CARD_DETAIL_SECTIONS: WordCardDetailSection[] = [
    'definitions',
    'examples',
    'collocations',
    'phrases',
    'usage',
    'forms',
    'morphology',
    'confusables',
    'relations',
    'memory',
];

export const DEFAULT_WORD_CARD_PREVIEW_SECTIONS: WordCardDetailSection[] = [
    'definitions',
    'examples',
    'collocations',
];

export const DEFAULT_WORD_CARD_PREVIEW_DENSITY: WordCardPreviewDensity = 'standard';

export function renderWordCard(container: HTMLElement, wordDef: WordDefinition, options: RenderOptions): boolean {
    const card = wordDef.card;
    if (!card) return false;

    container.empty();

    const root = container.createDiv({
        cls: `hi-words-structured-card hi-words-structured-card-${options.mode}`,
    });

    const isPreview = options.mode === 'popover';
    const previewDensity = options.display?.previewDensity || DEFAULT_WORD_CARD_PREVIEW_DENSITY;
    const hiddenSections = options.display?.hiddenSections || [];
    const previewSections = uniqueSections(options.display?.previewSections || getLegacyPreviewSections(previewDensity))
        .filter(section => !hiddenSections.includes(section));
    const detailDefaults = DEFAULT_WORD_CARD_DETAIL_SECTIONS.filter(section => !previewSections.includes(section));
    const detailSections = uniqueSections(options.display?.detailSections || detailDefaults)
        .filter(section => !hiddenSections.includes(section) && !previewSections.includes(section));

    renderMeta(root, card, options.pronunciationVariant || 'us', options.onPronunciationClick);
    if (!isPreview) {
        renderImages(root, card, options.app);
    }

    const sections = isPreview ? previewSections : [...previewSections, ...detailSections];
    for (const section of sections) {
        renderDetailSection(root, card, section, isPreview ? previewDensity : undefined, options.mode);
    }

    if (isPreview && options.onOpenDetail) {
        renderDetailAction(root, options.onOpenDetail);
    }

    return true;
}

function uniqueSections(sections: WordCardDetailSection[]): WordCardDetailSection[] {
    const seen = new Set<WordCardDetailSection>();
    const result: WordCardDetailSection[] = [];

    for (const section of sections) {
        if (seen.has(section)) continue;
        seen.add(section);
        result.push(section);
    }

    return result;
}

function renderDetailSection(root: HTMLElement, card: WordCard, section: WordCardDetailSection, previewDensity?: WordCardPreviewDensity, mode: WordCardRenderMode = 'sidebar'): void {
    switch (section) {
        case 'definitions':
            renderDefinitions(root, card);
            return;
        case 'examples':
            renderExamples(root, card, getPreviewExampleLimit(previewDensity, !!previewDensity));
            return;
        case 'collocations':
            renderCollocations(root, card, getPreviewCollocationLimit(previewDensity, !!previewDensity));
            return;
        case 'phrases':
            renderPhrases(root, card);
            return;
        case 'usage':
            renderUsage(root, card);
            return;
        case 'forms':
            renderForms(root, card);
            return;
        case 'morphology':
            renderMorphology(root, card);
            return;
        case 'confusables':
            renderConfusables(root, card);
            return;
        case 'relations':
            renderRelations(root, card, mode);
            return;
        case 'memory':
            renderMemory(root, card);
            return;
    }
}

function getPreviewExampleLimit(density: WordCardPreviewDensity | undefined, isPreview: boolean): number | undefined {
    if (!isPreview) return undefined;
    return density === 'rich' ? 2 : 1;
}

function getPreviewCollocationLimit(density: WordCardPreviewDensity | undefined, isPreview: boolean): number | undefined {
    if (!isPreview) return undefined;
    if (density === 'simple') return 0;
    return density === 'rich' ? 8 : 5;
}

function getLegacyPreviewSections(density: WordCardPreviewDensity): WordCardDetailSection[] {
    return density === 'simple'
        ? ['definitions', 'examples']
        : DEFAULT_WORD_CARD_PREVIEW_SECTIONS;
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
        card.difficulty !== undefined ||
        card.priority !== undefined ||
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

    if (card.difficulty !== undefined) {
        meta.createSpan({ text: `Diff ${card.difficulty}`, cls: 'hi-words-structured-level' });
    }

    if (card.priority !== undefined) {
        meta.createSpan({ text: `P${card.priority}`, cls: 'hi-words-structured-level' });
    }

    if (card.register) {
        meta.createSpan({ text: card.register, cls: 'hi-words-structured-tag' });
    }

    const allTags = getDisplayTags(card);

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

function getDisplayTags(card: WordCard): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];

    for (const rawTag of [...(card.tags || []), ...(card.domains || []), ...(card.examTags || [])]) {
        const tag = rawTag.trim();
        const normalized = tag.toLowerCase();
        if (!tag || seen.has(normalized) || isInternalDisplayTag(normalized)) continue;

        seen.add(normalized);
        tags.push(tag);
    }

    return tags;
}

function isInternalDisplayTag(normalizedTag: string): boolean {
    return (
        /^cet\d+$/.test(normalizedTag) ||
        /^cet\d+-v\d+$/.test(normalizedTag) ||
        /^batch-\d+$/.test(normalizedTag) ||
        /^[a-z](?:-[a-z])?-words$/.test(normalizedTag)
    );
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

function renderExamples(root: HTMLElement, card: WordCard, limit?: number): void {
    if (!card.examples?.length) return;

    const section = createSection(root, 'Examples');
    for (const example of card.examples.slice(0, limit)) {
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
        card.memory.mnemonic ? { label: 'Mnemonic', value: card.memory.mnemonic } : null,
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

function renderForms(root: HTMLElement, card: WordCard): void {
    if (!card.forms || Object.keys(card.forms).length === 0) return;

    const section = createSection(root, 'Word forms');
    const list = section.createDiv({ cls: 'hi-words-structured-form-list' });
    const forms = uniqueValues(Object.values(card.forms).flatMap(value => valueToList(value)));

    for (const form of forms) {
        list.createSpan({ text: form, cls: 'hi-words-structured-form-chip' });
    }

    if (!list.children.length) {
        section.remove();
    }
}

function valueToList(value: string | string[] | number | boolean | null | undefined): string[] {
    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }
    if (value === null || value === undefined || value === '') return [];
    return [String(value).trim()].filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}

function renderMorphology(root: HTMLElement, card: WordCard): void {
    const morphology = card.morphology;
    if (!morphology) return;

    const hasContent = morphology.type ||
        morphology.root ||
        morphology.breakdown ||
        morphology.explanation ||
        morphology.compound?.length ||
        morphology.prefixes?.length ||
        morphology.suffixes?.length;
    if (!hasContent) return;

    const section = createSection(root, 'Morphology');

    if (morphology.breakdown) {
        section.createDiv({ text: morphology.breakdown, cls: 'hi-words-structured-breakdown' });
    }

    const chips = section.createDiv({ cls: 'hi-words-structured-chip-list' });
    if (morphology.type) chips.createSpan({ text: morphology.type, cls: 'hi-words-structured-chip' });
    if (morphology.root) chips.createSpan({ text: `root: ${morphology.root}`, cls: 'hi-words-structured-chip' });
    for (const item of morphology.compound || []) {
        chips.createSpan({ text: item, cls: 'hi-words-structured-chip' });
    }
    if (!chips.children.length) chips.remove();

    renderAffixes(section, 'Prefixes', morphology.prefixes);
    renderAffixes(section, 'Suffixes', morphology.suffixes);

    if (morphology.explanation) {
        section.createDiv({ text: morphology.explanation, cls: 'hi-words-structured-memory-text' });
    }
}

function renderCollocations(root: HTMLElement, card: WordCard, limit?: number): void {
    if (!card.collocations?.length) return;

    const section = createSection(root, 'Collocations');
    const list = section.createDiv({ cls: 'hi-words-structured-chip-list' });
    for (const item of card.collocations.slice(0, limit)) {
        list.createSpan({ text: item, cls: 'hi-words-structured-chip' });
    }
}

function renderPhrases(root: HTMLElement, card: WordCard): void {
    if (!card.phrases?.length) return;

    const section = createSection(root, 'Phrases');
    for (const item of card.phrases) {
        if (!item.phrase) continue;
        const phrase = section.createDiv({ cls: 'hi-words-structured-phrase' });
        const header = phrase.createDiv({ cls: 'hi-words-structured-phrase-header' });
        header.createSpan({ text: item.phrase, cls: 'hi-words-structured-confusable-word' });
        if (item.meaning) {
            header.createSpan({ text: item.meaning, cls: 'hi-words-structured-muted' });
        }
        if (item.note) {
            phrase.createDiv({ text: item.note, cls: 'hi-words-structured-memory-text' });
        }
        if (item.example) {
            phrase.createDiv({ text: item.example, cls: 'hi-words-structured-example-text' });
        }
    }
}

function renderUsage(root: HTMLElement, card: WordCard): void {
    const usage = card.usage;
    if (!usage) return;

    const hasContent = usage.register ||
        usage.domains?.length ||
        usage.topics?.length ||
        usage.commonPatterns?.length ||
        usage.mistakes?.length;
    if (!hasContent) return;

    const section = createSection(root, 'Usage');
    const chips = section.createDiv({ cls: 'hi-words-structured-chip-list' });
    if (usage.register) chips.createSpan({ text: usage.register, cls: 'hi-words-structured-chip' });
    for (const topic of [...(usage.topics || []), ...(usage.domains || [])]) {
        chips.createSpan({ text: topic, cls: 'hi-words-structured-chip' });
    }
    if (!chips.children.length) chips.remove();

    if (usage.commonPatterns?.length) {
        const patterns = section.createDiv({ cls: 'hi-words-structured-subsection' });
        patterns.createDiv({ text: 'Common patterns', cls: 'hi-words-structured-subtitle' });
        const list = patterns.createDiv({ cls: 'hi-words-structured-chip-list' });
        for (const pattern of usage.commonPatterns) {
            list.createSpan({ text: pattern, cls: 'hi-words-structured-chip hi-words-structured-chip-code' });
        }
    }

    if (usage.mistakes?.length) {
        const mistakes = section.createDiv({ cls: 'hi-words-structured-subsection' });
        mistakes.createDiv({ text: 'Common mistakes', cls: 'hi-words-structured-subtitle' });
        for (const item of usage.mistakes) {
            if (!item.wrong || !item.correct) continue;
            const row = mistakes.createDiv({ cls: 'hi-words-structured-mistake' });
            row.createDiv({ text: item.wrong, cls: 'hi-words-structured-wrong' });
            row.createDiv({ text: item.correct, cls: 'hi-words-structured-correct' });
            if (item.note) row.createDiv({ text: item.note, cls: 'hi-words-structured-memory-text' });
        }
    }
}

function renderRelations(root: HTMLElement, card: WordCard, mode: WordCardRenderMode): void {
    if (!card.relations?.length) return;

    const section = createSection(root, 'Related');

    const relations = card.relations.filter(relation => relation.target);
    if (relations.length === 0) {
        section.remove();
        return;
    }

    if (mode === 'sidebar') {
        renderRelationGraph(section, card, relations);
        return;
    }

    const list = section.createDiv({ cls: 'hi-words-structured-relation-list' });

    for (const relation of relations) {
        const item = list.createDiv({ cls: 'hi-words-structured-relation' });
        item.createSpan({ text: relation.type || 'related', cls: 'hi-words-structured-relation-type' });
        item.createSpan({ text: relation.target, cls: 'hi-words-structured-relation-target' });
        if (relation.targetType) {
            item.createSpan({ text: relation.targetType, cls: 'hi-words-structured-relation-target-type' });
        }
        if (relation.note) {
            item.createDiv({ text: relation.note, cls: 'hi-words-structured-memory-text' });
        }
    }

    if (!list.children.length) section.remove();
}

function renderRelationGraph(section: HTMLElement, card: WordCard, relations: WordCardRelation[]): void {
    const graphRelations = relations.slice(0, 8);
    const extraRelations = relations.slice(8);
    const graph = section.createDiv({ cls: 'hi-words-structured-relation-graph' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hi-words-structured-relation-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    graph.appendChild(svg);

    const center = { x: 50, y: 50 };
    graph.createDiv({
        cls: 'hi-words-structured-relation-node hi-words-structured-relation-node-center',
        text: card.word,
        attr: { style: `left: ${center.x}%; top: ${center.y}%;` },
    });

    graphRelations.forEach((relation, index) => {
        const point = getRelationGraphPoint(index, graphRelations.length);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(center.x));
        line.setAttribute('y1', String(center.y));
        line.setAttribute('x2', String(point.x));
        line.setAttribute('y2', String(point.y));
        line.setAttribute('class', `hi-words-structured-relation-edge is-${sanitizeClassName(relation.type || 'related')}`);
        svg.appendChild(line);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String((center.x + point.x) / 2));
        label.setAttribute('y', String((center.y + point.y) / 2));
        label.setAttribute('class', 'hi-words-structured-relation-edge-label');
        label.textContent = relation.type || 'related';
        svg.appendChild(label);

        const node = graph.createDiv({
            cls: `hi-words-structured-relation-node hi-words-structured-relation-node-target is-${sanitizeClassName(relation.targetType || relation.type || 'related')}`,
            attr: { style: `left: ${point.x}%; top: ${point.y}%;` },
        });
        node.createDiv({ cls: 'hi-words-structured-relation-node-word', text: relation.target });
        if (relation.targetType) {
            node.createDiv({ cls: 'hi-words-structured-relation-node-type', text: relation.targetType });
        }
    });

    const notedRelations = relations.filter(relation => relation.note);
    if (notedRelations.length) {
        const notes = section.createDiv({ cls: 'hi-words-structured-relation-notes' });
        for (const relation of notedRelations.slice(0, 4)) {
            const note = notes.createDiv({ cls: 'hi-words-structured-relation-note' });
            note.createSpan({ cls: 'hi-words-structured-relation-note-target', text: relation.target });
            note.createSpan({ cls: 'hi-words-structured-memory-text', text: relation.note || '' });
        }
    }

    if (extraRelations.length) {
        const list = section.createDiv({ cls: 'hi-words-structured-relation-list hi-words-structured-relation-extra-list' });
        for (const relation of extraRelations) {
            const item = list.createDiv({ cls: 'hi-words-structured-relation' });
            item.createSpan({ text: relation.type || 'related', cls: 'hi-words-structured-relation-type' });
            item.createSpan({ text: relation.target, cls: 'hi-words-structured-relation-target' });
            if (relation.targetType) item.createSpan({ text: relation.targetType, cls: 'hi-words-structured-relation-target-type' });
            if (relation.note) item.createDiv({ text: relation.note, cls: 'hi-words-structured-memory-text' });
        }
    }
}

function getRelationGraphPoint(index: number, total: number): { x: number; y: number } {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(total, 1);
    return {
        x: 50 + Math.cos(angle) * 34,
        y: 50 + Math.sin(angle) * 34,
    };
}

function sanitizeClassName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'related';
}

function renderConfusables(root: HTMLElement, card: WordCard): void {
    if (!card.confusables?.length) return;

    const section = createSection(root, 'Confusables');
    for (const item of card.confusables) {
        if (!item.word || !item.note) continue;
        const row = section.createDiv({ cls: 'hi-words-structured-confusable' });
        row.createSpan({ text: item.word, cls: 'hi-words-structured-confusable-word' });
        row.createSpan({ text: item.note, cls: 'hi-words-structured-memory-text' });
        if (item.examples?.length) {
            const examples = row.createDiv({ cls: 'hi-words-structured-confusable-examples' });
            for (const example of item.examples) {
                examples.createDiv({ text: example, cls: 'hi-words-structured-example-text' });
            }
        }
    }
}

function renderAffixes(root: HTMLElement, title: string, affixes?: Array<{ text: string; meaning?: string; role?: string }>): void {
    if (!affixes?.length) return;

    const group = root.createDiv({ cls: 'hi-words-structured-affix-group' });
    group.createDiv({ text: title, cls: 'hi-words-structured-subtitle' });

    for (const affix of affixes) {
        if (!affix.text) continue;
        const row = group.createDiv({ cls: 'hi-words-structured-affix' });
        row.createSpan({ text: affix.text, cls: 'hi-words-structured-confusable-word' });
        const details = [affix.meaning, affix.role].filter(Boolean).join(' · ');
        if (details) row.createSpan({ text: details, cls: 'hi-words-structured-memory-text' });
    }
}

function renderDetailAction(root: HTMLElement, onOpenDetail: () => void | Promise<void>): void {
    const action = root.createDiv({
        cls: 'hi-words-structured-detail-link hi-words-word-source',
        attr: { role: 'button', tabindex: '0' },
    });
    action.createSpan({ text: 'DETAILS', cls: 'hi-words-source-text' });
    const arrow = action.createSpan({ cls: 'hi-words-structured-detail-arrow' });
    setIcon(arrow, 'chevron-right');

    const open = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        void onOpenDetail();
    };

    action.addEventListener('click', open);
    action.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            open(event);
        }
    });
}

function createSection(root: HTMLElement, title: string): HTMLElement {
    const section = root.createDiv({ cls: 'hi-words-structured-section' });
    section.createDiv({ text: title, cls: 'hi-words-structured-section-title' });
    return section;
}
