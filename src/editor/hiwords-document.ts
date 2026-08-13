import {
    HIWORDS_SCHEMA,
    HIWORDS_SCHEMA_VERSION,
    HiWordsCard,
    HiWordsMeaning,
    HiWordsPack,
    isHiWordsPack,
    normalizeHiWordsPack,
    validateHiWordsPack,
} from '../schema/hiwords';
import type { LearningItemType } from '../utils';

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
        language: 'en',
        cards: [],
    };
}

export function createEmptyHiWordsCard(): HiWordsCard {
    const cardId = createStableId('word');
    return {
        id: cardId,
        word: '',
        type: 'word',
        meanings: [createEmptyMeaning(cardId)],
    };
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
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    const random = cryptoApi?.randomUUID?.() || `${Date.now().toString(36)}-${createShortId()}`;
    return `${prefix}-${random.toLowerCase()}`;
}

export function normalizeLearningItemType(value: string): LearningItemType {
    return value === 'phrase' || value === 'concept' || value === 'term' ? value : 'word';
}

export { validateHiWordsPack };

function createShortId(): string {
    return Math.random().toString(36).slice(2, 10);
}
