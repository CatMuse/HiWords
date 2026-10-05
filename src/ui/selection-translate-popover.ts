import { createWordPopoverShell, positionWordPopover } from './word-popover-shell';
import { playWordTTS } from '../utils/tts';
import { selectedWord } from '../dictionary/hidict';
import { resolveSelection } from '../dictionary/selection-lookup';
import { dictText } from '../dictionary/text';
import { renderHidictResult } from './hidict-result';
import type { PopoverContext } from './popover-context';
import { Component, MarkdownView, setIcon } from 'obsidian';
import HiWordsPlugin from '../../main';
import { TranslationService } from '../services/translation-service';
import { t } from '../i18n';
import { extractSentenceFromEditorMultiline, extractSentenceFromSelection } from '../utils/sentence-extractor';

/**
 * 划词查询与翻译浮窗组件
 * 监听用户选中文本，弹出翻译浮窗，支持翻译结果展示和添加到生词本
 */
export class SelectionTranslatePopover extends Component {
    private plugin: HiWordsPlugin;
    private translationService: TranslationService;
    private externalContext?: PopoverContext;
    private requestRevision = 0;
    private externalListeners?: Component;
    private activePopover: HTMLElement | null = null;
    private debounceTimer: number | null = null;
    private currentTranslateText = '';
    private isTranslating = false;
    private static readonly DEBOUNCE_MS = 300;

    constructor(plugin: HiWordsPlugin) {
        super();
        this.plugin = plugin;
        this.translationService = new TranslationService(plugin.settings, () => plugin.getAIAPIKey());
    }

