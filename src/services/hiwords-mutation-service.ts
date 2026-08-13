import { TFile } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { createStableId } from '../editor/hiwords-document';
import { isHiWordsPack, normalizeHiWordsPack, type HiWordsCard, type HiWordsPack, type HiWordsSentence } from '../schema/hiwords';
import type { WordDefinition } from '../utils';

type CardMutation = (card: HiWordsCard, pack: HiWordsPack) => void;

interface OpenHiWordsEditor {
    file?: TFile | null;
    mutateHiWordsCard?: (cardId: string, mutation: CardMutation) => Promise<HiWordsCard | null>;
}

export class HiWordsMutationService {
    constructor(private readonly plugin: HiWordsPlugin) {}

    getNote(wordDef: WordDefinition): string {
        return wordDef.card?.note?.text || '';
    }

    async saveNote(wordDef: WordDefinition, text: string): Promise<boolean> {
        const value = text.trim();
        return this.mutate(wordDef, card => {
            card.note = value ? { text: value } : undefined;
        });
    }

    async deleteNote(wordDef: WordDefinition): Promise<boolean> {
        return this.mutate(wordDef, card => { card.note = undefined; });
    }

    isSentenceSaved(wordDef: WordDefinition, text: string): boolean {
        const key = normalizeSentence(text);
        return !!key && !!wordDef.card?.sentences?.some(sentence => normalizeSentence(sentence.text) === key);
    }

    async toggleSentence(
        wordDef: WordDefinition,
        sentence: Pick<HiWordsSentence, 'text' | 'translation' | 'source'>
    ): Promise<{ success: boolean; saved: boolean }> {
        const text = sentence.text.trim();
        const key = normalizeSentence(text);
        if (!key) return { success: false, saved: false };
        let saved = false;
        const success = await this.mutate(wordDef, card => {
            const sentences = card.sentences || [];
            const existing = sentences.findIndex(item => normalizeSentence(item.text) === key);
            if (existing >= 0) {
                sentences.splice(existing, 1);
                saved = false;
            } else {
                sentences.push({
                    id: createStableId('sentence'),
                    text,
                    translation: sentence.translation?.trim() || undefined,
                    source: sentence.source?.trim() || undefined,
                });
                saved = true;
            }
            card.sentences = sentences;
        });
        return { success, saved: success && saved };
    }

    private async mutate(wordDef: WordDefinition, mutation: CardMutation): Promise<boolean> {
        const source = wordDef.source;
        const cardId = wordDef.card?.id || wordDef.nodeId;
        if (!source.endsWith('.hiwords') || !cardId) return false;

        const openEditor = this.plugin.app.workspace.getLeavesOfType('hi-words-file-editor')
            .map(leaf => leaf.view as unknown as OpenHiWordsEditor)
            .find(view => view.file?.path === source && typeof view.mutateHiWordsCard === 'function');

        let changedCard: HiWordsCard | null = null;
        if (openEditor?.mutateHiWordsCard) {
            changedCard = await openEditor.mutateHiWordsCard(cardId, mutation);
        } else {
            const file = this.plugin.app.vault.getAbstractFileByPath(source);
            if (!(file instanceof TFile)) return false;
            let matched = false;
            await this.plugin.app.vault.process(file, data => {
                const parsed = normalizeHiWordsPack(JSON.parse(data) as unknown);
                if (!isHiWordsPack(parsed)) throw new Error('Unsupported .hiwords file.');
                const card = parsed.cards.find(item => item.id === cardId);
                if (!card) return data;
                mutation(card, parsed);
                changedCard = card;
                matched = true;
                return `${JSON.stringify(parsed, null, 2)}\n`;
            });
            if (!matched) return false;
            await this.plugin.vocabularyManager.reloadVocabularyBook(source);
            this.plugin.refreshHighlighter();
        }

        if (!changedCard) return false;
        wordDef.card = changedCard;
        wordDef.userNote = changedCard.note?.text;
        return true;
    }
}

function normalizeSentence(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
