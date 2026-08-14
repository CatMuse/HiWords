import { Modal, normalizePath, Notice, setIcon, TextFileView, TFile, WorkspaceLeaf } from 'obsidian';
import type HiWordsPlugin from '../../main';
import {
    createEmptyHiWordsCard,
    createEmptyHiWordsPack,
    HiWordsEditorDocument,
    parseHiWordsEditorDocument,
    serializeHiWordsPack,
    validateHiWordsPack,
} from '../editor/hiwords-document';
import type { HiWordsCard, HiWordsPack } from '../schema/hiwords';
import {
    HiWordsGenerationService,
    mergeGeneratedContent,
} from '../services/hiwords-generation-service';
import type { WordCardDetailSection, WordDefinition } from '../utils';
import {
    HIWORDS_EDITOR_MODULES,
    renderAddCustomContentControl,
    renderHiWordsCardEditor,
} from './hiwords-card-editor';
import type { HiWordsEditorModule } from './hiwords-card-editor';
import { renderWordCard } from './word-card-renderer';

export const HIWORDS_FILE_VIEW_TYPE = 'hi-words-file-editor';
const CARD_LIST_RENDER_LIMIT = 400;
const DEFAULT_EDITOR_SIDEBAR_WIDTH = 260;
const DEFAULT_EDITOR_PREVIEW_WIDTH = 320;
const MIN_EDITOR_SIDEBAR_WIDTH = 200;
const MAX_EDITOR_SIDEBAR_WIDTH = 360;
const MIN_EDITOR_PREVIEW_WIDTH = 280;
const MAX_EDITOR_PREVIEW_WIDTH = 520;
const MIN_EDITOR_CONTENT_WIDTH = 520;

type EditorResizeTarget = 'sidebar' | 'preview';

interface HiWordsAIDraft {
    cardId: string;
    card: HiWordsCard;
}

export class HiWordsFileView extends TextFileView {
    private plugin: HiWordsPlugin;
    private document: HiWordsEditorDocument = { kind: 'invalid', message: 'No file loaded.', original: '' };
    private selectedCardId: string | null = null;
    private query = '';
    private documentDirty = false;
    private refreshTimer: number | null = null;
    private validationEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;
    private inspectorEl: HTMLElement | null = null;
    private selectedModule: HiWordsEditorModule = 'word';
    private previewOpen = true;
    private activeColumnResizeCleanup: (() => void) | null = null;
    private aiDraft: HiWordsAIDraft | null = null;
    private aiGeneratingCardId: string | null = null;
    private aiRequestId = 0;

    constructor(leaf: WorkspaceLeaf, plugin: HiWordsPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.navigation = true;
        this.contentEl.addClass('hi-words-file-view');
    }

    getViewType(): string {
        return HIWORDS_FILE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.file?.basename || 'HiWords editor';
    }

    getIcon(): string {
        return 'file-pen';
    }

    focusCard(cardId: string): void {
        if (this.document.kind !== 'hiwords' || !this.document.pack.cards.some(card => card.id === cardId)) return;
        if (this.aiDraft && this.aiDraft.cardId !== cardId) this.discardAIDraft();
        this.selectedCardId = cardId;
        this.selectedModule = 'word';
        this.renderCardList();
        this.renderSelectedCard();
    }

    async mutateHiWordsCard(
        cardId: string,
        mutation: (card: HiWordsCard, pack: HiWordsPack) => void
    ): Promise<HiWordsCard | null> {
        if (this.document.kind !== 'hiwords') return null;
        const card = this.document.pack.cards.find(item => item.id === cardId);
        if (!card) return null;

        mutation(card, this.document.pack);
        this.markChanged(card);
        this.renderCardList();
        if (this.selectedCardId === card.id) this.renderCardInspector(this.getEditableCard(card));
        this.renderCardPreview(card);
        this.renderValidation();
        await this.save();
        if (this.refreshTimer !== null) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        await this.refreshVocabularyAfterSave();
        return card;
    }

    getViewData(): string {
        if (this.document.kind !== 'hiwords') return this.document.original;
        if (!this.documentDirty) return this.document.original;
        const serialized = serializeHiWordsPack(this.document.pack);
        this.document.original = serialized;
        this.documentDirty = false;
        return serialized;
    }

    setViewData(data: string, clear: boolean): void {
        const previousSelection = clear ? null : this.selectedCardId;
        this.discardAIDraft();
        this.data = data;
        this.document = parseHiWordsEditorDocument(data);
        this.documentDirty = false;
        if (this.document.kind === 'hiwords') {
            const selectedStillExists = previousSelection && this.document.pack.cards.some(card => card.id === previousSelection);
            this.selectedCardId = selectedStillExists ? previousSelection : this.document.pack.cards[0]?.id || null;
        } else {
            this.selectedCardId = null;
        }
        this.render();
    }

    clear(): void {
        this.activeColumnResizeCleanup?.();
        this.activeColumnResizeCleanup = null;
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        this.contentEl.empty();
        this.selectedCardId = null;
        this.validationEl = null;
        this.listEl = null;
        this.previewEl = null;
        this.inspectorEl = null;
        this.aiDraft = null;
        this.aiGeneratingCardId = null;
        this.aiRequestId++;
    }

