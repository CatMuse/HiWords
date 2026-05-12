import { App, ItemView, MarkdownRenderer, Modal, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type HiWordsPlugin from '../../main';
import type { StudyItem, VocabularyBook, VocabularyBookDisplaySettings, WordCardDetailSection, WordDefinition } from '../utils';
import { mapCanvasColorToCSSVar, getColorWithOpacity, playWordTTS } from '../utils';
import { t } from '../i18n';
import { DEFAULT_WORD_CARD_DETAIL_SECTIONS, DEFAULT_WORD_CARD_PREVIEW_SECTIONS, renderWordCard } from './word-card-renderer';
import { AddWordModal } from './add-word-modal';

export const LIBRARY_VIEW_TYPE = 'hi-words-library';

type StatusFilter = 'all' | 'learning' | 'mastered';
type TypeFilter = 'all' | 'word' | 'phrase' | 'concept' | 'term';
const WORD_BATCH_SIZE = 200;
const DETAIL_SECTION_OPTIONS: Array<{ key: WordCardDetailSection; labelKey: string }> = [
    { key: 'definitions', labelKey: 'library.section_definitions' },
    { key: 'examples', labelKey: 'library.section_examples' },
    { key: 'collocations', labelKey: 'library.section_collocations' },
    { key: 'phrases', labelKey: 'library.section_phrases' },
    { key: 'usage', labelKey: 'library.section_usage' },
    { key: 'forms', labelKey: 'library.section_forms' },
    { key: 'morphology', labelKey: 'library.section_morphology' },
    { key: 'confusables', labelKey: 'library.section_confusables' },
    { key: 'relations', labelKey: 'library.section_relations' },
    { key: 'memory', labelKey: 'library.section_memory' },
];

interface BookStats {
    rawCount: number;
    uniqueCount: number;
    masteredCount: number;
    learningCount: number;
    progress: number;
}

class BookDisplaySettingsModal extends Modal {
    private plugin: HiWordsPlugin;
    private book: VocabularyBook;
    private onSaved: () => void | Promise<void>;
    private previewSections: WordCardDetailSection[];
    private detailSections: WordCardDetailSection[];
    private hiddenSections: WordCardDetailSection[];

    constructor(app: App, plugin: HiWordsPlugin, book: VocabularyBook, onSaved: () => void | Promise<void>) {
        super(app);
        this.plugin = plugin;
        this.book = book;
        this.onSaved = onSaved;
        this.previewSections = this.normalizeSections(book.display?.previewSections || DEFAULT_WORD_CARD_PREVIEW_SECTIONS);
        const detailDefaults = DEFAULT_WORD_CARD_DETAIL_SECTIONS.filter(section => !this.previewSections.includes(section));
        this.detailSections = this.normalizeSections(book.display?.detailSections || detailDefaults)
            .filter(section => !this.previewSections.includes(section));
        this.hiddenSections = this.normalizeSections(book.display?.hiddenSections || []);
        for (const section of DETAIL_SECTION_OPTIONS.map(option => option.key)) {
            if (!this.previewSections.includes(section) && !this.detailSections.includes(section) && !this.hiddenSections.includes(section)) {
                this.detailSections.push(section);
            }
        }
    }

    onOpen() {
        this.titleEl.setText(t('library.book_display_settings'));
        this.contentEl.empty();
        this.contentEl.addClass('hi-words-library-display-modal');

        this.contentEl.createDiv({
            cls: 'setting-item-description',
            text: this.format(t('library.book_display_settings_desc'), this.book.name),
        });

        this.renderSectionOrder();

        const actions = this.contentEl.createDiv({ cls: 'hi-words-library-display-actions' });
        const reset = actions.createEl('button', { text: t('library.reset_display_settings') });
        reset.onclick = () => {
            this.previewSections = [...DEFAULT_WORD_CARD_PREVIEW_SECTIONS];
            this.detailSections = DEFAULT_WORD_CARD_DETAIL_SECTIONS.filter(section => !this.previewSections.includes(section));
            this.hiddenSections = [];
            this.saveAndClose();
        };

        const save = actions.createEl('button', { text: t('library.save_display_settings'), cls: 'mod-cta' });
        save.onclick = () => this.saveAndClose();
    }

    private async saveAndClose() {
        const index = this.plugin.settings.vocabularyBooks.findIndex(book => book.path === this.book.path);
        if (index >= 0) {
            const nextDisplay: VocabularyBookDisplaySettings = {
                previewSections: this.previewSections,
                detailSections: this.detailSections,
                hiddenSections: this.hiddenSections,
            };
            this.plugin.settings.vocabularyBooks[index] = {
                ...this.plugin.settings.vocabularyBooks[index],
                display: nextDisplay,
            };
            await this.plugin.saveSettings();
            await this.onSaved();
        }
        this.close();
    }

    private renderSectionOrder() {
        const list = this.contentEl.createDiv({ cls: 'hi-words-library-display-list' });
        const ordered = [...this.previewSections, ...this.detailSections];

        ordered.forEach((section, index) => {
            if (index === 0) {
                list.createDiv({ cls: 'hi-words-library-display-zone', text: t('library.preview_area') });
            }
            if (index === this.previewSections.length) {
                list.createDiv({ cls: 'hi-words-library-display-zone', text: t('library.detail_area') });
            }

            const isHidden = this.hiddenSections.includes(section);
            const row = list.createDiv({ cls: `hi-words-library-display-row ${isHidden ? 'is-hidden' : ''}` });
            const toggle = row.createEl('input', {
                type: 'checkbox',
                cls: 'hi-words-library-display-toggle',
            });
            toggle.checked = !isHidden;
            toggle.onchange = () => this.toggleSection(index, toggle.checked);
            row.createDiv({ cls: 'hi-words-library-display-row-label', text: this.getSectionLabel(section) });

            const actions = row.createDiv({ cls: 'hi-words-library-display-row-actions' });
            const up = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('library.move_up'), title: t('library.move_up') } });
            setIcon(up, 'arrow-up');
            up.disabled = index === 0;
            up.onclick = () => this.moveSection(index, -1);

            const down = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('library.move_down'), title: t('library.move_down') } });
            setIcon(down, 'arrow-down');
            down.disabled = index === ordered.length - 1;
            down.onclick = () => this.moveSection(index, 1);
        });
    }

    private moveSection(index: number, delta: -1 | 1) {
        const previewCount = this.previewSections.length;
        const ordered = [...this.previewSections, ...this.detailSections];
        const targetIndex = index + delta;
        if (targetIndex < 0 || targetIndex >= ordered.length) return;

        const [item] = ordered.splice(index, 1);
        ordered.splice(targetIndex, 0, item);

        let nextPreviewCount = previewCount;
        if (delta === -1 && index === previewCount) {
            nextPreviewCount += 1;
        }
        if (delta === 1 && index === previewCount - 1) {
            nextPreviewCount -= 1;
        }

        this.previewSections = ordered.slice(0, nextPreviewCount);
        this.detailSections = ordered.slice(nextPreviewCount);
        this.onOpen();
    }

    private toggleSection(index: number, visible: boolean) {
        const ordered = [...this.previewSections, ...this.detailSections];
        const section = ordered[index];
        if (!section) return;

        if (visible && this.hiddenSections.includes(section)) {
            this.hiddenSections = this.hiddenSections.filter(item => item !== section);
        }
        if (!visible && !this.hiddenSections.includes(section)) {
            this.hiddenSections.push(section);
        }

        this.onOpen();
    }

    private getSectionLabel(section: WordCardDetailSection): string {
        const option = DETAIL_SECTION_OPTIONS.find(item => item.key === section);
        return option ? t(option.labelKey) : section;
    }

    private normalizeSections(sections: WordCardDetailSection[]): WordCardDetailSection[] {
        const allowed = new Set(DETAIL_SECTION_OPTIONS.map(option => option.key));
        const normalized: WordCardDetailSection[] = [];
        for (const section of sections) {
            if (allowed.has(section) && !normalized.includes(section)) {
                normalized.push(section);
            }
        }
        return normalized;
    }

    private format(template: string, ...values: string[]): string {
        return values.reduce((result, value, index) => result.replace(new RegExp(`\\{${index}\\}`, 'g'), value), template);
    }
}

