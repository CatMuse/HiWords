export const HIWORDS_SCHEMA = 'hiwords' as const;
export const HIWORDS_SCHEMA_VERSION = 1 as const;
export type HiWordsCardType = 'word' | 'phrase' | 'concept' | 'term';

export type HiWordsModuleId =
    | 'word'
    | 'meanings'
    | 'sentences'
    | 'derivedWords'
    | 'morphology'
    | 'phrases'
    | 'usage'
    | 'relations'
    | 'memory'
    | 'note'
    | 'forms'
    | 'images'
    | 'custom';

export interface HiWordsCustomSection {
    id: string;
    title: string;
    content: string;
}

export interface HiWordsPack {
    schema: typeof HIWORDS_SCHEMA;
    schemaVersion: typeof HIWORDS_SCHEMA_VERSION;
    id: string;
    title: string;
    language: string;
    display?: {
        moduleOrder?: HiWordsModuleId[];
    };
    cards: HiWordsCard[];
}

export interface HiWordsPhonetics {
    us?: string;
    uk?: string;
}

export interface HiWordsSentence {
    id: string;
    text: string;
    translation?: string;
    source?: string;
}

export interface HiWordsNote {
    text: string;
}

export interface HiWordsMeaning {
    id: string;
    partOfSpeech: string;
    translation: string;
    definition: string;
}

export interface HiWordsForm {
    form: string;
    type: string;
}

export interface HiWordsDerivedWord {
    word: string;
    partOfSpeech?: string;
    meaning?: string;
}

export interface HiWordsMorphologyComponent {
    type: string;
    form: string;
    meaning?: string;
}

export interface HiWordsMorphology {
    components?: HiWordsMorphologyComponent[];
    explanation?: string;
}

export interface HiWordsPhrase {
    id: string;
    text: string;
    translation?: string;
    sentence?: string;
}

export interface HiWordsUsage {
    register?: string[];
    patterns?: string[];
    notes?: string[];
    commonMistakes?: string[];
}

export interface HiWordsRelation {
    type: 'synonym' | 'antonym' | 'confusable' | 'related' | string;
    target: string;
    note?: string;
}

export interface HiWordsMemoryItem {
    type: string;
    text: string;
}

export interface HiWordsImage {
    path: string;
    alt?: string;
    caption?: string;
    source?: string;
}

export interface HiWordsCard {
    id: string;
    word: string;
    type: HiWordsCardType;
    language?: string;
    aliases?: string[];
    phonetics?: HiWordsPhonetics;
    meanings: HiWordsMeaning[];
    sentences?: HiWordsSentence[];
    note?: HiWordsNote;
    forms?: HiWordsForm[];
    derivedWords?: HiWordsDerivedWord[];
    morphology?: HiWordsMorphology;
    phrases?: HiWordsPhrase[];
    usage?: HiWordsUsage;
    relations?: HiWordsRelation[];
    memory?: HiWordsMemoryItem[];
    images?: HiWordsImage[];
    customSections?: HiWordsCustomSection[];
}

export interface HiWordsValidationIssue {
    cardId?: string;
    path: string;
    message: string;
}

/**
 * Removes fields retired by the current editable schema before validation.
 * This is deliberately limited to the recent schema cleanup and is not a V2
 * vocabulary converter.
 */
export function normalizeHiWordsPack(value: unknown): unknown {
    if (!isRecord(value) || value.schema !== HIWORDS_SCHEMA || value.schemaVersion !== HIWORDS_SCHEMA_VERSION) return value;

    const pack = value;
    const legacyMetadata = isRecord(pack.metadata) ? pack.metadata : undefined;
    const legacyModuleOrder = legacyMetadata?.editorModuleOrder;
    if (pack.display === undefined && Array.isArray(legacyModuleOrder)) {
        pack.display = { moduleOrder: legacyModuleOrder.filter(isHiWordsModuleId) };
    }
    delete pack.contentVersion;
    delete pack.metadata;

    if (!Array.isArray(pack.cards)) return pack;
    for (const rawCard of pack.cards) {
        if (!isRecord(rawCard)) continue;
        delete rawCard.revision;
        delete rawCard.audio;
        delete rawCard.color;
        if (rawCard.language === pack.language || rawCard.language === null || rawCard.language === '') delete rawCard.language;

        deleteNullOptionalFields(rawCard, [
            'aliases', 'phonetics', 'sentences', 'note', 'forms', 'derivedWords',
            'morphology', 'phrases', 'usage', 'relations', 'memory', 'images',
            'customSections',
        ]);

        for (const sentence of recordItems(rawCard.sentences)) delete sentence.createdAt;
        if (isRecord(rawCard.note)) delete rawCard.note.updatedAt;
        for (const form of recordItems(rawCard.forms)) delete form.note;
        for (const memory of recordItems(rawCard.memory)) delete memory.source;
        for (const image of recordItems(rawCard.images)) delete image.license;
        for (const phrase of recordItems(rawCard.phrases)) {
            if ((!isOptionalString(phrase.translation) || !String(phrase.translation || '').trim()) && typeof phrase.meaning === 'string') {
                phrase.translation = phrase.meaning.trim();
            }
            delete phrase.meaning;
        }
        if (isRecord(rawCard.morphology)) {
            if (rawCard.morphology.explanation === undefined && typeof rawCard.morphology.note === 'string') {
                rawCard.morphology.explanation = rawCard.morphology.note;
            }
            delete rawCard.morphology.breakdown;
            delete rawCard.morphology.note;
        }
    }
    return pack;
}

