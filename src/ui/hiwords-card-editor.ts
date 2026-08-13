import { setIcon } from 'obsidian';
import { createEmptyMeaning, createStableId, normalizeLearningItemType } from '../editor/hiwords-document';
import type {
    HiWordsCard,
    HiWordsCustomSection,
    HiWordsDerivedWord,
    HiWordsForm,
    HiWordsImage,
    HiWordsMemoryItem,
    HiWordsMorphologyComponent,
    HiWordsPack,
    HiWordsPhrase,
    HiWordsRelation,
    HiWordsSentence,
} from '../schema/hiwords';

export type HiWordsEditorModule =
    | 'word' | 'meanings' | 'sentences' | 'forms' | 'derivedWords' | 'morphology'
    | 'phrases' | 'usage' | 'relations' | 'memory' | 'note' | 'images' | 'custom';

export interface CardEditorCallbacks {
    onChange: () => void;
    onWordChange: () => void;
    onStructureChange: () => void;
    onDelete: () => void;
}

export const HIWORDS_EDITOR_MODULES: Array<{ id: HiWordsEditorModule; title: string; description: string }> = [
    { id: 'word', title: 'Word', description: 'Spelling, type and pronunciation' },
    { id: 'meanings', title: 'Meanings', description: 'Definitions and translations' },
    { id: 'sentences', title: 'Sentences', description: 'Saved examples for this word' },
    { id: 'forms', title: 'Word forms', description: 'Plural, tense and comparative forms' },
    { id: 'derivedWords', title: 'Derived words', description: 'Related words built from this word' },
    { id: 'morphology', title: 'Morphology', description: 'Roots, affixes and word structure' },
    { id: 'phrases', title: 'Phrases', description: 'Phrases and common expressions' },
    { id: 'usage', title: 'Usage', description: 'Patterns, register and common mistakes' },
    { id: 'relations', title: 'Related words', description: 'Synonyms, antonyms and confusables' },
    { id: 'memory', title: 'Memory', description: 'Notes and memory cues' },
    { id: 'note', title: 'My note', description: 'Your personal note for this word' },
    { id: 'images', title: 'Images', description: 'Images stored in the vault' },
    { id: 'custom', title: 'Custom content', description: 'Extra text sections for this word' },
];

export function renderHiWordsCardEditor(
    container: HTMLElement,
    pack: HiWordsPack,
    card: HiWordsCard,
    callbacks: CardEditorCallbacks,
    module: HiWordsEditorModule = 'meanings'
): void {
    container.empty();
    container.addClass('hi-words-file-card-editor');

    switch (module) {
        case 'word': renderWord(container, pack, card, callbacks); break;
        case 'meanings': renderMeanings(container, card, callbacks); break;
        case 'sentences': renderSentences(container, card, callbacks); break;
        case 'forms': renderForms(container, card, callbacks); break;
        case 'derivedWords': renderDerivedWords(container, card, callbacks); break;
        case 'morphology': renderMorphology(container, card, callbacks); break;
        case 'phrases': renderPhrases(container, card, callbacks); break;
        case 'usage': renderUsage(container, card, callbacks); break;
        case 'relations': renderRelations(container, card, callbacks); break;
        case 'memory': renderMemory(container, card, callbacks); break;
        case 'note': renderNote(container, card, callbacks); break;
        case 'images': renderImages(container, card, callbacks); break;
        case 'custom': renderCustomContent(container, card, callbacks); break;
    }
}

function renderWord(container: HTMLElement, pack: HiWordsPack, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Basic information');
    const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
    textField(grid, 'Headword', card.word, value => { card.word = value; callbacks.onWordChange(); }, '', 'Enter a word or phrase.');
    selectField(grid, 'Type', card.type, ['word', 'phrase', 'concept', 'term'], value => {
        card.type = normalizeLearningItemType(value);
        callbacks.onChange();
    });
    textField(grid, 'Language override', card.language || '', value => {
        card.language = value.trim() || undefined;
        callbacks.onChange();
    }, `Inherits ${pack.language}`);
    textField(grid, 'Aliases', (card.aliases || []).join(', '), value => { card.aliases = splitCommaValues(value); callbacks.onChange(); }, 'Spelling variants only');
    textField(grid, 'US pronunciation', card.phonetics?.us || '', value => {
        card.phonetics = { ...(card.phonetics || {}), us: value };
        callbacks.onChange();
    });
    textField(grid, 'UK pronunciation', card.phonetics?.uk || '', value => {
        card.phonetics = { ...(card.phonetics || {}), uk: value };
        callbacks.onChange();
    });
}