    private render(): void {
        this.activeColumnResizeCleanup?.();
        this.activeColumnResizeCleanup = null;
        this.contentEl.empty();
        if (this.document.kind === 'invalid') {
            this.renderInvalidState();
            return;
        }

        this.validationEl = this.contentEl.createDiv({ cls: 'hi-words-file-validation' });
        this.renderValidation();

        const body = this.contentEl.createDiv({ cls: 'hi-words-file-editor-layout' });
        body.toggleClass('is-preview-closed', !this.previewOpen);
        this.applyEditorColumnWidths(body);
        const sidebar = body.createEl('aside', { cls: 'hi-words-file-editor-sidebar' });
        const sidebarControls = sidebar.createDiv({ cls: 'hi-words-file-sidebar-controls' });
        const sidebarHeader = sidebarControls.createDiv({ cls: 'hi-words-file-sidebar-header' });
        const sidebarTitle = sidebarHeader.createDiv({ cls: 'hi-words-file-sidebar-title' });
        const wordListLabelId = `hi-words-file-list-${window.crypto.randomUUID()}`;
        sidebarTitle.createEl('strong', { text: 'HIWORDS', attr: { id: wordListLabelId } });
        const addButton = this.createHeaderAction(sidebarHeader, 'plus', 'Add word');
        addButton.onclick = () => this.addCard();
        const searchRow = sidebar.createDiv({ cls: 'hi-words-file-search-row' });
        const search = searchRow.createEl('input', {
            type: 'search',
            cls: 'hi-words-file-search',
            placeholder: 'Search words…',
            value: this.query,
        });
        search.oninput = () => {
            this.query = search.value;
            this.renderCardList();
        };
        this.listEl = sidebar.createDiv({
            cls: 'hi-words-file-card-list',
            attr: { role: 'listbox', 'aria-labelledby': wordListLabelId },
        });
        this.createColumnResizer(body, 'sidebar');
        this.inspectorEl = body.createEl('main', { cls: 'hi-words-file-inspector-pane' });
        this.createColumnResizer(body, 'preview');
        this.previewEl = body.createEl('aside', { cls: 'hi-words-file-preview-pane' });
        this.renderCardList();
        this.renderSelectedCard();
    }

    private applyEditorColumnWidths(layout: HTMLElement): void {
        const sidebarWidth = this.clampColumnWidth(
            this.plugin.settings.hiWordsEditorSidebarWidth,
            MIN_EDITOR_SIDEBAR_WIDTH,
            MAX_EDITOR_SIDEBAR_WIDTH,
            DEFAULT_EDITOR_SIDEBAR_WIDTH,
        );
        const previewWidth = this.clampColumnWidth(
            this.plugin.settings.hiWordsEditorPreviewWidth,
            MIN_EDITOR_PREVIEW_WIDTH,
            MAX_EDITOR_PREVIEW_WIDTH,
            DEFAULT_EDITOR_PREVIEW_WIDTH,
        );
        layout.style.setProperty('--hi-words-editor-sidebar-width', `${sidebarWidth}px`);
        layout.style.setProperty('--hi-words-editor-preview-width', `${previewWidth}px`);
    }

