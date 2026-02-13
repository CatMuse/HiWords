import { App, Modal, setIcon, Notice } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { playWordTTS } from '../utils';
import { t } from '../i18n';
import { AddWordModal } from './add-word-modal';
import { renderMarkdownToHTML } from '../utils/markdown-renderer';

export class DictionaryResultModal extends Modal {
    private plugin: HiWordsPlugin;
    private word: string;
    private contentContainer!: HTMLElement;
    private isStreaming: boolean = false;
    private streamBuffer: string = '';
    private selectedBookPath: string = '';
    private addButton!: HTMLElement;
    private bookSelect!: HTMLSelectElement;
    private isWordSaved: boolean = false;

    constructor(app: App, plugin: HiWordsPlugin, word: string) {
        super(app);
        this.plugin = plugin;
        this.word = word;
        this.checkIfWordExists();
    }

    private checkIfWordExists() {
        const definition = this.plugin.vocabularyManager.getDefinition(this.word);
        if (definition) {
            this.isWordSaved = true;
            this.selectedBookPath = definition.source;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hiwords-dictionary-modal');

        const headerEl = contentEl.createDiv({ cls: 'hiwords-modal-header' });
        
        const titleContainer = headerEl.createDiv({ cls: 'hiwords-modal-title-container' });
        titleContainer.createEl('h2', { text: this.word, cls: 'hiwords-modal-title' });

        const actionsContainer = headerEl.createDiv({ cls: 'hiwords-modal-actions' });

        if (this.plugin.settings.ttsTemplate) {
            const playButton = actionsContainer.createDiv({ cls: 'hiwords-play-button' });
            setIcon(playButton, 'volume-2');
            playButton.setAttribute('aria-label', t('dictionary.play_pronunciation'));
            
            playButton.addEventListener('click', async () => {
                await playWordTTS(this.plugin, this.word);
            });
        }

        const bookSelectContainer = actionsContainer.createDiv({ cls: 'hiwords-book-select-container' });
        this.bookSelect = bookSelectContainer.createEl('select', { cls: 'dropdown hiwords-book-select' });
        
        this.bookSelect.createEl('option', { text: t('modals.select_book'), value: '' });
        
        const enabledBooks = this.plugin.settings.vocabularyBooks.filter(book => book.enabled);
        enabledBooks.forEach((book) => {
            const option = this.bookSelect.createEl('option', { text: book.name, value: book.path });
            if (this.isWordSaved && book.path === this.selectedBookPath) {
                option.selected = true;
            }
        });

        this.bookSelect.addEventListener('change', (e) => {
            this.selectedBookPath = (e.target as HTMLSelectElement).value;
        });

        this.addButton = actionsContainer.createDiv({ cls: 'hiwords-add-button' });
        setIcon(this.addButton, 'star');
        this.addButton.setAttribute('aria-label', t('dictionary.add_to_vocabulary'));
        
        if (this.isWordSaved) {
            this.addButton.addClass('hiwords-word-saved');
        }
        
        this.addButton.addEventListener('click', async () => {
            await this.handleAddToVocabulary();
        });

        this.contentContainer = contentEl.createDiv({ cls: 'hiwords-modal-content' });
        this.contentContainer.createDiv({ 
            text: t('dictionary.loading'), 
            cls: 'hiwords-loading' 
        });
    }

    private async handleAddToVocabulary() {
        if (!this.selectedBookPath) {
            new Notice(t('modals.please_select_book'));
            return;
        }

        const definition = this.streamBuffer || '';
        
        const modal = new AddWordModal(
            this.app,
            this.plugin,
            this.word,
            '',
            this.isWordSaved
        );
        
        modal.open();
        
        setTimeout(() => {
            const bookSelect = modal.contentEl.querySelector('select.dropdown') as HTMLSelectElement;
            if (bookSelect) {
                bookSelect.value = this.selectedBookPath;
            }
            
            const definitionTextarea = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
            if (definitionTextarea && !this.isWordSaved) {
                definitionTextarea.value = definition;
            }
        }, 100);

        modal.onClose = () => {
            this.updateSaveStatus();
        };
    }

    private updateSaveStatus() {
        const definition = this.plugin.vocabularyManager.getDefinition(this.word);
        if (definition && !this.isWordSaved) {
            this.isWordSaved = true;
            this.selectedBookPath = definition.source;
            this.addButton.addClass('hiwords-word-saved');
            
            if (this.bookSelect) {
                this.bookSelect.value = this.selectedBookPath;
            }
        }
    }

    startStreaming() {
        this.isStreaming = true;
        this.streamBuffer = '';
        this.contentContainer.empty();
        this.contentContainer.createDiv({ cls: 'hiwords-streaming-content' });
    }

    appendStreamChunk(chunk: string) {
        if (!this.isStreaming) return;
        
        this.streamBuffer += chunk;
        
        const streamingDiv = this.contentContainer.querySelector('.hiwords-streaming-content');
        if (streamingDiv) {
            streamingDiv.empty();
            streamingDiv.createDiv().innerHTML = renderMarkdownToHTML(this.streamBuffer);
        }
    }

    completeStreaming() {
        this.isStreaming = false;
        
        const streamingDiv = this.contentContainer.querySelector('.hiwords-streaming-content');
        if (streamingDiv) {
            streamingDiv.addClass('hiwords-stream-complete');
        }
    }

    showError(error: string) {
        this.isStreaming = false;
        this.contentContainer.empty();
        this.contentContainer.createEl('p', { 
            text: error, 
            cls: 'hiwords-error' 
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
