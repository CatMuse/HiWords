import { App, TFile } from 'obsidian';
import {
    HiWordsCard,
    HiWordsPack,
    HiWordsWordCard,
    isConceptCard,
    isCustomCard,
    isHiWordsPack,
    isPersonCard,
    isWordCard,
    normalizeHiWordsPack,
} from '../schema/hiwords';
import type { WordDefinition, WordSection } from '../utils';
import type { CardDisplaySection } from '../utils';
import { buildStudyKey } from '../utils';
import { parsePhrase } from '../utils/pattern-matcher';
import { getOrderedCardDisplaySections } from '../knowledge';

export interface HiWordsPackMetadata {
    schema: string;
    version: number;
    id: string;
    title: string;
    cardKind: string;
    cardCount: number;
}

export class HiWordsParser {
    constructor(private app: App) {}

    static isHiWordsFile(file: TFile): boolean { return file.extension === 'hiwords'; }

    async parseFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const pack = await this.readPack(file);
            if (!pack) return [];
            return pack.cards.filter(card => isCompleteCard(card, pack.cardKind)).map((card, index) => this.cardToDefinition(card, pack, file.path, index));
        } catch (error) {
            console.error(`Failed to parse .hiwords file ${file.path}:`, error);
            return [];
        }
    }

    async readMetadata(file: TFile): Promise<HiWordsPackMetadata | null> {
        try {
            const pack = await this.readPack(file);
            return pack ? {
                schema: pack.schema,
                version: pack.schemaVersion,
                id: pack.id,
                title: pack.title,
                cardKind: pack.cardKind,
                cardCount: pack.cards.length,
            } : null;
        } catch { return null; }
    }

    async validateFile(file: TFile): Promise<boolean> {
        try { return !!(await this.readPack(file)); } catch { return false; }
    }

    private async readPack(file: TFile): Promise<HiWordsPack | null> {
        const content = await this.app.vault.cachedRead(file);
        if (!content.trim()) return null;
        const parsed = normalizeHiWordsPack(JSON.parse(content) as unknown);
        return isHiWordsPack(parsed) ? parsed : null;
    }

    private cardToDefinition(card: HiWordsCard, pack: HiWordsPack, sourcePath: string, index: number): WordDefinition {
        const title = card.title.trim();
        const language = isWordCard(card, pack.cardKind) ? card.data.language : 'und';
        const type = isWordCard(card, pack.cardKind) ? card.data.itemType : 'concept';
        const phraseInfo = parsePhrase(title);
        const sections = buildSections(card, pack.cardKind, pack.fields, pack.display?.moduleOrder);
        const rawDefinition = sections.map(section => `**${section.title}**\n${section.content}`).join('\n\n---\n\n');
        return {
            word: phraseInfo.isPattern ? phraseInfo.original : title.toLowerCase(),
            type,
            language,
            studyKey: buildStudyKey({ word: title, language, type }),
            aliases: card.aliases?.map(alias => alias.trim().toLowerCase()).filter(Boolean),
            definition: sections[0]?.content || '',
            rawDefinition,
            sections: sections.length ? sections : undefined,
            source: sourcePath,
            nodeId: `hiwords-${card.id || `${index}-${title.toLowerCase()}`}`,
            isPattern: phraseInfo.isPattern,
            patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined,
            card,
            cardKind: pack.cardKind,
            cardModuleOrder: pack.display?.moduleOrder,
            cardFields: pack.fields,
            userNote: card.note?.text,
        };
    }
}

function buildSections(
    card: HiWordsCard,
    kind: HiWordsPack['cardKind'],
    fields: HiWordsPack['fields'] = [],
    moduleOrder?: string[],
): WordSection[] {
    return getOrderedCardDisplaySections(kind, moduleOrder, fields)
        .map(definition => ({
            title: definition.label,
            content: buildSectionContent(card, kind, definition.id, fields).trim(),
        }))
        .filter(section => Boolean(section.content));
}

