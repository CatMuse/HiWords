import { createEmptyConceptCard, createEmptyCustomCard, createEmptyPersonCard, createEmptyWordCard } from '../editor/hiwords-document';
import {
    CONCEPT_CARD_KIND,
    CUSTOM_CARD_KIND,
    HiWordsCard,
    HiWordsCardKind,
    HiWordsFieldDefinition,
    isConceptCard,
    isCustomCard,
    isPersonCard,
    isWordCard,
    PERSON_CARD_KIND,
    WORD_CARD_KIND,
} from '../schema/hiwords';
import type { CardDisplaySection } from '../utils/types';

export interface CardTypeCapabilities {
    pronounceable: boolean;
    studyable: boolean;
    aiGeneratable: boolean;
}

export interface CardDisplaySectionDefinition {
    id: CardDisplaySection;
    editorModule: string;
    label: string;
    previewByDefault?: boolean;
    isAvailable(card: HiWordsCard): boolean;
}

export interface CardEditorModuleDefinition {
    id: string;
    label: string;
    description: string;
}

export interface CardTypeDefinition {
    kind: HiWordsCardKind;
    label: string;
    pluralLabel: string;
    icon: string;
    defaultEditorModule: string;
    editorModules: CardEditorModuleDefinition[];
    displaySections: CardDisplaySectionDefinition[];
    capabilities: CardTypeCapabilities;
    createCard(): HiWordsCard;
    getSummary(card: HiWordsCard, fields?: HiWordsFieldDefinition[]): string;
    getSearchText(card: HiWordsCard): string[];
}

export class CardTypeRegistry {
    private readonly definitions = new Map<HiWordsCardKind, CardTypeDefinition>();

    register(definition: CardTypeDefinition): void {
        if (this.definitions.has(definition.kind)) throw new Error(`Card type “${definition.kind}” is already registered.`);
        this.definitions.set(definition.kind, definition);
    }

    get(kind: HiWordsCardKind): CardTypeDefinition {
        const definition = this.definitions.get(kind);
        if (!definition) throw new Error(`Card type “${kind}” is not registered.`);
        return definition;
    }

    list(): CardTypeDefinition[] { return [...this.definitions.values()]; }
}

export const cardTypeRegistry = new CardTypeRegistry();

export function getOrderedCardDisplaySections(
    kind: HiWordsCardKind,
    moduleOrder?: string[],
    fields: HiWordsFieldDefinition[] = []
): CardDisplaySectionDefinition[] {
    const sections = [...cardTypeRegistry.get(kind).displaySections];
    const dynamicSections = fields.map(field => dynamicFieldSection(field));
    const commonSectionIndex = sections.findIndex(section => section.id === 'note' || section.id === 'images' || section.id === 'custom');
    sections.splice(commonSectionIndex < 0 ? sections.length : commonSectionIndex, 0, ...dynamicSections);
    if (!moduleOrder?.length) return sections;
    const positions = new Map(moduleOrder.map((module, index) => [module, index]));
    return sections.sort((left, right) => {
        const leftPosition = positions.get(left.editorModule);
        const rightPosition = positions.get(right.editorModule);
        if (leftPosition === undefined && rightPosition === undefined) return 0;
        if (leftPosition === undefined) return 1;
        if (rightPosition === undefined) return -1;
        return leftPosition - rightPosition;
    });
}

