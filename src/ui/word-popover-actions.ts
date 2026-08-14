import { Notice, setIcon } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { VaultContextService, VaultWordContext } from '../services/vault-context-service';
import { HiWordsMutationService } from '../services/hiwords-mutation-service';
import { extractSentence } from '../utils/sentence-extractor';
import type { WordDefinition } from '../utils';

interface WordPopoverActionOptions {
    tooltip: HTMLElement;
    contentEl: HTMLElement;
    wordDef: WordDefinition;
    currentSentence: string;
    contextQuery: string;
    sourcePath: string;
    onOpenDetail: () => void;
    onClose: () => void;
}

export class WordPopoverActions {
    private readonly contextService: VaultContextService;
    private readonly mutationService: HiWordsMutationService;
    private contextQueryId = 0;

    constructor(private readonly plugin: HiWordsPlugin) {
        this.contextService = new VaultContextService(plugin.app);
        this.mutationService = new HiWordsMutationService(plugin);
    }

    render(options: WordPopoverActionOptions): void {
        const actions = options.tooltip.createDiv({ cls: 'hi-words-tooltip-actions' });
        const mainContentNodes = Array.from(options.contentEl.childNodes);
        const mainContentClassName = options.contentEl.className;
        let mainScrollTop = 0;
        const openSubview = (render: () => void): void => {
            mainScrollTop = options.contentEl.scrollTop;
            render();
        };
        const restoreMainView = (): void => {
            this.cancel();
            options.contentEl.empty();
            options.contentEl.className = mainContentClassName;
            options.contentEl.append(...mainContentNodes);
            options.tooltip.removeClass('is-subview');
            actions.querySelectorAll('.hi-words-tooltip-action').forEach(button => {
                button.removeClass('is-active');
            });
            options.contentEl.scrollTop = mainScrollTop;
        };
        const items: Array<{
            key: string;
            label: string;
            icon: string;
            run: (button: HTMLButtonElement) => void;
        }> = [
            { key: 'detail', label: this.localized('popover.detail', 'Details'), icon: 'list', run: options.onOpenDetail },
            {
                key: 'note',
                label: this.localized('popover.note', 'Note'),
                icon: 'notebook-pen',
                run: button => {
                    this.setActiveAction(actions, button);
                    openSubview(() => this.renderNote(options.contentEl, options.wordDef, restoreMainView));
                },
            },
            {
                key: 'examples',
                label: this.localized('popover.examples', 'Sentence'),
                icon: 'bookmark',
                run: button => {
                    this.setActiveAction(actions, button);
                    openSubview(() => this.renderExamples(options.contentEl, options.wordDef, options.currentSentence, options.sourcePath, restoreMainView));
                },
            },
            {
                key: 'context',
                label: this.localized('popover.context', 'Context'),
                icon: 'files',
                run: button => {
                    this.setActiveAction(actions, button);
                    openSubview(() => {
                        void this.renderVaultContexts(
                            options.contentEl,
                            options.wordDef,
                            options.contextQuery || options.wordDef.word,
                            options.sourcePath,
                            restoreMainView,
                            options.onClose
                        );
                    });
                },
            },
        ];

        for (const item of items) {
            const button = actions.createEl('button', {
                cls: 'hi-words-tooltip-action',
                attr: { type: 'button', 'data-action': item.key },
            });
            const icon = button.createSpan({ cls: 'hi-words-tooltip-action-icon' });
            setIcon(icon, item.icon);
            button.createSpan({ text: item.label, cls: 'hi-words-tooltip-action-label' });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                item.run(button);
            });
        }
    }

    cancel(): void {
        this.contextQueryId += 1;
    }

    destroy(): void {
        this.cancel();
        this.contextService.destroy();
    }

    private setActiveAction(actions: HTMLElement, activeButton: HTMLButtonElement): void {
        actions.querySelectorAll('.hi-words-tooltip-action').forEach(button => {
            button.toggleClass('is-active', button === activeButton);
        });
    }

    private renderExamples(
        contentEl: HTMLElement,
        wordDef: WordDefinition,
        currentSentence: string,
        sourcePath: string,
        onBack: () => void
    ): void {
        this.cancel();
        this.prepareSubview(contentEl);
        this.renderSubviewHeader(contentEl, this.localized('popover.examples_title', 'Sentence'), onBack);

        const examples: Array<{ text: string; translation?: string; source?: string }> = [
            ...(currentSentence ? [{ text: currentSentence, source: sourcePath || this.localized('popover.current_note', 'Current note') }] : []),
            ...(this.mutationService.getSavedSentences(wordDef).map(sentence => ({
                text: sentence.text,
                translation: sentence.translation,
                source: sentence.source,
            })) || []),
        ].filter(item => !!item.text)
            .filter((item, index, all) => all.findIndex(candidate => normalizeSentence(candidate.text) === normalizeSentence(item.text)) === index);

        if (examples.length === 0) {
            this.renderEmpty(contentEl, this.localized('popover.no_examples', 'No examples found for this occurrence.'));
            return;
        }

        const list = contentEl.createDiv({ cls: 'hi-words-tooltip-context-list' });
        for (const example of examples) {
            const item = list.createDiv({ cls: 'hi-words-tooltip-context-item is-static hi-words-tooltip-saveable-item' });
            const body = item.createDiv({ cls: 'hi-words-tooltip-saveable-body' });
            this.renderHighlightedSentence(body, example.text, wordDef.word);
            if (example.translation) body.createDiv({ text: example.translation, cls: 'hi-words-tooltip-context-translation' });
            if (example.source) body.createDiv({ text: example.source, cls: 'hi-words-tooltip-context-source' });
            if (this.mutationService.canSaveSentences(wordDef)) {
                const saved = this.mutationService.isSentenceSaved(wordDef, example.text);
                const save = this.createSentenceToggle(item, saved);
                save.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    save.disabled = true;
                    void this.mutationService.toggleSentence(wordDef, example).then(result => {
                        if (!result.success) {
                            new Notice(this.localized('popover.sentence_save_failed', 'Could not update this vocabulary.'));
                            save.disabled = false;
                            return;
                        }
                        this.renderExamples(contentEl, wordDef, currentSentence, sourcePath, onBack);
                    }).catch(error => {
                        console.error('HiWords failed to update saved sentence:', error);
                        new Notice(this.localized('popover.sentence_save_failed', 'Could not update this vocabulary.'));
                        save.disabled = false;
                    });
                });
            }
        }
    }

    private renderNote(contentEl: HTMLElement, wordDef: WordDefinition, onBack: () => void): void {
        this.cancel();
        this.prepareSubview(contentEl);
        this.renderSubviewHeader(contentEl, this.localized('popover.note_title', 'Note'));

        const form = contentEl.createDiv({ cls: 'hi-words-tooltip-note-form' });
        const noteLabelId = 'hi-words-tooltip-note-input-label';
        form.createSpan({
            text: this.localized('popover.note_title', 'Note'),
            cls: 'hi-words-visually-hidden',
            attr: { id: noteLabelId },
        });
        const textarea = form.createEl('textarea', {
            cls: 'hi-words-tooltip-note-input',
            attr: {
                placeholder: t('sidebar.note_placeholder'),
                'aria-labelledby': noteLabelId,
            },
        });
        textarea.value = this.mutationService.getNote(wordDef);
        textarea.rows = 6;

        const status = form.createDiv({ cls: 'hi-words-tooltip-note-status', attr: { 'aria-live': 'polite' } });
        const buttons = form.createDiv({ cls: 'hi-words-tooltip-note-actions' });
        if (this.mutationService.getNote(wordDef)) {
            const remove = buttons.createEl('button', {
                cls: 'hi-words-tooltip-note-delete',
                attr: { type: 'button' },
            });
            setIcon(remove, 'trash-2');
            remove.createSpan({ text: t('sidebar.delete_note') });
            remove.addEventListener('click', () => void this.deleteNote(wordDef, buttons, status, onBack));
        }

        const cancel = buttons.createEl('button', {
            cls: 'hi-words-tooltip-note-cancel',
            text: t('modals.cancel_button'),
            attr: { type: 'button' },
        });
        cancel.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onBack();
        });

        const save = buttons.createEl('button', {
            cls: 'mod-cta hi-words-tooltip-note-save',
            text: t('modals.save_button'),
            attr: { type: 'button' },
        });
        save.addEventListener('click', () => void this.saveNote(wordDef, textarea, buttons, status, onBack));
        window.setTimeout(() => textarea.focus(), 0);
    }

    private async saveNote(
        wordDef: WordDefinition,
        textarea: HTMLTextAreaElement,
        buttons: HTMLElement,
        status: HTMLElement,
        onBack: () => void
    ): Promise<void> {
        const note = textarea.value.trim();
        if (!note) {
            status.setText(t('sidebar.note_required'));
            textarea.focus();
            return;
        }
        this.setNoteFormBusy(buttons, true);
        status.setText(this.localized('popover.saving_note', 'Saving…'));
        try {
            const success = await this.mutationService.saveNote(wordDef, note);
            if (!success) {
                status.setText(t('sidebar.note_save_failed'));
                return;
            }
            new Notice(t('sidebar.note_saved'));
            onBack();
        } catch (error) {
            console.error('HiWords failed to save note:', error);
            status.setText(t('sidebar.note_save_failed'));
        } finally {
            this.setNoteFormBusy(buttons, false);
        }
    }

    private async deleteNote(
        wordDef: WordDefinition,
        buttons: HTMLElement,
        status: HTMLElement,
        onBack: () => void
    ): Promise<void> {
        this.setNoteFormBusy(buttons, true);
        status.setText(this.localized('popover.deleting_note', 'Deleting…'));
        try {
            const success = await this.mutationService.deleteNote(wordDef);
            if (!success) {
                status.setText(t('sidebar.note_delete_failed'));
                return;
            }
            new Notice(t('sidebar.note_deleted'));
            onBack();
        } catch (error) {
            console.error('HiWords failed to delete note:', error);
            status.setText(t('sidebar.note_delete_failed'));
        } finally {
            this.setNoteFormBusy(buttons, false);
        }
    }

    private setNoteFormBusy(container: HTMLElement, busy: boolean): void {
        container.querySelectorAll('button').forEach(button => {
            (button as HTMLButtonElement).disabled = busy;
        });
    }

    private async renderVaultContexts(
        contentEl: HTMLElement,
        wordDef: WordDefinition,
        word: string,
        sourcePath: string,
        onBack: () => void,
        onClose: () => void
    ): Promise<void> {
        this.prepareSubview(contentEl);
        const queryId = ++this.contextQueryId;
        this.renderSubviewHeader(contentEl, this.localized('popover.context_title', 'Vault context'), onBack);
        const loading = contentEl.createDiv({ cls: 'hi-words-tooltip-loading' });
        const loadingIcon = loading.createSpan({ cls: 'hi-words-tooltip-loading-icon' });
        setIcon(loadingIcon, 'loader-circle');
        loading.createSpan({ text: this.localized('popover.searching_context', 'Searching your notes…') });
        const summary = contentEl.createDiv({
            cls: 'hi-words-tooltip-context-summary',
            attr: { 'aria-live': 'polite' },
        });
        summary.style.display = 'none';
        const list = contentEl.createDiv({ cls: 'hi-words-tooltip-context-list' });
        const controls = contentEl.createDiv({ cls: 'hi-words-tooltip-context-controls' });
        const loadMore = controls.createEl('button', {
            cls: 'hi-words-tooltip-context-more',
            attr: { type: 'button' },
        });
        controls.style.display = 'none';

        const groups = new Map<string, { element: HTMLElement; count: number; countEl: HTMLElement }>();
        const displayedFiles = new Set<string>();
        let displayedContexts = 0;
        let searchWholeVault = false;
        let nextAction: 'load' | 'search-vault' | null = null;
        let empty: HTMLElement | null = null;

        const updateSummary = () => {
            if (displayedContexts === 0) {
                summary.style.display = 'none';
                return;
            }
            summary.style.display = '';
            summary.setText(this.localized('popover.context_found', '{0} contexts from {1} notes')
                .replace('{0}', String(displayedContexts))
                .replace('{1}', String(displayedFiles.size)));
        };

        const appendContexts = (contexts: VaultWordContext[]) => {
            empty?.remove();
            empty = null;
            for (const context of contexts) {
                let group = groups.get(context.file.path);
                if (!group) {
                    const groupEl = list.createDiv({ cls: 'hi-words-tooltip-context-group' });
                    const header = groupEl.createDiv({ cls: 'hi-words-tooltip-context-group-header' });
                    const fileIcon = header.createSpan({ cls: 'hi-words-tooltip-context-file-icon' });
                    setIcon(fileIcon, 'file-text');
                    header.createSpan({ text: context.file.basename, cls: 'hi-words-tooltip-context-file' });
                    const countEl = header.createSpan({ cls: 'hi-words-tooltip-context-group-count' });
                    group = { element: groupEl, count: 0, countEl };
                    groups.set(context.file.path, group);
                    displayedFiles.add(context.file.path);
                }

                group.count += 1;
                group.countEl.setText(group.count === 1
                    ? this.localized('popover.context_count_one', '1 context')
                    : this.localized('popover.context_count', '{0} contexts').replace('{0}', String(group.count)));
                this.renderContextItem(group.element, context, wordDef, word, onClose);
                displayedContexts += 1;
            }
            updateSummary();
        };

        const loadPage = async (reset = false) => {
            empty?.remove();
            empty = null;
            controls.style.display = '';
            loadMore.disabled = true;
            loadMore.setText(this.localized('popover.loading_more_context', 'Loading…'));

            const page = await this.contextService.findPage(word, {
                pageSize: 20,
                searchWholeVault,
                reset,
                sourcePath,
                isCancelled: () => queryId !== this.contextQueryId || !contentEl.isConnected,
            });
            if (queryId !== this.contextQueryId || !contentEl.isConnected) return;

            loading.remove();
            appendContexts(page.results);

            if (page.hasMore) {
                nextAction = 'load';
                controls.style.display = '';
                loadMore.disabled = false;
                loadMore.setText(this.localized('popover.load_more_context', 'Load more'));
                return;
            }

            if (page.canSearchWholeVault && !searchWholeVault) {
                nextAction = 'search-vault';
                controls.style.display = '';
                loadMore.disabled = false;
                loadMore.setText(this.localized('popover.search_whole_vault', 'Search entire vault'));
                if (displayedContexts === 0) {
                    empty = this.renderEmpty(contentEl, this.localized(
                        'popover.no_quick_context',
                        'No contexts were found in related or recent notes.'
                    ));
                    contentEl.insertBefore(empty, controls);
                }
                return;
            }

            nextAction = null;
            controls.style.display = 'none';
            if (displayedContexts === 0) {
                empty = this.renderEmpty(contentEl, this.localized(
                    'popover.no_context',
                    'This word was not found in your Markdown notes.'
                ));
            }
        };

        loadMore.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (nextAction === 'search-vault') {
                searchWholeVault = true;
            }
            void loadPage();
        });

        await loadPage(true);
    }

    private renderContextItem(container: HTMLElement, context: VaultWordContext, wordDef: WordDefinition, word: string, onClose: () => void): void {
        const item = container.createDiv({ cls: 'hi-words-tooltip-context-item hi-words-tooltip-saveable-item' });
        const open = item.createEl('button', { cls: 'hi-words-tooltip-context-open', attr: { type: 'button' } });
        this.renderHighlightedSentence(open, context.sentence, word);
        open.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            void this.contextService.open(context).catch(error => console.error('HiWords failed to open word context:', error));
        });
        if (this.mutationService.canSaveSentences(wordDef)) {
            const save = this.createSentenceToggle(item, this.mutationService.isSentenceSaved(wordDef, context.sentence));
            save.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                save.disabled = true;
                void this.mutationService.toggleSentence(wordDef, {
                    text: context.sentence,
                    source: context.file.path,
                }).then(result => {
                    if (!result.success) {
                        new Notice(this.localized('popover.sentence_save_failed', 'Could not update this vocabulary.'));
                        save.disabled = false;
                        return;
                    }
                    this.updateSentenceToggle(save, result.saved);
                }).catch(error => {
                    console.error('HiWords failed to update saved sentence:', error);
                    new Notice(this.localized('popover.sentence_save_failed', 'Could not update this vocabulary.'));
                    save.disabled = false;
                });
            });
        }
    }

    private createSentenceToggle(container: HTMLElement, saved: boolean): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: `clickable-icon hi-words-tooltip-sentence-toggle${saved ? ' is-saved' : ''}`,
            attr: {
                type: 'button',
                'aria-label': saved ? 'Remove saved sentence' : 'Save sentence',
                'aria-pressed': String(saved),
            },
        });
        setIcon(button, saved ? 'bookmark-check' : 'bookmark');
        return button;
    }

    private updateSentenceToggle(button: HTMLButtonElement, saved: boolean): void {
        button.empty();
        button.disabled = false;
        button.toggleClass('is-saved', saved);
        button.setAttribute('aria-label', saved ? 'Remove saved sentence' : 'Save sentence');
        button.setAttribute('aria-pressed', String(saved));
        setIcon(button, saved ? 'bookmark-check' : 'bookmark');
    }

    private renderSubviewHeader(contentEl: HTMLElement, title: string, onBack?: () => void): void {
        const header = contentEl.createDiv({ cls: 'hi-words-tooltip-subview-header' });
        header.createDiv({ text: title, cls: 'hi-words-tooltip-subview-title' });
        if (!onBack) return;

        const back = header.createEl('button', {
            cls: 'clickable-icon hi-words-tooltip-subview-back',
            attr: { type: 'button' },
        });
        setIcon(back, 'undo-2');
        back.createSpan({
            text: this.localized('popover.back', 'Back'),
            cls: 'hi-words-visually-hidden',
        });
        back.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onBack();
        });
    }

    private renderHighlightedSentence(container: HTMLElement, sentence: string, word: string): void {
        const body = container.createDiv({ cls: 'hi-words-tooltip-context-sentence' });
        const normalizedSentence = sentence.toLocaleLowerCase();
        const normalizedWord = word.toLocaleLowerCase();
        let cursor = 0;
        let match = normalizedSentence.indexOf(normalizedWord);

        while (match !== -1) {
            if (match > cursor) body.appendText(sentence.slice(cursor, match));
            body.createEl('mark', { text: sentence.slice(match, match + word.length) });
            cursor = match + word.length;
            match = normalizedSentence.indexOf(normalizedWord, cursor);
        }
        if (cursor < sentence.length) body.appendText(sentence.slice(cursor));
    }

    private prepareSubview(contentEl: HTMLElement): void {
        contentEl.empty();
        contentEl.removeClass('blur-enabled');
        contentEl.addClass('hi-words-tooltip-subview');
        contentEl.closest<HTMLElement>('.hi-words-tooltip')?.addClass('is-subview');
    }

    private renderEmpty(contentEl: HTMLElement, text: string): HTMLElement {
        return contentEl.createDiv({ cls: 'hi-words-tooltip-empty', text });
    }

    private localized(key: string, fallback: string): string {
        const translated = t(key);
        return translated === key ? fallback : translated;
    }
}

export function getPopoverTargetSentence(target: HTMLElement, word: string): string {
    const container = target.closest<HTMLElement>('p, li, blockquote, td, th, .cm-line');
    if (!container) return '';

    const text = container.textContent || '';
    try {
        const range = activeDocument.createRange();
        range.selectNodeContents(container);
        range.setEndBefore(target);
        const offset = range.toString().length;
        return extractSentence(text, Math.min(offset + Math.floor(word.length / 2), text.length));
    } catch {
        const offset = text.toLocaleLowerCase().indexOf(word.toLocaleLowerCase());
        return offset >= 0 ? extractSentence(text, offset + Math.floor(word.length / 2)) : '';
    }
}

function normalizeSentence(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