function renderMeanings(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Meanings', 'Add meaning', () => {
        card.meanings.push(createEmptyMeaning(card.id));
        callbacks.onStructureChange();
    });
    card.meanings.forEach((meaning, meaningIndex) => {
        const item = section.createDiv({ cls: 'hi-words-file-edit-item hi-words-file-sense-editor' });
        const header = item.createDiv({ cls: 'hi-words-file-edit-item-header' });
        const toggle = header.createDiv({
            cls: 'hi-words-file-sense-toggle',
            attr: { role: 'button', tabindex: '0', 'aria-expanded': 'true', 'aria-label': `Collapse meaning ${meaningIndex + 1}` },
        });
        setIcon(toggle.createSpan({ cls: 'hi-words-file-sense-chevron' }), 'chevron-down');
        const summary = toggle.createEl('strong');
        const updateSummary = () => summary.setText(
            `${abbreviatePartOfSpeech(meaning.partOfSpeech)} ${meaning.translation}`.trim()
        );
        updateSummary();
        const remove = iconButton(header, 'trash-2', 'Delete meaning');
        remove.disabled = card.meanings.length <= 1;
        remove.onclick = () => {
            if (card.meanings.length <= 1) return;
            card.meanings.splice(meaningIndex, 1);
            callbacks.onStructureChange();
        };
        const content = item.createDiv({ cls: 'hi-words-file-sense-content' });
        const toggleSense = () => {
            const collapsed = item.hasClass('is-collapsed');
            item.toggleClass('is-collapsed', !collapsed);
            content.hidden = !collapsed;
            toggle.setAttribute('aria-expanded', String(collapsed));
            toggle.setAttribute('aria-label', `${collapsed ? 'Collapse' : 'Expand'} meaning ${meaningIndex + 1}`);
        };
        toggle.onclick = toggleSense;
        toggle.onkeydown = event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleSense();
        };
        const grid = content.createDiv({ cls: 'hi-words-file-form-grid' });
        const partOfSpeechOptions = Array.from(new Set([
            meaning.partOfSpeech,
            'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
            'conjunction', 'determiner', 'interjection', 'auxiliary', 'modal', 'phrase',
        ].filter(Boolean)));
        selectField(grid, 'Part of speech', meaning.partOfSpeech, partOfSpeechOptions, value => {
            meaning.partOfSpeech = value;
            updateSummary();
            callbacks.onChange();
        });
        translationField(grid, meaning.translation, value => {
            meaning.translation = value;
            updateSummary();
            callbacks.onChange();
        }, 'Add a translation.');
        textareaField(content, 'Definition', meaning.definition, value => { meaning.definition = value; callbacks.onChange(); }, '', 'Add a definition.');
    });
}

function renderSentences(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.sentences || [];
    renderCollection(container, 'Sentences', 'Add sentence', items, callbacks, (): HiWordsSentence => ({
        id: createStableId('sentence'),
        text: '',
        translation: '',
    }), (row, item) => {
        row.addClass('hi-words-file-sentence-fields');
        textareaField(row, 'Sentence', item.text, value => item.text = value);
        textareaField(row, 'Translation', item.translation || '', value => item.translation = value);
        textField(row, 'Source', item.source || '', value => item.source = value, 'Optional vault path or source');
    }, item => joinSummary(item.text, item.translation), () => card.sentences = items);
}

function renderForms(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.forms || [];
    renderCollection(container, 'Word forms', 'Add form', items, callbacks, (): HiWordsForm => ({ form: '', type: '' }), (row, item) => {
        textField(row, 'Form', item.form, value => item.form = value);
        textField(row, 'Type', item.type, value => item.type = value, 'past, plural…');
    }, item => joinSummary(item.form, item.type), () => card.forms = items);
}

