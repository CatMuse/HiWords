import {
    HIWORDS_SCHEMA,
    HIWORDS_SCHEMA_VERSION,
    CONCEPT_CARD_KIND,
    CUSTOM_CARD_KIND,
    HiWordsCard,
    HiWordsCardKind,
    HiWordsConceptCard,
    HiWordsCustomCard,
    HiWordsFieldDefinition,
    HiWordsMeaning,
    HiWordsPack,
    HiWordsPersonCard,
    HiWordsWordCard,
    PERSON_CARD_KIND,
    WORD_CARD_KIND,
    isHiWordsPack,
    normalizeHiWordsPack,
    validateHiWordsPack,
} from '../schema/hiwords';

export type HiWordsEditorDocument =
    | { kind: 'hiwords'; pack: HiWordsPack; original: string }
    | { kind: 'invalid'; message: string; original: string };

export function parseHiWordsEditorDocument(data: string): HiWordsEditorDocument {
    try {
        const parsed = normalizeHiWordsPack(JSON.parse(data) as unknown);
        if (!isHiWordsPack(parsed)) {
            return {
                kind: 'invalid',
                message: `Unsupported vocabulary format. HiWords requires schema “${HIWORDS_SCHEMA}” version ${HIWORDS_SCHEMA_VERSION}.`,
                original: data,
            };
        }
        return { kind: 'hiwords', pack: parsed, original: data };
    } catch (error) {
        return {
            kind: 'invalid',
            message: error instanceof Error ? error.message : 'Invalid JSON.',
            original: data,
        };
    }
}

export function createEmptyHiWordsPack(title: string): HiWordsPack {
    return {
        schema: HIWORDS_SCHEMA,
        schemaVersion: HIWORDS_SCHEMA_VERSION,
        id: createStableId('book'),
        title,
        cardKind: WORD_CARD_KIND,
        cardKindVersion: 1,
        cards: [],
    };
}

export function createEmptyHiWordsCard(kind: HiWordsCardKind = WORD_CARD_KIND): HiWordsCard {
    if (kind === PERSON_CARD_KIND) return createEmptyPersonCard();
    if (kind === CONCEPT_CARD_KIND) return createEmptyConceptCard();
    if (kind === CUSTOM_CARD_KIND) return createEmptyCustomCard();
    return createEmptyWordCard();
}

export function createDefaultFieldsForKind(kind: HiWordsCardKind): HiWordsFieldDefinition[] | undefined {
    if (kind !== CUSTOM_CARD_KIND) return undefined;
    return [{
        id: 'images',
        label: 'Images',
        type: 'image',
        searchable: false,
        previewByDefault: true,
        image: {
            multiple: true,
            displayMode: 'gallery',
            aspectRatio: '16:9',
            fit: 'cover',
        },
    }];
}

export function createEmptyWordCard(): HiWordsWordCard {
    const cardId = createStableId('card');
    return {
        id: cardId,
        title: '',
        data: {
            language: 'en',
            itemType: 'word',
            meanings: [createEmptyMeaning(cardId)],
        },
    };
}

export function createEmptyPersonCard(): HiWordsPersonCard {
    return { id: createStableId('card'), title: '', data: { summary: '' } };
}

export function createEmptyConceptCard(): HiWordsConceptCard {
    return { id: createStableId('card'), title: '', data: { definition: '' } };
}

export function createEmptyCustomCard(): HiWordsCustomCard {
    return { id: createStableId('card'), title: '', data: {}, fieldValues: {} };
}

export function createEmptyMeaning(cardId: string): HiWordsMeaning {
    return {
        id: `${cardId}-meaning-${createShortId()}`,
        partOfSpeech: 'noun',
        translation: '',
        definition: '',
    };
}

export function serializeHiWordsPack(pack: HiWordsPack): string {
    return `${JSON.stringify(pack, null, 2)}\n`;
}

export function createStableId(prefix: string): string {
    const cryptoApi = window.crypto;
    const random = cryptoApi?.randomUUID?.() || `${Date.now().toString(36)}-${createShortId()}`;
    return `${prefix}-${random.toLowerCase()}`;
}

export function normalizeLearningItemType(value: string): HiWordsWordCard['data']['itemType'] {
    return value === 'phrase' || value === 'term' ? value : 'word';
}

export { validateHiWordsPack };

function createShortId(): string {
    return Math.random().toString(36).slice(2, 10);
}
