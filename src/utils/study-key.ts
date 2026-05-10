import type { LearningItemType } from './types';

export interface StudyKeyInput {
    word: string;
    language?: string;
    type?: LearningItemType;
}

export function normalizeStudyText(value: string): string {
    return value
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
        .toLocaleLowerCase();
}

export function normalizeStudyLanguage(language?: string): string {
    return (language || 'und').normalize('NFKC').trim().toLocaleLowerCase() || 'und';
}

export function inferLearningItemType(word: string, language?: string): LearningItemType {
    const normalized = normalizeStudyText(word);
    const normalizedLanguage = normalizeStudyLanguage(language);

    if (normalizedLanguage.startsWith('zh')) {
        return 'concept';
    }

    if (/[\s-]/.test(normalized)) {
        return 'phrase';
    }

    return 'word';
}

export function buildStudyKey(input: StudyKeyInput): string | undefined {
    const text = normalizeStudyText(input.word);
    if (!text) return undefined;

    const language = normalizeStudyLanguage(input.language);
    const type = input.type || inferLearningItemType(text, language);

    return `${language}:${type}:${text}`;
}
