import { App, Modal, setIcon } from 'obsidian';
import type { TranslationResult } from '../utils';
import { t } from '../i18n';

export class TranslationResultModal extends Modal {
    private originalText: string;
    private translatedText: string = '';
    private isStreaming: boolean = false;
    private translatedTextEl!: HTMLElement;
    private copyTranslatedBtn!: HTMLElement;

    constructor(app: App, originalText: string) {
        super(app);
        this.originalText = originalText;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hiwords-translation-modal');

        const headerEl = contentEl.createDiv({ cls: 'hiwords-modal-header' });
        headerEl.createEl('h2', { text: t('translation.title'), cls: 'hiwords-modal-title' });

        const contentContainer = contentEl.createDiv({ cls: 'hiwords-modal-content' });
        const originalSection = contentContainer.createDiv({ cls: 'hiwords-translation-section' });

        const originalTextEl = originalSection.createDiv({ 
            text: this.originalText, 
            cls: 'hiwords-translation-text' 
        });

        const copyOriginalBtn = originalSection.createDiv({ cls: 'hiwords-copy-button' });
        setIcon(copyOriginalBtn, 'copy');
        copyOriginalBtn.setAttribute('aria-label', t('common.copy'));
        copyOriginalBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(this.originalText);
            copyOriginalBtn.empty();
            setIcon(copyOriginalBtn, 'check');
            setTimeout(() => {
                copyOriginalBtn.empty();
                setIcon(copyOriginalBtn, 'copy');
            }, 2000);
        });

        const divider = contentContainer.createDiv({ cls: 'hiwords-divider' });
        setIcon(divider, 'arrow-down');

        const translatedSection = contentContainer.createDiv({ cls: 'hiwords-translation-section' });

        this.translatedTextEl = translatedSection.createDiv({ 
            text: t('translation.translating'), 
            cls: 'hiwords-translation-text hiwords-translation-result hiwords-streaming-content' 
        });

        this.copyTranslatedBtn = translatedSection.createDiv({ cls: 'hiwords-copy-button' });
        setIcon(this.copyTranslatedBtn, 'copy');
        this.copyTranslatedBtn.setAttribute('aria-label', t('common.copy'));
        this.copyTranslatedBtn.style.display = 'none';
        this.copyTranslatedBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(this.translatedText);
            this.copyTranslatedBtn.empty();
            setIcon(this.copyTranslatedBtn, 'check');
            setTimeout(() => {
                this.copyTranslatedBtn.empty();
                setIcon(this.copyTranslatedBtn, 'copy');
            }, 2000);
        });
    }

    startStreaming() {
        this.isStreaming = true;
        this.translatedText = '';
        this.translatedTextEl.empty();
        this.translatedTextEl.setText(t('translation.translating'));
        this.copyTranslatedBtn.style.display = 'none';
    }

    appendStreamChunk(chunk: string) {
        if (!this.isStreaming) return;
        
        this.translatedText += chunk;
        this.translatedTextEl.setText(this.translatedText);
    }

    completeStreaming() {
        this.isStreaming = false;
        this.translatedTextEl.removeClass('hiwords-streaming-content');
        this.translatedTextEl.addClass('hiwords-stream-complete');
        this.copyTranslatedBtn.style.display = '';
    }

    showError(error: string) {
        this.isStreaming = false;
        this.translatedTextEl.empty();
        this.translatedTextEl.createEl('p', { 
            text: error, 
            cls: 'hiwords-error' 
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
