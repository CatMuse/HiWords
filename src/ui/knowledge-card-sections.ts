import type { App } from 'obsidian';
import type { HiWordsCard, HiWordsConceptCard, HiWordsCustomCard, HiWordsFieldDefinition, HiWordsImage, HiWordsPersonCard } from '../schema/hiwords';
import type { CardDisplaySection } from '../utils';
import { renderHiWordsCustom, renderHiWordsImageItems, renderHiWordsImages } from './hiwords-card-sections';

export function renderPersonCardSection(root: HTMLElement, card: HiWordsPersonCard, section: CardDisplaySection, app?: App): void {
    root.addClass('hi-words-person-card');
    const data = card.data;
    switch (section) {
        case 'identity': {
            const facts = [formatLifespan(data.birthDate, data.deathDate), data.nationalities?.join(', '), data.occupations?.join(', ')].filter(Boolean) as string[];
            if (facts.length) renderChips(root, facts);
            break;
        }
        case 'biography': renderTextSection(root, 'Biography', data.summary); break;
        case 'achievements': if (data.achievements?.length) renderRecords(root, 'Achievements', data.achievements.map(item => ({ title: item.title, detail: item.description }))); break;
        case 'timeline': if (data.timeline?.length) renderRecords(root, 'Timeline', data.timeline.map(item => ({ title: [item.date, item.title].filter(Boolean).join(' · '), detail: item.description }))); break;
        case 'works': if (data.works?.length) renderRecords(root, 'Works', data.works.map(item => ({ title: item.title, detail: [item.date, item.description].filter(Boolean).join(' · ') }))); break;
        case 'personRelations': if (data.relations?.length) renderRecords(root, 'Related people', data.relations.map(item => ({ title: `${humanize(item.type)} · ${item.target}`, detail: item.note }))); break;
        case 'images': renderHiWordsImages(root, card, app); break;
        case 'custom': renderHiWordsCustom(root, card); break;
        case 'note': renderNote(root, card.note?.text); break;
    }
}

export function renderConceptCardSection(root: HTMLElement, card: HiWordsConceptCard, section: CardDisplaySection, app?: App): void {
    root.addClass('hi-words-concept-card');
    const data = card.data;
    switch (section) {
        case 'identity': if (data.domain) renderChips(root, [data.domain]); break;
        case 'definition':
            renderDefinitionSection(root, data.definition, data.explanation);
            break;
        case 'principles': renderList(root, 'Principles', data.principles); break;
        case 'examples': if (data.examples?.length) renderRecords(root, 'Examples', data.examples.map(item => ({ title: item.title || 'Example', detail: item.content }))); break;
        case 'misconceptions': renderList(root, 'Misconceptions', data.misconceptions); break;
        case 'prerequisites': if (data.prerequisites?.length) renderRecords(root, 'Prerequisites', data.prerequisites.map(item => ({ title: item.target, detail: item.note }))); break;
        case 'relatedConcepts': if (data.relatedConcepts?.length) renderRecords(root, 'Related concepts', data.relatedConcepts.map(item => ({ title: item.target, detail: item.note }))); break;
        case 'images': renderHiWordsImages(root, card, app); break;
        case 'custom': renderHiWordsCustom(root, card); break;
        case 'note': renderNote(root, card.note?.text); break;
    }
}

export function renderCustomCardSection(root: HTMLElement, card: HiWordsCustomCard, section: CardDisplaySection, app?: App): void {
    root.addClass('hi-words-custom-card');
    switch (section) {
        case 'identity': {
            const facts = [...(card.aliases || []), ...(card.tags || []).map(tag => `#${tag}`)].filter(value => value.trim());
            if (facts.length) renderChips(root, facts);
            break;
        }
        case 'images': renderHiWordsImages(root, card, app); break;
        case 'custom': renderHiWordsCustom(root, card); break;
        case 'note': renderNote(root, card.note?.text); break;
    }
}

