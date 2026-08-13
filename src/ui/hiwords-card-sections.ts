import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';
import type { HiWordsCard, HiWordsMorphologyComponent } from '../schema/hiwords';

export function renderHiWordsMeanings(root: HTMLElement, card: HiWordsCard, limit?: number): void {
    const meanings = card.meanings.filter(item => item.translation.trim() || item.definition.trim());
    if (!meanings.length) return;
    const section = createSection(root, 'Definition');
    for (const meaning of meanings.slice(0, limit)) {
        const item = section.createDiv({ cls: 'hi-words-card-sense' });
        const header = item.createDiv({ cls: 'hi-words-card-sense-header' });
        header.createSpan({ text: formatPartOfSpeech(meaning.partOfSpeech), cls: 'hi-words-structured-pos' });
        if (meaning.translation.trim()) header.createSpan({ text: meaning.translation.trim(), cls: 'hi-words-structured-zh hi-words-card-sense-translation' });
        if (meaning.definition.trim()) item.createDiv({ text: meaning.definition.trim(), cls: 'hi-words-structured-en' });
    }
    if (limit !== undefined && meanings.length > limit) {
        section.createDiv({ text: `${meanings.length - limit} more meanings`, cls: 'hi-words-card-more-hint' });
    }
}

export function renderHiWordsSentences(root: HTMLElement, card: HiWordsCard, limit?: number): void {
    const sentences = (card.sentences || []).filter(sentence => sentence.text.trim());
    if (!sentences.length) return;
    const section = createSection(root, 'Sentence');
    for (const sentence of sentences.slice(0, limit)) {
        const item = section.createDiv({ cls: 'hi-words-structured-example hi-words-card-example' });
        item.createDiv({ text: sentence.text, cls: 'hi-words-structured-example-text' });
        if (sentence.translation) item.createDiv({ text: sentence.translation, cls: 'hi-words-structured-example-translation' });
        if (sentence.source) item.createDiv({ text: sentence.source, cls: 'hi-words-structured-example-source' });
    }
}

export function renderHiWordsForms(root: HTMLElement, card: HiWordsCard): void {
    const forms = (card.forms || []).filter(item => item.form.trim());
    if (!forms.length) return;
    const section = createSection(root, 'Word forms');
    const list = section.createDiv({ cls: 'hi-words-structured-form-list' });
    for (const item of forms) {
        const chip = list.createSpan({ cls: 'hi-words-structured-form-chip hi-words-card-form-chip' });
        chip.createSpan({ text: item.form, cls: 'hi-words-card-form-value' });
        chip.createSpan({ text: humanizeKey(item.type), cls: 'hi-words-card-form-type' });
    }
}

export function renderHiWordsDerivedWords(root: HTMLElement, card: HiWordsCard): void {
    const words = (card.derivedWords || []).filter(item => item.word.trim());
    if (!words.length) return;
    const section = createSection(root, 'Derived words');
    const list = section.createDiv({ cls: 'hi-words-card-derived-list' });
    for (const item of words) {
        const row = list.createDiv({ cls: 'hi-words-card-derived-item' });
        const header = row.createDiv({ cls: 'hi-words-card-derived-header' });
        header.createSpan({ text: item.word, cls: 'hi-words-structured-confusable-word' });
        if (item.partOfSpeech) header.createSpan({ text: formatPartOfSpeech(item.partOfSpeech), cls: 'hi-words-card-derived-pos' });
        if (item.meaning) row.createDiv({ text: item.meaning, cls: 'hi-words-structured-memory-text' });
    }
}

export function renderHiWordsMorphology(root: HTMLElement, card: HiWordsCard): void {
    const morphology = card.morphology;
    if (!morphology) return;
    const components = (morphology.components || []).filter(item => item.form.trim());
    if (!morphology.explanation?.trim() && !components.length) return;
    const section = createSection(root, 'Morphology');
    if (components.length) section.createDiv({
        text: components.map(item => item.form).join(' + '),
        cls: 'hi-words-structured-breakdown',
    });
    const roots = components.filter(item => item.type === 'root' || item.type === 'base');
    const prefixes = components.filter(item => item.type === 'prefix');
    const suffixes = components.filter(item => item.type === 'suffix');
    const others = components.filter(item => !roots.includes(item) && !prefixes.includes(item) && !suffixes.includes(item));
    renderMorphologyGroup(section, 'Root', roots);
    renderMorphologyGroup(section, 'Prefixes', prefixes);
    renderMorphologyGroup(section, 'Suffixes', suffixes);
    renderMorphologyGroup(section, 'Components', others);
    if (morphology.explanation) section.createDiv({ text: morphology.explanation, cls: 'hi-words-structured-memory-text' });
}

export function renderHiWordsPhrases(root: HTMLElement, card: HiWordsCard): void {
    const phrases = (card.phrases || []).filter(item => item.text.trim());
    if (!phrases.length) return;
    const section = createSection(root, 'Phrases');
    for (const item of phrases) {
        const row = section.createDiv({ cls: 'hi-words-structured-phrase' });
        const head = row.createDiv({ cls: 'hi-words-card-derived-header' });
        head.createSpan({ text: item.text, cls: 'hi-words-structured-confusable-word' });
        if (item.translation) head.createSpan({ text: item.translation, cls: 'hi-words-structured-zh' });
        if (item.sentence) row.createDiv({ text: item.sentence, cls: 'hi-words-structured-example-text' });
    }
}