export function isHiWordsPack(value: unknown): value is HiWordsPack {
    if (!isRecord(value)) return false;
    return value.schema === HIWORDS_SCHEMA &&
        value.schemaVersion === HIWORDS_SCHEMA_VERSION &&
        value.customModules === undefined &&
        value.contentVersion === undefined &&
        value.metadata === undefined &&
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.language === 'string' &&
        isOptionalDisplay(value.display) &&
        Array.isArray(value.cards) &&
        value.cards.every(isHiWordsCard);
}

export function isHiWordsCard(value: unknown): value is HiWordsCard {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string' &&
        value.custom === undefined &&
        value.audio === undefined &&
        value.color === undefined &&
        value.revision === undefined &&
        typeof value.word === 'string' &&
        isLearningItemType(value.type) &&
        isOptionalString(value.language) &&
        isOptionalStringArray(value.aliases) &&
        isOptionalStringRecord(value.phonetics) &&
        Array.isArray(value.meanings) &&
        value.meanings.every(isHiWordsMeaning) &&
        isOptionalRecordArray(value.sentences, item => item.createdAt === undefined && typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.translation) && isOptionalString(item.source)) &&
        (value.note === undefined || (isRecord(value.note) && value.note.updatedAt === undefined && typeof value.note.text === 'string')) &&
        isOptionalRecordArray(value.forms, item => item.note === undefined && typeof item.form === 'string' && typeof item.type === 'string') &&
        isOptionalRecordArray(value.derivedWords, item => typeof item.word === 'string' && isOptionalString(item.partOfSpeech) && isOptionalString(item.meaning)) &&
        isOptionalMorphology(value.morphology) &&
        isOptionalRecordArray(value.phrases, item => item.meaning === undefined && typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.translation) && isOptionalString(item.sentence)) &&
        isOptionalUsage(value.usage) &&
        isOptionalRecordArray(value.relations, item => typeof item.type === 'string' && typeof item.target === 'string' && isOptionalString(item.note)) &&
        isOptionalRecordArray(value.memory, item => item.source === undefined && typeof item.type === 'string' && typeof item.text === 'string') &&
        isOptionalRecordArray(value.images, item => item.license === undefined && typeof item.path === 'string' && isOptionalString(item.alt) && isOptionalString(item.caption) && isOptionalString(item.source)) &&
        isOptionalRecordArray(value.customSections, item => typeof item.id === 'string' && typeof item.title === 'string' && typeof item.content === 'string');
}

