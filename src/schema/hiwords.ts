export const HIWORDS_SCHEMA = 'hiwords' as const;
export const HIWORDS_SCHEMA_VERSION = 2 as const;
export const WORD_CARD_KIND = 'language.word' as const;
export const PERSON_CARD_KIND = 'knowledge.person' as const;
export const CONCEPT_CARD_KIND = 'knowledge.concept' as const;
export const CUSTOM_CARD_KIND = 'knowledge.custom' as const;

export const HIWORDS_PARTS_OF_SPEECH = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
    'conjunction', 'determiner', 'interjection', 'auxiliary', 'modal', 'phrase',
] as const;

export type HiWordsCardKind = typeof WORD_CARD_KIND | typeof PERSON_CARD_KIND | typeof CONCEPT_CARD_KIND | typeof CUSTOM_CARD_KIND;

export type HiWordsFieldType = 'text' | 'longText' | 'number' | 'date' | 'boolean' | 'list' | 'url' | 'image';
export type HiWordsImageDisplayMode = 'cover' | 'gallery';
export type HiWordsImageAspectRatio = 'original' | '16:9' | '1:1' | '3:4';
export type HiWordsImageFit = 'cover' | 'contain';

export interface HiWordsImageFieldOptions {
    multiple?: boolean;
    displayMode?: HiWordsImageDisplayMode;
    aspectRatio?: HiWordsImageAspectRatio;
    fit?: HiWordsImageFit;
}

export type HiWordsFieldValue = string | number | boolean | string[] | HiWordsImage[];

export interface HiWordsFieldDefinition {
    id: string;
    label: string;
    type: HiWordsFieldType;
    description?: string;
    placeholder?: string;
    required?: boolean;
    searchable?: boolean;
    previewByDefault?: boolean;
    image?: HiWordsImageFieldOptions;
}

export interface HiWordsPack {
    schema: typeof HIWORDS_SCHEMA;
    schemaVersion: typeof HIWORDS_SCHEMA_VERSION;
    id: string;
    title: string;
    cardKind: HiWordsCardKind;
    cardKindVersion: 1;
    fields?: HiWordsFieldDefinition[];
    display?: { moduleOrder?: string[] };
    cards: HiWordsCard[];
}

export interface HiWordsNote { text: string; }
export interface HiWordsImage { path: string; alt?: string; caption?: string; source?: string; }
export interface HiWordsCustomSection { id: string; title: string; content: string; }

export interface HiWordsCardBase {
    id: string;
    title: string;
    aliases?: string[];
    tags?: string[];
    note?: HiWordsNote;
    images?: HiWordsImage[];
    customSections?: HiWordsCustomSection[];
    fieldValues?: Record<string, HiWordsFieldValue>;
}

export interface HiWordsPhonetics { us?: string; uk?: string; }
export interface HiWordsSentence { id: string; text: string; translation?: string; source?: string; }
export interface HiWordsMeaning { id: string; partOfSpeech: string; translation: string; definition: string; }
export interface HiWordsForm { form: string; type: string; }
export interface HiWordsDerivedWord { word: string; partOfSpeech?: string; meaning?: string; }
export interface HiWordsMorphologyComponent { type: string; form: string; meaning?: string; }
export interface HiWordsMorphology { components?: HiWordsMorphologyComponent[]; explanation?: string; }
export interface HiWordsPhrase { id: string; text: string; translation?: string; sentence?: string; }
export interface HiWordsUsage { register?: string[]; patterns?: string[]; notes?: string[]; commonMistakes?: string[]; }
export interface HiWordsRelation { type: string; target: string; note?: string; }
export interface HiWordsMemoryItem { type: string; text: string; }

export interface HiWordsWordCardData {
    language: string;
    itemType: 'word' | 'phrase' | 'term';
    phonetics?: HiWordsPhonetics;
    meanings: HiWordsMeaning[];
    sentences?: HiWordsSentence[];
    forms?: HiWordsForm[];
    derivedWords?: HiWordsDerivedWord[];
    morphology?: HiWordsMorphology;
    phrases?: HiWordsPhrase[];
    usage?: HiWordsUsage;
    relations?: HiWordsRelation[];
    memory?: HiWordsMemoryItem[];
}