export function renderDynamicFieldSection(root: HTMLElement, card: HiWordsCard, field: HiWordsFieldDefinition, app?: App): void {
    const value = card.fieldValues?.[field.id];
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
    if (field.type === 'image' && Array.isArray(value)) {
        const images = value as HiWordsImage[];
        renderHiWordsImageItems(root, field.label, images, app, field.image);
        return;
    }
    if (Array.isArray(value)) {
        renderList(root, field.label, value as string[]);
        return;
    }
    const section = createSection(root, field.label);
    if (field.type === 'url' && typeof value === 'string') {
        if (/^https?:\/\//i.test(value)) {
            section.createEl('a', {
                text: value,
                href: value,
                cls: 'hi-words-knowledge-link',
                attr: { target: '_blank', rel: 'noopener noreferrer' },
            });
        } else {
            section.createDiv({ text: value, cls: 'hi-words-structured-memory-text hi-words-knowledge-text' });
        }
        return;
    }
    section.createDiv({
        text: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value),
        cls: 'hi-words-structured-memory-text hi-words-knowledge-text',
    });
}

function renderTextSection(root: HTMLElement, title: string, value?: string): void {
    if (!value?.trim()) return;
    createSection(root, title).createDiv({ text: value.trim(), cls: 'hi-words-structured-memory-text hi-words-knowledge-text' });
}

function renderList(root: HTMLElement, title: string, values?: string[]): void {
    const items = (values || []).map(value => value.trim()).filter(Boolean);
    if (!items.length) return;
    const section = createSection(root, title);
    const list = section.createEl('ul', { cls: 'hi-words-knowledge-list' });
    items.forEach(item => list.createEl('li', { text: item }));
}

function renderRecords(root: HTMLElement, title: string, records: Array<{ title: string; detail?: string }>): void {
    const items = records.filter(item => item.title.trim() || item.detail?.trim());
    if (!items.length) return;
    const section = createSection(root, title);
    items.forEach(item => {
        const row = section.createDiv({ cls: 'hi-words-knowledge-record' });
        if (item.title.trim()) row.createDiv({ text: item.title, cls: 'hi-words-knowledge-record-title' });
        if (item.detail?.trim()) row.createDiv({ text: item.detail, cls: 'hi-words-structured-memory-text' });
    });
}

function renderNote(root: HTMLElement, note?: string): void { renderTextSection(root, 'My note', note); }

function renderDefinitionSection(root: HTMLElement, definition: string, explanation?: string): void {
    if (!definition.trim() && !explanation?.trim()) return;
    const section = createSection(root, 'Definition');
    if (definition.trim()) section.createDiv({ text: definition.trim(), cls: 'hi-words-structured-memory-text hi-words-knowledge-text' });
    if (explanation?.trim()) {
        const detail = section.createDiv({ cls: 'hi-words-structured-subsection hi-words-knowledge-explanation' });
        detail.createDiv({ text: 'Explanation', cls: 'hi-words-structured-subtitle' });
        detail.createDiv({ text: explanation.trim(), cls: 'hi-words-structured-memory-text hi-words-knowledge-text' });
    }
}

function renderChips(root: HTMLElement, values: string[]): void {
    const list = root.createDiv({ cls: 'hi-words-structured-chip-list hi-words-knowledge-facts' });
    values.forEach(value => list.createSpan({ text: value, cls: 'hi-words-structured-chip' }));
}

function createSection(root: HTMLElement, title: string): HTMLElement {
    const section = root.createDiv({ cls: 'hi-words-structured-section hi-words-card-section' });
    section.createDiv({ cls: 'hi-words-structured-section-header' }).createDiv({ text: title, cls: 'hi-words-structured-section-title' });
    return section;
}

function formatLifespan(birth?: string, death?: string): string | undefined {
    if (!birth && !death) return undefined;
    return `${birth || '?'} – ${death || 'present'}`;
}

function humanize(value: string): string { return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); }