function renderDerivedWords(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.derivedWords || [];
    renderCollection(container, 'Derived words', 'Add derived word', items, callbacks, (): HiWordsDerivedWord => ({ word: '' }), (row, item) => {
        textField(row, 'Word', item.word, value => item.word = value);
        selectField(row, 'Part of speech', item.partOfSpeech || '', partOfSpeechOptions(item.partOfSpeech), value => item.partOfSpeech = value);
        textField(row, 'Meaning', item.meaning || '', value => item.meaning = value);
    }, item => joinSummary(item.word, abbreviatePartOfSpeech(item.partOfSpeech || ''), item.meaning), () => card.derivedWords = items);
}

function renderMorphology(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Morphology');
    const components = card.morphology?.components || [];
    const componentsSection = renderCollection(section, 'Components', 'Add component', components, callbacks,
        (): HiWordsMorphologyComponent => ({ type: 'root', form: '' }),
        (row, item) => {
            selectField(row, 'Type', item.type, morphologyComponentTypes(item.type), value => item.type = value);
            textField(row, 'Form', item.form, value => item.form = value, 'Example: access or -ible');
            textField(row, 'Meaning', item.meaning || '', value => item.meaning = value);
        },
        item => joinSummary(humanize(item.type), item.form, item.meaning),
        () => {
            card.morphology = { ...(card.morphology || {}), components };
        },
    );
    componentsSection.addClass('hi-words-file-editor-subsection');
    textareaField(section, 'Explanation', card.morphology?.explanation || '', value => {
        card.morphology = { ...(card.morphology || {}), explanation: value };
        callbacks.onChange();
    });
}

function renderPhrases(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.phrases || [];
    renderCollection(container, 'Phrases', 'Add phrase', items, callbacks, (): HiWordsPhrase => ({ id: createStableId('phrase'), text: '' }), (row, item) => {
        row.addClass('hi-words-file-phrase-fields');
        textField(row, 'Phrase', item.text, value => item.text = value);
        translationField(row, item.translation || '', value => item.translation = value);
        textareaField(row, 'Sentence', item.sentence || '', value => item.sentence = value);
    }, item => joinSummary(item.text, item.translation), () => card.phrases = items);
}

function renderUsage(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Usage');
    textField(section, 'Register', (card.usage?.register || []).join(', '), value => { card.usage = { ...(card.usage || {}), register: splitCommaValues(value) }; callbacks.onChange(); }, 'neutral, formal, informal…');
    stringListField(section, 'Patterns', card.usage?.patterns || [], 'Add pattern', 'Example: be accessible to + person', values => {
        card.usage = { ...(card.usage || {}), patterns: values };
        callbacks.onChange();
    });
    stringListField(section, 'Notes', card.usage?.notes || [], 'Add note', 'Add a short usage note', values => {
        card.usage = { ...(card.usage || {}), notes: values };
        callbacks.onChange();
    });
    stringListField(section, 'Common mistakes', card.usage?.commonMistakes || [], 'Add mistake', 'Describe one common mistake', values => {
        card.usage = { ...(card.usage || {}), commonMistakes: values };
        callbacks.onChange();
    });
}

function renderRelations(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.relations || [];
    renderCollection(container, 'Related words', 'Add relation', items, callbacks, (): HiWordsRelation => ({ type: 'related', target: '' }), (row, item) => {
        selectField(row, 'Relation', item.type, ['synonym', 'antonym', 'confusable', 'related'], value => item.type = value);
        textField(row, 'Word', item.target, value => item.target = value);
        textField(row, 'Difference or note', item.note || '', value => item.note = value);
    }, item => joinSummary(humanize(item.type), item.target, item.note), () => card.relations = items);
}

function renderMemory(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.memory || [];
    renderCollection(container, 'Memory', 'Add memory note', items, callbacks, (): HiWordsMemoryItem => ({ type: 'note', text: '' }), (row, item) => {
        row.addClass('hi-words-file-memory-fields');
        textField(row, 'Type', item.type, value => item.type = value, 'note, mnemonic…');
        textareaField(row, 'Content', item.text, value => item.text = value);
    }, item => joinSummary(humanize(item.type), item.text), () => card.memory = items);
}