export function validateHiWordsPack(pack: HiWordsPack): HiWordsValidationIssue[] {
    const issues: HiWordsValidationIssue[] = [];
    if (pack.schema !== HIWORDS_SCHEMA) issues.push({ path: 'schema', message: `Schema must be “${HIWORDS_SCHEMA}”.` });
    if (pack.schemaVersion !== HIWORDS_SCHEMA_VERSION) issues.push({ path: 'schemaVersion', message: `Schema version must be ${HIWORDS_SCHEMA_VERSION}.` });
    if (!pack.id.trim()) issues.push({ path: 'id', message: 'The vocabulary needs a stable ID.' });
    if (!pack.title.trim()) issues.push({ path: 'title', message: 'The vocabulary needs a title.' });
    if (!pack.language.trim()) issues.push({ path: 'language', message: 'The vocabulary needs a language.' });

    const cardIds = new Set<string>();
    for (const [cardIndex, card] of pack.cards.entries()) {
        const base = `cards[${cardIndex}]`;
        if (!card.id.trim()) issues.push({ cardId: card.id, path: `${base}.id`, message: 'The word needs a stable ID.' });
        else if (cardIds.has(card.id)) issues.push({ cardId: card.id, path: `${base}.id`, message: 'Duplicate word ID.' });
        else cardIds.add(card.id);
        if (!card.word.trim()) issues.push({ cardId: card.id, path: `${base}.word`, message: 'The headword cannot be empty.' });
        if (card.language !== undefined && !card.language.trim()) issues.push({ cardId: card.id, path: `${base}.language`, message: 'A language override cannot be empty.' });
        if (!card.meanings.length) issues.push({ cardId: card.id, path: `${base}.meanings`, message: 'At least one meaning is required.' });
        const meaningIds = new Set<string>();
        for (const [meaningIndex, meaning] of card.meanings.entries()) {
            const meaningPath = `${base}.meanings[${meaningIndex}]`;
            if (!meaning.id.trim() || meaningIds.has(meaning.id)) {
                issues.push({ cardId: card.id, path: `${meaningPath}.id`, message: 'Each meaning needs a unique ID.' });
            } else meaningIds.add(meaning.id);
            if (!meaning.partOfSpeech.trim()) issues.push({ cardId: card.id, path: `${meaningPath}.partOfSpeech`, message: 'A meaning is missing its part of speech.' });
            if (!meaning.translation.trim()) issues.push({ cardId: card.id, path: `${meaningPath}.translation`, message: 'A meaning is missing its translation.' });
            if (!meaning.definition.trim()) issues.push({ cardId: card.id, path: `${meaningPath}.definition`, message: 'A meaning is missing its definition.' });
        }
        validateUniqueItemIds(issues, card.id, base, 'sentences', 'sentence', card.sentences);
        validateUniqueItemIds(issues, card.id, base, 'phrases', 'phrase', card.phrases);
        validateUniqueItemIds(issues, card.id, base, 'customSections', 'custom section', card.customSections);
    }
    return issues;
}

function validateUniqueItemIds(
    issues: HiWordsValidationIssue[],
    cardId: string,
    base: string,
    collection: string,
    label: string,
    items: Array<{ id: string }> | undefined
): void {
    const ids = new Set<string>();
    for (const [index, item] of (items || []).entries()) {
        const id = item.id.trim();
        if (!id || ids.has(id)) {
            issues.push({
                cardId,
                path: `${base}.${collection}[${index}].id`,
                message: `Each ${label} needs a unique ID.`,
            });
        } else {
            ids.add(id);
        }
    }
}

function isHiWordsMeaning(value: unknown): value is HiWordsMeaning {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string' &&
        typeof value.partOfSpeech === 'string' &&
        typeof value.translation === 'string' &&
        typeof value.definition === 'string';
}

function isLearningItemType(value: unknown): value is HiWordsCardType {
    return value === 'word' || value === 'phrase' || value === 'concept' || value === 'term';
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
}

function isOptionalStringArray(value: unknown): boolean {
    return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

function isOptionalStringRecord(value: unknown): boolean {
    return value === undefined || (isRecord(value) && Object.values(value).every(item => typeof item === 'string'));
}

function isOptionalRecordArray(value: unknown, predicate: (item: Record<string, unknown>) => boolean): boolean {
    return value === undefined || (Array.isArray(value) && value.every(item => isRecord(item) && predicate(item)));
}

function isOptionalMorphology(value: unknown): boolean {
    return value === undefined || (isRecord(value) &&
        value.breakdown === undefined && value.note === undefined && isOptionalString(value.explanation) &&
        isOptionalRecordArray(value.components, item => typeof item.type === 'string' && typeof item.form === 'string' && isOptionalString(item.meaning)));
}

function isOptionalDisplay(value: unknown): boolean {
    return value === undefined || (isRecord(value) &&
        (value.moduleOrder === undefined || (Array.isArray(value.moduleOrder) && value.moduleOrder.every(isHiWordsModuleId))));
}

function isHiWordsModuleId(value: unknown): value is HiWordsModuleId {
    return value === 'word' || value === 'meanings' || value === 'sentences' || value === 'derivedWords' ||
        value === 'morphology' || value === 'phrases' || value === 'usage' ||
        value === 'relations' || value === 'memory' || value === 'note' ||
        value === 'forms' || value === 'images' || value === 'custom';
}

function isOptionalUsage(value: unknown): boolean {
    return value === undefined || (isRecord(value) &&
        isOptionalStringArray(value.register) && isOptionalStringArray(value.patterns) &&
        isOptionalStringArray(value.notes) && isOptionalStringArray(value.commonMistakes));
}

function recordItems(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}

function deleteNullOptionalFields(record: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (record[field] === null) delete record[field];
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
