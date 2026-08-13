export const HIWORDS_SCHEMA = 'hiwords' as const;
export const HIWORDS_SCHEMA_VERSION = 1 as const;
export type HiWordsCardType = 'word' | 'phrase' | 'concept' | 'term';

export type HiWordsModuleId =
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
    contentVersion?: string;
    metadata?: Record<string, unknown>;
    cards: HiWordsCard[];
}

export interface HiWordsPhonetics {
    us?: string;
    uk?: string;
}

export interface HiWordsAudio {
    us?: string;
    uk?: string;
    default?: string;
}

export interface HiWordsSentence {
    id: string;
    text: string;
    translation?: string;
    source?: string;
    createdAt?: string;
}

export interface HiWordsNote {
    text: string;
    updatedAt?: string;
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
    note?: string;
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
    breakdown?: string;
    components?: HiWordsMorphologyComponent[];
    note?: string;
}

export interface HiWordsPhrase {
    id: string;
    text: string;
    meaning?: string;
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
    source?: string;
}

export interface HiWordsImage {
    path: string;
    alt?: string;
    caption?: string;
    license?: string;
    source?: string;
}

export interface HiWordsCard {
    id: string;
    revision: number;
    word: string;
    type: HiWordsCardType;
    language: string;
    aliases?: string[];
    color?: string;
    phonetics?: HiWordsPhonetics;
    audio?: HiWordsAudio;
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

export function isHiWordsPack(value: unknown): value is HiWordsPack {
    if (!isRecord(value)) return false;
    return value.schema === HIWORDS_SCHEMA &&
        value.schemaVersion === HIWORDS_SCHEMA_VERSION &&
        value.customModules === undefined &&
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.language === 'string' &&
        Array.isArray(value.cards) &&
        value.cards.every(isHiWordsCard);
}

export function isHiWordsCard(value: unknown): value is HiWordsCard {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string' &&
        value.custom === undefined &&
        Number.isInteger(value.revision) &&
        typeof value.word === 'string' &&
        isLearningItemType(value.type) &&
        typeof value.language === 'string' &&
        isOptionalString(value.color) &&
        isOptionalStringArray(value.aliases) &&
        isOptionalStringRecord(value.phonetics) &&
        isOptionalStringRecord(value.audio) &&
        Array.isArray(value.meanings) &&
        value.meanings.every(isHiWordsMeaning) &&
        isOptionalRecordArray(value.sentences, item => typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.translation) && isOptionalString(item.source) && isOptionalString(item.createdAt)) &&
        (value.note === undefined || (isRecord(value.note) && typeof value.note.text === 'string' && isOptionalString(value.note.updatedAt))) &&
        isOptionalRecordArray(value.forms, item => typeof item.form === 'string' && typeof item.type === 'string' && isOptionalString(item.note)) &&
        isOptionalRecordArray(value.derivedWords, item => typeof item.word === 'string' && isOptionalString(item.partOfSpeech) && isOptionalString(item.meaning)) &&
        isOptionalMorphology(value.morphology) &&
        isOptionalRecordArray(value.phrases, item => typeof item.id === 'string' && typeof item.text === 'string' && isOptionalString(item.meaning) && isOptionalString(item.translation) && isOptionalString(item.sentence)) &&
        isOptionalUsage(value.usage) &&
        isOptionalRecordArray(value.relations, item => typeof item.type === 'string' && typeof item.target === 'string' && isOptionalString(item.note)) &&
        isOptionalRecordArray(value.memory, item => typeof item.type === 'string' && typeof item.text === 'string' && isOptionalString(item.source)) &&
        isOptionalRecordArray(value.images, item => typeof item.path === 'string' && isOptionalString(item.alt) && isOptionalString(item.caption) && isOptionalString(item.license) && isOptionalString(item.source)) &&
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
        if (!card.language.trim()) issues.push({ cardId: card.id, path: `${base}.language`, message: 'The word language cannot be empty.' });
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
        isOptionalString(value.breakdown) && isOptionalString(value.note) &&
        isOptionalRecordArray(value.components, item => typeof item.type === 'string' && typeof item.form === 'string' && isOptionalString(item.meaning)));
}

function isOptionalUsage(value: unknown): boolean {
    return value === undefined || (isRecord(value) &&
        isOptionalStringArray(value.register) && isOptionalStringArray(value.patterns) &&
        isOptionalStringArray(value.notes) && isOptionalStringArray(value.commonMistakes));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