function renderNote(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'My note');
    textareaField(
        section,
        'Note',
        card.note?.text || '',
        value => {
            card.note = value
                ? { text: value }
                : undefined;
            callbacks.onChange();
        },
        'Write your own understanding, memory cue, or mistake note…'
    );
}

function renderImages(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.images || [];
    renderCollection(container, 'Images', 'Add image', items, callbacks, (): HiWordsImage => ({ path: '' }), (row, item) => {
        textField(row, 'Vault path', item.path, value => item.path = value);
        textField(row, 'Alternative text', item.alt || '', value => item.alt = value);
        textField(row, 'Caption', item.caption || '', value => item.caption = value);
        textField(row, 'Source', item.source || '', value => item.source = value, 'Optional source or attribution');
    }, item => joinSummary(item.caption || item.alt, item.path), () => card.images = items);
}

function renderCustomContent(container: HTMLElement, card: HiWordsCard, callbacks: CardEditorCallbacks): void {
    const items = card.customSections || [];
    const section = renderCollection(container, 'Custom content', 'Add custom section', items, callbacks,
        (): HiWordsCustomSection => ({ id: createStableId('custom'), title: '', content: '' }),
        (fields, item) => {
            fields.addClass('hi-words-file-custom-section-fields');
            textField(fields, 'Title', item.title, value => item.title = value, 'Section title');
            textareaField(fields, 'Content', item.content, value => item.content = value, 'Write custom content…');
        },
        item => joinSummary(item.title, item.content),
        () => card.customSections = items,
    );
    section.querySelectorAll<HTMLElement>('.hi-words-file-collection-item').forEach((row, index) => {
        const item = items[index];
        const header = row.querySelector<HTMLElement>('.hi-words-file-collection-header');
        if (!item || !header) return;
        row.dataset.customSectionId = item.id;
        const grip = header.createSpan({ cls: 'hi-words-file-custom-drag-handle', attr: { draggable: 'true', 'aria-label': 'Reorder custom section' } });
        setIcon(grip, 'grip-vertical');
        header.prepend(grip);
        grip.ondragstart = event => {
            event.dataTransfer?.setData('text/hiwords-custom-section', item.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            row.addClass('is-dragging');
        };
        grip.ondragend = () => row.removeClass('is-dragging');
        row.ondragover = event => {
            event.preventDefault();
            row.addClass('is-drop-target');
        };
        row.ondragleave = () => row.removeClass('is-drop-target');
        row.ondrop = event => {
            event.preventDefault();
            row.removeClass('is-drop-target');
            const sourceId = event.dataTransfer?.getData('text/hiwords-custom-section');
            const sourceIndex = items.findIndex(candidate => candidate.id === sourceId);
            const targetIndex = items.findIndex(candidate => candidate.id === item.id);
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
            const [moved] = items.splice(sourceIndex, 1);
            const insertionIndex = items.findIndex(candidate => candidate.id === item.id);
            if (moved) items.splice(Math.max(0, insertionIndex), 0, moved);
            callbacks.onStructureChange();
        };
    });
}

export function renderAddCustomContentControl(
    container: HTMLElement,
    card: HiWordsCard,
    callbacks: CardEditorCallbacks,
): void {
    const trigger = container.createEl('button', {
        cls: 'hi-words-file-add-custom-trigger',
        attr: { type: 'button' },
    });
    setIcon(trigger.createSpan({ cls: 'hi-words-file-add-custom-icon' }), 'plus');
    trigger.createSpan({ text: 'Add custom section' });

    trigger.onclick = () => {
        if (!card.customSections) card.customSections = [];
        card.customSections.push({ id: createStableId('custom'), title: '', content: '' });
        callbacks.onStructureChange();
    };
}

function renderCollection<T>(container: HTMLElement, title: string, addLabel: string, items: T[], callbacks: CardEditorCallbacks, createItem: () => T, renderFields: (container: HTMLElement, item: T) => void, getSummary: (item: T) => string, ensureItems?: () => void): HTMLElement {
    const section = createSection(container, title, addLabel, () => {
        ensureItems?.();
        items.push(createItem());
        callbacks.onStructureChange();
    });
    if (items.length === 0) {
        section.querySelector('.hi-words-file-editor-section-header .hi-words-file-text-button')?.remove();
        const emptyAction = section.createEl('button', {
            cls: 'hi-words-file-empty-state',
            attr: { type: 'button' },
        });
        setIcon(emptyAction.createSpan(), 'plus');
        emptyAction.createSpan({ text: addLabel });
        emptyAction.onclick = () => {
            ensureItems?.();
            items.push(createItem());
            callbacks.onStructureChange();
        };
    }
    items.forEach((item, index) => {
        const row = section.createDiv({ cls: 'hi-words-file-edit-item hi-words-file-collection-item' });
        const header = row.createDiv({ cls: 'hi-words-file-edit-item-header hi-words-file-collection-header' });
        const toggle = header.createDiv({
            cls: 'hi-words-file-collection-toggle',
            attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!getSummary(item)), 'aria-label': `Edit ${title.toLowerCase()} item ${index + 1}` },
        });
        setIcon(toggle.createSpan({ cls: 'hi-words-file-sense-chevron' }), 'chevron-down');
        const summary = toggle.createSpan({ cls: 'hi-words-file-collection-summary' });
        const updateSummary = () => summary.setText(getSummary(item) || `New ${title.toLowerCase()} item`);
        updateSummary();
        const remove = iconButton(header, 'x', `Delete ${title.toLowerCase()} item`);
        const fields = row.createDiv({ cls: 'hi-words-file-form-grid hi-words-file-collection-fields' });
        renderFields(fields, item);
        const startsCollapsed = Boolean(getSummary(item));
        row.toggleClass('is-collapsed', startsCollapsed);
        fields.hidden = startsCollapsed;
        const toggleItem = () => {
            const collapsed = row.hasClass('is-collapsed');
            row.toggleClass('is-collapsed', !collapsed);
            fields.hidden = !collapsed;
            toggle.setAttribute('aria-expanded', String(collapsed));
            if (collapsed) fields.querySelector<HTMLElement>('input, textarea, select')?.focus();
        };
        toggle.onclick = toggleItem;
        toggle.onkeydown = event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleItem();
        };
        fields.querySelectorAll('input, textarea, select').forEach(control => {
            control.addEventListener('input', () => { updateSummary(); callbacks.onChange(); });
            control.addEventListener('change', () => { updateSummary(); callbacks.onChange(); });
        });
        remove.onclick = () => { items.splice(index, 1); callbacks.onStructureChange(); };
    });
    return section;
}