    private createColumnResizer(layout: HTMLElement, target: EditorResizeTarget): void {
        const isSidebar = target === 'sidebar';
        const label = isSidebar ? 'Resize word list' : 'Resize preview';
        const min = isSidebar ? MIN_EDITOR_SIDEBAR_WIDTH : MIN_EDITOR_PREVIEW_WIDTH;
        const max = isSidebar ? MAX_EDITOR_SIDEBAR_WIDTH : MAX_EDITOR_PREVIEW_WIDTH;
        const defaultWidth = isSidebar ? DEFAULT_EDITOR_SIDEBAR_WIDTH : DEFAULT_EDITOR_PREVIEW_WIDTH;
        const settingKey = isSidebar ? 'hiWordsEditorSidebarWidth' : 'hiWordsEditorPreviewWidth';
        const resizer = layout.createDiv({
            cls: `hi-words-file-column-resizer is-${target}`,
            attr: {
                role: 'separator',
                tabindex: '0',
                'aria-label': label,
                'aria-orientation': 'vertical',
                'aria-valuemin': String(min),
                'aria-valuemax': String(max),
            },
        });

        const readWidth = (): number => this.clampColumnWidth(
            this.plugin.settings[settingKey],
            min,
            max,
            defaultWidth,
        );
        const renderWidth = (width: number): void => {
            const bounded = this.getBoundedColumnWidth(layout, target, width);
            layout.style.setProperty(
                isSidebar ? '--hi-words-editor-sidebar-width' : '--hi-words-editor-preview-width',
                `${bounded}px`,
            );
            resizer.setAttribute('aria-valuenow', String(Math.round(bounded)));
        };
        const persistWidth = async (width: number): Promise<void> => {
            const bounded = this.getBoundedColumnWidth(layout, target, width);
            this.plugin.settings[settingKey] = Math.round(bounded);
            renderWidth(bounded);
            await this.plugin.saveSettings();
        };

        renderWidth(readWidth());

        resizer.onpointerdown = event => {
            if (event.button !== 0) return;
            event.preventDefault();
            this.activeColumnResizeCleanup?.();
            const startX = event.clientX;
            const startWidth = readWidth();
            let currentWidth = startWidth;
            let active = true;
            resizer.setPointerCapture(event.pointerId);
            resizer.addClass('is-dragging');
            document.body.addClass('hi-words-is-resizing-columns');

            resizer.onpointermove = moveEvent => {
                if (!active || moveEvent.pointerId !== event.pointerId) return;
                const delta = moveEvent.clientX - startX;
                currentWidth = startWidth + (isSidebar ? delta : -delta);
                renderWidth(currentWidth);
            };

            const finish = (): void => {
                if (!active) return;
                active = false;
                resizer.onpointermove = null;
                resizer.onpointerup = null;
                resizer.onpointercancel = null;
                resizer.removeClass('is-dragging');
                document.body.removeClass('hi-words-is-resizing-columns');
                this.activeColumnResizeCleanup = null;
                void persistWidth(currentWidth);
            };
            this.activeColumnResizeCleanup = () => {
                if (!active) return;
                active = false;
                resizer.onpointermove = null;
                resizer.onpointerup = null;
                resizer.onpointercancel = null;
                resizer.removeClass('is-dragging');
                document.body.removeClass('hi-words-is-resizing-columns');
            };
            resizer.onpointerup = finish;
            resizer.onpointercancel = finish;
        };

        resizer.ondblclick = event => {
            event.preventDefault();
            void persistWidth(defaultWidth);
        };

        resizer.onkeydown = event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = event.shiftKey ? 20 : 10;
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextWidth = readWidth() + direction * step * (isSidebar ? 1 : -1);
            void persistWidth(nextWidth);
        };
    }

    private getBoundedColumnWidth(layout: HTMLElement, target: EditorResizeTarget, width: number): number {
        const min = target === 'sidebar' ? MIN_EDITOR_SIDEBAR_WIDTH : MIN_EDITOR_PREVIEW_WIDTH;
        const max = target === 'sidebar' ? MAX_EDITOR_SIDEBAR_WIDTH : MAX_EDITOR_PREVIEW_WIDTH;
        const otherWidth = target === 'sidebar'
            ? this.clampColumnWidth(this.plugin.settings.hiWordsEditorPreviewWidth, MIN_EDITOR_PREVIEW_WIDTH, MAX_EDITOR_PREVIEW_WIDTH, DEFAULT_EDITOR_PREVIEW_WIDTH)
            : this.clampColumnWidth(this.plugin.settings.hiWordsEditorSidebarWidth, MIN_EDITOR_SIDEBAR_WIDTH, MAX_EDITOR_SIDEBAR_WIDTH, DEFAULT_EDITOR_SIDEBAR_WIDTH);
        const availableMax = layout.clientWidth - otherWidth - MIN_EDITOR_CONTENT_WIDTH;
        return Math.min(Math.max(width, min), Math.max(min, Math.min(max, availableMax)));
    }

    private clampColumnWidth(value: number | undefined, min: number, max: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, value as number));
    }

    private renderInvalidState(): void {
        if (this.document.kind !== 'invalid') return;
        const state = this.contentEl.createDiv({ cls: 'hi-words-file-state hi-words-file-state-error' });
        setIcon(state.createDiv({ cls: 'hi-words-file-state-icon' }), 'file-warning');
        state.createEl('h2', { text: 'Unable to open this vocabulary' });
        state.createEl('p', { text: this.document.message });
        state.createEl('p', { text: 'The original file has not been changed.' });
    }

    private renderCardList(): void {
        if (!this.listEl || this.document.kind !== 'hiwords') return;
        this.listEl.empty();
        const query = this.query.trim().toLowerCase();
        const cards = this.document.pack.cards.filter(card => {
            if (!query) return true;
            return card.word.toLowerCase().includes(query) || (card.aliases || []).some(alias => alias.toLowerCase().includes(query));
        });
        if (!cards.length) {
            this.listEl.createDiv({ cls: 'hi-words-file-empty-list', text: 'No matching words.' });
            return;
        }
        for (const card of cards.slice(0, CARD_LIST_RENDER_LIMIT)) {
            const button = this.listEl.createDiv({
                cls: `hi-words-file-card-list-item${card.id === this.selectedCardId ? ' is-active' : ''}`,
                attr: {
                    role: 'option',
                    tabindex: card.id === this.selectedCardId ? '0' : '-1',
                    'aria-selected': String(card.id === this.selectedCardId),
                },
            });
            button.createEl('strong', { text: card.word || 'New word' });
            const meaning = card.meanings[0]?.translation || card.meanings[0]?.definition || 'Draft';
            button.createSpan({ text: meaning });
            const remove = this.createHeaderAction(button, 'trash-2', `Delete ${card.word || 'new word'}`);
            remove.addClass('hi-words-file-card-list-delete');
            remove.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                new DeleteCardModal(this.plugin, card.word || 'New word', () => this.deleteCard(card)).open();
            };
            const selectCard = () => {
                if (this.selectedCardId === card.id) return;
                const finishSelection = () => {
                    this.selectedCardId = card.id;
                    this.selectedModule = 'word';
                    this.renderCardList();
                    this.renderSelectedCard();
                };
                if (this.aiDraft) {
                    new LeaveAIDraftModal(
                        this.plugin,
                        () => {
                            const storedCard = this.getStoredCard(this.aiDraft?.cardId || '');
                            if (storedCard) this.applyAIDraft(storedCard);
                            finishSelection();
                        },
                        () => {
                            this.discardAIDraft();
                            finishSelection();
                        },
                    ).open();
                    return;
                }
                finishSelection();
            };
            button.onclick = selectCard;
            button.onkeydown = event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectCard();
            };
        }
        if (cards.length > CARD_LIST_RENDER_LIMIT) {
            this.listEl.createDiv({
                cls: 'hi-words-file-list-limit',
                text: `Showing the first ${CARD_LIST_RENDER_LIMIT.toLocaleString()} of ${cards.length.toLocaleString()} words. Search to narrow the list.`,
            });
        }
    }

    private renderSelectedCard(): void {
        if (!this.previewEl || !this.inspectorEl || this.document.kind !== 'hiwords') return;
        const card = this.document.pack.cards.find(item => item.id === this.selectedCardId);
        if (!card) {
            this.inspectorEl.empty();
            this.previewEl.empty();
            const empty = this.inspectorEl.createDiv({ cls: 'hi-words-file-editor-empty' });
            empty.createEl('h2', { text: 'Start your vocabulary' });
            empty.createEl('p', { text: 'Add a word to begin editing structured content.' });
            const add = empty.createEl('button', { text: 'Add word', cls: 'mod-cta' });
            add.onclick = () => this.addCard();
            return;
        }

        this.renderCardInspector(this.getEditableCard(card));
        this.renderCardPreview(card);
    }

    private renderCardPreview(card: HiWordsCard): void {
        if (!this.previewEl || this.document.kind !== 'hiwords') return;
        this.previewEl.empty();

        const hasAIDraft = this.aiDraft?.cardId === card.id;
        const previewCard = hasAIDraft && this.aiDraft ? this.aiDraft.card : card;

        const previewHeader = this.previewEl.createDiv({ cls: 'hi-words-file-preview-panel-header' });
        const previewTitle = previewHeader.createDiv({ cls: 'hi-words-file-preview-title' });
        previewTitle.createEl('strong', { text: hasAIDraft ? 'AI preview' : 'Preview' });
        if (hasAIDraft) previewTitle.createSpan({ text: 'Draft' });
        const previewActions = previewHeader.createDiv({ cls: 'hi-words-file-preview-actions' });
        const close = this.createHeaderAction(previewActions, 'x', 'Close preview');
        close.onclick = () => this.setPreviewOpen(false);
        const previewScroll = this.previewEl.createDiv({ cls: 'hi-words-file-preview-scroll' });
        const wordDefinition: WordDefinition = {
            word: previewCard.word || 'New word',
            type: previewCard.type,
            language: previewCard.language || this.document.pack.language,
            aliases: previewCard.aliases,
            definition: previewCard.meanings[0]?.translation || previewCard.meanings[0]?.definition || '',
            source: this.file?.path || '',
            nodeId: previewCard.id,
            card: previewCard,
            userNote: previewCard.note?.text,
        };
        const sidebar = previewScroll.createDiv({ cls: 'hi-words-sidebar hi-words-file-live-sidebar' });
        const wordList = sidebar.createDiv({ cls: 'hi-words-word-list' });
        const wordCard = wordList.createDiv({ cls: 'hi-words-word-card is-expanded' });
        const title = wordCard.createDiv({ cls: 'hi-words-word-title' });
        title.createSpan({ text: wordDefinition.word, cls: 'hi-words-word-text' });
        const phoneticTarget = title.createSpan({ cls: 'hi-words-word-title-phonetic-slot' });
        title.createDiv({ cls: 'hi-words-card-toggle-spacer' });
        const definition = wordCard.createDiv({ cls: 'hi-words-word-definition hi-words-word-definition-structured' });
        const rendered = definition.createDiv({
            cls: this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition',
        });
        renderWordCard(rendered, wordDefinition, {
            mode: 'sidebar',
            app: this.app,
            pronunciationVariant: this.plugin.settings.pronunciationVariant || 'us',
            pronunciationTarget: phoneticTarget,
            display: {
                previewSections: [],
                detailSections: this.getEditorPreviewSections(),
                hiddenSections: [],
            },
        });
    }

    private renderCardInspector(card: HiWordsCard): void {
        if (!this.inspectorEl || this.document.kind !== 'hiwords') return;
        const editingAIDraft = this.aiDraft?.cardId === card.id && this.aiDraft.card === card;
        this.inspectorEl.empty();
        this.inspectorEl.toggleClass('is-ai-draft', editingAIDraft);
        const header = this.inspectorEl.createDiv({ cls: 'hi-words-file-editor-header' });
        const identity = header.createDiv({ cls: 'hi-words-file-editor-identity' });
        identity.createEl('h1', { text: card.word || 'New word' });
        if (card.phonetics?.us) identity.createSpan({ text: `US /${card.phonetics.us}/` });
        if (card.phonetics?.uk) identity.createSpan({ text: `UK /${card.phonetics.uk}/` });
        const actions = header.createDiv({ cls: 'hi-words-file-editor-actions' });
        this.renderEditorActions(actions, card);

        const editorScroll = this.inspectorEl.createDiv({ cls: 'hi-words-file-editor-scroll' });
        const workspace = editorScroll.createDiv({ cls: 'hi-words-file-editor-workspace' });
        const outline = workspace.createEl('nav', { cls: 'hi-words-file-editor-outline', attr: { 'aria-label': 'Word sections' } });
        outline.createDiv({ cls: 'hi-words-file-editor-outline-title', text: 'Sections' });
        const editor = workspace.createDiv({ cls: 'hi-words-file-editor-content' });
        const updateDraftIndicators = () => {
            outline.querySelectorAll<HTMLElement>('.hi-words-file-editor-outline-item').forEach(item => {
                const module = item.dataset.module as HiWordsEditorModule | undefined;
                item.toggleClass('is-incomplete', !!module && this.isRequiredModuleIncomplete(card, module));
            });
        };
        const callbacks = {
            onChange: () => {
                if (!editingAIDraft) this.markChanged(card);
                updateDraftIndicators();
                this.renderCardPreview(card);
                if (!editingAIDraft) this.renderValidation();
            },
            onWordChange: () => {
                identity.querySelector('h1')?.setText(card.word || 'New word');
                updateDraftIndicators();
                if (!editingAIDraft) {
                    this.markChanged(card);
                    this.renderCardList();
                }
                this.renderCardPreview(card);
                if (!editingAIDraft) this.renderValidation();
            },
            onStructureChange: () => {
                const scrollTop = editorScroll.scrollTop;
                if (!editingAIDraft) {
                    this.markChanged(card);
                    this.renderCardList();
                }
                this.renderCardPreview(card);
                this.renderCardInspector(card);
                const nextScroll = this.inspectorEl?.querySelector<HTMLElement>('.hi-words-file-editor-scroll');
                if (nextScroll) nextScroll.scrollTop = scrollTop;
                if (!editingAIDraft) this.renderValidation();
            },
            onDelete: () => new DeleteCardModal(this.plugin, card.word, () => this.deleteCard(card)).open(),
        };
        const moduleOrder = this.getEditorModuleOrder().filter(module => module !== 'custom' || this.hasCustomContent(card));
        for (const module of moduleOrder) {
            const meta = HIWORDS_EDITOR_MODULES.find(item => item.id === module);
            if (!meta) continue;
            const outlineItem = outline.createDiv({
                cls: `hi-words-file-editor-outline-item${module === this.selectedModule ? ' is-active' : ''}${this.isRequiredModuleIncomplete(card, module) ? ' is-incomplete' : ''}`,
                attr: { role: 'button', tabindex: '0', draggable: 'true', 'data-module': module },
            });
            setIcon(outlineItem.createSpan({ cls: 'hi-words-file-editor-outline-grip' }), 'grip-vertical');
            outlineItem.createSpan({
                cls: 'hi-words-file-editor-outline-label',
                text: module === 'word' ? 'Basic' : meta.title,
            });
            const section = editor.createDiv({
                cls: `hi-words-file-editor-module${this.isEditorModuleEmpty(card, module) ? ' is-empty' : ''}`,
                attr: { 'data-module': module },
            });
            renderHiWordsCardEditor(section, this.document.pack, card, callbacks, module);
            if (module === 'custom') {
                section.querySelectorAll<HTMLElement>('.hi-words-file-collection-item[data-custom-section-id]').forEach((customRow, index) => {
                    const customSection = card.customSections?.[index];
                    if (!customSection) return;
                    const child = outline.createDiv({
                        cls: 'hi-words-file-editor-outline-item hi-words-file-editor-outline-custom',
                        attr: { role: 'button', tabindex: '0' },
                    });
                    const label = child.createSpan({
                        cls: 'hi-words-file-editor-outline-label',
                        text: customSection.title.trim() || 'Untitled section',
                    });
                    const titleInput = customRow.querySelector<HTMLInputElement>('input');
                    titleInput?.addEventListener('input', () => label.setText(titleInput.value.trim() || 'Untitled section'));
                    const navigateCustom = () => customRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    child.onclick = navigateCustom;
                    child.onkeydown = event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        navigateCustom();
                    };
                });
            }
            const navigate = () => {
                this.selectedModule = module;
                this.updateOutlineActive(outline, module);
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            outlineItem.onclick = navigate;
            outlineItem.onkeydown = event => {
                if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault();
                    this.moveEditorModule(module, event.key === 'ArrowUp' ? -1 : 1, card);
                    return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                navigate();
            };
            outlineItem.ondragstart = event => {
                event.dataTransfer?.setData('text/hiwords-module', module);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                outlineItem.addClass('is-dragging');
            };
            outlineItem.ondragend = () => {
                outlineItem.removeClass('is-dragging');
                outline.querySelectorAll('.is-drop-target').forEach(item => item.removeClass('is-drop-target'));
            };
            outlineItem.ondragover = event => {
                event.preventDefault();
                outlineItem.addClass('is-drop-target');
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            };
            outlineItem.ondragleave = () => outlineItem.removeClass('is-drop-target');
            outlineItem.ondrop = event => {
                event.preventDefault();
                outlineItem.removeClass('is-drop-target');
                const source = event.dataTransfer?.getData('text/hiwords-module') as HiWordsEditorModule;
                if (source && source !== module) this.reorderEditorModules(source, module, card);
            };
        }
        renderAddCustomContentControl(editor, card, callbacks);
        editorScroll.onscroll = () => this.syncOutlineWithScroll(outline, editor, editorScroll);
    }

    private renderEditorActions(container: HTMLElement, card: HiWordsCard): void {
        container.empty();
        const hasAIDraft = this.aiDraft?.cardId === card.id;
        const aiGroup = container.createDiv({ cls: `hi-words-file-ai-actions${hasAIDraft ? ' has-draft' : ''}` });
        const aiButton = this.createHeaderAction(
            aiGroup,
            this.aiGeneratingCardId === card.id ? 'loader-circle' : 'sparkles',
            hasAIDraft ? 'Show AI preview' : 'Generate with AI',
        );
        aiButton.addClass('hi-words-file-ai-action');
        aiButton.toggleClass('is-loading', this.aiGeneratingCardId === card.id);
        aiButton.toggleClass('is-active', hasAIDraft);
        aiButton.disabled = this.aiGeneratingCardId !== null;
        aiButton.onclick = () => {
            if (hasAIDraft) {
                this.setPreviewOpen(true);
                return;
            }
            void this.generateAIDraft(card);
        };

        if (hasAIDraft) {
            const apply = this.createHeaderAction(aiGroup, 'check', 'Apply AI draft');
            apply.addClass('is-confirm');
            apply.onclick = () => this.applyAIDraft(card);

            const discard = this.createHeaderAction(aiGroup, 'x', 'Discard AI draft');
            discard.addClass('hi-words-file-ai-discard');
            discard.onclick = () => {
                const storedCard = this.getStoredCard(card.id);
                this.discardAIDraft();
                if (!storedCard) return;
                this.renderCardInspector(storedCard);
                this.renderCardPreview(storedCard);
            };
        }

        const previewButton = this.createHeaderAction(container, 'eye', 'Preview');
        previewButton.addClass('hi-words-file-preview-action');
        previewButton.toggleClass('is-active', this.previewOpen);
        previewButton.setAttribute('aria-pressed', String(this.previewOpen));
        previewButton.onclick = () => this.setPreviewOpen(!this.previewOpen);
    }

    private refreshEditorActions(card: HiWordsCard): void {
        if (this.selectedCardId !== card.id) return;
        const actions = this.inspectorEl?.querySelector<HTMLElement>('.hi-words-file-editor-actions');
        if (actions) this.renderEditorActions(actions, card);
    }

    private getEditorModuleItemCount(card: HiWordsCard, module: HiWordsEditorModule): number {
        switch (module) {
            case 'meanings': return card.meanings.length;
            case 'sentences': return card.sentences?.length || 0;
            case 'forms': return card.forms?.length || 0;
            case 'derivedWords': return card.derivedWords?.length || 0;
            case 'phrases': return card.phrases?.length || 0;
            case 'relations': return card.relations?.length || 0;
            case 'memory': return card.memory?.length || 0;
            case 'note': return card.note?.text.trim() ? 1 : 0;
            case 'images': return card.images?.length || 0;
            case 'custom': return card.customSections?.length || 0;
            default: return 0;
        }
    }

    private isEditorModuleEmpty(card: HiWordsCard, module: HiWordsEditorModule): boolean {
        if (module === 'word' || module === 'meanings') return false;
        if (module === 'morphology') {
            return !card.morphology?.explanation && !(card.morphology?.components?.length);
        }
        if (module === 'usage') {
            const usage = card.usage;
            return !usage || ![
                ...(usage.register || []),
                ...(usage.patterns || []),
                ...(usage.notes || []),
                ...(usage.commonMistakes || []),
            ].some(Boolean);
        }
        return this.getEditorModuleItemCount(card, module) === 0;
    }

    private isRequiredModuleIncomplete(card: HiWordsCard, module: HiWordsEditorModule): boolean {
        if (module === 'word') return !card.word.trim();
        if (module === 'meanings') {
            return !card.meanings.some(meaning =>
                !!meaning.partOfSpeech.trim() && !!meaning.translation.trim() && !!meaning.definition.trim()
            );
        }
        return false;
    }

    private hasCustomContent(card: HiWordsCard): boolean {
        return Boolean(card.customSections?.length);
    }

    private setPreviewOpen(open: boolean): void {
        this.previewOpen = open;
        const layout = this.contentEl.querySelector<HTMLElement>('.hi-words-file-editor-layout');
        layout?.toggleClass('is-preview-closed', !open);
        if (open) {
            const card = this.document.kind === 'hiwords' ? this.document.pack.cards.find(item => item.id === this.selectedCardId) : null;
            if (card) this.renderCardPreview(card);
        }
        const button = this.contentEl.querySelector<HTMLElement>('.hi-words-file-preview-action');
        button?.toggleClass('is-active', open);
        button?.setAttribute('aria-pressed', String(open));
    }

    private async generateAIDraft(card: HiWordsCard): Promise<void> {
        const word = card.word.trim();
        if (!word) {
            new Notice('Enter a headword before generating content.');
            this.inspectorEl?.querySelector<HTMLInputElement>('input')?.focus();
            return;
        }
        if (this.aiGeneratingCardId) return;

        const requestId = ++this.aiRequestId;
        this.aiGeneratingCardId = card.id;
        this.refreshEditorActions(card);
        try {
            const generated = await new HiWordsGenerationService(this.plugin).generate(word);
            if (requestId !== this.aiRequestId || this.selectedCardId !== card.id) return;
            const draftCard = mergeGeneratedContent(card, generated);
            this.aiDraft = { cardId: card.id, card: draftCard };
            this.previewOpen = true;
            const layout = this.contentEl.querySelector<HTMLElement>('.hi-words-file-editor-layout');
            layout?.removeClass('is-preview-closed');
            this.renderCardInspector(draftCard);
            this.renderCardPreview(draftCard);
        } catch (error) {
            console.error('HiWords AI generation failed:', error);
            new Notice(error instanceof Error ? error.message : 'AI generation failed.');
        } finally {
            if (requestId === this.aiRequestId) {
                this.aiGeneratingCardId = null;
                this.refreshEditorActions(card);
            }
        }
    }

    private applyAIDraft(card: HiWordsCard): void {
        if (!this.aiDraft || this.aiDraft.cardId !== card.id) return;
        const storedCard = this.getStoredCard(card.id);
        if (!storedCard) return;
        const appliedCard = this.cloneCard(this.aiDraft.card);
        const cardIndex = this.document.kind === 'hiwords'
            ? this.document.pack.cards.findIndex(item => item.id === card.id)
            : -1;
        if (cardIndex < 0 || this.document.kind !== 'hiwords') return;
        this.document.pack.cards[cardIndex] = appliedCard;
        this.aiDraft = null;
        this.markChanged(appliedCard);
        this.renderCardList();
        this.renderCardInspector(appliedCard);
        this.renderCardPreview(appliedCard);
        this.renderValidation();
        new Notice('AI content applied.');
    }

    private discardAIDraft(): void {
        this.aiDraft = null;
        this.aiRequestId++;
        this.aiGeneratingCardId = null;
    }

    private getStoredCard(cardId: string): HiWordsCard | null {
        if (this.document.kind !== 'hiwords') return null;
        return this.document.pack.cards.find(card => card.id === cardId) || null;
    }

    private getEditableCard(card: HiWordsCard): HiWordsCard {
        return this.aiDraft?.cardId === card.id ? this.aiDraft.card : card;
    }

    private cloneCard(card: HiWordsCard): HiWordsCard {
        return JSON.parse(JSON.stringify(card)) as HiWordsCard;
    }

    private getEditorModuleOrder(): HiWordsEditorModule[] {
        if (this.document.kind !== 'hiwords') return HIWORDS_EDITOR_MODULES.map(item => item.id);
        const stored = this.document.pack.display?.moduleOrder;
        const valid = Array.isArray(stored)
            ? stored.filter((value): value is HiWordsEditorModule =>
                typeof value === 'string' && HIWORDS_EDITOR_MODULES.some(item => item.id === value))
            : [];
        const missing = HIWORDS_EDITOR_MODULES.map(item => item.id).filter(module => !valid.includes(module));
        return [...new Set([...valid, ...missing])];
    }

    private getEditorPreviewSections(): WordCardDetailSection[] {
        const sectionByModule: Partial<Record<HiWordsEditorModule, WordCardDetailSection>> = {
            meanings: 'definitions',
            sentences: 'examples',
            forms: 'forms',
            derivedWords: 'derivedWords',
            morphology: 'morphology',
            phrases: 'phrases',
            usage: 'usage',
            relations: 'relations',
            memory: 'memory',
            note: 'note',
            images: 'images',
            custom: 'custom',
        };
        return this.getEditorModuleOrder()
            .map(module => sectionByModule[module])
            .filter((section): section is WordCardDetailSection => !!section);
    }

    private saveEditorModuleOrder(order: HiWordsEditorModule[], card: HiWordsCard): void {
        if (this.document.kind !== 'hiwords') return;
        if (this.aiDraft?.cardId === card.id && this.aiDraft.card === card) return;
        this.document.pack.display = { ...(this.document.pack.display || {}), moduleOrder: order };
        this.markChanged(card);
    }

    private reorderEditorModules(source: HiWordsEditorModule, target: HiWordsEditorModule, card: HiWordsCard): void {
        const order = this.getEditorModuleOrder();
        const sourceIndex = order.indexOf(source);
        const targetIndex = order.indexOf(target);
        if (sourceIndex < 0 || targetIndex < 0) return;
        order.splice(sourceIndex, 1);
        order.splice(order.indexOf(target), 0, source);
        this.selectedModule = source;
        this.saveEditorModuleOrder(order, card);
        this.renderCardInspector(card);
        this.renderCardPreview(card);
        window.setTimeout(() => this.scrollToEditorModule(source), 0);
    }

    private moveEditorModule(module: HiWordsEditorModule, offset: number, card: HiWordsCard): void {
        const order = this.getEditorModuleOrder();
        const index = order.indexOf(module);
        const target = Math.max(0, Math.min(order.length - 1, index + offset));
        if (index < 0 || target === index) return;
        const targetModule = order[target];
        if (targetModule) this.reorderEditorModules(module, targetModule, card);
    }

    private scrollToEditorModule(module: HiWordsEditorModule): void {
        this.inspectorEl?.querySelector<HTMLElement>(`.hi-words-file-editor-module[data-module="${module}"]`)
            ?.scrollIntoView({ block: 'start' });
    }

    private updateOutlineActive(outline: HTMLElement, module: HiWordsEditorModule): void {
        outline.querySelectorAll<HTMLElement>('.hi-words-file-editor-outline-item').forEach(item => {
            item.toggleClass('is-active', item.dataset.module === module);
        });
    }

    private syncOutlineWithScroll(outline: HTMLElement, editor: HTMLElement, scrollContainer: HTMLElement): void {
        const sections = Array.from(editor.querySelectorAll<HTMLElement>('.hi-words-file-editor-module'));
        if (!sections.length) return;
        const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        if (distanceFromBottom <= 4) {
            const lastModule = sections.at(-1)?.dataset.module as HiWordsEditorModule | undefined;
            if (lastModule && lastModule !== this.selectedModule) {
                this.selectedModule = lastModule;
                this.updateOutlineActive(outline, lastModule);
            }
            return;
        }
        const threshold = scrollContainer.getBoundingClientRect().top + 64;
        let active = sections[0];
        for (const section of sections) {
            if (section.getBoundingClientRect().top <= threshold) active = section;
            else break;
        }
        const module = active?.dataset.module as HiWordsEditorModule | undefined;
        if (!module || module === this.selectedModule) return;
        this.selectedModule = module;
        this.updateOutlineActive(outline, module);
    }

    private addCard(): void {
        if (this.document.kind !== 'hiwords') return;
        const card = createEmptyHiWordsCard();
        this.document.pack.cards.push(card);
        this.selectedCardId = card.id;
        this.selectedModule = 'word';
        this.markChanged(card);
        this.render();
        window.setTimeout(() => this.inspectorEl?.querySelector<HTMLInputElement>('input')?.select(), 0);
    }

    private deleteCard(card: HiWordsCard): void {
        if (this.document.kind !== 'hiwords') return;
        if (this.aiDraft?.cardId === card.id) this.discardAIDraft();
        const index = this.document.pack.cards.findIndex(item => item.id === card.id);
        if (index < 0) return;
        this.document.pack.cards.splice(index, 1);
        this.selectedCardId = this.document.pack.cards[Math.min(index, this.document.pack.cards.length - 1)]?.id || null;
        this.markChanged();
        this.render();
    }

    private markChanged(card?: HiWordsCard): void {
        this.documentDirty = true;
        this.requestSave();
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshVocabularyAfterSave();
        }, 2300);
    }

    private async refreshVocabularyAfterSave(): Promise<void> {
        if (!this.file) return;
        const isBook = this.plugin.settings.vocabularyBooks.some(book => book.path === this.file?.path && book.enabled);
        if (isBook) {
            await this.plugin.vocabularyManager.reloadVocabularyBook(this.file.path);
            this.plugin.refreshHighlighter();
        }
    }

    private renderValidation(): void {
        if (!this.validationEl || this.document.kind !== 'hiwords') return;
        this.validationEl.empty();
        const issues = validateHiWordsPack(this.document.pack).filter(issue =>
            !issue.cardId || issue.message === 'Duplicate word ID.' || issue.message.includes('unique ID')
        );
        if (!issues.length) {
            this.validationEl.removeClass('has-errors');
            this.validationEl.addClass('is-valid');
            return;
        }
        this.validationEl.removeClass('is-valid');
        this.validationEl.addClass('has-errors');
        const selectedIssues = issues.filter(issue => !issue.cardId || issue.cardId === this.selectedCardId);
        this.validationEl.createSpan({ text: `${issues.length} issue${issues.length === 1 ? '' : 's'}` });
        if (selectedIssues[0]) this.validationEl.createSpan({ text: selectedIssues[0].message });
    }

    private createHeaderAction(container: HTMLElement, icon: string, label: string): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: 'hi-words-file-header-action clickable-icon',
            attr: { type: 'button', 'aria-label': label },
        });
        setIcon(button, icon);
        return button;
    }
}

