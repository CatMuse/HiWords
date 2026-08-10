import type HiWordsPlugin from '../../main';
import type { WordDefinition } from '../utils';

export interface WordNoteBookOption {
    name: string;
    path: string;
}

export class WordNoteService {
    constructor(private readonly plugin: HiWordsPlugin) {}

    getExistingNote(wordDef: WordDefinition): string {
        if (wordDef.userNote) return wordDef.userNote;
        const noteSection = wordDef.sections?.find(section => this.isNoteTitle(section.title));
        if (noteSection?.content) return noteSection.content;

        const raw = (wordDef.rawDefinition || wordDef.definition || '').trim();
        return /^\*\*(note|notes|备注|我的备注)\*\*/i.test(raw)
            ? raw.replace(/^\*\*(note|notes|备注|我的备注)\*\*/i, '').trim()
            : '';
    }

    getAvailableBooks(): WordNoteBookOption[] {
        return this.plugin.settings.vocabularyBooks
            .filter(book => book.enabled && book.path.endsWith('.canvas'))
            .map(book => ({ name: book.name, path: book.path }));
    }

    async save(wordDef: WordDefinition, note: string, selectedBookPath?: string): Promise<boolean> {
        const noteText = `**Note**\n${note}`;
        const noteSource = wordDef.userNoteSource;
        const success = noteSource
            ? await this.plugin.vocabularyManager.updateWordInCanvas(
                noteSource.source,
                noteSource.nodeId,
                wordDef.word,
                noteText
            )
            : selectedBookPath
                ? await this.plugin.vocabularyManager.addWordToCanvas(
                    selectedBookPath,
                    wordDef.word,
                    noteText,
                    undefined,
                    wordDef.aliases
                )
                : false;

        if (success) {
            await this.refreshVocabulary();
            this.syncDefinition(wordDef);
        }
        return success;
    }

    async delete(wordDef: WordDefinition): Promise<boolean> {
        const noteSource = wordDef.userNoteSource;
        if (!noteSource) return false;

        const success = await this.plugin.vocabularyManager.deleteWordFromCanvas(noteSource.source, noteSource.nodeId);
        if (success) {
            await this.refreshVocabulary();
            this.syncDefinition(wordDef);
        }
        return success;
    }

    private syncDefinition(wordDef: WordDefinition): void {
        const refreshed = this.plugin.vocabularyManager.getDefinition(wordDef.word);
        if (refreshed) Object.assign(wordDef, refreshed);
    }

    private async refreshVocabulary(): Promise<void> {
        await this.plugin.vocabularyManager.loadAllVocabularyBooks();
        this.plugin.refreshHighlighter();
    }

    private isNoteTitle(title: string): boolean {
        return ['note', 'notes', '备注', '我的备注'].includes(title.trim().toLowerCase());
    }
}