function stringListField(container: HTMLElement, label: string, initialValues: string[], addLabel: string, placeholder: string, onChange: (values: string[]) => void): void {
    const field = container.createDiv({ cls: 'hi-words-file-list-field' });
    const header = field.createDiv({ cls: 'hi-words-file-nested-header' });
    header.createEl('strong', { text: label });
    const add = textButton(header, addLabel);
    const values = [...initialValues];
    const rows = field.createDiv({ cls: 'hi-words-file-list-field-rows' });
    const renderRows = () => {
        rows.empty();
        if (!values.length) rows.createDiv({ cls: 'hi-words-file-list-field-empty', text: `No ${label.toLowerCase()} yet.` });
        values.forEach((value, index) => {
            const row = rows.createDiv({ cls: 'hi-words-file-list-field-row' });
            const input = row.createEl('input', { type: 'text', value, placeholder, attr: { 'aria-label': `${label} ${index + 1}` } });
            input.oninput = () => { values[index] = input.value; onChange(values.filter(item => item.trim())); };
            const remove = iconButton(row, 'x', `Delete ${label.toLowerCase()} ${index + 1}`);
            remove.onclick = () => { values.splice(index, 1); onChange(values.filter(item => item.trim())); renderRows(); };
        });
    };
    add.onclick = () => {
        values.push('');
        renderRows();
        rows.querySelectorAll<HTMLInputElement>('input')[values.length - 1]?.focus();
    };
    renderRows();
}

function createSection(container: HTMLElement, title: string, actionLabel?: string, onAction?: () => void): HTMLElement {
    const section = container.createDiv({ cls: 'hi-words-file-editor-section' });
    const header = section.createDiv({ cls: 'hi-words-file-editor-section-header' });
    header.createEl('h3', { text: title });
    if (actionLabel && onAction) {
        const action = textButton(header, actionLabel);
        action.onclick = onAction;
    }
    return section;
}