export async function createAndOpenHiWordsFile(plugin: HiWordsPlugin): Promise<TFile> {
    const activeFile = plugin.app.workspace.getActiveFile();
    const parentPath = activeFile?.parent?.path || '';
    let index = 0;
    let path = '';
    do {
        const suffix = index === 0 ? '' : ` ${index + 1}`;
        path = normalizePath(`${parentPath ? `${parentPath}/` : ''}Untitled vocabulary${suffix}.hiwords`);
        index++;
    } while (plugin.app.vault.getAbstractFileByPath(path));

    const title = path.slice(path.lastIndexOf('/') + 1, -'.hiwords'.length);
    const pack = createEmptyHiWordsPack(title);
    const file = await plugin.app.vault.create(path, serializeHiWordsPack(pack));
    plugin.settings.vocabularyBooks.push({ path: file.path, name: file.basename, enabled: true });
    await plugin.saveSettings();
    await plugin.vocabularyManager.reloadVocabularyBook(file.path);
    plugin.refreshHighlighter();
    await plugin.app.workspace.getLeaf('tab').openFile(file);
    return file;
}

class LeaveAIDraftModal extends Modal {
    constructor(plugin: HiWordsPlugin, onApply: () => void, onDiscard: () => void) {
        super(plugin.app);
        this.setTitle('AI draft not applied');
        this.contentEl.createEl('p', {
            text: 'Apply your AI draft before switching words, or discard it and restore the original entry.',
        });
        const actions = this.contentEl.createDiv({ cls: 'hi-words-file-modal-actions' });
        const keepEditing = actions.createEl('button', { text: 'Keep editing' });
        keepEditing.onclick = () => this.close();
        const discard = actions.createEl('button', { text: 'Discard' });
        discard.onclick = () => {
            onDiscard();
            this.close();
        };
        const apply = actions.createEl('button', { text: 'Apply', cls: 'mod-cta' });
        apply.onclick = () => {
            onApply();
            this.close();
        };
    }
}

class DeleteCardModal extends Modal {
    constructor(plugin: HiWordsPlugin, word: string, onConfirm: () => void) {
        super(plugin.app);
        this.setTitle('Delete word');
        this.contentEl.createEl('p', { text: `Delete “${word}” from this vocabulary? This changes the .hiwords file.` });
        const actions = this.contentEl.createDiv({ cls: 'hi-words-file-modal-actions' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        cancel.onclick = () => this.close();
        const confirm = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
        confirm.onclick = () => {
            onConfirm();
            this.close();
        };
    }
}