export interface HiWordsWordCard extends HiWordsCardBase {
    data: HiWordsWordCardData;
}

export interface HiWordsTimelineEntry { id: string; date: string; title: string; description?: string; }
export interface HiWordsAchievement { id: string; title: string; description?: string; }
export interface HiWordsPersonWork { id: string; title: string; date?: string; description?: string; }
export interface HiWordsPersonRelation { id: string; type: string; target: string; note?: string; }

export interface HiWordsPersonCardData {
    summary: string;
    birthDate?: string;
    deathDate?: string;
    nationalities?: string[];
    occupations?: string[];
    timeline?: HiWordsTimelineEntry[];
    achievements?: HiWordsAchievement[];
    works?: HiWordsPersonWork[];
    relations?: HiWordsPersonRelation[];
}

export interface HiWordsPersonCard extends HiWordsCardBase {
    data: HiWordsPersonCardData;
}

export interface HiWordsConceptExample { id: string; title?: string; content: string; }
export interface HiWordsCardReference { id: string; target: string; note?: string; }

export interface HiWordsConceptCardData {
    domain?: string;
    definition: string;
    explanation?: string;
    principles?: string[];
    examples?: HiWordsConceptExample[];
    misconceptions?: string[];
    prerequisites?: HiWordsCardReference[];
    relatedConcepts?: HiWordsCardReference[];
}

export interface HiWordsConceptCard extends HiWordsCardBase {
    data: HiWordsConceptCardData;
}

export type HiWordsCustomCardData = Record<string, unknown>;

export interface HiWordsCustomCard extends HiWordsCardBase {
    data: HiWordsCustomCardData;
}

export type HiWordsCard = HiWordsWordCard | HiWordsPersonCard | HiWordsConceptCard | HiWordsCustomCard;

export interface HiWordsValidationIssue { cardId?: string; path: string; message: string; }

export function normalizeHiWordsPartOfSpeech(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    const aliases: Record<string, string> = {
        'noun phrase': 'noun',
        'verb phrase': 'verb',
        'phrasal verb': 'verb',
        'modal verb': 'modal',
        'auxiliary verb': 'auxiliary',
        article: 'determiner',
        'n.': 'noun',
        'v.': 'verb',
        'adj.': 'adjective',
        'adv.': 'adverb',
        'pron.': 'pronoun',
        'prep.': 'preposition',
        'conj.': 'conjunction',
        'det.': 'determiner',
        'interj.': 'interjection',
        'aux.': 'auxiliary',
        'phr.': 'phrase',
    };
    const candidate = aliases[normalized] || normalized;
    return (HIWORDS_PARTS_OF_SPEECH as readonly string[]).includes(candidate) ? candidate : 'phrase';
}

export function normalizeHiWordsPack(value: unknown): unknown {
    if (!isRecord(value) || !Array.isArray(value.cards)) return value;
    value.cards.forEach(card => {
        if (!isRecord(card) || !isRecord(card.data)) return;
        delete card.data.highlightable;
        if (value.cardKind !== WORD_CARD_KIND) return;
        if (Array.isArray(card.data.meanings)) {
            card.data.meanings.forEach(meaning => {
                if (!isRecord(meaning) || typeof meaning.partOfSpeech !== 'string') return;
                meaning.partOfSpeech = normalizeHiWordsPartOfSpeech(meaning.partOfSpeech);
            });
        }
        if (Array.isArray(card.data.derivedWords)) {
            card.data.derivedWords.forEach(derivedWord => {
                if (!isRecord(derivedWord) || typeof derivedWord.partOfSpeech !== 'string' || !derivedWord.partOfSpeech.trim()) return;
                derivedWord.partOfSpeech = normalizeHiWordsPartOfSpeech(derivedWord.partOfSpeech);
            });
        }
    });
    return value;
}

