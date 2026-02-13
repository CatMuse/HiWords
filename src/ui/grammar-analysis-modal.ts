import { App, Modal, Component } from 'obsidian';
import { t } from '../i18n';
import { renderMarkdownToElement } from '../utils/markdown-renderer';

export class GrammarAnalysisModal extends Modal {
    private originalText: string;
    private analysisResult: string = '';
    private analysisContent: HTMLElement | null = null;
    private tempComponent: Component | null = null;
    private isStreaming: boolean = false;

    constructor(app: App, originalText: string) {
        super(app);
        this.originalText = originalText;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hiwords-grammar-modal');

        const headerEl = contentEl.createDiv({ cls: 'hiwords-modal-header' });
        headerEl.createEl('h2', { text: t('grammar.title'), cls: 'hiwords-modal-title' });

        const contentContainer = contentEl.createDiv({ cls: 'hiwords-modal-content' });

        const originalSection = contentContainer.createDiv({ cls: 'hiwords-grammar-section' });
        originalSection.createEl('h3', { text: t('grammar.original_text'), cls: 'hiwords-section-title' });
        originalSection.createEl('div', { 
            text: this.originalText, 
            cls: 'hiwords-grammar-original' 
        });

        const analysisSection = contentContainer.createDiv({ cls: 'hiwords-grammar-section' });
        analysisSection.createEl('h3', { text: t('grammar.analysis_result'), cls: 'hiwords-section-title' });
        
        this.analysisContent = analysisSection.createDiv({ cls: 'hiwords-grammar-analysis' });
    }

    startStreaming() {
        this.isStreaming = true;
        this.analysisResult = '';
        if (this.analysisContent) {
            this.analysisContent.empty();
            this.analysisContent.createEl('div', { 
                text: t('selection_bubble.analyzing'), 
                cls: 'hiwords-streaming-indicator' 
            });
        }
    }

    appendStreamChunk(chunk: string) {
        if (!this.isStreaming || !this.analysisContent) return;
        
        this.analysisResult += chunk;
        this.renderMarkdown(this.analysisResult);
    }

    completeStreaming() {
        this.isStreaming = false;
    }

    showError(message: string) {
        this.isStreaming = false;
        if (this.analysisContent) {
            this.analysisContent.empty();
            this.analysisContent.createEl('div', { 
                text: message, 
                cls: 'hiwords-error-message' 
            });
        }
    }

    private async renderMarkdown(content: string) {
        if (!this.analysisContent) return;

        if (this.tempComponent) {
            this.tempComponent.unload();
        }

        this.analysisContent.empty();
        this.tempComponent = await renderMarkdownToElement(
            this.app,
            content,
            this.analysisContent,
            ''
        );
    }

    onClose() {
        if (this.tempComponent) {
            this.tempComponent.unload();
            this.tempComponent = null;
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}
