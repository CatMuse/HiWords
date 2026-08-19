import { setIcon } from 'obsidian';
import { createEmptyMeaning, createStableId, normalizeLearningItemType } from '../editor/hiwords-document';
import type {
    HiWordsCard, HiWordsCardKind, HiWordsFieldDefinition, HiWordsFieldValue,
    HiWordsConceptCard,
    HiWordsCustomCard,
    HiWordsConceptExample,
    HiWordsCardReference,
    HiWordsWordCard,
    HiWordsCustomSection,
    HiWordsDerivedWord,
    HiWordsForm,
    HiWordsImage,
    HiWordsMemoryItem,
    HiWordsMorphologyComponent,
    HiWordsPack,
    HiWordsPersonCard,
    HiWordsPersonRelation,
    HiWordsPersonWork,
    HiWordsTimelineEntry,
    HiWordsAchievement,
    HiWordsPhrase,
    HiWordsRelation,
    HiWordsSentence,
} from '../schema/hiwords';
import {
    HIWORDS_PARTS_OF_SPEECH,
    isConceptCard,
    isCustomCard,
    isPersonCard,
    isWordCard,
    normalizeHiWordsPartOfSpeech,
} from '../schema/hiwords';
import { cardTypeRegistry } from '../knowledge';

export type HiWordsEditorModule =
    | 'word' | 'meanings' | 'sentences' | 'forms' | 'derivedWords' | 'morphology'
    | 'phrases' | 'usage' | 'relations' | 'memory' | 'identity' | 'biography'
    | 'timeline' | 'achievements' | 'works' | 'personRelations' | 'definition'
    | 'principles' | 'examples' | 'misconceptions' | 'prerequisites'
    | 'relatedConcepts' | 'note' | 'images' | 'custom' | `field:${string}`;

export interface HiWordsEditorModuleMeta { id: HiWordsEditorModule; title: string; description: string; }

export interface CardEditorCallbacks {
    onChange: () => void;
    onWordChange: () => void;
    onStructureChange: () => void;
    onDelete: () => void;
}

export function getHiWordsEditorModules(kind: HiWordsCardKind, fields: HiWordsFieldDefinition[] = []): HiWordsEditorModuleMeta[] {
    const builtIn = cardTypeRegistry.get(kind).editorModules
        .map(module => ({ id: module.id as HiWordsEditorModule, title: module.label, description: module.description }));
    const dynamic = fields.map(field => ({
        id: `field:${field.id}` as HiWordsEditorModule,
        title: field.label,
        description: field.description || `Custom ${field.type} field`,
    }));
    const commonIndex = builtIn.findIndex(module => module.id === 'note' || module.id === 'images' || module.id === 'custom');
    builtIn.splice(commonIndex < 0 ? builtIn.length : commonIndex, 0, ...dynamic);
    return builtIn;
}

