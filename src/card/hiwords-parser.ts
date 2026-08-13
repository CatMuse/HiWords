import { App, TFile } from 'obsidian';
import { HiWordsCard, HiWordsPack, isHiWordsPack } from '../schema/hiwords';
import type { WordDefinition, WordSection } from '../utils';
import { buildStudyKey } from '../utils';
import { parsePhrase } from '../utils/pattern-matcher';

export interface HiWordsPackMetadata {
    schema: string;
    version: number;
    id: string;
    title: string;
    language: string;
    cardCount: number;
}

export class HiWordsParser {
    constructor(private app: App) {}

    static isHiWordsFile(file: TFile): boolean {
        return file.extension === 'hiwords';
    }

    async parseFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const pack = await this.readPack(file);
            if (!pack) {
                console.warn(`Unsupported .hiwords schema: ${file.path}`);
                return [];
            }
            return pack.cards
                .filter(isCompleteCard)
                .map((card, index) => this.cardToDefinition(card, pack, file.path, index));
        } catch (error) {
            console.error(`Failed to parse .hiwords file ${file.path}:`, error);
            return [];
        }
    }

    async readMetadata(file: TFile): Promise<HiWordsPackMetadata | null> {
        try {
            const pack = await this.readPack(file);
            if (!pack) return null;
            return {
                schema: pack.schema,
                version: pack.schemaVersion,
                id: pack.id,
                title: pack.title,
                language: pack.language,
                cardCount: pack.cards.length,
            };
        } catch (error) {
            console.error(`Failed to read .hiwords metadata ${file.path}:`, error);
            return null;
        }
    }

    async validateFile(file: TFile): Promise<boolean> {
        try {
            return !!(await this.readPack(file));
        } catch {
            return false;
        }
    }

    private async readPack(file: TFile): Promise<HiWordsPack | null> {
        const content = await this.app.vault.cachedRead(file);
        if (!content.trim()) return null;
        const parsed = JSON.parse(content) as unknown;
        return isHiWordsPack(parsed) ? parsed : null;
    }

    private cardToDefinition(card: HiWordsCard, pack: HiWordsPack, sourcePath: string, index: number): WordDefinition {
        const word = card.word.trim();
        const language = card.language || pack.language;
        const phraseInfo = parsePhrase(word);
        const studyKey = buildStudyKey({ word, language, type: card.type });
        const sections = this.buildSections(card);
        const rawDefinition = sections.map(section => `**${section.title}**\n${section.content}`).join('\n\n---\n\n');
        return {
            word: phraseInfo.isPattern ? phraseInfo.original : word.toLowerCase(),
            type: card.type,
            language,
            studyKey,
            aliases: card.aliases?.map(alias => alias.trim().toLowerCase()).filter(Boolean),
            definition: sections[0]?.content || '',
            rawDefinition,
            sections: sections.length ? sections : undefined,
            source: sourcePath,
            nodeId: card.id ? `hiwords-${card.id}` : `hiwords-${index}-${word.toLowerCase()}`,
            isPattern: phraseInfo.isPattern,
            patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined,
            card,
            userNote: card.note?.text,
        };
    }

    private buildSections(card: HiWordsCard): WordSection[] {
        const sections: WordSection[] = [];
        const definitions = card.meanings.map(meaning => {
            const head = [formatPartOfSpeech(meaning.partOfSpeech), meaning.translation].filter(Boolean).join(' ');
            return [head, meaning.definition].filter(Boolean).join('\n');
        }).filter(Boolean);
        if (definitions.length) sections.push({ title: 'Definition', content: definitions.join('\n\n') });

        const sentences = (card.sentences || []).filter(sentence => sentence.text.trim());
        if (sentences.length) {
            sections.push({
                title: 'Sentence',
                content: sentences.map(sentence => [sentence.text, sentence.translation].filter(Boolean).join('\n')).join('\n\n'),
            });
        }
        const memory = (card.memory || []).filter(item => item.text.trim()).map(item => item.text.trim());
        if (memory.length) sections.push({ title: 'Memory', content: memory.join('\n\n') });
        for (const custom of card.customSections || []) {
            const title = custom.title.trim();
            const content = custom.content.trim();
            if (title || content) sections.push({ title: title || 'Custom content', content });
        }
        return sections;
    }
}

function isCompleteCard(card: HiWordsCard): boolean {
    return !!card.word.trim() && card.meanings.some(meaning =>
        !!meaning.partOfSpeech.trim() && !!meaning.translation.trim() && !!meaning.definition.trim()
    );
}

function formatPartOfSpeech(value: string): string {
    const map: Record<string, string> = {
        noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.',
        preposition: 'prep.', conjunction: 'conj.', determiner: 'det.', interjection: 'interj.', phrase: 'phr.',
    };
    return map[value.trim().toLowerCase()] || value;
}