cardTypeRegistry.register({
    kind: WORD_CARD_KIND,
    label: 'Word',
    pluralLabel: 'Words',
    icon: 'languages',
    defaultEditorModule: 'word',
    editorModules: [
        editorModule('word', 'Basic', 'Spelling, type and pronunciation'),
        editorModule('meanings', 'Definitions', 'Definitions and translations'),
        editorModule('sentences', 'Examples', 'Saved examples for this word'),
        editorModule('forms', 'Word forms', 'Plural, tense and comparative forms'),
        editorModule('derivedWords', 'Derived words', 'Related words built from this word'),
        editorModule('morphology', 'Morphology', 'Roots, affixes and word structure'),
        editorModule('phrases', 'Phrases', 'Phrases and common expressions'),
        editorModule('usage', 'Usage', 'Patterns, register and common mistakes'),
        editorModule('relations', 'Related words', 'Synonyms, antonyms and confusables'),
        editorModule('memory', 'Memory', 'Notes and memory cues'),
        editorModule('note', 'My note', 'Your personal note for this word'),
        editorModule('images', 'Images', 'Images stored in the vault'),
        editorModule('custom', 'Custom content', 'Extra text sections for this word'),
    ],
    displaySections: [
        section('definitions', 'meanings', 'Definitions', card => isWordCard(card, WORD_CARD_KIND) && card.data.meanings.some(item => item.translation.trim() || item.definition.trim()), true),
        section('examples', 'sentences', 'Examples', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.sentences?.some(item => item.text.trim()))),
        section('forms', 'forms', 'Word forms', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.forms?.some(item => item.form.trim()))),
        section('derivedWords', 'derivedWords', 'Derived words', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.derivedWords?.some(item => item.word.trim()))),
        section('morphology', 'morphology', 'Morphology', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.morphology && Object.values(card.data.morphology).some(hasValue))),
        section('phrases', 'phrases', 'Phrases', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.phrases?.some(item => item.text.trim()))),
        section('usage', 'usage', 'Usage', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.usage && Object.values(card.data.usage).some(hasValue))),
        section('relations', 'relations', 'Related words', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.relations?.some(item => item.target.trim()))),
        section('memory', 'memory', 'Memory', card => isWordCard(card, WORD_CARD_KIND) && Boolean(card.data.memory?.some(item => item.text.trim()))),
        commonSection('note', 'note', 'My note', card => Boolean(card.note?.text.trim())),
        commonSection('images', 'images', 'Images', card => Boolean(card.images?.some(item => item.path.trim()))),
        commonSection('custom', 'custom', 'Custom content', card => Boolean(card.customSections?.some(item => item.title.trim() || item.content.trim()))),
    ],
    capabilities: { pronounceable: true, studyable: true, aiGeneratable: true },
    createCard: createEmptyWordCard,
    getSummary: card => isWordCard(card, WORD_CARD_KIND) ? card.data.meanings[0]?.translation || card.data.meanings[0]?.definition || '' : '',
    getSearchText: card => isWordCard(card, WORD_CARD_KIND) ? card.data.meanings.flatMap(item => [item.partOfSpeech, item.translation, item.definition]) : [],
});

cardTypeRegistry.register({
    kind: CUSTOM_CARD_KIND,
    label: 'Custom',
    pluralLabel: 'Custom cards',
    icon: 'layout-template',
    defaultEditorModule: 'identity',
    editorModules: [
        editorModule('identity', 'Basic', 'Title, aliases and tags'),
        editorModule('note', 'My note', 'Personal notes'),
        editorModule('custom', 'Custom content', 'Extra text sections'),
    ],
    displaySections: [
        section('identity', 'identity', 'Basic', card => isCustomCard(card, CUSTOM_CARD_KIND), true),
        commonSection('note', 'note', 'My note', card => Boolean(card.note?.text.trim())),
        commonSection('custom', 'custom', 'Custom content', card => Boolean(card.customSections?.some(item => item.title.trim() || item.content.trim()))),
    ],
    capabilities: { pronounceable: false, studyable: true, aiGeneratable: false },
    createCard: createEmptyCustomCard,
    getSummary: (card, fields) => isCustomCard(card, CUSTOM_CARD_KIND) ? firstFieldValue(card, fields) : '',
    getSearchText: card => isCustomCard(card, CUSTOM_CARD_KIND) ? Object.values(card.fieldValues || {}).flatMap(value => {
        if (!Array.isArray(value)) return [String(value)];
        return value.flatMap(item => typeof item === 'string' ? [item] : [item.alt || '', item.caption || '']).filter(Boolean);
    }) : [],
});