    onload() {
        this.registerDomEvent(activeDocument, 'mouseup', (event: MouseEvent) => {
            this.handleMouseUp(event);
        });
        this.registerDomEvent(activeDocument, 'mousedown', (event: MouseEvent) => {
            if (this.activePopover && !this.activePopover.contains(event.target as Node)) {
                this.removePopover();
            }
        });
        this.registerDomEvent(window, 'scroll', () => this.removePopover(), { passive: true });
        this.registerDomEvent(window, 'resize', () => this.removePopover());
        this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape' && this.activePopover) {
                this.removePopover();
            }
        });
    }

    updateSettings() {
        this.translationService.updateSettings(this.plugin.settings);
        this.removePopover();
    }

    showSelection(text: string, context: PopoverContext): void {
        if (!this.canLookup(text) || !context.isCurrent()) return;
        if (!text.trim() || text.length > 500) return;
        if (this.externalContext?.owner === context.owner && this.externalContext.sourcePath === context.sourcePath
            && this.currentTranslateText === text.trim() && this.activePopover) return;
        this.showPopover(text.trim(), context.rect, context);
    }

    private canLookup(text: string): boolean {
        return this.plugin.settings.selectionTranslate.enabled || !!(this.plugin.settings.hidictPath && selectedWord(text));
    }

    closeForOwner(owner: object): void {
        if (this.externalContext?.owner === owner) this.removePopover();
    }

    private handleMouseUp(event: MouseEvent) {
        if (!this.plugin.settings.selectionTranslate.enabled && !this.plugin.settings.hidictPath) {
            return;
        }
        if (this.activePopover && this.activePopover.contains(event.target as Node)) {
            return;
        }
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = null;
            this.tryShowPopover(event);
        }, SelectionTranslatePopover.DEBOUNCE_MS);
    }

    private tryShowPopover(event: MouseEvent) {
        const selectedText = this.getSelectedText();
        if (!selectedText || !this.canLookup(selectedText) || selectedText.length > 500) {
            return;
        }
        const target = event.target as HTMLElement;
        if (target?.closest?.('.hi-words-highlight')) {
            return;
        }
        if (this.currentTranslateText === selectedText && this.activePopover) {
            return;
        }

        this.currentTranslateText = selectedText;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width < 2 && rect.height < 2) return;
        this.showPopover(selectedText, rect);
    }

    private getSelectedText(): string {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const viewMode = activeView?.getMode();

        if (editor && viewMode === 'source') {
            return editor.getSelection().trim();
        }
        const selection = window.getSelection();
        return selection?.toString().trim() || '';
    }

    private getSentence(): string {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const viewMode = activeView?.getMode();

        if (editor && viewMode === 'source') {
            return extractSentenceFromEditorMultiline(editor);
        }

        return extractSentenceFromSelection(window.getSelection());
    }

    private showPopover(text: string, rect: PopoverContext['rect'], context?: PopoverContext) {
        this.removePopover();

        this.externalContext = context;
        this.currentTranslateText = text;
        const sentence = context?.sentence ?? this.getSentence();
        const doc = context?.document || activeDocument;
        const win = doc.defaultView!;
        const dictionaryMode = !!(this.plugin.settings.hidictPath && selectedWord(text));
        const shell = createWordPopoverShell(doc, text, dictionaryMode ? 'dictionary' : 'translation');
        const { root: popover, title: titleEl, actions: actionsEl } = shell;
        popover.classList.add('hi-words-translate-popover');
        if (dictionaryMode) popover.classList.add('hi-words-hidict-popover');
        titleEl.classList.add('hi-words-translate-title');

        let resultWord = text;
        let resultDefinition = '';
        const addBtn = actionsEl.createEl('button', { cls: 'hi-words-card-action hi-words-translate-btn hi-words-translate-btn-add', attr: { 'aria-label': dictText('add') } });
        addBtn.disabled = true;
        setIcon(addBtn, 'book-plus');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (context && !context.isCurrent()) return;
            if (!resultDefinition) return;
            this.removePopover();
            this.plugin.addOrEditWord(resultWord, sentence, resultDefinition);
        });
        const contentEl = shell.content;
        contentEl.classList.add('hi-words-translate-content');
        popover.appendChild(contentEl);
        const loadingEl = contentEl.createDiv({ cls: 'hi-words-translate-loading' });
        const spinnerEl = loadingEl.createDiv({ cls: 'hi-words-translate-spinner' });
        setIcon(spinnerEl, 'loader');
        loadingEl.createSpan({ text: this.plugin.settings.hidictPath && selectedWord(text) ? dictText('loading') : t('translate.translating') });
        popover.addEventListener('mousedown', (e) => e.stopPropagation());

        doc.body.appendChild(popover);
        if (context) {
            const listeners = new Component(); this.addChild(listeners); this.externalListeners = listeners;
            listeners.registerDomEvent(doc, 'mousedown', event => { if (!popover.contains(event.target as Node)) this.removePopover(); });
            listeners.registerDomEvent(doc, 'keydown', event => { if (event.key === 'Escape') this.removePopover(); });
            listeners.registerDomEvent(win, 'resize', () => this.removePopover());
        }
        const position = () => positionWordPopover(popover, rect, doc);

        this.activePopover = popover;
        position();
        void this.doTranslate(text, contentEl, (word, definition) => {
            resultWord = word; resultDefinition = definition; titleEl.textContent = word;
            addBtn.disabled = !definition;
            position();
        }, shell).then(position);
    }

    private async doTranslate(text: string, contentEl: HTMLElement, ready: (word: string, definition: string) => void, shell: ReturnType<typeof createWordPopoverShell>) {
        if (this.isTranslating) {
            this.translationService.abort();
        }

        this.isTranslating = true;
        const revision = ++this.requestRevision;
        const context = this.externalContext;
        const current = () => revision === this.requestRevision && contentEl.isConnected && (!context || context.isCurrent());
        try {
            const result = await resolveSelection(text, {
                dictionary: !!this.plugin.settings.hidictPath, ai: this.plugin.settings.selectionTranslate.enabled, current,
                lookup: word => this.plugin.hidictService.lookup(word), translate: value => this.translationService.translate(value),
            });

            if (!current()) return;
            contentEl.empty();
            if (result.kind === 'dictionary') {
                const pronounce = (word: string, variant?: 'uk' | 'us') => {
                    if (!current()) return;
                    void playWordTTS(this.plugin, word, variant).catch(error => console.error('HiWords pronunciation failed:', error));
                };
                renderHidictResult(contentEl, result.entries, (entry, definition) => {
                    ready(entry.word, definition);
                    shell.setPronunciation(() => pronounce(entry.word), dictText('pronounce'));
                }, { phoneticsContainer: shell.heading, onPhonetic: shell.bindPronunciation, pronunciationVariant: this.plugin.settings.pronunciationVariant });
            } else if (result.kind === 'translation') {
                this.activePopover?.classList.remove('hi-words-hidict-popover');
                shell.setMode('translation');
                shell.setPronunciation();
                contentEl.createDiv({ cls: 'hi-words-translate-result', text: result.text });
                ready(text, result.text);
            } else if (result.kind === 'miss') contentEl.createDiv({ text: dictText('miss') });
        } catch (error) {
            if (!current()) return;
            contentEl.empty();
            const errorEl = contentEl.createDiv({ cls: 'hi-words-translate-error' });
            const errorIconEl = errorEl.createDiv({ cls: 'hi-words-translate-error-icon' });
            setIcon(errorIconEl, 'alert-circle');
            errorEl.createSpan({ text: error instanceof Error ? error.message : t('translate.failed') });
        } finally {
            if (revision === this.requestRevision) this.isTranslating = false;
        }
    }

    private removePopover() {
        this.requestRevision++;
        if (this.externalListeners) { this.removeChild(this.externalListeners); this.externalListeners = undefined; }
        if (this.debounceTimer !== null) { window.clearTimeout(this.debounceTimer); this.debounceTimer = null; }
        this.externalContext = undefined;
        this.translationService.abort();
        this.isTranslating = false;
        if (this.activePopover && this.activePopover.parentNode) {
            this.activePopover.parentNode.removeChild(this.activePopover);
        }
        this.activePopover = null;
        this.currentTranslateText = '';
    }

    onunload() {
        this.removePopover();
        this.translationService.abort();
        if (this.debounceTimer !== null) {
            window.clearTimeout(this.debounceTimer);
        }
    }
}