export class HiWordsLibraryView extends ItemView {
    private plugin: HiWordsPlugin;
    private selectedBookPath = '';
    private query = '';
    private statusFilter: StatusFilter = 'all';
    private typeFilter: TypeFilter = 'all';
    private visibleWordCount = WORD_BATCH_SIZE;
    private bookStatsCache = new Map<string, BookStats>();
    private bookDefinitionsCache = new Map<string, WordDefinition[]>();
    private searchTimer: number | null = null;
    private wordListEl: HTMLElement | null = null;
    private detailEl: HTMLElement | null = null;
    private isLoadingMoreWords = false;
    private activeTooltip: HTMLElement | null = null;
    private tooltipShowTimer: number | null = null;
    private tooltipHideTimer: number | null = null;
    private renderToken = 0;

    constructor(leaf: WorkspaceLeaf, plugin: HiWordsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return LIBRARY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('library.title');
    }

    getIcon(): string {
        return 'library-big';
    }

    async onOpen() {
        this.containerEl.children[1].empty();
        await this.render();
    }

    async refresh() {
        this.clearCaches();
        await this.render();
    }

    async onClose() {
        if (this.searchTimer !== null) {
            window.clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
        this.clearTooltipTimers();
        this.removeTooltip();
        this.wordListEl = null;
        this.detailEl = null;
    }

    private async render() {
        const token = ++this.renderToken;
        const content = this.containerEl.children[1] as HTMLElement;
        const root = document.createElement('div');
        this.removeTooltip();
        root.addClass('hi-words-library');
        this.wordListEl = null;
        this.detailEl = null;

        const enabledBooks = this.plugin.settings.vocabularyBooks.filter(book => book.enabled);
        if (!this.selectedBookPath && enabledBooks.length > 0) {
            this.selectedBookPath = enabledBooks[0].path;
        }

        const studyItems = this.plugin.vocabularyManager.getStudyItems();
        const totalCards = await this.getTotalRawCount();
        const masteredCount = studyItems.filter(item => item.mastered).length;
        const learningCount = studyItems.length - masteredCount;

        this.renderHeader(root, {
            totalBooks: this.plugin.settings.vocabularyBooks.length,
            enabledBooks: enabledBooks.length,
            totalCards,
            uniqueItems: studyItems.length,
            masteredCount,
            learningCount,
            progress: studyItems.length > 0 ? masteredCount / studyItems.length : 0,
        });

        const body = root.createDiv({ cls: 'hi-words-library-body' });
        await this.renderBookList(body);
        await this.renderBookDetail(body);

        if (token !== this.renderToken) return;

        content.empty();
        content.removeClass('hi-words-library');
        while (root.firstChild) {
            content.appendChild(root.firstChild);
        }
        content.addClass('hi-words-library');
    }

    private clearCaches() {
        this.bookStatsCache.clear();
        this.bookDefinitionsCache.clear();
    }

    private renderHeader(root: HTMLElement, stats: {
        totalBooks: number;
        enabledBooks: number;
        totalCards: number;
        uniqueItems: number;
        masteredCount: number;
        learningCount: number;
        progress: number;
    }) {
        const header = root.createDiv({ cls: 'hi-words-library-header' });
        const title = header.createDiv({ cls: 'hi-words-library-title' });
        title.createEl('h2', { text: t('library.title') });
        title.createEl('p', { text: t('library.description') });

        const actions = header.createDiv({ cls: 'hi-words-library-actions' });
        const refreshButton = actions.createEl('button', { cls: 'hi-words-library-button' });
        setIcon(refreshButton, 'refresh-cw');
        refreshButton.createSpan({ text: t('library.refresh') });
        refreshButton.onclick = async () => {
            await this.plugin.vocabularyManager.loadAllVocabularyBooks();
            this.clearCaches();
            this.plugin.refreshHighlighter();
            await this.render();
            new Notice(t('notices.vocabulary_refreshed'));
        };

        const statsEl = root.createDiv({ cls: 'hi-words-library-stats' });
        this.addStat(statsEl, t('library.books'), `${stats.enabledBooks}/${stats.totalBooks}`);
        this.addStat(statsEl, t('library.cards'), stats.totalCards.toLocaleString());
        this.addStat(statsEl, t('library.items'), stats.uniqueItems.toLocaleString());
        this.addStat(statsEl, t('library.learning'), stats.learningCount.toLocaleString());
        this.addStat(statsEl, t('library.mastered'), stats.masteredCount.toLocaleString());
        this.addStat(statsEl, t('library.total_progress'), this.formatPercent(stats.progress));
    }

    private addStat(container: HTMLElement, label: string, value: string) {
        const item = container.createDiv({ cls: 'hi-words-library-stat' });
        item.createSpan({ text: label });
        item.createEl('strong', { text: value });
    }

    private async renderBookList(container: HTMLElement) {
        const aside = container.createDiv({ cls: 'hi-words-library-books' });
        aside.createEl('h3', { text: t('library.books') });

        if (this.plugin.settings.vocabularyBooks.length === 0) {
            aside.createDiv({ cls: 'hi-words-library-empty', text: t('settings.no_vocabulary_books') });
            return;
        }

        for (const book of this.plugin.settings.vocabularyBooks) {
            const stats = await this.getBookStats(book);
            const row = aside.createDiv({
                cls: `hi-words-library-book ${book.path === this.selectedBookPath ? 'is-selected' : ''} ${!book.enabled ? 'is-disabled' : ''}`,
            });
            row.onclick = async () => {
                if (this.selectedBookPath === book.path) return;
                this.selectedBookPath = book.path;
                this.resetVisibleWords();
                await this.render();
            };

            const main = row.createDiv({ cls: 'hi-words-library-book-main' });
            main.createEl('strong', { text: book.name });
            main.createSpan({
                text: this.format(t('library.book_stat'), this.getBookType(book), stats.rawCount.toLocaleString(), stats.uniqueCount.toLocaleString()),
            });

            const meta = row.createDiv({ cls: 'hi-words-library-book-meta' });
            meta.createSpan({ text: book.enabled ? t('library.enabled') : t('library.disabled') });
            meta.createSpan({ text: this.formatPercent(stats.progress) });
        }
    }

    private async renderBookDetail(container: HTMLElement) {
        const section = container.createDiv({ cls: 'hi-words-library-detail' });
        this.detailEl = section;
        section.onscroll = () => {
            this.removeTooltip();
            void this.loadMoreWordsIfNeeded();
        };

        const book = this.plugin.settings.vocabularyBooks.find(item => item.path === this.selectedBookPath);
        if (!book) {
            section.createDiv({ cls: 'hi-words-library-empty', text: t('library.select_book') });
            return;
        }

        const stats = await this.getBookStats(book);
        const header = section.createDiv({ cls: 'hi-words-library-detail-header' });
        const title = header.createDiv();
        title.createEl('h3', { text: book.name });
        title.createEl('p', { text: book.path });
        if (book.path.endsWith('.hiwords')) {
            const detailActions = header.createDiv({ cls: 'hi-words-library-actions' });
            const displayButton = this.addIconButton(detailActions, 'settings', t('library.book_display_settings'), () => {
                new BookDisplaySettingsModal(this.app, this.plugin, book, async () => {
                    this.clearCaches();
                    await this.render();
                }).open();
            });
            displayButton.addClass('hi-words-library-book-settings-button');
        }

        const summary = section.createDiv({ cls: 'hi-words-library-book-summary' });
        this.addStat(summary, t('library.type'), this.getBookType(book));
        this.addStat(summary, t('library.cards'), stats.rawCount.toLocaleString());
        this.addStat(summary, t('library.items'), stats.uniqueCount.toLocaleString());
        this.addStat(summary, t('library.learning'), stats.learningCount.toLocaleString());
        this.addStat(summary, t('library.mastered'), stats.masteredCount.toLocaleString());
        this.addStat(summary, t('library.progress'), this.formatPercent(stats.progress));

        this.renderFilters(section);
        await this.renderWords(section, book);
    }

    private renderFilters(section: HTMLElement) {
        const filters = section.createDiv({ cls: 'hi-words-library-filters' });
        const search = filters.createEl('input', {
            type: 'search',
            placeholder: t('library.search_placeholder'),
            value: this.query,
        });
        search.oninput = async () => {
            this.query = search.value;
            this.resetVisibleWords();
            this.scheduleRender();
        };

        const statusSelect = filters.createEl('select');
        this.addOption(statusSelect, 'all', t('library.all_statuses'), this.statusFilter);
        this.addOption(statusSelect, 'learning', t('library.learning'), this.statusFilter);
        this.addOption(statusSelect, 'mastered', t('library.mastered'), this.statusFilter);
        statusSelect.onchange = async () => {
            this.statusFilter = statusSelect.value as StatusFilter;
            this.resetVisibleWords();
            await this.render();
        };

        const typeSelect = filters.createEl('select');
        this.addOption(typeSelect, 'all', t('library.all_types'), this.typeFilter);
        this.addOption(typeSelect, 'word', 'Word', this.typeFilter);
        this.addOption(typeSelect, 'phrase', 'Phrase', this.typeFilter);
        this.addOption(typeSelect, 'concept', 'Concept', this.typeFilter);
        this.addOption(typeSelect, 'term', 'Term', this.typeFilter);
        typeSelect.onchange = async () => {
            this.typeFilter = typeSelect.value as TypeFilter;
            this.resetVisibleWords();
            await this.render();
        };

    }

    private addOption(select: HTMLSelectElement, value: string, label: string, current: string) {
        const option = select.createEl('option', { text: label, value });
        option.selected = value === current;
    }

    private async renderWords(section: HTMLElement, book: VocabularyBook) {
        const list = section.createDiv({ cls: 'hi-words-library-word-list' });
        this.wordListEl = list;
        await this.populateWordList(list, book);
    }

    private async populateWordList(list: HTMLElement, book: VocabularyBook) {
        list.empty();
        const definitions = await this.getBookStudyDefinitions(book.path);
        const filtered = definitions.filter(definition => this.matchesFilters(definition));
        this.visibleWordCount = Math.min(Math.max(this.visibleWordCount, WORD_BATCH_SIZE), Math.max(filtered.length, WORD_BATCH_SIZE));
        const visible = filtered.slice(0, this.visibleWordCount);

        if (filtered.length === 0) {
            list.createDiv({ cls: 'hi-words-library-empty', text: t('library.no_results') });
            return;
        }

        for (const definition of visible) {
            this.renderWordRow(list, definition);
        }

        this.renderWordLoadState(list, visible.length, filtered.length);
    }

    private async refreshWordList() {
        if (!this.wordListEl) {
            await this.render();
            return;
        }

        const book = this.plugin.settings.vocabularyBooks.find(item => item.path === this.selectedBookPath);
        if (!book) {
            await this.render();
            return;
        }

        await this.populateWordList(this.wordListEl, book);
    }

    private async loadMoreWordsIfNeeded() {
        if (this.isLoadingMoreWords || !this.detailEl || !this.wordListEl) return;

        const distanceToBottom = this.detailEl.scrollHeight - this.detailEl.scrollTop - this.detailEl.clientHeight;
        if (distanceToBottom > 160) return;

        const book = this.plugin.settings.vocabularyBooks.find(item => item.path === this.selectedBookPath);
        if (!book) return;

        const definitions = await this.getBookStudyDefinitions(book.path);
        const filteredCount = definitions.filter(definition => this.matchesFilters(definition)).length;
        if (this.visibleWordCount >= filteredCount) return;

        this.isLoadingMoreWords = true;
        const scrollTop = this.detailEl.scrollTop;
        this.visibleWordCount = Math.min(this.visibleWordCount + WORD_BATCH_SIZE, filteredCount);
        await this.populateWordList(this.wordListEl, book);
        this.detailEl.scrollTop = scrollTop;
        this.isLoadingMoreWords = false;
    }

    private renderWordLoadState(container: HTMLElement, visible: number, total: number) {
        const state = container.createDiv({ cls: 'hi-words-library-load-state' });
        state.createSpan({
            text: visible < total
                ? this.format(t('library.load_more'), visible.toLocaleString(), total.toLocaleString())
                : this.format(t('library.loaded_all'), total.toLocaleString()),
        });
    }

    private resetVisibleWords() {
        this.visibleWordCount = WORD_BATCH_SIZE;
        if (this.detailEl) {
            this.detailEl.scrollTop = 0;
        }
    }

    private renderWordRow(container: HTMLElement, definition: WordDefinition) {
        const row = container.createDiv({ cls: `hi-words-library-word ${definition.mastered ? 'is-mastered' : ''}` });
        if (definition.color) {
            const accent = mapCanvasColorToCSSVar(definition.color, 'var(--color-base-60)');
            row.style.setProperty('--word-card-accent-color', accent);
            row.style.setProperty('--word-card-bg-color', getColorWithOpacity(accent, 0.08));
        }

        const main = row.createDiv({ cls: 'hi-words-library-word-main' });
        const title = main.createDiv({ cls: 'hi-words-library-word-title' });
        const word = title.createSpan({
            text: definition.word,
            cls: 'hi-words-library-word-name',
            attr: { role: 'button', tabindex: '0' },
        });
        word.onclick = async () => playWordTTS(this.plugin, definition.word, definition);
        word.onmouseenter = () => this.scheduleTooltip(word, definition);
        word.onmouseleave = () => this.scheduleTooltipHide();
        word.onkeydown = async (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            await playWordTTS(this.plugin, definition.word, definition);
        };
        if (definition.aliases?.length) {
            main.createDiv({ cls: 'hi-words-library-aliases', text: definition.aliases.join(', ') });
        }
        main.createDiv({ cls: 'hi-words-library-study-key', text: definition.studyKey || `${definition.source}:${definition.nodeId}` });

        const actions = row.createDiv({ cls: 'hi-words-library-actions' });
        if (!definition.source.endsWith('.hiwords')) {
            const editButton = this.addIconButton(actions, 'pencil', t('library.edit_word'), () => {
                this.removeTooltip();
                new AddWordModal(this.app, this.plugin, definition.word, '', true, '', definition).open();
            });
            editButton.addClass('hi-words-library-edit-button');
        }
        this.addIconButton(actions, definition.mastered ? 'undo' : 'check', definition.mastered ? t('library.unmark_mastered') : t('library.mark_mastered'), async () => {
            if (definition.mastered) {
                await this.plugin.masteredService.unmarkWordAsMastered(definition.source, definition.nodeId, definition.word);
            } else {
                await this.plugin.masteredService.markWordAsMastered(definition.source, definition.nodeId, definition.word);
            }
            this.clearCaches();
            await this.render();
        });
    }

    private scheduleTooltip(target: HTMLElement, definition: WordDefinition) {
        if (this.tooltipHideTimer !== null) {
            window.clearTimeout(this.tooltipHideTimer);
            this.tooltipHideTimer = null;
        }
        if (this.tooltipShowTimer !== null) {
            window.clearTimeout(this.tooltipShowTimer);
        }

        this.tooltipShowTimer = window.setTimeout(() => {
            this.tooltipShowTimer = null;
            void this.showDefinitionTooltip(target, definition);
        }, 120);
    }

    private scheduleTooltipHide() {
        if (this.tooltipShowTimer !== null) {
            window.clearTimeout(this.tooltipShowTimer);
            this.tooltipShowTimer = null;
        }
        if (this.tooltipHideTimer !== null) {
            window.clearTimeout(this.tooltipHideTimer);
        }

        this.tooltipHideTimer = window.setTimeout(() => {
            this.tooltipHideTimer = null;
            this.removeTooltip();
        }, 100);
    }

    private async showDefinitionTooltip(target: HTMLElement, definition: WordDefinition) {
        this.removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'hi-words-tooltip hi-words-library-tooltip';
        if (definition.card) {
            tooltip.classList.add('hi-words-tooltip-structured');
        }

        tooltip.addEventListener('mouseenter', () => {
            if (this.tooltipHideTimer !== null) {
                window.clearTimeout(this.tooltipHideTimer);
                this.tooltipHideTimer = null;
            }
        });
        tooltip.addEventListener('mouseleave', () => this.scheduleTooltipHide());

        const titleContainer = tooltip.createDiv({ cls: 'hi-words-tooltip-title-container' });
        const title = titleContainer.createDiv({ cls: 'hi-words-tooltip-title', text: definition.word });
        title.onclick = async (event) => {
            event.stopPropagation();
            await playWordTTS(this.plugin, definition.word, definition);
        };

        const content = tooltip.createDiv({ cls: 'hi-words-tooltip-content' });
        content.addClass(this.plugin.settings.blurDefinitions ? 'hi-words-definition blur-enabled' : 'hi-words-definition');

        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;

        if (definition.card) {
            renderWordCard(content, definition, {
                mode: 'popover',
                app: this.app,
                pronunciationVariant: this.plugin.settings.pronunciationVariant || 'us',
                onPronunciationClick: (variant) => playWordTTS(this.plugin, definition.word, definition, variant),
                display: this.plugin.getVocabularyBookDisplaySettings(definition.source),
                onOpenDetail: async () => {
                    this.removeTooltip();
                    await this.plugin.showWordInSidebar(definition, 'library');
                },
            });
        } else {
            await this.renderTooltipMarkdown(content, definition);
        }

        this.positionTooltip(target, tooltip);
    }

    private async renderTooltipMarkdown(container: HTMLElement, definition: WordDefinition) {
        const content = this.getTooltipDefinitionContent(definition);
        if (!content.trim()) {
            container.textContent = t('sidebar.no_definition');
            return;
        }

        try {
            await MarkdownRenderer.render(this.app, content, container, definition.source, this);
        } catch (error) {
            console.error('Failed to render library definition tooltip:', error);
            container.textContent = content;
        }
    }

    private getTooltipDefinitionContent(definition: WordDefinition): string {
        const sections = definition.sections;
        if (sections?.length && (this.plugin.settings.enableSectionTabs ?? true)) {
            return sections[0].content;
        }

        return definition.rawDefinition || definition.definition || '';
    }

    private positionTooltip(target: HTMLElement, tooltip: HTMLElement) {
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const margin = 10;
            let left = rect.left;
            let top = rect.bottom + 6;

            if (left + tooltipRect.width > window.innerWidth - margin) {
                left = window.innerWidth - tooltipRect.width - margin;
            }
            if (top + tooltipRect.height > window.innerHeight - margin) {
                top = rect.top - tooltipRect.height - 6;
            }

            tooltip.style.left = `${Math.max(margin, left)}px`;
            tooltip.style.top = `${Math.max(margin, top)}px`;
        });
    }

    private clearTooltipTimers() {
        if (this.tooltipShowTimer !== null) {
            window.clearTimeout(this.tooltipShowTimer);
            this.tooltipShowTimer = null;
        }
        if (this.tooltipHideTimer !== null) {
            window.clearTimeout(this.tooltipHideTimer);
            this.tooltipHideTimer = null;
        }
    }

    private removeTooltip() {
        if (this.activeTooltip?.parentNode) {
            this.activeTooltip.parentNode.removeChild(this.activeTooltip);
        }
        this.activeTooltip = null;
    }

    private addIconButton(container: HTMLElement, icon: string, label: string, onClick: () => Promise<void> | void) {
        const button = container.createEl('button', { cls: 'clickable-icon hi-words-library-icon-button', attr: { 'aria-label': label, title: label } });
        setIcon(button, icon);
        button.onclick = async (event) => {
            event.stopPropagation();
            await onClick();
        };
        return button;
    }

    private matchesFilters(definition: WordDefinition): boolean {
        if (this.statusFilter === 'learning' && definition.mastered) return false;
        if (this.statusFilter === 'mastered' && !definition.mastered) return false;
        if (this.typeFilter !== 'all' && definition.type !== this.typeFilter) return false;

        const query = this.query.trim().toLowerCase();
        if (!query) return true;

        return [
            definition.word,
            definition.studyKey || '',
            definition.type || '',
            definition.language || '',
            ...(definition.aliases || []),
        ].some(value => value.toLowerCase().includes(query));
    }

    private async getTotalRawCount(): Promise<number> {
        let count = 0;
        for (const book of this.plugin.settings.vocabularyBooks) {
            count += (await this.getRawDefinitions(book.path)).length;
        }
        return count;
    }

    private async getBookStats(book: VocabularyBook): Promise<BookStats> {
        const cached = this.bookStatsCache.get(book.path);
        if (cached) return cached;

        const rawDefinitions = await this.getRawDefinitions(book.path);
        const unique = this.uniqueDefinitions(rawDefinitions);
        const masteredCount = unique.filter(definition => definition.mastered).length;
        const learningCount = unique.length - masteredCount;

        const stats = {
            rawCount: rawDefinitions.length,
            uniqueCount: unique.length,
            masteredCount,
            learningCount,
            progress: unique.length > 0 ? masteredCount / unique.length : 0,
        };
        this.bookStatsCache.set(book.path, stats);
        return stats;
    }

    private async getBookStudyDefinitions(bookPath: string): Promise<WordDefinition[]> {
        const definitions = await this.getRawDefinitions(bookPath);
        return this.uniqueDefinitions(definitions);
    }

    private async getRawDefinitions(bookPath: string): Promise<WordDefinition[]> {
        const cached = this.bookDefinitionsCache.get(bookPath);
        if (cached) return cached;

        const definitions = await this.plugin.vocabularyManager.getWordDefinitionsByBook(bookPath);
        this.bookDefinitionsCache.set(bookPath, definitions);
        return definitions;
    }

    private scheduleRender() {
        if (this.searchTimer !== null) {
            window.clearTimeout(this.searchTimer);
        }

        this.searchTimer = window.setTimeout(() => {
            this.searchTimer = null;
            void this.refreshWordList();
        }, 160);
    }

    private uniqueDefinitions(definitions: WordDefinition[]): WordDefinition[] {
        const byKey = new Map<string, WordDefinition>();
        definitions.forEach(definition => {
            const key = definition.studyKey || `${definition.source}:${definition.nodeId}`;
            const existing = byKey.get(key);
            if (!existing || (!existing.card && definition.card)) {
                byKey.set(key, definition);
            }
        });
        return [...byKey.values()].sort((a, b) => a.word.localeCompare(b.word));
    }

    private getBookType(book: VocabularyBook): string {
        if (book.path.endsWith('.hiwords')) return '.hiwords';
        if (book.path.endsWith('.canvas')) return 'Canvas';
        return 'File';
    }

    private formatPercent(value: number): string {
        return `${Math.round(value * 100)}%`;
    }

    private format(template: string, ...values: string[]): string {
        return values.reduce((result, value, index) => result.replace(new RegExp(`\\{${index}\\}`, 'g'), value), template);
    }

}