export function isHiWordsPack(value: unknown): value is HiWordsPack {
    return isRecord(value) && value.schema === HIWORDS_SCHEMA && value.schemaVersion === HIWORDS_SCHEMA_VERSION &&
        typeof value.id === 'string' && typeof value.title === 'string' && isHiWordsCardKind(value.cardKind) && value.cardKindVersion === 1 &&
        isOptionalFieldDefinitions(value.fields) && isOptionalPackDisplay(value.display) &&
        Array.isArray(value.cards) && value.cards.every(card =>
            isHiWordsCard(card, value.cardKind as HiWordsCardKind) &&
            (value.fields as HiWordsFieldDefinition[] | undefined || []).every(field =>
                isFieldValueCompatible(card.fieldValues?.[field.id], field.type)));
}

function isFieldValueCompatible(value: unknown, type: HiWordsFieldType): boolean {
    if (value === undefined) return true;
    if (type === 'image') return Array.isArray(value) && value.every(item => isRecord(item) && isImage(item));
    if (type === 'list') return Array.isArray(value) && value.every(item => typeof item === 'string');
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'boolean') return typeof value === 'boolean';
    return typeof value === 'string';
}

export function isHiWordsCard(value: unknown, kind: HiWordsCardKind): value is HiWordsCard {
    if (!isRecord(value) || !isCardBase(value) || !isRecord(value.data)) return false;
    if (kind === WORD_CARD_KIND) return isWordData(value.data);
    if (kind === PERSON_CARD_KIND) return isPersonData(value.data);
    if (kind === CONCEPT_CARD_KIND) return isConceptData(value.data);
    if (kind === CUSTOM_CARD_KIND) return isCustomData(value.data);
    return false;
}

export function isWordCard(card: HiWordsCard, kind: HiWordsCardKind): card is HiWordsWordCard { return kind === WORD_CARD_KIND; }
export function isPersonCard(card: HiWordsCard, kind: HiWordsCardKind): card is HiWordsPersonCard { return kind === PERSON_CARD_KIND; }
export function isConceptCard(card: HiWordsCard, kind: HiWordsCardKind): card is HiWordsConceptCard { return kind === CONCEPT_CARD_KIND; }
export function isCustomCard(card: HiWordsCard, kind: HiWordsCardKind): card is HiWordsCustomCard { return kind === CUSTOM_CARD_KIND; }

export function validateHiWordsPack(pack: HiWordsPack): HiWordsValidationIssue[] {
    const issues: HiWordsValidationIssue[] = [];
    if (!pack.id.trim()) issues.push({ path: 'id', message: 'The collection needs a stable ID.' });
    if (!pack.title.trim()) issues.push({ path: 'title', message: 'The collection needs a title.' });
    const fieldIds = new Set<string>();
    const fieldLabels = new Set<string>();
    for (const [index, field] of (pack.fields || []).entries()) {
        if (!field.id.trim() || fieldIds.has(field.id)) issues.push({ path: `fields[${index}].id`, message: 'Each custom field needs a unique stable ID.' });
        else fieldIds.add(field.id);
        if (!field.label.trim()) issues.push({ path: `fields[${index}].label`, message: 'Each custom field needs a label.' });
        const normalizedLabel = field.label.trim().toLocaleLowerCase();
        if (normalizedLabel && fieldLabels.has(normalizedLabel)) issues.push({ path: `fields[${index}].label`, message: 'Each custom field needs a unique label.' });
        else if (normalizedLabel) fieldLabels.add(normalizedLabel);
    }
    const ids = new Set<string>();
    pack.cards.forEach((card, index) => {
        const base = `cards[${index}]`;
        if (!card.id.trim() || ids.has(card.id)) issues.push({ cardId: card.id, path: `${base}.id`, message: 'Each card needs a unique stable ID.' });
        else ids.add(card.id);
        if (!card.title.trim()) issues.push({ cardId: card.id, path: `${base}.title`, message: 'The card title cannot be empty.' });
        if (isWordCard(card, pack.cardKind) && (!card.data.meanings.length || !card.data.meanings.some(item => item.translation.trim() || item.definition.trim()))) {
            issues.push({ cardId: card.id, path: `${base}.data.meanings`, message: 'Add at least one meaning.' });
        }
        if (isPersonCard(card, pack.cardKind) && !card.data.summary.trim()) issues.push({ cardId: card.id, path: `${base}.data.summary`, message: 'Add a short person summary.' });
        if (isConceptCard(card, pack.cardKind) && !card.data.definition.trim()) issues.push({ cardId: card.id, path: `${base}.data.definition`, message: 'Add a concept definition.' });
        for (const field of pack.fields || []) {
            if (field.required && isFieldValueEmpty(card.fieldValues?.[field.id])) {
                issues.push({ cardId: card.id, path: `${base}.fieldValues.${field.id}`, message: `Add a value for “${field.label}”.` });
            }
        }
    });
    return issues;
}

