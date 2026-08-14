import { TFile } from 'obsidian';
import type HiWordsPlugin from '../../main';
import {
    addCanvasNoteNodeWithoutLayout,
    deleteCanvasNodeWithoutLayout,
    updateCanvasTextNodeContent,
    updateCanvasTextNodeNote,
    updateCanvasTextNodeSentences,
} from '../canvas/canvas-note';
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
        return wordDef.card?.note?.text || wordDef.userNote || '';
    }

    async saveNote(wordDef: WordDefinition, text: string): Promise<boolean> {
        const value = text.trim();
        if (wordDef.source.endsWith('.canvas')) {
            return this.saveCanvasNote(wordDef, value);
        }
        return this.mutate(wordDef, card => {
            card.note = value ? { text: value } : undefined;
        });
    }

    async deleteNote(wordDef: WordDefinition): Promise<boolean> {
        if (wordDef.source.endsWith('.canvas')) {
            return this.saveCanvasNote(wordDef, '');
        }
        return this.mutate(wordDef, card => { card.note = undefined; });
    }

    canSaveSentences(wordDef: WordDefinition): boolean {
        if (wordDef.source.endsWith('.hiwords')) return !!(wordDef.card?.id || wordDef.nodeId);
        return wordDef.source.endsWith('.canvas') && wordDef.canvasNodeType !== 'file' && !!wordDef.nodeId;
    }

    getSavedSentences(wordDef: WordDefinition): HiWordsSentence[] {
        return wordDef.card?.sentences || wordDef.savedSentences || [];
    }

    isSentenceSaved(wordDef: WordDefinition, text: string): boolean {
        const key = normalizeSentence(text);
        return !!key && this.getSavedSentences(wordDef)
            .some(sentence => normalizeSentence(sentence.text) === key);
    }

    async toggleSentence(
        wordDef: WordDefinition,
        sentence: Pick<HiWordsSentence, 'text' | 'translation' | 'source'>
    ): Promise<{ success: boolean; saved: boolean }> {
        const text = sentence.text.trim();
        const key = normalizeSentence(text);
        if (!key) return { success: false, saved: false };
        if (wordDef.source.endsWith('.canvas')) {
            return this.toggleCanvasSentence(wordDef, sentence, key);
        }
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

    private async toggleCanvasSentence(
        wordDef: WordDefinition,
        sentence: Pick<HiWordsSentence, 'text' | 'translation' | 'source'>,
        key: string
    ): Promise<{ success: boolean; saved: boolean }> {
        if (!this.canSaveSentences(wordDef)) return { success: false, saved: false };

        const sentences = this.getSavedSentences(wordDef).map(item => ({ ...item }));
        const existing = sentences.findIndex(item => normalizeSentence(item.text) === key);
        let saved = false;
        if (existing >= 0) {
            sentences.splice(existing, 1);
        } else {
            sentences.push({
                id: createStableId('sentence'),
                text: sentence.text.trim(),
                translation: sentence.translation?.trim() || undefined,
                source: sentence.source?.trim() || undefined,
            });
            saved = true;
        }

        const result = await updateCanvasTextNodeSentences(
            this.plugin.app,
            wordDef.source,
            wordDef.nodeId,
            sentences
        );
        if (result !== 'updated') return { success: false, saved: false };

        await this.refreshCanvasDefinition(wordDef);
        return { success: true, saved };
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

    private async saveCanvasNote(wordDef: WordDefinition, text: string): Promise<boolean> {
        const result = await updateCanvasTextNodeNote(
            this.plugin.app,
            wordDef.source,
            wordDef.nodeId,
            text
        );

        if (result === 'not-text') {
            return this.saveLegacyCanvasNote(wordDef, text);
        }
        if (result !== 'updated') return false;

        const legacyNote = wordDef.userNoteSource;
        if (legacyNote && legacyNote.nodeId !== wordDef.nodeId) {
            const removed = await deleteCanvasNodeWithoutLayout(this.plugin.app, legacyNote.source, legacyNote.nodeId);
            if (removed && legacyNote.source !== wordDef.source) {
                await this.plugin.vocabularyManager.reloadVocabularyBook(legacyNote.source);
            }
        }

        await this.refreshCanvasDefinition(wordDef);
        return true;
    }

    private async saveLegacyCanvasNote(wordDef: WordDefinition, text: string): Promise<boolean> {
        const existing = wordDef.userNoteSource;
        let noteSource = existing;
        if (existing) {
            const success = text
                ? await updateCanvasTextNodeContent(
                    this.plugin.app,
                    existing.source,
                    existing.nodeId,
                    `${wordDef.word}\n\n**Note**\n${text}`
                )
                : await deleteCanvasNodeWithoutLayout(this.plugin.app, existing.source, existing.nodeId);
            if (!success) return false;
        } else if (text) {
            const nodeId = await addCanvasNoteNodeWithoutLayout(
                this.plugin.app,
                wordDef.source,
                wordDef.nodeId,
                wordDef.word,
                text,
                wordDef.aliases
            );
            if (!nodeId) return false;
            noteSource = { source: wordDef.source, nodeId };
        } else {
            return true;
        }

        if (existing && existing.source !== wordDef.source) {
            await this.plugin.vocabularyManager.reloadVocabularyBook(existing.source);
        }
        await this.refreshCanvasDefinition(wordDef);
        wordDef.userNote = text || undefined;
        wordDef.userNoteSource = text ? noteSource : undefined;
        return true;
    }

    private async refreshCanvasDefinition(wordDef: WordDefinition): Promise<void> {
        await this.plugin.vocabularyManager.reloadVocabularyBook(wordDef.source);
        this.plugin.refreshHighlighter();
        const refreshed = await this.plugin.vocabularyManager.getWordDefinitionByNodeId(
            wordDef.source,
            wordDef.nodeId
        );
        if (refreshed) {
            Object.assign(wordDef, refreshed);
            wordDef.userNote = refreshed.userNote;
            wordDef.userNoteSource = refreshed.userNoteSource;
            wordDef.savedSentences = refreshed.savedSentences;
        }
        else {
            wordDef.userNote = undefined;
            wordDef.userNoteSource = undefined;
            wordDef.savedSentences = undefined;
        }
    }
}

function normalizeSentence(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