cardTypeRegistry.register({
    kind: PERSON_CARD_KIND,
    label: 'Person',
    pluralLabel: 'People',
    icon: 'user-round',
    defaultEditorModule: 'identity',
    editorModules: [
        editorModule('identity', 'Basic', 'Name, aliases and identity'),
        editorModule('biography', 'Biography', 'Life summary'),
        editorModule('timeline', 'Timeline', 'Important life events'),
        editorModule('achievements', 'Achievements', 'Major contributions'),
        editorModule('works', 'Works', 'Notable works'),
        editorModule('personRelations', 'Related people', 'People and relationships'),
        editorModule('note', 'My note', 'Personal notes'),
        editorModule('images', 'Images', 'Images stored in the vault'),
        editorModule('custom', 'Custom content', 'Extra text sections'),
    ],
    displaySections: [
        section('identity', 'identity', 'Basic', card => isPersonCard(card, PERSON_CARD_KIND), true),
        section('biography', 'biography', 'Biography', card => isPersonCard(card, PERSON_CARD_KIND) && Boolean(card.data.summary.trim() || card.data.birthDate?.trim() || card.data.deathDate?.trim()), true),
        section('timeline', 'timeline', 'Timeline', card => isPersonCard(card, PERSON_CARD_KIND) && Boolean(card.data.timeline?.some(item => item.title.trim() || item.description?.trim()))),
        section('achievements', 'achievements', 'Achievements', card => isPersonCard(card, PERSON_CARD_KIND) && Boolean(card.data.achievements?.some(item => item.title.trim() || item.description?.trim())), true),
        section('works', 'works', 'Works', card => isPersonCard(card, PERSON_CARD_KIND) && Boolean(card.data.works?.some(item => item.title.trim() || item.description?.trim()))),
        section('personRelations', 'personRelations', 'Related people', card => isPersonCard(card, PERSON_CARD_KIND) && Boolean(card.data.relations?.some(item => item.target.trim()))),
        commonSection('note', 'note', 'My note', card => Boolean(card.note?.text.trim())),
        commonSection('images', 'images', 'Images', card => Boolean(card.images?.some(item => item.path.trim()))),
        commonSection('custom', 'custom', 'Custom content', card => Boolean(card.customSections?.some(item => item.title.trim() || item.content.trim()))),
    ],
    capabilities: { pronounceable: false, studyable: true, aiGeneratable: true },
    createCard: createEmptyPersonCard,
    getSummary: card => isPersonCard(card, PERSON_CARD_KIND) ? card.data.summary : '',
    getSearchText: card => isPersonCard(card, PERSON_CARD_KIND) ? [card.data.summary, ...(card.data.nationalities || []), ...(card.data.occupations || [])] : [],
});

cardTypeRegistry.register({
    kind: CONCEPT_CARD_KIND,
    label: 'Concept',
    pluralLabel: 'Concepts',
    icon: 'lightbulb',
    defaultEditorModule: 'identity',
    editorModules: [
        editorModule('identity', 'Basic', 'Name, aliases and domain'),
        editorModule('definition', 'Definition', 'Definition and explanation'),
        editorModule('principles', 'Principles', 'Core ideas and principles'),
        editorModule('examples', 'Examples', 'Concrete examples'),
        editorModule('misconceptions', 'Misconceptions', 'Common misunderstandings'),
        editorModule('prerequisites', 'Prerequisites', 'Concepts to learn first'),
        editorModule('relatedConcepts', 'Related concepts', 'Connected ideas'),
        editorModule('note', 'My note', 'Personal notes'),
        editorModule('images', 'Images', 'Images stored in the vault'),
        editorModule('custom', 'Custom content', 'Extra text sections'),
    ],
    displaySections: [
        section('identity', 'identity', 'Basic', card => isConceptCard(card, CONCEPT_CARD_KIND), true),
        section('definition', 'definition', 'Definition', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.definition.trim() || card.data.explanation?.trim()), true),
        section('principles', 'principles', 'Principles', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.principles?.some(item => item.trim()))),
        section('examples', 'examples', 'Examples', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.examples?.some(item => item.title?.trim() || item.content.trim()))),
        section('misconceptions', 'misconceptions', 'Misconceptions', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.misconceptions?.some(item => item.trim()))),
        section('prerequisites', 'prerequisites', 'Prerequisites', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.prerequisites?.some(item => item.target.trim()))),
        section('relatedConcepts', 'relatedConcepts', 'Related concepts', card => isConceptCard(card, CONCEPT_CARD_KIND) && Boolean(card.data.relatedConcepts?.some(item => item.target.trim()))),
        commonSection('note', 'note', 'My note', card => Boolean(card.note?.text.trim())),
        commonSection('images', 'images', 'Images', card => Boolean(card.images?.some(item => item.path.trim()))),
        commonSection('custom', 'custom', 'Custom content', card => Boolean(card.customSections?.some(item => item.title.trim() || item.content.trim()))),
    ],
    capabilities: { pronounceable: false, studyable: true, aiGeneratable: true },
    createCard: createEmptyConceptCard,
    getSummary: card => isConceptCard(card, CONCEPT_CARD_KIND) ? card.data.definition : '',
    getSearchText: card => isConceptCard(card, CONCEPT_CARD_KIND) ? [card.data.domain || '', card.data.definition, card.data.explanation || '', ...(card.data.principles || [])] : [],
});