export function renderHiWordsUsage(root: HTMLElement, card: HiWordsCard): void {
    const usage = card.usage;
    if (!usage) return;
    const register = nonEmpty(usage.register);
    const patterns = nonEmpty(usage.patterns);
    const notes = nonEmpty(usage.notes);
    const mistakes = nonEmpty(usage.commonMistakes);
    if (!register.length && !patterns.length && !notes.length && !mistakes.length) return;
    const section = createSection(root, 'Usage');
    if (register.length) renderChips(section, register);
    if (patterns.length) {
        const subsection = section.createDiv({ cls: 'hi-words-structured-subsection' });
        subsection.createDiv({ text: 'Patterns', cls: 'hi-words-structured-subtitle' });
        renderChips(subsection, patterns, true);
    }
    for (const note of notes) section.createDiv({ text: note, cls: 'hi-words-card-usage-note hi-words-structured-memory-text' });
    if (mistakes.length) {
        const subsection = section.createDiv({ cls: 'hi-words-structured-subsection' });
        subsection.createDiv({ text: 'Common mistakes', cls: 'hi-words-structured-subtitle' });
        for (const mistake of mistakes) subsection.createDiv({ text: mistake, cls: 'hi-words-card-mistake-note' });
    }
}

export function renderHiWordsRelations(root: HTMLElement, card: HiWordsCard): void {
    const relations = (card.relations || []).filter(item => item.target.trim());
    if (!relations.length) return;
    const section = createSection(root, 'Related');
    const list = section.createDiv({ cls: 'hi-words-structured-relation-list' });
    for (const item of relations) {
        const row = list.createDiv({ cls: 'hi-words-structured-relation' });
        row.createSpan({ text: humanizeKey(item.type), cls: 'hi-words-structured-relation-type' });
        row.createSpan({ text: item.target, cls: 'hi-words-structured-relation-target' });
        if (item.note) row.createDiv({ text: item.note, cls: 'hi-words-structured-memory-text' });
    }
}

export function renderHiWordsMemory(root: HTMLElement, card: HiWordsCard): void {
    const memory = (card.memory || []).filter(item => item.text.trim());
    if (!memory.length) return;
    const section = createSection(root, 'Memory');
    for (const item of memory) {
        const row = section.createDiv({ cls: 'hi-words-structured-memory-row hi-words-card-memory-row' });
        row.createSpan({ text: humanizeKey(item.type), cls: 'hi-words-structured-label' });
        const body = row.createDiv({ cls: 'hi-words-card-memory-body' });
        body.createDiv({ text: item.text, cls: 'hi-words-structured-memory-text' });
    }
}

export function renderHiWordsImages(root: HTMLElement, card: HiWordsCard, app?: App): void {
    const images = (card.images || []).filter(item => item.path.trim());
    if (!images.length) return;
    const section = createSection(root, 'Images');
    const gallery = section.createDiv({ cls: 'hi-words-structured-image-gallery' });
    for (const image of images) {
        const figure = gallery.createEl('figure', { cls: 'hi-words-structured-image' });
        const src = /^(?:https?:|data:|app:)/i.test(image.path)
            ? image.path
            : app?.vault.adapter.getResourcePath(normalizePath(image.path)) || image.path;
        const img = figure.createEl('img', { attr: { src, alt: image.alt || card.word, loading: 'lazy' } });
        img.addEventListener('error', () => {
            figure.remove();
            if (!gallery.querySelector('.hi-words-structured-image')) section.remove();
        });
        if (image.caption || image.source) figure.createEl('figcaption', { text: [image.caption, image.source].filter(Boolean).join(' · ') });
    }
}

export function renderHiWordsCustom(root: HTMLElement, card: HiWordsCard): void {
    const entries = (card.customSections || []).filter(item => item.title.trim() || item.content.trim());
    for (const item of entries) {
        const section = createSection(root, item.title.trim() || 'Custom content');
        if (item.content.trim()) section.createDiv({ text: item.content.trim(), cls: 'hi-words-card-custom-value' });
    }
}

function createSection(root: HTMLElement, title: string): HTMLElement {
    const section = root.createDiv({ cls: 'hi-words-structured-section hi-words-card-section' });
    section.createDiv({ cls: 'hi-words-structured-section-header' })
        .createDiv({ text: title, cls: 'hi-words-structured-section-title' });
    return section;
}

function renderMorphologyGroup(container: HTMLElement, title: string, items: HiWordsMorphologyComponent[]): void {
    if (!items.length) return;
    const group = container.createDiv({ cls: 'hi-words-structured-subsection' });
    group.createDiv({ text: title, cls: 'hi-words-structured-subtitle' });
    const chips = group.createDiv({ cls: 'hi-words-structured-chip-list' });
    for (const item of items) chips.createSpan({ text: [item.form, item.meaning].filter(Boolean).join(' · '), cls: 'hi-words-structured-chip' });
}

function renderChips(container: HTMLElement, values: string[], code = false): void {
    const list = container.createDiv({ cls: 'hi-words-structured-chip-list' });
    for (const value of values) list.createSpan({ text: value, cls: `hi-words-structured-chip${code ? ' hi-words-structured-chip-code' : ''}` });
}

function nonEmpty(values?: string[]): string[] {
    return (values || []).map(value => value.trim()).filter(Boolean);
}

function humanizeKey(value: string): string {
    return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function formatPartOfSpeech(value: string): string {
    const map: Record<string, string> = {
        noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.',
        preposition: 'prep.', conjunction: 'conj.', determiner: 'det.', interjection: 'interj.', auxiliary: 'aux.',
        modal: 'modal v.', phrase: 'phr.',
    };
    return map[value.trim().toLowerCase()] || value;
}