function textField(container: HTMLElement, label: string, value: string, onInput: (value: string) => void, placeholder = '', requiredMessage = ''): HTMLInputElement {
    const field = container.createEl('label', { cls: 'hi-words-file-field' });
    field.createSpan({ text: label });
    const input = field.createEl('input', { type: 'text', value, placeholder });
    input.oninput = () => onInput(input.value);
    if (requiredMessage) attachRequiredValidation(field, input, requiredMessage);
    return input;
}

function translationField(container: HTMLElement, value: string, onInput: (value: string) => void, requiredMessage = ''): HTMLInputElement {
    const input = textField(container, 'Translation', value, onInput, '', requiredMessage);
    input.addClass('hi-words-file-translation-input');
    return input;
}

function textareaField(container: HTMLElement, label: string, value: string, onInput: (value: string) => void, placeholder = '', requiredMessage = ''): HTMLTextAreaElement {
    const field = container.createEl('label', { cls: 'hi-words-file-field hi-words-file-field-wide' });
    field.createSpan({ text: label });
    const textarea = field.createEl('textarea', { placeholder });
    textarea.value = value;
    textarea.oninput = () => onInput(textarea.value);
    if (requiredMessage) attachRequiredValidation(field, textarea, requiredMessage);
    return textarea;
}

function attachRequiredValidation(field: HTMLElement, control: HTMLInputElement | HTMLTextAreaElement, message: string): void {
    const hint = field.createDiv({ cls: 'hi-words-file-field-message', text: message });
    const update = () => {
        const invalid = !control.value.trim();
        field.toggleClass('has-error', invalid);
        hint.toggleClass('is-visible', invalid);
        control.setAttribute('aria-invalid', String(invalid));
    };
    control.addEventListener('blur', update);
    control.addEventListener('input', () => {
        if (field.hasClass('has-error')) update();
    });
}

function selectField(container: HTMLElement, label: string, value: string, options: string[], onChange: (value: string) => void): HTMLSelectElement {
    const field = container.createEl('label', { cls: 'hi-words-file-field' });
    field.createSpan({ text: label });
    const select = field.createEl('select');
    for (const optionValue of options) {
        const option = select.createEl('option', { text: optionValue, value: optionValue });
        option.selected = optionValue === value;
    }
    select.onchange = () => onChange(select.value);
    return select;
}

function iconButton(container: HTMLElement, icon: string, label: string): HTMLButtonElement {
    const button = container.createEl('button', { cls: 'hi-words-file-icon-button clickable-icon', attr: { type: 'button', 'aria-label': label } });
    setIcon(button, icon);
    return button;
}

function textButton(container: HTMLElement, text: string): HTMLButtonElement {
    return container.createEl('button', { text, cls: 'hi-words-file-text-button', attr: { type: 'button' } });
}

function splitCommaValues(value: string): string[] { return value.split(',').map(item => item.trim()).filter(Boolean); }
function joinSummary(...parts: Array<string | undefined>): string {
    return parts.map(part => part?.trim()).filter(Boolean).join('  ·  ');
}
function humanize(value: string): string { return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase()); }
function abbreviatePartOfSpeech(value: string): string {
    const abbreviations: Record<string, string> = {
        noun: 'n.',
        verb: 'v.',
        adjective: 'adj.',
        adverb: 'adv.',
        pronoun: 'pron.',
        preposition: 'prep.',
        conjunction: 'conj.',
        determiner: 'det.',
        interjection: 'interj.',
        auxiliary: 'aux.',
        modal: 'modal',
        phrase: 'phr.',
    };
    const normalized = value.trim().toLowerCase();
    return abbreviations[normalized] || value;
}

function partOfSpeechOptions(current?: string): string[] {
    return Array.from(new Set([
        current || '',
        'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
        'conjunction', 'determiner', 'interjection', 'auxiliary', 'modal', 'phrase',
    ].filter(Boolean)));
}

function morphologyComponentTypes(current?: string): string[] {
    return Array.from(new Set([current || '', 'root', 'prefix', 'suffix', 'base', 'other'].filter(Boolean)));
}