function buildSectionContent(
    card: HiWordsCard,
    kind: HiWordsPack['cardKind'],
    section: CardDisplaySection,
    fields: HiWordsPack['fields'],
): string {
    if (section.startsWith('field:')) return dynamicFieldContent(card, section.slice('field:'.length), fields);
    if (section === 'note') return card.note?.text || '';
    if (section === 'custom') return (card.customSections || [])
        .filter(item => item.title.trim() || item.content.trim())
        .map(item => [item.title.trim() ? `**${item.title.trim()}**` : '', item.content.trim()].filter(Boolean).join('\n'))
        .join('\n\n');
    if (section === 'images' || section === 'identity') return '';

    if (isWordCard(card, kind)) return buildWordSectionContent(card, section);
    if (isPersonCard(card, kind)) {
        const data = card.data;
        if (section === 'biography') return data.summary;
        if (section === 'timeline') return (data.timeline || []).map(item => [[item.date, item.title].filter(Boolean).join(' · '), item.description].filter(Boolean).join('\n')).join('\n\n');
        if (section === 'achievements') return (data.achievements || []).map(item => [item.title, item.description].filter(Boolean).join('\n')).join('\n\n');
        if (section === 'works') return (data.works || []).map(item => [[item.title, item.date].filter(Boolean).join(' · '), item.description].filter(Boolean).join('\n')).join('\n\n');
        if (section === 'personRelations') return (data.relations || []).map(item => [[item.type, item.target].filter(Boolean).join(' · '), item.note].filter(Boolean).join('\n')).join('\n\n');
    }
    if (isConceptCard(card, kind)) {
        const data = card.data;
        if (section === 'definition') return [data.definition, data.explanation?.trim() ? `**Explanation**\n${data.explanation.trim()}` : ''].filter(Boolean).join('\n\n');
        if (section === 'principles') return (data.principles || []).join('\n');
        if (section === 'examples') return (data.examples || []).map(item => [item.title, item.content].filter(Boolean).join('\n')).join('\n\n');
        if (section === 'misconceptions') return (data.misconceptions || []).join('\n');
        if (section === 'prerequisites') return (data.prerequisites || []).map(item => [item.target, item.note].filter(Boolean).join('\n')).join('\n\n');
        if (section === 'relatedConcepts') return (data.relatedConcepts || []).map(item => [item.target, item.note].filter(Boolean).join('\n')).join('\n\n');
    }
    return '';
}

function buildWordSectionContent(card: HiWordsWordCard, section: CardDisplaySection): string {
    const data = card.data;
    if (section === 'definitions') return data.meanings
        .map(meaning => [[formatPartOfSpeech(meaning.partOfSpeech), meaning.translation].filter(Boolean).join(' '), meaning.definition].filter(Boolean).join('\n'))
        .filter(Boolean).join('\n\n');
    if (section === 'examples') return (data.sentences || []).map(item => [item.text, item.translation].filter(Boolean).join('\n')).join('\n\n');
    if (section === 'forms') return (data.forms || []).map(item => [item.form, item.type].filter(Boolean).join(' · ')).join('\n');
    if (section === 'derivedWords') return (data.derivedWords || []).map(item => [[item.word, item.partOfSpeech].filter(Boolean).join(' · '), item.meaning].filter(Boolean).join('\n')).join('\n\n');
    if (section === 'morphology') return [
        (data.morphology?.components || []).map(item => [item.type, item.form, item.meaning].filter(Boolean).join(' · ')).join('\n'),
        data.morphology?.explanation,
    ].filter(Boolean).join('\n\n');
    if (section === 'phrases') return (data.phrases || []).map(item => [[item.text, item.translation].filter(Boolean).join(' · '), item.sentence].filter(Boolean).join('\n')).join('\n\n');
    if (section === 'usage') return [
        nonEmptyLine('Register', data.usage?.register),
        nonEmptyLine('Patterns', data.usage?.patterns),
        nonEmptyLine('Notes', data.usage?.notes),
        nonEmptyLine('Common mistakes', data.usage?.commonMistakes),
    ].filter(Boolean).join('\n\n');
    if (section === 'relations') return (data.relations || []).map(item => [[item.type, item.target].filter(Boolean).join(' · '), item.note].filter(Boolean).join('\n')).join('\n\n');
    if (section === 'memory') return (data.memory || []).map(item => [item.type, item.text].filter(Boolean).join(' · ')).join('\n');
    return '';
}

function dynamicFieldContent(card: HiWordsCard, fieldId: string, fields: HiWordsPack['fields']): string {
    const field = fields?.find(item => item.id === fieldId);
    const value = card.fieldValues?.[fieldId];
    if (!field || field.type === 'image' || value === undefined || value === '') return '';
    if (Array.isArray(value)) return (value as string[]).join('\n');
    return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
}

function nonEmptyLine(label: string, values?: string[]): string {
    const content = (values || []).map(value => value.trim()).filter(Boolean).join(', ');
    return content ? `**${label}**\n${content}` : '';
}

function isCompleteCard(card: HiWordsCard, kind: HiWordsPack['cardKind']): boolean {
    if (!card.title.trim()) return false;
    if (isWordCard(card, kind)) return card.data.meanings.some(item => item.translation.trim() || item.definition.trim());
    if (isPersonCard(card, kind)) return Boolean(card.data.summary.trim());
    if (isConceptCard(card, kind)) return Boolean(card.data.definition.trim());
    return isCustomCard(card, kind);
}

function formatPartOfSpeech(value: string): string {
    const map: Record<string, string> = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', phrase: 'phr.' };
    return map[value.trim().toLowerCase()] || value;
}