function isCardBase(value: Record<string, unknown>): boolean {
    return typeof value.id === 'string' && typeof value.title === 'string' &&
        isOptionalStringArray(value.aliases) && isOptionalStringArray(value.tags) && isOptionalNote(value.note) &&
        isOptionalRecordArray(value.images, isImage) &&
        isOptionalRecordArray(value.customSections, item => typeof item.id === 'string' && typeof item.title === 'string' && typeof item.content === 'string') &&
        isOptionalFieldValues(value.fieldValues);
}

function isWordData(value: Record<string, unknown>): boolean {
    return typeof value.language === 'string' && (value.itemType === 'word' || value.itemType === 'phrase' || value.itemType === 'term') &&
        isOptionalStringRecord(value.phonetics) && Array.isArray(value.meanings) && value.meanings.every(isMeaning) &&
        isOptionalRecordArray(value.sentences, item => typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.translation) && isOptionalString(item.source)) &&
        isOptionalRecordArray(value.forms, item => typeof item.form === 'string' && typeof item.type === 'string') &&
        isOptionalRecordArray(value.derivedWords, item => typeof item.word === 'string' && isOptionalString(item.partOfSpeech) && isOptionalString(item.meaning)) &&
        isOptionalMorphology(value.morphology) &&
        isOptionalRecordArray(value.phrases, item => typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.translation) && isOptionalString(item.sentence)) &&
        isOptionalUsage(value.usage) &&
        isOptionalRecordArray(value.relations, item => typeof item.type === 'string' && typeof item.target === 'string' && isOptionalString(item.note)) &&
        isOptionalRecordArray(value.memory, item => typeof item.type === 'string' && typeof item.text === 'string');
}

function isPersonData(value: Record<string, unknown>): boolean {
    return typeof value.summary === 'string' && isOptionalString(value.birthDate) && isOptionalString(value.deathDate) &&
        isOptionalStringArray(value.nationalities) && isOptionalStringArray(value.occupations) &&
        isOptionalRecordArray(value.timeline, item => typeof item.id === 'string' && typeof item.date === 'string' && typeof item.title === 'string' && isOptionalString(item.description)) &&
        isOptionalRecordArray(value.achievements, item => typeof item.id === 'string' && typeof item.title === 'string' && isOptionalString(item.description)) &&
        isOptionalRecordArray(value.works, item => typeof item.id === 'string' && typeof item.title === 'string' && isOptionalString(item.date) && isOptionalString(item.description)) &&
        isOptionalRecordArray(value.relations, item => typeof item.id === 'string' && typeof item.type === 'string' && typeof item.target === 'string' && isOptionalString(item.note));
}

function isConceptData(value: Record<string, unknown>): boolean {
    return typeof value.definition === 'string' && isOptionalString(value.domain) && isOptionalString(value.explanation) &&
        isOptionalStringArray(value.principles) && isOptionalStringArray(value.misconceptions) &&
        isOptionalRecordArray(value.examples, item => typeof item.id === 'string' && isOptionalString(item.title) && typeof item.content === 'string') &&
        isOptionalRecordArray(value.prerequisites, isReference) && isOptionalRecordArray(value.relatedConcepts, isReference);
}

function isCustomData(_value: Record<string, unknown>): boolean { return true; }