export function renderHiWordsCardEditor(
    container: HTMLElement,
    pack: HiWordsPack,
    card: HiWordsCard,
    callbacks: CardEditorCallbacks,
    module: HiWordsEditorModule = 'meanings'
): void {
    container.empty();
    container.addClass('hi-words-file-card-editor');

    if (module.startsWith('field:')) {
        const field = pack.fields?.find(item => `field:${item.id}` === module);
        if (field) renderDynamicFieldEditor(container, card, field, callbacks);
        return;
    }

    if (isCustomCard(card, pack.cardKind)) {
        renderCustomCardEditor(container, card, callbacks, module);
        return;
    }

    if (isPersonCard(card, pack.cardKind)) {
        renderPersonCardEditor(container, card, callbacks, module);
        return;
    }
    if (isConceptCard(card, pack.cardKind)) {
        renderConceptCardEditor(container, card, callbacks, module);
        return;
    }
    if (!isWordCard(card, pack.cardKind)) return;

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

function renderCustomCardEditor(container: HTMLElement, card: HiWordsCustomCard, callbacks: CardEditorCallbacks, module: HiWordsEditorModule): void {
    if (module === 'identity') {
        const section = createSection(container, 'Basic');
        const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
        textField(grid, 'Title', card.title, value => { card.title = value; callbacks.onWordChange(); }, '', 'Enter a title.');
        textField(grid, 'Aliases', (card.aliases || []).join(', '), value => { card.aliases = splitCommaValues(value); callbacks.onChange(); });
        textField(grid, 'Tags', (card.tags || []).join(', '), value => { card.tags = splitCommaValues(value); callbacks.onChange(); });
        return;
    }
    if (module === 'note') renderNote(container, card, callbacks);
    if (module === 'images') renderImages(container, card, callbacks);
    if (module === 'custom') renderCustomContent(container, card, callbacks);
}

function renderDynamicFieldEditor(
    container: HTMLElement,
    card: HiWordsCard,
    field: HiWordsFieldDefinition,
    callbacks: CardEditorCallbacks
): void {
    const value = card.fieldValues?.[field.id];
    const requiredMessage = field.required ? `Add a value for ${field.label}.` : '';
    const setValue = (next: HiWordsFieldValue | undefined) => {
        card.fieldValues ||= {};
        if (next === undefined || next === '' || (Array.isArray(next) && next.length === 0)) delete card.fieldValues[field.id];
        else card.fieldValues[field.id] = next;
        callbacks.onChange();
    };

    if (field.type === 'image') {
        const images = Array.isArray(value) ? value as HiWordsImage[] : [];
        renderImageCollection(
            container,
            field.label,
            images,
            callbacks,
            () => {
                card.fieldValues ||= {};
                card.fieldValues[field.id] = images;
            },
            field.image?.multiple ? Number.POSITIVE_INFINITY : 1,
        );
        return;
    }

    const section = createSection(container, field.label);
    if (field.description?.trim()) section.createDiv({ cls: 'setting-item-description', text: field.description.trim() });

    if (field.type === 'longText') {
        textareaField(section, 'Value', typeof value === 'string' ? value : '', next => setValue(next), field.placeholder || '', requiredMessage);
        return;
    }
    if (field.type === 'list') {
        stringListField(section, 'Items', Array.isArray(value) ? value as string[] : [], 'Add item', field.placeholder || '', values => setValue(values));
        return;
    }
    if (field.type === 'boolean') {
        const row = section.createEl('label', { cls: 'hi-words-file-field hi-words-file-checkbox-field' });
        const input = row.createEl('input', { type: 'checkbox' });
        input.checked = value === true;
        row.createSpan({ text: 'Enabled' });
        input.onchange = () => setValue(input.checked);
        return;
    }

    const input = textField(
        section,
        'Value',
        typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '',
        next => {
            if (field.type !== 'number') {
                setValue(next);
                return;
            }
            const numberValue = Number(next);
            setValue(next.trim() && Number.isFinite(numberValue) ? numberValue : undefined);
        },
        field.placeholder || '',
        requiredMessage
    );
    if (field.type === 'number') input.type = 'number';
    if (field.type === 'date') input.type = 'date';
    if (field.type === 'url') input.type = 'url';
}

function renderPersonCardEditor(container: HTMLElement, card: HiWordsPersonCard, callbacks: CardEditorCallbacks, module: HiWordsEditorModule): void {
    const data = card.data;
    switch (module) {
        case 'identity': {
            const section = createSection(container, 'Basic');
            const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
            textField(grid, 'Name', card.title, value => { card.title = value; callbacks.onWordChange(); }, '', 'Enter a name.');
            textField(grid, 'Aliases', (card.aliases || []).join(', '), value => { card.aliases = splitCommaValues(value); callbacks.onChange(); });
            textField(grid, 'Tags', (card.tags || []).join(', '), value => { card.tags = splitCommaValues(value); callbacks.onChange(); });
            textField(grid, 'Nationalities', (data.nationalities || []).join(', '), value => { data.nationalities = splitCommaValues(value); callbacks.onChange(); });
            textField(grid, 'Occupations', (data.occupations || []).join(', '), value => { data.occupations = splitCommaValues(value); callbacks.onChange(); });
            textField(grid, 'Born', data.birthDate || '', value => { data.birthDate = value || undefined; callbacks.onChange(); }, 'YYYY-MM-DD or descriptive date');
            textField(grid, 'Died', data.deathDate || '', value => { data.deathDate = value || undefined; callbacks.onChange(); }, 'YYYY-MM-DD or descriptive date');
            break;
        }
        case 'biography': {
            const section = createSection(container, 'Biography');
            const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
            textareaField(grid, 'Summary', data.summary, value => { data.summary = value; callbacks.onChange(); }, '', 'Add a short summary.');
            break;
        }
        case 'timeline': {
            const items = data.timeline || [];
            renderCollection(container, 'Timeline', 'Add event', items, callbacks,
            (): HiWordsTimelineEntry => ({ id: createStableId('event'), date: '', title: '' }),
            (row, item) => { textField(row, 'Date', item.date, value => item.date = value); textField(row, 'Title', item.title, value => item.title = value); textareaField(row, 'Description', item.description || '', value => item.description = value); },
            item => joinSummary(item.date, item.title), () => data.timeline = items); break;
        }
        case 'achievements': {
            const items = data.achievements || [];
            renderCollection(container, 'Achievements', 'Add achievement', items, callbacks,
            (): HiWordsAchievement => ({ id: createStableId('achievement'), title: '' }),
            (row, item) => { textField(row, 'Title', item.title, value => item.title = value); textareaField(row, 'Description', item.description || '', value => item.description = value); },
            item => item.title, () => data.achievements = items); break;
        }
        case 'works': {
            const items = data.works || [];
            renderCollection(container, 'Works', 'Add work', items, callbacks,
            (): HiWordsPersonWork => ({ id: createStableId('work'), title: '' }),
            (row, item) => { textField(row, 'Title', item.title, value => item.title = value); textField(row, 'Date', item.date || '', value => item.date = value); textareaField(row, 'Description', item.description || '', value => item.description = value); },
            item => joinSummary(item.title, item.date), () => data.works = items); break;
        }
        case 'personRelations': {
            const items = data.relations || [];
            renderCollection(container, 'Related people', 'Add relation', items, callbacks,
            (): HiWordsPersonRelation => ({ id: createStableId('relation'), type: 'related', target: '' }),
            (row, item) => { textField(row, 'Relationship', item.type, value => item.type = value); textField(row, 'Person', item.target, value => item.target = value); textField(row, 'Note', item.note || '', value => item.note = value); },
            item => joinSummary(item.type, item.target), () => data.relations = items); break;
        }
        case 'note': renderNote(container, card, callbacks); break;
        case 'images': renderImages(container, card, callbacks); break;
        case 'custom': renderCustomContent(container, card, callbacks); break;
    }
}

function renderConceptCardEditor(container: HTMLElement, card: HiWordsConceptCard, callbacks: CardEditorCallbacks, module: HiWordsEditorModule): void {
    const data = card.data;
    switch (module) {
        case 'identity': {
            const section = createSection(container, 'Basic');
            const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
            textField(grid, 'Concept', card.title, value => { card.title = value; callbacks.onWordChange(); }, '', 'Enter a concept name.');
            textField(grid, 'Domain', data.domain || '', value => { data.domain = value || undefined; callbacks.onChange(); });
            textField(grid, 'Aliases', (card.aliases || []).join(', '), value => { card.aliases = splitCommaValues(value); callbacks.onChange(); });
            textField(grid, 'Tags', (card.tags || []).join(', '), value => { card.tags = splitCommaValues(value); callbacks.onChange(); });
            break;
        }
        case 'definition': {
            const section = createSection(container, 'Definition');
            const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
            textareaField(grid, 'Definition', data.definition, value => { data.definition = value; callbacks.onChange(); }, '', 'Add a concise definition.');
            textareaField(grid, 'Explanation', data.explanation || '', value => { data.explanation = value || undefined; callbacks.onChange(); });
            break;
        }
        case 'principles': stringListField(container, 'Principles', data.principles || [], 'Add principle', 'Core idea', values => { data.principles = values; callbacks.onChange(); }); break;
        case 'misconceptions': stringListField(container, 'Misconceptions', data.misconceptions || [], 'Add misconception', 'Common misunderstanding', values => { data.misconceptions = values; callbacks.onChange(); }); break;
        case 'examples': {
            const items = data.examples || [];
            renderCollection(container, 'Examples', 'Add example', items, callbacks,
            (): HiWordsConceptExample => ({ id: createStableId('example'), content: '' }),
            (row, item) => { textField(row, 'Title', item.title || '', value => item.title = value); textareaField(row, 'Content', item.content, value => item.content = value); },
            item => joinSummary(item.title, item.content), () => data.examples = items); break;
        }
        case 'prerequisites': renderConceptReferences(container, 'Prerequisites', data.prerequisites || [], callbacks, values => data.prerequisites = values); break;
        case 'relatedConcepts': renderConceptReferences(container, 'Related concepts', data.relatedConcepts || [], callbacks, values => data.relatedConcepts = values); break;
        case 'note': renderNote(container, card, callbacks); break;
        case 'images': renderImages(container, card, callbacks); break;
        case 'custom': renderCustomContent(container, card, callbacks); break;
    }
}

function renderConceptReferences(container: HTMLElement, title: string, items: HiWordsCardReference[], callbacks: CardEditorCallbacks, assign: (items: HiWordsCardReference[]) => void): void {
    renderCollection(container, title, `Add ${title.toLowerCase().replace(/s$/, '')}`, items, callbacks,
        (): HiWordsCardReference => ({ id: createStableId('reference'), target: '' }),
        (row, item) => { textField(row, 'Concept', item.target, value => item.target = value); textField(row, 'Note', item.note || '', value => item.note = value); },
        item => joinSummary(item.target, item.note), () => assign(items));
}

function renderWord(container: HTMLElement, pack: HiWordsPack, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Basic');
    const grid = section.createDiv({ cls: 'hi-words-file-form-grid' });
    textField(grid, 'Headword', card.title, value => { card.title = value; callbacks.onWordChange(); }, '', 'Enter a word or phrase.');
    selectField(grid, 'Type', card.data.itemType, ['word', 'phrase', 'concept', 'term'], value => {
        card.data.itemType = normalizeLearningItemType(value);
        callbacks.onChange();
    });
    textField(grid, 'Language', card.data.language, value => {
        card.data.language = value.trim();
        callbacks.onChange();
    }, 'en');
    textField(grid, 'Aliases', (card.aliases || []).join(', '), value => { card.aliases = splitCommaValues(value); callbacks.onChange(); }, 'Spelling variants only');
    textField(grid, 'US pronunciation', card.data.phonetics?.us || '', value => {
        card.data.phonetics = { ...(card.data.phonetics || {}), us: value };
        callbacks.onChange();
    });
    textField(grid, 'UK pronunciation', card.data.phonetics?.uk || '', value => {
        card.data.phonetics = { ...(card.data.phonetics || {}), uk: value };
        callbacks.onChange();
    });
}

function renderMeanings(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Definitions', 'Add meaning', () => {
        card.data.meanings.push(createEmptyMeaning(card.id));
        callbacks.onStructureChange();
    });
    card.data.meanings.forEach((meaning, meaningIndex) => {
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
        remove.disabled = card.data.meanings.length <= 1;
        remove.onclick = () => {
            if (card.data.meanings.length <= 1) return;
            card.data.meanings.splice(meaningIndex, 1);
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
        meaning.partOfSpeech = normalizeHiWordsPartOfSpeech(meaning.partOfSpeech);
        selectField(grid, 'Part of speech', meaning.partOfSpeech, partOfSpeechOptions(), value => {
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

function renderSentences(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.sentences || [];
    renderCollection(container, 'Examples', 'Add sentence', items, callbacks, (): HiWordsSentence => ({
        id: createStableId('sentence'),
        text: '',
        translation: '',
    }), (row, item) => {
        row.addClass('hi-words-file-sentence-fields');
        textareaField(row, 'Sentence', item.text, value => item.text = value);
        textareaField(row, 'Translation', item.translation || '', value => item.translation = value);
        textField(row, 'Source', item.source || '', value => item.source = value, 'Optional vault path or source');
    }, item => joinSummary(item.text, item.translation), () => card.data.sentences = items);
}

function renderForms(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.forms || [];
    renderCollection(container, 'Word forms', 'Add form', items, callbacks, (): HiWordsForm => ({ form: '', type: '' }), (row, item) => {
        textField(row, 'Form', item.form, value => item.form = value);
        textField(row, 'Type', item.type, value => item.type = value, 'past, plural…');
    }, item => joinSummary(item.form, item.type), () => card.data.forms = items);
}

function renderDerivedWords(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.derivedWords || [];
    renderCollection(container, 'Derived words', 'Add derived word', items, callbacks, (): HiWordsDerivedWord => ({ word: '' }), (row, item) => {
        textField(row, 'Word', item.word, value => item.word = value);
        if (item.partOfSpeech) item.partOfSpeech = normalizeHiWordsPartOfSpeech(item.partOfSpeech);
        selectField(row, 'Part of speech', item.partOfSpeech || 'noun', partOfSpeechOptions(), value => item.partOfSpeech = value);
        textField(row, 'Meaning', item.meaning || '', value => item.meaning = value);
    }, item => joinSummary(item.word, abbreviatePartOfSpeech(item.partOfSpeech || ''), item.meaning), () => card.data.derivedWords = items);
}

function renderMorphology(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Morphology');
    const components = card.data.morphology?.components || [];
    const componentsSection = renderCollection(section, 'Components', 'Add component', components, callbacks,
        (): HiWordsMorphologyComponent => ({ type: 'root', form: '' }),
        (row, item) => {
            selectField(row, 'Type', item.type, morphologyComponentTypes(item.type), value => item.type = value);
            textField(row, 'Form', item.form, value => item.form = value, 'Example: access or -ible');
            textField(row, 'Meaning', item.meaning || '', value => item.meaning = value);
        },
        item => joinSummary(humanize(item.type), item.form, item.meaning),
        () => {
            card.data.morphology = { ...(card.data.morphology || {}), components };
        },
    );
    componentsSection.addClass('hi-words-file-editor-subsection');
    textareaField(section, 'Explanation', card.data.morphology?.explanation || '', value => {
        card.data.morphology = { ...(card.data.morphology || {}), explanation: value };
        callbacks.onChange();
    });
}

function renderPhrases(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.phrases || [];
    renderCollection(container, 'Phrases', 'Add phrase', items, callbacks, (): HiWordsPhrase => ({ id: createStableId('phrase'), text: '' }), (row, item) => {
        row.addClass('hi-words-file-phrase-fields');
        textField(row, 'Phrase', item.text, value => item.text = value);
        translationField(row, item.translation || '', value => item.translation = value);
        textareaField(row, 'Sentence', item.sentence || '', value => item.sentence = value);
    }, item => joinSummary(item.text, item.translation), () => card.data.phrases = items);
}

function renderUsage(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const section = createSection(container, 'Usage');
    textField(section, 'Register', (card.data.usage?.register || []).join(', '), value => { card.data.usage = { ...(card.data.usage || {}), register: splitCommaValues(value) }; callbacks.onChange(); }, 'neutral, formal, informal…');
    stringListField(section, 'Patterns', card.data.usage?.patterns || [], 'Add pattern', 'Example: be accessible to + person', values => {
        card.data.usage = { ...(card.data.usage || {}), patterns: values };
        callbacks.onChange();
    });
    stringListField(section, 'Notes', card.data.usage?.notes || [], 'Add note', 'Add a short usage note', values => {
        card.data.usage = { ...(card.data.usage || {}), notes: values };
        callbacks.onChange();
    });
    stringListField(section, 'Common mistakes', card.data.usage?.commonMistakes || [], 'Add mistake', 'Describe one common mistake', values => {
        card.data.usage = { ...(card.data.usage || {}), commonMistakes: values };
        callbacks.onChange();
    });
}

function renderRelations(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.relations || [];
    renderCollection(container, 'Related words', 'Add relation', items, callbacks, (): HiWordsRelation => ({ type: 'related', target: '' }), (row, item) => {
        selectField(row, 'Relation', item.type, ['synonym', 'antonym', 'confusable', 'related'], value => item.type = value);
        textField(row, 'Word', item.target, value => item.target = value);
        textField(row, 'Difference or note', item.note || '', value => item.note = value);
    }, item => joinSummary(humanize(item.type), item.target, item.note), () => card.data.relations = items);
}

function renderMemory(container: HTMLElement, card: HiWordsWordCard, callbacks: CardEditorCallbacks): void {
    const items = card.data.memory || [];
    renderCollection(container, 'Memory', 'Add memory note', items, callbacks, (): HiWordsMemoryItem => ({ type: 'note', text: '' }), (row, item) => {
        row.addClass('hi-words-file-memory-fields');
        textField(row, 'Type', item.type, value => item.type = value, 'note, mnemonic…');
        textareaField(row, 'Content', item.text, value => item.text = value);
    }, item => joinSummary(humanize(item.type), item.text), () => card.data.memory = items);
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
    renderImageCollection(container, 'Images', items, callbacks, () => card.images = items);
}

function renderImageCollection(
    container: HTMLElement,
    title: string,
    items: HiWordsImage[],
    callbacks: CardEditorCallbacks,
    ensureItems: () => void,
    maxItems = Number.POSITIVE_INFINITY,
): void {
    renderCollection(container, title, 'Add image', items, callbacks, (): HiWordsImage => ({ path: '' }), (row, item) => {
        textField(row, 'Vault path', item.path, value => item.path = value);
        textField(row, 'Alternative text', item.alt || '', value => item.alt = value);
        textField(row, 'Caption', item.caption || '', value => item.caption = value);
        textField(row, 'Source', item.source || '', value => item.source = value, 'Optional source or attribution');
    }, item => joinSummary(item.caption || item.alt, item.path), ensureItems, maxItems);
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

function renderCollection<T>(container: HTMLElement, title: string, addLabel: string, items: T[], callbacks: CardEditorCallbacks, createItem: () => T, renderFields: (container: HTMLElement, item: T) => void, getSummary: (item: T) => string, ensureItems?: () => void, maxItems = Number.POSITIVE_INFINITY): HTMLElement {
    const addItem = () => {
        if (items.length >= maxItems) return;
        ensureItems?.();
        items.push(createItem());
        callbacks.onStructureChange();
    };
    const section = createSection(container, title, items.length < maxItems ? addLabel : undefined, items.length < maxItems ? addItem : undefined);
    if (items.length === 0) {
        section.querySelector('.hi-words-file-editor-section-header .hi-words-file-text-button')?.remove();
        const emptyAction = section.createEl('button', {
            cls: 'hi-words-file-empty-state',
            attr: { type: 'button' },
        });
        setIcon(emptyAction.createSpan(), 'plus');
        emptyAction.createSpan({ text: addLabel });
        emptyAction.onclick = addItem;
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

function partOfSpeechOptions(): string[] {
    return [...HIWORDS_PARTS_OF_SPEECH];
}

function morphologyComponentTypes(current?: string): string[] {
    return Array.from(new Set([current || '', 'root', 'prefix', 'suffix', 'base', 'other'].filter(Boolean)));
}
