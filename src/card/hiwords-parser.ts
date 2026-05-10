import { App, TFile } from 'obsidian';
import type { WordCard, WordDefinition, WordSection } from '../utils';
import { buildStudyKey, inferLearningItemType } from '../utils';
import { parsePhrase } from '../utils/pattern-matcher';

interface HiWordsPack {
    schema?: string;
    version?: number | string;
    id?: string;
    title?: string;
    language?: string;
    cards?: WordCard[];
    words?: WordCard[];
}

export interface HiWordsPackMetadata {
    schema: string;
    version: number | string;
    id: string;
    title: string;
    language: string;
    cardCount: number;
}

export class HiWordsParser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    static isHiWordsFile(file: TFile): boolean {
        return file.extension === 'hiwords';
    }

    async parseFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const pack = await this.readPack(file);
            const cards = this.getCards(pack);

            if (!Array.isArray(cards)) {
                console.warn(`Invalid .hiwords file: ${file.path}`);
                return [];
            }

            const packLanguage = Array.isArray(pack) ? undefined : pack.language;

            return cards
                .map((card, index) => this.cardToDefinition(card, file.path, index, packLanguage))
                .filter((definition): definition is WordDefinition => definition !== null);
        } catch (error) {
            console.error(`Failed to parse .hiwords file ${file.path}:`, error);
            return [];
        }
    }

    async readMetadata(file: TFile): Promise<HiWordsPackMetadata | null> {
        try {
            const pack = await this.readPack(file);
            const cards = this.getCards(pack);
            const normalizedPack = Array.isArray(pack) ? undefined : pack;

            return {
                schema: normalizedPack?.schema || 'hiwords',
                version: normalizedPack?.version || 1,
                id: normalizedPack?.id || file.basename,
                title: normalizedPack?.title || file.basename,
                language: normalizedPack?.language || '',
                cardCount: cards.length,
            };
        } catch (error) {
            console.error(`Failed to read .hiwords metadata ${file.path}:`, error);
            return null;
        }
    }

    async validateFile(file: TFile): Promise<boolean> {
        try {
            const parsed = await this.readPack(file);
            if (Array.isArray(parsed)) return true;
            return Array.isArray(parsed.cards) || Array.isArray(parsed.words);
        } catch {
            return false;
        }
    }

    private async readPack(file: TFile): Promise<HiWordsPack | WordCard[]> {
        const content = await this.app.vault.cachedRead(file);
        const trimmed = content.trim();
        if (!trimmed) return [];
        return JSON.parse(trimmed) as HiWordsPack | WordCard[];
    }

    private getCards(pack: HiWordsPack | WordCard[]): WordCard[] {
        return Array.isArray(pack) ? pack : (pack.cards || pack.words || []);
    }

    private cardToDefinition(card: WordCard, sourcePath: string, index: number, packLanguage?: string): WordDefinition | null {
        if (!card || typeof card.word !== 'string') return null;

        const word = card.word.trim();
        if (!word) return null;

        const language = card.language || packLanguage;
        const type = card.type || inferLearningItemType(word, language);
        const studyKey = buildStudyKey({ word, language, type });
        const aliases = Array.isArray(card.aliases)
            ? card.aliases.map(alias => String(alias).trim().toLowerCase()).filter(Boolean)
            : undefined;
        const rawDefinition = this.renderCardMarkdown(card);
        const sections = this.buildSections(card);
        const phraseInfo = parsePhrase(word);

        return {
            word: phraseInfo.isPattern ? phraseInfo.original : word.toLowerCase(),
            type,
            language,
            studyKey,
            aliases: aliases && aliases.length > 0 ? aliases : undefined,
            definition: sections[0]?.content || rawDefinition,
            rawDefinition,
            sections: sections.length > 0 ? sections : undefined,
            source: sourcePath,
            nodeId: `hiwords-${index}-${word.toLowerCase()}`,
            color: card.color,
            isPattern: phraseInfo.isPattern,
            patternParts: phraseInfo.isPattern ? phraseInfo.parts : undefined,
            card,
        };
    }

    private buildSections(card: WordCard): WordSection[] {
        const sections: WordSection[] = [];
        const definition = this.renderDefinitions(card);
        const examples = this.renderExamples(card);
        const memory = this.renderMemory(card);

        if (definition) {
            sections.push({ title: 'Definition', content: definition });
        }
        if (examples) {
            sections.push({ title: 'Examples', content: examples });
        }
        if (memory) {
            sections.push({ title: 'Memory', content: memory });
        }

        return sections;
    }

    private renderCardMarkdown(card: WordCard): string {
        const blocks: string[] = [];

        if (card.phonetic || card.level || card.tags?.length) {
            const meta = [
                this.formatPhonetics(card),
                card.level ? `Level: ${card.level}` : '',
                card.tags?.length ? card.tags.map(tag => `#${tag}`).join(' ') : '',
            ].filter(Boolean);
            blocks.push(meta.join(' · '));
        }

        const definition = this.renderDefinitions(card);
        if (definition) blocks.push(`**Definition**\n${definition}`);

        const examples = this.renderExamples(card);
        if (examples) blocks.push(`**Examples**\n${examples}`);

        const memory = this.renderMemory(card);
        if (memory) blocks.push(`**Memory**\n${memory}`);

        if (card.collocations?.length) {
            blocks.push(`**Collocations**\n${card.collocations.map(item => `- ${item}`).join('\n')}`);
        }

        if (card.confusables?.length) {
            blocks.push(`**Confusables**\n${card.confusables.map(item => `- ${item.word}: ${item.note}`).join('\n')}`);
        }

        return blocks.join('\n\n');
    }

    private formatPhonetics(card: WordCard): string {
        if (card.phonetics?.uk || card.phonetics?.us) {
            return [
                card.phonetics.uk ? `UK ${card.phonetics.uk}` : '',
                card.phonetics.us ? `US ${card.phonetics.us}` : '',
            ].filter(Boolean).join(' · ');
        }

        return card.phonetic || '';
    }

    private renderDefinitions(card: WordCard): string {
        if (card.definition?.trim()) {
            return card.definition.trim();
        }

        if (!card.definitions?.length) {
            return '';
        }

        return card.definitions
            .map(def => {
                const lines = [
                    def.pos ? `**${def.pos}**` : '',
                    def.zh || '',
                    def.en || '',
                ].filter(Boolean);
                return lines.join(' ');
            })
            .filter(Boolean)
            .join('\n');
    }

    private renderExamples(card: WordCard): string {
        if (!card.examples?.length) return '';

        return card.examples
            .filter(example => example?.text)
            .map(example => {
                const lines = [`- ${example.text}`];
                if (example.translation) {
                    lines.push(`  ${example.translation}`);
                }
                if (example.source) {
                    lines.push(`  Source: ${example.source}`);
                }
                return lines.join('\n');
            })
            .join('\n');
    }

    private renderMemory(card: WordCard): string {
        if (!card.memory) return '';

        return [
            card.memory.root ? `Root: ${card.memory.root}` : '',
            card.memory.hint ? `Hint: ${card.memory.hint}` : '',
            card.memory.note || '',
        ].filter(Boolean).join('\n');
    }
}