function isMeaning(value: unknown): boolean {
    return isRecord(value) && typeof value.id === 'string' && typeof value.partOfSpeech === 'string' && typeof value.translation === 'string' && typeof value.definition === 'string';
}
function isImage(value: Record<string, unknown>): boolean { return typeof value.path === 'string' && isOptionalString(value.alt) && isOptionalString(value.caption) && isOptionalString(value.source); }
function isReference(value: Record<string, unknown>): boolean { return typeof value.id === 'string' && typeof value.target === 'string' && isOptionalString(value.note); }
function isOptionalMorphology(value: unknown): boolean { return value === undefined || (isRecord(value) && isOptionalString(value.explanation) && isOptionalRecordArray(value.components, item => typeof item.type === 'string' && typeof item.form === 'string' && isOptionalString(item.meaning))); }
function isOptionalUsage(value: unknown): boolean { return value === undefined || (isRecord(value) && isOptionalStringArray(value.register) && isOptionalStringArray(value.patterns) && isOptionalStringArray(value.notes) && isOptionalStringArray(value.commonMistakes)); }
function isOptionalNote(value: unknown): boolean { return value === undefined || (isRecord(value) && typeof value.text === 'string'); }
function isOptionalPackDisplay(value: unknown): boolean { return value === undefined || (isRecord(value) && (value.moduleOrder === undefined || (Array.isArray(value.moduleOrder) && value.moduleOrder.every(entry => typeof entry === 'string')))); }
function isOptionalFieldDefinitions(value: unknown): boolean {
    return value === undefined || (Array.isArray(value) && value.every(item => isRecord(item) &&
        typeof item.id === 'string' && typeof item.label === 'string' && isHiWordsFieldType(item.type) &&
        isOptionalString(item.description) && isOptionalString(item.placeholder) && isOptionalBoolean(item.required) &&
        isOptionalBoolean(item.searchable) && isOptionalBoolean(item.previewByDefault) && isOptionalImageFieldOptions(item.image)));
}
function isOptionalFieldValues(value: unknown): boolean {
    return value === undefined || (isRecord(value) && Object.values(value).every(item =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ||
        (Array.isArray(item) && (item.every(entry => typeof entry === 'string') || item.every(entry => isRecord(entry) && isImage(entry))))));
}
function isFieldValueEmpty(value: HiWordsFieldValue | undefined): boolean {
    if (value === undefined) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return !value.some(item => typeof item === 'string' ? Boolean(item.trim()) : Boolean(item.path.trim()));
    return false;
}
function isOptionalImageFieldOptions(value: unknown): boolean {
    return value === undefined || (isRecord(value) && isOptionalBoolean(value.multiple) &&
        (value.displayMode === undefined || value.displayMode === 'cover' || value.displayMode === 'gallery') &&
        (value.aspectRatio === undefined || value.aspectRatio === 'original' || value.aspectRatio === '16:9' || value.aspectRatio === '1:1' || value.aspectRatio === '3:4') &&
        (value.fit === undefined || value.fit === 'cover' || value.fit === 'contain'));
}
function isHiWordsFieldType(value: unknown): value is HiWordsFieldType { return value === 'text' || value === 'longText' || value === 'number' || value === 'date' || value === 'boolean' || value === 'list' || value === 'url' || value === 'image'; }
function isHiWordsCardKind(value: unknown): value is HiWordsCardKind { return value === WORD_CARD_KIND || value === PERSON_CARD_KIND || value === CONCEPT_CARD_KIND || value === CUSTOM_CARD_KIND; }
function isOptionalRecordArray(value: unknown, predicate: (item: Record<string, unknown>) => boolean): boolean { return value === undefined || (Array.isArray(value) && value.every(item => isRecord(item) && predicate(item))); }
function isOptionalString(value: unknown): boolean { return value === undefined || typeof value === 'string'; }
function isOptionalBoolean(value: unknown): boolean { return value === undefined || typeof value === 'boolean'; }
function isOptionalStringArray(value: unknown): boolean { return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string')); }
function isOptionalStringRecord(value: unknown): boolean { return value === undefined || (isRecord(value) && Object.values(value).every(item => typeof item === 'string')); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
