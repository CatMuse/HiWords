import { Component, setIcon, Notice } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { DictionaryLookupService } from '../services/dictionary-lookup-service';
import { TranslationService } from '../services/translation-service';
import { GrammarAnalysisService } from '../services/grammar-analysis-service';
import { DictionaryResultModal } from './dictionary-result-modal';
import { TranslationResultModal } from './translation-result-modal';
import { GrammarAnalysisModal } from './grammar-analysis-modal';
import { t } from '../i18n';

export class SelectionBubbleMenu extends Component {
    private plugin: HiWordsPlugin;
    private bubbleEl: HTMLElement | null = null;
    private currentSelection: string | null = null;
    private hideTimeout: number | null = null;
    private dictionaryService: DictionaryLookupService | null = null;
    private translationService: TranslationService | null = null;
    private grammarService: GrammarAnalysisService | null = null;

    constructor(plugin: HiWordsPlugin) {
        super();
        this.plugin = plugin;
        this.initializeServices();
        this.registerSelectionEvents();
    }

    private initializeServices() {
        const settings = this.plugin.settings;
        
        if (settings.aiDictionary) {
            const outputLanguage = settings.aiOutputLanguage || 'Chinese (Simplified)';
            
            this.dictionaryService = new DictionaryLookupService(
                settings.aiDictionary,
                outputLanguage
            );
            this.translationService = new TranslationService(
                settings.aiDictionary,outputLanguage
            );
            this.grammarService = new GrammarAnalysisService(
                settings.aiDictionary,
                outputLanguage
            );
        }
    }

    private registerSelectionEvents() {
        this.registerDomEvent(document, 'mouseup', this.handleMouseUp);
        this.registerDomEvent(document, 'selectionchange', this.handleSelectionChange);
        this.registerDomEvent(document, 'mousedown', this.handleMouseDown);
    }

    private handleMouseUp = (event: MouseEvent) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();
            
            if (selectedText && selectedText.length > 0 && selectedText.length < 1000) {
                const range = selection?.getRangeAt(0);
                if (range) {
                    this.showBubbleMenu(selectedText, range);
                }
            } else {
                this.hideBubbleMenu();
            }
        }, 10);
    };

    private handleSelectionChange = () => {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    };

    private handleMouseDown = (event: MouseEvent) => {
        if (this.bubbleEl && !this.bubbleEl.contains(event.target as Node)) {
            this.hideBubbleMenu();
        }
    };

    private showBubbleMenu(text: string, range: Range) {
        if (!this.plugin.settings.selectionBubble) {
            return;
        }

        this.hideBubbleMenu();
        this.currentSelection = text;

        this.bubbleEl = document.createElement('div');
        this.bubbleEl.className = 'hiwords-selection-bubble';

        this.addButton('book-open', t('selection_bubble.lookup'), () => this.handleDictionaryLookup());
        this.addButton('languages', t('selection_bubble.translate'), () => this.handleTranslation());
        this.addButton('search', t('selection_bubble.grammar'), () => this.handleGrammarAnalysis());
        this.addButton('bookmark-plus', t('selection_bubble.add_to_vocab'), () => this.handleAddToVocabulary());

        document.body.appendChild(this.bubbleEl);

        requestAnimationFrame(() => {
            this.positionBubbleMenu(range);
        });

        this.bubbleEl.addEventListener('mouseenter', () => {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });

        this.bubbleEl.addEventListener('mouseleave', () => {
            this.hideTimeout = window.setTimeout(() => {
                this.hideBubbleMenu();
            }, 300);
        });
    }

    private addButton(icon: string, tooltip: string, onClick: () => void) {
        if (!this.bubbleEl) return;

        const button = this.bubbleEl.createDiv({ cls: 'hiwords-bubble-button' });
        setIcon(button, icon);
        button.setAttribute('aria-label', tooltip);
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
    }

    private positionBubbleMenu(range: Range) {
        if (!this.bubbleEl) return;

        const rect = range.getBoundingClientRect();
        const bubbleRect = this.bubbleEl.getBoundingClientRect();

        let top = rect.top - bubbleRect.height - 8;
        let left = rect.left + (rect.width / 2) - (bubbleRect.width / 2);

        if (top < 0) {
            top = rect.bottom + 8;
        }

        if (left < 0) {
            left = 8;
        } else if (left + bubbleRect.width > window.innerWidth) {
            left = window.innerWidth - bubbleRect.width - 8;
        }

        this.bubbleEl.style.top = `${top + window.scrollY}px`;
        this.bubbleEl.style.left = `${left + window.scrollX}px`;
    }

    private hideBubbleMenu() {
        if (this.bubbleEl) {
            this.bubbleEl.remove();
            this.bubbleEl = null;
        }
        this.currentSelection = null;
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    private async handleDictionaryLookup() {
        if (!this.currentSelection || !this.dictionaryService) return;

        const selectedText = this.currentSelection.trim();
        this.hideBubbleMenu();

        const modal = new DictionaryResultModal(this.plugin.app, this.plugin, selectedText);
        modal.open();
        modal.startStreaming();

        try {
            await this.dictionaryService.lookupWordStream(
                selectedText,
                (chunk) => modal.appendStreamChunk(chunk),
                () => modal.completeStreaming(),
                (error) => modal.showError(error.message)
            );
        } catch (error) {
            modal.showError(error instanceof Error ? error.message : t('dictionary.lookup_failed'));
        }
    }

    private async handleTranslation() {
        const selectedText = this.currentSelection;
        
        if (!selectedText || !this.translationService) {
            new Notice(t('selection_bubble.translation_not_configured'));
            return;
        }

        this.hideBubbleMenu();

        const modal = new TranslationResultModal(this.plugin.app, selectedText);
        modal.open();
        modal.startStreaming();

        try {
            await this.translationService.translateStream(
                selectedText,
                (chunk) => modal.appendStreamChunk(chunk),
                () => modal.completeStreaming(),
                (error) => modal.showError(error.message)
            );
        } catch (error) {
            modal.showError(error instanceof Error ? error.message : t('selection_bubble.translation_failed'));
        }
    }

    private async handleGrammarAnalysis() {
        const selectedText = this.currentSelection;
        
        if (!selectedText || !this.grammarService) {
            new Notice(t('selection_bubble.grammar_not_configured'));
            return;
        }

        this.hideBubbleMenu();

        const modal = new GrammarAnalysisModal(this.plugin.app, selectedText);
        modal.open();
        modal.startStreaming();

        try {
            await this.grammarService.analyzeGrammarStream(
                selectedText,
                (chunk) => modal.appendStreamChunk(chunk),
                () => modal.completeStreaming(),
                (error) => modal.showError(error.message)
            );
        } catch (error) {
            modal.showError(error instanceof Error ? error.message : t('selection_bubble.grammar_failed'));
        }
    }

    private handleAddToVocabulary() {
        if (!this.currentSelection) return;

        const selectedText = this.currentSelection.trim();
        this.hideBubbleMenu();

        this.plugin.addOrEditWord(selectedText, '');
    }

    updateSettings() {
        this.initializeServices();
    }

    onunload() {
        this.hideBubbleMenu();
    }
}