assertRegistryConsistency();

function assertRegistryConsistency(): void {
    for (const definition of cardTypeRegistry.list()) {
        const moduleIds = new Set<string>();
        for (const module of definition.editorModules) {
            if (moduleIds.has(module.id)) throw new Error(`Duplicate editor module “${module.id}” for ${definition.kind}.`);
            moduleIds.add(module.id);
        }
        const sectionIds = new Set<CardDisplaySection>();
        for (const display of definition.displaySections) {
            if (sectionIds.has(display.id)) throw new Error(`Duplicate display section “${display.id}” for ${definition.kind}.`);
            sectionIds.add(display.id);
            const module = definition.editorModules.find(item => item.id === display.editorModule);
            if (!module) throw new Error(`Display section “${display.id}” has no editor module for ${definition.kind}.`);
            if (module.label !== display.label) {
                throw new Error(`Section “${display.id}” is labelled “${display.label}” but its editor module is labelled “${module.label}”.`);
            }
        }
    }
}

function section(
    id: CardDisplaySection,
    editorModule: string,
    label: string,
    isAvailable: (card: HiWordsCard) => boolean,
    previewByDefault = false
): CardDisplaySectionDefinition {
    return { id, editorModule, label, isAvailable, previewByDefault };
}

function editorModule(id: string, label: string, description: string): CardEditorModuleDefinition {
    return { id, label, description };
}

function commonSection(
    id: CardDisplaySection,
    editorModule: string,
    label: string,
    isAvailable: (card: HiWordsCard) => boolean
): CardDisplaySectionDefinition {
    return section(id, editorModule, label, isAvailable);
}

function hasValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value);
}

function dynamicFieldSection(field: HiWordsFieldDefinition): CardDisplaySectionDefinition {
    const id = `field:${field.id}` as const;
    return section(id, id, field.label, card => hasFieldValue(card.fieldValues?.[field.id]), Boolean(field.previewByDefault));
}

function hasFieldValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(item =>
        typeof item === 'string' ? Boolean(item.trim()) : Boolean(item && typeof item === 'object' && 'path' in item && String(item.path).trim())
    );
    if (typeof value === 'string') return Boolean(value.trim());
    return value !== undefined && value !== null;
}

function firstFieldValue(card: HiWordsCard, fields: HiWordsFieldDefinition[] = []): string {
    const orderedValues = [
        ...fields.map(field => ({ field, value: card.fieldValues?.[field.id] })),
        ...Object.entries(card.fieldValues || {})
            .filter(([id]) => !fields.some(field => field.id === id))
            .map(([id, value]) => ({ field: undefined, value, id })),
    ];
    for (const { field, value } of orderedValues) {
        if (field?.type === 'image') continue;
        if (!hasFieldValue(value)) continue;
        if (!Array.isArray(value)) return String(value);
        const items = value as Array<string | { path: string }>;
        if (items.every(item => typeof item === 'string')) return items.join(', ');
    }
    return '';
}
