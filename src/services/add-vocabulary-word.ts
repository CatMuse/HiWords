import { TFile } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { createEmptyWordCard, parseHiWordsEditorDocument, serializeHiWordsPack } from '../editor/hiwords-document';
import { WORD_CARD_KIND } from '../schema/hiwords';
import type { HiWordsPack, HiWordsWordCard } from '../schema/hiwords';


export interface NewVocabularyWord { word: string; definition: string; aliases?: string[] }

export function appendWordCard(pack: HiWordsPack, input: NewVocabularyWord): HiWordsWordCard {
    if (pack.cardKind !== WORD_CARD_KIND) throw new Error('Choose a word vocabulary book.');
    const word = input.word.trim();
    if (!word) throw new Error('Enter a word.');
    const normalized = word.toLocaleLowerCase();
    if (pack.cards.some(card => card.title.trim().toLocaleLowerCase() === normalized
        || card.aliases?.some(alias => alias.trim().toLocaleLowerCase() === normalized))) {
        throw new Error('This word already exists in the selected vocabulary book.');
    }
    const card = createEmptyWordCard();
    card.title = word;
    card.aliases = [...new Set((input.aliases || []).map(alias => alias.trim()).filter(Boolean))];
    card.data.language = /[\u4e00-\u9fff]/.test(word) ? 'zh' : 'en';
    card.data.itemType = /[\s-]/.test(word) ? 'phrase' : 'word';
    // Preserve the supplied free-form text using the existing word-card defaults.
    card.data.meanings[0].definition = input.definition;
    pack.cards.push(card);
    return card;
}

export async function getAddableVocabularyBooks(plugin: HiWordsPlugin) {
    const books = plugin.settings.vocabularyBooks.filter(book => book.enabled);
    const available = await Promise.all(books.map(async book => {
        const file = plugin.app.vault.getAbstractFileByPath(book.path);
        if (!(file instanceof TFile)) return null;
        if (file.extension === 'canvas') return book;
        if (file.extension !== 'hiwords') return null;
        try {
            const document = parseHiWordsEditorDocument(await plugin.app.vault.read(file));
            return document.kind === 'hiwords' && document.pack.cardKind === WORD_CARD_KIND ? book : null;
        } catch { return null; }
    }));
    return available.filter((book): book is typeof books[number] => book !== null);
}

export async function addVocabularyWord(plugin: HiWordsPlugin, path: string, input: NewVocabularyWord, color?: number): Promise<boolean> {
    if (!plugin.settings.vocabularyBooks.some(book => book.enabled && book.path === path)) return false;
    if (path.endsWith('.canvas')) return plugin.vocabularyManager.addWordToCanvas(path, input.word, input.definition, color, input.aliases);
    if (!path.endsWith('.hiwords')) return false;
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const editor = plugin.app.workspace.getLeavesOfType('hi-words-file-editor')
        .map(leaf => leaf.view as unknown as { file?: TFile; appendVocabularyWord?: (input: NewVocabularyWord) => Promise<boolean> })
        .find(view => view.file?.path === path && view.appendVocabularyWord);
    if (editor?.appendVocabularyWord) return editor.appendVocabularyWord(input);
    // Read the latest file inside the atomic mutation, preserving concurrent additions.
    await plugin.app.vault.process(file, data => {
        const document = parseHiWordsEditorDocument(data);
        if (document.kind !== 'hiwords') throw new Error(document.message);
        appendWordCard(document.pack, input);
        return serializeHiWordsPack(document.pack);
    });
    await plugin.vocabularyManager.reloadVocabularyBook(path);
    plugin.refreshHighlighter();
    return true;
}
